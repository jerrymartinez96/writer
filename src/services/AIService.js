/**
 * Service to handle AI interactions via OpenRouter, Google Direct, DeepSeek Direct
 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/**
 * Helper: wait for a given number of milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper: retry a fetch with exponential backoff for rate-limited requests (429).
 * Calls fetchFn repeatedly until success or maxRetries exhausted.
 * Between retries, waits: initialDelay * 2^attempt (with jitter).
 * For non-429 errors, throws immediately.
 */
const retryOnRateLimit = async (fetchFn, maxRetries = 3, initialDelay = 2000) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetchFn();
        if (response.ok) return response;

        if (response.status !== 429) {
            // Not a rate-limit error; throw immediately
            return response;
        }

        if (attempt < maxRetries) {
            // Exponential backoff with jitter: baseDelay * 2^attempt + random(0, 1000)
            const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            console.warn(
                `[AIService] Rate limited (429) on attempt ${attempt + 1}/${maxRetries}. ` +
                `Retrying in ${Math.round(delay)}ms...`
            );
            await sleep(delay);
        }
    }
    // All retries exhausted
    return await fetchFn();
};

export const AIService = {
    /**
     * Models available (fallback)
     */
    MODELS: [
        // OpenRouter Free Models
        { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash (OR Gratis)", provider: "OpenRouter", context_length: 1048576 },
        { id: "google/gemini-2.0-flash-lite-preview-02-05:free", name: "Gemini 2.0 Lite (OR Gratis)", provider: "OpenRouter", context_length: 1048576 },
        { id: "google/gemini-2.0-pro-exp-02-05:free", name: "Gemini 2.0 Pro (OR Gratis)", provider: "OpenRouter", context_length: 1048576 },
        { id: "google/gemini-1.5-flash:free", name: "Gemini 1.5 Flash (OR Gratis)", provider: "OpenRouter", context_length: 1048576 },
        { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (Gratis)", provider: "OpenRouter", context_length: 64000 },
        { id: "mistralai/mistral-7b-instruct:free", name: "Mistral 7B (Gratis)", provider: "OpenRouter", context_length: 32000 },

        // Direct Google AI Studio Models
        { id: "google_direct/gemini-2.5-flash-preview-04-17", name: "Gemini 2.5 Flash (Google Directo)", provider: "Google", context_length: 1048576 },
        { id: "google_direct/gemini-2.0-flash-exp", name: "Gemini 2.0 Flash (Google Directo)", provider: "Google", context_length: 1048576 },

        // Direct DeepSeek Models
        { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "DeepSeek", context_length: 1048576 },
        { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "DeepSeek", context_length: 1048576 },
    ],

    /**
     * Returns models for a given provider
     */
    getModelsForProvider(provider) {
        switch (provider) {
            case 'google_direct':
                return this.MODELS.filter(m => m.id.startsWith('google_direct/'));
            case 'deepseek':
                return this.MODELS.filter(m => m.provider === 'DeepSeek');
            case 'openrouter':
            default:
                return this.MODELS.filter(m => m.provider === 'OpenRouter');
        }
    },

    /**
     * Fetches current free models from OpenRouter
     */
    async getFreeModels() {
        try {
            const response = await fetch("https://openrouter.ai/api/v1/models");
            if (!response.ok) throw new Error("Error fetching models");
            const data = await response.json();

            const orModels = data.data
                .filter(model =>
                    parseFloat(model.pricing.prompt) === 0 &&
                    parseFloat(model.pricing.completion) === 0
                )
                .map(model => ({
                    id: model.id,
                    name: model.name + " (OR Gratis)",
                    provider: "OpenRouter",
                    context_length: model.context_length
                }));

            return [
                ...this.MODELS.filter(m => m.id.startsWith('google_direct/')),
                ...this.MODELS.filter(m => m.provider === 'DeepSeek'),
                ...orModels
            ];
        } catch (error) {
            console.error("Error fetching free models:", error);
            return this.MODELS;
        }
    },

    /**
     * Estimates token count (rough approximation: 1 token ≈ 4 characters)
     */
    estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    },

    /**
     * Sends a prompt to OpenRouter or Google Directly
     */
    async sendMessage(prompt, apiKey, options = {}) {
        const modelId = options.model || "google/gemini-2.0-flash-exp:free";
        const isGoogleDirect = modelId.startsWith('google_direct/');

        if (isGoogleDirect) {
            const googleKey = options.googleApiKey || apiKey;
            return this.sendGeminiMessage(prompt, googleKey, modelId.split('/')[1], options);
        }

        if (!apiKey) {
            throw new Error("API Key no configurada.");
        }

        const temperature = options.temperature ?? 0.7;

        try {
            const response = await retryOnRateLimit(async () => {
                return await fetch(OPENROUTER_URL, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "HTTP-Referer": window.location.origin,
                        "X-Title": "Writer IA Studio",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: modelId,
                        messages: [{ role: "user", content: prompt }],
                        temperature: temperature,
                        max_tokens: options.max_tokens || 4000,
                    })
                });
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `Error en OpenRouter (${response.status})`);
            }

            const data = await response.json();
            return data.choices[0].message.content || "";
        } catch (error) {
            console.error("AIService.sendMessage Error:", error);
            throw error;
        }
    },

    /**
     * Direct call to Google AI Studio (Gemini) API
     */
    async sendGeminiMessage(prompt, apiKey, model, options = {}) {
        if (!apiKey) {
            throw new Error("API Key de Google Gemini no configurada.");
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: options.temperature ?? 0.7,
                        maxOutputTokens: options.max_tokens || 4000,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `Error en Google Gemini (${response.status})`);
            }

            const data = await response.json();
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                return data.candidates[0].content.parts[0].text;
            }
            throw new Error("Respuesta de Gemini malformada.");
        } catch (error) {
            console.error("AIService.sendGeminiMessage Error:", error);
            throw error;
        }
    },

    /**
     * Generates a streaming response from the AI (supports OpenRouter, Google Direct, DeepSeek Direct)
     * @param {Array} messages - Array of message objects {role, content}
     * @param {Object} settings - AI settings (apiKey, model, etc)
     * @param {Function} onChunk - Callback for each text chunk
     */
    async generateStream(messages, settings, onChunk) {
        const modelId = settings?.selectedAiModel || "google/gemini-2.0-flash-exp:free";
        const selectedApi = settings?.selectedApi || 'openrouter';

        if (selectedApi === 'deepseek') {
            // DeepSeek Direct SSE Stream
            const apiKey = settings?.deepseekApiKey;
            if (!apiKey) throw new Error("API Key de DeepSeek no configurada.");

            const body = {
                model: modelId,
                messages: messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 4000
            };

            // Enable reasoning (thinking) mode for DeepSeek V4 if configured
            if (settings?.reasoningMode) {
                body.thinking = { type: "enabled" };
            }

            const response = await fetch(DEEPSEEK_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `Error DeepSeek (${response.status})`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]' || !dataStr) continue;
                        try {
                            const data = JSON.parse(dataStr);
                            const text = data.choices?.[0]?.delta?.content || '';
                            if (text) onChunk(text);
                        } catch (e) {
                            console.warn("DeepSeek SSE parse error:", e);
                        }
                    }
                }
            }
            return;
        }

        const isGoogleDirect = modelId.startsWith('google_direct/');
        const apiKey = isGoogleDirect ? settings?.googleApiKey : settings?.openRouterKey;

        if (!apiKey) {
            throw new Error(`API Key de ${isGoogleDirect ? 'Google' : 'OpenRouter'} no configurada.`);
        }

        if (isGoogleDirect) {
            // Google Direct SSE Stream
            const model = modelId.split('/')[1] + ":streamGenerateContent";
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?alt=sse&key=${apiKey}`;

            const payload = {
                contents: messages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                })),
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4000
                }
            };

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("❌ [AIService] Error de Google:", {
                    status: response.status,
                    statusText: response.statusText,
                    modelId: modelId,
                    details: errorData?.error?.message || "Sin detalles"
                });
                throw new Error(`Error en Google Gemini Stream (${response.status}): ${errorData?.error?.message || response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (!dataStr) continue;
                        try {
                            const data = JSON.parse(dataStr);
                            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (text) onChunk(text);
                        } catch (e) {
                            console.warn("Gemini SSE JSON parse error:", e);
                        }
                    }
                }
            }
        } else {
            // OpenRouter SSE Stream (with retry on rate-limit)
            const response = await retryOnRateLimit(async () => {
                return await fetch(OPENROUTER_URL, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "HTTP-Referer": window.location.origin,
                        "X-Title": "Writer IA Studio",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: modelId,
                        messages: messages,
                        stream: true,
                        temperature: 0.7,
                    })
                });
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Error en OpenRouter Stream (${response.status}): ${errorData?.error?.message || 'Error desconocido'}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]' || !dataStr) continue;
                        try {
                            const data = JSON.parse(dataStr);
                            const text = data.choices?.[0]?.delta?.content;
                            if (text) onChunk(text);
                        } catch (e) {
                            console.warn("OpenRouter SSE JSON parse error:", e);
                        }
                    }
                }
            }
        }
    }
};

export default AIService;
