import AIService, { COHERENCE_AUDIT_SCHEMA } from '../AIService';
import { formatDraftText, toPlainText } from './plainText';
import { getConfiguredAIOptions } from './AIRequestOptions';
import { parseStructuredResponse, validateStructuredResponse } from './StructuredResponse';
import { buildRegisteredPrompt } from './PromptRegistry';

const COHERENCE_MIN_CONFIDENCE = 0.75;

const normalizeDocuments = (documents = []) => documents.map((document) => ({
    id: String(document.id || ''),
    type: String(document.type || 'document'),
    title: String(document.title || document.name || document.label || document.id || 'Documento'),
    version: String(document.version || ''),
    content: toPlainText(document.content || document.description || ''),
})).filter((document) => document.id && document.content);

const replaceDocumentIdsForDisplay = (value, documents) => {
    let result = String(value || '');
    documents.forEach((document) => {
        if (!document.id || !document.title || document.id === document.title) return;
        result = result.split(document.id).join(document.title);
    });
    return result;
};

const normalizeEvidence = (evidence, allowedIds) => {
    if (!evidence || typeof evidence !== 'object') return null;
    const documentId = String(evidence.documentId || '');
    const quote = String(evidence.quote || '').trim();
    if (!allowedIds.has(documentId) || !quote) return null;
    return { documentId, quote };
};

const COHERENCE_DETECT_TOOL = {
    type: 'function',
    function: {
        name: 'reportar_incoherencias_estructuradas',
        description: 'Reporta contradicciones objetivas con evidencia entre documentos. No propongas soluciones.',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string' },
                findings: { type: 'array', items: { type: 'object', properties: {
                    documentIds: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
                    category: { type: 'string' }, title: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high'] }, confidence: { type: 'number' }, claimA: { type: 'string' }, claimB: { type: 'string' }, evidenceA: { type: 'object', properties: { documentId: { type: 'string' }, quote: { type: 'string' } }, required: ['documentId', 'quote'] }, evidenceB: { type: 'object', properties: { documentId: { type: 'string' }, quote: { type: 'string' } }, required: ['documentId', 'quote'] }, explanation: { type: 'string' },
                }, required: ['documentIds', 'title', 'severity', 'confidence', 'claimA', 'claimB', 'evidenceA', 'evidenceB', 'explanation'] } },
            }, required: ['summary', 'findings'],
        },
    },
};

const COHERENCE_VALIDATE_TOOL = {
    type: 'function',
    function: {
        name: 'validar_incoherencia',
        description: 'Confirma o rechaza una contradicción objetiva con base en sus citas y documentos actuales.',
        parameters: { type: 'object', properties: { status: { type: 'string', enum: ['confirmed', 'rejected'] }, confidence: { type: 'number' }, reason: { type: 'string' } }, required: ['status', 'confidence', 'reason'] },
    },
};

const COHERENCE_OPTIONS_TOOL = {
    type: 'function',
    function: {
        name: 'proponer_soluciones_incoherencia',
        description: 'Propone exactamente tres alternativas de resolución para una contradicción confirmada. No aplica cambios.',
        parameters: { type: 'object', properties: { options: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, risk: { type: 'string', enum: ['low', 'medium', 'high'] }, impact: { type: 'string' }, preserves: { type: 'array', items: { type: 'string' } }, changes: { type: 'array', items: { type: 'string' } }, documentIds: { type: 'array', items: { type: 'string' } }, patchPlans: { type: 'array', items: { type: 'object' } } }, required: ['id', 'title', 'description', 'risk', 'impact', 'documentIds'] } } }, required: ['options'] },
    },
};

const COHERENCE_PATCHES_TOOL = {
    type: 'function',
    function: {
        name: 'preparar_parches_coherencia',
        description: 'Prepara parches exactos para una solución seleccionada. Nunca reemplaza un documento completo.',
        parameters: { type: 'object', properties: { patches: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'string' }, baseVersion: { type: 'string' }, originalText: { type: 'string' }, replacementText: { type: 'string' }, reason: { type: 'string' } }, required: ['documentId', 'originalText', 'replacementText', 'reason'] } } }, required: ['patches'] },
    },
};

const COHERENCE_CUSTOM_OPTION_TOOL = {
    type: 'function',
    function: {
        name: 'crear_version_alternativa_coherencia',
        description: 'Convierte la idea del usuario en una única solución alternativa estructurada. No aplica cambios.',
        parameters: { type: 'object', properties: { option: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, risk: { type: 'string', enum: ['low', 'medium', 'high'] }, impact: { type: 'string' }, preserves: { type: 'array', items: { type: 'string' } }, changes: { type: 'array', items: { type: 'string' } }, documentIds: { type: 'array', items: { type: 'string' } }, patchPlans: { type: 'array', items: { type: 'object' } } }, required: ['title', 'description', 'risk', 'impact', 'documentIds'] } }, required: ['option'] },
    },
};

const CHAPTER_STRUCTURE_ANALYSIS_TOOL = {
    type: 'function',
    function: {
        name: 'analizar_estructura_capitulos',
        description: 'Analiza el documento de Estructura completo y lo compara con el manuscrito. No modifica documentos.',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string' },
                chapters: { type: 'array', items: { type: 'object', properties: {
                    id: { type: 'string' }, title: { type: 'string' }, position: { type: 'number' }, summary: { type: 'string' }, purpose: { type: 'string' }, conflict: { type: 'string' }, characters: { type: 'array', items: { type: 'string' } }, status: { type: 'string', enum: ['written', 'pending', 'empty', 'uncertain'] },
                }, required: ['title', 'position', 'summary', 'purpose', 'conflict', 'characters', 'status'] } },
                matches: { type: 'array', items: { type: 'object', properties: { structureChapterId: { type: 'string' }, manuscriptChapterId: { type: 'string' }, confidence: { type: 'number' }, reason: { type: 'string' } }, required: ['structureChapterId', 'manuscriptChapterId', 'confidence', 'reason'] } },
                openThreads: { type: 'array', items: { type: 'string' } },
                recommendedNextChapterId: { type: 'string' },
                recommendation: { type: 'string' },
            },
            required: ['summary', 'chapters', 'matches', 'openThreads', 'recommendedNextChapterId', 'recommendation'],
        },
    },
};

const CHAPTER_DRAFT_TOOL = {
    type: 'function',
    function: {
        name: 'redactar_capitulo_desde_estructura',
        description: 'Redacta un capítulo completo a partir de una estructura aprobada. No devuelve un resumen ni modifica documentos.',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string' },
                replacement: { type: 'string', description: 'Texto completo del capítulo en texto plano, con párrafos separados por líneas en blanco.' },
                wordCount: { type: 'number' },
                usedScenes: { type: 'array', items: { type: 'number' } },
                risk: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['summary', 'replacement', 'wordCount', 'usedScenes', 'risk'],
        },
    },
};

const CHAPTER_FORMAT_TOOL = {
    type: 'function',
    function: {
        name: 'aplicar_formateo_lectura',
        description: 'Organiza un capítulo para lectura cómoda sin cambiar ninguna palabra, signo ni el orden del contenido.',
        parameters: {
            type: 'object',
            properties: {
                formattedText: { type: 'string', description: 'El mismo texto completo, con párrafos y diálogos separados por líneas en blanco.' },
            },
            required: ['formattedText'],
        },
    },
};

const TOOL_ROOM_PROPOSAL_TOOL = {
    type: 'function',
    function: {
        name: 'proponer_reemplazo_revisable',
        description: 'Devuelve una propuesta de texto plano sin aplicar cambios al documento.',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string' },
                replacement: { type: 'string' },
                risk: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['summary', 'replacement', 'risk'],
        },
    },
};

const TOOL_ROOM_INSIGHT_TOOL = {
    type: 'function',
    function: {
        name: 'reportar_insight_de_tool_room',
        description: 'Devuelve un análisis de solo lectura con resumen y elementos accionables.',
        parameters: { type: 'object', properties: { result: { type: 'string' }, summary: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['title', 'detail'] } } }, required: ['result', 'summary', 'items'] },
    },
};

export const createStructuredRequest = async ({ profile, prompt, schema, max_tokens = 7000 }) => {
    const apiKey = getToolRoomApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de usar esta Tool Room.');
    const requestOptions = {
        temperature: 0.1,
        responseMode: 'tool',
        tools: [schema],
        toolChoice: 'required',
        max_tokens,
    };
    try {
        const raw = await AIService.sendMessage(prompt, apiKey, getConfiguredAIOptions(profile, requestOptions));
        const parsed = parseStructuredResponse(raw, 'respuesta de Tool Room');
        return validateStructuredResponse(parsed, schema, 'respuesta de Tool Room');
    } catch (error) {
        const errorMessage = String(error?.message || '');
        const canRecover = errorMessage.includes('respuesta vacía') || errorMessage.includes('respuesta de Tool Room inválida') || errorMessage.includes('JSON válido');
        if (!canRecover) throw error;
        // El segundo intento conserva la configuración de razonamiento y solo
        // vuelve a exigir el contrato estructurado.
        const recoveryRaw = await AIService.sendMessage(`${prompt}\n\nDebes llamar obligatoriamente a la herramienta disponible. Devuelve todos sus argumentos como JSON válido y completo; no escribas texto fuera de la herramienta.`, apiKey, getConfiguredAIOptions(profile, {
            ...requestOptions,
            toolChoice: 'required',
            max_tokens: Math.max(6000, Math.min(max_tokens, 12000)),
        }));
        const parsed = parseStructuredResponse(recoveryRaw, 'respuesta de Tool Room');
        return validateStructuredResponse(parsed, schema, 'respuesta de Tool Room');
    }
};

const createNarrativeJsonRequest = async ({ profile, prompt, max_tokens = 7000 }) => {
    const apiKey = getToolRoomApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de usar esta Tool Room.');
    const requestOptions = getConfiguredAIOptions(profile, {
        temperature: 0.35,
        responseMode: 'json',
        max_tokens,
    });
    try {
        const raw = await AIService.sendMessage(prompt, apiKey, requestOptions);
        return parseStructuredResponse(raw, 'respuesta narrativa');
    } catch (error) {
        if (!String(error?.message || '').includes('respuesta vacía')) throw error;
        // Reintentamos con el mismo modo y configuración de razonamiento.
        const recoveryRaw = await AIService.sendMessage(`${prompt}\n\nDevuelve ahora únicamente el objeto JSON solicitado, sin razonamiento previo ni texto adicional.`, apiKey, {
            ...requestOptions,
            temperature: 0.15,
        });
        return parseStructuredResponse(recoveryRaw, 'respuesta narrativa');
    }
};

export const getToolRoomApiKey = (profile) => profile?.aiConfig?.deepseekApiKey || profile?.deepseekApiKey || window.localStorage.getItem('deepseekApiKey') || '';

export const getStructureSourceHash = ({ structureContent = '', chapters = [] }) => {
    const source = [
        toPlainText(structureContent),
        ...chapters.map((chapter) => `${chapter.id || ''}|${chapter.title || ''}|${toPlainText(chapter.content || '')}`),
    ].join('\u0001');
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `structure-${(hash >>> 0).toString(16)}`;
};

const normalizeStructureChapter = (chapter, index) => ({
    id: String(chapter?.id || `structure-chapter-${index + 1}`),
    title: String(chapter?.title || `Capítulo ${index + 1}`),
    position: Number(chapter?.position) || index + 1,
    summary: String(chapter?.summary || ''),
    purpose: String(chapter?.purpose || ''),
    conflict: String(chapter?.conflict || ''),
    characters: Array.isArray(chapter?.characters) ? chapter.characters.map(String) : [],
    status: ['written', 'pending', 'empty', 'uncertain'].includes(chapter?.status) ? chapter.status : 'pending',
});

const normalizeStructureMatch = (match) => ({
    structureChapterId: String(match?.structureChapterId || ''),
    manuscriptChapterId: String(match?.manuscriptChapterId || ''),
    confidence: Math.min(1, Math.max(0, Number(match?.confidence) || 0)),
    reason: String(match?.reason || ''),
});

export const requestChapterStructureAnalysis = async ({ profile, structureContent = '', chapters = [], lastChapter = null, worldContent = '', characters = [] }) => {
    const normalizedChapters = chapters.map((chapter) => ({
        id: String(chapter.id || ''),
        title: String(chapter.title || ''),
        content: toPlainText(chapter.content || ''),
    })).filter((chapter) => chapter.id);
    const prompt = buildRegisteredPrompt('chapterStructureAnalysis', {
        structureContent: toPlainText(structureContent),
        normalizedChapters,
        lastChapter: lastChapter ? { title: lastChapter.title, content: toPlainText(lastChapter.content || '') } : null,
        worldContent: toPlainText(worldContent),
        characters: characters.map((character) => ({ name: character.name, description: toPlainText(character.description || '') })),
    });
    const parsed = await createStructuredRequest({ profile, prompt, schema: CHAPTER_STRUCTURE_ANALYSIS_TOOL, max_tokens: 12000 });
    const structureChapters = Array.isArray(parsed.chapters) ? parsed.chapters.map(normalizeStructureChapter) : [];
    const validIds = new Set(structureChapters.map((chapter) => chapter.id));
    const validManuscriptIds = new Set(normalizedChapters.map((chapter) => chapter.id));
    const matches = Array.isArray(parsed.matches) ? parsed.matches.map(normalizeStructureMatch).filter((match) => validIds.has(match.structureChapterId) && validManuscriptIds.has(match.manuscriptChapterId)) : [];
    const matchedIds = new Set(matches.map((match) => match.structureChapterId));
    const pendingChapters = structureChapters.filter((chapter) => !matchedIds.has(chapter.id) || ['pending', 'empty', 'uncertain'].includes(chapter.status));
    const recommended = structureChapters.find((chapter) => chapter.id === String(parsed.recommendedNextChapterId || '')) || pendingChapters[0] || null;
    return {
        summary: String(parsed.summary || ''),
        chapters: structureChapters,
        matches,
        pendingChapters,
        openThreads: Array.isArray(parsed.openThreads) ? parsed.openThreads.map(String).filter(Boolean) : [],
        recommendedNextChapterId: recommended?.id || '',
        recommendation: String(parsed.recommendation || ''),
    };
};

export const requestChapterDraft = async ({ profile, title = '', plan = null, structure = '', sizeLabel = '', contextContent = '', lastChapter = null }) => {
    const prompt = buildRegisteredPrompt('chapterDraft', {
        title,
        plan,
        structure: toPlainText(structure),
        sizeLabel,
        lastChapter: lastChapter ? { title: lastChapter.title, content: toPlainText(lastChapter.content || '') } : null,
        contextContent: toPlainText(contextContent),
    });
    const parsed = await createStructuredRequest({ profile, prompt, schema: CHAPTER_DRAFT_TOOL, max_tokens: 14000 });
    const replacement = formatDraftText(parsed.replacement || '');
    if (!replacement) throw new Error('La IA no devolvió un capítulo completo.');
    const ending = replacement.slice(-240).trim();
    if (/(?:\[\.\.\.\]|\[…\]|\b(?:continuará|fin del fragmento)\b)\s*$/i.test(ending)
        || /(?:\.\.\.|…)\s*$/.test(ending)) {
        throw new Error('La IA devolvió un capítulo truncado. Regenera la propuesta.');
    }
    const wordCount = replacement.split(/\s+/).filter(Boolean).length;
    const sizeMatch = String(sizeLabel).match(/(\d[\d,]*)\s*[–-]\s*(\d[\d,]*)/);
    if (sizeMatch) {
        const minimum = Number(sizeMatch[1].replace(/,/g, ''));
        const maximum = Number(sizeMatch[2].replace(/,/g, ''));
        if (wordCount < minimum * 0.55) throw new Error(`La propuesta es demasiado corta: ${wordCount.toLocaleString()} de ${minimum.toLocaleString()} palabras mínimas esperadas.`);
        if (wordCount > maximum * 1.25) throw new Error(`La propuesta supera el tamaño elegido: ${wordCount.toLocaleString()} de ${maximum.toLocaleString()} palabras máximas orientativas.`);
    }
    return {
        summary: String(parsed.summary || 'Capítulo generado desde la estructura aprobada.'),
        replacement,
        wordCount: Number(parsed.wordCount) || wordCount,
        usedScenes: Array.isArray(parsed.usedScenes) ? parsed.usedScenes.map(Number).filter(Number.isFinite) : [],
        risk: ['low', 'medium', 'high'].includes(parsed.risk) ? parsed.risk : 'medium',
    };
};

export const requestChapterFormatting = async ({ profile, text = '' }) => {
    const original = toPlainText(text);
    if (!original) throw new Error('No hay texto para formatear.');
    const prompt = buildRegisteredPrompt('chapterFormatting', { original });
    const parsed = await createStructuredRequest({ profile, prompt, schema: CHAPTER_FORMAT_TOOL, max_tokens: 14000 });
    const formattedText = formatDraftText(parsed.formattedText || '');
    const normalize = (value) => toPlainText(value).replace(/\s+/g, ' ').trim();
    if (!formattedText || normalize(formattedText) !== normalize(original)) {
        throw new Error('El formateador alteró el contenido. Se conserva el texto original.');
    }
    return formattedText;
};

const normalizeDirection = (direction, index) => ({
    id: String(direction?.id || `direction-${index + 1}`),
    title: String(direction?.title || `Dirección ${index + 1}`),
    premise: String(direction?.premise || direction?.summary || ''),
    purpose: String(direction?.purpose || ''),
    conflict: String(direction?.conflict || ''),
    revelations: Array.isArray(direction?.revelations) ? direction.revelations.map(String) : [],
    consequences: Array.isArray(direction?.consequences) ? direction.consequences.map(String) : [],
    risk: String(direction?.risk || ''),
    toneFit: String(direction?.toneFit || ''),
});

export const requestChapterDirections = async ({ profile, idea = '', chapterPlan = null, lastChapter = null, openThreads = [], contextContent = '' }) => {
    const prompt = buildRegisteredPrompt('chapterDirections', {
        idea,
        chapterPlan,
        lastChapter: lastChapter ? { title: lastChapter.title, content: toPlainText(lastChapter.content || '') } : null,
        openThreads,
        contextContent: toPlainText(contextContent),
    });
    const parsed = await createNarrativeJsonRequest({ profile, prompt, max_tokens: 6500 });
    return { directions: Array.isArray(parsed.directions) ? parsed.directions.slice(0, 3).map(normalizeDirection) : [] };
};

const normalizeScene = (scene, index) => ({
    id: String(scene?.id || `scene-${index + 1}`),
    number: Number(scene?.number) || index + 1,
    title: String(scene?.title || `Escena ${index + 1}`),
    objective: String(scene?.objective || ''),
    setting: String(scene?.setting || ''),
    characters: Array.isArray(scene?.characters) ? scene.characters.map(String) : [],
    conflict: String(scene?.conflict || ''),
    action: String(scene?.action || ''),
    revelation: String(scene?.revelation || ''),
    emotionalChange: String(scene?.emotionalChange || ''),
    transition: String(scene?.transition || ''),
    estimatedWords: Number(scene?.estimatedWords) || 0,
});

export const requestChapterScene = async ({ profile, chapterPlan = null, direction = null, scenes = [], size = 'standard', lastChapter = null, contextContent = '', instruction = '' }) => {
    const nextNumber = scenes.length + 1;
    const prompt = buildRegisteredPrompt('chapterScene', {
        nextNumber,
        size,
        chapterPlan,
        direction,
        scenes,
        lastChapter: lastChapter ? { title: lastChapter.title, content: toPlainText(lastChapter.content || '') } : null,
        contextContent: toPlainText(contextContent),
        instruction,
    });
    const parsed = await createNarrativeJsonRequest({ profile, prompt, max_tokens: 4500 });
    if (!parsed.scene) throw new Error('La IA no devolvió una escena válida.');
    return normalizeScene(parsed.scene, nextNumber - 1);
};

const normalizeConsistencyFinding = (finding, index, allowedIds) => {
    const documentIds = Array.isArray(finding?.documentIds) ? finding.documentIds.map(String).filter((id) => allowedIds.has(id)) : [];
    const documentId = String(finding?.documentId || documentIds[0] || '');
    if (!allowedIds.has(documentId)) return null;
    return {
        id: String(finding?.id || `consistency-${Date.now()}-${index}`),
        documentId,
        documentIds: documentIds.length ? documentIds : [documentId],
        title: String(finding?.title || 'Detalle para revisar'),
        excerpt: String(finding?.excerpt || finding?.context || ''),
        originalText: String(finding?.originalText || ''),
        replacementText: String(finding?.replacementText || ''),
        replacementEdited: false,
        reason: String(finding?.reason || ''),
        severity: ['low', 'medium', 'high'].includes(finding?.severity) ? finding.severity : 'medium',
        confidence: Math.min(1, Math.max(0, Number(finding?.confidence) || 0)),
        category: String(finding?.category || 'detail'),
        status: 'pending',
    };
};

const CONSISTENCY_AUDIT_TOOL = {
    type: 'function',
    function: {
        name: 'reportar_hallazgos_de_auditoria',
        description: 'Reporta inconsistencias verificables, sin modificar documentos.',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string' },
                findings: { type: 'array', items: { type: 'object', properties: {
                    id: { type: 'string' }, documentId: { type: 'string' }, documentIds: { type: 'array', items: { type: 'string' } }, category: { type: 'string' }, title: { type: 'string' }, excerpt: { type: 'string' }, originalText: { type: 'string' }, replacementText: { type: 'string' }, reason: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high'] }, confidence: { type: 'number' }, evidence: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'string' }, quote: { type: 'string' } }, required: ['documentId', 'quote'] } },
                }, required: ['title', 'category', 'reason', 'severity', 'confidence'] } },
            },
            required: ['summary', 'findings'],
        },
    },
};

export const requestGlobalConsistencyAnalysis = async ({ profile, auditType = 'custom', query = '', canonical = '', documents = [], instruction = '' }) => {
    const normalizedDocuments = documents.map((document) => ({
        id: String(document.id || ''),
        type: String(document.type || 'document'),
        title: String(document.title || document.name || document.id || 'Documento'),
        content: toPlainText(document.content || document.description || ''),
    })).filter((document) => document.id && document.content);
    if (!normalizedDocuments.length) return { summary: 'No hay documentos con contenido suficiente para analizar.', findings: [] };
    const allowedIds = new Set(normalizedDocuments.map((document) => document.id));
    const prompt = buildRegisteredPrompt('consistencyAudit', { auditType, query, canonical, instruction, normalizedDocuments });
    const parsed = await createStructuredRequest({ profile, prompt, schema: CONSISTENCY_AUDIT_TOOL, max_tokens: 9000 });
    const findings = Array.isArray(parsed.findings) ? parsed.findings.map((finding, index) => normalizeConsistencyFinding(finding, index, allowedIds)).filter(Boolean).filter((finding) => finding.originalText || !finding.replacementText) : [];
    return { summary: String(parsed.summary || ''), findings };
};

export const requestCoherenceAnalysis = async ({ profile, documents = [] }) => {
    const normalizedDocuments = normalizeDocuments(documents);
    if (normalizedDocuments.length < 2) return { summary: 'Se necesitan al menos dos documentos con contenido.', items: [] };
    const allowedIds = new Set(normalizedDocuments.map((document) => document.id));
    const prompt = buildRegisteredPrompt('coherenceAnalysis', { normalizedDocuments });
    const parsed = await createStructuredRequest({ profile, prompt, schema: COHERENCE_DETECT_TOOL, max_tokens: 9000 });
    const items = (Array.isArray(parsed.findings) ? parsed.findings : []).map((item) => {
        const documentIds = Array.isArray(item?.documentIds) ? item.documentIds.map(String).slice(0, 2) : [];
        return {
            id: `finding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            documentIds,
            category: String(item.category || 'fact'),
            title: replaceDocumentIdsForDisplay(item.title || 'Contradicción detectada', normalizedDocuments),
            severity: ['low', 'medium', 'high'].includes(item.severity) ? item.severity : 'medium',
            confidence: Number(item.confidence),
            claimA: replaceDocumentIdsForDisplay(item.claimA || '', normalizedDocuments),
            claimB: replaceDocumentIdsForDisplay(item.claimB || '', normalizedDocuments),
            evidenceA: normalizeEvidence(item.evidenceA, allowedIds),
            evidenceB: normalizeEvidence(item.evidenceB, allowedIds),
            explanation: replaceDocumentIdsForDisplay(item.explanation || '', normalizedDocuments),
            status: 'detected',
        };
    }).filter((item) => item.documentIds.length === 2
        && item.documentIds[0] !== item.documentIds[1]
        && item.documentIds.every((id) => allowedIds.has(id))
        && item.confidence >= COHERENCE_MIN_CONFIDENCE
        && item.claimA && item.claimB && item.explanation && item.evidenceA && item.evidenceB);
    return { summary: replaceDocumentIdsForDisplay(parsed.summary || '', normalizedDocuments), items };
};

export const validateCoherenceFinding = async ({ profile, finding, documents = [] }) => {
    const affectedDocuments = normalizeDocuments(documents).filter((document) => finding.documentIds.includes(document.id));
    const prompt = buildRegisteredPrompt('coherenceValidation', { finding, affectedDocuments });
    const parsed = await createStructuredRequest({ profile, prompt, schema: COHERENCE_VALIDATE_TOOL, max_tokens: 1800 });
    const status = parsed.status === 'confirmed' && Number(parsed.confidence) >= COHERENCE_MIN_CONFIDENCE ? 'confirmed' : 'rejected';
    return { ...finding, status, validationConfidence: Number(parsed.confidence) || 0, validationReason: String(parsed.reason || '') };
};

export const requestCoherenceResolutionOptions = async ({ profile, finding, documents = [], force = false }) => {
    const affectedDocuments = normalizeDocuments(documents).filter((document) => finding.documentIds.includes(document.id));
    if (finding.status !== 'confirmed' && !force) throw new Error('Solo se pueden generar soluciones para una inconsistencia confirmada.');
    const prompt = buildRegisteredPrompt('coherenceOptions', { finding, affectedDocuments });
    const parsed = await createStructuredRequest({ profile, prompt, schema: COHERENCE_OPTIONS_TOOL, max_tokens: 5000 });
    const options = Array.isArray(parsed.options) ? parsed.options.slice(0, 3).map((option, index) => ({
        id: String(option.id || `option-${index + 1}`),
        title: String(option.title || `Opción ${index + 1}`),
        description: String(option.description || ''),
        risk: ['low', 'medium', 'high'].includes(option.risk) ? option.risk : 'medium',
        impact: String(option.impact || ''),
        preserves: Array.isArray(option.preserves) ? option.preserves.map(String) : [],
        changes: Array.isArray(option.changes) ? option.changes.map(String) : [],
        documentIds: Array.isArray(option.documentIds) ? option.documentIds.map(String).filter((id) => finding.documentIds.includes(id)) : finding.documentIds,
        patchPlans: Array.isArray(option.patchPlans) ? option.patchPlans : [],
    })) : [];
    if (options.length !== 3) throw new Error('La IA no devolvió exactamente tres opciones de resolución.');
    return options;
};

export const requestCoherenceCustomResolution = async ({ profile, finding, documents = [], instruction }) => {
    const affectedDocuments = normalizeDocuments(documents).filter((document) => finding.documentIds.includes(document.id));
    if (!String(instruction || '').trim()) throw new Error('Describe la solución alternativa que quieres trabajar.');
    const prompt = buildRegisteredPrompt('coherenceCustomResolution', { instruction, finding, affectedDocuments });
    const parsed = await createStructuredRequest({ profile, prompt, schema: COHERENCE_CUSTOM_OPTION_TOOL, max_tokens: 3500 });
    const option = parsed.option || parsed.options?.[0];
    if (!option) throw new Error('La IA no devolvió una versión alternativa válida.');
    return {
        id: String(option.id || `custom-${Date.now()}`),
        title: String(option.title || 'Versión alternativa del usuario'),
        description: String(option.description || ''),
        risk: ['low', 'medium', 'high'].includes(option.risk) ? option.risk : 'medium',
        impact: String(option.impact || ''),
        preserves: Array.isArray(option.preserves) ? option.preserves.map(String) : [],
        changes: Array.isArray(option.changes) ? option.changes.map(String) : [],
        documentIds: Array.isArray(option.documentIds) ? option.documentIds.map(String).filter((id) => finding.documentIds.includes(id)) : finding.documentIds,
        patchPlans: Array.isArray(option.patchPlans) ? option.patchPlans : [],
        custom: true,
    };
};

export const buildCoherencePatches = async ({ profile, finding, option, documents = [] }) => {
    const affectedDocuments = normalizeDocuments(documents).filter((document) => option.documentIds.includes(document.id));
    const prompt = buildRegisteredPrompt('coherencePatches', { finding, option, affectedDocuments });
    const parsed = await createStructuredRequest({ profile, prompt, schema: COHERENCE_PATCHES_TOOL, max_tokens: 5000 });
    const allowedIds = new Set(option.documentIds);
    const patches = Array.isArray(parsed.patches) ? parsed.patches.map((patch) => ({
        documentId: String(patch.documentId || ''),
        baseVersion: String(patch.baseVersion || ''),
        originalText: String(patch.originalText || ''),
        replacementText: String(patch.replacementText || ''),
        reason: String(patch.reason || ''),
    })).filter((patch) => allowedIds.has(patch.documentId) && patch.originalText && patch.replacementText) : [];
    if (!patches.length) throw new Error('La IA no generó parches exactos aplicables.');
    return patches;
};

export const requestToolRoomProposal = async ({ profile, instruction, sourceContent, contextContent = '', roomName }) => {
    const prompt = buildRegisteredPrompt('toolRoomProposal', { roomName, instruction, sourceContent: toPlainText(sourceContent), contextContent: toPlainText(contextContent) });
    let result;
    try {
        result = await createStructuredRequest({ profile, prompt, schema: TOOL_ROOM_PROPOSAL_TOOL, max_tokens: 5000, });
    } catch (error) {
        if (String(error?.message || '').includes('replacement')) throw new Error('La propuesta no contiene un replacement válido.');
        throw error;
    }
    if (!result.replacement || typeof result.replacement !== 'string') throw new Error('La propuesta no contiene un replacement válido.');
    return {
        summary: String(result.summary || 'Propuesta generada por la IA.'),
        replacement: toPlainText(result.replacement),
        risk: ['low', 'medium', 'high'].includes(result.risk) ? result.risk : 'medium',
    };
};

export const requestToolRoomInsight = async ({ profile, instruction, sourceContent, contextContent = '', roomName, documentIds = [] }) => {
    const apiKey = getToolRoomApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de usar esta Tool Room.');
    const allowedIds = new Set(documentIds.map(String));
    const prompt = buildRegisteredPrompt('toolRoomInsight', { roomName, instruction, sourceContent: toPlainText(sourceContent), contextContent: toPlainText(contextContent), documentIds: [...allowedIds] });
    const raw = await AIService.sendMessage(prompt, apiKey, getConfiguredAIOptions(profile, {
        temperature: 0.15,
        responseMode: 'tool',
        tools: [COHERENCE_AUDIT_SCHEMA],
        toolChoice: 'required',
        max_tokens: 8000,
    }));
    const parsed = parseStructuredResponse(raw, 'auditoría de Tool Room');
    const candidates = Array.isArray(parsed.findings) ? parsed.findings : (Array.isArray(parsed.items) ? parsed.items : []);
    let rejected = 0;
    const items = candidates.map((item) => {
        const documentAId = String(item?.documentAId || item?.documentIds?.[0] || '');
        const documentBId = String(item?.documentBId || item?.documentIds?.[1] || '');
        return { ...item, documentAId, documentBId, documentIds: [documentAId, documentBId] };
    }).filter((item) => {
        const valid = item.documentAId && item.documentBId && item.documentAId !== item.documentBId
            && allowedIds.has(item.documentAId) && allowedIds.has(item.documentBId)
            && Number(item.confidence) >= 0.75
            && item.claimA && item.claimB && item.evidenceA && item.evidenceB && item.whyContradictory;
        if (!valid) rejected += 1;
        return valid;
    }).map((item) => ({
        ...item,
        title: String(item.title || 'Contradicción detectada'),
        detail: `${item.whyContradictory}\n\nDocumento A: ${item.evidenceA}\nDocumento B: ${item.evidenceB}`,
        suggestedAction: String(item.suggestedAction || 'Revisar los documentos afectados.'),
        confidence: Number(item.confidence),
        documentIds: [item.documentAId, item.documentBId],
    }));
    console.info('[CoherenceAudit] Resultado:', { candidateCount: candidates.length, acceptedCount: items.length, rejectedCount: rejected, allowedDocumentCount: allowedIds.size });
    return { summary: String(parsed.summary || ''), items };
};

export const requestNarrativeInsight = async ({ profile, instruction, sourceContent, contextContent = '', roomName }) => {
    const prompt = buildRegisteredPrompt('narrativeInsight', { roomName, instruction, sourceContent: toPlainText(sourceContent), contextContent: toPlainText(contextContent) });
    const parsed = await createStructuredRequest({ profile, prompt, schema: TOOL_ROOM_INSIGHT_TOOL, max_tokens: 5000 });
    return { result: String(parsed.result || ''), summary: String(parsed.summary || ''), items: Array.isArray(parsed.items) ? parsed.items : [] };
};

export default requestToolRoomProposal;
