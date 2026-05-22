/**
 * IAStudioUtils.js
 * Utilidades para IA Studio: construcción de prompts con contexto selectivo y destino.
 * Usa JSON Structured Output para respuestas tipadas — elimina el parsing de HTML con regex.
 *
 * v2 — Soporte para:
 *   - Modo "fragmento" (patch) — edita solo una sección sin reescribir todo el documento
 *   - Escritura por secciones — genera capítulos largos en bloques acumulados
 *   - Smart Context — compresión automática de contexto pesado
 *   - Modificar sin doc completo — prompt inteligente según tamaño del cambio
 */

import DiffMatchPatch from 'diff-match-patch';

/**
 * Convierte texto plano (con saltos de línea y párrafos) a HTML seguro para el editor Tiptap.
 * Escapa todos los caracteres HTML especiales para evitar inyecciones e interpretaciones erróneas.
 */
export const plainTextToHtml = (text) => {
    if (!text) return '';
    
    // Escapar SOLO los caracteres HTML que son estructuralmente peligrosos.
    // Las comillas ("/') NO se escapan porque son texto plano válido dentro de <p> tags
    // y escaparlas genera &quot; que corrompe los diffs al comparar con el contenido original.
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        
    // Dividir en párrafos por dobles saltos de línea (\n\n)
    const paragraphs = escaped.split(/\n\n+/);
    
    return paragraphs
        .map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            // Reemplazar saltos de línea sencillos con saltos de línea HTML
            const withBreaks = trimmed.replace(/\n/g, '<br />');
            return `<p>${withBreaks}</p>`;
        })
        .filter(Boolean)
        .join('');
};

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Umbral en chars a partir del cual un capítulo se considera "pesado" para contexto */
export const HEAVY_CONTEXT_THRESHOLD = 1000000; // ~250,000 palabras (alto para soportar modelos con contextos gigantescos como Gemini)

/** Umbral de chars a mantener al comprimir contexto pesado (primeras + últimas N chars) */
export const SMART_CONTEXT_HEAD_TAIL = 20000;

// ─── Limpieza de texto ───────────────────────────────────────────────────────

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
 * Limpia HTML a prose limpio (conserva párrafos y headings pero elimina atributos)
 * Útil para enviar contexto de capítulos a la IA sin perder toda la estructura.
 */
export const cleanHtmlForContext = (html) => {
    if (!html) return '';
    // Remove tag attributes from allowed tags, strip all other tags
    const allowedTagsRe = /<(p|h[1-6]|blockquote|li)[^>]*>/gi;
    const otherTagsRe = new RegExp('<(?!/?(p|h[1-6]|blockquote|li|ul|ol)\\b)[^>]+>', 'gi');
    return html
        .replace(allowedTagsRe, (_, tag) => `<${tag}>`)
        .replace(otherTagsRe, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Convierte contenido HTML de Tiptap a texto plano limpio de alta calidad,
 * reemplazando bloques por saltos de línea y eliminando el formateo.
 */
export const cleanHtmlToPlainText = (html) => {
    if (!html) return '';
    
    let text = html;
    
    // 1. Reemplazar saltos de línea HTML por \n
    text = text.replace(/<br\s*\/?>/gi, '\n');
    
    // 2. Reemplazar cierres de bloques por \n\n
    text = text.replace(/<\/p>/gi, '\n\n')
               .replace(/<\/h[1-6]>/gi, '\n\n')
               .replace(/<\/li>/gi, '\n\n')
               .replace(/<\/div>/gi, '\n\n')
               .replace(/<\/blockquote>/gi, '\n\n');
               
    // 3. Eliminar cualquier otra etiqueta HTML
    text = text.replace(/<[^>]*>/g, '');
    
    // 4. Decodificar entidades HTML comunes
    text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#039;/g, "'");
        
    // 5. Normalizar espacios horizontales en cada línea
    text = text.split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n');
        
    // 6. Normalizar saltos de línea (máximo 2 consecutivos)
    text = text.replace(/\n{3,}/g, '\n\n');
    
    return text.trim();
};

// ─── Word-level Diff y Smart Merge ──────────────────────────────────────────

const _dmp = new DiffMatchPatch();

/**
 * Computa un diff a nivel de PALABRA en vez de carácter.
 * Tokeniza ambos textos en palabras y espacios, mapea cada token a un caracter único,
 * ejecuta DMP sobre los caracteres, y re-expande a los tokens originales.
 *
 * Resultado: cambios como `elfos` → `humanos` en vez de `elf` → `human`.
 */
export const computeWordDiff = (textA, textB) => {
    if (!textA && !textB) return [];
    if (!textA) return [[1, textB]];
    if (!textB) return [[-1, textA]];

    // Tokenizar: preservar palabras y separadores como tokens independientes
    const wordArray = [''];  // index 0 no se usa
    const wordHash = {};

    const wordsToChars = (text) => {
        // Dividir en tokens: secuencias de no-espacios (palabras) y secuencias de espacios
        const tokens = text.match(/\S+|\s+/g) || [];
        return tokens.map(token => {
            if (token in wordHash) {
                return wordHash[token];
            }
            wordArray.push(token);
            const char = String.fromCharCode(wordArray.length - 1);
            wordHash[token] = char;
            return char;
        }).join('');
    };

    const chars1 = wordsToChars(textA);
    const chars2 = wordsToChars(textB);

    const diffs = _dmp.diff_main(chars1, chars2);
    _dmp.diff_cleanupSemantic(diffs);

    // Re-expandir chars a tokens de palabras
    return diffs.map(([op, chars]) => {
        const decoded = Array.from(chars).map(c => wordArray[c.charCodeAt(0)]).join('');
        return [op, decoded];
    });
};

/**
 * Smart merge: fusiona una respuesta parcial de la IA con el documento original.
 *
 * Cuando la IA devuelve solo las secciones que modificó (omitiendo secciones sin cambios),
 * esta función detecta las secciones "faltantes" (eliminaciones grandes sin reemplazo)
 * y las preserva del original, aplicando solo los cambios reales.
 *
 * @param {string} originalText - Texto plano completo del documento original
 * @param {string} partialText - Texto plano parcial devuelto por la IA
 * @returns {string} - Texto plano completo con solo los cambios reales aplicados
 */
export const smartMergePartialResponse = (originalText, partialText) => {
    const diffs = computeWordDiff(originalText, partialText);

    let result = '';
    let i = 0;

    while (i < diffs.length) {
        const [op] = diffs[i];

        if (op === 0) {
            // Bloque igual — preservar tal cual
            result += diffs[i][1];
            i++;
            continue;
        }

        // Agrupar ops consecutivos de cambio (deletes + inserts)
        let deleteText = '';
        let insertText = '';
        while (i < diffs.length && diffs[i][0] !== 0) {
            if (diffs[i][0] === -1) deleteText += diffs[i][1];
            if (diffs[i][0] === 1) insertText += diffs[i][1];
            i++;
        }

        // Heurística: ¿es una sección faltante o un cambio real?
        const deleteWords = deleteText.trim().split(/\s+/).filter(Boolean).length;
        const insertWords = insertText.trim().split(/\s+/).filter(Boolean).length;

        if (deleteWords > 50 && insertWords < deleteWords * 0.3) {
            // Eliminación masiva sin reemplazo proporcional → sección faltante.
            // Preservar el texto original.
            result += deleteText;
        } else {
            // Cambio real (reemplazo de palabras, edición, etc.) → aplicar el cambio.
            result += insertText;
        }
    }

    return result;
};

// ─── Smart Context ───────────────────────────────────────────────────────────

/**
 * Comprime el contenido de un documento largo para reducir tokens en el contexto.
 * Mantiene inicio + fin del texto para preservar continuidad narrativa.
 *
 * @param {string} html - Contenido HTML del documento
 * @param {number} maxChars - Máximo de caracteres a mantener (head + tail)
 * @returns {string} - Texto comprimido listo para contexto
 */
export const smartCompressContext = (html, maxChars = SMART_CONTEXT_HEAD_TAIL * 2) => {
    if (!html) return '';
    const text = cleanHtmlToPlainText(html);
    if (text.length <= maxChars) return text;

    const half = Math.floor(maxChars / 2);
    const head = text.substring(0, half).trim();
    const tail = text.substring(text.length - half).trim();
    const omitted = text.length - maxChars;

    return `${head}\n\n[... ${omitted.toLocaleString()} caracteres omitidos para reducir contexto ...]\n\n${tail}`;
};

/**
 * Estima si un documento tiene contenido "pesado" para contexto
 */
export const isHeavyDocument = (html) => {
    if (!html) return false;
    return html.length > HEAVY_CONTEXT_THRESHOLD;
};

// ─── Construcción de contexto ────────────────────────────────────────────────

/**
 * Construye el contexto SOLO con los documentos seleccionados por el usuario.
 * Usa etiquetas XML semánticas para mejorar la comprensión del modelo.
 *
 * @param {boolean} compressHeavy - Si true, comprime capítulos pesados automáticamente
 */
export const buildContextFromSelections = (
    activeBook,
    chapters,
    selectedChapterIds = [],
    characters = [],
    worldItems = [],
    selectedWorldItemIds = [],
    compressHeavy = false
) => {
    const parts = [];

    // Información del libro
    if (activeBook) {
        parts.push('<book>');
        parts.push(`  <title>${activeBook.title || 'Sin título'}</title>`);
        if (activeBook.description) parts.push(`  <description>${activeBook.description}</description>`);
        if (activeBook.genre) parts.push(`  <genre>${activeBook.genre}</genre>`);
        parts.push('</book>');
    }

    // Capítulos seleccionados
    if (selectedChapterIds.length > 0) {
        parts.push('<manuscript>');
        chapters.forEach(chapter => {
            if (selectedChapterIds.includes(chapter.id)) {
                const rawContent = chapter.content || '';
                let content;

                if (compressHeavy && isHeavyDocument(rawContent)) {
                    content = smartCompressContext(rawContent);
                } else {
                    content = cleanHtmlToPlainText(rawContent);
                }

                parts.push(`  <chapter title="${(chapter.title || 'Sin título').replace(/"/g, "'")}"${chapter.status ? ` status="${chapter.status}"` : ''}${compressHeavy && isHeavyDocument(rawContent) ? ' compressed="true"' : ''}>`);
                parts.push(`    ${content}`);
                parts.push(`  </chapter>`);
            }
        });
        parts.push('</manuscript>');
    }

    // Personajes (siempre incluidos si hay)
    if (characters && characters.length > 0) {
        const validChars = characters.filter(c => !c.isCategory && c.name);
        if (validChars.length > 0) {
            parts.push('<characters>');
            validChars.forEach(char => {
                parts.push(`  <character name="${char.name}"${char.role ? ` role="${char.role}"` : ''}>${char.description ? cleanHtmlToPlainText(char.description) : ''}</character>`);
            });
            parts.push('</characters>');
        }
    }

    // World Items (Master Doc) seleccionados
    if (worldItems && worldItems.length > 0 && selectedWorldItemIds.length > 0) {
        const validItems = worldItems.filter(item => selectedWorldItemIds.includes(item.id) && item.title && item.content);
        if (validItems.length > 0) {
            parts.push('<world_building>');
            validItems.forEach(item => {
                const rawContent = item.content || '';
                let content;

                if (compressHeavy && isHeavyDocument(rawContent)) {
                    content = smartCompressContext(rawContent);
                } else {
                    content = cleanHtmlToPlainText(rawContent);
                }

                parts.push(`  <entry title="${(item.title || '').replace(/"/g, "'")}"${compressHeavy && isHeavyDocument(rawContent) ? ' compressed="true"' : ''}>`);
                parts.push(`    ${content}`);
                parts.push(`  </entry>`);
            });
            parts.push('</world_building>');
        }
    }

    // Si no hay nada seleccionado
    if (selectedChapterIds.length === 0 && selectedWorldItemIds.length === 0) {
        parts.push('<!-- No se ha seleccionado contexto específico. El usuario no ha indicado documentos de referencia. -->');
    }

    return parts.join('\n');
};

/**
 * Calcula el peso aproximado en tokens del contexto seleccionado.
 * Útil para mostrar advertencias en la UI.
 */
export const estimateContextWeight = (chapters, selectedChapterIds, worldItems, selectedWorldItemIds) => {
    let totalChars = 0;

    chapters.forEach(ch => {
        if (selectedChapterIds.includes(ch.id)) {
            totalChars += (ch.content || '').length;
        }
    });

    worldItems.forEach(w => {
        if (selectedWorldItemIds.includes(w.id)) {
            totalChars += (w.content || '').length;
        }
    });

    return {
        chars: totalChars,
        estimatedTokens: Math.ceil(totalChars / 4.2),
        isHeavy: totalChars > HEAVY_CONTEXT_THRESHOLD,
    };
};

// ─── Parsing de respuestas ───────────────────────────────────────────────────

/**
 * Resuelve un documento de destino a partir de un texto (ej. "Personajes" o el título de un capítulo)
 * @returns {{ docType: string, docId: string, title: string } | null}
 */
export const resolveTargetDoc = (targetStr, chapters = [], worldItems = []) => {
    if (!targetStr || typeof targetStr !== 'string') return null;

    const norm = targetStr.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // 1. Verificar primero secciones de sistema
    if (norm === 'personajes' || norm === 'system_personajes') {
        return { docType: 'worldItem', docId: 'system_personajes', title: 'Personajes' };
    }
    if (norm === 'estructura' || norm === 'system_estructura' || norm.includes('estructura de capitulo') || norm.includes('estructura de capitulos')) {
        return { docType: 'worldItem', docId: 'system_estructura', title: 'Estructura' };
    }
    if (norm === 'informacion general' || norm === 'system_core' || norm === 'core' || norm.includes('general')) {
        return { docType: 'worldItem', docId: 'system_core', title: 'Información General' };
    }

    // 2. Verificar documentos personalizados del Master Doc
    for (const item of worldItems) {
        if (item.title) {
            const itemNorm = item.title.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (itemNorm === norm || norm.includes(itemNorm) || itemNorm.includes(norm)) {
                return { docType: 'worldItem', docId: item.id, title: item.title };
            }
        }
    }

    // 3. Verificar capítulos del manuscrito
    for (const ch of chapters) {
        if (ch.title && !ch.isVolume) {
            const chNorm = ch.title.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (chNorm === norm || norm.includes(chNorm) || chNorm.includes(norm)) {
                return { docType: 'chapter', docId: ch.id, title: ch.title };
            }
        }
    }

    return null;
};

/**
 * Detecta si un string parece un JSON válido de respuesta estructurada
 */
export const isStructuredResponse = (text) => {
    if (!text) return false;
    const trimmed = text.trim();
    return trimmed.startsWith('{') && trimmed.endsWith('}');
};

/**
 * Parsea la respuesta JSON de la IA.
 * Soporta los tipos: content, patch, analysis, suggestion.
 *
 * @param {string} response - Respuesta completa de la IA
 * @param {Object} destinationDoc - Destino configurado {mode, docType, docId}
 * @returns {Array<{docType, docId, mode, title, content, responseType}>}
 */
export const parseDestinationsFromResponse = (response, destinationDoc, chapters = [], worldItems = []) => {
    if (!response) return [];

    // Attempt to parse as XML semantic tags
    const parsedXml = tryParseAIXml(response);
    if (parsedXml) {
        return buildBlocksFromParsed(parsedXml, destinationDoc, chapters, worldItems);
    }

    // Attempt to parse as structured JSON response
    const parsed = tryParseAIJson(response);
    if (parsed) {
        return buildBlocksFromParsed(parsed, destinationDoc, chapters, worldItems);
    }

    // Fallback: the model didn't use JSON or XML mode
    const html = extractHtmlContent(response);

    if (html) {
        const dest = destinationDoc || { mode: 'auto' };
        if (dest.mode === 'new') {
            return [{ docType: 'chapter', docId: null, mode: 'new', title: 'Nuevo documento', content: html, responseType: 'content' }];
        } else if (dest.mode === 'manual' && dest.docId) {
            return [{ docType: dest.docType, docId: dest.docId, mode: 'manual', title: dest.docTitle || 'Documento', content: html, responseType: 'content' }];
        } else {
            return [{ docType: 'chapter', docId: null, mode: 'auto', title: 'Automático', content: html, responseType: 'content' }];
        }
    }

    // Pure text response
    if (response.trim() && !response.startsWith('===')) {
        return [{ docType: 'text', docId: null, mode: 'text', title: 'Respuesta', content: response.trim(), responseType: 'analysis' }];
    }

    return [];
};

/**
 * Extrae el contenido de una etiqueta XML semántica.
 * Si la etiqueta fue abierta pero no se cerró debido a truncamiento,
 * extrae todo el contenido restante hasta el final de la respuesta.
 * Soporta búsqueda insensible a mayúsculas/minúsculas.
 */
export const extractXmlTag = (text, tagName) => {
    if (!text) return '';

    const openTag = `<${tagName}>`;
    const closeTag = `</${tagName}>`;

    let startIdx = text.indexOf(openTag);
    let contentStart = -1;

    if (startIdx !== -1) {
        contentStart = startIdx + openTag.length;
    } else {
        // Búsqueda insensible a mayúsculas/minúsculas
        const openTagLower = openTag.toLowerCase();
        const textLower = text.toLowerCase();
        startIdx = textLower.indexOf(openTagLower);
        if (startIdx === -1) return '';
        contentStart = startIdx + openTag.length;
    }

    const closeTagLower = closeTag.toLowerCase();
    const endIdx = text.toLowerCase().indexOf(closeTagLower, contentStart);

    if (endIdx !== -1) {
        return text.substring(contentStart, endIdx);
    }

    // Etiqueta truncada sin cierre: retornar todo el texto restante
    return text.substring(contentStart);
};

/**
 * Intenta parsear una respuesta XML semántica, tolerando etiquetas incompletas.
 * Retorna un objeto estructurado idéntico al esquema JSON tradicional para compatibilidad.
 */
export const tryParseAIXml = (text) => {
    if (!text) return null;

    // Detectar si hay presencia de la etiqueta de tipo XML clave
    const lowerText = text.toLowerCase();
    if (!lowerText.includes('<response_type>') && !lowerText.includes('<response-type>')) {
        return null;
    }

    // Normalizar si usaron guion en lugar de guion bajo
    const normalizedText = text
        .replace(/<response-type>/gi, '<response_type>')
        .replace(/<\/response-type>/gi, '</response_type>')
        .replace(/<target-doc>/gi, '<target_doc>')
        .replace(/<\/target-doc>/gi, '</target_doc>')
        .replace(/<content-html>/gi, '<content_html>')
        .replace(/<\/content-html>/gi, '</content_html>')
        .replace(/<content-markdown>/gi, '<content_markdown>')
        .replace(/<\/content-markdown>/gi, '</content_markdown>')
        .replace(/<content-text>/gi, '<content_text>')
        .replace(/<\/content-text>/gi, '</content_text>')
        .replace(/<replacement-markdown>/gi, '<replacement_markdown>')
        .replace(/<\/replacement-markdown>/gi, '</replacement_markdown>')
        .replace(/<replacement-text>/gi, '<replacement_text>')
        .replace(/<\/replacement-text>/gi, '</replacement_text>')
        .replace(/<section-index>/gi, '<section_index>')
        .replace(/<\/section-index>/gi, '</section_index>')
        .replace(/<total-sections>/gi, '<total_sections>')
        .replace(/<\/total-sections>/gi, '</total_sections>')
        .replace(/<response-scope>/gi, '<response_scope>')
        .replace(/<\/response-scope>/gi, '</response_scope>');

    const type = extractXmlTag(normalizedText, 'response_type').trim().toLowerCase();
    if (!type) return null;

    const parsed = { type };

    // Extraer scope de respuesta (partial / complete)
    const scope = extractXmlTag(normalizedText, 'response_scope').trim().toLowerCase();
    if (scope) parsed.scope = scope;

    if (type === 'content') {
        const textContent = extractXmlTag(normalizedText, 'content_text');
        const markdown = extractXmlTag(normalizedText, 'content_markdown');
        
        if (textContent) {
            parsed.html = plainTextToHtml(textContent).trim();
            parsed.text = textContent;
        } else if (markdown) {
            parsed.html = plainTextToHtml(markdown).trim();
            parsed.markdown = markdown;
        } else {
            const legacyHtml = extractXmlTag(normalizedText, 'content_html');
            if (legacyHtml && /<[a-z][\s\S]*?>/i.test(legacyHtml)) {
                parsed.html = legacyHtml;
            } else {
                parsed.html = plainTextToHtml(legacyHtml).trim();
            }
        }
        parsed.title = extractXmlTag(normalizedText, 'title').trim();
        parsed.target = extractXmlTag(normalizedText, 'target_doc').trim();
    } else if (type === 'patch') {
        parsed.original = extractXmlTag(normalizedText, 'original').trim();
        const replacementText = extractXmlTag(normalizedText, 'replacement_text');
        const replacementMarkdown = extractXmlTag(normalizedText, 'replacement_markdown');
        
        if (replacementText) {
            parsed.replacement = plainTextToHtml(replacementText).trim();
            parsed.replacementText = replacementText;
        } else if (replacementMarkdown) {
            parsed.replacement = plainTextToHtml(replacementMarkdown).trim();
            parsed.replacementMarkdown = replacementMarkdown;
        } else {
            const legacyReplacement = extractXmlTag(normalizedText, 'replacement');
            if (legacyReplacement && /<[a-z][\s\S]*?>/i.test(legacyReplacement)) {
                parsed.replacement = legacyReplacement;
            } else {
                parsed.replacement = plainTextToHtml(legacyReplacement).trim();
            }
        }
        parsed.context = extractXmlTag(normalizedText, 'context').trim();
        parsed.target = extractXmlTag(normalizedText, 'target_doc').trim();
    } else if (type === 'section') {
        const textContent = extractXmlTag(normalizedText, 'content_text');
        const markdown = extractXmlTag(normalizedText, 'content_markdown');
        
        if (textContent) {
            parsed.html = plainTextToHtml(textContent).trim();
            parsed.text = textContent;
        } else if (markdown) {
            parsed.html = plainTextToHtml(markdown).trim();
            parsed.markdown = markdown;
        } else {
            const legacyHtml = extractXmlTag(normalizedText, 'content_html');
            if (legacyHtml && /<[a-z][\s\S]*?>/i.test(legacyHtml)) {
                parsed.html = legacyHtml;
            } else {
                parsed.html = plainTextToHtml(legacyHtml).trim();
            }
        }
        parsed.title = extractXmlTag(normalizedText, 'title').trim();
        const sectionIdxStr = extractXmlTag(normalizedText, 'section_index').trim();
        const totalSectionsStr = extractXmlTag(normalizedText, 'total_sections').trim();
        parsed.sectionIndex = sectionIdxStr ? parseInt(sectionIdxStr, 10) : 1;
        parsed.totalSections = totalSectionsStr ? parseInt(totalSectionsStr, 10) : 1;
    } else if (type === 'analysis' || type === 'suggestion') {
        parsed.text = extractXmlTag(normalizedText, 'text');
    }

    return parsed;
};

/**
 * Tries to parse an AI JSON response string, tolerating minor issues.
 */
const tryParseAIJson = (text) => {
    if (!text) return null;

    const trimmed = text.trim();

    // Direct parse attempt
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.type === 'string') return parsed;
    } catch { /* continue */ }

    // Try extracting JSON from a code block: ```json ... ```
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try {
            const parsed = JSON.parse(codeBlockMatch[1].trim());
            if (parsed && typeof parsed.type === 'string') return parsed;
        } catch { /* continue */ }
    }

    // Try extracting a JSON object from anywhere in the string
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
            const parsed = JSON.parse(trimmed.substring(firstBrace, lastBrace + 1));
            if (parsed && typeof parsed.type === 'string') return parsed;
        } catch { /* continue */ }
    }

    return null;
};

/**
 * Converts a parsed AI JSON object into destination blocks.
 * Supports types: content, patch, analysis, suggestion.
 */
const buildBlocksFromParsed = (parsed, destinationDoc, chapters = [], worldItems = []) => {
    const responseType = parsed.type || 'analysis';

    // ── Patch response (fragmento modificado) ──
    if (responseType === 'patch' && parsed.original && parsed.replacement !== undefined) {
        let dest = destinationDoc || { mode: 'auto' };

        // Si es destino automático, intentar resolver desde parsed.target
        if (dest.mode === 'auto' && parsed.target) {
            const resolved = resolveTargetDoc(parsed.target, chapters, worldItems);
            if (resolved) {
                dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
            }
        }

        return [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: dest.docTitle || 'Fragmento',
            content: parsed.replacement,
            original: parsed.original,
            responseType: 'patch',
            isPatch: true,
            context: parsed.context || '',
        }];
    }

    // ── Content response (documento completo o parcial) ──
    if (responseType === 'content' && parsed.html) {
        let dest = destinationDoc || { mode: 'auto' };

        // Si es destino automático, intentar resolver desde parsed.target
        if (dest.mode === 'auto' && parsed.target) {
            const resolved = resolveTargetDoc(parsed.target, chapters, worldItems);
            if (resolved) {
                dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
            }
        }

        // Detectar si la IA declaró que la respuesta es parcial
        const isPartial = parsed.scope === 'partial';

        if (dest.mode === 'new') {
            return [{ docType: 'chapter', docId: null, mode: 'new', title: parsed.title || 'Nuevo documento', content: parsed.html, responseType: 'content', isPartial }];
        } else if (dest.mode === 'manual' && dest.docId) {
            return [{ docType: dest.docType, docId: dest.docId, mode: 'manual', title: dest.docTitle || 'Documento', content: parsed.html, responseType: 'content', isPartial }];
        } else {
            return [{ docType: 'chapter', docId: null, mode: 'auto', title: parsed.title || 'Automático', content: parsed.html, responseType: 'content', isPartial }];
        }
    }

    // ── Section response (escritura por secciones) ──
    if (responseType === 'section' && parsed.html) {
        const dest = destinationDoc || { mode: 'auto' };
        return [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: parsed.title || `Sección ${parsed.sectionIndex || 1}`,
            content: parsed.html,
            responseType: 'section',
            isSection: true,
            sectionIndex: parsed.sectionIndex,
            totalSections: parsed.totalSections,
        }];
    }

    // ── Analysis / Suggestion ──
    if ((responseType === 'analysis' || responseType === 'suggestion') && parsed.text) {
        return [{ docType: 'text', docId: null, mode: 'text', title: 'Respuesta', content: parsed.text.trim(), responseType }];
    }

    // Fallback
    const fallbackText = parsed.text || parsed.html || JSON.stringify(parsed);
    return [{ docType: 'text', docId: null, mode: 'text', title: 'Respuesta', content: fallbackText, responseType: 'analysis' }];
};

// ─── Patch (Modo Fragmento) ───────────────────────────────────────────────────

/**
 * Aplica un patch al HTML de un documento.
 * Busca el texto `original` en el HTML y lo reemplaza con `replacement`.
 * Tolerante a diferencias menores de espacios/formato.
 *
 * @param {string} chapterHtml - HTML completo del capítulo
 * @param {string} original - Fragmento original a reemplazar (texto plano o HTML)
 * @param {string} replacement - Nuevo contenido (HTML)
 * @returns {{ success: boolean, html: string, method: string }}
 */
export const applyPatch = (chapterHtml, original, replacement) => {
    if (!chapterHtml || !original) {
        return { success: false, html: chapterHtml, method: 'none' };
    }

    // 1. Intento exacto en HTML
    if (chapterHtml.includes(original)) {
        return {
            success: true,
            html: chapterHtml.replace(original, replacement),
            method: 'exact_html',
        };
    }

    // 2. Búsqueda por texto plano normalizado
    const originalClean = cleanText(original).toLowerCase().replace(/\s+/g, ' ').trim();

    // Extraer párrafos del HTML del capítulo
    const paragraphRegex = /<(p|h[1-6]|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    const paragraphs = [];

    while ((match = paragraphRegex.exec(chapterHtml)) !== null) {
        paragraphs.push({
            full: match[0],
            tag: match[1],
            innerText: cleanText(match[2]).toLowerCase().replace(/\s+/g, ' ').trim(),
            index: match.index,
        });
    }

    // Buscar el párrafo más parecido al fragmento original
    let bestMatch = null;
    let bestScore = 0;

    for (const para of paragraphs) {
        if (originalClean.length > 20 && para.innerText.includes(originalClean.substring(0, 40))) {
            const score = longestCommonSubstring(para.innerText, originalClean);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = para;
            }
        }
    }

    if (bestMatch && bestScore > 30) {
        const newHtml = chapterHtml.substring(0, bestMatch.index)
            + replacement
            + chapterHtml.substring(bestMatch.index + bestMatch.full.length);
        return { success: true, html: newHtml, method: 'fuzzy_paragraph' };
    }

    // 3. Fallback: no encontrado — retornar sin cambios
    return { success: false, html: chapterHtml, method: 'not_found' };
};

/**
 * Calcula la longitud del substring común más largo (LCS simplificado para scoring)
 */
const longestCommonSubstring = (a, b) => {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    let maxLen = 0;
    for (let i = 0; i < shorter.length - 10; i++) {
        const sub = shorter.substring(i, i + 20);
        if (longer.includes(sub)) {
            maxLen = Math.max(maxLen, sub.length);
        }
    }
    return maxLen;
};

// ─── Destino ─────────────────────────────────────────────────────────────────

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

// ─── Prompts del sistema ─────────────────────────────────────────────────────

/**
 * Construye el prompt del sistema según acción y destino seleccionado.
 *
 * Acciones:
 *  - crear       → type:"content"   (HTML completo del documento nuevo)
 *  - modificar   → type:"content"   (HTML completo o parcial según tamaño del cambio)
 *  - fragmento   → type:"patch"     (solo el fragmento modificado)
 *  - seccion     → type:"section"   (sección específica del documento)
 *  - analizar    → type:"analysis"  (markdown)
 *  - sugerir     → type:"suggestion"(markdown)
 *  - personalizado → detecta automáticamente
 */
export const buildSystemPrompt = (action, context, destinationDoc, activeChapter, extraOptions = {}) => {
    const basePrompt = `Eres un asistente experto en escritura creativa, especializado en novelas y libros. Ayudas a escritores a mejorar su obra.`;

    const dest = destinationDoc || { mode: 'auto' };
    const chaptersList = extraOptions.chapters || [];
    const worldItemsList = extraOptions.worldItems || [];

    // Construcción de la lista de destinos disponibles
    const availableTargets = [];
    // Añadir secciones del sistema de Master Doc
    SYSTEM_WORLD_ITEM_IDS.forEach(wid => {
        const label = SYSTEM_WORLD_ITEM_LABELS[wid] || wid;
        availableTargets.push(`- "${label}" (Sección del Master Doc)`);
    });
    // Añadir ítems personalizados de Master Doc
    worldItemsList.filter(w => !SYSTEM_WORLD_ITEM_IDS.includes(w.id)).forEach(w => {
        if (w.title) availableTargets.push(`- "${w.title}" (Master Doc)`);
    });
    // Añadir capítulos
    chaptersList.filter(c => !c.isVolume).forEach(c => {
        if (c.title) availableTargets.push(`- "${c.title}" (Capítulo)`);
    });

    const targetsStr = availableTargets.length > 0
        ? `\nDocumentos y secciones disponibles que puedes modificar:\n${availableTargets.join('\n')}\n`
        : '';

    // Destination description
    let docDescription = '';
    let contentInstruction = '';

    if (dest.mode === 'manual' && dest.docId) {
        const docLabel = dest.docType === 'worldItem' ? 'Master Doc' : 'Capítulo';
        docDescription = `"${dest.docTitle || 'Documento'}" (${docLabel})`;
        contentInstruction = `Modifica el documento especificado y devuelve su contenido en texto plano limpio dentro de la etiqueta <content_text>.`;
    } else if (dest.mode === 'new') {
        docDescription = 'Nuevo documento';
        contentInstruction = `Genera el contenido en texto plano limpio completo del nuevo documento dentro de la etiqueta <content_text>. Sugiere un título dentro de la etiqueta <title>.`;
    } else {
        docDescription = 'Automático (La IA determina el destino)';
        contentInstruction = `Devuelve el contenido en texto plano limpio dentro de la etiqueta <content_text>. Si el contenido modificado/añadido está destinado a una sección del Master Doc o a un capítulo específico, indica el título exacto de ese documento dentro de la etiqueta <target_doc> (ej. <target_doc>Personajes</target_doc>) para que la app sepa dónde guardarlo automáticamente.${targetsStr}`;
    }

    const xmlSchemaContent = `
FORMATO DE RESPUESTA OBLIGATORIO — Debes responder SIEMPRE estructurando tu respuesta exclusivamente usando las siguientes etiquetas XML semánticas:

Para crear o modificar contenido:
<response_type>content</response_type>
<response_scope>complete o partial (OBLIGATORIO: indica si tu respuesta contiene el documento COMPLETO con todos sus párrafos y secciones, o solo los fragmentos que modificaste)</response_scope>
<target_doc>Nombre exacto de la sección del Master Doc (ej. 'Personajes', 'Estructura de Capítulos', 'Información General') o título de capítulo existente al que va dirigido este contenido (opcional, muy útil si el destino es automático)</target_doc>
<title>Título sugerido (solo si es documento nuevo, opcional)</title>
<content_text>
  Escribe aquí el contenido modificado o nuevo exclusivamente en texto plano limpio y puro.
  - Separa los párrafos únicamente con un doble salto de línea completo (\\n\\n).
  - Queda COMPLETAMENTE PROHIBIDO usar cualquier tipo de formato Markdown (como **, *, #, lista con guiones, etc.) o etiquetas HTML (como <p>, <strong>, <em>, etc.).
  - Escribe en prosa narrativa limpia y fluida, sin ningún tipo de código o adorno tipográfico.
  - Las comillas dobles (") son signos de puntuación estándar. Escríbelas de forma continua y natural en la misma línea del texto para diálogos o términos específicos (ej. "Recipiente Nulo" o "esclavo corporativo"), sin añadir saltos de línea ni espaciados artificiales a su alrededor.
</content_text>

Para análisis de texto:
<response_type>analysis</response_type>
<text>
  Tu análisis detallado en texto plano limpio (sin Markdown ni HTML, párrafos separados por \\n\\n)...
</text>

Para sugerencias creativas:
<response_type>suggestion</response_type>
<text>
  Tus sugerencias creativas en texto plano limpio (sin Markdown ni HTML, párrafos separados por \\n\\n)...
</text>

REGLAS CRÍTICAS DE PRESERVACIÓN Y FORMATO (TEXTO PLANO ESTRICTO):
- Responde usando estrictamente las etiquetas XML anteriores, no incluyas ningún texto de saludo o despedida fuera de las etiquetas.
- REGLA DE PRESERVACIÓN DE ALTA FIDELIDAD: Al modificar, queda ESTRICTAMENTE PROHIBIDO resumir, simplificar, acortar, o eliminar información, listas, nombres o secciones de lore que ya existan en el texto original, a menos que el usuario lo haya solicitado explícitamente de forma directa. Preserva cada párrafo, descripción y detalle palabra por palabra si no es afectado directamente por la instrucción.
- Queda COMPLETAMENTE PROHIBIDO usar cualquier tipo de formato de Markdown (como **, *, #, -, etc.) o etiquetas HTML (como <p>, <strong>, <em>) dentro de <content_text>, <replacement_text> o <text>. La prosa debe ser texto plano puro.
- Los párrafos se separan únicamente por un doble salto de línea (\\n\\n).
- Usa comillas dobles estándar (") de forma natural y fluida dentro de las oraciones en la misma línea. No agregues espacios innecesarios ni saltos de línea alrededor de las comillas.
- NUNCA uses bloques de código con triple comilla invertida (\`\`\`) ni de JSON ni de XML alrededor del documento. Responde en texto plano con las etiquetas XML directamente.`;

    const xmlSchemaPatch = `
FORMATO DE RESPUESTA OBLIGATORIO — Modo "Fragmento" (patch):

Responde estructurando tu respuesta exclusivamente usando las siguientes etiquetas XML semánticas:
<response_type>patch</response_type>
<target_doc>Nombre exacto de la sección del Master Doc (ej. 'Personajes', 'Estructura de Capítulos', 'Información General') o título de capítulo existente al que va dirigido este cambio (opcional, muy útil si el destino es automático)</target_doc>
<original>El texto EXACTO del fragmento original que vas a modificar (texto plano literal extraído del documento original, tal cual, sin formato ni HTML)</original>
<replacement_text>
  Escribe el nuevo contenido exclusivamente en texto plano limpio (sin **, sin *, sin #, usa saltos de línea \\n\\n para párrafos) para reemplazar ese fragmento.
  - Queda COMPLETAMENTE PROHIBIDO usar etiquetas HTML o formato Markdown. Escribe en prosa nativa limpia.
  - Usa comillas dobles estándar (") de forma natural, fluida e integrada en el texto de la misma línea, sin añadir saltos de línea ni espaciados incorrectos alrededor de las mismas.
</replacement_text>
<context>Breve descripción de qué cambió y por qué (1-2 frases)</context>

REGLAS CRÍTICAS para modo patch:
- En <original>: copia exactamente el texto plano literal del fragmento que se quiere cambiar (sin formato ni asteriscos).
- En <replacement_text>: escribe el nuevo contenido en texto plano limpio que reemplazará ese fragmento.
- NO reescribas el documento completo — solo el fragmento indicado.
- Responde usando estrictamente las etiquetas XML anteriores, no incluyas ningún texto adicional ni bloques \`\`\`.`;

    const xmlSchemaSection = `
FORMATO DE RESPUESTA OBLIGATORIO — Modo "Sección":

Responde estructurando tu respuesta exclusivamente usando las siguientes etiquetas XML semánticas:
<response_type>section</response_type>
<title>Nombre de la sección</title>
<section_index>${extraOptions.sectionIndex || 1}</section_index>
<total_sections>${extraOptions.totalSections || 1}</total_sections>
<content_text>
  Escribe aquí el contenido en texto plano limpio para esta sección específica...
  - Queda COMPLETAMENTE PROHIBIDO usar etiquetas HTML o formato Markdown. Escribe en prosa nativa limpia.
  - Usa comillas dobles estándar (") de forma natural, fluida e integrada en el texto de la misma línea, sin añadir saltos de línea ni espaciados incorrectos alrededor de las mismas.
</content_text>

REGLAS CRÍTICAS:
- Escribe SOLO la sección indicada, no el capítulo completo.
- El contenido debe ser prosa narrativa de texto plano lista para insertar en el documento.
- Responde usando estrictamente las etiquetas XML anteriores, no incluyas ningún texto de saludo o despedida.`;

    // ── Prompts por acción ──
    const actionPrompts = {
        crear: `${basePrompt}

🎯 ACCIÓN: CREAR contenido nuevo.
📌 Destino: ${docDescription}

${contentInstruction}

Escribe contenido original, rico y bien estructurado. Para textos largos, usa párrafos bien desarrollados en texto plano.

${xmlSchemaContent}

Contexto del libro:
${context}`,

        modificar: `${basePrompt}

🎯 ACCIÓN: MODIFICAR contenido existente.
📌 Destino: ${docDescription}

${contentInstruction}

ESTRATEGIA DE RESPUESTA SEGÚN MAGNITUD DEL CAMBIO:
- Si el cambio afecta POCAS PALABRAS o FRASES aisladas (ej. reemplazar un nombre, corregir un dato) → USA <response_type>content</response_type> con <response_scope>partial</response_scope> devolviendo SOLO las secciones/párrafos que contienen los cambios (con suficiente contexto para identificar dónde van). La app fusionará automáticamente los fragmentos devueltos con el documento original.
- Si el cambio afecta la MAYORÍA del documento (>50% del contenido) → USA <response_type>content</response_type> con <response_scope>complete</response_scope> devolviendo el documento COMPLETO.
- Si el cambio es UN SOLO PÁRRAFO o FRASE específica → Considera usar <response_type>patch</response_type> con <replacement_text>.

⚠️ DIRECTRICES DE FIDELIDAD NARRATIVA:
- NUNCA resumas, omitas ni abrevies la información que SÍ devuelves. Cada sección devuelta debe mantener su extensión y riqueza original, con solo los cambios solicitados aplicados.
- Si usas scope "partial", asegúrate de incluir las secciones completas donde ocurren los cambios (no fragmentos sueltos sin contexto).

${xmlSchemaContent}

Contexto del libro:
${context}`,

        fragmento: `${basePrompt}

🎯 ACCIÓN: EDITAR FRAGMENTO (patch mode).
📌 Destino: ${docDescription}

El usuario ha seleccionado un fragmento específico de su texto para que lo modifiques.
Tu tarea es:
1. Recibir el fragmento original
2. Aplicar los cambios solicitados SOLO a ese fragmento
3. Devolver el fragmento modificado en texto plano limpio dentro de <replacement_text>

NO reescribas el documento completo. Trabaja exclusivamente con el fragmento proporcionado.

${xmlSchemaPatch}

Contexto del libro:
${context}`,

        seccion: `${basePrompt}

🎯 ACCIÓN: ESCRIBIR SECCIÓN ${extraOptions.sectionIndex || '?'} DE ${extraOptions.totalSections || '?'}.
📌 Destino: ${docDescription}
📋 Descripción de esta sección: ${extraOptions.sectionDescription || 'Continúa la narrativa'}

Estás escribiendo una sección específica de un capítulo o documento largo.
- Mantén la coherencia con las secciones anteriores si se proporcionan en el contexto.
- Ajusta el ritmo y el tono a la posición de esta sección en el documento.
- Escribe prosa narrativa completa y rica en texto plano.

${xmlSchemaSection}

Contexto del libro:
${context}`,

        analizar: `${basePrompt}

🎯 ACCIÓN: ANALIZAR el contenido.

Analiza el contexto proporcionado y da retroalimentación sobre:
1. **Gramática y ortografía** — Errores y correcciones
2. **Estilo y voz narrativa** — Consistencia y calidad
3. **Ritmo y estructura** — Fluidez narrativa
4. **Coherencia** — Conectividad con personajes y tono
5. **Sugerencias de mejora** — Puntos específicos

Responde con <response_type>analysis</response_type> y usa texto plano claro y estructurado con saltos de línea dobles (\\n\\n) dentro de la etiqueta <text>. Queda prohibido usar formato markdown o html.

${xmlSchemaContent}

Contexto del libro:
${context}`,

        sugerir: `${basePrompt}

🎯 ACCIÓN: SUGERIR ideas creativas.

Basado en el contexto, propón ideas para mejorar la historia:
1. **Giros argumentales** que podrían funcionar
2. **Desarrollo de personajes** y arcos narrativos
3. **Escenas alternativas** o nuevas escenas
4. **Mejoras de tensión dramática**
5. **Ampliación del mundo**

Responde con <response_type>suggestion</response_type> y usa texto plano claro y estructurado con saltos de línea dobles (\\n\\n) dentro de la etiqueta <text>. Sé creativo pero relevante. Queda prohibido usar formato markdown o html.

${xmlSchemaContent}

Contexto del libro:
${context}`,

        personalizado: `${basePrompt}

📌 Destino configurado: ${docDescription}

Determina el tipo de respuesta según lo que pida el usuario:
- Si pide CREAR, ESCRIBIR, AÑADIR → usa <response_type>content</response_type> con <response_scope>complete</response_scope> y devuelve texto plano en <content_text>
- Si pide MODIFICAR, REESCRIBIR, MEJORAR contenido → usa <response_type>content</response_type> y devuelve texto plano en <content_text>. Usa <response_scope>partial</response_scope> si solo devuelves las secciones afectadas, o <response_scope>complete</response_scope> si devuelves el documento completo.
- Si pide editar UN FRAGMENTO, UNA SECCIÓN, UN PÁRRAFO específico → usa <response_type>patch</response_type> con <original> + <replacement_text>
- Si pide ANALIZAR, EVALUAR, REVISAR → usa <response_type>analysis</response_type> con texto plano en <text>
- Si pide SUGERIR, PROPONER, IDEAS → usa <response_type>suggestion</response_type> con texto plano en <text>

⚠️ DIRECTRICES DE FIDELIDAD NARRATIVA:
- NUNCA resumas, omitas ni abrevies la información que SÍ devuelves. Cada sección devuelta debe mantener su extensión y detalle original.
- Si usas scope "partial", la app fusionará automáticamente tu respuesta con el documento original, preservando las secciones no devueltas.

${xmlSchemaContent}

Contexto del libro:
${context}`
    };

    return actionPrompts[action] || actionPrompts.personalizado;
};

// ─── Extracción HTML (fallback) ──────────────────────────────────────────────

/**
 * Intenta extraer solo el contenido HTML de la respuesta de la IA (fallback legacy).
 * Solo se usa cuando el modelo no devolvió JSON válido.
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
    const parsed = tryParseAIJsonExported(response);
    if (parsed) return parsed.type === 'content' && !!parsed.html;
    return /<[a-z][\s\S]*?<\/[a-z]+>/i.test(response);
};

/**
 * Exportable wrapper for tryParseAIJson (for use in components)
 */
export const tryParseAIJsonExported = (text) => {
    if (!text) return null;
    const parsedXml = tryParseAIXml(text);
    if (parsedXml) return parsedXml;

    const trimmed = text.trim();
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.type === 'string') return parsed;
    } catch { /* continue */ }

    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try {
            const parsed = JSON.parse(codeBlockMatch[1].trim());
            if (parsed && typeof parsed.type === 'string') return parsed;
        } catch { /* continue */ }
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
            const parsed = JSON.parse(trimmed.substring(firstBrace, lastBrace + 1));
            if (parsed && typeof parsed.type === 'string') return parsed;
        } catch { /* continue */ }
    }
    return null;
};

// ─── Acciones rápidas ────────────────────────────────────────────────────────

/**
 * Acciones rápidas disponibles en IA Studio
 */
export const QUICK_ACTIONS = [
    { id: 'personalizado', label: '💬 Personalizado', description: 'Escribe tu propia instrucción' },
    { id: 'crear', label: '✏️ Crear', description: 'Generar contenido nuevo' },
    { id: 'modificar', label: '📝 Modificar', description: 'Reescribir, expandir o resumir' },
    { id: 'fragmento', label: '✂️ Fragmento', description: 'Editar solo una sección o párrafo' },
    { id: 'analizar', label: '🔍 Analizar', description: 'Evaluar gramática, estilo y coherencia' },
    { id: 'sugerir', label: '💡 Sugerir', description: 'Proponer ideas y mejoras creativas' },
];

// ─── Master Doc ──────────────────────────────────────────────────────────────

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
