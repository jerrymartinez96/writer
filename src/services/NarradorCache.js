/**
 * NarradorCache — Cachea el audio PCM generado por Gemini Live en IndexedDB
 * usando hash del texto para invalidación automática por edición del capítulo.
 */
import Dexie from 'dexie';

const DB_NAME = 'narrador_cache_db';
const DB_VERSION = 2;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

let db = null;

const getDb = () => {
    if (db) return Promise.resolve(db);
    db = new Dexie(DB_NAME);
    db.version(1).stores({
        segments: 'key, bookId, chapterId, textHash, timestamp'
    });
    db.version(DB_VERSION).stores({
        segments: 'key, bookId, chapterId, textHash, variantKey, timestamp',
        permanentSegments: 'key, bookId, chapterId, textHash, variantKey, timestamp',
        settings: 'key'
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
        const permanent = await d.permanentSegments.get(key);
        if (permanent && permanent.textHash === textHash && (permanent.variantKey || 'default') === variantKey) {
            return { pcmData: permanent.pcmData, textHash: permanent.textHash, permanent: true };
        }
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

export const savePermanentSegment = async (bookId, chapterId, segmentIndex, textHash, pcmData, variantKey = 'default') => {
    try {
        const d = await getDb();
        const key = `${bookId}_${chapterId}_${segmentIndex}`;
        await d.permanentSegments.put({ key, bookId, chapterId, segmentIndex, textHash, variantKey, pcmData, timestamp: Date.now() });
        return true;
    } catch (err) {
        console.warn('[NarradorCache] savePermanentSegment error:', err);
        return false;
    }
};

export const getNarradorStorageSettings = async () => {
    try {
        const d = await getDb();
        return (await d.settings.get('storage')) || { keepPermanent: false, folderName: '' };
    } catch (err) {
        console.warn('[NarradorCache] get storage settings error:', err);
        return { keepPermanent: false, folderName: '' };
    }
};

export const saveNarradorStorageSettings = async (settings) => {
    try {
        const d = await getDb();
        const current = await getNarradorStorageSettings();
        await d.settings.put({ key: 'storage', ...current, ...settings });
        return true;
    } catch (err) {
        console.warn('[NarradorCache] save storage settings error:', err);
        return false;
    }
};

export const chooseNarradorDirectory = async () => {
    if (!window.showDirectoryPicker) throw new Error('Tu navegador no permite seleccionar carpetas desde la aplicación.');
    const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveNarradorStorageSettings({ directoryHandle, folderName: directoryHandle.name, keepPermanent: true });
    return directoryHandle.name;
};

const pcmToWavBlob = (pcmData, sampleRate = 24000) => {
    const pcm = new Uint8Array(pcmData);
    const buffer = new ArrayBuffer(44 + pcm.byteLength);
    const view = new DataView(buffer);
    const writeString = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcm.byteLength, true);
    new Uint8Array(buffer, 44).set(pcm);
    return new Blob([buffer], { type: 'audio/wav' });
};

export const saveSegmentToNarradorDirectory = async (bookId, chapterId, segmentIndex, pcmData) => {
    const settings = await getNarradorStorageSettings();
    const directoryHandle = settings.directoryHandle;
    if (!directoryHandle) return false;
    try {
        const safe = value => String(value).replace(/[^a-z0-9_-]/gi, '_').slice(0, 50);
        const file = await directoryHandle.getFileHandle(`${safe(bookId)}_${safe(chapterId)}_${segmentIndex + 1}.wav`, { create: true });
        const writable = await file.createWritable();
        await writable.write(pcmToWavBlob(pcmData));
        await writable.close();
        return true;
    } catch (err) {
        console.warn('[NarradorCache] save directory audio error:', err);
        return false;
    }
};

/** Elimina únicamente la versión cacheada de un segmento. */
export const invalidateCachedSegment = async (bookId, chapterId, segmentIndex) => {
    try {
        const d = await getDb();
        const key = `${bookId}_${chapterId}_${segmentIndex}`;
        await d.segments.delete(key);
        await d.permanentSegments.delete(key);
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
            await d.permanentSegments.where('chapterId').equals(chapterId).delete();
        } else if (bookId) {
            await d.segments.where('bookId').equals(bookId).delete();
            await d.permanentSegments.where('bookId').equals(bookId).delete();
        } else {
            await d.segments.clear();
            await d.permanentSegments.clear();
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
        const all = [...await d.segments.toArray(), ...await d.permanentSegments.toArray()];
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
    savePermanentSegment,
    getNarradorStorageSettings,
    saveNarradorStorageSettings,
    chooseNarradorDirectory,
    saveSegmentToNarradorDirectory,
    invalidateCachedSegment,
    clearNarradorCache,
    getNarradorCacheSize
};
