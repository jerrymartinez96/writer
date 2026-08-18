import AIService from '../AIService';
import { getStructuredAIOptions } from './AIRequestOptions';
import { toPlainText } from './plainText';
export const MISSION_TYPES = [
    { id: 'develop_canon', label: 'Modificar canon', description: 'Crea, elimina o transforma hechos, reglas y relaciones importantes.' },
    { id: 'modify_structure', label: 'Modificar estructura', description: 'Actualiza capítulos, escenas, conflictos y consecuencias.' },
    { id: 'update_character', label: 'Actualizar personaje', description: 'Evoluciona una ficha y revisa sus apariciones relacionadas.' },
    { id: 'sync_canon', label: 'Sincronizar documentos', description: 'Propone cambios coordinados entre el canon y el manuscrito.' },
    { id: 'analyze', label: 'Analizar sin modificar', description: 'Entrega diagnóstico y recomendaciones sin escribir.' },
];

export const MISSION_SCOPES = [
    { id: 'automatic', label: 'Automático', description: 'La IA recomienda qué documentos están implicados.' },
    { id: 'active', label: 'Documento activo', description: 'Usa el documento abierto como destino principal.' },
    { id: 'selected', label: 'Elegir documentos', description: 'Selecciona manualmente contexto y destinos.' },
    { id: 'all', label: 'Toda la obra', description: 'Analiza capítulos, canon, estructura y personajes.' },
];

import { buildRegisteredPrompt } from './PromptRegistry';
import { parseAndValidate } from './StructuredResponse';

const getApiKey = (profile) => profile?.aiConfig?.deepseekApiKey || profile?.deepseekApiKey || window.localStorage.getItem('deepseekApiKey') || '';

const structuredCall = async ({ profile, prompt, schema, temperature = 0.1, max_tokens = 7000 }) => {
    const apiKey = getApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek antes de analizar la misión.');
    const raw = await AIService.sendMessage(prompt, apiKey, getStructuredAIOptions(profile, schema, {
        temperature,
        max_tokens,
    }));
    return parseAndValidate(raw, schema, 'respuesta del Constructor Global');
};

const IMPACT_TOOL = {
    type: 'function',
    function: {
        name: 'reportar_impacto_de_canon',
        description: 'Devuelve el análisis estructurado del impacto de una modificación narrativa.',
        parameters: { type: 'object', properties: {
            summary: { type: 'string' }, recommendedScope: { type: 'string', enum: ['automatic', 'active', 'selected', 'all'] }, risk: { type: 'string', enum: ['low', 'medium', 'high'] }, confidence: { type: 'number' },
            affectedDocuments: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'string' }, title: { type: 'string' }, impact: { type: 'string', enum: ['high', 'medium', 'low'] }, action: { type: 'string', enum: ['modify', 'review', 'inform', 'ignore'] }, reason: { type: 'string' } }, required: ['documentId', 'impact', 'action', 'reason'] } },
            canonFacts: { type: 'array', items: { type: 'object' } }, relations: { type: 'array', items: { type: 'object' } }, warnings: { type: 'array', items: { type: 'string' } }, questions: { type: 'array', items: { type: 'string' } },
        }, required: ['summary', 'risk', 'confidence', 'affectedDocuments', 'warnings'] },
    },
};

const ALTERNATIVES_TOOL = {
    type: 'function',
    function: {
        name: 'proponer_alternativas_de_canon',
        description: 'Propone exactamente tres alternativas comparables y no aplica cambios.',
        parameters: { type: 'object', properties: { alternatives: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: {
            id: { type: 'string' }, type: { type: 'string', enum: ['conservative', 'transformative', 'compensatory'] }, title: { type: 'string' }, summary: { type: 'string' }, benefits: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } }, consequences: { type: 'array', items: { type: 'string' } }, preserves: { type: 'array', items: { type: 'string' } }, changes: { type: 'array', items: { type: 'string' } }, documentIds: { type: 'array', items: { type: 'string' } }, effort: { type: 'string', enum: ['low', 'medium', 'high'] },
        }, required: ['id', 'type', 'title', 'summary', 'benefits', 'risks', 'consequences', 'changes', 'documentIds'] } } }, required: ['alternatives'] },
    },
};

const OPERATIONS_TOOL = {
    type: 'function',
    function: {
        name: 'preparar_plan_de_cambios_de_canon',
        description: 'Prepara operaciones exactas, revisables y no destructivas para un plan aprobado.',
        parameters: { type: 'object', properties: { summary: { type: 'string' }, operations: { type: 'array', items: { type: 'object', properties: {
            id: { type: 'string' }, documentId: { type: 'string' }, action: { type: 'string', enum: ['patch', 'replace', 'delete', 'create', 'review', 'fact'] }, title: { type: 'string' }, reason: { type: 'string' }, originalText: { type: 'string' }, replacementText: { type: 'string' }, anchor: { type: 'string' }, dependencies: { type: 'array', items: { type: 'string' } }, expectedResult: { type: 'string' }, risk: { type: 'string', enum: ['low', 'medium', 'high'] },
        }, required: ['documentId', 'action', 'title', 'reason', 'risk'] } } }, required: ['summary', 'operations'] },
    },
};

const VERIFICATION_TOOL = {
    type: 'function',
    function: {
        name: 'verificar_cambio_de_canon',
        description: 'Verifica el resultado de un cambio aplicado sin modificar documentos.',
        parameters: { type: 'object', properties: { passed: { type: 'boolean' }, summary: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['low', 'medium', 'high'] }, title: { type: 'string' }, detail: { type: 'string' }, documentIds: { type: 'array', items: { type: 'string' } } }, required: ['severity', 'title', 'detail'] } }, pendingReview: { type: 'array', items: { type: 'string' } } }, required: ['passed', 'summary', 'findings', 'pendingReview'] },
    },
};

const normalizeDocument = (document) => ({
    id: String(document.id || ''), type: String(document.type || 'document'), title: String(document.title || document.name || document.id || 'Documento'), content: toPlainText(document.content || document.description || ''),
});

export const buildMissionDocuments = ({ chapters = [], worldItems = [], characters = [], activeChapter = null, scope = 'automatic', selectedIds = [] }) => {
    const all = [
        ...chapters.filter((item) => !item.isVolume).map((item) => ({ ...item, type: 'chapter', title: item.title })),
        ...worldItems.map((item) => ({ ...item, type: 'world', title: item.title })),
        ...characters.map((item) => ({ ...item, type: 'character', title: item.name, content: item.description || '' })),
    ].map(normalizeDocument).filter((item) => item.id);
    const baseIds = new Set(['system_core', 'system_estructura']);
    if (scope === 'active' && activeChapter?.id) return all.filter((item) => baseIds.has(item.id) || item.id === activeChapter.id);
    if (scope === 'selected') return all.filter((item) => selectedIds.includes(item.id) || baseIds.has(item.id));
    return all;
};

export const requestMissionImpact = async ({ profile, mission, documents }) => {
    const prompt = buildRegisteredPrompt('globalImpact', { mission, documents });
    const result = await structuredCall({ profile, prompt, schema: IMPACT_TOOL, temperature: 0.1, max_tokens: 7000 });
    const allowed = new Set(documents.map((document) => document.id));
    return {
        summary: String(result.summary || 'Impacto listo para revisar.'), recommendedScope: MISSION_SCOPES.some((item) => item.id === result.recommendedScope) ? result.recommendedScope : mission.scope, risk: ['low', 'medium', 'high'].includes(result.risk) ? result.risk : 'medium', confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.5)),
        affectedDocuments: Array.isArray(result.affectedDocuments) ? result.affectedDocuments.filter((item) => allowed.has(String(item.documentId))).map((item) => ({ documentId: String(item.documentId), title: String(item.title || documents.find((doc) => doc.id === item.documentId)?.title || item.documentId), impact: ['high', 'medium', 'low'].includes(item.impact) ? item.impact : 'medium', action: ['modify', 'review', 'inform', 'ignore'].includes(item.action) ? item.action : 'review', reason: String(item.reason || '') })) : [],
        canonFacts: Array.isArray(result.canonFacts) ? result.canonFacts : [], relations: Array.isArray(result.relations) ? result.relations : [], warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [], questions: Array.isArray(result.questions) ? result.questions.map(String) : [], sourceDocumentIds: documents.map((document) => document.id),
    };
};

export const requestMissionAlternatives = async ({ profile, mission, documents, impact }) => {
    const prompt = buildRegisteredPrompt('globalAlternatives', { mission, impact, documents });
    const result = await structuredCall({ profile, prompt, schema: ALTERNATIVES_TOOL, temperature: 0.35, max_tokens: 8000 });
    const allowed = new Set(documents.map((document) => document.id));
    const types = ['conservative', 'transformative', 'compensatory'];
    const alternatives = Array.isArray(result.alternatives) ? result.alternatives.slice(0, 3).map((item, index) => ({ id: String(item.id || `alternative-${index + 1}`), type: types[index] || item.type, title: String(item.title || `Alternativa ${index + 1}`), summary: String(item.summary || ''), benefits: Array.isArray(item.benefits) ? item.benefits.map(String) : [], risks: Array.isArray(item.risks) ? item.risks.map(String) : [], consequences: Array.isArray(item.consequences) ? item.consequences.map(String) : [], preserves: Array.isArray(item.preserves) ? item.preserves.map(String) : [], changes: Array.isArray(item.changes) ? item.changes.map(String) : [], documentIds: Array.isArray(item.documentIds) ? item.documentIds.map(String).filter((id) => allowed.has(id)) : [], effort: ['low', 'medium', 'high'].includes(item.effort) ? item.effort : 'medium' })) : [];
    if (alternatives.length !== 3) throw new Error('La IA no devolvió exactamente tres alternativas.');
    return { alternatives };
};

export const requestMissionOperations = async ({ profile, mission, documents, impact, alternative }) => {
    const prompt = buildRegisteredPrompt('globalOperations', { mission, impact, alternative, documents });
    const result = await structuredCall({ profile, prompt, schema: OPERATIONS_TOOL, temperature: 0.15, max_tokens: 9000 });
    const allowed = new Set(documents.map((document) => document.id));
    const operations = Array.isArray(result.operations) ? result.operations.filter((operation) => allowed.has(String(operation.documentId)) || operation.action === 'create').map((operation, index) => ({
        id: String(operation.id || `operation-${Date.now()}-${index}`), documentId: String(operation.documentId || ''), action: ['patch', 'replace', 'delete', 'create', 'review', 'fact'].includes(operation.action) ? operation.action : 'review', title: String(operation.title || 'Operación del Constructor Global'), reason: String(operation.reason || ''), originalText: String(operation.originalText || ''), replacementText: toPlainText(operation.replacementText || ''), anchor: String(operation.anchor || ''), dependencies: Array.isArray(operation.dependencies) ? operation.dependencies.map(String) : [], expectedResult: String(operation.expectedResult || ''), risk: ['low', 'medium', 'high'].includes(operation.risk) ? operation.risk : 'medium', status: 'pending',
    })) : [];
    return { summary: String(result.summary || 'Plan listo para revisar.'), operations };
};

export const requestMissionVerification = async ({ profile, mission, documents, operations }) => {
    const prompt = buildRegisteredPrompt('globalVerification', { mission, operations, documents });
    const result = await structuredCall({ profile, prompt, schema: VERIFICATION_TOOL, temperature: 0.05, max_tokens: 6000 });
    return { passed: Boolean(result.passed), summary: String(result.summary || ''), findings: Array.isArray(result.findings) ? result.findings : [], pendingReview: Array.isArray(result.pendingReview) ? result.pendingReview.map(String) : [] };
};
