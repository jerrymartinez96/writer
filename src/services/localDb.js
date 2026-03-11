import Dexie from 'dexie';
import { compressData, decompressData } from './compression';

export const localDb = new Dexie('WriterLocalDB');

// ... (schema stays same)
localDb.version(1).stores({
    lightweightBackups: '++id, chapterId, createdAt, expiresAt'
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
