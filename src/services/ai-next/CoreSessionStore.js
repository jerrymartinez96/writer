const STORAGE_KEY_PREFIX = 'ia_studio_sessions';
const MAX_SESSIONS = 10;

let currentBookId = null;

const getStoreKey = () => currentBookId ? `${STORAGE_KEY_PREFIX}_${currentBookId}` : STORAGE_KEY_PREFIX;

const readStore = () => {
    try {
        const raw = window.localStorage.getItem(getStoreKey());
        if (!raw) return { activeSessionId: null, sessions: [] };
        return JSON.parse(raw);
    } catch (error) {
        console.warn('[CoreSessionStore] No se pudieron leer las sesiones:', error);
        return { activeSessionId: null, sessions: [] };
    }
};

const writeStore = (store) => {
    try {
        const nextStore = { ...store, sessions: store.sessions.slice(-MAX_SESSIONS) };
        window.localStorage.setItem(getStoreKey(), JSON.stringify(nextStore));
    } catch (error) {
        console.warn('[CoreSessionStore] No se pudieron guardar las sesiones:', error);
    }
};

const emptyContext = { chapterIds: [], worldItemIds: [], characterIds: [] };
const emptyDestination = { mode: 'auto', docId: null, docType: 'chapter', docTitle: '' };

export const setBookId = (bookId) => { currentBookId = bookId; };

export const getSessions = () => readStore().sessions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

export const getSession = (sessionId) => readStore().sessions.find((session) => session.id === sessionId) || null;

export const getActiveSession = () => {
    const store = readStore();
    return store.sessions.find((session) => session.id === store.activeSessionId) || null;
};

export const createSession = (contextSelections = emptyContext, destinationDoc = emptyDestination) => {
    const store = readStore();
    const now = Date.now();
    const session = {
        id: `sess_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: `Conversación ${store.sessions.length + 1}`,
        createdAt: now,
        updatedAt: now,
        contextSelections: contextSelections || emptyContext,
        destinationDoc: destinationDoc || emptyDestination,
        messages: [],
        cumulativeUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
    };
    writeStore({ ...store, activeSessionId: session.id, sessions: [...store.sessions, session] });
    return session;
};

export const setActiveSession = (sessionId) => {
    const store = readStore();
    if (store.sessions.some((session) => session.id === sessionId)) writeStore({ ...store, activeSessionId: sessionId });
};

const updateSession = (sessionId, patch) => {
    const store = readStore();
    const sessions = store.sessions.map((session) => session.id === sessionId ? { ...session, ...patch, updatedAt: Date.now() } : session);
    writeStore({ ...store, sessions });
};

export const updateSessionContext = (sessionId, contextSelections) => updateSession(sessionId, { contextSelections });
export const updateSessionDestination = (sessionId, destinationDoc) => updateSession(sessionId, { destinationDoc });
export const renameSession = (sessionId, name) => updateSession(sessionId, { name });

export const deleteSession = (sessionId) => {
    const store = readStore();
    const sessions = store.sessions.filter((session) => session.id !== sessionId);
    const activeSessionId = store.activeSessionId === sessionId ? sessions.at(-1)?.id || null : store.activeSessionId;
    writeStore({ ...store, activeSessionId, sessions });
};

export const addMessage = (sessionId, message) => {
    const session = getSession(sessionId);
    if (!session) return;
    updateSession(sessionId, { messages: [...(session.messages || []), { ...message, timestamp: message.timestamp || Date.now() }] });
};

export const deleteMessage = (sessionId, messageId) => {
    const session = getSession(sessionId);
    if (session) updateSession(sessionId, { messages: (session.messages || []).filter((message) => message.id !== messageId) });
};

export default { setBookId, getSessions, getSession, getActiveSession, createSession, setActiveSession, updateSessionContext, updateSessionDestination, renameSession, deleteSession, addMessage, deleteMessage };
