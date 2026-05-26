import Dexie from 'dexie';
import { compressData, decompressData } from './compression';

export const localDb = new Dexie('WriterLocalDB');

// ... (schema stays same)
localDb.version(1).stores({
    lightweightBackups: '++id, chapterId, createdAt, expiresAt'
});

localDb.version(2).stores({
    lightweightBackups: '++id, chapterId, createdAt, expiresAt',
    snapshots: '++id, documentId, createdAt, triggerType'
});

/**
 * Saves a new lightweight backup for a chapter.
 */
export const saveLightweightBackup = async (chapterId, content) => {
    const now = Date.now();
    const expiresAt = now + (2 * 60 * 60 * 1000); // 2 hours from now

    try {
        await localDb.lightweightBackups.add({
            chapterId,
            content: compressData(content),
            createdAt: now,
            expiresAt
        });

        // ... (rest of cleanup logic)
        const backups = await localDb.lightweightBackups
            .where('chapterId')
            .equals(chapterId)
            .sortBy('createdAt');

        if (backups.length > 30) {
            const toDelete = backups.slice(0, backups.length - 30);
            const idsToDelete = toDelete.map(b => b.id);
            await localDb.lightweightBackups.bulkDelete(idsToDelete);
        }

        await localDb.lightweightBackups
            .where('expiresAt')
            .below(now)
            .delete();

    } catch (error) {
        console.error('Error saving lightweight backup to IndexedDB:', error);
    }
};

/**
 * Retrieves lightweight backups for a chapter, sorted by newest first.
 */
export const getLightweightBackups = async (chapterId) => {
    try {
        const backups = await localDb.lightweightBackups
            .where('chapterId')
            .equals(chapterId)
            .reverse()
            .sortBy('createdAt');
        
        return backups.map(b => ({
            ...b,
            content: decompressData(b.content)
        }));
    } catch (error) {
        console.error('Error getting lightweight backups from IndexedDB:', error);
        return [];
    }
};

/**
 * Clears all lightweight backups for a specific chapter (used when "Finalizado").
 * @param {string} chapterId 
 */
export const clearChapterLightweightBackups = async (chapterId) => {
    try {
        await localDb.lightweightBackups
            .where('chapterId')
            .equals(chapterId)
            .delete();
    } catch (error) {
        console.error('Error clearing lightweight backups:', error);
    }
};

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
