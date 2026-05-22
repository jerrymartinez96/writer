/**
 * IAStudioSessionManager.js
 * Gestión de sesiones de IA Studio en localStorage.
 * Cada sesión guarda: contexto seleccionado, destino, mensajes e historial.
 */

const STORAGE_KEY = 'ia_studio_sessions';
const MAX_SESSIONS = 10;

/**
 * Obtiene el objeto completo de sesiones del localStorage
 */
const getStore = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            const defaultStore = { activeSessionId: null, sessions: [] };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultStore));
            return defaultStore;
        }
        return JSON.parse(raw);
    } catch (e) {
        console.warn('[IAStudioSessionManager] Error reading store:', e);
        return { activeSessionId: null, sessions: [] };
    }
};

/**
 * Guarda el objeto completo de sesiones en localStorage
 */
const saveStore = (store) => {
    try {
        // Trim to max sessions
        if (store.sessions.length > MAX_SESSIONS) {
            store.sessions = store.sessions.slice(-MAX_SESSIONS);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
        console.warn('[IAStudioSessionManager] Error saving store:', e);
    }
};

/**
 * Genera un ID único para sesiones
 */
const generateId = () => {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
};

/**
 * Obtiene un nombre por defecto para una nueva sesión
 */
const generateDefaultName = (index) => {
    return `Conversación ${index + 1}`;
};

/**
 * Crea una nueva sesión vacía
 * @param {Object} initialContext - Contexto inicial (opcional)
 * @param {Object} initialDestination - Destino inicial (opcional)
 * @returns {Object} la sesión creada
 */
export const createSession = (initialContext = null, initialDestination = null) => {
    const store = getStore();
    const newSession = {
        id: generateId(),
        name: generateDefaultName(store.sessions.length),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        contextSelections: initialContext || {
            chapterIds: [],
            worldItemIds: [],
        },
        destinationDoc: initialDestination || {
            mode: 'auto',        // 'auto' | 'manual' | 'new'
            docId: null,
            docType: 'chapter',  // 'chapter' | 'worldItem'
            docTitle: '',
        },
        messages: [],
    };

    store.sessions.push(newSession);
    store.activeSessionId = newSession.id;
    saveStore(store);
    return newSession;
};

/**
 * Elimina una sesión por ID
 */
export const deleteSession = (sessionId) => {
    const store = getStore();
    store.sessions = store.sessions.filter(s => s.id !== sessionId);
    if (store.activeSessionId === sessionId) {
        store.activeSessionId = store.sessions.length > 0 ? store.sessions[store.sessions.length - 1].id : null;
    }
    saveStore(store);
};

/**
 * Renombra una sesión
 */
export const renameSession = (sessionId, newName) => {
    const store = getStore();
    const session = store.sessions.find(s => s.id === sessionId);
    if (session) {
        session.name = newName;
        session.updatedAt = Date.now();
        saveStore(store);
    }
};

/**
 * Obtiene todas las sesiones
 */
export const getSessions = () => {
    const store = getStore();
    // Ordenar por updatedAt descendente
    return store.sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
};

/**
 * Obtiene una sesión por ID
 */
export const getSession = (sessionId) => {
    const store = getStore();
    return store.sessions.find(s => s.id === sessionId) || null;
};

/**
 * Obtiene la sesión activa
 */
export const getActiveSession = () => {
    const store = getStore();
    if (!store.activeSessionId) return null;
    return store.sessions.find(s => s.id === store.activeSessionId) || null;
};

/**
 * Establece la sesión activa
 */
export const setActiveSession = (sessionId) => {
    const store = getStore();
    if (store.sessions.find(s => s.id === sessionId)) {
        store.activeSessionId = sessionId;
        saveStore(store);
    }
};

/**
 * Actualiza el contexto seleccionado de una sesión
 */
export const updateSessionContext = (sessionId, contextSelections) => {
    const store = getStore();
    const session = store.sessions.find(s => s.id === sessionId);
    if (session) {
        session.contextSelections = contextSelections;
        session.updatedAt = Date.now();
        saveStore(store);
    }
};

/**
 * Actualiza el destino del documento de una sesión
 */
export const updateSessionDestination = (sessionId, destinationDoc) => {
    const store = getStore();
    const session = store.sessions.find(s => s.id === sessionId);
    if (session) {
        session.destinationDoc = destinationDoc;
        session.updatedAt = Date.now();
        saveStore(store);
    }
};

/**
 * Agrega un mensaje a la sesión activa
 */
export const addMessage = (sessionId, message) => {
    const store = getStore();
    const session = store.sessions.find(s => s.id === sessionId);
    if (session) {
        session.messages.push({
            ...message,
            id: message.id || 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
            timestamp: message.timestamp || Date.now(),
        });
        session.updatedAt = Date.now();
        saveStore(store);
    }
};

/**
 * Actualiza el último mensaje (para streaming)
 */
export const updateLastAssistantMessage = (sessionId, partialContent, isComplete = false) => {
    const store = getStore();
    const session = store.sessions.find(s => s.id === sessionId);
    if (session && session.messages.length > 0) {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.role === 'assistant') {
            lastMsg.content = partialContent;
            if (isComplete) lastMsg.isStreaming = false;
            session.updatedAt = Date.now();
            saveStore(store);
        }
    }
};

/**
 * Exporta una sesión como texto plano
 */
export const exportSessionAsText = (sessionId) => {
    const session = getSession(sessionId);
    if (!session) return '';

    const lines = [];
    lines.push(`=== IA Studio - ${session.name} ===`);
    lines.push(`Fecha: ${new Date(session.createdAt).toLocaleDateString()}`);
    lines.push('');
    lines.push('--- Contexto ---');
    if (session.contextSelections?.chapterIds?.length) {
        lines.push(`Capítulos seleccionados: ${session.contextSelections.chapterIds.length}`);
    }
    if (session.contextSelections?.worldItemIds?.length) {
        lines.push(`Master Docs seleccionados: ${session.contextSelections.worldItemIds.length}`);
    }
    const dest = session.destinationDoc;
    lines.push(`Destino: ${dest.mode === 'auto' ? 'Automático' : dest.mode === 'manual' ? dest.docTitle || 'Manual' : 'Nuevo documento'}`);
    lines.push('');
    lines.push('--- Conversación ---');
    lines.push('');

    session.messages.forEach(msg => {
        const role = msg.role === 'user' ? '👤 Tú' : '🤖 IA';
        const cleanContent = msg.content?.replace(/<[^>]*>/g, '') || '';
        lines.push(`${role}:`);
        lines.push(cleanContent);
        lines.push('');
    });

    return lines.join('\n');
};

/**
 * Elimina los últimos dos mensajes de una sesión (para regenerar)
 */
export const deleteLastTwoMessages = (sessionId) => {
    const store = getStore();
    const session = store.sessions.find(s => s.id === sessionId);
    if (session && session.messages.length >= 2) {
        session.messages = session.messages.slice(0, -2);
        session.updatedAt = Date.now();
        saveStore(store);
    }
};

/**
 * Obtiene el conteo de sesiones activas
 */
export const getActiveSessionCount = () => {
    return getSessions().length;
};

/**
 * Verifica si hay sesiones guardadas
 */
export const hasSessions = () => {
    return getSessions().length > 0;
};

export default {
    createSession,
    deleteSession,
    renameSession,
    getSessions,
    getSession,
    getActiveSession,
    setActiveSession,
    updateSessionContext,
    updateSessionDestination,
    addMessage,
    updateLastAssistantMessage,
    deleteLastTwoMessages,
    exportSessionAsText,
    getActiveSessionCount,
    hasSessions,
};
