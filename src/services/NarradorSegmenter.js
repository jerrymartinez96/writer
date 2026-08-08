/**
 * NarradorSegmenter — Divide el texto de un capítulo en segmentos narrables.
 *
 * UNIDAD DE MEDIDA: EL PÁRRAFO (no palabras).
 * - 1 segmento = 1 párrafo COMPLETO (nunca se corta un párrafo ni se mezcla
 *   texto del siguiente).
 * - Si un solo párrafo excede las 150 palabras, se fracciona por ORACIONES
 *   completas (y todos sus trozos apuntan al mismo párrafo).
 * - Cada segmento incluye `paragraphOffset` y `paragraphTexts` para referencia.
 */

const TARGET_WORDS_PER_SEGMENT = 150;
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

    // Extraer el texto respetando los límites de los bloques de Tiptap.
    // textContent por sí solo concatena `<p>uno</p><p>dos</p>` sin separador.
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    const blockTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE']);
    const parts = [];
    const visit = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            parts.push(node.nodeValue || '');
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const isBlock = blockTags.has(node.tagName);
        if (isBlock && parts.length > 0 && !parts[parts.length - 1].endsWith('\n')) parts.push('\n\n');
        node.childNodes.forEach(visit);
        if (isBlock) parts.push('\n\n');
    };
    tempDiv.childNodes.forEach(visit);
    text = parts.join('');

    // Normalizar espacios
    text = text
        .replace(/\u00a0/g, ' ')
        // Insertar espacio tras puntuación si va pegada a una letra mayúscula
        // (ej.: "archivo.Claire" → "archivo. Claire")
        .replace(/([.!?…])([A-ZÁÉÍÓÚÜÑ])/g, '$1 $2')
        .replace(/([.!?…])(\s{2,})/g, '$1 ')
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
 * Segmenta el texto y devuelve un segmento por párrafo.
 * Cada segmento: { text, paragraphStart, paragraphEnd, paragraphTexts }
 * Solo se fracciona el párrafo que excede TARGET_WORDS_PER_SEGMENT.
 */
export const segmentText = (plainText) => {
    if (!plainText) return [];

    const paragraphs = plainText
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean);

    if (paragraphs.length === 0) return [];

    const segments = [];

    paragraphs.forEach((fullText, globalIndex) => {
        const paraWords = countWords(fullText);

        // ¿Este párrafo excede el objetivo? → fraccionar por oraciones completas
        if (paraWords > TARGET_WORDS_PER_SEGMENT) {
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

        // 1 párrafo = 1 segmento (sin mezclar nada del siguiente)
        segments.push({
            text: fullText,
            paragraphStart: globalIndex,
            paragraphEnd: globalIndex,
            paragraphTexts: [fullText]
        });
    });

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
