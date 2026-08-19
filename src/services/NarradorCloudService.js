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
    where
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
    getCachedNarradorSegments,
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

const getUid = () => auth.currentUser?.uid || '';

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
        uploadPreset: String(cfg.cloudinaryUploadPreset || '').trim(),
        apiKey: String(cfg.cloudinaryApiKey || '').trim()
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
    console.info('[NarradorCloud] Iniciando fragmento', {
        authenticated: Boolean(uid),
        bookId,
        chapterId,
        segmentIndex,
        variantKey,
        pcmBytes: pcmData?.byteLength || 0
    });
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
        console.info('[NarradorCloud] Fragmento ya respaldado; se omite', {
            bookId,
            chapterId,
            segmentIndex,
            assetId
        });
        return { assetId, ...existing.data(), skipped: true };
    }

    const wavBlob = pcmToWavBlob(pcmData);
    const formData = new FormData();
    formData.append('file', wavBlob, `${assetId}.wav`);
    formData.append('upload_preset', config.uploadPreset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/video/upload`, {
        method: 'POST',
        body: formData
    });
    const result = await readJsonResponse(response);
    console.info('[NarradorCloud] Cloudinary aceptó el fragmento', {
        bookId,
        chapterId,
        segmentIndex,
        assetId,
        publicId: result.public_id || null,
        resourceType: result.resource_type || null,
        bytes: result.bytes || wavBlob.size
    });
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
        updatedAt: serverTimestamp(),
        createdAt: existing.exists() ? existing.data()?.createdAt || serverTimestamp() : serverTimestamp()
    };
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
    console.info('[NarradorCloud] Metadata guardada en Firestore', {
        bookId,
        chapterId,
        segmentIndex,
        assetId
    });
    return { assetId, ...metadata, skipped: false };
};

export const getCachedNarradorChapterAssets = async ({ bookId, chapterId }) => {
    const uid = getUid();
    console.info('[NarradorCloud] Consultando metadata de respaldo', {
        authenticated: Boolean(uid),
        bookId,
        chapterId
    });
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
    console.info('[NarradorCloud] Metadata de respaldo consultada', {
        bookId,
        chapterId,
        documentsFound: snapshot.size
    });
    return snapshot.docs
        .map((assetDoc) => ({ assetId: assetDoc.id, ...assetDoc.data() }))
        .filter((asset) => asset.chapterId === chapterId && asset.status === 'ready' && asset.secureUrl);
};

export const uploadCachedNarradorChapter = async ({
    profile,
    bookId,
    chapterId,
    chapterTitle = '',
    onProgress
}) => {
    const localSegments = await getCachedNarradorSegments({ bookId, chapterId });
    console.info('[NarradorCloud] Iniciando respaldo del capítulo', {
        bookId,
        chapterId,
        localSegments: localSegments.length
    });
    if (localSegments.length === 0) {
        return { total: 0, uploaded: 0, skipped: 0, failed: 0 };
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
                variantKey: entry.variantKey || 'default',
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
                variantKey: entry.variantKey || 'default'
            });
        }
        onProgress?.({ completed: index + 1, total: localSegments.length, uploaded, skipped, failed, errors });
    }

    const summary = { total: localSegments.length, uploaded, skipped, failed, errors };
    console.info('[NarradorCloud] Respaldo del capítulo finalizado', { bookId, chapterId, ...summary });
    return summary;
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
    console.info('[NarradorCloud] Iniciando descarga del capítulo', {
        bookId,
        chapterId,
        requestedSegments: segments.length,
        variantKey
    });
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
                onSegmentCached?.(index);
            } else if (!asset) {
                missing += 1;
            } else {
                const response = await fetch(asset.secureUrl);
                if (!response.ok) throw new Error(`No se pudo descargar el fragmento ${index + 1}.`);
                const pcmData = await wavToPcmData(await response.arrayBuffer());
                const saved = await savePermanentSegment(bookId, chapterId, index, segment.hash, pcmData, variantKey);
                if (!saved) throw new Error(`No se pudo guardar el fragmento ${index + 1} en la caché local.`);
                downloaded += 1;
                onSegmentCached?.(index);
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

    const summary = { total, downloaded, skipped, missing, failed, errors };
    console.info('[NarradorCloud] Descarga del capítulo finalizada', { bookId, chapterId, ...summary });
    return summary;
};

export default {
    getNarradorCloudConfig,
    isNarradorCloudConfigured,
    uploadNarradorSegment,
    getCachedNarradorChapterAssets,
    uploadCachedNarradorChapter,
    downloadNarradorChapterToCache
};
