import { CORE_CAPABILITIES } from './CoreCapabilities';
import { getToolDefinition } from './ToolCatalog';

const normalize = (value = '') => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, terms) => terms.some((term) => text.includes(term));

const ROUTE_RULES = [
    {
        toolId: 'characters',
        terms: ['crear personaje', 'nuevo personaje', 'ficha de personaje', 'personalidad', 'psicologia', 'psicología', 'arco narrativo', 'miedo al abandono', 'motivacion', 'motivación'],
        capability: 'character_development',
        reason: 'La solicitud requiere una ficha, psicología o evolución estructurada de personaje.',
    },
    {
        toolId: 'cowriter',
        terms: ['reescribe el capitulo', 'reescribir el capitulo', 'reescribe la escena', 'escribe la escena', 'continua la escena', 'continúa la escena', 'trabaja el capitulo', 'trabaja el capítulo', 'coescribe'],
        capability: 'chapter_writing',
        reason: 'La solicitud requiere un proceso de escritura o edición con objetivo narrativo.',
    },
    {
        toolId: 'world',
        terms: ['construye el mundo', 'construir el mundo', 'crea una ciudad', 'crea una cultura', 'reglas del mundo', 'cronologia', 'cronología', 'faccion', 'facción', 'lore profundo'],
        capability: 'world_development',
        reason: 'La solicitud requiere entidades, reglas o relaciones estructuradas del mundo.',
    },
    {
        toolId: 'narrator',
        terms: ['narra el capitulo', 'narra el capítulo', 'narrar el capitulo', 'narrar el capítulo', 'voz para el capitulo', 'audio del capitulo', 'audio del capítulo'],
        capability: 'narration',
        reason: 'La solicitud requiere preparar o reproducir audio narrativo.',
    },
    {
        toolId: 'coherence',
        terms: ['audita el lore', 'auditar el lore', 'revisa toda la continuidad', 'revisar toda la continuidad', 'contradicciones de toda la obra', 'auditoria completa', 'auditoría completa', 'conflictos entre documentos'],
        capability: 'continuity_audit',
        reason: 'La solicitud requiere una auditoría cruzada de varios documentos.',
    },
];

const looksLikeMultiPatch = (text) => {
    const multiTerms = ['todos los capitulos', 'todos los capítulos', 'varios capitulos', 'varios capítulos', 'en cada documento', 'en todos los documentos', 'en varios documentos', 'todos los personajes'];
    return includesAny(text, multiTerms) || (text.match(/\b(capitulo|capítulo|documento|personaje)s?\b/g) || []).length > 1;
};

const hasPreservedConstraint = (text) => includesAny(text, [
    'sin cambiar ',
    'sin modificar ',
    'sin alterar ',
    'no cambies ',
    'no modificar ',
    'manteniendo ',
    'mantener intacto',
    'conservar ',
]);

const looksLikePatch = (text) => !hasPreservedConstraint(text) && includesAny(text, ['cambia ', 'cambiar ', 'corrige ', 'corregir ', 'reemplaza ', 'reemplazar ', 'actualiza ', 'actualizar ', 'modifica ', 'modificar ']);
const looksLikeAnalysis = (text) => includesAny(text, ['analiza', 'analizar', 'revisa', 'revisar', 'audita', 'auditar', 'detecta', 'detectar', 'evalua', 'evalúa']);
const looksLikeSuggestion = (text) => includesAny(text, ['sugiere', 'sugerir', 'dame ideas', 'propone', 'proponer', 'que te parece', 'qué te parece', 'quizas', 'quizá']);

/**
 * Clasifica sin llamar al modelo. Esta primera versión es deliberadamente
 * conservadora: si no hay una señal fuerte, mantiene la petición en el Core.
 */
export const classifyCoreRequest = (envelope) => {
    const text = normalize(envelope?.userMessage);
    if (!text) return { route: 'core', capability: CORE_CAPABILITIES.CHAT, toolId: null, confidence: 1, needsConfirmation: false, reason: 'No hay una instrucción para clasificar.' };

    const coherenceRule = ROUTE_RULES.find((rule) => rule.toolId === 'coherence');
    const specialized = (coherenceRule && includesAny(text, coherenceRule.terms))
        ? coherenceRule
        : ROUTE_RULES.find((rule) => includesAny(text, rule.terms));
    if (specialized && !looksLikePatch(text)) {
        const tool = getToolDefinition(specialized.toolId);
        return {
            route: 'toolroom',
            capability: specialized.capability,
            toolId: specialized.toolId,
            confidence: 0.88,
            needsConfirmation: true,
            reason: specialized.reason,
            toolName: tool?.name || specialized.toolId,
        };
    }

    if (looksLikePatch(text)) {
        const multi = looksLikeMultiPatch(text);
        return {
            route: 'core',
            capability: multi ? CORE_CAPABILITIES.MULTI_PATCH : CORE_CAPABILITIES.PATCH,
            toolId: null,
            confidence: multi ? 0.9 : 0.86,
            needsConfirmation: true,
            reason: multi ? 'La solicitud parece afectar varios documentos o ubicaciones.' : 'La solicitud parece ser una modificación puntual.',
        };
    }

    if (looksLikeAnalysis(text)) return { route: 'core', capability: CORE_CAPABILITIES.ANALYZE, toolId: null, confidence: 0.82, needsConfirmation: false, reason: 'La solicitud pide una revisión sin indicar cambios.' };
    if (looksLikeSuggestion(text)) return { route: 'core', capability: CORE_CAPABILITIES.CHAT, toolId: null, confidence: 0.8, needsConfirmation: false, reason: 'La solicitud pide ideas o posibilidades creativas.' };
    return { route: 'core', capability: CORE_CAPABILITIES.CHAT, toolId: null, confidence: 0.7, needsConfirmation: false, reason: 'No se detectó una operación especializada segura.' };
};

export default classifyCoreRequest;
