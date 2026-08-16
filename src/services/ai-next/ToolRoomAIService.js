import AIService, { COHERENCE_AUDIT_SCHEMA } from '../AIService';
import { formatDraftText, toPlainText } from './plainText';
import { getConfiguredAIOptions } from './AIRequestOptions';

const parseJson = (value) => {
    if (value && typeof value === 'object') return value;
    const raw = String(value || '').trim();
    if (!raw) throw new Error('La IA devolvió una respuesta vacía. Intenta nuevamente el análisis.');
    const candidates = [raw];
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) candidates.unshift(fenced[1].trim());
    const objectIndex = raw.indexOf('{');
    const arrayIndex = raw.indexOf('[');
    const firstObject = objectIndex === -1 ? arrayIndex : arrayIndex === -1 ? objectIndex : Math.min(objectIndex, arrayIndex);
    if (firstObject >= 0) {
        let depth = 0;
        let quoted = false;
        let escaped = false;
        for (let index = firstObject; index < raw.length; index += 1) {
            const character = raw[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (character === '\\') escaped = true;
                else if (character === '"') quoted = false;
                continue;
            }
            if (character === '"') quoted = true;
            else if (character === '{' || character === '[') depth += 1;
            else if (character === '}' || character === ']') {
                depth -= 1;
                if (depth === 0) {
                    candidates.push(raw.slice(firstObject, index + 1));
                    break;
                }
            }
        }
    }
    for (const candidate of candidates) {
        try { return JSON.parse(candidate); } catch { /* intenta el siguiente formato */ }
    }
    throw new Error('La IA devolvió una respuesta que no es JSON válido. Intenta de nuevo.');
};

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

const createStructuredRequest = async ({ profile, prompt, schema, max_tokens = 7000 }) => {
    const apiKey = getToolRoomApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de usar esta Tool Room.');
    const requestOptions = {
        temperature: 0.1,
        useJsonMode: false,
        enableTools: true,
        tools: [schema],
        toolChoice: 'auto',
        reasoningMode: true,
        max_tokens,
    };
    try {
        const raw = await AIService.sendMessage(prompt, apiKey, getConfiguredAIOptions(profile, requestOptions));
        return parseJson(raw);
    } catch (error) {
        const errorMessage = String(error?.message || '');
        const canRecover = errorMessage.includes('respuesta vacía') || errorMessage.includes('JSON válido');
        if (!canRecover) throw error;
        // DeepSeek puede terminar el razonamiento sin emitir una tool o producir
        // argumentos truncados. El segundo intento obliga una llamada limpia.
        const recoveryRaw = await AIService.sendMessage(`${prompt}\n\nDebes llamar obligatoriamente a la herramienta disponible. Devuelve todos sus argumentos como JSON válido y completo; no escribas texto fuera de la herramienta.`, apiKey, getConfiguredAIOptions(profile, {
            ...requestOptions,
            reasoningMode: false,
            toolChoice: 'required',
            max_tokens: Math.max(6000, Math.min(max_tokens, 12000)),
        }));
        return parseJson(recoveryRaw);
    }
};

const createNarrativeJsonRequest = async ({ profile, prompt, max_tokens = 7000, reasoningMode = true }) => {
    const apiKey = getToolRoomApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de usar esta Tool Room.');
    const requestOptions = getConfiguredAIOptions(profile, {
        temperature: 0.35,
        useJsonMode: true,
        enableTools: false,
        reasoningMode,
        max_tokens,
    });
    try {
        const raw = await AIService.sendMessage(prompt, apiKey, requestOptions);
        return parseJson(raw);
    } catch (error) {
        if (!String(error?.message || '').includes('respuesta vacía')) throw error;
        // Algunos modelos consumen el turno en razonamiento y no emiten el JSON.
        // Reintentamos como una respuesta JSON directa para no perder la auditoría.
        const recoveryRaw = await AIService.sendMessage(`${prompt}\n\nDevuelve ahora únicamente el objeto JSON solicitado, sin razonamiento previo ni texto adicional.`, apiKey, {
            ...requestOptions,
            temperature: 0.15,
            reasoningMode: false,
            reasoningEffort: 'disabled',
        });
        return parseJson(recoveryRaw);
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
    const prompt = [
        'ROL: Eres el editor principal de continuidad de una novela. Esta tarea es de diagnóstico, no de escritura.',
        'OBJETIVO: interpretar el documento Estructura completo, compararlo con el manuscrito y recomendar qué capítulo debe redactarse después.',
        '',
        'JERARQUÍA DE FUENTES:',
        '1. El documento de Estructura define el plan previsto y sus títulos, posiciones, propósitos, conflictos y escenas.',
        '2. El manuscrito define lo que realmente está escrito; nunca supongas que una intención de Estructura ya ocurrió.',
        '3. Mundo, personajes y último capítulo sirven para comprobar continuidad, no para inventar capítulos ausentes.',
        '',
        'REGLAS DE ANÁLISIS:',
        '- Extrae todos los capítulos identificables en Estructura, incluso si el texto usa formato libre.',
        '- Conserva el orden y posición narrativa. No fusiones capítulos distintos.',
        '- Marca written solo con evidencia clara en el manuscrito; marca empty solo si existe un capítulo equivalente sin contenido.',
        '- Usa uncertain cuando título, hechos o contenido sugieren una coincidencia pero no permiten confirmarla.',
        '- Una coincidencia debe comparar hechos, personajes, eventos y posición, no solo títulos parecidos.',
        '- No marques automáticamente nada como confirmado: matches son sugerencias para revisión humana.',
        '- Detecta cabos abiertos únicamente cuando estén respaldados por Estructura o manuscrito.',
        '- Si Estructura está vacía o no contiene capítulos, devuelve chapters vacío y explica que debe diseñarse el siguiente capítulo.',
        '',
        'CONTRATO: llama a la herramienta analizar_estructura_capitulos. No escribas prosa ni devuelvas texto fuera de la herramienta.',
        '',
        'DOCUMENTO DE ESTRUCTURA (fuente de plan):',
        toPlainText(structureContent) || '(vacío)',
        '',
        'CAPÍTULOS DEL MANUSCRITO (fuente de hechos escritos):',
        JSON.stringify(normalizedChapters),
        '',
        'ÚLTIMO CAPÍTULO DISPONIBLE:',
        JSON.stringify(lastChapter ? { title: lastChapter.title, content: toPlainText(lastChapter.content || '') } : null),
        '',
        'INFORMACIÓN GENERAL DEL MUNDO:',
        toPlainText(worldContent) || '(sin información general)',
        '',
        'PERSONAJES:',
        JSON.stringify(characters.map((character) => ({ name: character.name, description: toPlainText(character.description || '') }))),
    ].join('\n');
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
    const prompt = [
        'ROL: Eres el novelista responsable de redactar un capítulo completo y el editor de continuidad que debe impedir contradicciones.',
        'TAREA: escribe el capítulo indicado por la estructura aprobada. No entregues un resumen, esquema, muestra, explicación ni comentario editorial.',
        '',
        'ORDEN DE PRIORIDAD:',
        '1. Estructura aprobada y escenas aprobadas: son la fuente de verdad del capítulo.',
        '2. Continuidad del manuscrito y último capítulo: determina hechos, relaciones, tono y punto de partida.',
        '3. Mundo y personajes: completan detalles compatibles, pero no autorizan inventar giros que contradigan el plan.',
        '4. Instrucciones de estilo: se aplican siempre que no contradigan una fuente superior.',
        '',
        'PLANIFICACIÓN OBLIGATORIA:',
        '- Desarrolla todas las escenas aprobadas en el orden recibido; no las omitas, fusiones ni sustituyas.',
        '- Cada escena debe tener objetivo, acción, conflicto y consecuencia visible.',
        '- Usa transiciones claras entre escenas y evita saltos temporales sin señal narrativa.',
        '- El final debe dejar exactamente la consecuencia prevista por la estructura, no resolver cabos reservados para capítulos posteriores.',
        '',
        'CONTINUIDAD Y ESTILO:',
        '- Conserva el punto de vista, persona narrativa, tiempo verbal, tono, registro y tratamiento de los diálogos del manuscrito.',
        '- No introduzcas personajes, lugares, poderes, relaciones, fechas o hechos que no estén autorizados por el contexto.',
        '- Si falta un detalle, elige la opción más conservadora y compatible; no rellenes el vacío con una revelación nueva.',
        '- No repitas información que el último capítulo ya mostró salvo que sea necesario desde otro punto de vista.',
        '',
        'FORMATO Y COMPLETITUD:',
        '- Devuelve prosa narrativa completa en texto plano.',
        '- Separa cada párrafo con una línea en blanco; separa también los bloques de diálogo para que el editor pueda leerlos.',
        '- No uses HTML, Markdown, encabezados técnicos, notas del autor, etiquetas de escena ni texto fuera del capítulo.',
        '- No termines con una frase incompleta, una elipsis terminal, "[…]", "[...]", "continuará" o un resumen del resto.',
        `- Tamaño objetivo: ${sizeLabel}. Permanece dentro del rango sin recortar escenas ni sustituirlas por un resumen.`,
        '',
        '',
        `Título: ${title}`,
        `Plan estructurado: ${JSON.stringify(plan || {})}`,
        'Estructura aprobada completa:',
        toPlainText(structure) || '(no disponible; usa el plan estructurado)',
        '',
        'Último capítulo:',
        JSON.stringify(lastChapter ? { title: lastChapter.title, content: toPlainText(lastChapter.content || '') } : null),
        '',
        'Contexto completo de continuidad:',
        toPlainText(contextContent) || '(sin contexto adicional)',
    ].join('\n');
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
    const prompt = [
        'ROL: Eres un corrector de formato de lectura.',
        'TAREA: organiza el texto completo para que sea legible en un editor narrativo.',
        'REGLA ABSOLUTA: no cambies, elimines, añadas ni reordenes ninguna palabra, signo, diálogo o fragmento.',
        'Solo puedes insertar saltos de línea dobles entre párrafos, bloques de diálogo y cambios claros de escena.',
        'Conserva exactamente la ortografía, puntuación, comillas, guiones, nombres y orden original.',
        'No resumas, no corrijas estilo, no reescribas y no agregues títulos.',
        'Devuelve únicamente la respuesta de la herramienta aplicar_formateo_lectura.',
        '',
        'TEXTO ORIGINAL COMPLETO:',
        original,
    ].join('\n\n');
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
    const prompt = [
        'ROL: Eres un editor de desarrollo narrativo. Diseña posibilidades, pero no redactes prosa.',
        'TAREA: propone exactamente tres direcciones realmente distintas para el próximo capítulo.',
        'Las tres opciones deben conservar los hechos establecidos y responder a la idea del usuario.',
        'Opción 1: conservadora, continúa el plan con el menor riesgo de continuidad.',
        'Opción 2: aumenta la tensión o el costo emocional sin resolver prematuramente los conflictos.',
        'Opción 3: más arriesgada, pero compatible con los hechos y con consecuencias narrativas claras.',
        'Cada dirección debe explicar propósito, conflicto central, revelaciones posibles, consecuencias, riesgos y compatibilidad tonal.',
        'No inventes una solución definitiva si la estructura indica que el conflicto debe continuar.',
        'Devuelve únicamente el JSON solicitado; no incluyas comentarios fuera de él.',
        '',
        `IDEA DEL USUARIO:\n${idea || '(sin idea adicional)'}`,
        `PLAN DETECTADO:\n${JSON.stringify(chapterPlan || {})}`,
        `ÚLTIMO CAPÍTULO:\n${JSON.stringify(lastChapter ? { title: lastChapter.title, content: toPlainText(lastChapter.content || '') } : null)}`,
        `CABOS ABIERTOS:\n${JSON.stringify(openThreads)}`,
        `CONTEXTO DE APOYO:\n${toPlainText(contextContent) || '(sin contexto adicional)'}`,
    ].join('\n\n');
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
    const prompt = [
        'ROL: Eres un diseñador de escenas, no un redactor de prosa.',
        `TAREA: propone únicamente la escena ${nextNumber} del capítulo en el formato solicitado.`,
        'La escena debe continuar lo aprobado, avanzar el conflicto y dejar una transición clara hacia la siguiente.',
        'No repitas una escena aprobada, no resuelvas antes de tiempo el conflicto principal y no introduzcas personajes o hechos no autorizados.',
        'Si una revelación está reservada para después, conviértela en indicio o tensión, no la reveles completa.',
        'Cada campo debe ser concreto y accionable para un escritor: objetivo, lugar/momento, personajes, conflicto, acción, revelación, cambio emocional y transición.',
        'Devuelve únicamente el objeto scene; no incluyas prosa narrativa ni explicaciones.',
        '',
        `TAMAÑO OBJETIVO: ${size}`,
        `PLAN: ${JSON.stringify(chapterPlan || {})}`,
        `DIRECCIÓN ELEGIDA: ${JSON.stringify(direction || {})}`,
        `ESCENAS APROBADAS: ${JSON.stringify(scenes)}`,
        `ÚLTIMO CAPÍTULO: ${JSON.stringify(lastChapter ? { title: lastChapter.title, content: toPlainText(lastChapter.content || '') } : null)}`,
        `CONTEXTO: ${toPlainText(contextContent) || '(sin contexto adicional)'}`,
        `INSTRUCCIÓN ADICIONAL: ${instruction || '(ninguna)'}`,
    ].join('\n\n');
    const parsed = await createNarrativeJsonRequest({ profile, prompt, max_tokens: 4500 });
    if (!parsed.scene) throw new Error('La IA no devolvió una escena válida.');
    return normalizeScene(parsed.scene, nextNumber - 1);
};

const normalizeConsistencyFinding = (finding, index, allowedIds) => {
    const documentId = String(finding?.documentId || '');
    if (!allowedIds.has(documentId)) return null;
    return {
        id: String(finding?.id || `consistency-${Date.now()}-${index}`),
        documentId,
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

export const requestGlobalConsistencyAnalysis = async ({ profile, auditType = 'custom', query = '', canonical = '', documents = [], instruction = '' }) => {
    const normalizedDocuments = documents.map((document) => ({
        id: String(document.id || ''),
        type: String(document.type || 'document'),
        title: String(document.title || document.name || document.id || 'Documento'),
        content: toPlainText(document.content || document.description || ''),
    })).filter((document) => document.id && document.content);
    if (!normalizedDocuments.length) return { summary: 'No hay documentos con contenido suficiente para analizar.', findings: [] };
    const allowedIds = new Set(normalizedDocuments.map((document) => document.id));
    const prompt = `Eres un editor de continuidad y estilo para una obra narrativa. Busca detalles repetidos, desactualizados o variables entre documentos. No modifiques nada y no conviertas una coincidencia legítima en un error sin evidencia. Devuelve únicamente JSON válido con esta forma:
{"summary":"...","findings":[{"id":"...","documentId":"...","category":"mulettilla|character|world|terminology|timeline|custom","title":"...","excerpt":"fragmento breve con contexto","originalText":"texto exacto que puede reemplazarse","replacementText":"reemplazo sugerido","reason":"por qué debe revisarse","severity":"low|medium|high","confidence":0.0}]}

Reglas:
- Cada finding debe apuntar a un documentId válido.
- originalText debe contener el fragmento mínimo necesario para aplicar un cambio seguro y debe aparecer literalmente en el documento. Si quitar solo la frase dejaría una oración rota, incluye la oración completa en originalText y devuelve una versión reescrita completa en replacementText.
- replacementText debe conservar una oración gramatical, su puntuación y el sentido narrativo. Para muletillas no devuelvas replacementText vacío: reescribe el fragmento o la oración de forma natural. Solo deja replacementText vacío cuando eliminar todo originalText sea claramente correcto y la oración siga siendo válida.
- No propongas cambiar hechos solo porque aparecen una vez.
- Para muletillas, revisa si pertenecen al personaje indicado y conserva usos intencionales. Si el usuario pide eliminar una muletilla, elimina también conectores, comas o construcciones que queden sobrantes.
- Para detalles globales, compara la fuente de verdad con las apariciones y marca las dudosas con confianza baja.

Tipo de auditoría: ${auditType}
Elemento o búsqueda: ${query || '(detectar automáticamente)'}
Versión correcta o fuente de verdad: ${canonical || '(no definida; solo detectar)'}
Instrucción adicional: ${instruction || '(ninguna)'}

Documentos:
${JSON.stringify(normalizedDocuments)}`;
    const parsed = await createNarrativeJsonRequest({ profile, prompt, max_tokens: 9000 });
    const findings = Array.isArray(parsed.findings) ? parsed.findings.map((finding, index) => normalizeConsistencyFinding(finding, index, allowedIds)).filter(Boolean).filter((finding) => finding.originalText || !finding.replacementText) : [];
    return { summary: String(parsed.summary || ''), findings };
};

export const requestCoherenceAnalysis = async ({ profile, documents = [] }) => {
    const normalizedDocuments = normalizeDocuments(documents);
    if (normalizedDocuments.length < 2) return { summary: 'Se necesitan al menos dos documentos con contenido.', items: [] };
    const allowedIds = new Set(normalizedDocuments.map((document) => document.id));
    const prompt = `Eres un auditor de continuidad narrativa. Analiza exclusivamente los documentos JSON entregados y detecta contradicciones objetivas. No propongas soluciones todavía. No reportes diferencias de estilo, omisiones, dudas o hechos compatibles. Cada hallazgo debe tener evidencia textual de dos documentos y solo puede usar IDs presentes en la entrada.

Devuelve únicamente JSON válido con esta forma. Usa los IDs solo en documentIds y en documentId de las evidencias; en títulos, afirmaciones, explicaciones y summary utiliza el nombre del documento, nunca su ID:
{"summary":"...","findings":[{"documentIds":["id-a","id-b"],"category":"timeline|character|location|rule|fact|reference","title":"...","severity":"low|medium|high","confidence":0.0,"claimA":"...","claimB":"...","evidenceA":{"documentId":"...","quote":"..."},"evidenceB":{"documentId":"...","quote":"..."},"explanation":"..."}]}

Documentos:
${JSON.stringify(normalizedDocuments)}`;
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
    const prompt = `Verifica si el hallazgo siguiente es una contradicción objetiva. Responde únicamente JSON válido: {"status":"confirmed|rejected","confidence":0.0,"reason":"..."}. Confirma solo si las dos afirmaciones no pueden ser verdaderas al mismo tiempo y las citas respaldan el hallazgo.

Hallazgo:
${JSON.stringify(finding)}

Documentos afectados:
${JSON.stringify(affectedDocuments)}`;
    const parsed = await createStructuredRequest({ profile, prompt, schema: COHERENCE_VALIDATE_TOOL, max_tokens: 1800 });
    const status = parsed.status === 'confirmed' && Number(parsed.confidence) >= COHERENCE_MIN_CONFIDENCE ? 'confirmed' : 'rejected';
    return { ...finding, status, validationConfidence: Number(parsed.confidence) || 0, validationReason: String(parsed.reason || '') };
};

export const requestCoherenceResolutionOptions = async ({ profile, finding, documents = [], force = false }) => {
    const affectedDocuments = normalizeDocuments(documents).filter((document) => finding.documentIds.includes(document.id));
    if (finding.status !== 'confirmed' && !force) throw new Error('Solo se pueden generar soluciones para una inconsistencia confirmada.');
    const prompt = `Genera exactamente tres opciones distintas para resolver la inconsistencia confirmada. No modifiques documentos. Una opción debe minimizar cambios, otra puede cambiar el canon y otra puede introducir una explicación narrativa. Devuelve solo JSON válido:
{"options":[{"id":"option-a","title":"...","description":"...","risk":"low|medium|high","impact":"...","preserves":["..."],"changes":["..."],"documentIds":["..."],"patchPlans":[{"documentId":"...","originalText":"...","replacementText":"...","reason":"..."}]}]}

Hallazgo:
${JSON.stringify(finding)}

Documentos afectados:
${JSON.stringify(affectedDocuments)}`;
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
    const prompt = `Convierte la idea del usuario en una única solución alternativa para la inconsistencia. Respeta la intención del usuario, señala sus consecuencias y no apliques cambios. Devuelve la solución mediante la herramienta disponible.

Idea del usuario:
${instruction}

Hallazgo:
${JSON.stringify(finding)}

Documentos afectados:
${JSON.stringify(affectedDocuments)}`;
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
    const prompt = `Construye parches exactos para aplicar la opción elegida. Modifica únicamente lo necesario. Devuelve solo JSON válido: {"patches":[{"documentId":"...","baseVersion":"...","originalText":"...","replacementText":"...","reason":"..."}]}. originalText debe existir literalmente en el documento; nunca devuelvas un reemplazo de documento completo ni HTML nuevo si no estaba en el original.

Hallazgo:
${JSON.stringify(finding)}

Opción elegida:
${JSON.stringify(option)}

Documentos actuales:
${JSON.stringify(affectedDocuments)}`;
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
    const apiKey = getToolRoomApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de usar esta Tool Room.');
    const prompt = `Eres la herramienta especializada ${roomName}. Devuelve únicamente JSON válido con esta forma exacta: {"summary":"resumen breve","replacement":"texto plano","risk":"low|medium|high"}. Está estrictamente prohibido usar HTML, Markdown, etiquetas, negritas, títulos especiales, listas con formato o cualquier markup. Usa solo texto plano y saltos de línea simples. No agregues explicaciones fuera del JSON. Conserva toda la información no afectada y trabaja solo sobre el contenido original. Usa el contexto de apoyo únicamente para mantener continuidad y no lo modifiques.\n\nObjetivo: ${instruction}\n\nContenido original editable:\n${toPlainText(sourceContent) || '(vacío)'}\n\nContexto de apoyo no editable:\n${toPlainText(contextContent) || '(sin contexto adicional)'}`;
    const raw = await AIService.sendMessage(prompt, getToolRoomApiKey(profile), getConfiguredAIOptions(profile, { temperature: 0.35, useJsonMode: true, enableTools: false, max_tokens: 5000 }));
    const result = parseJson(raw);
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
    const prompt = `Eres la herramienta especializada ${roomName}. Debes comparar hechos entre documentos y reportar solo contradicciones objetivas. Usa exclusivamente la función reportar_incoherencias. No modifiques documentos.\n\nCriterio obligatorio: un hallazgo solo es válido si la afirmación del documento A y la afirmación del documento B no pueden ser verdaderas al mismo tiempo. No reportes dudas, omisiones, diferencias de estilo, mejoras narrativas, posibilidades interpretativas ni hechos compatibles. Cada hallazgo debe contener evidencia concreta de ambos documentos y explicar el conflicto. Si no existe una contradicción real, devuelve findings vacío.\n\nIDs válidos: ${JSON.stringify([...allowedIds])}\n\nObjetivo: ${instruction}\n\nDocumentos analizados. Cada bloque comienza con un ID válido y contiene texto plano:\n${toPlainText(sourceContent) || '(vacío)'}\n\nContexto de apoyo no analizable:\n${toPlainText(contextContent) || '(sin contexto adicional)'}`;
    const raw = await AIService.sendMessage(prompt, apiKey, getConfiguredAIOptions(profile, {
        temperature: 0.15,
        useJsonMode: false,
        enableTools: true,
        tools: [COHERENCE_AUDIT_SCHEMA],
        // DeepSeek Thinking no admite tool_choice forzado. Como solo enviamos
        // esta herramienta, `auto` sigue siendo determinista en este Room.
        toolChoice: 'auto',
        max_tokens: 8000,
    }));
    const parsed = parseJson(raw);
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

export default requestToolRoomProposal;
