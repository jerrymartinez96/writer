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
    // y escaparlas genera " que corrompe los diffs al comparar con el contenido original.
    const escaped = text
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>');
        
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

// ═══════════════════════════════════════════════════════════════════════════════
// 🏗️ ACTION CATALOG — Catálogo técnico de acciones disponibles
// Cada acción define: propósito, reglas, formato de respuesta y template de prompt
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Catálogo técnico de acciones para la IA
 */
export const ACTION_CATALOG = {
    escribir: {
        id: 'escribir',
        responseType: 'content',
        outputFormat: 'plain_text',
        defaultScope: 'auto',
        description: 'Genera contenido nuevo o modifica contenido existente preservando fidelidad',
        rules: ['no_markdown', 'no_html_in_prose', 'paragraph_separator', 'preserve_fidelity', 'no_triple_backtick'],
        formatInstructions: `[[TIPO: contenido]]
[[ÁMBITO: completo|parcial]]
[[DESTINO: Nombre exacto del destino]]
[[TÍTULO: Título sugerido (opcional)]]`,
        responseBody: 'Texto plano limpio con párrafos separados por \\n\\n. Usa [[ÁMBITO: parcial]] si solo devuelves secciones afectadas; [[ÁMBITO: completo]] si escribe todo el documento desde cero.',
        examples: {
            positive: `✅ RESPUESTA CORRECTA (crear desde cero):
[[TIPO: contenido]]
[[ÁMBITO: completo]]
[[DESTINO: Personajes]]
[[TÍTULO: Perfil de nuevos personajes]]

Nora es la mayor de las hermanas...

✅ RESPUESTA CORRECTA (modificar existente, cambio grande → completo):
[[TIPO: contenido]]
[[ÁMBITO: completo]]
[[DESTINO: Personajes]]

[documento completo reescrito]`,
            negative: `❌ INCORRECTO — NO uses Markdown:
**Nora** es la mayor de las *hermanas*... 

❌ INCORRECTO — NO resumas ni omitas secciones no modificadas:
[[TIPO: contenido]]
[[ÁMBITO: parcial]]
Nora (18 años). (pero omitiste todo el lore de las otras hermanas)

❌ INCORRECTO — NO uses HTML en el cuerpo:
<p>Nora tiene 18 años</p>`,
        },
    },
    fragmento: {
        id: 'fragmento',
        responseType: 'patch',
        outputFormat: 'patch',
        defaultScope: 'partial',
        description: 'Edita solo un fragmento o párrafo específico sin reescribir todo el documento',
        rules: ['no_markdown', 'no_html_in_prose', 'no_triple_backtick', 'patch_original_block'],
        formatInstructions: `[[parche]]
[[TIPO: fragmento]]
[[DESTINO: Nombre exacto del destino]]
[[CONTEXTO: Breve descripción del cambio]]
[[ORIGINAL]]
Texto EXACTO del fragmento original a reemplazar (tal cual del documento)
[[/ORIGINAL]]
[[REEMPLAZO]]
Texto nuevo de reemplazo, o vacío para eliminarlo
[[/REEMPLAZO]]
[[/parche]]`,
        responseBody: 'Encapsula cada corrección dentro de un bloque [[parche]]. Si quieres eliminar el fragmento por completo, deja el bloque [[REEMPLAZO]] vacío.',
        examples: {
            positive: `✅ RESPUESTA CORRECTA (Modificar texto):
[[parche]]
[[TIPO: fragmento]]
[[DESTINO: Personajes]]
[[CONTEXTO: Corregí la edad de Nora de 19 a 18 años]]
[[ORIGINAL]]
Nora, la mayor con 19 años
[[/ORIGINAL]]
[[REEMPLAZO]]
Nora, la mayor con 18 años
[[/REEMPLAZO]]
[[/parche]]

✅ RESPUESTA CORRECTA (Eliminar texto duplicado/sobrante):
[[parche]]
[[TIPO: fragmento]]
[[DESTINO: Geopolítica]]
[[CONTEXTO: Eliminar mención redundante al Vínculo Ancestral]]
[[ORIGINAL]]
El guardián guerrero murió en batalla dando paso al despertar del Vínculo Ancestral...
[[/ORIGINAL]]
[[REEMPLAZO]]
[[/REEMPLAZO]]
[[/parche]]`,
            negative: `❌ INCORRECTO — NO reescribas todo el documento, solo el fragmento:
[[TIPO: contenido]]
[[ÁMBITO: completo]]
Nora tiene 18 años... (devolviste el doc completo)

❌ INCORRECTO — NO dejes el parche a medias sin REEMPLAZO ni contenedor:
[[TIPO: fragmento]]
[[ORIGINAL]]
Nora, la mayor con 19 años
[[/ORIGINAL]]
(falta [[REEMPLAZO]] y [[parche]] de cierre)`,
        },
    },
    escena: {
        id: 'escena',
        responseType: 'scene',
        outputFormat: 'plain_text',
        defaultScope: 'partial',
        description: 'Co-escribe y acumula capítulo escena por escena de forma conversacional',
        rules: ['no_markdown', 'no_html_in_prose', 'paragraph_separator', 'no_triple_backtick'],
        formatInstructions: `[[TIPO: escena]]
[[ESCENA: Nombre de la escena]]
[[NÚMERO: N]]`,
        responseBody: 'Prosa narrativa en texto plano limpio.',
        examples: {
            positive: `✅ RESPUESTA CORRECTA (redactando):
[[TIPO: escena]]
[[ESCENA: La llegada a la aldea]]
[[NÚMERO: 3]]

El sol se ocultaba tras las montañas cuando Kai divisó las primeras luces de la aldea...

✅ RESPUESTA CORRECTA (conversacional/debate):
[[TIPO: sugerencia]]
¿Qué tal si situamos esta escena al atardecer? El conflicto podría centrarse en...`,
            negative: `❌ INCORRECTO — NO mezcles formato Markdown:
[[TIPO: escena]]
# La llegada a la aldea (no uses #)
    
❌ INCORRECTO — NO devuelvas HTML:
[[TIPO: escena]]
<h3>La llegada</h3>`,
        },
    },
    analizar: {
        id: 'analizar',
        responseType: 'analysis',
        outputFormat: 'plain_text',
        defaultScope: 'complete',
        description: 'Analiza estilo, gramática, ritmo, tono, estructura y coherencia (inconsistencias)',
        rules: ['no_markdown', 'no_html_in_prose', 'no_triple_backtick'],
        formatInstructions: `[[TIPO: analisis]]`,
        responseBody: 'Retroalimentación estructurada en texto plano con \\n\\n.',
        examples: {
            positive: `✅ RESPUESTA CORRECTA:
[[TIPO: analisis]]

ANÁLISIS DE ESTILO:
El ritmo narrativo es adecuado para una escena de acción, pero los párrafos son demasiado largos...

GRAMÁTICA:
Se detectaron 3 errores de concordancia en el diálogo de Nora...`,
            negative: `❌ INCORRECTO — NO uses HTML o Markdown en el análisis:
[[TIPO: analisis]]
<p>El ritmo es <strong>adecuado</strong></p>

❌ INCORRECTO — NO devuelvas contenido como si fuera para modificar:
[[TIPO: contenido]]
[[ÁMBITO: completo]]`,
        },
    },
    sugerir: {
        id: 'sugerir',
        responseType: 'suggestion',
        outputFormat: 'plain_text',
        defaultScope: 'complete',
        description: 'Propone ideas y mejoras creativas',
        rules: ['no_markdown', 'no_html_in_prose', 'no_triple_backtick'],
        formatInstructions: `[[TIPO: sugerencia]]`,
        responseBody: 'Sugerencias creativas en texto plano claro.',
        examples: {
            positive: `✅ RESPUESTA CORRECTA:
[[TIPO: sugerencia]]

GIRO ARGUMENTAL SUGERIDO:
Podrías introducir un conflicto entre Nora y Misha por el uso de la magia...

DESARROLLO DE PERSONAJE:
Riko podría tener un secreto...`,
            negative: `❌ INCORRECTO — NO uses Markdown:
[[TIPO: sugerencia]]
**Giro argumental:** *interesante*...

❌ INCORRECTO — NO devuelvas contenido narrativo directamente:
[[TIPO: contenido]] (no es crear, es sugerir)`,
        },
    },
    chat: {
        id: 'chat',
        responseType: 'auto',
        outputFormat: 'auto',
        defaultScope: 'auto',
        description: 'Consultas generales, dudas y preguntas rápidas sin esperar un diff',
        rules: ['no_markdown', 'no_html_in_prose', 'no_triple_backtick', 'preserve_fidelity'],
        formatInstructions: `No espera un visor de diferencias. Responde de forma natural, conversacional y directa.
Auto-determina el tipo de respuesta:
- ¿Duda/Pregunta/Explicación sobre el lore? → [[TIPO: sugerencia]] o texto plano
- ¿Crear algo rápido? → texto plano sin estructura de destino
- ¿Analizar algo? → [[TIPO: analisis]]
- ¿Buscar inconsistencias? → [[TIPO: inconsistencias]]`,
        responseBody: 'Texto plano conversacional. Sin estructura de metadatos de destino. Sin [[DESTINO:]]. Sin [[ÁMBITO:]].',
        examples: {
            positive: `✅ RESPUESTA CORRECTA (duda): 
[[TIPO: sugerencia]]

Según el lore, Nora tiene 18 años...`,
            negative: `❌ NO generes bloques [[DESTINO:]] ni [[ÁMBITO:]].`,
        },
    },
    inconsistencia: {
        id: 'inconsistencia',
        responseType: 'patch',
        outputFormat: 'structured',
        defaultScope: 'partial',
        description: 'Resuelve inconsistencias de lore editando quirúrgicamente los documentos afectados, preservando el resto del contenido intacto',
        rules: ['no_markdown', 'no_html_in_prose', 'preserve_fidelity', 'no_triple_backtick', 'inconsistency_partial_only'],
        formatInstructions: `[[parche]]
[[TIPO: fragmento]]
[[DESTINO: ID_del_documento o nombre exacto]]
[[CONTEXTO: Breve descripción del cambio]]
[[ORIGINAL]]
Texto EXACTO a modificar/eliminar del documento original
[[/ORIGINAL]]
[[REEMPLAZO]]
Texto de reemplazo, o vacío para eliminarlo
[[/REEMPLAZO]]
[[/parche]]`,
        responseBody: 'Resuelve el lore de forma quirúrgica. Si debes corregir o eliminar partes en varios documentos, escribe múltiples bloques [[parche]]...[[/parche]] consecutivos, cada uno con su respectivo [[DESTINO]]. NUNCA uses [[ÁMBITO: completo]] en resoluciones de inconsistencias.',
        examples: {
            positive: `✅ RESPUESTA CORRECTA (Consolidar y eliminar duplicados en varios documentos):
[[parche]]
[[TIPO: fragmento]]
[[DESTINO: Geopolítica]]
[[CONTEXTO: Eliminar párrafo duplicado del guardián]]
[[ORIGINAL]]
El guardián guerrero murió en batalla dando paso al despertar del Vínculo Ancestral...
[[/ORIGINAL]]
[[REEMPLAZO]]
[[/REEMPLAZO]]
[[/parche]]

[[parche]]
[[TIPO: fragmento]]
[[DESTINO: Personajes]]
[[CONTEXTO: Consolidar trasfondo del Vínculo Ancestral]]
[[ORIGINAL]]
Hermanas Elfas: Elysia de 18 años.
[[/ORIGINAL]]
[[REEMPLAZO]]
Hermanas Elfas: Elysia de 18 años. Su linaje está íntimamente ligado al Vínculo Ancestral.
[[/REEMPLAZO]]
[[/parche]]`,
            negative: `❌ INCORRECTO — NUNCA reescribas el documento completo:
[[TIPO: contenido]]
❌ INCORRECTO — No omitiste las secciones no afectadas:
[[TIPO: contenido]]
[[ÁMBITO: parcial]]
Hermanas Elfas: Elysia de 18 años...  (pero eliminaste "Información General", "Sistema de Magia", etc.)`,
        },
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 📜 GENERAL_STYLE_RULES — Reglas globales de prosa y estilo
// Se inyectan automáticamente en TODOS los prompts del sistema
// ═══════════════════════════════════════════════════════════════════════════════

export const GENERAL_STYLE_RULES = [
    {
        id: 'no_markdown',
        rule: '📌 Queda COMPLETAMENTE PROHIBIDO usar cualquier tipo de formato de Markdown (como **negritas**, *cursivas*, # encabezados, - listas, > citas, etc.) en el cuerpo del texto.',
    },
    {
        id: 'no_html_in_prose',
        rule: '📌 Queda COMPLETAMENTE PROHIBIDO usar etiquetas HTML (como <p>, <strong>, <em>, <h1>, etc.) en la prosa o el cuerpo del texto.',
    },
    {
        id: 'paragraph_separator',
        rule: '📌 Los párrafos en el cuerpo del texto se separan únicamente por un doble salto de línea (\\n\\n).',
    },
    {
        id: 'preserve_fidelity',
        rule: '📌 REGLA DE PRESERVACIÓN DE ALTA FIDELIDAD: Al modificar contenido existente, queda ESTRICTAMENTE PROHIBIDO resumir, simplificar, acortar o eliminar información, listas, nombres o secciones de lore que ya existan en el texto original, a menos que el usuario lo haya solicitado explícitamente de forma directa. Preserva cada párrafo, descripción y detalle palabra por palabra si no es afectado directamente por la instrucción.',
    },
    {
        id: 'no_triple_backtick',
        rule: '📌 NUNCA uses bloques de código con triple comilla invertida (```). Escribe la prosa limpia directamente.',
    },
    {
        id: 'double_bracket_format',
        rule: '📌 Para datos estructurados (inconsistencias, parches multi-documento), usa exclusivamente el formato de doble corchete [[etiqueta]]...[[/etiqueta]].',
    },
    {
        id: 'patch_original_block',
        rule: '📌 En modo fragmento, encapsula siempre el cambio dentro de [[parche]]...[[/parche]]. Incluye el bloque [[ORIGINAL]]...[[/ORIGINAL]] con el texto EXACTO a reemplazar, y el bloque [[REEMPLAZO]]...[[/REEMPLAZO]] con el nuevo texto (deja [[REEMPLAZO]] vacío si quieres eliminar el texto).',
    },
    {
        id: 'natural_quotes',
        rule: '📌 Usa comillas dobles estándar (") de forma natural y fluida dentro de las oraciones. No agregues espacios innecesarios ni saltos de línea alrededor de las comillas.',
    },
    {
        id: 'inconsistency_partial_only',
        rule: `📌 REGLA CRÍTICA PARA RESOLUCIÓN DE INCONSISTENCIAS:
- Queda ESTRICTAMENTE PROHIBIDO usar [[ÁMBITO: completo]] en resoluciones de inconsistencias.
- Debes usar SIEMPRE [[ÁMBITO: parcial]] para devolver SOLO las secciones modificadas.
- NUNCA reescribas el documento completo.
- Si el documento es extenso (1000+ palabras) y solo modificas una sección, devuelve UNICAMENTE esa sección con contexto mínimo alrededor.
- Contraejemplo explícito de lo que NO debes hacer:
  INPUT: Documento de 1000 palabras con secciones "Información General", "Sistema de Magia", "Geopolítica"
  INSTRUCCIÓN: Agregar lore sobre las hermanas elfas
  OUTPUT INCORRECTO: [[ÁMBITO: completo]] + solo "Hermanas Elfas..." (¡borraste todo el resto!)
  OUTPUT CORRECTO: [[ÁMBITO: parcial]] + solo la sección "Hermanas Elfas" añadida,
  preservando "Información General", "Sistema de Magia" y "Geopolítica" intactas en el documento.`,
    },
];

/**
 * Compila las reglas activas para una acción en un string de prompt
 * @param {string[]} ruleIds - Array de IDs de reglas a incluir
 * @returns {string} Texto de reglas formateado
 */
export const compileRulesForAction = (ruleIds = []) => {
    return ruleIds
        .map(id => {
            const found = GENERAL_STYLE_RULES.find(r => r.id === id);
            return found ? found.rule : null;
        })
        .filter(Boolean)
        .join('\n');
};

/**
 * Obtiene la descripción técnica completa de una acción para el prompt
 * @param {string} actionId 
 * @returns {string}
 */
export const getActionTechnicalDescription = (actionId) => {
    const action = ACTION_CATALOG[actionId];
    if (!action) return '';
    
    const rulesText = compileRulesForAction(action.rules);
    const examplesText = action.examples
        ? `\n\n## EJEMPLOS DE FORMATO:\n${action.examples.positive}\n\n${action.examples.negative}`
        : '';
    
    return `## ACCIÓN: ${action.description}
Formato de respuesta:
${action.formatInstructions}

Cuerpo de la respuesta:
${action.responseBody}

Reglas aplicables:
${rulesText}${examplesText}`;
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
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/&/g, '&')
        .replace(/"/g, '"')
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
 * ── Heurísticas de detección de "documento mutilado" ──
 * 1) Sección faltante: delete > 50 palabras e insert < 30% de delete.
 * 2) Documento mutilado: insert < 15% de delete Y no hay palabras comunes largas
 *    (>40 chars) entre delete e insert → el contenido nuevo es completamente ajeno
 *    al original → preservar todo el delete (el original) y añadir el insert al final.
 * 3) Cambio real: cualquier otro caso.
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

        // ── Heurística 2: Documento mutilado ──
        // Si el insert es minúsculo (< 15% del delete) y no comparte substrings largos
        // con lo eliminado, es que la IA reescribió el documento con contenido ajeno.
        const insertRatio = deleteWords > 0 ? insertWords / deleteWords : 0;
        if (deleteWords > 50 && insertRatio < 0.15) {
            // Verificar similitud: buscar si hay una frase larga (>40 chars) en común
            const deletePreview = deleteText.substring(0, Math.min(200, deleteText.length));
            const insertPreview = insertText.substring(0, Math.min(200, insertText.length));
            const hasCommonPhrase = hasLongCommonSubstring(deletePreview, insertPreview, 40);
            
            if (!hasCommonPhrase) {
                // Documento mutilado: preservar TODO el texto original y añadir el insert
                // al final como contenido adicional (no en reemplazo).
                result += deleteText;
                if (insertText.trim()) {
                    result += '\n' + insertText;
                }
                continue;
            }
            // Si hay frase en común, cae en la heurística 1 normal
        }

        // ── Heurística 1: Sección faltante (preservar original) ──
        if (deleteWords > 50 && insertRatio < 0.3) {
            // Eliminación masiva sin reemplazo proporcional → sección faltante.
            // Preservar el texto original.
            result += deleteText;
        } else {
            // Cambio real (reemplazo de palabras, edición, etc.) → aplicar el cambio.
            result += insertText;
        }
    }

    // 📌 Post-procesamiento: si el resultado es _más corto_ que el original
    // y perdió más del 40% del contenido, es casi seguro que la IA mutiló.
    const originalWords = originalText.trim().split(/\s+/).filter(Boolean).length;
    const resultWords = result.trim().split(/\s+/).filter(Boolean).length;
    if (originalWords > 100 && resultWords < originalWords * 0.6) {
        // Preservar el original completo y añadir el resultado como apéndice
        return originalText + '\n\n' + result;
    }

    return result;
};

/**
 * Comprueba si dos textos comparten un substring común de al menos minLen caracteres.
 * Búsqueda optimizada: solo examina substrings cada `stride` posiciones.
 */
const hasLongCommonSubstring = (a, b, minLen = 40) => {
    if (!a || !b || a.length < minLen || b.length < minLen) return false;
    const stride = Math.max(1, Math.floor(minLen / 2));
    // Indexar substrings del texto más corto para búsqueda rápida
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    for (let i = 0; i <= shorter.length - minLen; i += stride) {
        const sub = shorter.substring(i, i + minLen);
        if (longer.includes(sub)) return true;
    }
    return false;
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
        estimatedTokens: Math.ceil(totalChars / 3.8),
        isHeavy: totalChars > HEAVY_CONTEXT_THRESHOLD,
    };
};

// ─── Parsing de respuestas ───────────────────────────────────────────────────

/**
 * Resuelve un documento de destino a partir de un texto (ej. "Personajes" o el título de un capítulo)
 * @returns {{ docType: string, docId: string, title: string } | null}
 */
export const resolveTargetDoc = (targetStr, chapters = [], worldItems = []) => {
    if (!targetStr || typeof targetStr !== 'string') {
        return null;
    }

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

    // Comprobar si la respuesta contiene argumentos JSON directos de una llamada de herramientas
    const trimmed = response.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsedJson = JSON.parse(trimmed);
            if (parsedJson.parches) {
                return parseToolCallResponse('aplicar_parches_resolucion', parsedJson, destinationDoc, chapters, worldItems);
            }
            if (parsedJson.texto_original_exacto) {
                return parseToolCallResponse('localizar_parche_exacto', parsedJson, destinationDoc, chapters, worldItems);
            }
            if (parsedJson.texto_original) {
                return parseToolCallResponse('aplicar_parche', parsedJson, destinationDoc, chapters, worldItems);
            }
        } catch (e) {}
    }

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
            const blockTitle = detectTitleFromContent(html) || 'Nuevo capítulo';
            return [{ docType: 'chapter', docId: null, mode: 'new', title: blockTitle, content: html, responseType: 'content' }];
        } else if (dest.mode === 'manual' && dest.docId) {
            return [{ docType: dest.docType, docId: dest.docId, mode: 'manual', title: dest.docTitle || 'Documento', content: html, responseType: 'content' }];
        } else {
            const blockTitle = detectTitleFromContent(html) || 'Automático';
            return [{ docType: 'chapter', docId: null, mode: 'auto', title: blockTitle, content: html, responseType: 'content' }];
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
 * Intenta detectar el título de un capítulo a partir del inicio del contenido generado.
 * Quita marcas de formato markdown y etiquetas HTML.
 */
export const detectTitleFromContent = (content) => {
    if (!content) return '';
    // Reemplazar saltos de línea HTML con saltos de línea de texto
    let clean = content
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n');
    
    // Quitar el resto de etiquetas HTML
    clean = clean.replace(/<[^>]*>/g, '').trim();
    if (!clean) return '';

    // Obtener la primera línea no vacía
    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';

    let firstLine = lines[0];
    
    // Quitar marcas de markdown comunes de la cabecera
    firstLine = firstLine.replace(/^[#\s*]+|[#\s*]+$/g, '').replace(/\*\*/g, '').trim();
    
    // Si la primera línea tiene un tamaño razonable para ser un título
    if (firstLine.length > 0 && firstLine.length < 70) {
        return firstLine;
    }

    return '';
};

/**
 * Parsea bloques estructurados de inconsistencias y huecos de lore
 * devueltos por la IA. Soporta TRES formatos de forma híbrida:
 *
 *   FORMATO 1 (oficial, recomendado): [[inconsistencia id="1" archivos="..."]][[titulo]]...[[/titulo]][[problema]]...
 *   FORMATO 2 (fallback XML): <inconsistencia id="1" archivos="..."><titulo>...</titulo><problema>...</problema>
 *   FORMATO 3 (semi-estructurado tolerante): [[INCONSISTENCIA N: Título]] con UBICACIÓN:, PROBLEMA:, SOLUCIÓN A/B:
 *
 * @param {string} text - Contenido de texto bruto de la respuesta
 * @returns {Array<Object>} Lista de objetos de inconsistencias parseados
 */
export const parseInconsistenciesFromResponse = (text) => {
    if (!text) return [];

    const inconsistencies = [];

    // ── FORMATO 1: Formato oficial de doble corchete [[inconsistencia id="" archivos=""]] ──
    const incRegexBrackets = /\[\[inconsistencia\s+id="([^"]+)"\s+archivos="([^"]+)"\]\]([\s\S]*?)\[\[\/inconsistencia\]\]/gi;
    let match;

    while ((match = incRegexBrackets.exec(text)) !== null) {
        const id = match[1];
        const filesStr = match[2];
        const innerContent = match[3];

        const titleMatch = /\[\[titulo\]\]([\s\S]*?)\[\[\/titulo\]\]/i.exec(innerContent);
        const problemMatch = /\[\[problema\]\]([\s\S]*?)\[\[\/problema\]\]/i.exec(innerContent);

        const title = titleMatch ? titleMatch[1].trim() : `Conflicto ${id}`;
        const problem = problemMatch ? problemMatch[1].trim() : '';

        const solRegex = /\[\[solucion\s+letra="([^"]+)"\]\]([\s\S]*?)\[\[\/solucion\]\]/gi;
        const options = [];
        let solMatch;

        while ((solMatch = solRegex.exec(innerContent)) !== null) {
            options.push({
                letter: solMatch[1].toUpperCase().trim(),
                text: solMatch[2].trim()
            });
        }

        inconsistencies.push({
            id,
            files: filesStr.split(',').map(f => f.trim()).filter(Boolean),
            title,
            problem,
            options,
            resolved: false,
            selectedOption: null,
            customText: ''
        });
    }

    // ── FORMATO 2: XML legacy (fallback/retrocompatibilidad) ──
    if (inconsistencies.length === 0) {
        const incRegexXml = /<inconsistencia\s+id="([^"]+)"\s+archivos="([^"]+)">([\s\S]*?)<\/inconsistencia>/gi;
        let xmlMatch;

        while ((xmlMatch = incRegexXml.exec(text)) !== null) {
            const id = xmlMatch[1];
            const filesStr = xmlMatch[2];
            const innerContent = xmlMatch[3];

            const titleMatch = /<titulo>([\s\S]*?)<\/titulo>/i.exec(innerContent);
            const problemMatch = /<problema>([\s\S]*?)<\/problema>/i.exec(innerContent);

            const title = titleMatch ? titleMatch[1].trim() : `Conflicto ${id}`;
            const problem = problemMatch ? problemMatch[1].trim() : '';

            const solRegex = /<solucion\s+letra="([^"]+)">([\s\S]*?)<\/solucion>/gi;
            const options = [];
            let solMatch;

            while ((solMatch = solRegex.exec(innerContent)) !== null) {
                options.push({
                    letter: solMatch[1].toUpperCase().trim(),
                    text: solMatch[2].trim()
                });
            }

            inconsistencies.push({
                id,
                files: filesStr.split(',').map(f => f.trim()).filter(Boolean),
                title,
                problem,
                options,
                resolved: false,
                selectedOption: null,
                customText: ''
            });
        }
    }

    // ── FORMATO 3: Semi-estructurado tolerante ──
    if (inconsistencies.length === 0) {
        const incRegexFree = /\[\[inconsistencia\s+\d+\s*:\s*([^\]]+)\]\]\s*([\s\S]*?)(?=\[\[inconsistencia|\z)/gi;
        let freeMatch;

        while ((freeMatch = incRegexFree.exec(text)) !== null) {
            const title = freeMatch[1].trim();
            const body = freeMatch[2].trim();
            
            const ubicacionMatch = body.match(/UBICACIÓN:\s*([^\n]+)/i);
            const problemMatch2 = body.match(/PROBLEMA:\s*([\s\S]*?)(?=\n(?:SOLUCIÓN|SOLUCION)\s+(?:A|B):|\n\[\[|\Z)/i);
            const files = [];

            if (ubicacionMatch) {
                const ubicacion = ubicacionMatch[1].trim();
                const lowerUbi = ubicacion.toLowerCase();
                if (lowerUbi.includes('personaje')) files.push('system_personajes');
                if (lowerUbi.includes('estructura') || lowerUbi.includes('capitulo')) files.push('system_estructura');
                if (lowerUbi.includes('general') || lowerUbi.includes('core') || lowerUbi.includes('informacion')) files.push('system_core');
                if (files.length === 0) files.push(ubicacion);
            }

            const problem = problemMatch2 ? problemMatch2[1].trim() : '';

            const solRegexFree = /(?:SOLUCIÓN|SOLUCION)\s+([A-D])\s*:\s*([\s\S]*?)(?=\n(?:SOLUCIÓN|SOLUCION)\s+[A-D]\s*:|\n\[\[|\Z)/gi;
            const options = [];
            let solFreeMatch;

            while ((solFreeMatch = solRegexFree.exec(body)) !== null) {
                options.push({
                    letter: solFreeMatch[1].toUpperCase().trim(),
                    text: solFreeMatch[2].trim()
                });
            }

            const numMatch = text.match(/\[\[inconsistencia\s+(\d+)/i);
            const id = numMatch ? numMatch[1] : String(inconsistencies.length + 1);

            inconsistencies.push({
                id,
                files: files.length > 0 ? files : ['unknown'],
                title,
                problem: problem || title,
                options: options.length > 0 ? options : [],
                resolved: false,
                selectedOption: null,
                customText: ''
            });
        }
    }

    return inconsistencies;
};


/**
 * Intenta parsear una respuesta XML semántica o pseudo-etiquetas estructuradas,
 * tolerando etiquetas incompletas o sin brackets angulares.
 * Retorna un objeto estructurado idéntico al esquema JSON tradicional para compatibilidad.
 */
export const tryParseAIXml = (text) => {
    if (!text) return null;

    const lowerText = text.toLowerCase();
    
    // ── 0. PARSEADOR MULTI-PARCHE: Soporte para múltiples [[parche]]...[[/parche]] ──
    const hasMultiPatch = lowerText.includes('[[parche]]') || lowerText.includes('[parche]');
    if (hasMultiPatch) {
        const patches = [];
        // Regex para buscar bloques [[parche]]...[[/parche]] o [parche]...[/parche]
        const patchBlockRegex = /\[+parche\]+([\s\S]*?)\[+\/parche\]+/gi;
        let match;
        
        while ((match = patchBlockRegex.exec(text)) !== null) {
            const blockContent = match[1];
            
            // Extraer metadatos individuales del bloque
            const typeMatch = /\[+TIPO\s*:\s*([^\]]+)\]+/i.exec(blockContent);
            const targetMatch = /\[+DESTINO\s*:\s*([^\]]+)\]+/i.exec(blockContent);
            const contextMatch = /\[+CONTEXTO\s*:\s*([^\]]+)\]+/i.exec(blockContent);
            const originalMatch = /\[+ORIGINAL\]+([\s\S]*?)\[+\/ORIGINAL\]+/i.exec(blockContent);
            const replacementMatch = /\[+REEMPLAZO\]+([\s\S]*?)\[+\/REEMPLAZO\]+/i.exec(blockContent);
            
            if (originalMatch) {
                const typeVal = typeMatch ? typeMatch[1].trim().toLowerCase() : 'fragmento';
                if (typeVal === 'fragmento' || typeVal === 'parche' || typeVal === 'patch') {
                    let replacementRaw = '';
                    if (replacementMatch) {
                        replacementRaw = replacementMatch[1];
                    } else {
                        // Fallback: si no hay REEMPLAZO explícito, usar todo el texto después de [/original] o [[/original]]
                        let origCloseIdx = blockContent.toLowerCase().indexOf('[[/original]]');
                        let tagLength = '[[/original]]'.length;
                        if (origCloseIdx === -1) {
                            origCloseIdx = blockContent.toLowerCase().indexOf('[/original]');
                            tagLength = '[/original]'.length;
                        }
                        if (origCloseIdx !== -1) {
                            replacementRaw = blockContent.substring(origCloseIdx + tagLength);
                        }
                    }
                    
                    patches.push({
                        target: targetMatch ? targetMatch[1].trim() : '',
                        context: contextMatch ? contextMatch[1].trim() : '',
                        original: originalMatch[1].trim(),
                        replacementText: replacementRaw.trim(),
                        replacement: plainTextToHtml(replacementRaw).trim()
                    });
                }
            }
        }
        
        if (patches.length > 0) {
            return {
                type: 'multi_patch',
                patches
            };
        }
    }

    // ── 1. PARSEADOR PRIMARIO: Formato de Corchetes Rectos [[TIPO: ...]] o [TIPO: ...] ──
    const hasBracketMetadata = lowerText.includes('[tipo:') || lowerText.includes('[tipo :') || lowerText.includes('[[tipo:') || lowerText.includes('[[tipo :');

    if (hasBracketMetadata) {
        const parsed = {};
        
        // Extraer todos los pares [[CLAVE: VALOR]] o [CLAVE: VALOR] de las líneas del texto
        const bracketRegex = /^\s*\[+([a-záéíóúüñ\-_]+)\s*:\s*([^\]]+)\]+/gim;
        let match;
        const metadataLines = [];
        
        while ((match = bracketRegex.exec(text)) !== null) {
            const key = match[1].toLowerCase();
            const val = match[2].trim();
            parsed[key] = val;
            metadataLines.push(match[0]);
        }

        // Buscar bloques multilínea de fragmentos como [[ORIGINAL]] ... [[/ORIGINAL]] o [ORIGINAL] ... [/ORIGINAL]
        const originalBlockRegex = /\[+original\]+([\s\S]*?)\[+\/original\]+/i;
        const origMatch = originalBlockRegex.exec(text);
        if (origMatch) {
            parsed.original = origMatch[1].trim();
            metadataLines.push(origMatch[0]);
        }

        // Si encontramos la clave fundamental 'tipo', estructuramos la respuesta
        if (parsed.tipo) {
            let type = parsed.tipo.toLowerCase().trim();
            if (type === 'contenido') type = 'content';
            if (type === 'fragmento' || type === 'parche') type = 'patch';
            if (type === 'seccion') type = 'section';
            if (type === 'escena') type = 'scene';
            if (type === 'analisis' || type === 'análisis') type = 'analysis';
            if (type === 'sugerencia') type = 'suggestion';
            if (type === 'inconsistencias' || type === 'inconsistencia' || type === 'huecos') type = 'inconsistencies';

            const finalParsed = { type };

            // Mapear ámbito / scope
            let scope = parsed.ambito || parsed.scope || '';
            if (scope) {
                scope = scope.toLowerCase().trim();
                if (scope === 'completo') scope = 'complete';
                if (scope === 'parcial') scope = 'partial';
                finalParsed.scope = scope;
            }

            // Mapear destino
            const target = parsed.destino || parsed.target || '';
            if (target) finalParsed.target = target;

            // Mapear título o nombre de la escena
            const title = parsed.titulo || parsed.title || parsed.escena || parsed.scene || '';
            if (title) finalParsed.title = title;

            // Extraer el cuerpo de la respuesta limpio de metadatos
            let bodyText = text;
            metadataLines.forEach(line => {
                bodyText = bodyText.replace(line, '');
            });
            bodyText = bodyText.trim();

            if (type === 'content') {
                finalParsed.html = plainTextToHtml(bodyText).trim();
                finalParsed.text = bodyText;
            } else if (type === 'patch') {
                finalParsed.original = parsed.original || '';
                
                // Primero verificar si hay una etiqueta REEMPLAZO explícita (para soporte de eliminaciones o parches exactos)
                const replacementBlockRegex = /\[+REEMPLAZO\]+([\s\S]*?)\[+\/REEMPLAZO\]+/i;
                const repMatch = replacementBlockRegex.exec(text);
                
                let replacementRaw = '';
                if (repMatch) {
                    replacementRaw = repMatch[1].trim();
                } else {
                    // Fallback a comportamiento heredado: todo el texto después de [/original] o [[/original]]
                    let origCloseIdx = text.toLowerCase().indexOf('[[/original]]');
                    let tagLength = '[[/original]]'.length;
                    if (origCloseIdx === -1) {
                        origCloseIdx = text.toLowerCase().indexOf('[/original]');
                        tagLength = '[/original]'.length;
                    }
                    if (origCloseIdx !== -1) {
                        replacementRaw = text.substring(origCloseIdx + tagLength).trim();
                        // Clean up any other trailing metadata bracket if present
                        replacementRaw = replacementRaw.replace(/^\s*\[+([a-záéíóúüñ\-_]+)\s*:\s*([^\]]+)\]+/gim, '').trim();
                    } else {
                        replacementRaw = bodyText;
                    }
                }
                
                finalParsed.replacement = plainTextToHtml(replacementRaw).trim();
                finalParsed.replacementText = replacementRaw;
                finalParsed.context = parsed.contexto || parsed.context || '';
            } else if (type === 'section' || type === 'scene') {
                finalParsed.html = plainTextToHtml(bodyText).trim();
                finalParsed.text = bodyText;
                
                const secStr = parsed.seccion || parsed.section || parsed.escena || parsed.scene || parsed.numero || parsed.número || '';
                const totStr = parsed.total || '';
                finalParsed.sectionIndex = secStr ? parseInt(secStr, 10) : 1;
                finalParsed.totalSections = totStr ? parseInt(totStr, 10) : 1;
            } else if (type === 'analysis' || type === 'suggestion') {
                finalParsed.text = bodyText;
            } else if (type === 'inconsistencies') {
                finalParsed.text = bodyText;
                finalParsed.inconsistencies = parseInconsistenciesFromResponse(text);
            }

            return finalParsed;
        }
    }

    // ── 2. PARSEADOR SECUNDARIO (FALLBACK): Etiquetas XML Estándar <response_type> ──
    const hasStandardXml = lowerText.includes('<response_type>') || lowerText.includes('<response-type>');

    if (hasStandardXml) {
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
                parsed.text = markdown;
                parsed.markdown = markdown;
            } else {
                const legacyHtml = extractXmlTag(normalizedText, 'content_html');
                if (legacyHtml && /<[a-z][\s\S]*?>/i.test(legacyHtml)) {
                    parsed.html = legacyHtml;
                } else {
                    parsed.html = plainTextToHtml(legacyHtml).trim();
                }
                parsed.text = parsed.html;
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
    }

    // ── 3. PARSEADOR TERCIARIO: Pseudo-etiquetas clave-valor sin delimitadores (ej. _type content) ──
    const keys = [
        'response_type', 'response-type', 'type',
        'response_scope', 'response-scope', 'scope',
        'target_doc', 'target-doc', 'target',
        'title',
        'content_text', 'content-text', 'content_html', 'content-html', 'content',
        'text',
        'original',
        'replacement_text', 'replacement-text', 'replacement',
        'context',
        'section_index', 'section-index',
        'total_sections', 'total-sections'
    ];

    const sortedKeys = [...keys].sort((a, b) => b.length - a.length);
    const regexStr = '(?:<|\\b|\\s|_\\[)?\\b(' + sortedKeys.join('|') + ')\\b(?:>|\\b|\\s|_\\])?\\s*[:=]?\\s*';
    const regex = new RegExp(regexStr, 'gi');

    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push({
            keyName: match[1].toLowerCase(),
            index: match.index,
            length: match[0].length
        });
    }

    if (matches.length >= 2) {
        const parsed = {};
        for (let i = 0; i < matches.length; i++) {
            const current = matches[i];
            const start = current.index + current.length;
            const end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
            const rawVal = text.substring(start, end).trim();

            let key = current.keyName;
            if (key === 'type') key = 'response_type';
            if (key === 'response-type') key = 'response_type';
            if (key === 'scope') key = 'response_scope';
            if (key === 'response-scope') key = 'response_scope';
            if (key === 'target') key = 'target_doc';
            if (key === 'target-doc') key = 'target_doc';
            if (key === 'content-text') key = 'content_text';
            if (key === 'content') key = 'content_text';
            if (key === 'content_html') key = 'content_text';
            if (key === 'content-html') key = 'content_text';
            if (key === 'replacement-text') key = 'replacement_text';
            if (key === 'replacement') key = 'replacement_text';
            if (key === 'section-index') key = 'section_index';
            if (key === 'total-sections') key = 'total_sections';

            parsed[key] = rawVal;
        }

        if (parsed.response_type) {
            const type = parsed.response_type.toLowerCase();
            const finalParsed = { type };
            if (parsed.response_scope) finalParsed.scope = parsed.response_scope.toLowerCase();

            if (type === 'content') {
                const textContent = parsed.content_text || '';
                finalParsed.html = plainTextToHtml(textContent).trim();
                finalParsed.text = textContent;
                finalParsed.title = (parsed.title || '').trim();
                finalParsed.target = (parsed.target_doc || '').trim();
            } else if (type === 'patch') {
                finalParsed.original = (parsed.original || '').trim();
                const replacementText = parsed.replacement_text || '';
                finalParsed.replacement = plainTextToHtml(replacementText).trim();
                finalParsed.replacementText = replacementText;
                finalParsed.context = (parsed.context || '').trim();
                finalParsed.target = (parsed.target_doc || '').trim();
            } else if (type === 'section') {
                const textContent = parsed.content_text || '';
                finalParsed.html = plainTextToHtml(textContent).trim();
                finalParsed.text = textContent;
                finalParsed.title = (parsed.title || '').trim();
                finalParsed.sectionIndex = parsed.section_index ? parseInt(parsed.section_index, 10) : 1;
                finalParsed.totalSections = parsed.total_sections ? parseInt(parsed.total_sections, 10) : 1;
            } else if (type === 'analysis' || type === 'suggestion') {
                finalParsed.text = parsed.text || '';
            }

            return finalParsed;
        }
    }

    return null;

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

        const blocks = [{
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
        return blocks;
    }

    // ── Multi-patch response (múltiples fragmentos modificados) ──
    if (responseType === 'multi_patch' && parsed.patches) {
        return parsed.patches.map(patch => {
            // Para multi-patch, SIEMPRE intentar resolver el destino individualmente
            // desde el [[DESTINO]] del propio bloque del parche, ignorando el destinationDoc
            // configurado externamente (que apuntaría a un único documento)
            let dest = { mode: 'auto' };

            if (patch.target) {
                const resolved = resolveTargetDoc(patch.target, chapters, worldItems);
                if (resolved) {
                    dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
                } else {
                    // Si no se pudo resolver, usar el target como nombre visible pero sin docId
                    dest = { mode: 'auto', docTitle: patch.target };
                }
            }

            return {
                docType: dest.docType || null,
                docId: dest.docId || null,
                mode: dest.mode || 'auto',
                title: dest.docTitle || patch.target || 'Fragmento',
                content: patch.replacement,
                original: patch.original,
                responseType: 'patch',
                isPatch: true,
                context: patch.context || '',
            };
        });
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
            const blockTitle = parsed.title || detectTitleFromContent(parsed.text || parsed.html) || 'Nuevo capítulo';
            return [{ docType: 'chapter', docId: null, mode: 'new', title: blockTitle, content: parsed.html, responseType: 'content', isPartial }];
        } else if (dest.mode === 'manual' && dest.docId) {
            return [{ docType: dest.docType, docId: dest.docId, mode: 'manual', title: dest.docTitle || 'Documento', content: parsed.html, responseType: 'content', isPartial }];
        } else {
            const blockTitle = parsed.title || detectTitleFromContent(parsed.text || parsed.html) || 'Automático';
            return [{ docType: 'chapter', docId: null, mode: 'auto', title: blockTitle, content: parsed.html, responseType: 'content', isPartial }];
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

    // ── Scene response (escritura escena por escena) ──
    if (responseType === 'scene' && parsed.html) {
        const dest = destinationDoc || { mode: 'auto' };
        return [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: parsed.title || `Escena ${parsed.sectionIndex || 1}`,
            content: parsed.html,
            responseType: 'scene',
            isScene: true,
            sceneIndex: parsed.sectionIndex,
            titleOriginal: parsed.title || 'Nueva Escena',
        }];
    }

    // ── Analysis / Suggestion ──
    if ((responseType === 'analysis' || responseType === 'suggestion') && parsed.text) {
        return [{ docType: 'text', docId: null, mode: 'text', title: 'Respuesta', content: parsed.text.trim(), responseType }];
    }

    // ── Inconsistencies response ──
    if (responseType === 'inconsistencies') {
        return [{ docType: 'text', docId: null, mode: 'text', title: 'Inconsistencias', content: parsed.text ? parsed.text.trim() : '', responseType, inconsistencies: parsed.inconsistencies || [] }];
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
    if (!original) {
        return { success: false, html: chapterHtml, method: 'none' };
    }

    // Si el documento de destino está vacío, aplicamos el parche directamente como contenido nuevo
    if (!chapterHtml || chapterHtml.trim() === '' || chapterHtml === '<p></p>') {
        return {
            success: true,
            html: replacement,
            method: 'empty_document_fallback',
        };
    }

    // 1. Intento exacto en HTML
    if (chapterHtml.includes(original)) {
        return {
            success: true,
            html: chapterHtml.replace(original, replacement),
            method: 'exact_html',
        };
    }

    // 2. Tokenización y búsqueda por secuencia de palabras exacta/fuzzy (multi-párrafo)
    try {
        const tokenizeHtml = (html) => {
            const tokens = [];
            let i = 0;
            const len = html.length;

            while (i < len) {
                const char = html[i];
                if (char === '<') {
                    const endIdx = html.indexOf('>', i);
                    if (endIdx !== -1) {
                        tokens.push({ type: 'tag', text: html.substring(i, endIdx + 1), index: i });
                        i = endIdx + 1;
                        continue;
                    }
                }
                if (/\s/.test(char)) {
                    let start = i;
                    while (i < len && /\s/.test(html[i])) i++;
                    tokens.push({ type: 'whitespace', text: html.substring(start, i), index: start });
                    continue;
                }
                let start = i;
                while (i < len && html[i] !== '<' && !/\s/.test(html[i])) i++;
                tokens.push({ type: 'word', text: html.substring(start, i), index: start });
            }
            return tokens;
        };

        const normalizeWord = (w) => {
            return w.trim().toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, "");
        };

        const htmlTokens = tokenizeHtml(chapterHtml);
        const htmlWords = [];
        for (let idx = 0; idx < htmlTokens.length; idx++) {
            const t = htmlTokens[idx];
            if (t.type === 'word') {
                const norm = normalizeWord(t.text);
                if (norm) {
                    htmlWords.push({
                        normalized: norm,
                        tokenIndex: idx,
                        charIndex: t.index
                    });
                }
            }
        }

        const originalTokens = tokenizeHtml(original);
        const originalWords = [];
        for (const t of originalTokens) {
            if (t.type === 'word') {
                const norm = normalizeWord(t.text);
                if (norm) originalWords.push(norm);
            }
        }

        if (originalWords.length > 0 && htmlWords.length >= originalWords.length) {
            let matchStartIndex = -1;
            let matchEndIndex = -1;
            const wordLen = originalWords.length;

            // Búsqueda exacta de secuencia
            for (let i = 0; i <= htmlWords.length - wordLen; i++) {
                let match = true;
                for (let j = 0; j < wordLen; j++) {
                    if (htmlWords[i + j].normalized !== originalWords[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    matchStartIndex = htmlWords[i].tokenIndex;
                    matchEndIndex = htmlWords[i + wordLen - 1].tokenIndex;
                    break;
                }
            }

            // Fallback: Búsqueda difusa de secuencia
            if (matchStartIndex === -1) {
                let bestScore = 0;
                let bestStart = -1;
                let bestEnd = -1;

                for (let i = 0; i <= htmlWords.length - wordLen; i++) {
                    let score = 0;
                    for (let j = 0; j < wordLen; j++) {
                        if (htmlWords[i + j].normalized === originalWords[j]) {
                            score++;
                        }
                    }
                    if (score > bestScore) {
                        bestScore = score;
                        bestStart = htmlWords[i].tokenIndex;
                        bestEnd = htmlWords[i + wordLen - 1].tokenIndex;
                    }
                }

                if (bestScore / wordLen >= 0.70) {
                    matchStartIndex = bestStart;
                    matchEndIndex = bestEnd;
                }
            }

            if (matchStartIndex !== -1 && matchEndIndex !== -1) {
                const startCharIndex = htmlTokens[matchStartIndex].index;
                const endToken = htmlTokens[matchEndIndex];
                const endCharIndex = endToken.index + endToken.text.length;

                // Si el reemplazo está completamente envuelto en un tag <p>...</p>, lo removemos para evitar
                // anidación de párrafos y saltos de línea innecesarios al inyectar en el HTML existente.
                let cleanReplacement = replacement;
                const trimmedRep = replacement.trim();
                if (trimmedRep.toLowerCase().startsWith('<p>') && trimmedRep.toLowerCase().endsWith('</p>')) {
                    // Extraer el contenido interior
                    cleanReplacement = trimmedRep.substring(3, trimmedRep.length - 4);
                } else if (trimmedRep.toLowerCase().startsWith('<p ') && trimmedRep.toLowerCase().endsWith('</p>')) {
                    const firstClose = trimmedRep.indexOf('>');
                    if (firstClose !== -1) {
                        cleanReplacement = trimmedRep.substring(firstClose + 1, trimmedRep.length - 4);
                    }
                }

                const newHtml = chapterHtml.substring(0, startCharIndex)
                    + cleanReplacement
                    + chapterHtml.substring(endCharIndex);

                return {
                    success: true,
                    html: newHtml,
                    method: 'word_sequence_mapping'
                };
            }
        }
    } catch (err) {
        // Ignorar silenciado en producción
    }

    // 3. Búsqueda difusa por párrafos individuales (Legacy fallback)
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

// ─── Prompt Builder Engine ───────────────────────────────────────────────────

/**
 * Construye el destino description e instrucciones de contenido según el modo de destino.
 * Reutilizable entre acciones.
 * 
 * @returns {{ docDescription: string, contentInstruction: string, targetsStr: string }}
 */
const buildDestinationSection = (dest, extraOptions = {}) => {
    const chaptersList = extraOptions.chapters || [];
    const worldItemsList = extraOptions.worldItems || [];

    const availableTargets = [];
    SYSTEM_WORLD_ITEM_IDS.forEach(wid => {
        availableTargets.push(`- "${SYSTEM_WORLD_ITEM_LABELS[wid] || wid}" (Sección del Master Doc)`);
    });
    worldItemsList.filter(w => !SYSTEM_WORLD_ITEM_IDS.includes(w.id)).forEach(w => {
        if (w.title) availableTargets.push(`- "${w.title}" (Master Doc)`);
    });
    chaptersList.filter(c => !c.isVolume).forEach(c => {
        if (c.title) availableTargets.push(`- "${c.title}" (Capítulo)`);
    });

    const targetsStr = availableTargets.length > 0
        ? `\nDocumentos y secciones disponibles:\n${availableTargets.join('\n')}\n`
        : '';

    if (dest.mode === 'manual' && dest.docId) {
        const docLabel = dest.docType === 'worldItem' ? 'Master Doc' : 'Capítulo';
        return {
            docDescription: `"${dest.docTitle || 'Documento'}" (${docLabel})`,
            contentInstruction: `Modifica el documento especificado y devuelve su contenido en texto plano limpio.`,
            targetsStr,
        };
    }
    if (dest.mode === 'new') {
        return {
            docDescription: 'Nuevo documento',
            contentInstruction: `Genera el contenido en texto plano limpio completo del nuevo documento. Sugiere un título dentro del bloque de metadatos inicial como [[TÍTULO: Tu Título]].`,
            targetsStr,
        };
    }
    return {
        docDescription: 'Automático (La IA determina el destino)',
        contentInstruction: `Devuelve el contenido en texto plano limpio. Si el contenido modificado/añadido está destinado a una sección del Master Doc o a un capítulo específico, indica el título exacto de ese documento dentro del bloque de metadatos inicial como [[DESTINO: Nombre Exacto]] (ej. [[DESTINO: Personajes]]).${targetsStr}`,
        targetsStr,
    };
};

/**
 * Construye el prompt del sistema usando ACTION_CATALOG como fuente única de verdad.
 */
export const buildSystemPrompt = (action, context, destinationDoc, activeChapter, extraOptions = {}) => {
    const BASE = `Eres un asistente experto en escritura creativa, especializado en novelas y libros. Ayudas a escritores a mejorar su obra.`;
    const dest = destinationDoc || { mode: 'auto' };
    const { docDescription, contentInstruction, targetsStr } = buildDestinationSection(dest, extraOptions);

    // ── Action-specific prompt segments ──
    const actionSegments = {
        escribir: () => `${BASE}

🎯 ACCIÓN: ESCRIBIR — Crear contenido nuevo o modificar existente.
📌 Destino: ${docDescription}

${contentInstruction}

ESTRATEGIA DE RESPUESTA:
- ¿Crear desde cero? → usa [[ÁMBITO: completo]] devolviendo todo el documento en texto plano limpio.
- ¿Modificar contenido existente? → usa [[ÁMBITO: parcial]] si solo cambias algunas secciones; [[ÁMBITO: completo]] si reescribes la mayoría del documento.
- ¿Expandir/Añadir? → usa [[ÁMBITO: parcial]] devolviendo SOLO las secciones añadidas/modificadas.

⚠️ DIRECTRICES DE FIDELIDAD NARRATIVA:
- NUNCA resumas, omitas ni abrevies la información que sí devuelves.
- Cada sección devuelta debe mantener su extensión y riqueza original.
- Si no modificas una sección, no es necesario incluirla (salvo contexto mínimo para ubicación).

${getActionTechnicalDescription('escribir')}

Contexto del libro:
${context}`,

        fragmento: () => `${BASE}

🎯 ACCIÓN: EDITAR FRAGMENTO (patch mode).
📌 Destino: ${docDescription}

${dest.mode === 'auto' ? `INSTRUCCIÓN DE DESTINO:
Como el destino es automático, debes determinar a qué capítulo o sección del Master Doc va dirigida esta corrección.
Indica obligatoriamente el título exacto de ese documento dentro del bloque de metadatos inicial como [[DESTINO: Nombre Exacto]] (ej. [[DESTINO: Personajes]]).

${targetsStr}` : ''}

El usuario ha seleccionado un fragmento específico de su texto para que lo modifiques.
Tu tarea es:
1. Recibir el fragmento original
2. Aplicar los cambios solicitados SOLO a ese fragmento
3. Devolver el fragmento modificado en texto plano limpio.
NO reescribas el documento completo. Trabaja exclusivamente con el fragmento proporcionado.

${getActionTechnicalDescription('fragmento')}

Contexto del libro:
${context}`,

        escena: () => `${BASE}

🎯 ACCIÓN: ASISTENTE DE ESCRITURA ESCENA POR ESCENA (Progreso Incremental).
📌 Destino: ${docDescription}

Estás asistiendo activamente en la creación de un capítulo escena por escena de manera conversacional y altamente colaborativa.

Tu objetivo actual es planificar, debatir o redactar la escena actual en diálogo constante con el escritor:
1. Si el escritor está debatiendo ideas, haciendo preguntas, pidiendo sugerencias o planificando el enfoque de la escena, responde en tono de mentor creativo y de forma conversacional. Propón alternativas interesantes, haz de 1 a 3 preguntas estratégicas cortas (por ejemplo: ¿desde la perspectiva de quién narramos?, ¿cuál es el conflicto de esta escena?, ¿qué detalles de lore del Master Doc queremos introducir?). Para esta fase conversacional, tu respuesta debe ser del tipo de metadatos [[TIPO: sugerencia]].
2. Si el escritor te pide redactar la escena de forma explícita ("escribe la escena", "redacta la escena", etc.) o si se presiona el atajo de redactar, debes generar la prosa narrativa final de la escena.

${getActionTechnicalDescription('escena')}

Contexto del libro:
${context}`,

        analizar: () => `${BASE}

🎯 ACCIÓN: ANALIZAR el contenido.

Lleva a cabo un análisis del contexto proporcionado.

INSTRUCCIÓN CRÍTICA DE INCONSISTENCIAS — FORMATO ESTRICTO:
Si el escritor te solicita explícitamente auditar la coherencia, buscar inconsistencias, contradicciones, vacíos, huecos de lore o dudas entre el Master Doc y sus capítulos:
1. Realiza una auditoría sumamente detallada.
2. Responde estrictamente usando [[TIPO: inconsistencias]].
3. CADA inconsistencia debe usar el formato de doble corchete ESTRUCTURADO con [[inconsistencia id="N" archivos="..."]].
4. Siempre proporciona al menos 2 opciones de solución por inconsistencia.

⛔ FORMATOS NO VÁLIDOS (NO USARLOS):
   ❌ [[1. Título del problema]] — numeración simple sin estructura
   ❌ [[Título]] / [[Descripción]] — etiquetas sueltas
   ❌ 1. Problema: ... Opción A: ... — listas numeradas planas
   ❌ - Problema: ... - Solución: ... — listas con guiones

✅ ÚNICO FORMATO VÁLIDO:
   [[inconsistencia id="1" archivos="doc1,doc2"]]
   [[titulo]]Título corto[[/titulo]]
   [[problema]]Descripción detallada[[/problema]]
   [[solucion letra="A"]]Propuesta A[[/solucion]]
   [[solucion letra="B"]]Propuesta B[[/solucion]]
   [[/inconsistencia]]

De lo contrario, para análisis de estilo, gramática, ritmo, tono o estructura:
1. Responde con [[TIPO: analisis]].
2. Escribe tu retroalimentación en texto plano claro y estructurado con saltos de línea dobles (\\n\\n).

${getActionTechnicalDescription('analizar')}

Contexto del libro:
${context}`,

        sugerir: () => `${BASE}

🎯 ACCIÓN: SUGERIR ideas creativas.

Basado en el contexto, propón ideas para mejorar la historia:
1. Giros argumentales que podrían funcionar
2. Desarrollo de personajes y arcos narrativos
3. Escenas alternativas o nuevas escenas
4. Mejoras de tensión dramática
5. Ampliación del mundo

${getActionTechnicalDescription('sugerir')}

Contexto del libro:
${context}`,

        constructor_personaje: () => `${BASE}

🎯 ACCIÓN: CREADOR DE PERSONAJES (paso a paso).

Estás guiando al escritor en la creación de un personaje nuevo en un proceso paso a paso y conversacional.

Tu objetivo es:
1. Haz preguntas estratégicas una a la vez (nunca más de 2-3 por turno) para ir construyendo el personaje de forma orgánica: nombre, rol/apariencia, personalidad/rasgos, historia/motivación, arco narrativo.
2. Cuando tengas suficiente información, resume el perfil completo del personaje usando:
[[TIPO: contenido]]
[[ÁMBITO: completo]]
[[DESTINO: Personajes]]
El contenido debe ser una ficha de personaje en texto plano bien estructurada, con secciones separadas por \\n\\n.
3. Sé creativo y sugiere ideas interesantes, pero respeta las decisiones del escritor.

${getActionTechnicalDescription('escribir')}
- No modifiques información existente a menos que el escritor lo solicite.

Contexto del libro:
${context}`,

        inconsistencia: () => `${BASE}

🎯 ACCIÓN: RESOLVER INCONSISTENCIA — Editar quirúrgicamente documentos afectados.
📌 Destino: ${docDescription}

El escritor ha detectado y seleccionado una solución para una inconsistencia de lore.
Tu tarea es modificar SOLO las secciones afectadas de los documentos, preservando TODO el resto del contenido intacto.

⚠️ REGLA CRÍTICA: NUNCA uses [[ÁMBITO: completo]]. Siempre usa [[ÁMBITO: parcial]].
⚠️ Si el cambio es pequeño y localizado, prefiere [[TIPO: fragmento]] con el bloque [[ORIGINAL]].
⚠️ Si modificas múltiples documentos, devuelve bloques consecutivos con sus respectivos metadatos.

${getActionTechnicalDescription('inconsistencia')}

Contexto del libro:
${context}`,

        chat: () => `${BASE}

🎯 ACCIÓN: CHAT — Consultas generales, dudas y preguntas rápidas.

Responde de forma natural, conversacional y directa. No esperes un visor de diferencias ni estructures la respuesta para edición.

Auto-determina el tipo de respuesta según la pregunta:
- ¿Duda/Pregunta/Explicación sobre el lore? → [[TIPO: sugerencia]] o texto plano
- ¿Crear algo rápido (un nombre, un dato)? → texto plano sin estructura de destino
- ¿Analizar algo? → [[TIPO: analisis]]
- ¿Buscar inconsistencias? → [[TIPO: inconsistencias]] con formato [[ ]]
- ¿Consultar un detalle del contexto? → texto plano directo

⚠️ IMPORTANTE:
- NO uses [[DESTINO:]] ni [[ÁMBITO:]] — esto es un chat, no edición de documentos.
- No esperes que se muestre un visor de diferencias.
- Puedes usar emojis de forma sutil y natural si es relevante.

${getActionTechnicalDescription('chat')}

Contexto del libro:
${context}`
    };

    return (actionSegments[action] || actionSegments.chat)();
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
 * Labels y emojis para mostrar acciones en la UI
 */
const ACTION_META = {
    escribir: { label: '✏️ Escribir', description: 'Crear contenido nuevo o modificar existente' },
    escena: { label: '🎬 Escena por escena', description: 'Co-escribir capítulo escena por escena' },
    constructor_personaje: { label: '👥 Creador de personajes', description: 'Crear y enriquecer personajes paso a paso' },
    fragmento: { label: '✂️ Fragmentos', description: 'Editar solo una sección o párrafo' },
    analizar: { label: '🔍 Analizar', description: 'Evaluar gramática, estilo, coherencia e inconsistencias' },
    sugerir: { label: '💡 Sugerir', description: 'Proponer ideas y mejoras creativas' },
    chat: { label: '💬 Chat', description: 'Consultas generales, dudas y preguntas rápidas' },
};

/**
 * Acciones rápidas disponibles en IA Studio.
 * Se deriva automáticamente del ACTION_META para que
 * añadir una nueva acción solo requiera tocarla en un solo lugar.
 */
export const QUICK_ACTIONS = Object.entries(ACTION_META)
    .map(([id, meta]) => ({
        id,
        label: meta.label,
        description: meta.description,
    }));



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

/**
 * Parsea respuestas de DeepSeek Tool Calling a la estructura de bloques interna.
 */
export const parseToolCallResponse = (name, argsJson, destinationDoc, chapters = [], worldItems = []) => {
    if (!name || !argsJson) return [];
    
    let args = {};
    try {
        args = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
    } catch (e) {
        // Fallback simple para parsing parcial durante streaming
        const cleanJson = typeof argsJson === 'string' ? argsJson.trim() : '';
        try {
            const extractProp = (propName) => {
                const r = new RegExp(`"${propName}"\\s*:\\s*"([^"]*)"`, 'i');
                const m = r.exec(cleanJson);
                return m ? m[1] : '';
            };
            if (name === 'crear_capitulo') {
                args.titulo = extractProp('titulo');
                args.contenido_html = extractProp('contenido_html');
            } else if (name === 'aplicar_parche') {
                args.documento_id = extractProp('documento_id');
                args.texto_original = extractProp('texto_original');
                args.texto_reemplazo = extractProp('texto_reemplazo');
                args.contexto_linea = extractProp('contexto_linea');
            } else if (name === 'registrar_inconsistencia') {
                args.titulo = extractProp('titulo');
                args.problema = extractProp('problema');
            }
        } catch (innerErr) {}
    }

    if (name === 'crear_capitulo') {
        return [{
            docType: 'chapter',
            docId: null,
            mode: 'new',
            title: args.titulo || 'Nuevo capítulo',
            content: args.contenido_html || '',
            responseType: 'content'
        }];
    }

    if (name === 'aplicar_parche') {
        let dest = destinationDoc || { mode: 'auto' };
        if (args.documento_id) {
            const resolved = resolveTargetDoc(args.documento_id, chapters, worldItems);
            if (resolved) {
                dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
            } else {
                dest = { mode: 'auto', docTitle: args.documento_id };
            }
        }
        return [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: dest.docTitle || 'Fragmento',
            content: args.texto_reemplazo || '',
            original: args.texto_original || '',
            responseType: 'patch',
            isPatch: true,
            context: args.contexto_linea || ''
        }];
    }

    if (name === 'registrar_inconsistencia') {
        const inconsistencies = [{
            id: 'inc_' + Math.random().toString(36).substr(2, 9),
            files: Array.isArray(args.archivos_involucrados) 
                ? args.archivos_involucrados.map(f => {
                    const resolved = resolveTargetDoc(f, chapters, worldItems);
                    return resolved ? resolved.docId : f;
                  })
                : [],
            title: args.titulo || 'Conflicto de lore',
            problem: args.problema || '',
            options: Array.isArray(args.opciones_resolucion)
                ? args.opciones_resolucion.map(o => ({
                    letter: (o.letra || '').toUpperCase().trim(),
                    text: o.texto || ''
                  }))
                : [],
            resolved: false,
            selectedOption: null,
            customText: ''
        }];
        return [{
            docType: 'text',
            docId: null,
            mode: 'text',
            title: 'Inconsistencias',
            content: 'Se han detectado inconsistencias de lore.',
            responseType: 'inconsistencies',
            inconsistencies: inconsistencies
        }];
    }

    if (name === 'aplicar_parches_resolucion') {
        const parches = Array.isArray(args.parches) ? args.parches : [];
        return parches.map(patch => {
            let dest = destinationDoc || { mode: 'auto' };
            if (patch.documento_id) {
                const resolved = resolveTargetDoc(patch.documento_id, chapters, worldItems);
                if (resolved) {
                    dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
                } else {
                    dest = { mode: 'auto', docTitle: patch.documento_id };
                }
            }
            return {
                docType: dest.docType || null,
                docId: dest.docId || null,
                mode: dest.mode || 'auto',
                title: dest.docTitle || patch.documento_id || 'Fragmento',
                content: patch.texto_reemplazo || '',
                original: patch.texto_original || '',
                responseType: 'patch',
                isPatch: true,
                context: 'Resolución de conflicto'
            };
        });
    }

    if (name === 'localizar_parche_exacto') {
        let dest = destinationDoc || { mode: 'auto' };
        if (args.documento_id) {
            const resolved = resolveTargetDoc(args.documento_id, chapters, worldItems);
            if (resolved) {
                dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
            } else {
                dest = { mode: 'auto', docTitle: args.documento_id };
            }
        }
        return [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: dest.docTitle || 'Fragmento',
            content: args.texto_reemplazo || '',
            original: args.texto_original_exacto || '',
            responseType: 'patch',
            isPatch: true,
            context: 'Autocorrección de parche'
        }];
    }

    if (name === 'sugerir_nombres' || name === 'proponer_preguntas_entrevista' || name === 'sugerir_respuestas_rapidas') {
        return [{
            docType: 'text',
            docId: null,
            mode: 'text',
            title: 'Asistente de Personajes',
            content: typeof argsJson === 'string' ? argsJson : JSON.stringify(args),
            responseType: 'analysis'
        }];
    }

    return [];
};

