import Dexie from 'dexie';
import { compressData, decompressData } from './compression';

export const localDb = new Dexie('WriterLocalDB');

export const getLocalSnapshotKey = (bookId, documentId) => `${bookId || 'legacy'}:${documentId}`;

// ... (schema stays same)
localDb.version(1).stores({
    lightweightBackups: '++id, chapterId, createdAt, expiresAt'
});

localDb.version(2).stores({
    lightweightBackups: '++id, chapterId, createdAt, expiresAt',
    snapshots: '++id, documentId, createdAt, triggerType'
});

/**
 * Saves a new local checkpoint (snapshot) for a document.
 * Automatically limits the history to the newest 120 versions to avoid bloat.
 */
export const saveLocalSnapshot = async (documentId, content, triggerType = 'auto') => {
    try {
        const now = Date.now();
        
        // 1. Get existing snapshots for this document
        const existing = await localDb.snapshots
            .where('documentId')
            .equals(documentId)
            .sortBy('createdAt');

        // Los guardados automáticos no deben llenar el historial con copias idénticas.
        // Los manuales sí se conservan porque representan una decisión explícita del usuario.
        if (triggerType !== 'manual' && existing.length > 0) {
            const latest = existing[existing.length - 1];
            const latestContent = decompressData(latest.content);
            if (latestContent === content) return false;
        }

        // 2. Keep only the last 119 snapshots (so the new one makes 120)
        if (existing.length >= 120) {
            const toDelete = existing.slice(0, existing.length - 119);
            const idsToDelete = toDelete.map(s => s.id);
            await localDb.snapshots.bulkDelete(idsToDelete);
        }

        // 3. Save compressed new snapshot
        await localDb.snapshots.add({
            documentId,
            content: compressData(content),
            createdAt: now,
            triggerType
        });
        return true;
    } catch (error) {
        console.error('Error saving local snapshot to IndexedDB:', error);
    }
};

/**
 * Retrieves all local checkpoints for a document, sorted by newest first.
 */
export const getLocalSnapshots = async (documentId) => {
    try {
        const snapshots = await localDb.snapshots
            .where('documentId')
            .equals(documentId)
            .reverse()
            .sortBy('createdAt');

        return snapshots.map(s => ({
            id: s.id,
            documentId: s.documentId,
            content: decompressData(s.content),
            createdAt: s.createdAt,
            triggerType: s.triggerType || 'auto'
        }));
    } catch (error) {
        console.error('Error getting local snapshots from IndexedDB:', error);
        return [];
    }
};

/**
 * Deletes a single local checkpoint from IndexedDB by its ID.
 */
export const deleteLocalSnapshot = async (snapshotId) => {
    try {
        await localDb.snapshots.delete(snapshotId);
    } catch (error) {
        console.error('Error deleting local snapshot from IndexedDB:', error);
    }
};

/**
 * Deletes all local checkpoints for a specific document.
 */
export const deleteAllLocalSnapshots = async (documentId) => {
    try {
        await localDb.snapshots
            .where('documentId')
            .equals(documentId)
            .delete();
    } catch (error) {
        console.error('Error deleting local snapshots:', error);
    }
};
