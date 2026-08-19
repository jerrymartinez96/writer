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

const encodeVariant = (variantKey = 'default') => encodeURIComponent(String(variantKey || 'default'));
const getSegmentKey = (bookId, chapterId, segmentIndex, variantKey = 'default') => `${bookId}_${chapterId}_${segmentIndex}__${encodeVariant(variantKey)}`;
const getLegacySegmentKey = (bookId, chapterId, segmentIndex) => `${bookId}_${chapterId}_${segmentIndex}`;

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
        const key = getSegmentKey(bookId, chapterId, segmentIndex, variantKey);
        const permanent = await d.permanentSegments.get(key);
        if (permanent && permanent.textHash === textHash && (permanent.variantKey || 'default') === variantKey) {
            return { pcmData: permanent.pcmData, textHash: permanent.textHash, permanent: true };
        }
        const entry = await d.segments.get(key);
        const legacyEntry = !entry && variantKey === 'default' ? await d.segments.get(getLegacySegmentKey(bookId, chapterId, segmentIndex)) : null;
        const selectedEntry = entry || legacyEntry;
        if (!selectedEntry) return null;

        // Invalidar por hash de texto (el texto del segmento cambió)
        if (selectedEntry.textHash !== textHash || (selectedEntry.variantKey || 'default') !== variantKey) return null;

        // Invalidar por TTL
        if (Date.now() - selectedEntry.timestamp > CACHE_TTL_MS) {
            await d.segments.delete(selectedEntry.key || key);
            return null;
        }

        return { pcmData: selectedEntry.pcmData, textHash: selectedEntry.textHash };
    } catch (err) {
        console.warn('[NarradorCache] getCachedSegment error:', err);
        return null;
    }
};

export const savePermanentSegment = async (bookId, chapterId, segmentIndex, textHash, pcmData, variantKey = 'default') => {
    try {
        const d = await getDb();
        const key = getSegmentKey(bookId, chapterId, segmentIndex, variantKey);
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

export const pcmToWavBlob = (pcmData, sampleRate = 24000) => {
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

/**
 * Extrae el PCM lineal de un WAV PCM de 16 bits.
 * Los respaldos del Narrador se generan con pcmToWavBlob, pero se recorren
 * los chunks para no depender de que el bloque data esté siempre en offset 44.
 */
export const wavToPcmData = (arrayBuffer) => {
    const view = new DataView(arrayBuffer);
    const readAscii = (offset, length) => {
        let value = '';
        for (let index = 0; index < length; index += 1) value += String.fromCharCode(view.getUint8(offset + index));
        return value;
    };

    if (arrayBuffer.byteLength < 12 || readAscii(0, 4) !== 'RIFF' || readAscii(8, 4) !== 'WAVE') {
        throw new Error('El respaldo descargado no es un WAV válido.');
    }

    let offset = 12;
    let audioFormat = null;
    let channels = null;
    let bitsPerSample = null;
    let dataOffset = null;
    let dataLength = null;

    while (offset + 8 <= view.byteLength) {
        const chunkId = readAscii(offset, 4);
        const chunkLength = view.getUint32(offset + 4, true);
        const chunkDataOffset = offset + 8;
        if (chunkDataOffset + chunkLength > view.byteLength) break;

        if (chunkId === 'fmt ' && chunkLength >= 16) {
            audioFormat = view.getUint16(chunkDataOffset, true);
            channels = view.getUint16(chunkDataOffset + 2, true);
            bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
        } else if (chunkId === 'data') {
            dataOffset = chunkDataOffset;
            dataLength = chunkLength;
            break;
        }

        offset = chunkDataOffset + chunkLength + (chunkLength % 2);
    }

    if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16 || dataOffset === null) {
        throw new Error('El respaldo descargado no usa el formato PCM esperado.');
    }

    return arrayBuffer.slice(dataOffset, dataOffset + dataLength);
};

const safeFileName = value => String(value || 'narracion').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);

/**
 * Recupera todos los segmentos válidos de una narración para exportación.
 * No genera audio ni modifica la caché: solo informa qué fragmentos faltan.
 */
export const getCachedChapterSegments = async (bookId, chapterId, segments = [], variantKey = 'default') => {
    const results = await Promise.all(segments.map(async (segment, index) => ({
        index,
        segment,
        cached: await getCachedSegment(bookId, chapterId, index, segment.hash, variantKey)
    })));
    return {
        segments: results.filter(item => item.cached?.pcmData),
        missingIndexes: results.filter(item => !item.cached?.pcmData).map(item => item.index)
    };
};

/**
 * Descarga una narración completa como WAV cuando todos sus segmentos están cacheados.
 */
export const downloadCachedChapterWav = async ({ bookId, chapterId, chapterTitle, segments, variantKey = 'default' }) => {
    const result = await getCachedChapterSegments(bookId, chapterId, segments, variantKey);
    if (result.missingIndexes.length > 0) return result;

    const pcmBuffers = result.segments.map(item => new Uint8Array(item.cached.pcmData));
    const totalLength = pcmBuffers.reduce((total, buffer) => total + buffer.byteLength, 0);
    const combinedPcm = new Uint8Array(totalLength);
    let offset = 0;
    pcmBuffers.forEach(buffer => {
        combinedPcm.set(buffer, offset);
        offset += buffer.byteLength;
    });

    const blob = pcmToWavBlob(combinedPcm.buffer);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFileName(chapterTitle || chapterId)}.wav`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return result;
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
        const prefix = `${bookId}_${chapterId}_${segmentIndex}__`;
        await d.segments.where('key').startsWith(prefix).delete();
        await d.permanentSegments.where('key').startsWith(prefix).delete();
        const legacyKey = getLegacySegmentKey(bookId, chapterId, segmentIndex);
        await d.segments.delete(legacyKey);
        await d.permanentSegments.delete(legacyKey);
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
        const key = getSegmentKey(bookId, chapterId, segmentIndex, variantKey);
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
 * Lista los fragmentos locales de un capítulo, prefiriendo la versión
 * permanente cuando existe una copia temporal y otra permanente del mismo key.
 */
export const getCachedNarradorSegments = async ({ bookId, chapterId } = {}) => {
    try {
        const d = await getDb();
        const [temporary, permanent] = await Promise.all([
            d.segments.toArray(),
            d.permanentSegments.toArray()
        ]);
        const entries = new Map();
        temporary
            .filter((entry) => (!bookId || entry.bookId === bookId) && (!chapterId || entry.chapterId === chapterId))
            .forEach((entry) => entries.set(entry.key, { ...entry, permanent: false }));
        permanent
            .filter((entry) => (!bookId || entry.bookId === bookId) && (!chapterId || entry.chapterId === chapterId))
            .forEach((entry) => entries.set(entry.key, { ...entry, permanent: true }));
        return Array.from(entries.values());
    } catch (err) {
        console.warn('[NarradorCache] list cached segments error:', err);
        return [];
    }
};

/**
 * Limpia exclusivamente la caché del capítulo indicado.
 * La operación exige ambos identificadores para evitar borrar capítulos
 * ajenos por accidente.
 */
export const clearNarradorCache = async (bookId, chapterId) => {
    try {
        if (!bookId || !chapterId) {
            console.warn('[NarradorCache] clear skipped: chapter scope is required');
            return false;
        }
        const d = await getDb();
        await d.segments.filter((entry) => entry.bookId === bookId && entry.chapterId === chapterId).delete();
        await d.permanentSegments.filter((entry) => entry.bookId === bookId && entry.chapterId === chapterId).delete();
        return true;
    } catch (err) {
        console.warn('[NarradorCache] clear error:', err);
        return false;
    }
};

/**
 * Calcula el tamaño total de la caché en bytes (para mostrar al usuario).
 */
export const getNarradorCacheSize = async (bookId, chapterId) => {
    try {
        const d = await getDb();
        const isInScope = (entry) => (!bookId || entry.bookId === bookId) && (!chapterId || entry.chapterId === chapterId);
        const [temporaryEntries, permanentEntries] = await Promise.all([
            d.segments.toArray(),
            d.permanentSegments.toArray()
        ]);
        const temporary = temporaryEntries.filter(isInScope);
        const permanent = permanentEntries.filter(isInScope);
        const temporaryBytes = temporary.reduce((sum, e) => sum + (e.pcmData?.byteLength || 0), 0);
        const permanentBytes = permanent.reduce((sum, e) => sum + (e.pcmData?.byteLength || 0), 0);
        return {
            entries: temporary.length + permanent.length,
            temporaryEntries: temporary.length,
            permanentEntries: permanent.length,
            bytes: temporaryBytes + permanentBytes,
            temporaryBytes,
            permanentBytes,
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
    pcmToWavBlob,
    wavToPcmData,
    getCachedChapterSegments,
    downloadCachedChapterWav,
    saveSegmentToNarradorDirectory,
    invalidateCachedSegment,
    clearNarradorCache,
    getNarradorCacheSize,
    getCachedNarradorSegments
};
