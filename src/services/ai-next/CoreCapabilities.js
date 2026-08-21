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
