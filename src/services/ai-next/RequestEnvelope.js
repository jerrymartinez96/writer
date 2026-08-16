export const REQUEST_SOURCES = Object.freeze({
    CORE_CHAT: 'core_chat',
    TOOL_ROOM: 'tool_room',
    SYSTEM: 'system',
});

export const createRequestEnvelope = ({
    userMessage = '',
    source = REQUEST_SOURCES.CORE_CHAT,
    activeBookId = null,
    context = {},
    sessionId = null,
    requestedCapability = null,
    metadata = {},
} = {}) => ({
    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    userMessage: String(userMessage || '').trim(),
    activeBookId,
    context: {
        chapterIds: (context || {}).chapterIds || [],
        worldItemIds: (context || {}).worldItemIds || [],
        characterIds: (context || {}).characterIds || [],
        selectedText: (context || {}).selectedText || null,
        destination: (context || {}).destination || null,
    },
    sessionId,
    requestedCapability,
    metadata,
    createdAt: new Date().toISOString(),
});
