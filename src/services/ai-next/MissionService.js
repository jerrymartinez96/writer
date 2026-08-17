import AIService from '../AIService';
import { getConfiguredAIOptions } from './AIRequestOptions';
import { toPlainText } from './plainText';

export const MISSION_TYPES = [
    { id: 'create_content', label: 'Crear contenido', description: 'Genera escenas, capítulos, ideas o documentos nuevos.' },
    { id: 'improve_content', label: 'Mejorar contenido', description: 'Reescribe texto existente sin perder su intención.' },
    { id: 'develop_canon', label: 'Desarrollar canon', description: 'Crea o modifica hechos, reglas, lugares y relaciones.' },
    { id: 'modify_structure', label: 'Modificar Estructura', description: 'Actualiza capítulos, escenas, conflictos y consecuencias.' },
    { id: 'update_character', label: 'Actualizar personaje', description: 'Evoluciona una ficha y sus apariciones relacionadas.' },
    { id: 'review_continuity', label: 'Revisar continuidad', description: 'Busca contradicciones y dependencias en la obra.' },
    { id: 'sync_canon', label: 'Sincronizar canon', description: 'Propone cambios coordinados entre documentos.' },
    { id: 'analyze', label: 'Analizar sin modificar', description: 'Entrega diagnóstico y recomendaciones sin escribir.' },
];

export const MISSION_SCOPES = [
    { id: 'automatic', label: 'Automático', description: 'La IA recomienda qué documentos están implicados.' },
    { id: 'active', label: 'Documento activo', description: 'Usa el documento abierto como destino principal.' },
    { id: 'selected', label: 'Elegir documentos', description: 'Selecciona manualmente contexto y destinos.' },
    { id: 'all', label: 'Toda la obra', description: 'Analiza capítulos, canon, estructura y personajes.' },
];

const parseJson = (value) => {
    if (value && typeof value === 'object') return value;
    const raw = String(value || '').trim();
    try { return JSON.parse(raw); } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('La IA no devolvió un análisis JSON válido.');
        return JSON.parse(match[0]);
    }
};

const normalizeDocument = (document) => ({
    id: String(document.id || ''),
    type: String(document.type || 'document'),
    title: String(document.title || document.name || document.id || 'Documento'),
    content: toPlainText(document.content || document.description || ''),
});

export const buildMissionDocuments = ({ chapters = [], worldItems = [], characters = [], activeChapter = null, scope = 'automatic', selectedIds = [] }) => {
    const all = [
        ...chapters.filter((item) => !item.isVolume).map((item) => ({ ...item, type: 'chapter', title: item.title })),
        ...worldItems.map((item) => ({ ...item, type: 'world', title: item.title })),
        ...characters.map((item) => ({ ...item, type: 'character', title: item.name, content: item.description || '' })),
    ].map(normalizeDocument).filter((item) => item.id);
    const baseIds = new Set(['system_core', 'system_estructura']);
    if (scope === 'active' && activeChapter?.id) return all.filter((item) => baseIds.has(item.id) || item.id === activeChapter.id);
    if (scope === 'selected') return all.filter((item) => selectedIds.includes(item.id) || item.id === 'system_core' || item.id === 'system_estructura');
    if (scope === 'all') return all;
    return all;
};

export const requestMissionImpact = async ({ profile, mission, documents }) => {
    const apiKey = profile?.aiConfig?.deepseekApiKey || profile?.deepseekApiKey || window.localStorage.getItem('deepseekApiKey') || '';
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de analizar la misión.');
    const prompt = [
        'Eres el Constructor Global de una obra narrativa. Analiza una misión y su posible impacto sobre el canon.',
        'Devuelve únicamente JSON válido con esta forma:',
        '{"summary":"...","recommendedScope":"automatic|active|selected|all","risk":"low|medium|high","confidence":0.0,"affectedDocuments":[{"documentId":"...","title":"...","impact":"high|medium|low","action":"modify|review|inform|ignore","reason":"..."}],"canonFacts":[{"subject":"...","predicate":"...","object":"...","status":"proposed|in_review|canon|conflict"}],"relations":[{"source":"...","predicate":"...","target":"...","status":"proposed|in_review|canon|conflict"}],"warnings":["..."]}',
        'No inventes IDs. Solo usa documentos incluidos en el contexto.',
        `Tipo: ${mission.type}`,
        `Objetivo: ${mission.objective}`,
        `Alcance solicitado: ${mission.scope}`,
        `Restricciones: ${JSON.stringify(mission.constraints || {})}`,
        'Documentos disponibles:',
        JSON.stringify(documents),
    ].join('\n\n');
    const raw = await AIService.sendMessage(prompt, apiKey, getConfiguredAIOptions(profile, { temperature: 0.1, useJsonMode: true, enableTools: false, max_tokens: 6000 }));
    const result = parseJson(raw);
    const allowed = new Set(documents.map((document) => document.id));
    const affectedDocuments = Array.isArray(result.affectedDocuments)
        ? result.affectedDocuments.filter((item) => allowed.has(String(item.documentId))).map((item) => ({
            documentId: String(item.documentId),
            title: String(item.title || documents.find((doc) => doc.id === item.documentId)?.title || item.documentId),
            impact: ['high', 'medium', 'low'].includes(item.impact) ? item.impact : 'medium',
            action: ['modify', 'review', 'inform', 'ignore'].includes(item.action) ? item.action : 'review',
            reason: String(item.reason || ''),
        }))
        : [];
    return {
        summary: String(result.summary || 'Impacto de misión listo para revisar.'),
        recommendedScope: MISSION_SCOPES.some((item) => item.id === result.recommendedScope) ? result.recommendedScope : mission.scope,
        risk: ['low', 'medium', 'high'].includes(result.risk) ? result.risk : 'medium',
        confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.5)),
        affectedDocuments,
        canonFacts: Array.isArray(result.canonFacts) ? result.canonFacts.map((fact) => ({ ...fact, status: fact.status || 'proposed' })) : [],
        relations: Array.isArray(result.relations) ? result.relations.map((relation) => ({ ...relation, status: relation.status || 'proposed' })) : [],
        warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
        sourceDocumentIds: documents.map((document) => document.id),
    };
};

export const requestMissionOperations = async ({ profile, mission, documents, impact }) => {
    const apiKey = profile?.aiConfig?.deepseekApiKey || profile?.deepseekApiKey || window.localStorage.getItem('deepseekApiKey') || '';
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de generar cambios.');
    const prompt = [
        'Eres el Constructor Global. Prepara operaciones revisables para una misión narrativa.',
        'Devuelve únicamente JSON válido: {"summary":"...","operations":[{"id":"...","documentId":"...","action":"patch|replace|create|review|fact","title":"...","reason":"...","originalText":"...","replacementText":"...","risk":"low|medium|high"}]}',
        'Las operaciones patch deben usar originalText literalmente presente en el documento. Nunca modifiques documentos fuera de los IDs permitidos. Para análisis, devuelve operaciones review sin replacementText.',
        `Misión: ${JSON.stringify(mission)}`,
        `Impacto aprobado: ${JSON.stringify(impact)}`,
        `Documentos: ${JSON.stringify(documents)}`,
    ].join('\n\n');
    const raw = await AIService.sendMessage(prompt, apiKey, getConfiguredAIOptions(profile, { temperature: 0.2, useJsonMode: true, enableTools: false, max_tokens: 8000 }));
    const result = parseJson(raw);
    const allowed = new Set(documents.map((document) => document.id));
    const operations = Array.isArray(result.operations) ? result.operations.filter((operation) => allowed.has(String(operation.documentId)) || operation.action === 'create').map((operation, index) => ({
        id: String(operation.id || `operation-${Date.now()}-${index}`),
        documentId: String(operation.documentId || ''),
        action: ['patch', 'replace', 'create', 'review', 'fact'].includes(operation.action) ? operation.action : 'review',
        title: String(operation.title || 'Operación del Constructor Global'),
        reason: String(operation.reason || ''),
        originalText: String(operation.originalText || ''),
        replacementText: toPlainText(operation.replacementText || ''),
        subject: String(operation.subject || ''),
        predicate: String(operation.predicate || ''),
        object: String(operation.object || ''),
        risk: ['low', 'medium', 'high'].includes(operation.risk) ? operation.risk : 'medium',
        status: 'pending',
    })) : [];
    return { summary: String(result.summary || 'Operaciones listas para revisar.'), operations };
};
