/**
 * IAStudioUtils.js
 * Utilidades para IA Studio: construcción de prompts con contexto selectivo y destino
 */

/**
 * Limpia el HTML a texto plano
 */
export const cleanText = (html) => {
    if (!html) return '';
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Construye el contexto SOLO con los documentos seleccionados por el usuario
 * @param {Object} activeBook - Libro activo
 * @param {Array} chapters - Todos los capítulos
 * @param {Array} selectedChapterIds - IDs de capítulos seleccionados
 * @param {Array} characters - Personajes
 * @param {Array} worldItems - Items del mundo (Master Doc)
 * @param {Array} selectedWorldItemIds - IDs de world items seleccionados
 * @returns {string} Contexto formateado para el prompt
 */
export const buildContextFromSelections = (
    activeBook,
    chapters,
    selectedChapterIds = [],
    characters = [],
    worldItems = [],
    selectedWorldItemIds = []
) => {
    const parts = [];

    // Información del libro
    if (activeBook) {
        parts.push('=== INFORMACIÓN DEL LIBRO ===');
        parts.push(`Título: ${activeBook.title || 'Sin título'}`);
        if (activeBook.description) parts.push(`Descripción: ${activeBook.description}`);
        if (activeBook.genre) parts.push(`Género: ${activeBook.genre}`);
    }

    // Capítulos seleccionados
    if (selectedChapterIds.length > 0) {
        chapters.forEach(chapter => {
            if (selectedChapterIds.includes(chapter.id)) {
                parts.push(`\n=== CAPÍTULO: ${chapter.title || 'Sin título'} ===`);
                if (chapter.status) parts.push(`Estado: ${chapter.status}`);
                parts.push(`\nContenido:\n${cleanText(chapter.content || '')}`);
            }
        });
    }

    // Personajes (siempre incluidos si hay)
    if (characters && characters.length > 0) {
        const validChars = characters.filter(c => !c.isCategory && c.name);
        if (validChars.length > 0) {
            parts.push(`\n=== PERSONAJES ===`);
            validChars.forEach(char => {
                parts.push(`- ${char.name}${char.role ? ` (${char.role})` : ''}${char.description ? `: ${cleanText(char.description)}` : ''}`);
            });
        }
    }

    // World Items (Master Doc) seleccionados
    if (worldItems && worldItems.length > 0 && selectedWorldItemIds.length > 0) {
        const validItems = worldItems.filter(item => selectedWorldItemIds.includes(item.id) && item.title && item.content);
        if (validItems.length > 0) {
            parts.push(`\n=== DOCUMENTACIÓN DEL MUNDO ===`);
            validItems.forEach(item => {
                parts.push(`[${item.title}]: ${cleanText(item.content).substring(0, 800)}`);
            });
        }
    }

    // Si no hay nada seleccionado, indicar
    if (selectedChapterIds.length === 0 && selectedWorldItemIds.length === 0) {
        parts.push('\n(Sin contexto seleccionado. El usuario no ha especificado documentos de referencia.)');
    }

    return parts.join('\n');
};

/**
 * Encuentra el capítulo o world item destino por ID
 */
export const findDestinationDoc = (destinationDoc, chapters, worldItems) => {
    if (!destinationDoc || destinationDoc.mode === 'auto' || destinationDoc.mode === 'new') {
        return null;
    }

    if (destinationDoc.docType === 'chapter') {
        return chapters.find(c => c.id === destinationDoc.docId) || null;
    }

    if (destinationDoc.docType === 'worldItem') {
        return worldItems.find(w => w.id === destinationDoc.docId) || null;
    }

    return null;
};

/**
 * Construye el prompt del sistema con la info de contexto y destino
 */
export const buildSystemPrompt = (action, context, destinationDoc, chapters, worldItems) => {
    const basePrompt = `Eres un asistente experto en escritura creativa, especializado en novelas y libros. Ayudas a escritores a mejorar su obra.`;

    // Determinar información del destino
    const dest = destinationDoc || { mode: 'auto' };
    let destinationInfo = '';

    if (dest.mode === 'auto') {
        destinationInfo = `📌 DESTINO: AUTOMÁTICO
La IA decidirá automáticamente qué documento necesita ser modificado basándose en el mensaje del usuario.
Si el usuario pide modificar el manuscrito, devuelve el contenido COMPLETO del capítulo modificado en HTML.
Si el usuario pide modificar el Master Doc, devuelve el contenido completo del item en HTML.
Si el usuario solo hace una pregunta o análisis, responde con texto normal.`;
    } else if (dest.mode === 'manual' && dest.docId) {
        const docInfo = findDestinationDoc(dest, chapters, worldItems);
        const docTitle = dest.docTitle || docInfo?.title || 'Documento';
        const docTypeLabel = dest.docType === 'worldItem' ? 'Master Doc' : 'Capítulo';

        destinationInfo = `📌 DESTINO: MANUAL (${docTypeLabel}: "${docTitle}")
⚠️ DEBES aplicar los cambios ÚNICAMENTE a este documento: "${docTitle}" (${docTypeLabel}).
Devuelve el contenido COMPLETO del documento modificado en formato HTML.
NO modifiques otros documentos. NO añadas texto adicional fuera del HTML.`;
    } else if (dest.mode === 'new') {
        destinationInfo = `📌 DESTINO: NUEVO DOCUMENTO
El usuario quiere crear contenido nuevo. Genera el contenido en formato HTML.
Sugiere un título para el nuevo documento.`;
    }

    const actionPrompts = {
        crear: `${basePrompt}

Tu tarea EXCLUSIVA es GENERAR contenido nuevo.

${destinationInfo}

⚠️ REGLA ABSOLUTA: Tu respuesta debe contener ÚNICA Y EXCLUSIVAMENTE el contenido del documento en HTML. NO añadas saludos, explicaciones, introducciones, despedidas, ni ningún texto fuera del HTML. SOLO HTML.

Contexto del libro:
${context}

IMPORTANTE: Devuelve SOLAMENTE el HTML del contenido. Cero texto adicional.`,

        modificar: `${basePrompt}

Tu tarea EXCLUSIVA es MODIFICAR el/los documento(s) actual(es) según las instrucciones del usuario.

${destinationInfo}

⚠️ REGLA ABSOLUTA: Tu respuesta debe contener ÚNICA Y EXCLUSIVAMENTE el contenido completo del documento modificado en HTML. NO añadas saludos, explicaciones, resúmenes de cambios, ni ningún texto fuera del HTML. SOLO HTML.

Contexto del libro:
${context}

IMPORTANTE: Devuelve SOLAMENTE el HTML del contenido completo del documento. Cero texto adicional.`,

        analizar: `${basePrompt}

Tu tarea es ANALIZAR el/los documento(s) de contexto y proporcionar retroalimentación detallada.

${destinationInfo}

Analiza sobre:
1. 📖 **Gramática y ortografía**: Errores encontrados
2. 🎭 **Estilo y voz narrativa**: Consistencia y calidad
3. 📊 **Ritmo y estructura**: Fluidez de la narrativa
4. 🔗 **Coherencia**: Con el tono del libro y personajes
5. 💡 **Sugerencias de mejora**: Puntos específicos

Contexto del libro:
${context}

IMPORTANTE: Sé constructivo y específico. Señala tanto fortalezas como áreas de mejora.`,

        sugerir: `${basePrompt}

Tu tarea es SUGERIR ideas creativas para mejorar la historia.

${destinationInfo}

Puedes proponer:
1. 💭 **Giros argumentales** que podrían funcionar
2. 👥 **Desarrollo de personajes** y arcos narrativos
3. 🎬 **Escenas alternativas** o nuevas escenas
4. 🎯 **Mejoras de tensión dramática**
5. 🌍 **Ampliación del mundo**

Contexto del libro:
${context}

IMPORTANTE: Sé creativo pero relevante al contexto.`,

        personalizado: `${basePrompt}

${destinationInfo}

📌 Si el usuario te pide MODIFICAR, AÑADIR, CAMBIAR, EDITAR, INSERTAR o CREAR contenido, debes devolver SOLAMENTE el contenido del documento modificado en formato HTML. Sigue las reglas de "modificar".

📌 Si el usuario te pide ANALIZAR, SUGERIR, PREGUNTAR o RECOMENDAR, responde con texto normal.

Contexto del libro:
${context}

Responde a la consulta del usuario de la manera más útil posible.`
    };

    return actionPrompts[action] || actionPrompts.personalizado;
};

/**
 * Intenta extraer solo el contenido HTML de la respuesta de la IA
 */
export const extractHtmlContent = (response) => {
    if (!response) return response;

    // Si ya es HTML puro
    if (/^\s*<(p|h[1-6]|div|section|article|ul|ol|table|br|span|strong|em|b|i|u)/i.test(response)) {
        return response;
    }

    // Buscar bloques de contenido HTML
    const htmlTagRegex = /<(p|h[1-6]|div|section|article|ul|ol|table|span|strong|em|b|i|u|br)[^>]*>[\s\S]*?<\/(\1)>/gi;
    const matches = [];
    let match;
    while ((match = htmlTagRegex.exec(response)) !== null) {
        matches.push(match[0]);
    }

    if (matches.length > 0) {
        return matches.join('\n');
    }

    // Último intento: desde el primer < hasta el último >
    if (response.includes('<') && response.includes('>')) {
        const firstTag = response.indexOf('<');
        const lastTag = response.lastIndexOf('>');
        if (firstTag !== -1 && lastTag > firstTag) {
            const extracted = response.substring(firstTag, lastTag + 1);
            if (extracted.includes('</')) {
                return extracted;
            }
        }
    }

    return '';
};

/**
 * Determina si una respuesta contiene contenido HTML aplicable
 */
export const hasHtmlContent = (response) => {
    if (!response) return false;
    return /<[a-z][\s\S]*?<\/[a-z]+>/i.test(response);
};

/**
 * Acciones rápidas disponibles
 */
export const QUICK_ACTIONS = [
    { id: 'personalizado', label: '💬 Personalizado', description: 'Escribe tu propia instrucción' },
    { id: 'crear', label: '✏️ Crear', description: 'Generar contenido nuevo' },
    { id: 'modificar', label: '📝 Modificar', description: 'Reescribir, expandir o resumir' },
    { id: 'analizar', label: '🔍 Analizar', description: 'Evaluar gramática, estilo y coherencia' },
    { id: 'sugerir', label: '💡 Sugerir', description: 'Proponer ideas y mejoras creativas' },
];

/**
 * IDs de sistema para Master Doc
 */
export const SYSTEM_WORLD_ITEM_IDS = ['system_personajes', 'system_estructura', 'system_core'];

/**
 * Títulos amigables para Master Doc
 */
export const SYSTEM_WORLD_ITEM_LABELS = {
    system_personajes: 'Personajes',
    system_estructura: 'Estructura',
    system_core: 'Información General',
};
