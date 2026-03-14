/**
 * ChunkService.js
 * Lógica del "Divisor en Cascada" para fragmentación inteligente de texto.
 */

const MAX_CHUNK_LENGTH = 2000;

/**
 * Divide un párrafo largo en sub-chunks más pequeños buscando el punto seguido más cercano.
 * @param {string} text - El texto del párrafo.
 * @returns {string[]} - Array de fragmentos.
 */
const splitLargeParagraph = (text) => {
    if (text.length <= MAX_CHUNK_LENGTH) return [text];

    const middle = Math.floor(text.length / 2);
    
    // Buscar el punto y seguido ". " más cercano al centro
    const leftDot = text.lastIndexOf(". ", middle);
    const rightDot = text.indexOf(". ", middle);
    
    let splitIndex = -1;

    if (leftDot !== -1 && rightDot !== -1) {
        // Elegir el más cercano al centro
        splitIndex = (middle - leftDot <= rightDot - middle) ? leftDot : rightDot;
    } else if (leftDot !== -1) {
        splitIndex = leftDot;
    } else if (rightDot !== -1) {
        splitIndex = rightDot;
    }

    // Si no hay puntos, buscar un espacio como fallback
    if (splitIndex === -1) {
        const leftSpace = text.lastIndexOf(" ", middle);
        const rightSpace = text.indexOf(" ", middle);
        
        if (leftSpace !== -1 && rightSpace !== -1) {
            splitIndex = (middle - leftSpace <= rightSpace - middle) ? leftSpace : rightSpace;
        } else {
            splitIndex = leftSpace !== -1 ? leftSpace : rightSpace;
        }
    }

    // Si no hay ni espacios (caso extremo), dividir por la mitad
    if (splitIndex === -1) splitIndex = middle;

    // Dividir (sumamos 1 o 2 para incluir el punto o el espacio en la primera mitad si es necesario)
    // Para ". ", dividimos después del punto
    const actualSplit = text.substring(splitIndex, splitIndex + 2) === ". " ? splitIndex + 1 : splitIndex;
    
    const firstHalf = text.substring(0, actualSplit).trim();
    const secondHalf = text.substring(actualSplit).trim();

    return [...splitLargeParagraph(firstHalf), ...splitLargeParagraph(secondHalf)];
};

/**
 * Toma un texto completo y lo convierte en una lista de chunks listos para Firebase.
 * @param {string} fullText - El texto del capítulo (puede contener HTML).
 * @returns {Object[]} - Array de objetos chunk.
 */
export const prepareChunksFromText = (fullText) => {
    if (!fullText) return [];

    // Limpiar HTML antes de fragmentar
    // Eliminamos etiquetas pero mantenemos párrafos (sustituyendo <p> por saltos de línea)
    let cleanText = fullText
        .replace(/<\/p>/gi, "\n\n") // Convertir cierres de párrafo en saltos dobles
        .replace(/<br\s*\/?>/gi, "\n") // Convertir BR en saltos simples
        .replace(/<[^>]+>/g, ""); // Eliminar cualquier otra etiqueta HTML

    // Decodificar entidades HTML comunes (ej: &nbsp;, &quot;)
    const entities = {
        '&nbsp;': ' ',
        '&quot;': '"',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&#39;': "'",
        '&ldquo;': '"',
        '&rdquo;': '"',
        '&lsquo;': "'",
        '&rsquo;': "'"
    };
    
    Object.keys(entities).forEach(entity => {
        cleanText = cleanText.replace(new RegExp(entity, 'g'), entities[entity]);
    });

    // Paso 1: División primaria por párrafos
    const paragraphs = cleanText.split(/\n\n+/).filter(p => p.trim().length > 0);
    
    const allChunks = [];
    let currentChunkText = "";
    let chunkCount = 0;

    const finalizeChunk = (text) => {
        if (!text.trim()) return;
        chunkCount++;
        allChunks.push({
            orden: chunkCount,
            textoActual: text.trim(),
            textoGenerado: "",
            estado: "Pendiente",
            audioId: `chk_${Math.random().toString(36).substr(2, 9)}`
        });
    };

    paragraphs.forEach((p) => {
        const paragraphText = p.trim();
        
        // Si el párrafo solo ya excede el límite, hay que dividirlo
        if (paragraphText.length > MAX_CHUNK_LENGTH) {
            // Guardar lo que llevamos acumulado primero
            if (currentChunkText) {
                finalizeChunk(currentChunkText);
                currentChunkText = "";
            }
            
            // Dividir el párrafo gigante y guardar sus partes
            const splitParts = splitLargeParagraph(paragraphText);
            splitParts.forEach(part => finalizeChunk(part));
            return;
        }

        // Si añadir este párrafo excede el límite, cerramos el chunk actual
        if (currentChunkText.length + paragraphText.length + 2 > MAX_CHUNK_LENGTH) {
            finalizeChunk(currentChunkText);
            currentChunkText = paragraphText;
        } else {
            // Añadir párrafo al chunk actual (con separación si ya hay texto)
            currentChunkText = currentChunkText 
                ? `${currentChunkText}\n\n${paragraphText}` 
                : paragraphText;
        }
    });

    // Guardar el último resto
    if (currentChunkText) {
        finalizeChunk(currentChunkText);
    }

    return allChunks;
};
