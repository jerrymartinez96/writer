import { parseStructuredResponse, validateStructuredResponse } from './StructuredResponse';

let activeRequest = null;
let requestQueue = [];
const listeners = new Set();

const notify = () => {
    const snapshot = activeRequest ? {
        id: activeRequest.id,
        prompt: activeRequest.prompt,
        responseMode: activeRequest.responseMode,
        schemaName: activeRequest.schema?.function?.name || null,
    } : null;
    listeners.forEach((listener) => listener(snapshot));
};

const advance = () => {
    if (activeRequest || requestQueue.length === 0) return;
    activeRequest = requestQueue.shift();
    notify();
};

const formatMessages = (prompt) => {
    if (!Array.isArray(prompt)) return String(prompt || '');
    return prompt.map((message) => {
        const role = String(message?.role || 'user').toUpperCase();
        const content = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content || '');
        return `### ${role}\n${content}`;
    }).join('\n\n');
};

const buildRequiredExample = (schema) => {
    if (!schema) return null;
    if (schema.type === 'object') return Object.fromEntries((schema.required || []).map((key) => [key, buildRequiredExample(schema.properties?.[key])]));
    if (schema.type === 'array') return [];
    if (schema.type === 'number') return 0;
    if (schema.type === 'boolean') return false;
    if (schema.enum?.length) return schema.enum[0];
    return '';
};

const buildManualPrompt = (prompt, options = {}) => {
    const basePrompt = formatMessages(prompt);
    const schema = options.tools?.[0];
    if (!schema?.function?.parameters) return basePrompt;
    const parameters = schema.function.parameters;
    const required = parameters.required || [];
    const example = buildRequiredExample(parameters);
    return `${basePrompt}\n\n---\nINSTRUCCIÓN DE FORMATO PARA RESPUESTA MANUAL:\nAunque este chat no admita herramientas o function calling, responde con sus argumentos como un objeto JSON en la raíz. No incluyas el nombre de la herramienta, bloques Markdown, comentarios ni texto adicional.\nCampos obligatorios en la raíz: ${required.join(', ') || '(ninguno)'}. Inclúyelos todos; usa [] para listas vacías. No copies este ejemplo literalmente: sustituye sus valores con la respuesta completa.\nEstructura mínima de ejemplo:\n${JSON.stringify(example, null, 2)}\nEsquema que debe cumplirse:\n${JSON.stringify(parameters)}`;
};

const unwrapStructuredValue = (parsed, schemaName) => {
    let value = parsed;
    for (let depth = 0; depth < 4; depth += 1) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) break;
        if (schemaName && value[schemaName] !== undefined) {
            value = value[schemaName];
            continue;
        }
        const toolArguments = value.tool_calls?.[0]?.function?.arguments ?? value.function?.arguments ?? value.arguments;
        if (toolArguments !== undefined) {
            value = typeof toolArguments === 'string' ? parseStructuredResponse(toolArguments, 'argumentos de herramienta') : toolArguments;
            continue;
        }
        const wrapperKey = ['result', 'response', 'data'].find((key) => value[key] && typeof value[key] === 'object');
        if (!wrapperKey) break;
        value = value[wrapperKey];
    }
    return value;
};

const countWords = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).length;

const normalizeRecoverableStructuredValue = (parsed, raw, schema) => {
    const schemaName = schema?.function?.name || '';
    const properties = schema?.function?.parameters?.properties || {};
    let value = unwrapStructuredValue(parsed, schemaName);
    const acceptsReplacement = properties.replacement?.type === 'string';
    const acceptsFormattedText = properties.formattedText?.type === 'string';

    if (typeof value === 'string') value = acceptsFormattedText ? { formattedText: value } : acceptsReplacement ? { replacement: value } : value;
    if ((!value || typeof value !== 'object' || Array.isArray(value)) && (acceptsReplacement || acceptsFormattedText)) {
        value = acceptsFormattedText ? { formattedText: raw } : { replacement: raw };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

    if (acceptsReplacement && !value.replacement) {
        const replacementAlias = ['content', 'text', 'chapter', 'chapterText', 'draft', 'output', 'proposal'].find((key) => typeof value[key] === 'string' && value[key].trim());
        if (replacementAlias) value = { ...value, replacement: value[replacementAlias] };
    }
    if (acceptsFormattedText && !value.formattedText) {
        const textAlias = ['content', 'text', 'output', 'replacement'].find((key) => typeof value[key] === 'string' && value[key].trim());
        if (textAlias) value = { ...value, formattedText: value[textAlias] };
    }

    // Estos campos describen el texto y se pueden reconstruir sin inventar
    // contenido narrativo. Los contratos de auditoría y planificación siguen
    // validándose de forma estricta.
    if (typeof value.replacement === 'string' && value.replacement.trim()) {
        if (properties.summary && value.summary == null) value.summary = 'Respuesta manual preparada para revisión.';
        if (properties.wordCount && value.wordCount == null) value.wordCount = countWords(value.replacement);
        if (properties.usedScenes && value.usedScenes == null) value.usedScenes = [];
        if (properties.risk && value.risk == null) value.risk = 'medium';
    }
    return value;
};

const parseManualStructuredResponse = (value, schema) => {
    let parsed;
    try {
        parsed = parseStructuredResponse(value, 'respuesta manual');
    } catch (error) {
        const properties = schema?.function?.parameters?.properties || {};
        if (!properties.replacement && !properties.formattedText) throw error;
        parsed = value;
    }
    return normalizeRecoverableStructuredValue(parsed, value, schema);
};

const makeAbortError = () => {
    const error = new Error('Solicitud manual cancelada.');
    error.name = 'AbortError';
    return error;
};

const removeQueuedRequest = (id) => {
    const index = requestQueue.findIndex((request) => request.id === id);
    if (index < 0) return null;
    return requestQueue.splice(index, 1)[0];
};

export const requestManualAIResponse = (prompt, options = {}) => new Promise((resolve, reject) => {
    const request = {
        id: `manual-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prompt: buildManualPrompt(prompt, options),
        responseMode: options.responseMode || (options.useJsonMode ? 'json' : 'text'),
        schema: options.tools?.[0] || null,
        resolve,
        reject,
        signal: options.signal || null,
        abortHandler: null,
    };

    if (request.signal?.aborted) {
        reject(makeAbortError());
        return;
    }

    if (request.signal) {
        request.abortHandler = () => {
            if (activeRequest?.id === request.id) {
                activeRequest = null;
                request.reject(makeAbortError());
                notify();
                advance();
                return;
            }
            const queued = removeQueuedRequest(request.id);
            queued?.reject(makeAbortError());
        };
        request.signal.addEventListener('abort', request.abortHandler, { once: true });
    }

    requestQueue.push(request);
    advance();
});

export const getActiveManualAIRequest = () => activeRequest ? {
    id: activeRequest.id,
    prompt: activeRequest.prompt,
    responseMode: activeRequest.responseMode,
    schemaName: activeRequest.schema?.function?.name || null,
} : null;

export const subscribeToManualAIRequests = (listener) => {
    listeners.add(listener);
    listener(getActiveManualAIRequest());
    return () => listeners.delete(listener);
};

export const validateManualAIResponse = (requestId, response) => {
    if (!activeRequest || activeRequest.id !== requestId) throw new Error('Esta solicitud manual ya no está activa.');
    const value = String(response || '').trim();
    if (!value) throw new Error('Pega la respuesta de la IA antes de continuar.');

    if (activeRequest.schema) {
        const parsed = parseManualStructuredResponse(value, activeRequest.schema);
        validateStructuredResponse(parsed, activeRequest.schema, 'respuesta manual');
        return JSON.stringify(parsed);
    } else if (activeRequest.responseMode === 'json') {
        parseStructuredResponse(value, 'respuesta manual');
    }

    return value;
};

export const submitManualAIResponse = (requestId, response) => {
    const value = validateManualAIResponse(requestId, response);

    const completed = activeRequest;
    activeRequest = null;
    completed.signal?.removeEventListener('abort', completed.abortHandler);
    notify();
    completed.resolve(value);
    advance();
};

export const cancelManualAIRequest = (requestId) => {
    if (!activeRequest || activeRequest.id !== requestId) return;
    const cancelled = activeRequest;
    activeRequest = null;
    cancelled.signal?.removeEventListener('abort', cancelled.abortHandler);
    notify();
    cancelled.reject(makeAbortError());
    advance();
};

export const resetManualAIRequestsForTests = () => {
    activeRequest = null;
    requestQueue = [];
    notify();
};
