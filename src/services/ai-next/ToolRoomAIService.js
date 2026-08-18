import AIService, { COHERENCE_AUDIT_SCHEMA } from '../AIService';
import { formatDraftText, toPlainText } from './plainText';
import { getConfiguredAIOptions, getStructuredAIOptions } from './AIRequestOptions';
import { parseStructuredResponse, validateStructuredResponse } from './StructuredResponse';
import { buildRegisteredPrompt } from './PromptRegistry';
import { prepareSegments } from '../NarradorSegmenter';

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

const NARRATION_SCRIPT_TOOL = {
    type: 'function',
    function: {
        name: 'diseñar_guion_narracion',
        description: 'Diseña un guion de producción de audio sin modificar el texto del manuscrito.',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string' },
                segments: { type: 'array', minItems: 1, items: { type: 'object', properties: {
                    index: { type: 'number' },
                    text: { type: 'string' },
                    pauseBeforeMs: { type: 'number', minimum: 0, maximum: 10000 },
                    pauseAfterMs: { type: 'number', minimum: 0, maximum: 10000 },
                    tone: { type: 'string' },
                    emphasis: { type: 'array', items: { type: 'string' } },
                    direction: { type: 'string' },
                    pronunciation: { type: 'array', items: { type: 'string' } },
                }, required: ['index', 'text', 'pauseBeforeMs', 'pauseAfterMs', 'tone', 'emphasis', 'direction', 'pronunciation'] } },
                warnings: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'segments', 'warnings'],
        },
    },
};

export const createStructuredRequest = async ({ profile, prompt, schema, max_tokens = 7000 }) => {
    const apiKey = getToolRoomApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de usar esta Tool Room.');
    const requestOptions = {
        temperature: 0.1,
        max_tokens,
    };
    try {
        const raw = await AIService.sendMessage(prompt, apiKey, getStructuredAIOptions(profile, schema, requestOptions));
        const parsed = parseStructuredResponse(raw, 'respuesta de Tool Room');
        return validateStructuredResponse(parsed, schema, 'respuesta de Tool Room');
    } catch (error) {
        const errorMessage = String(error?.message || '');
        const canRecover = errorMessage.includes('respuesta vacía') || errorMessage.includes('respuesta de Tool Room inválida') || errorMessage.includes('JSON válido');
        if (!canRecover) throw error;
        // El segundo intento conserva la configuración de razonamiento y solo
        // vuelve a exigir el contrato estructurado.
        const recoveryRaw = await AIService.sendMessage(`${prompt}\n\nDevuelve un objeto JSON válido y completo con todos los campos obligatorios. No escribas texto fuera del objeto.`, apiKey, getStructuredAIOptions(profile, schema, {
            ...requestOptions,
            max_tokens: Math.max(6000, Math.min(max_tokens, 12000)),
        }));
        const parsed = parseStructuredResponse(recoveryRaw, 'respuesta de Tool Room');
        return validateStructuredResponse(parsed, schema, 'respuesta de Tool Room');
    }
};

const createNarrativeJsonRequest = async ({ profile, prompt, max_tokens = 7000 }) => {
    const apiKey = getToolRoomApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de usar esta Tool Room.');
    const baseOptions = getConfiguredAIOptions(profile, {
        temperature: 0.35,
        max_tokens,
    });
    const requestOptions = baseOptions.reasoningMode
        ? { ...baseOptions, responseMode: 'text' }
        : { ...baseOptions, responseMode: 'json' };
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

const normalizeConsistencyFinding = (finding, index, allowedIds, fallbackCategory = 'detail') => {
    const rawEvidence = Array.isArray(finding?.evidence)
        ? finding.evidence
        : [finding?.evidenceA, finding?.evidenceB].filter(Boolean);
    const evidence = rawEvidence.map((item) => ({
        documentId: String(item?.documentId || ''),
        quote: String(item?.quote || item?.text || '').trim(),
    })).filter((item) => allowedIds.has(item.documentId) && item.quote);
    const documentIds = [...new Set([
        ...(Array.isArray(finding?.documentIds) ? finding.documentIds.map(String) : []),
        ...evidence.map((item) => item.documentId),
    ].filter((id) => allowedIds.has(id)))];
    const documentId = String(finding?.documentId || documentIds[0] || '');
    if (!allowedIds.has(documentId)) return null;
    const allDocumentIds = documentIds.includes(documentId) ? documentIds : [documentId, ...documentIds];
    const needsEvidence = allDocumentIds.length > 1 && evidence.length < 2;
    return {
        id: String(finding?.id || `consistency-${Date.now()}-${index}`),
        documentId,
        documentIds: allDocumentIds.length ? allDocumentIds : [documentId],
        title: String(finding?.title || 'Detalle para revisar'),
        excerpt: String(finding?.excerpt || finding?.context || ''),
        originalText: String(finding?.originalText || ''),
        replacementText: String(finding?.replacementText || ''),
        replacementEdited: false,
        reason: String(finding?.reason || finding?.explanation || finding?.whyContradictory || ''),
        severity: ['low', 'medium', 'high'].includes(finding?.severity) ? finding.severity : 'medium',
        confidence: Math.min(1, Math.max(0, Number(finding?.confidence) || 0)),
        category: String(finding?.category || fallbackCategory),
        evidence,
        status: needsEvidence ? 'needs_evidence' : 'detected',
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

export const requestGlobalConsistencyAnalysis = async ({ profile, auditType = 'full', query = '', canonical = '', documents = [], instruction = '' }) => {
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
    const findings = Array.isArray(parsed.findings) ? parsed.findings.map((finding, index) => normalizeConsistencyFinding(finding, index, allowedIds, auditType)).filter(Boolean).filter((finding) => finding.originalText || !finding.replacementText) : [];
    return { summary: String(parsed.summary || ''), findings };
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
    const raw = await AIService.sendMessage(prompt, apiKey, getStructuredAIOptions(profile, COHERENCE_AUDIT_SCHEMA, {
        temperature: 0.15,
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

const normalizeNarrationScriptSegment = (segment, index) => ({
    index: Number.isFinite(Number(segment?.index)) ? Number(segment.index) : index,
    text: String(segment?.text || '').trim(),
    pauseBeforeMs: Math.max(0, Math.min(10000, Number(segment?.pauseBeforeMs) || 0)),
    pauseAfterMs: Math.max(0, Math.min(10000, Number(segment?.pauseAfterMs) || 0)),
    tone: String(segment?.tone || 'natural'),
    emphasis: Array.isArray(segment?.emphasis) ? segment.emphasis.map(String).filter(Boolean) : [],
    direction: String(segment?.direction || ''),
    pronunciation: Array.isArray(segment?.pronunciation) ? segment.pronunciation.map(String).filter(Boolean) : [],
});

const normalizeNarrationCoverage = (value) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const ensureNarrationSourceCoverage = (source, segments) => {
    const sourceCoverage = normalizeNarrationCoverage(source);
    const generatedCoverage = normalizeNarrationCoverage(segments.map((segment) => segment.text).join(' '));
    if (sourceCoverage === generatedCoverage) return { segments, warning: '' };

    // La producción de audio no puede alterar ni perder palabras del manuscrito.
    // Si el modelo rompe el contrato, conservamos solo una segmentación literal y
    // dejamos constancia visible para que el usuario pueda volver a diseñarla.
    const literalSegments = prepareSegments(source).map((segment, index) => ({
        ...segment,
        index,
        pauseBeforeMs: 0,
        pauseAfterMs: 0,
        tone: 'natural',
        emphasis: [],
        direction: '',
        pronunciation: [],
    }));
    return {
        segments: literalSegments,
        warning: 'La IA no conservó literalmente todo el texto fuente; se restauró una segmentación literal del capítulo.'
    };
};

export const requestNarrationScript = async ({ profile, chapterId = '', sourceContent = '', contextContent = '', instruction = '' }) => {
    const source = toPlainText(sourceContent);
    if (!source) throw new Error('No hay texto para diseñar el guion de narración.');
    const prompt = buildRegisteredPrompt('narrationScript', { chapterId, sourceContent: source, contextContent: toPlainText(contextContent).slice(0, 18000), instruction });
    const parsed = await createStructuredRequest({ profile, prompt, schema: NARRATION_SCRIPT_TOOL, max_tokens: 9000 });
    const generatedSegments = Array.isArray(parsed.segments)
        ? parsed.segments.map(normalizeNarrationScriptSegment).filter((segment) => segment.text)
        : [];
    if (!generatedSegments.length) throw new Error('La IA no devolvió segmentos válidos para el guion.');
    const coverage = ensureNarrationSourceCoverage(source, generatedSegments);
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(String).filter(Boolean) : [];
    if (coverage.warning) warnings.unshift(coverage.warning);
    return {
        chapterId: String(chapterId || ''),
        summary: String(parsed.summary || 'Guion de narración preparado para revisión.'),
        segments: coverage.segments.map((segment, index) => ({ ...segment, index })),
        warnings,
    };
};

export default requestToolRoomProposal;
