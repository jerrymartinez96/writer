/**
 * useCoWriter — Orquestador del módulo Coescritor.
 *
 * Flujo integral (agente ejecutivo):
 * 1. El usuario dicta/escribe → DeepSeek resuelve la intención.
 * 2. DeepSeek puede llamar herramientas nativas:
 *    - leer_documento: obtiene el contenido REAL de cualquier documento (capítulo,
 *      sección del Master Doc, personaje) antes de proponer cambios.
 *    - aplicar_parche / aplicar_parches_resolucion: propone cambios quirúrgicos.
 *    - crear_capitulo: propone un nuevo capítulo.
 * 3. Clasificación de cambios:
 *    - QUIRÚRGICOS (patch único, no vacío, tamaño similar) → se aplican directo
 *      con validación automática (applyPatch) + snapshot + narración de confirmación.
 *    - GRANDES (multi-doc, borrados, reescrituras) → fase de aprobación con 3 opciones:
 *      1) Ver resumen de cambios  2) Aplicar todos  3) Revisar manualmente.
 * 4. VoiceGate decide cómo narrar la salida (tal cual o condensada).
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { useIAStudioContext } from '../../context/IAStudioContext';
import SessionManager from '../ia-studio/IAStudioSessionManager';
import { AIService } from '../../services/AIService';
import {
    buildSystemPrompt,
    buildContextFromSelections,
    cleanHtmlToPlainText,
    resolveTargetDoc,
    parseToolCallResponse,
} from '../ia-studio/IAStudioUtils';
import CoWriterLiveService from '../../services/coescritor/CoWriterLiveService';
import {
    VOICE_STRATEGY,
    DEFAULT_VOICE_THRESHOLD_WORDS,
} from '../../services/coescritor/CoWriterCatalog';
import {
    resolveIntent,
    shouldSummarizeOutput,
    summarizeForSpeech,
} from '../../services/coescritor/CoWriterBridge';
import { COWRITER_CATALOG } from '../../services/coescritor/CoWriterCatalog';
import { applyPatchesAtomically, classifyPatchRisk, buildOperationSummary } from '../../services/ai/OperationEngine';
import { planRequest } from '../../services/ai/RequestPlanner';

/**
 * Estados del Coescritor.
 * @typedef {'idle'|'processing'|'speaking'|'error'} CoWriterStatus
 */

/** Máximo de turnos de historial que se envían a DeepSeek (evita reventar el contexto). */
const MAX_HISTORY_TURNS = 12;

/** Máximo de iteraciones del tool-loop (leer_documento → proponer → finalizar). */
const TOOL_MAX_ITERATIONS = 4;

const generateSharedMessageId = () =>
    `msg_cw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const compactCowriterText = (text = '', maxChars = 480) =>
    String(text)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxChars);

const normalizeIntentText = (text = '') => String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isCharacterCreationRequest = (text = '') => {
    const normalized = normalizeIntentText(text);
    const explicitChapterRequest = /\b(crea|crear|nuevo|nueva|escribe|escribir)\b[^.!?\n]{0,40}\b(capitulo|escena|documento)\b/.test(normalized);
    if (explicitChapterRequest) return false;
    return /\b(personaje|ficha de personaje|protagonista|antagonista|villano|heroina|heroe)\b/.test(normalized)
        && /\b(crea|crear|agrega|agregar|anade|nuevo|nueva|inventa|disena|escribe|haz)\b/.test(normalized);
};

/**
 * Limpia una respuesta de DeepSeek de formato técnico y HTML.
 * @param {string} text
 * @returns {string}
 */
const cleanOutputText = (text = '') => {
    return String(text)
        .replace(/\[\[TIPO:[^\]]*\]\]/gi, '')
        .replace(/\[\[ÁMBITO:[^\]]*\]\]/gi, '')
        .replace(/\[\[DESTINO:[^\]]*\]\]/gi, '')
        .replace(/\[\[TÍTULO:[^\]]*\]\]/gi, '')
        .replace(/\[\[[^\]]*\]\]/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Convierte texto plano a HTML si el contenido no tiene etiquetas HTML.
 * @param {string} content
 * @returns {string}
 */
const ensureHtmlContent = (content = '') => {
    if (!content) return '<p></p>';
    if (/<(p|h[1-6]|div|li|ul|ol|br|span|blockquote)\b/i.test(content)) return content;
    return content
        .split(/\n\n+/)
        .map(block => {
            const trimmed = block.trim();
            if (!trimmed) return '';
            return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
        })
        .filter(Boolean)
        .join('\n');
};

/**
 * Clasifica los parches propuestos por DeepSeek.
 * Un cambio "grande" requiere aprobación del escritor cuando:
 * - Hay MULTIPLES parches (afecta varios documentos).
 * - Algún reemplazo está vacío (borrado de contenido).
 * - Algún reemplazo es mucho mayor que el original (reescritura extensa).
 *
 * @param {Array} patches Bloques de parche de parseToolCallResponse
 * @returns {{ requiresApproval: boolean, summary: string, reasons: string[] }}
 */
const classifyPatches = (patches) => ({
    ...classifyPatchRisk(patches),
    summary: buildOperationSummary(patches),
});

export const useCoWriter = () => {
    const {
        activeBook, activeChapter, activeWorldDoc, chapters, worldItems, characters, profile,
        openWorldDoc, openCharacterDoc, selectChapter, saveChapterContent, saveWorldDocContent,
        updateChapter, updateWorldItem, updateCharacter, createCharacter, createChapter, saveDocumentSnapshot,
        flushAllSaves,
    } = useData();
    const {
        activeSession,
        messages: sharedMessages,
        setMessages: setSharedMessages,
        setSessions,
    } = useIAStudioContext();

    const [status, setStatus] = useState(/** @type {CoWriterStatus} */ ('idle'));
    const [resolvedAction, setResolvedAction] = useState(null); // { actionId, label }
    const [resultText, setResultText] = useState('');
    const [lastSpokenText, setLastSpokenText] = useState('');
    const [error, setError] = useState(/** @type {string|null} */ (null));
    const [isVoiceNarrating, setIsVoiceNarrating] = useState(false);
    const [usedSummarize, setUsedSummarize] = useState(false);

    // ── Fase de aprobación de cambios grandes ──
    const [pendingChanges, setPendingChanges] = useState(null); // { patches, summary, reasons }
    const [isApplyingChanges, setIsApplyingChanges] = useState(false);

    // Configuración del Coescritor (persistida en localStorage).
    const [thresholdWords, setThresholdWords] = useState(
        () => Number(localStorage.getItem('coWriterThreshold') || DEFAULT_VOICE_THRESHOLD_WORDS)
    );

    const profileRef = useRef(profile);
    useEffect(() => { profileRef.current = profile; }, [profile]);

    const abortRef = useRef(null);

    /**
     * Historial conversacional del Coescritor.
     * Cada turno guarda { role, content } limpios para que DeepSeek recuerde
     * la conversación anterior (ej. "agrega los géneros... al Master Doc Información General").
     */
    const conversationHistoryRef = useRef([]);

    // Al cambiar de libro, reiniciar el historial conversacional para que el
    // modelo no mezcle referencias de obras anteriores.
    const activeBookId = activeBook?.id;
    useEffect(() => {
        const compactHistory = (sharedMessages || [])
            .filter(message => message.mode === 'cowriter')
            .slice(-MAX_HISTORY_TURNS * 2)
            .map(message => ({
                role: message.role,
                content: compactCowriterText(message.content, 700),
            }))
            .filter(message => message.content);
        conversationHistoryRef.current = compactHistory;
    }, [activeBookId, activeSession?.id, sharedMessages]);

    // Escuchar errores del servicio de voz.
    useEffect(() => {
        const onVoiceError = (err) => {
            setError(err?.message || 'Error del servicio de voz.');
            setStatus('error');
        };
        CoWriterLiveService.on('error', onVoiceError);
        return () => CoWriterLiveService.on('error', null);
    }, []);

    /**
     * Obtiene el contenido actual de un documento resuelto.
     * @param {{docType:string, docId:string, title:string}|null} resolved
     * @returns {string} Texto plano del documento
     */
    const getDocContent = useCallback((resolved) => {
        if (!resolved) return '';
        if (resolved.docType === 'worldItem') {
            const worldDoc = worldItems?.find(w => w.id === resolved.docId);
            const source = worldDoc || (
                activeWorldDoc && (
                    activeWorldDoc.id === resolved.docId || activeWorldDoc.title === resolved.title
                ) ? activeWorldDoc : null
            );
            return cleanHtmlToPlainText(source?.content || '');
        }
        if (resolved.docType === 'chapter') {
            return cleanHtmlToPlainText(chapters?.find(c => c.id === resolved.docId)?.content || '');
        }
        if (resolved.docType === 'character') {
            return cleanHtmlToPlainText(characters?.find(c => c.id === resolved.docId)?.description || '');
        }
        return '';
    }, [activeWorldDoc, worldItems, chapters, characters]);

    /**
     * Narra un texto de salida aplicando el VoiceGate (condensación si supera umbral).
     * @param {string} outputText
     * @param {object|null} catalogItem
     */
    const narrateOutput = useCallback(async (outputText, catalogItem) => {
        const cfg = profileRef.current?.aiConfig || {};
        const deepseekKey = cfg.deepseekApiKey || profileRef.current?.deepseekApiKey || localStorage.getItem('deepseekApiKey') || '';
        const model = cfg.defaultModel || 'deepseek-v4-flash';

        const outputClean = cleanOutputText(outputText);
        if (!outputClean) {
            setStatus('idle');
            return;
        }
        setResultText(outputClean);

        const voiceStrategy = catalogItem?.voiceStrategy || VOICE_STRATEGY.AUTO;
        const { shouldSummarize } = shouldSummarizeOutput(outputClean, catalogItem, {
            voiceStrategy,
            thresholdWords,
        });

        let toSpeak = outputClean;
        if (shouldSummarize) {
            setStatus('processing');
            try {
                toSpeak = await summarizeForSpeech(outputClean, deepseekKey, model, thresholdWords);
                setUsedSummarize(true);
            } catch {
                toSpeak = `La respuesta es muy extensa para narrarla completa. Revisa el resultado en pantalla.`;
            }
        }

        const cleanToSpeak = cleanOutputText(toSpeak);
        setLastSpokenText(cleanToSpeak);

        // ── Salida: SIEMPRE audio (voz de Gemini) si hay key ──
        const geminiKey = cfg.geminiApiKey;
        if (geminiKey) {
            try {
                const voiceModel = cfg.geminiLiveModel || 'gemini-3.1-flash-live-preview';
                const voice = cfg.narradorVoice || 'Puck';
                await CoWriterLiveService.connect(geminiKey, {
                    model: voiceModel,
                    voice,
                    systemInstruction:
                        'Eres la voz del Coescritor. Leyes en español latinoamericano, de forma clara, natural y breve. ' +
                        'Resumes el resultado de una tarea de escritura para que el autor lo entienda sin leer la pantalla.',
                });
                setStatus('speaking');
                setIsVoiceNarrating(true);
                CoWriterLiveService.sendText(cleanToSpeak, () => {
                    setIsVoiceNarrating(false);
                    setStatus('idle');
                });
            } catch {
                setIsVoiceNarrating(false);
                setStatus('idle');
            }
        } else {
            setStatus('idle');
        }
    }, [thresholdWords]);

    /**
     * Aplica los parches aprobados/quirúrgicos directamente sobre los documentos.
     * Usa el motor applyPatch tolerante + guarda con snapshot de seguridad.
     * @param {Array} patches Bloques de parche
     * @returns {Promise<{successCount:number, failedCount:number, failures:string[]}>}
     */
    const applyPatchesDirect = useCallback(async (patches) => {
        let successCount = 0;
        const failures = [];
        const editablePatches = [];

        for (const patch of patches) {
            // ── Creación de ficha individual de personaje ──
            if (patch.mode === 'new_character') {
                try {
                    await createCharacter({
                        name: patch.title,
                        role: patch.role || '',
                        description: ensureHtmlContent(patch.content || ''),
                        images: [],
                        parentId: null,
                        isCategory: false,
                    });
                    successCount++;
                } catch (createErr) {
                    failures.push(`Error al crear el personaje "${patch.title}": ${createErr?.message || 'desconocido'}`);
                }
                continue;
            }

            // ── Bloque de CREACIÓN de nuevo documento (crear_capitulo) ──
            if (patch.mode === 'new' || (patch.responseType === 'content' && !patch.original)) {
                try {
                    const newTitle = patch.title || 'Nuevo capítulo';
                    const newContent = ensureHtmlContent(patch.content || '');
                    await createChapter({ title: newTitle, content: newContent });
                    successCount++;
                } catch (createErr) {
                    failures.push(`Error al crear "${patch.title || 'capítulo'}": ${createErr?.message || 'desconocido'}`);
                }
                continue;
            }

            editablePatches.push(patch);
        }

        if (editablePatches.length > 0) {
            const result = await applyPatchesAtomically({
                patches: editablePatches,
                documents: { chapters, worldItems, characters },
                saveDocument: async (target, html) => {
                    if (target.docType === 'worldItem') {
                        if (target.docId === activeWorldDoc?.id || target.title === activeWorldDoc?.title) saveWorldDocContent(html, 'ia');
                        else updateWorldItem(target.docId, { content: html });
                    } else if (target.docType === 'chapter') {
                        if (target.docId === activeChapter?.id) saveChapterContent(html, 'ia');
                        else updateChapter(target.docId, { content: html });
                    } else if (target.docType === 'character') {
                        updateCharacter(target.docId, { description: html });
                    }
                },
                snapshot: (docId, html) => saveDocumentSnapshot(docId, html, 'ia'),
                flushSaves: flushAllSaves,
            });
            successCount += result.successCount;
            failures.push(...result.failures);
        }

        return { successCount, failedCount: failures.length, failures };
    }, [chapters, worldItems, characters, activeWorldDoc, activeChapter, saveWorldDocContent, saveChapterContent, updateWorldItem, updateCharacter, createCharacter, createChapter, updateChapter, saveDocumentSnapshot, flushAllSaves]);

    const persistSharedMessage = useCallback((message) => {
        if (!activeSession?.id) return;
        const normalized = { ...message, mode: 'cowriter', timestamp: message.timestamp || Date.now() };
        SessionManager.addMessage(activeSession.id, normalized);
        setSharedMessages(prev => [...prev, normalized]);
        setSessions(SessionManager.getSessions());
    }, [activeSession?.id, setSharedMessages, setSessions]);

    /**
     * Aplica los cambios pendientes aprobados por el escritor.
     */
    const approveChanges = useCallback(async () => {
        if (!pendingChanges) return;
        setIsApplyingChanges(true);
        setStatus('processing');
        try {
            const { successCount, failedCount } = await applyPatchesDirect(pendingChanges.patches);
            setPendingChanges(null);
            setIsApplyingChanges(false);

            let confirmation = '';
            if (failedCount === 0) {
                confirmation = `Listo. Apliqué ${successCount} cambio${successCount !== 1 ? 's' : ''}: ${pendingChanges.summary}.`;
            } else {
                confirmation = `Apliqué ${successCount} cambio${successCount !== 1 ? 's' : ''}, pero ${failedCount} no se pudieron aplicar. Revisa los detalles en pantalla.`;
            }
            setResultText(confirmation);
            persistSharedMessage({
                id: generateSharedMessageId(),
                role: 'assistant',
                content: compactCowriterText(confirmation),
                responseType: 'cowriter',
                cowriterResult: { status: failedCount === 0 ? 'approved' : 'partial' },
            });
            await narrateOutput(confirmation, null);
        } catch (err) {
            setError(err?.message || 'Error al aplicar los cambios.');
            setStatus('error');
            setIsApplyingChanges(false);
        }
    }, [pendingChanges, applyPatchesDirect, narrateOutput, persistSharedMessage]);

    /**
     * Rechaza/descarta los cambios pendientes.
     */
    const declineChanges = useCallback(async () => {
        const summary = pendingChanges?.summary || 'los cambios propuestos';
        setPendingChanges(null);
        setStatus('idle');
        const message = `Entendido. Descarté ${summary}. Nadie modificó tus documentos.`;
        setResultText(message);
        persistSharedMessage({
            id: generateSharedMessageId(),
            role: 'assistant',
            content: compactCowriterText(message),
            responseType: 'cowriter',
            cowriterResult: { status: 'declined' },
        });
        await narrateOutput(message, null);
    }, [pendingChanges, narrateOutput, persistSharedMessage]);

    /**
     * Abre los documentos afectados para revisión manual del escritor.
     */
    const openManualReview = useCallback(() => {
        if (!pendingChanges) return;
        const firstPatch = pendingChanges.patches[0];
        const resolved = firstPatch ? resolveTargetDoc(firstPatch.docId || firstPatch.title || '', chapters, worldItems, characters) : null;

        if (resolved?.docType === 'worldItem') {
            openWorldDoc(resolved.docId);
        } else if (resolved?.docType === 'character') {
            openCharacterDoc(resolved.docId);
        } else if (resolved?.docType === 'chapter') {
            const chap = chapters.find(c => c.id === resolved.docId);
            if (chap) selectChapter(chap);
        } else {
            if (activeWorldDoc) {
                if (activeWorldDoc.type === 'character') openCharacterDoc(activeWorldDoc.id);
                else openWorldDoc(activeWorldDoc.id);
            }
            else if (activeChapter) { const chap = chapters.find(c => c.id === activeChapter.id); if (chap) selectChapter(chap); }
        }

        const message = `Te abrí "${resolved?.title || 'el documento'}" para que revises el cambio manualmente.`;
        setPendingChanges(null);
        setResultText(message);
        narrateOutput(message, null);
    }, [pendingChanges, chapters, worldItems, characters, openWorldDoc, openCharacterDoc, selectChapter, activeWorldDoc, activeChapter, narrateOutput]);

    /**
     * Ejecuta el pipeline completo a partir de un texto del usuario.
     * @param {string} userText
     */
    const executeText = useCallback(async (userText) => {
        const trimmed = (userText || '').trim();
        if (!trimmed) return;
        const forceCharacterCreation = isCharacterCreationRequest(trimmed);

        const traceId = `cw_${Date.now().toString(36)}`;
        console.group(`[CoWriter ${traceId}] Ejecutando instrucción`);
        console.info('Texto:', trimmed);

        setError(null);
        setResultText('');
        setUsedSummarize(false);
        setLastSpokenText('');
        setPendingChanges(null);
        setStatus('processing');

        persistSharedMessage({
            id: generateSharedMessageId(),
            role: 'user',
            content: trimmed,
            responseType: 'cowriter-request',
        });

        const cfg = profileRef.current?.aiConfig || {};
        const deepseekKey = cfg.deepseekApiKey || profileRef.current?.deepseekApiKey || localStorage.getItem('deepseekApiKey') || '';
        const model = cfg.defaultModel || 'deepseek-v4-flash';

        if (!deepseekKey) {
            console.error('API key de DeepSeek ausente');
            console.groupEnd();
            setError('Configura tu API Key de DeepSeek en Ajustes para usar el Coescritor.');
            setStatus('error');
            return;
        }

        // ── Planificación estructurada de intención ──
        let catalogItem = null;
        let actionId = 'chat';
        let requestPlan = null;
        try {
            const bookContext = activeBook
                ? `Libro: ${activeBook.title || ''}${activeBook.description ? `\nSinopsis: ${activeBook.description}` : ''}`
                : '';
            const availableDocuments = [
                ...(worldItems || []).filter(d => d.title).map(d => ({ id: d.id, title: d.title })),
                ...(chapters || []).filter(d => !d.isVolume && d.title).map(d => ({ id: d.id, title: d.title })),
                ...(characters || []).filter(d => !d.isCategory && d.name).map(d => ({ id: d.id, title: d.name })),
            ];
            requestPlan = await planRequest({
                userText: trimmed,
                apiKey: deepseekKey,
                modelId: model,
                actions: COWRITER_CATALOG || [],
                bookContext,
                availableDocuments,
            });
            actionId = requestPlan.actionId || 'chat';
            catalogItem = COWRITER_CATALOG.find(item => item.id === actionId) || null;
            console.info('Acción resuelta:', {
                actionId,
                catalogItem: catalogItem?.id,
                source: 'planner',
                requestPlan,
            });
        } catch {
            try {
                const intent = resolveIntent(trimmed, null);
                actionId = intent.actionId;
                catalogItem = intent.catalogItem;
            } catch {
                actionId = 'chat';
                catalogItem = null;
            }
        }

        if (requestPlan?.requiresClarification && requestPlan.clarificationQuestion) {
            const clarification = `Necesito una aclaración antes de modificar documentos: ${requestPlan.clarificationQuestion}`;
            setResultText(clarification);
            persistSharedMessage({
                id: generateSharedMessageId(),
                role: 'assistant',
                content: clarification,
                responseType: 'clarification',
                operationPlan: requestPlan,
            });
            await narrateOutput(clarification, null);
            return;
        }

        setResolvedAction({
            actionId,
            label: catalogItem?.label || '💬 Chat',
        });

        // ── Contexto completo de la obra ──
        const activeChapterIds =
            activeChapter?.id && activeChapter?.isLoaded
                ? [activeChapter.id]
                : [];

        const allWorldItemIds = (worldItems || [])
            .filter(w => !w.isCategory && w.title && w.content)
            .map(w => w.id);

        const contextText = buildContextFromSelections(
            activeBook,
            chapters || [],
            activeChapterIds,
            (characters || []).filter(c => !c.isCategory),
            worldItems || [],
            allWorldItemIds,
            true, // comprimir documentos pesados (>50k chars) para no reventar tokens
            []
        );

        const baseSystemPrompt = buildSystemPrompt(
            'chat',
            contextText,
            null,
            activeChapter || activeWorldDoc,
            { useNativeTools: true }
        );

        const systemPrompt = `${baseSystemPrompt}

═══ AGENTE COESCRITOR — INSTRUCCIONES ADICIONALES ═══
Eres un agente ejecutivo que administra los documentos del escritor. Para cumplir una solicitud que modifica, cita o consulta un documento:

1. ANTES de modificar un documento, si el contexto compartido no contiene el fragmento exacto que necesitas (o está comprimido/truncado), usa la herramienta \`leer_documento\` con el título exacto del documento (ej. "Información General"). Te devolveré su contenido REAL y actualizado para que lo uses con precisión.

2. Para aplicar un cambio puntual en UN documento, usa \`aplicar_parche\`:
   • documento_id → título exacto del documento (ej. "Información General", "Personajes", "Capítulo 1")
   • texto_original → copia EXACTA y literal del texto que existe actualmente en el documento (después de leerlo con leer_documento)
   • texto_reemplazo → el nuevo texto (puede ser vacío SOLO si el escritor pidió eliminar)
   • contexto_linea → opcional, una frase circundante para precisión

3. Para cambios que afectan VARIOS documentos a la vez, usa \`aplicar_parches_resolucion\` con un parche por documento.

4. NUNCA inventes el texto_original: debe existir literalmente en el documento. Si no estás seguro del contenido exacto, llama primero a leer_documento.

5. Respeta exactamente la solicitud del escritor. No inventes títulos, sinopsis, nombres, escenas ni información adicional. Modifica únicamente el dato o sección solicitada.

6. Si el escritor pide crear o agregar un personaje, usa exclusivamente la herramienta \`crear_personaje\`. Cada personaje debe convertirse en una ficha individual con su nombre exacto; nunca escribas personajes en \`Personajes\` ni en \`system_personajes\`, porque esa sección ya no es un documento editable.

7. Una herramienta solo genera una propuesta. Nunca afirmes que un cambio fue aplicado o guardado; el sistema validará y ejecutará la propuesta después. Si lees varios documentos, espera a tener toda la evidencia antes de generar los parches.

Los documentos disponibles de esta obra están listados en la sección "Documentos y secciones disponibles" del prompt. Los títulos son los nombres EXACTOS que debes usar en documento_id.`;

        const plannedSystemPrompt = `${systemPrompt}

PLAN DE OPERACIÓN VALIDADO:
${JSON.stringify({
    intent: requestPlan?.intent || 'answer',
    operation: requestPlan?.operation || 'answer',
    scope: requestPlan?.scope || 'unknown',
    risk: requestPlan?.risk || 'low',
    requiresReading: requestPlan?.requiresReading ?? true,
    targetHints: requestPlan?.targetHints || [],
    affectedDocumentHints: requestPlan?.affectedDocumentHints || [],
})}
No afirmes que un cambio fue aplicado; solo genera una propuesta verificable.`;

        // ── Tool-loop: DeepSeek puede leer documentos antes de responder ──
        let workingMessages = [
            { role: 'system', content: plannedSystemPrompt },
            ...conversationHistoryRef.current.slice(-MAX_HISTORY_TURNS * 2),
            { role: 'user', content: trimmed },
        ];

        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        const signal = abortRef.current.signal;

        let assistantFinal = '';
        let proposedPatches = [];
        const readDocuments = new Set();

        try {
            for (let iter = 0; iter < TOOL_MAX_ITERATIONS; iter++) {
                let textAccum = '';
                const completedToolCalls = [];

                await AIService.generateStream(
                    workingMessages,
                    {
                        selectedAiModel: model,
                        deepseekApiKey: deepseekKey,
                        temperature: 0.6,
                        signal,
                        enableTools: true,
                        onToolCall: (name, argsText, isComplete, toolCallId) => {
                            if (isComplete) console.info('Tool call completado:', { name, toolCallId });
                                if (isComplete) {
                                    completedToolCalls.push({ name, argsText, toolCallId });
                                }
                        },
                    },
                    (chunk) => {
                        textAccum += chunk;
                        setResultText(cleanOutputText(textAccum));
                    },
                    () => {}
                );

                if (completedToolCalls.length === 0) {
                    console.info('Respuesta final sin herramientas:', textAccum);
                    assistantFinal = textAccum;
                    break;
                }

                // Procesar herramientas llamadas por DeepSeek
                const readCalls = completedToolCalls.filter(tc => tc.name === 'leer_documento');
                if (readCalls.length > 0) {
                    const toolMessages = [];
                    const assistantToolCalls = [];
                    const availableDocs = [
                        ...(worldItems || []).filter(w => w.title).map(w => ({ ...w, _label: w.title })),
                        ...(chapters || []).filter(c => !c.isVolume && c.title).map(c => ({ ...c, _label: c.title })),
                        ...(characters || []).filter(c => !c.isCategory && c.name).map(c => ({ ...c, _label: c.name })),
                    ];

                    for (const tc of readCalls) {
                        let args = {};
                        try { args = JSON.parse(tc.argsText || '{}'); } catch { /* el siguiente turno recibirá el error */ }
                        const requested = String(args?.documento_id || '').trim();
                        const readKey = requested.toLowerCase();
                        const toolId = tc.toolCallId || `tool_${iter}_${assistantToolCalls.length}`;
                        assistantToolCalls.push({
                            id: toolId,
                            type: 'function',
                            function: { name: tc.name, arguments: tc.argsText || '{}' },
                        });

                        if (readDocuments.has(readKey)) {
                            toolMessages.push({ role: 'tool', tool_call_id: toolId, content: `La lectura de "${requested}" ya fue realizada en este turno. Usa la información anterior y ejecuta la operación.` });
                            continue;
                        }
                        readDocuments.add(readKey);
                        const resolved = resolveTargetDoc(requested, chapters, worldItems, characters);
                        const content = getDocContent(resolved);
                        if (resolved) {
                            console.info('Documento leído correctamente:', { title: resolved.title, chars: content.length, empty: !content.trim() });
                            toolMessages.push({
                                role: 'tool',
                                tool_call_id: toolId,
                                content: `Contenido actual del documento "${resolved.title}":\n${content || '[DOCUMENTO EXISTENTE PERO VACÍO]'}\n\n` +
                                    `Continúa la solicitud original. Copia literalmente texto_original y genera el parche correspondiente.`,
                            });
                        } else {
                            toolMessages.push({
                                role: 'tool',
                                tool_call_id: toolId,
                                content: `El documento "${requested}" no existe. Documentos disponibles: ${availableDocs.map(d => d._label).join(', ') || 'ninguno'}.`,
                            });
                        }
                    }

                    workingMessages = [
                        ...workingMessages,
                        { role: 'assistant', content: textAccum || null, tool_calls: assistantToolCalls },
                        ...toolMessages,
                    ];
                    continue;
                }

                for (const tc of completedToolCalls) {
                    let args = {};
                    try { args = JSON.parse(tc.argsText || '{}'); } catch { /* args vacíos */ }

                    if (tc.name === 'leer_documento') {
                        console.info('Leyendo documento:', args?.documento_id);
                        const readKey = String(args?.documento_id || '').trim().toLowerCase();
                        if (readDocuments.has(readKey)) {
                            console.warn('Lectura repetida bloqueada:', args?.documento_id);
                            assistantFinal = `No pude continuar porque el modelo solicitó leer repetidamente "${args?.documento_id}".`;
                            continue;
                        }
                        readDocuments.add(readKey);
                        const resolved = resolveTargetDoc(args?.documento_id || '', chapters, worldItems, characters);
                        const content = getDocContent(resolved);

                        if (resolved) {
                            console.info('Documento leído correctamente:', { title: resolved.title, chars: content.length, empty: !content.trim() });
                            // Devolver el contenido leído al modelo para que continúe
                            workingMessages = [
                                ...workingMessages,
                                {
                                    role: 'assistant',
                                    content: textAccum || null,
                                    tool_calls: [{
                                        id: tc.toolCallId || `tool_${iter}`,
                                        type: 'function',
                                        function: { name: tc.name, arguments: tc.argsText || '{}' },
                                    }],
                                },
                                {
                                    role: 'tool',
                                    tool_call_id: tc.toolCallId || `tool_${iter}`,
                                    content: `Contenido actual del documento "${resolved.title}":\n${content || '[DOCUMENTO EXISTENTE PERO VACÍO]'}\n\n` +
                                        `Continúa la solicitud original. Si está vacío, usa aplicar_parche con texto_original como cadena vacía y texto_reemplazo con el contenido nuevo.`,
                                },
                            ];
                        } else {
                            console.warn('Documento no encontrado o vacío:', args?.documento_id);
                            const availableDocs = [
                                ...(worldItems || []).filter(w => w.title).map(w => w.title),
                                ...(chapters || []).filter(c => !c.isVolume && c.title).map(c => c.title),
                                ...(characters || []).filter(c => !c.isCategory && c.name).map(c => c.name),
                            ];
                            workingMessages = [
                                ...workingMessages,
                                {
                                    role: 'assistant',
                                    content: textAccum || null,
                                    tool_calls: [{
                                        id: tc.toolCallId || `tool_${iter}`,
                                        type: 'function',
                                        function: { name: tc.name, arguments: tc.argsText || '{}' },
                                    }],
                                },
                                {
                                    role: 'tool',
                                    tool_call_id: tc.toolCallId || `tool_${iter}`,
                                    content: `El documento "${args?.documento_id}" no existe. Documentos disponibles: ${availableDocs.join(', ') || 'ninguno'}. Pide el nombre exacto o continúa con la solicitud si puedes resolverlo.`,
                                },
                            ];
                        }
                    } else if (tc.name === 'aplicar_parche' || tc.name === 'aplicar_parches_resolucion' || tc.name === 'localizar_parche_exacto') {
                        const blocks = parseToolCallResponse(tc.name, tc.argsText, null, chapters, worldItems, characters);
                        proposedPatches.push(...blocks);
                        console.info('Parches propuestos:', blocks);
                        assistantFinal = textAccum || '';
                    } else if (tc.name === 'crear_capitulo' || tc.name === 'crear_personaje') {
                        // Algunos modelos eligen la herramienta genérica de capítulo
                        // aunque la solicitud diga personaje. En ese caso, el destino
                        // se determina por la intención del escritor, no por el tool call.
                        let toolName = tc.name;
                        let toolArgs = tc.argsText;
                        if (forceCharacterCreation && tc.name === 'crear_capitulo') {
                            try {
                                const chapterArgs = JSON.parse(tc.argsText || '{}');
                                toolName = 'crear_personaje';
                                toolArgs = JSON.stringify({
                                    nombre: chapterArgs.titulo,
                                    descripcion_html: chapterArgs.contenido_html,
                                    rol: chapterArgs.rol || '',
                                });
                            } catch { /* el parser tolerante usará los datos disponibles */ }
                        }
                        const blocks = parseToolCallResponse(toolName, toolArgs, null, chapters, worldItems, characters);
                        proposedPatches.push(...blocks);
                        assistantFinal = textAccum || '';
                    } else {
                        // Otras herramientas (sugerir_nombres, etc.): tratar como respuesta
                        assistantFinal = textAccum || tc.argsText || '';
                    }
                }

                if (proposedPatches.length > 0) break;
            }

            // ── Sin cambios propuestos: respuesta conversacional ──
            if (proposedPatches.length === 0) {
                if (!assistantFinal) {
                    setError('DeepSeek no devolvió contenido. Intenta de nuevo.');
                    setStatus('error');
                    return;
                }
                const compactReply = compactCowriterText(assistantFinal);
                conversationHistoryRef.current.push(
                    { role: 'user', content: compactCowriterText(trimmed, 700) },
                    { role: 'assistant', content: compactReply }
                );
                persistSharedMessage({
                    id: generateSharedMessageId(),
                    role: 'assistant',
                    content: compactReply || 'Respuesta recibida.',
                    responseType: 'cowriter',
                });
                await narrateOutput(assistantFinal, catalogItem);
                console.info('Proceso terminado como conversación.');
                return;
            }

            // ── Clasificar cambios propuestos ──
            const { requiresApproval, summary, reasons } = classifyPatches(proposedPatches);

            if (!requiresApproval) {
                // QUIRÚRGICO: aplicar directo con validación + snapshot
                setStatus('processing');
                const { successCount, failedCount, failures } = await applyPatchesDirect(proposedPatches);

                const compactSummary = compactCowriterText(summary);
                conversationHistoryRef.current.push(
                    { role: 'user', content: compactCowriterText(trimmed, 700) },
                    { role: 'assistant', content: compactSummary }
                );
                persistSharedMessage({
                    id: generateSharedMessageId(),
                    role: 'assistant',
                    content: compactSummary,
                    responseType: 'cowriter',
                    cowriterResult: { actionId, status: failedCount === 0 ? 'applied' : (successCount > 0 ? 'partial_failure' : 'failed') },
                });

                let confirmation = '';
                if (failedCount === 0) {
                    confirmation = `Listo. ${successCount === 1 ? 'Apliqué el cambio' : `Apliqué ${successCount} cambios`}: ${summary}.`;
                } else {
                    confirmation = `Se aplicaron ${successCount} cambios, pero ${failedCount} fallaron: ${failures.join(' ')}`;
                }
                setResultText(confirmation);
                await narrateOutput(confirmation, catalogItem);
                return;
            }

            // GRANDE: fase de aprobación con 3 opciones
            setPendingChanges({ patches: proposedPatches, summary, reasons });

            const compactApproval = compactCowriterText(`Propuesta de cambios (requiere aprobación): ${summary}`);
            conversationHistoryRef.current.push(
                { role: 'user', content: compactCowriterText(trimmed, 700) },
                { role: 'assistant', content: compactApproval }
            );
            persistSharedMessage({
                id: generateSharedMessageId(),
                role: 'assistant',
                content: compactApproval,
                responseType: 'cowriter',
                cowriterResult: { actionId, status: 'pending-approval' },
            });

            const approvalMsg = `El motor de IA generó cambios que debes autorizar: ${summary}. ` +
                `${reasons.length > 0 ? `Requiere tu visto bueno porque ${reasons.join(' y ')}. ` : ''}` +
                `En pantalla tienes 3 opciones: ver un resumen de los cambios, aplicarlos, o revisarlos manualmente.`;
            setResultText(approvalMsg);
            await narrateOutput(approvalMsg, null);
        } catch (err) {
            console.error(`[CoWriter ${traceId}] Error en ejecución:`, err);
            if (err?.name !== 'AbortError') {
                setError(err?.message || 'Error al ejecutar el comando.');
                setStatus('error');
            }
        } finally {
            console.groupEnd();
        }
    }, [activeBook, activeChapter, activeWorldDoc, chapters, worldItems, characters, getDocContent, applyPatchesDirect, narrateOutput, persistSharedMessage]);

    /**
     * Detiene narración y ejecución en curso.
     */
    const stopAll = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        CoWriterLiveService.stop();
        setIsVoiceNarrating(false);
        setPendingChanges(null);
        setStatus('idle');
    }, []);

    /**
     * Limpia la transcripción, el resultado y el historial de conversación.
     */
    const clearAll = useCallback(() => {
        conversationHistoryRef.current = [];
        setPendingChanges(null);
        setIsApplyingChanges(false);
        setResultText('');
        setLastSpokenText('');
        setResolvedAction(null);
        setError(null);
        setUsedSummarize(false);
        setStatus('idle');
    }, []);

    return {
        // Estado
        status,
        resolvedAction,
        resultText,
        lastSpokenText,
        error,
        isVoiceNarrating,
        usedSummarize,

        // Fase de aprobación de cambios
        pendingChanges,
        isApplyingChanges,
        approveChanges,
        declineChanges,
        openManualReview,

        // Config
        thresholdWords,
        setThresholdWords: (v) => {
            const num = Number(v) || DEFAULT_VOICE_THRESHOLD_WORDS;
            setThresholdWords(num);
            localStorage.setItem('coWriterThreshold', String(num));
        },

        // Acciones
        executeText,
        stopAll,
        clearAll,
        stopNarration: () => {
            CoWriterLiveService.stop();
            setIsVoiceNarrating(false);
            setStatus('idle');
        },
    };
};

export default useCoWriter;
