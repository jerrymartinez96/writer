/**
 * intentClassifier.js
 * Capa 1 — Clasificador automático de intención del usuario.
 *
 * Antes de ejecutar una solicitud, se hace UNA petición rápida a DeepSeek
 * (modelo flash, temperature 0) con la lista de acciones disponibles para que
 * determine QUÉ acción corresponde (escribir, fragmento, analizar, etc.).
 *
 * Estrategia robusta:
 * 1. Llama a DeepSeek pidiendo JSON en el prompt (sin depender de JSON mode).
 * 2. Parsea la respuesta con regex tolerante (puede venir envuelta en texto).
 * 3. Si el modelo falla, hace un fallback por keywords en el texto del usuario.
 *
 * API:
 * - buildActionOptionsText(actions)  → texto legible de acciones para el prompt.
 * - classifyAction(userText, actions, apiKey, modelId, bookContext) → Promise<string|null>
 */
import { AIService } from '../../../services/AIService';

/**
 * Convierte una lista de acciones [{id,label,description}] en un bloque de texto
 * legible para el modelo, con instrucciones de cuándo usar cada una.
 * @param {Array<{id:string,label:string,description:string}>} actions
 * @returns {string}
 */
export const buildActionOptionsText = (actions = []) => {
    if (!actions || actions.length === 0) return 'No hay acciones disponibles. Responde en modo chat.';

    return actions
        .map(a => {
            const when = a.when || inferWhenClause(a.id);
            // Limpiar emojis del label usando codepoints (evita errores de regex con surrogate pairs)
            const label = (a.label || a.id || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim() || a.id;
            return `- id: "${a.id}" | ${label} | ${a.description || ''} ${when}`;
        })
        .join('\n');
};

/**
 * Infiere una cláusula de "cuándo usar" por id conocido.
 * @param {string} actionId
 * @returns {string}
 */
export const inferWhenClause = (actionId) => {
    const whenMap = {
        escribir: '| ÚSALA si el usuario pide crear, redactar, modificar, ampliar o expandir contenido.',
        fragmento: '| ÚSALA si el usuario pide corregir, editar, cambiar o reemplazar un fragmento/párrafo específico.',
        analizar: '| ÚSALA si el usuario pide evaluar, revisar, analizar, auditar o detectar inconsistencias.',
        sugerir: '| ÚSALA si el usuario pide ideas, sugerencias, mejoras creativas u opiniones.',
        escena: '| ÚSALA si el usuario pide planificar o escribir una escena específica.',
        formatear: '| ÚSALA si el usuario pide dar formato, espaciado o legibilidad a un documento.',
        crear_capitulo: '| ÚSALA si el usuario pide crear un capítulo o documento NUEVO.',
        crear_personaje: '| ÚSALA SIEMPRE si el usuario pide crear, agregar, inventar o diseñar un personaje o una ficha de personaje. Nunca uses crear_capitulo para personajes.',
        leer_documento: '| ÚSALA si el usuario pide leer, mostrar o consultar el contenido de un documento.',
        chat: '| ÚSALA para dudas, conversación, preguntas rápidas o cuando nada de lo anterior encaje claramente.',
    };
    return whenMap[actionId] || '';
};

/**
 * Extrae el actionId de una respuesta del modelo, tolerante a formato.
 * Soporta: {"actionId":"..."}, {"action_id":"..."}, "actionId":"...",
 * y respuestas envueltas en texto/markdown.
 * @param {string} response
 * @returns {string|null}
 */
const extractActionId = (response) => {
    if (!response) return null;
    const str = String(response);

    // 1. JSON válido (objeto completo o parcial extraído con llaves)
    try {
        const firstBrace = str.indexOf('{');
        const lastBrace = str.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            const parsed = JSON.parse(str.substring(firstBrace, lastBrace + 1));
            if (parsed?.actionId) return parsed.actionId;
            if (parsed?.action_id) return parsed.action_id;
        }
    } catch { /* seguir */ }

    // 2. Regex directa "actionId": "valor" o actionId: valor
    const m = str.match(/"actionId"\s*:\s*"([^"]+)"/i) ||
              str.match(/"action_id"\s*:\s*"([^"]+)"/i) ||
              str.match(/actionId["']?\s*[:=]\s*["']?([A-Za-z0-9_]+)/i) ||
              str.match(/action_id["']?\s*[:=]\s*["']?([A-Za-z0-9_]+)/i);
    if (m) return m[1];

    // 3. Si la respuesta es literalmente un id conocido (sin estructura)
    const clean = str.trim().replace(/`|"|'/g, '');
    if (/^[a-z_]+$/i.test(clean)) return clean;

    return null;
};

/**
 * Fallback por keywords: clasifica el texto del usuario comparando palabras clave
 * de las acciones. Útil si el modelo no responde.
 * @param {string} userText
 * @param {Array} actions
 * @returns {string|null}
 */
const fallbackByKeywords = (userText, actions = []) => {
    const text = (userText || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Palabras clave genéricas por id (sin tildes)
    const keywordMap = {
        escribir: ['escrib', 'redact', 'crear', 'agreg', 'anad', 'amplia', 'expande', 'genera', 'nuevo'],
        fragmento: ['corrig', 'cambia', 'modifica', 'edita', 'reemplaza', 'arregla', 'reescrib', 'actualiza la edad'],
        analizar: ['analiz', 'revisa', 'evalua', 'audita', 'inconsistencia', 'contradiccion', 'coherencia'],
        sugerir: ['sugier', 'idea', 'propone', 'opina', 'que tal si', 'como puedo'],
        escena: ['escena', 'planifica la escena'],
        formatear: ['formatea', 'formato', 'espaciado'],
        crear_capitulo: ['crea un capitulo', 'crea un capitulo', 'nuevo capitulo'],
        crear_personaje: ['crea un personaje', 'crear un personaje', 'nuevo personaje', 'agrega un personaje', 'anade un personaje', 'crea una ficha'],
        leer_documento: ['lee el documento', 'lee la informacion', 'muestrame el documento', 'que dice', 'qué dice'],
    };

    for (const action of actions) {
        const keywords = keywordMap[action.id];
        if (!keywords) continue;
        for (const kw of keywords) {
            const normalizedKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (text.includes(normalizedKw)) return action.id;
        }
    }
    return null;
};

/**
 * Clasifica la intención del usuario con una llamada rápida a DeepSeek.
 *
 * @param {string} userText - Solicitud del usuario.
 * @param {Array<{id:string,label:string,description:string}>} actions - Acciones disponibles.
 * @param {string} apiKey - API key de DeepSeek.
 * @param {string} [modelId] - Modelo a usar (por defecto deepseek-v4-flash).
 * @param {string} [bookContext] - Contexto opcional del libro (título/sinopsis).
 * @returns {Promise<string|null>} El actionId clasificado, o null si falla.
 */
export const classifyAction = async (userText, actions = [], apiKey, modelId = 'deepseek-v4-flash', bookContext = '') => {
    if (!apiKey || !userText) return null;

    const normalizedUserText = String(userText).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const explicitChapterRequest = /\b(crea|crear|nuevo|nueva|escribe|escribir)\b[^.!?\n]{0,40}\b(capitulo|escena|documento)\b/.test(normalizedUserText);
    const asksForCharacter = !explicitChapterRequest
        && /\b(personaje|ficha de personaje|protagonista|antagonista|villano|heroina|heroe)\b/.test(normalizedUserText)
        && /\b(crea|crear|agrega|agregar|anade|nuevo|nueva|inventa|disena|escribe|haz)\b/.test(normalizedUserText);
    if (asksForCharacter && actions.some(action => action.id === 'crear_personaje')) {
        return 'crear_personaje';
    }

    console.info('[IntentClassifier] Inicio:', { userText, modelId, actions: actions.map(a => a.id) });

    const actionsText = buildActionOptionsText(actions);
    const validIds = actions.map(a => a.id).filter(Boolean);

    const systemPrompt = `Eres un clasificador de intención de escritura literaria. Tu ÚNICA tarea es determinar qué acción de las disponibles corresponde a la solicitud del escritor.
Selecciona la acción MÁS adecuada según el significado de la solicitud, no solo por palabras clave.

${bookContext ? `CONTEXTO DE LA OBRA:\n${bookContext}\n` : ''}

ACCIONES DISPONIBLES (responde SOLO con el id):
${actionsText}

Reglas:
- Si la solicitud es ambigua entre modificar y otra cosa, prefiere la acción de MODIFICAR solo si hay un destino o cambio claro; si no, usa "chat".
- NUNCA inventes un id que no esté en la lista. Si ninguna encaja, usa "chat".
- Responde ÚNICAMENTE con JSON: {"actionId": "id_de_la_accion"}`;

    const userPrompt = `SOLICITUD DEL ESCRITOR:\n"""\n${userText}\n"""`;

    try {
        const response = await AIService.sendDeepSeekMessage(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            apiKey,
            modelId,
            {
                temperature: 0.0,
                max_tokens: 300,
                enableTools: false,
                // NO usar JSON mode: algunos modelos DeepSeek fallan con response_format.
                // El prompt pide JSON y extractActionId lo parsea de forma tolerante.
            }
        );

        const extracted = extractActionId(response);
        console.info('[IntentClassifier] Respuesta:', { response, extracted, validIds });
        if (extracted && validIds.includes(extracted)) {
            return extracted;
        }

        // Si el modelo devolvió algo no válido, intentar keyword fallback
        const keywordHit = fallbackByKeywords(userText, actions);
        if (keywordHit && validIds.includes(keywordHit)) {
            return keywordHit;
        }
        return 'chat';
    } catch (err) {
        console.warn('[intentClassifier] Falló la clasificación del modelo, usando fallback por keywords:', err?.message);
        const keywordHit = fallbackByKeywords(userText, actions);
        if (keywordHit && validIds.includes(keywordHit)) {
            return keywordHit;
        }
        return 'chat';
    }
};

export default {
    buildActionOptionsText,
    classifyAction,
    inferWhenClause,
};
