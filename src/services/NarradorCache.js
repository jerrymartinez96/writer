/**
 * NarradorCache — Cachea el audio PCM generado por Gemini Live en IndexedDB
 * usando hash del texto para invalidación automática por edición del capítulo.
 */
import Dexie from 'dexie';

const DB_NAME = 'narrador_cache_db';
const DB_VERSION = 1;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

let db = null;

const getDb = () => {
    if (db) return Promise.resolve(db);
    db = new Dexie(DB_NAME);
    db.version(DB_VERSION).stores({
        segments: 'key, bookId, chapterId, textHash, timestamp'
    });
    return Promise.resolve(db);
};

/**
 * Obtiene un segmento cacheado si el hash coincide.
 * @param {string} bookId
 * @param {string} chapterId
 * @param {number} segmentIndex
 * @param {string} textHash - Hash del texto actual para invalidación
 * @returns {Promise<{pcmData: ArrayBuffer, textHash: string} | null>}
 */
export const getCachedSegment = async (bookId, chapterId, segmentIndex, textHash, variantKey = 'default') => {
    try {
        const d = await getDb();
        const key = `${bookId}_${chapterId}_${segmentIndex}`;
        const entry = await d.segments.get(key);
        if (!entry) return null;

        // Invalidar por hash de texto (el texto del segmento cambió)
        if (entry.textHash !== textHash || (entry.variantKey || 'default') !== variantKey) return null;

        // Invalidar por TTL
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            await d.segments.delete(key);
            return null;
        }

        return { pcmData: entry.pcmData, textHash: entry.textHash };
    } catch (err) {
        console.warn('[NarradorCache] getCachedSegment error:', err);
        return null;
    }
};

/** Elimina únicamente la versión cacheada de un segmento. */
export const invalidateCachedSegment = async (bookId, chapterId, segmentIndex) => {
    try {
        const d = await getDb();
        await d.segments.delete(`${bookId}_${chapterId}_${segmentIndex}`);
        return true;
    } catch (err) {
        console.warn('[NarradorCache] invalidate error:', err);
        return false;
    }
};

/**
 * Guarda un segmento en caché.
 */
export const saveCachedSegment = async (bookId, chapterId, segmentIndex, textHash, pcmData, variantKey = 'default') => {
    try {
        const d = await getDb();
        const key = `${bookId}_${chapterId}_${segmentIndex}`;
        await d.segments.put({
            key,
            bookId,
            chapterId,
            segmentIndex,
            textHash,
            variantKey,
            pcmData,
            timestamp: Date.now()
        });
    } catch (err) {
        // En modo incógnito o con IndexedDB bloqueado, falla silenciosamente
        console.warn('[NarradorCache] saveCachedSegment error:', err);
    }
};

/**
 * Limpia la caché de narración completa o solo de un capítulo.
 */
export const clearNarradorCache = async (bookId, chapterId) => {
    try {
        const d = await getDb();
        if (bookId && chapterId) {
            await d.segments.where('chapterId').equals(chapterId).delete();
        } else if (bookId) {
            await d.segments.where('bookId').equals(bookId).delete();
        } else {
            await d.segments.clear();
        }
        return true;
    } catch (err) {
        console.warn('[NarradorCache] clear error:', err);
        return false;
    }
};

/**
 * Calcula el tamaño total de la caché en bytes (para mostrar al usuario).
 */
export const getNarradorCacheSize = async () => {
    try {
        const d = await getDb();
        const all = await d.segments.toArray();
        const totalBytes = all.reduce((sum, e) => sum + (e.pcmData?.byteLength || 0), 0);
        return {
            entries: all.length,
            bytes: totalBytes
        };
    } catch (err) {
        console.warn('[NarradorCache] size error:', err);
        return { entries: 0, bytes: 0 };
    }
};

export default {
    getCachedSegment,
    saveCachedSegment,
    invalidateCachedSegment,
    clearNarradorCache,
    getNarradorCacheSize
};
