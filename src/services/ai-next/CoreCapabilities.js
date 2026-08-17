/**
 * Capacidades permitidas en el Core de IA Studio.
 * El Core debe mantenerse pequeño: conversa, analiza y prepara operaciones
 * seguras; los procesos creativos especializados viven en Tool Rooms.
 */
export const CORE_CAPABILITIES = Object.freeze({
    CHAT: 'chat',
    ANALYZE: 'analyze',
    PATCH: 'patch',
    MULTI_PATCH: 'multi_patch',
});

export const CORE_CAPABILITY_CATALOG = Object.freeze([
    {
        id: CORE_CAPABILITIES.CHAT,
        label: 'Conversar',
        description: 'Preguntas, explicaciones e ideas sin modificar documentos.',
        canModify: false,
        requiresApproval: false,
    },
    {
        id: CORE_CAPABILITIES.ANALYZE,
        label: 'Analizar',
        description: 'Análisis de texto, estilo, estructura o continuidad sin cambios.',
        canModify: false,
        requiresApproval: false,
    },
    {
        id: CORE_CAPABILITIES.PATCH,
        label: 'Edición directa',
        description: 'Corrección puntual en un documento con vista previa.',
        canModify: true,
        requiresApproval: true,
    },
    {
        id: CORE_CAPABILITIES.MULTI_PATCH,
        label: 'Edición coordinada',
        description: 'Cambios coordinados de bajo riesgo con vista previa.',
        canModify: true,
        requiresApproval: true,
    },
]);

export const getCoreCapability = (id) => CORE_CAPABILITY_CATALOG.find((capability) => capability.id === id) || null;
