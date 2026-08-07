/**
 * NarradorSegmenter — Divide el texto de un capítulo en segmentos narrables (~150 palabras)
 * y genera hashes deterministas para invalidación de caché.
 *
 * Segmentos más pequeños = mayor atomicidad:
 * - "Siguiente/Anterior" salta menos texto
 * - Precisión al retomar posición guardada
 * - Caché más granular (re-narra menos texto si se edita)
 */

const WORDS_PER_SEGMENT = 150;

/**
 * Limpia el texto de un capítulo para narración:
 * - Elimina menciones tipo @Nombre (las deja solo con el nombre)
 * - Elimina etiquetas HTML residuales
 * - Normaliza espacios y saltos de línea
 * - Elimina contenido de notas (marcas tipo inline note)
 */
export const cleanTextForNarration = (htmlOrText) => {
    if (!htmlOrText) return '';

    // Si viene HTML, lo convertimos a texto
    let text = htmlOrText;

    // Quitar marcas de notas inline: <mark data-note-id="...">texto</mark> → texto
    text = text.replace(/<mark[^>]*data-note-id[^>]*>([\s\S]*?)<\/mark>/gi, '$1');

    // Quitar menciones: <span data-char-id="...">texto</span> → texto
    text = text.replace(/<span[^>]*data-char-id[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    text = text.replace(/<span[^>]*data-ghost-char-id[^>]*>([\s\S]*?)<\/span>/gi, '$1');

    // Quitar menciones @Nombre: la dejamos como "Nombre" sin @
    text = text.replace(/@([A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+?)<\/span>/gi, '$1');
    text = text.replace(/<span[^>]*>@?([^<]+?)<\/span>/gi, '$1');

    // Strippear etiquetas HTML restantes y decodificar entidades básicas
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    text = tempDiv.textContent || '';

    // Normalizar espacios
    text = text
        .replace(/\u00a0/g, ' ')           // NBSP → espacio
        .replace(/[ \t]+/g, ' ')            // múltiples espacios/tabs → uno
        .replace(/\n{3,}/g, '\n\n')         // saltos de línea excesivos
        .trim();

    return text;
};

/**
 * Divide texto plano en segmentos de ~150 palabras.
 * Intenta cortar en límites de párrafo (\n\n) y luego en oraciones.
 */
export const segmentText = (plainText) => {
    if (!plainText) return [];

    const paragraphs = plainText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

    const segments = [];
    let currentSegment = [];
    let currentWordCount = 0;

    const flushSegment = () => {
        if (currentSegment.length > 0) {
            segments.push(currentSegment.join(' ').trim());
            currentSegment = [];
            currentWordCount = 0;
        }
    };

    for (const paragraph of paragraphs) {
        const paraWords = paragraph.split(/\s+/).filter(Boolean).length;

        // Si un solo párrafo excede el límite, lo partimos por oraciones
        if (paraWords > WORDS_PER_SEGMENT) {
            flushSegment();
            const sentences = paragraph.split(/(?<=[.!?…])\s+/).filter(Boolean);
            let sentenceBuffer = [];
            let sentenceCount = 0;

            for (const sentence of sentences) {
                const sWords = sentence.split(/\s+/).filter(Boolean).length;
                if (sentenceCount + sWords > WORDS_PER_SEGMENT && sentenceCount > 0) {
                    segments.push(sentenceBuffer.join(' ').trim());
                    sentenceBuffer = [];
                    sentenceCount = 0;
                }
                sentenceBuffer.push(sentence);
                sentenceCount += sWords;
            }

            if (sentenceBuffer.length > 0) {
                segments.push(sentenceBuffer.join(' ').trim());
            }
            continue;
        }

        // Si ya acumulamos bastante, cerramos el segmento
        if (currentWordCount + paraWords > WORDS_PER_SEGMENT && currentWordCount > 0) {
            flushSegment();
        }

        currentSegment.push(paragraph);
        currentWordCount += paraWords;
    }

    flushSegment();

    // Si el texto no tenía párrafos separados, partimos todo en trozos
    if (segments.length === 0 && plainText.trim()) {
        const words = plainText.split(/\s+/).filter(Boolean);
        for (let i = 0; i < words.length; i += WORDS_PER_SEGMENT) {
            segments.push(words.slice(i, i + WORDS_PER_SEGMENT).join(' '));
        }
    }

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
 * Prepara los segmentos de un capítulo completo con su hash.
 * @param {string} htmlOrText - HTML o texto del capítulo
 * @returns {Array<{index: number, text: string, hash: string}>}
 */
export const prepareSegments = (htmlOrText) => {
    const cleaned = cleanTextForNarration(htmlOrText);
    const rawSegments = segmentText(cleaned);
    return rawSegments.map((text, index) => ({
        index,
        text,
        hash: fnv1a(text)
    }));
};

export default {
    cleanTextForNarration,
    segmentText,
    fnv1a,
    prepareSegments
};