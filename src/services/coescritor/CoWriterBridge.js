/**
 * CoWriterBridge — Puente entre el dictado por voz y la ejecución de DeepSeek.
 *
 * Responsabilidades:
 * 1. Resolver la intención del usuario (texto transcrito) → acción del catálogo.
 * 2. Si la acción está seleccionada manualmente en el panel, usarla directamente.
 * 3. Condensar salidas largas con la función `resumen_hablado` de DeepSeek
 *    cuando la estrategia de voz lo requiera (según umbral).
 */
import { AIService } from '../AIService';
import {
    COWRITER_CATALOG,
    getCatalogItem,
    RESUMEN_HABLADO_SCHEMA,
    VOICE_STRATEGY,
    DEFAULT_VOICE_THRESHOLD_WORDS,
} from './CoWriterCatalog';

/**
 * Conteo rápido de palabras.
 * @param {string} [text]
 * @returns {number}
 */
export const countWords = (text = '') =>
    String(text).replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;

/**
 * Normaliza un texto para comparación de keywords: minúsculas, sin tildes.
 * @param {string} [text]
 * @returns {string}
 */
const normalize = (text = '') =>
    String(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

/**
 * Resuelve la intención de un dictado a una acción del catálogo.
 * @param {string} userText - Texto transcrito por voz (o tecleado).
 * @param {string|null} [selectedAction] - Acción manualmente seleccionada en el panel (si existe).
 * @returns {{ actionId: string, catalogItem: object|null, matchedKeyword: string|null }}
 */
export const resolveIntent = (userText, selectedAction = null) => {
    const trimmed = (userText || '').trim();
    if (!trimmed) return { actionId: 'chat', catalogItem: getCatalogItem('chat'), matchedKeyword: null };

    // 1. Si hay una acción manualmente seleccionada, delegar directo (excepto chat genérico).
    if (selectedAction && selectedAction !== 'chat') {
        const item = getCatalogItem(selectedAction);
        if (item) return { actionId: item.id, catalogItem: item, matchedKeyword: null };
    }

    // 2. Detectar comandos directos de herramientas nativas (p. ej. "/detectar inconsistencias").
    const normalizedText = normalize(trimmed);

    if (/^\/detectar/.test(trimmed)) {
        return { actionId: 'registrar_inconsistencia', catalogItem: getCatalogItem('registrar_inconsistencia'), matchedKeyword: 'detecta inconsistencias' };
    }
    if (/^\/format/.test(trimmed)) {
        return { actionId: 'aplicar_formateo_lectura', catalogItem: getCatalogItem('aplicar_formateo_lectura'), matchedKeyword: 'formatea' };
    }
    if (/^\/mock/.test(trimmed)) {
        return { actionId: 'chat', catalogItem: getCatalogItem('chat'), matchedKeyword: null };
    }

    // 3. Buscar por keywords de voz. Se ordena por keyword más larga para
    //    priorizar frases completas sobre palabras sueltas.
    const scored = COWRITER_CATALOG
        .flatMap(item =>
            item.voiceKeywords.map(kw => ({
                item,
                kw,
                normalizedKw: normalize(kw),
            }))
        )
        .filter(({ normalizedKw }) => normalizedText.includes(normalizedKw))
        .sort((a, b) => b.normalizedKw.length - a.normalizedKw.length);

    if (scored.length > 0) {
        const best = scored[0];
        return { actionId: best.item.id, catalogItem: best.item, matchedKeyword: best.kw };
    }

    // 4. Sin match → chat conversacional.
    return { actionId: 'chat', catalogItem: getCatalogItem('chat'), matchedKeyword: null };
};

/**
 * Decide si un texto de salida debe condensarse con resumen_hablado.
 * Aplica la estrategia definida en el catálogo + el umbral configurable.
 *
 * @param {string} outputText - Texto de salida de DeepSeek.
 * @param {object|null} [catalogItem] - Entrada del catálogo ejecutada.
 * @param {object} [options] - { voiceStrategy?, thresholdWords? }
 * @param {string} [options.voiceStrategy]
 * @param {number} [options.thresholdWords]
 * @returns {{ shouldSummarize: boolean, wordCount: number }}
 */
export const shouldSummarizeOutput = (outputText, catalogItem = null, options = {}) => {
    const strategy = options.voiceStrategy || catalogItem?.voiceStrategy || VOICE_STRATEGY.AUTO;
    const wordCount = countWords(outputText);

    if (strategy === VOICE_STRATEGY.READ_AS_IS) {
        return { shouldSummarize: false, wordCount };
    }
    if (strategy === VOICE_STRATEGY.SUMMARIZE) {
        return { shouldSummarize: true, wordCount };
    }
    // AUTO
    // Las confirmaciones cortas no necesitan una segunda llamada a DeepSeek.
    // El umbral configurable sigue aplicando para respuestas realmente largas.
    const threshold = Math.max(options.thresholdWords || DEFAULT_VOICE_THRESHOLD_WORDS, 80);
    return { shouldSummarize: wordCount > threshold, wordCount };
};

/**
 * Invoca a DeepSeek con la herramienta `resumen_hablado` para condensar
 * una salida larga a un máximo de palabras objetivo.
 *
 * @param {string} text - Texto largo a condensar.
 * @param {string} apiKey - API key de DeepSeek.
 * @param {string} [model] - Modelo DeepSeek.
 * @param {number} [maxWords] - Palabras objetivo para la condensación.
 * @returns {Promise<string>} Texto condensado.
 */
export const summarizeForSpeech = async (text, apiKey, model = 'deepseek-v4-flash', maxWords = DEFAULT_VOICE_THRESHOLD_WORDS) => {
    if (!apiKey) throw new Error('API Key de DeepSeek no configurada para condensar la salida.');

    const systemPrompt = `Eres un condensador de texto para lectura en voz alta. Tu ÚNICA función es reducir el texto provisto a máximo ${maxWords} palabras, PRESERVANDO puntos esenciales, cifras, nombres propios, acciones principales y el tono original. No inventes información. No uses markdown ni HTML. Responde en español.`;

    const userPrompt = `CONDENSA EL SIGUIENTE TEXTO A MÁXIMO ${maxWords} PALABRAS:\n\n"""\n${text}\n"""`;

    const response = await AIService.sendDeepSeekMessage(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        apiKey,
        model,
        {
            temperature: 0.2,
            enableTools: false,
            tools: [RESUMEN_HABLADO_SCHEMA],
            tool_choice: { type: 'function', function: { name: 'resumen_hablado' } },
        }
    );

    // Si DeepSeek devolvió los argumentos de la herramienta (JSON), extraer texto_condensado.
    try {
        const parsed = JSON.parse(response);
        if (parsed?.texto_condensado) return parsed.texto_condensado;
    } catch (err) { /* No era JSON → usar la respuesta directa */ }

    return response || text;
};

/**
 * Prepara el user prompt final que se envía a IA Studio para ejecutar la acción.
 * @param {string} userText - Texto dictado o tecleado.
 * @param {object|null} [catalogItem] - Entrada del catálogo.
 * @returns {string}
 */
export const buildExecutionPrompt = (userText, catalogItem = null) => {
    if (!catalogItem || catalogItem.id === 'chat') return userText;

    // Para la combinación de intención + instrucción, damos contexto a DeepSeek.
    return `[MODO: ${catalogItem.label.replace(/^[^\s]+\s/, '').trim()}]\n${userText}`;
};

export default {
    resolveIntent,
    shouldSummarizeOutput,
    summarizeForSpeech,
    countWords,
    buildExecutionPrompt,
};
