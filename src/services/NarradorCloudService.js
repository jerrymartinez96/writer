/**
 * Sincronización explícita de audios del Narrador.
 *
 * Cloudinary almacena los WAV y Firestore conserva únicamente su metadata.
 * La reproducción no usa este servicio automáticamente: primero se debe
 * descargar el respaldo al caché local.
 */
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    where,
    writeBatch
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
    getCachedChapterSegments,
    getCachedSegment,
    pcmToWavBlob,
    savePermanentSegment,
    wavToPcmData
} from './NarradorCache';
import {
    buildNarradorAssetId,
    buildNarradorAssetMatchKey,
    buildNarradorAudioVariant
} from './NarradorAudioIdentity';

const ASSETS_COLLECTION = 'narrationAssets';
const PENDING_UPLOAD_PREFIX = 'narrador_cloud_pending_';
const FIRESTORE_BATCH_LIMIT = 450;

const getUid = () => auth.currentUser?.uid || '';

const getPendingUploadKey = (uid, assetId) => `${PENDING_UPLOAD_PREFIX}${uid}_${assetId}`;

const readPendingUpload = (uid, assetId) => {
    try {
        const saved = window.localStorage.getItem(getPendingUploadKey(uid, assetId));
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
};

const savePendingUpload = (uid, assetId, metadata) => {
    try {
        window.localStorage.setItem(getPendingUploadKey(uid, assetId), JSON.stringify(metadata));
    } catch { /* El reintento seguirá siendo seguro dentro de la sesión actual. */ }
};

const clearPendingUpload = (uid, assetId) => {
    try {
        window.localStorage.removeItem(getPendingUploadKey(uid, assetId));
    } catch { /* ignore */ }
};

const getErrorDetails = (error) => ({
    name: error?.name || 'Error',
    message: error?.message || String(error),
    code: error?.code || null,
    status: error?.status || error?.response?.status || null
});

const logCloudError = (message, error, context = {}) => {
    console.error(`[NarradorCloud] ${message}`, {
        ...context,
        error: getErrorDetails(error)
    });
};

const getAssetsCollection = (uid = getUid()) => {
    if (!uid) throw new Error('Inicia sesión para sincronizar los audios del Narrador.');
    return collection(db, 'users', uid, ASSETS_COLLECTION);
};

export const getNarradorCloudConfig = (profile) => {
    const cfg = profile?.aiConfig || {};
    return {
        cloudName: String(cfg.cloudinaryCloudName || '').trim(),
        uploadPreset: String(cfg.cloudinaryUploadPreset || '').trim()
    };
};

export const isNarradorCloudConfigured = (profile) => {
    const config = getNarradorCloudConfig(profile);
    return Boolean(config.cloudName && config.uploadPreset);
};

const requireUploadConfig = (profile) => {
    const config = getNarradorCloudConfig(profile);
    if (!config.cloudName || !config.uploadPreset) {
        throw new Error('Configura el Cloud name y el Upload preset de Cloudinary antes de sincronizar.');
    }
    return config;
};

const getAssetReference = ({ uid, bookId, chapterId, segmentIndex, textHash, variantKey }) => {
    const assetId = buildNarradorAssetId({ bookId, chapterId, segmentIndex, textHash, variantKey });
    return { assetId, reference: doc(getAssetsCollection(uid), assetId) };
};

const readJsonResponse = async (response) => {
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.error('[NarradorCloud] Cloudinary rechazó la subida', {
            status: response.status,
            statusText: response.statusText,
            error: result.error || null
        });
        throw new Error(result.error?.message || 'Cloudinary rechazó la operación.');
    }
    return result;
};

export const uploadNarradorSegment = async ({
    profile,
    bookId,
    chapterId,
    segmentIndex,
    textHash,
    variantKey,
    pcmData,
    chapterTitle = ''
}) => {
    const config = requireUploadConfig(profile);
    const uid = getUid();
    const { assetId, reference } = getAssetReference({ uid, bookId, chapterId, segmentIndex, textHash, variantKey });
    let existing;
    try {
        existing = await getDoc(reference);
    } catch (error) {
        logCloudError('No se pudo leer la metadata del fragmento en Firestore', error, {
            bookId,
            chapterId,
            segmentIndex,
            assetId
        });
        throw error;
    }
    if (existing.exists() && existing.data()?.status === 'ready' && existing.data()?.secureUrl) {
        return { assetId, ...existing.data(), skipped: true };
    }

    const recoveredMetadata = readPendingUpload(uid, assetId);
    if (recoveredMetadata?.secureUrl) {
        try {
            const metadata = {
                ...recoveredMetadata,
                status: 'ready',
                lastError: null,
                updatedAt: serverTimestamp(),
                createdAt: existing.exists() ? existing.data()?.createdAt || serverTimestamp() : serverTimestamp()
            };
            await setDoc(reference, metadata, { merge: true });
            clearPendingUpload(uid, assetId);
            return { assetId, ...metadata, skipped: true, recovered: true };
        } catch (error) {
            logCloudError('No se pudo recuperar la metadata pendiente del fragmento', error, { bookId, chapterId, segmentIndex, assetId });
            throw error;
        }
    }

    // Registrar primero la intención evita subir archivos si Firestore no está
    // autorizado y deja trazabilidad si la red se corta durante la subida.
    const pendingMetadata = {
        uid,
        bookId,
        chapterId,
        chapterTitle,
        segmentIndex,
        textHash,
        variantKey,
        cloudName: config.cloudName,
        status: 'uploading',
        updatedAt: serverTimestamp(),
        createdAt: existing.exists() ? existing.data()?.createdAt || serverTimestamp() : serverTimestamp()
    };
    try {
        await setDoc(reference, pendingMetadata, { merge: true });
    } catch (error) {
        logCloudError('Firestore rechazó preparar la metadata del fragmento', error, {
            bookId,
            chapterId,
            segmentIndex,
            assetId
        });
        throw error;
    }

    const wavBlob = pcmToWavBlob(pcmData);
    const formData = new FormData();
    formData.append('file', wavBlob, `${assetId}.wav`);
    formData.append('upload_preset', config.uploadPreset);

    let result;
    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/video/upload`, {
            method: 'POST',
            body: formData
        });
        result = await readJsonResponse(response);
    } catch (error) {
        try {
            await setDoc(reference, { status: 'failed', lastError: error?.message || 'Cloudinary rechazó la operación.', updatedAt: serverTimestamp() }, { merge: true });
        } catch (metadataError) {
            logCloudError('No se pudo registrar el error de subida en Firestore', metadataError, { bookId, chapterId, segmentIndex, assetId });
        }
        throw error;
    }
    const metadata = {
        uid,
        bookId,
        chapterId,
        chapterTitle,
        segmentIndex,
        textHash,
        variantKey,
        cloudName: config.cloudName,
        publicId: result.public_id || '',
        secureUrl: result.secure_url || '',
        resourceType: result.resource_type || 'video',
        format: result.format || 'wav',
        bytes: result.bytes || wavBlob.size,
        status: 'ready',
        lastError: null,
        updatedAt: serverTimestamp(),
        createdAt: existing.exists() ? existing.data()?.createdAt || serverTimestamp() : serverTimestamp()
    };
    savePendingUpload(uid, assetId, {
        uid,
        bookId,
        chapterId,
        chapterTitle,
        segmentIndex,
        textHash,
        variantKey,
        cloudName: config.cloudName,
        publicId: result.public_id || '',
        secureUrl: result.secure_url || '',
        resourceType: result.resource_type || 'video',
        format: result.format || 'wav',
        bytes: result.bytes || wavBlob.size
    });
    try {
        await setDoc(reference, metadata, { merge: true });
    } catch (error) {
        logCloudError('Cloudinary recibió el archivo, pero Firestore rechazó guardar su metadata', error, {
            bookId,
            chapterId,
            segmentIndex,
            assetId,
            publicId: result.public_id || null
        });
        throw error;
    }
    clearPendingUpload(uid, assetId);
    return { assetId, ...metadata, skipped: false };
};

export const getCachedNarradorChapterAssets = async ({ bookId, chapterId }) => {
    const uid = getUid();
    const assetsQuery = query(getAssetsCollection(uid), where('bookId', '==', bookId));
    let snapshot;
    try {
        snapshot = await getDocs(assetsQuery);
    } catch (error) {
        logCloudError('No se pudo consultar la metadata de respaldos en Firestore', error, {
            bookId,
            chapterId
        });
        throw error;
    }
    return snapshot.docs
        .map((assetDoc) => ({ assetId: assetDoc.id, ...assetDoc.data() }))
        .filter((asset) => asset.chapterId === chapterId && asset.status === 'ready' && asset.secureUrl);
};

/**
 * Elimina las referencias de Firestore para todos los audios de un capítulo.
 * Los archivos en Cloudinary no se borran desde el cliente porque esa acción
 * requiere credenciales secretas; al no tener metadata, ya no son accesibles
 * ni descargables desde la aplicación.
 */
export const deleteNarradorCloudChapterAssets = async ({ bookId, chapterId, onProgress } = {}) => {
    if (!bookId || !chapterId) {
        throw new Error('Selecciona un libro y un capítulo antes de eliminar su respaldo.');
    }

    const uid = getUid();
    const assetsQuery = query(getAssetsCollection(uid), where('bookId', '==', bookId));
    let snapshot;
    try {
        snapshot = await getDocs(assetsQuery);
    } catch (error) {
        logCloudError('No se pudieron consultar las referencias para eliminar el respaldo', error, { bookId, chapterId });
        throw error;
    }

    const chapterAssets = snapshot.docs.filter((assetDoc) => assetDoc.data()?.chapterId === chapterId);
    const total = chapterAssets.length;
    let deleted = 0;

    for (let start = 0; start < total; start += FIRESTORE_BATCH_LIMIT) {
        const batchAssets = chapterAssets.slice(start, start + FIRESTORE_BATCH_LIMIT);
        const batch = writeBatch(db);
        batchAssets.forEach((assetDoc) => batch.delete(assetDoc.ref));
        try {
            await batch.commit();
        } catch (error) {
            logCloudError('No se pudieron eliminar las referencias del respaldo', error, {
                bookId,
                chapterId,
                deleted,
                total
            });
            throw error;
        }

        batchAssets.forEach((assetDoc) => clearPendingUpload(uid, assetDoc.id));
        deleted += batchAssets.length;
        onProgress?.({ completed: deleted, total, deleted });
    }

    return { total, deleted };
};

export const getNarradorCloudChapterStatus = async ({
    bookId,
    chapterId,
    segments = [],
    variantKey = 'default'
}) => {
    const [assets, local] = await Promise.all([
        getCachedNarradorChapterAssets({ bookId, chapterId }),
        getCachedChapterSegments(bookId, chapterId, segments, variantKey)
    ]);
    const assetKeys = new Set(assets.map(buildNarradorAssetMatchKey));
    const cloudIndexes = segments
        .map((segment, index) => assetKeys.has(buildNarradorAssetMatchKey({ segmentIndex: index, textHash: segment.hash, variantKey })) ? index : null)
        .filter((index) => index !== null);
    const cloudIndexSet = new Set(cloudIndexes);
    return {
        total: segments.length,
        localReady: local.segments.length,
        cloudReady: cloudIndexes.length,
        localMissingIndexes: local.missingIndexes,
        cloudMissingIndexes: segments.map((_, index) => index).filter((index) => !cloudIndexSet.has(index))
    };
};

export const uploadCachedNarradorChapter = async ({
    profile,
    bookId,
    chapterId,
    chapterTitle = '',
    segments = [],
    variantKey = buildNarradorAudioVariant(profile),
    onProgress
}) => {
    const localCache = await getCachedChapterSegments(bookId, chapterId, segments, variantKey);
    const localSegments = localCache.segments.map(({ index, segment, cached }) => ({
        segmentIndex: index,
        textHash: segment.hash,
        variantKey,
        pcmData: cached.pcmData
    }));
    if (localSegments.length === 0) {
        return { total: 0, uploaded: 0, skipped: 0, failed: 0, missing: localCache.missingIndexes.length, errors: [] };
    }

    let uploaded = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    for (let index = 0; index < localSegments.length; index += 1) {
        const entry = localSegments[index];
        try {
            const result = await uploadNarradorSegment({
                profile,
                bookId,
                chapterId,
                chapterTitle,
                segmentIndex: entry.segmentIndex,
                textHash: entry.textHash,
                variantKey: entry.variantKey,
                pcmData: entry.pcmData
            });
            if (result.skipped) skipped += 1;
            else uploaded += 1;
        } catch (error) {
            failed += 1;
            errors.push({ index: entry.segmentIndex, message: error.message });
            logCloudError('Falló el respaldo de un fragmento', error, {
                bookId,
                chapterId,
                segmentIndex: entry.segmentIndex,
                variantKey: entry.variantKey
            });
        }
        onProgress?.({ completed: index + 1, total: localSegments.length, uploaded, skipped, failed, errors });
    }

    return { total: localSegments.length, uploaded, skipped, failed, missing: localCache.missingIndexes.length, errors };
};

export const downloadNarradorChapterToCache = async ({
    profile,
    bookId,
    chapterId,
    segments = [],
    variantKey = buildNarradorAudioVariant(profile),
    onProgress,
    onSegmentCached
}) => {
    const assets = await getCachedNarradorChapterAssets({ bookId, chapterId });
    const assetsByKey = new Map(assets.map((asset) => [
        buildNarradorAssetMatchKey(asset),
        asset
    ]));
    const total = segments.length;
    let downloaded = 0;
    let skipped = 0;
    let missing = 0;
    let failed = 0;
    const errors = [];

    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const matchKey = buildNarradorAssetMatchKey({
            segmentIndex: index,
            textHash: segment.hash,
            variantKey
        });
        const asset = assetsByKey.get(matchKey);
        try {
            const local = await getCachedSegment(bookId, chapterId, index, segment.hash, variantKey);
            if (local?.pcmData) {
                skipped += 1;
                onSegmentCached?.(index, { bookId, chapterId, variantKey });
            } else if (!asset) {
                missing += 1;
            } else {
                const response = await fetch(asset.secureUrl);
                if (!response.ok) throw new Error(`No se pudo descargar el fragmento ${index + 1}.`);
                const pcmData = await wavToPcmData(await response.arrayBuffer());
                const saved = await savePermanentSegment(bookId, chapterId, index, segment.hash, pcmData, variantKey);
                if (!saved) throw new Error(`No se pudo guardar el fragmento ${index + 1} en la caché local.`);
                downloaded += 1;
                onSegmentCached?.(index, { bookId, chapterId, variantKey });
            }
        } catch (error) {
            failed += 1;
            errors.push({ index, message: error.message });
            logCloudError('Falló la descarga de un fragmento', error, {
                bookId,
                chapterId,
                segmentIndex: index,
                hasCloudAsset: Boolean(asset),
                cloudPublicId: asset?.publicId || null
            });
        }
        onProgress?.({ completed: index + 1, total, downloaded, skipped, missing, failed, errors });
    }

    return { total, downloaded, skipped, missing, failed, errors };
};

export default {
    getNarradorCloudConfig,
    isNarradorCloudConfigured,
    uploadNarradorSegment,
    getCachedNarradorChapterAssets,
    deleteNarradorCloudChapterAssets,
    getNarradorCloudChapterStatus,
    uploadCachedNarradorChapter,
    downloadNarradorChapterToCache
};
