/**
 * CoWriterCatalog — Catálogo unificado del módulo Coescritor.
 *
 * Es la FUENTE ÚNICA DE VERDAD sobre qué sabe hacer el Coescritor:
 * - Las herramientas nativas de DeepSeek (que se le inyectan a la IA).
 * - Las acciones de IA Studio con las que delegamos la ejecución.
 * - Keywords de voz para resolver la intención cuando el usuario dicta en modo libre.
 * - Estrategia de voz de salida (leer tal cual vs resumen_hablado).
 *
 * Este catálogo alimenta:
 *   1. El system prompt de DeepSeek (descripción + función resumen_hablado).
 *   2. El puente (CoWriterBridge) para mapear dictado → acción.
 *   3. La UI (chips de comandos visibles en el panel).
 */

/**
 * Umbral por defecto: si la salida de DeepSeek supera estas palabras,
 * se invoca resumen_hablado para condensarla antes de narrarla.
 * @type {number}
 */
export const DEFAULT_VOICE_THRESHOLD_WORDS = 180;

/**
 * Estrategias de voz de salida.
 */
export const VOICE_STRATEGY = {
    READ_AS_IS: 'read_as_is',        // Narrar el texto completo tal cual
    SUMMARIZE: 'summarize',          // Condensar con resumen_hablado (DeepSeek)
    AUTO: 'auto',                    // Decidir por umbral de palabras
};

/**
 * Catálogo técnico de acciones del Coescritor.
 * Cada entrada describe:
 * - id: identificador único.
 * - label: etiqueta para la UI.
 * - description: descripción para la UI y para el puente.
 * - voiceKeywords: frases que el usuario podría decir para disparar esta acción.
 * - voiceStrategy: cómo narrar la salida.
 * - isTool: si es una herramienta nativa de DeepSeek (function calling nativo).
 */
export const COWRITER_CATALOG = [
    {
        id: 'leer_documento',
        label: '📖 Leer documento',
        description: 'Obtiene el contenido completo y actual de un documento del libro antes de modificarlo.',
        voiceKeywords: ['lee el documento', 'lee la información', 'lee los personajes', 'que dice', 'qué dice', 'muestrame el documento', 'muéstrame el documento'],
        voiceStrategy: VOICE_STRATEGY.READ_AS_IS,
        isTool: true,
        deepSeekSchema: {
            type: 'function',
            function: {
                name: 'leer_documento',
                description: 'Obtiene el contenido completo y actual de un documento del libro (capítulo, sección del Master Doc, personaje o elemento del mundo). ÚSALA cuando necesites ver el texto exacto de un documento antes de modificarlo, citarlo, o cuando el contexto compartido esté incompleto o comprimido. El documento se identifica por su título exacto (ej. "Información General", "Personajes", "Capítulo 1") o por su ID.',
                parameters: {
                    type: 'object',
                    properties: {
                        documento_id: { type: 'string', description: 'El título exacto o ID del documento a leer (ej. "Información General", "system_core", "Personajes", "Capítulo 1").' }
                    },
                    required: ['documento_id']
                }
            }
        },
    },
    {
        id: 'chat',
        label: '💬 Chat',
        description: 'Consultas generales, dudas y preguntas rápidas.',
        voiceKeywords: ['pregunta', 'consulta', 'dime', 'explica', 'ayudame', 'ayúdame', 'que opinas', 'qué opinas'],
        voiceStrategy: VOICE_STRATEGY.AUTO,
        isTool: false,
    },
    {
        id: 'escribir',
        label: '✏️ Escribir',
        description: 'Crear contenido nuevo o modificar existente.',
        voiceKeywords: ['escribe', 'escribeme', 'redacta', 'crea un capitulo', 'crea un capítulo', 'nuevo capitulo', 'nuevo capítulo', 'agrega', 'añade', 'amplia', 'expande'],
        voiceStrategy: VOICE_STRATEGY.SUMMARIZE,
        isTool: false,
    },
    {
        id: 'fragmento',
        label: '✂️ Fragmento',
        description: 'Editar solo una sección o párrafo.',
        voiceKeywords: ['corrige', 'cambia', 'modifica', 'edita', 'reemplaza', 'arregla', 'reescribe este fragmento'],
        voiceStrategy: VOICE_STRATEGY.READ_AS_IS,
        isTool: false,
    },
    {
        id: 'analizar',
        label: '🔍 Analizar',
        description: 'Evaluar gramática, estilo, coherencia e inconsistencias.',
        voiceKeywords: ['analiza', 'analisis', 'análisis', 'revisa', 'evalua', 'evalúa', 'que tal esta', 'qué tal está'],
        voiceStrategy: VOICE_STRATEGY.AUTO,
        isTool: false,
    },
    {
        id: 'sugerir',
        label: '💡 Sugerir',
        description: 'Proponer ideas y mejoras creativas.',
        voiceKeywords: ['sugiere', 'sugerencia', 'idea', 'ideas', 'propone', 'que tal si', 'qué tal si', 'como puedo', 'cómo puedo'],
        voiceStrategy: VOICE_STRATEGY.AUTO,
        isTool: false,
    },
    {
        id: 'escena',
        label: '🎬 Escena',
        description: 'Co-escribir capítulo escena por escena.',
        voiceKeywords: ['escena', 'escribe la escena', 'planifica la escena'],
        voiceStrategy: VOICE_STRATEGY.SUMMARIZE,
        isTool: false,
    },
    {
        id: 'formatear',
        label: '✨ Formatear',
        description: 'Optimizar espaciado y saltos de línea de un documento.',
        voiceKeywords: ['formatea', 'formato', 'da formato', 'espaciado'],
        voiceStrategy: VOICE_STRATEGY.SUMMARIZE,
        isTool: false,
    },
    {
        id: 'crear_capitulo',
        label: '🆕 Crear capítulo',
        description: 'Crea un nuevo capítulo con título y contenido.',
        voiceKeywords: ['crea un capitulo', 'crea un capítulo', 'nuevo capitulo', 'nuevo capítulo'],
        voiceStrategy: VOICE_STRATEGY.SUMMARIZE,
        isTool: true,
        deepSeekSchema: {
            type: 'function',
            function: {
                name: 'crear_capitulo',
                description: 'Crea un nuevo capítulo en el manuscrito con el título y contenido especificados.',
                parameters: {
                    type: 'object',
                    properties: {
                        titulo: { type: 'string', description: 'El título del nuevo capítulo.' },
                        contenido_html: { type: 'string', description: 'El contenido narrativo en formato HTML limpio para el editor.' }
                    },
                    required: ['titulo', 'contenido_html']
                }
            }
        },
    },
    {
        id: 'aplicar_parche',
        label: '✂️ Aplicar parche',
        description: 'Reemplaza un fragmento exacto de un documento por un texto revisado.',
        voiceKeywords: ['aplicale', 'revisa este fragmento', 'corrige la edad', 'cambia esta parte'],
        voiceStrategy: VOICE_STRATEGY.READ_AS_IS,
        isTool: true,
        deepSeekSchema: {
            type: 'function',
            function: {
                name: 'aplicar_parche',
                description: 'Reemplaza un fragmento de texto exacto de un capítulo o documento existente por un nuevo texto revisado o corregido.',
                parameters: {
                    type: 'object',
                    properties: {
                        documento_id: { type: 'string', description: 'El ID o título del documento/capítulo a modificar.' },
                        texto_original: { type: 'string', description: 'El fragmento exacto que se desea cambiar de forma textual.' },
                        texto_reemplazo: { type: 'string', description: 'El nuevo texto corregido que sustituye al original.' },
                        contexto_linea: { type: 'string', description: 'Opcional. Contexto o líneas alrededor para asegurar el match exacto.' }
                    },
                    required: ['documento_id', 'texto_original', 'texto_reemplazo']
                }
            }
        },
    },
    {
        id: 'registrar_inconsistencia',
        label: '⚠️ Registrar inconsistencia',
        description: 'Registra inconsistencias de lore para su revisión interactiva.',
        voiceKeywords: ['detecta inconsistencias', 'inconsistencias', 'busca contradicciones', 'audita el lore', 'coherencia'],
        voiceStrategy: VOICE_STRATEGY.SUMMARIZE,
        isTool: true,
        deepSeekSchema: {
            type: 'function',
            function: {
                name: 'registrar_inconsistencia',
                description: 'Registra una o más inconsistencias dramáticas, lógicas o vacíos de lore en el manuscrito para su revisión interactiva por el usuario.',
                parameters: {
                    type: 'object',
                    properties: {
                        inconsistencias: {
                            type: 'array',
                            description: 'Lista de inconsistencias detectadas (de 1 a N).',
                            items: {
                                type: 'object',
                                properties: {
                                    titulo: { type: 'string', description: 'Título descriptivo del conflicto o inconsistencia de lore.' },
                                    problema: { type: 'string', description: 'Explicación detallada del porqué existe una inconsistencia.' },
                                    archivos_involucrados: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Nombres o IDs de los capítulos, personajes o elementos del lore en conflicto.'
                                    },
                                    opciones_resolucion: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                letra: { type: 'string', description: 'Opción A, B, C, D' },
                                                texto: { type: 'string', description: 'Propuesta de solución para resolver la inconsistencia.' }
                                            },
                                            required: ['letra', 'texto']
                                        }
                                    }
                                },
                                required: ['titulo', 'problema', 'archivos_involucrados', 'opciones_resolucion']
                            }
                        }
                    },
                    required: ['inconsistencias']
                }
            }
        },
    },
    {
        id: 'aplicar_parches_resolucion',
        label: '🔧 Resolver inconsistencias',
        description: 'Aplica múltiples parches para resolver inconsistencias en varios documentos.',
        voiceKeywords: ['resuelve la inconsistencia', 'resuelve las inconsistencias', 'aplica los cambios', 'arregla el lore'],
        voiceStrategy: VOICE_STRATEGY.SUMMARIZE,
        isTool: true,
        deepSeekSchema: {
            type: 'function',
            function: {
                name: 'aplicar_parches_resolucion',
                description: 'Aplica de forma simultánea múltiples parches de texto para resolver inconsistencias o actualizar varios documentos a la vez de forma quirúrgica.',
                parameters: {
                    type: 'object',
                    properties: {
                        parches: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    documento_id: { type: 'string', description: 'El ID o título del documento a modificar.' },
                                    texto_original: { type: 'string', description: 'El fragmento exacto que se desea cambiar.' },
                                    texto_reemplazo: { type: 'string', description: 'El nuevo texto corregido.' }
                                },
                                required: ['documento_id', 'texto_original', 'texto_reemplazo']
                            }
                        }
                    },
                    required: ['parches']
                }
            }
        },
    },
    {
        id: 'localizar_parche_exacto',
        label: '📍 Localizar parche',
        description: 'Busca y ubica un parche propuesto en el documento.',
        voiceKeywords: ['localiza el parche', 'encuentra el texto'],
        voiceStrategy: VOICE_STRATEGY.READ_AS_IS,
        isTool: true,
        deepSeekSchema: {
            type: 'function',
            function: {
                name: 'localizar_parche_exacto',
                description: 'Busca y ubica un parche propuesto en el documento, identificando el texto original exacto para su reemplazo.',
                parameters: {
                    type: 'object',
                    properties: {
                        documento_id: { type: 'string', description: 'El ID o título del documento.' },
                        texto_original_exacto: { type: 'string', description: 'El texto original encontrado en el documento.' },
                        texto_reemplazo: { type: 'string', description: 'El nuevo texto corregido.' }
                    },
                    required: ['documento_id', 'texto_original_exacto', 'texto_reemplazo']
                }
            }
        },
    },
    {
        id: 'aplicar_formateo_lectura',
        label: '📖 Aplicar formateo',
        description: 'Toma un documento y devuelve su espaciado optimizado para lectura.',
        voiceKeywords: ['formatea el documento', 'aplica el formato', 'espaciado de lectura'],
        voiceStrategy: VOICE_STRATEGY.SUMMARIZE,
        isTool: true,
        deepSeekSchema: {
            type: 'function',
            function: {
                name: 'aplicar_formateo_lectura',
                description: 'Toma el texto completo de un documento y lo devuelve con el espaciado vertical optimizado para su lectura cómoda. NO modifica ninguna palabra, solo reorganiza los saltos de línea y párrafos para que sea fácil de leer.',
                parameters: {
                    type: 'object',
                    properties: {
                        documento_id: { type: 'string', description: 'El ID o título del documento/capítulo que se está formateando.' },
                        texto_formateado: { type: 'string', description: 'El contenido completo del documento, idéntico al original en redacción pero con saltos de línea dobles (\\n\\n) entre cada sección.' }
                    },
                    required: ['documento_id', 'texto_formateado']
                }
            }
        },
    },
];

/**
 * La nueva función de DeepSeek para el Coescritor: resumen_hablado.
 * Condensa una salida larga en una versión narrable de ~1-1.5 minutos,
 * preservando puntos esenciales, cifras, nombres y el tono original.
 */
export const RESUMEN_HABLADO_SCHEMA = {
    type: 'function',
    function: {
        name: 'resumen_hablado',
        description: 'Condensa un texto largo en una versión oral más breve para leerse en voz alta, PRESERVANDO los puntos esenciales, datos clave y el tono original. Mantiene la estructura de la idea completa en menos palabras. NO modifica documentos.',
        parameters: {
            type: 'object',
            properties: {
                max_palabras: {
                    type: 'integer',
                    description: 'Máximo de palabras objetivo para la versión condensada.'
                },
                texto_condensado: {
                    type: 'string',
                    description: 'Versión condensada del texto. Conserva cifras, nombres, acciones principales y conclusiones. Puede ser igual al original si ya cabe en max_palabras.'
                }
            },
            required: ['max_palabras', 'texto_condensado']
        }
    }
};

/**
 * Todos los schemas de herramientas que DeepSeek conoce en el Coescritor.
 * Combina las herramientas del catálogo + la función resumen_hablado.
 */
export const COWRITER_DEEPSEEK_SCHEMAS = [
    ...COWRITER_CATALOG.filter(item => item.isTool).map(item => item.deepSeekSchema),
    RESUMEN_HABLADO_SCHEMA,
];

/**
 * Busca una entrada del catálogo por su id.
 */
export const getCatalogItem = (id) => COWRITER_CATALOG.find(item => item.id === id);

/**
 * Devuelve las acciones visibles en la UI (chips de comandos).
 */
export const getVoiceCommandChips = () =>
    COWRITER_CATALOG
        .filter(item => item.voiceKeywords.length > 0)
        .map(item => ({
            id: item.id,
            label: item.label,
            keyword: item.voiceKeywords[0],
        }));

export default {
    COWRITER_CATALOG,
    COWRITER_DEEPSEEK_SCHEMAS,
    RESUMEN_HABLADO_SCHEMA,
    VOICE_STRATEGY,
    DEFAULT_VOICE_THRESHOLD_WORDS,
    getCatalogItem,
    getVoiceCommandChips,
};