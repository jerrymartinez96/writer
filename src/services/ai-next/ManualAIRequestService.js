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

const buildManualPrompt = (prompt, options = {}) => {
    const basePrompt = formatMessages(prompt);
    const schema = options.tools?.[0];
    if (!schema?.function?.parameters) return basePrompt;
    return `${basePrompt}\n\n---\nINSTRUCCIÓN DE FORMATO PARA RESPUESTA MANUAL:\nDevuelve únicamente un objeto JSON válido, sin bloques Markdown, comentarios ni texto adicional. Debe cumplir este esquema:\n${JSON.stringify(schema.function.parameters, null, 2)}`;
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
        const parsed = parseStructuredResponse(value, 'respuesta manual');
        validateStructuredResponse(parsed, activeRequest.schema, 'respuesta manual');
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
