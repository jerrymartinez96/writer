/**
 * NarradorSegmenter — Divide el texto de un capítulo en segmentos narrables.
 *
 * UNIDAD DE MEDIDA: EL PÁRRAFO (no palabras).
 * - Agrupa párrafos completos hasta ~160 palabras SIN cortarlos
 * - Si un solo párrafo excede el límite, lo fracciona por ORACIONES completas
 * - Resultado: 1 segmento = 1+ párrafos completos (unidad narrativa natural)
 * - Cada segmento incluye `paragraphOffset` = rango REAL de párrafos para resaltado exacto
 * - Cada segmento incluye `paragraphTexts` = textos de los párrafos que lo componen
 *   (permite distribuir el progreso del audio párrafo a párrafo con precisión)
 */

const TARGET_WORDS_PER_SEGMENT = 160;
const SENTENCE_SPLIT_WORDS = 55;

/**
 * Limpia el texto de un capítulo para narración.
 */
export const cleanTextForNarration = (htmlOrText) => {
    if (!htmlOrText) return '';

    let text = htmlOrText;

    // Quitar marcas de notas inline
    text = text.replace(/<mark[^>]*data-note-id[^>]*>([\s\S]*?)<\/mark>/gi, '$1');

    // Quitar menciones
    text = text.replace(/<span[^>]*data-char-id[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    text = text.replace(/<span[^>]*data-ghost-char-id[^>]*>([\s\S]*?)<\/span>/gi, '$1');

    // Quitar @ de menciones
    text = text.replace(/@([A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+?)<\/span>/gi, '$1');
    text = text.replace(/<span[^>]*>@?([^<]+?)<\/span>/gi, '$1');

    // Strippear etiquetas HTML restantes
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    text = tempDiv.textContent || '';

    // Normalizar espacios
    text = text
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return text;
};

export const countWords = (text) => String(text || '').split(/\s+/).filter(Boolean).length;

/**
 * Normaliza un texto para búsquedas de coincidencia (resaltado).
 * Quita HTML, normaliza espacios y pasa a minúsculas.
 */
export const normalizeForMatching = (text = '') => {
    return String(text)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
};

/**
 * Devuelve las primeras `n` palabras de un texto normalizado.
 */
export const firstWords = (text, n) => {
    return String(text || '').split(/\s+/).filter(Boolean).slice(0, n).join(' ');
};

/**
 * Devuelve las últimas `n` palabras de un texto normalizado.
 */
export const lastWords = (text, n) => {
    return String(text || '').split(/\s+/).filter(Boolean).slice(-n).join(' ');
};

/**
 * Divide un párrafo largo en fracciones de oraciones completas.
 */
const splitParagraphBySentences = (paragraph, maxWordsPerChunk) => {
    const sentences = paragraph.split(/(?<=[.!?…])\s+/).filter(Boolean);
    if (sentences.length === 0) return [paragraph];

    const chunks = [];
    let current = [];
    let currentCount = 0;

    for (const sentence of sentences) {
        const sWords = countWords(sentence);
        if (currentCount + sWords > maxWordsPerChunk && currentCount > 0) {
            chunks.push(current.join(' ').trim());
            current = [];
            currentCount = 0;
        }
        current.push(sentence);
        currentCount += sWords;
    }

    if (current.length > 0) {
        chunks.push(current.join(' ').trim());
    }

    if (chunks.length === 0 && paragraph.trim()) {
        return [paragraph.trim()];
    }
    return chunks;
};

/**
 * Segmenta el texto y devuelve segmentos con su rango de párrafos globales.
 * Cada segmento: { text, paragraphStart, paragraphEnd, paragraphTexts }
 */
export const segmentText = (plainText) => {
    if (!plainText) return [];

    const paragraphs = plainText
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean);

    if (paragraphs.length === 0) return [];

    const segments = [];
    let group = [];
    let groupWordCount = 0;

    const flushGroup = (endIndex) => {
        if (group.length > 0) {
            segments.push({
                text: group.map(g => g.text).join(' ').trim(),
                paragraphStart: group[0].index,
                paragraphEnd: endIndex !== undefined ? endIndex : group[group.length - 1].index,
                paragraphTexts: group.map(g => g.text)
            });
            group = [];
            groupWordCount = 0;
        }
    };

    paragraphs.forEach((fullText, globalIndex) => {
        const paraWords = countWords(fullText);

        // ¿Este párrafo individual excede el objetivo? → fraccionar por oraciones
        if (paraWords > TARGET_WORDS_PER_SEGMENT) {
            flushGroup(globalIndex - 1);

            const fractions = splitParagraphBySentences(fullText, SENTENCE_SPLIT_WORDS);
            for (const frac of fractions) {
                segments.push({
                    text: frac,
                    paragraphStart: globalIndex,
                    paragraphEnd: globalIndex,
                    paragraphTexts: [frac]
                });
            }
            return;
        }

        // ¿Agregar este párrafo excede el objetivo? → cerrar grupo antes
        if (groupWordCount + paraWords > TARGET_WORDS_PER_SEGMENT && groupWordCount > 0) {
            flushGroup(globalIndex - 1);
        }

        group.push({ index: globalIndex, text: fullText });
        groupWordCount += paraWords;
    });

    flushGroup(paragraphs.length - 1);

    return segments;
};

/**
 * Hash FNV-1a determinista de 32 bits para invalidación de caché.
 */
export const fnv1a = (str) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16);
};

/**
 * Prepara los segmentos de un capítulo con hash y paragraphOffset.
 * paragraphOffset = rango REAL de párrafos (índices globales en el texto).
 */
export const prepareSegments = (htmlOrText) => {
    const cleaned = cleanTextForNarration(htmlOrText);
    const segments = segmentText(cleaned);
    return segments.map((seg, index) => ({
        index,
        text: seg.text,
        hash: fnv1a(seg.text),
        paragraphOffset: {
            start: seg.paragraphStart,
            end: seg.paragraphEnd
        },
        paragraphTexts: seg.paragraphTexts
    }));
};

export default {
    cleanTextForNarration,
    segmentText,
    fnv1a,
    prepareSegments,
    countWords,
    normalizeForMatching,
    firstWords,
    lastWords
};