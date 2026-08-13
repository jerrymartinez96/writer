import { AIService } from '../AIService';

export const REQUEST_PLAN_DEFAULT = {
    intent: 'chat',
    operation: 'answer',
    actionId: 'chat',
    scope: 'unknown',
    risk: 'low',
    requiresReading: false,
    requiresClarification: false,
    clarificationQuestion: '',
    targetHints: [],
    affectedDocumentHints: [],
    confidence: 0,
    reason: '',
};

const ACTION_IDS = new Set(['chat', 'escribir', 'fragmento', 'escena', 'analizar', 'sugerir', 'formatear', 'constructor_personaje']);
const SCOPES = new Set(['unknown', 'single_fragment', 'single_document', 'multiple_documents', 'entity_group', 'global_continuity', 'creation']);
const RISKS = new Set(['low', 'medium', 'high']);

const extractJson = (value) => {
    if (!value) return null;
    const text = String(value).trim();
    try { return JSON.parse(text); } catch { /* buscar objeto envuelto */ }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last <= first) return null;
    try { return JSON.parse(text.substring(first, last + 1)); } catch { return null; }
};

const normalizePlan = (raw, forcedAction = null, allowedActionIds = []) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const allowed = new Set([...ACTION_IDS, ...allowedActionIds]);
    const actionId = forcedAction || (allowed.has(source.actionId) ? source.actionId : REQUEST_PLAN_DEFAULT.actionId);
    // Una sugerencia no puede conservar metadatos de edición que el modelo
    // haya mezclado por error. Es una operación de lectura, sin parches.
    const isNonMutatingAction = actionId === 'sugerir' || actionId === 'analizar';
    const scope = isNonMutatingAction ? 'unknown' : (SCOPES.has(source.scope) ? source.scope : REQUEST_PLAN_DEFAULT.scope);
    const risk = isNonMutatingAction ? 'low' : (RISKS.has(source.risk) ? source.risk : (scope === 'multiple_documents' || scope === 'entity_group' ? 'high' : REQUEST_PLAN_DEFAULT.risk));
    const requiresClarification = isNonMutatingAction ? false : Boolean(source.requiresClarification || source.requires_clarification);
    const targetHints = Array.isArray(source.targetHints) ? source.targetHints.filter(Boolean).slice(0, 20) : [];
    const affectedDocumentHints = Array.isArray(source.affectedDocumentHints)
        ? source.affectedDocumentHints.filter(Boolean).slice(0, 20)
        : [];

    return {
        ...REQUEST_PLAN_DEFAULT,
        ...source,
        actionId,
        intent: actionId === 'sugerir' ? 'suggest' : actionId === 'analizar' ? 'analyze' : source.intent,
        operation: actionId === 'sugerir' ? 'suggest' : actionId === 'analizar' ? 'analyze' : source.operation,
        scope,
        risk,
        requiresReading: Boolean(source.requiresReading ?? source.requires_reading),
        requiresClarification,
        clarificationQuestion: requiresClarification ? String(source.clarificationQuestion || source.clarification_question || '').trim() : '',
        targetHints,
        affectedDocumentHints,
        confidence: Number.isFinite(Number(source.confidence)) ? Math.max(0, Math.min(1, Number(source.confidence))) : 0,
        reason: String(source.reason || '').trim(),
    };
};

/**
 * Decide qué operación necesita una solicitud antes de iniciar el streaming
 * principal. Esta llamada no modifica documentos ni usa herramientas.
 */
export const planRequest = async ({ userText, apiKey, modelId, actions = [], forcedAction = null, bookContext = '', availableDocuments = [] }) => {
    if (!apiKey || !userText) return { ...REQUEST_PLAN_DEFAULT, actionId: forcedAction || 'chat' };

    const actionText = actions.map(a => `- ${a.id}: ${a.description || a.label || ''}`).join('\n');
    const documentText = availableDocuments.slice(0, 100).map(d => `- ${d.id || ''} | ${d.title || d.name || ''}`).join('\n');
    const systemPrompt = `Eres el planificador de operaciones de una aplicación de escritura.
Tu única tarea es interpretar la solicitud y devolver un plan JSON. No respondas al escritor, no uses herramientas y no inventes contenido.

ACCIONES DISPONIBLES:
${actionText}

ALCANCES VÁLIDOS:
- single_fragment: el escritor proporcionó o seleccionó un fragmento concreto.
- single_document: afecta un solo documento, aunque haya que leerlo.
- multiple_documents: afecta varios documentos explícitos.
- entity_group: afecta un grupo de personajes, lugares o elementos.
- global_continuity: un dato debe mantenerse coherente en toda la obra.
- creation: crear contenido nuevo.
- unknown: no se puede determinar todavía.

REGLAS:
- Si el escritor pregunta qué opinas, propone una posibilidad o usa expresiones como “qué te parece”, “podemos”, “quizá”, “tal vez” o “no sé”, es una consulta creativa: usa actionId sugerir o analizar y NUNCA propongas parches ni modifiques documentos.
- Una petición de editar edades, fechas, nombres, relaciones, parentescos, reglas o continuidad tiene riesgo high.
- “Las elfas”, “la menor”, “todos los personajes” o “cada ficha” indican entity_group o global_continuity, no single_fragment.
- requiresClarification debe ser true si no puedes saber qué entidad o documento modificar con la información disponible.
- requiresReading debe ser true si necesitas consultar el contenido actual antes de proponer cambios.
- No marques requiresClarification como true solo porque aún no has leído; eso corresponde a requiresReading.
- Si el escritor pide formatear, actionId debe ser formatear y operation debe ser format_with_ai.
- Si el escritor pide analizar sin modificar, actionId debe ser analizar.

Devuelve exclusivamente JSON con esta forma:
{
  "intent": "answer|analyze|modify|create|suggest|format",
  "operation": "answer|analyze|propose_patch|continuity_update|create_content|format_with_ai",
  "actionId": "${forcedAction || 'chat'}",
  "scope": "unknown|single_fragment|single_document|multiple_documents|entity_group|global_continuity|creation",
  "risk": "low|medium|high",
  "requiresReading": true,
  "requiresClarification": false,
  "clarificationQuestion": "",
  "targetHints": [],
  "affectedDocumentHints": [],
  "confidence": 0.0,
  "reason": ""
}`;

    const userPrompt = `CONTEXTO DE LA OBRA:\n${bookContext || '[no disponible]'}\n\nDOCUMENTOS DISPONIBLES:\n${documentText || '[no disponible]'}\n\nSOLICITUD:\n"""\n${userText}\n"""`;
    try {
        const response = await AIService.sendDeepSeekMessage(
            [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            apiKey,
            modelId,
            { temperature: 0, max_tokens: 600, enableTools: false }
        );
        return normalizePlan(extractJson(response), forcedAction, actions.map(a => a.id).filter(Boolean));
    } catch (error) {
        console.warn('[RequestPlanner] No se pudo crear el plan:', error?.message);
        return { ...REQUEST_PLAN_DEFAULT, actionId: forcedAction || 'chat', reason: 'planner_unavailable' };
    }
};

export default { planRequest, REQUEST_PLAN_DEFAULT };
