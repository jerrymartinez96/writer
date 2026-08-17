const HISTORY_PREFIX = 'verne-global-mission-history-v1';
const getKey = (bookId) => `${HISTORY_PREFIX}:${bookId || 'no-book'}`;

export const loadMissionHistory = (bookId) => {
    try {
        const raw = window.localStorage.getItem(getKey(bookId));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const saveMissionHistoryEntry = (bookId, entry) => {
    const current = loadMissionHistory(bookId);
    const nextEntry = { ...entry, id: entry.id || `mission-history-${Date.now()}`, updatedAt: new Date().toISOString() };
    const next = [nextEntry, ...current.filter((item) => item.id !== nextEntry.id)].slice(0, 30);
    try { window.localStorage.setItem(getKey(bookId), JSON.stringify(next)); } catch { /* best effort */ }
    return next;
};

export const updateMissionHistoryEntry = (bookId, entryId, patch) => {
    const current = loadMissionHistory(bookId);
    return saveMissionHistoryEntry(bookId, { ...(current.find((item) => item.id === entryId) || { id: entryId }), ...patch });
};

