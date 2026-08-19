/**
 * Identidad estable de los audios del Narrador.
 * Debe coincidir con la identidad usada por IndexedDB para evitar mezclar
 * fragmentos generados con otra voz, modelo, tono o prompt.
 */
export const buildNarradorAudioVariant = (profile) => {
    const cfg = profile?.aiConfig || {};
    return [
        cfg.geminiLiveModel || 'gemini-3.1-flash-live-preview',
        cfg.narradorVoice || 'Puck',
        cfg.narradorTone || 'auto',
        'prompt-v2'
    ].join('|');
};

const encodePart = (value) => encodeURIComponent(String(value ?? ''));

export const buildNarradorAssetId = ({ bookId, chapterId, segmentIndex, textHash, variantKey }) => [
    bookId,
    chapterId,
    segmentIndex,
    textHash,
    variantKey
].map(encodePart).join('__');

export const buildNarradorAssetMatchKey = ({ segmentIndex, textHash, variantKey }) => [
    segmentIndex,
    textHash,
    variantKey
].map(encodePart).join('__');

export default {
    buildNarradorAudioVariant,
    buildNarradorAssetId,
    buildNarradorAssetMatchKey
};
