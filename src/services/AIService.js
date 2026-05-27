/**
 * Service to handle AI interactions exclusively via DeepSeek Direct API
 */
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/**
 * Helper: wait for a given number of milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper: retry a fetch with exponential backoff for rate-limited requests (429).
 */
const retryOnRateLimit = async (fetchFn, maxRetries = 3, initialDelay = 2000) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetchFn();
        if (response.ok) return response;

        if (response.status !== 429) {
            return response;
        }

        if (attempt < maxRetries) {
            const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            console.warn(
                `[AIService] Rate limited (429) on attempt ${attempt + 1}/${maxRetries}. ` +
                `Retrying in ${Math.round(delay)}ms...`
            );
            await sleep(delay);
        }
    }
    return await fetchFn();
};

/**
 * The JSON schema that the AI should return for structured responses.
 */
export const AI_RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        type: {
            type: "string",
            enum: ["content", "analysis", "suggestion"],
            description: "Type of response: 'content' for HTML to apply to a document, 'analysis' for text analysis, 'suggestion' for creative ideas"
        },
        html: {
            type: "string",
            description: "HTML content for the document (only when type is 'content')"
        },
        text: {
            type: "string",
            description: "Markdown text for analysis or suggestions (only when type is 'analysis' or 'suggestion')"
        },
        title: {
            type: "string",
            description: "Suggested title (only when creating a new document)"
        }
    },
    required: ["type"]
};

export const AIService = {
    /**
     * Models available (DeepSeek V4 updated list)
     */
    MODELS: [
        { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "DeepSeek", context_length: 1048576 },
        { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "DeepSeek", context_length: 1048576 },
    ],

    /**
     * Returns models for a given provider (always returns all DeepSeek models now)
     */
    getModelsForProvider(provider) {
        return this.MODELS;
    },

    /**
     * Fetches current free models (simplified to return available DeepSeek models)
     */
    async getFreeModels() {
        return this.MODELS;
    },

    /**
     * Estimates token count (rough approximation: 1 token ≈ 4 characters)
     */
    estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    },

    /**
     * Sends a non-streaming prompt to DeepSeek
     * Supports both a single prompt string and an array of message objects [{role, content}]
     */
    async sendMessage(prompt, apiKey, options = {}) {
        const modelId = options.model || "deepseek-v4-flash";
        const deepseekKey = options.deepseekApiKey || apiKey;
        return this.sendDeepSeekMessage(prompt, deepseekKey, modelId, options);
    },

    /**
     * Direct call to DeepSeek API (non-streaming)
     */
    async sendDeepSeekMessage(prompt, apiKey, model, options = {}) {
        if (!apiKey) {
            throw new Error("API Key de DeepSeek no configurada.");
        }

        const temperature = options.temperature ?? 0.7;

        try {
            const messagesList = Array.isArray(prompt) ? prompt : [{ role: "user", content: prompt }];
            const body = {
                model: model,
                messages: messagesList,
                temperature: temperature,
                max_tokens: options.max_tokens || 8192,
            };

            // Enable JSON mode if requested
            if (options.useJsonMode) {
                body.response_format = { type: "json_object" };
            }

            // Inyectar Reasoning y Effort si están configurados
            if (options.reasoningMode) {
                body.thinking = { type: "enabled" };
                if (options.reasoningEffort) {
                    body.reasoning_effort = options.reasoningEffort;
                }
            } else {
                body.thinking = { type: "disabled" };
            }

            const response = await retryOnRateLimit(async () => {
                return await fetch(DEEPSEEK_URL, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body)
                });
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `Error en DeepSeek (${response.status})`);
            }

            const data = await response.json();
            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content || "";
            }
            throw new Error("Respuesta de DeepSeek malformada.");
        } catch (error) {
            console.error("AIService.sendDeepSeekMessage Error:", error);
            throw error;
        }
    },

    /**
     * Generates a streaming response exclusively from DeepSeek Direct
     * @param {Array} messages - Array of message objects {role, content}
     * @param {Object} settings - AI settings (apiKey, model, temperature, useJsonMode, reasoningMode, reasoningEffort)
     * @param {Function} onChunk - Callback for each text chunk
     */
    async generateStream(messages, settings, onChunk, onUsage) {
        const modelId = settings?.selectedAiModel || "deepseek-v4-flash";
        const temperature = settings?.temperature ?? 0.7;
        const useJsonMode = settings?.useJsonMode ?? false;

        console.log(
            `%c🚀 [AIService.generateStream] INICIANDO PETICIÓN STREAM %c\n` +
            `• API: DeepSeek\n` +
            `• Modelo: ${modelId}\n` +
            `• Modo Razonamiento (reasoningMode): ${!!settings?.reasoningMode}\n` +
            `• Esfuerzo de Razonamiento (reasoningEffort): ${settings?.reasoningEffort || 'high'}\n` +
            `• Temperatura: ${temperature}\n` +
            `• JSON Mode: ${useJsonMode}`,
            "background: #4f46e5; color: white; padding: 3px 6px; border-radius: 4px; font-weight: bold;",
            "color: inherit;"
        );
        console.log("📨 Mensajes enviados al modelo:", messages);

        // Decorate onChunk to also log the returned chunks at the end
        let fullResponseText = "";
        const originalOnChunk = onChunk;
        onChunk = (chunk) => {
            fullResponseText += chunk;
            originalOnChunk(chunk);
        };

        const apiKey = settings?.deepseekApiKey;
        if (!apiKey) throw new Error("API Key de DeepSeek no configurada.");

        const body = {
            model: modelId,
            messages: messages,
            stream: true,
            stream_options: { include_usage: true },
            temperature: temperature,
            max_tokens: 32768
        };

        // Enable JSON mode if requested
        if (useJsonMode) {
            body.response_format = { type: "json_object" };
        }

        // Enable reasoning (thinking) mode for DeepSeek V4 if configured
        if (settings?.reasoningMode) {
            body.thinking = { type: "enabled" };
            if (settings?.reasoningEffort) {
                body.reasoning_effort = settings.reasoningEffort; // 'high' o 'max'
            }
        } else {
            body.thinking = { type: "disabled" };
        }

        const response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: settings?.signal
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

                        // Capture usage data if returned in stream
                        if (data.usage && onUsage) {
                            onUsage({
                                promptTokens: data.usage.prompt_tokens,
                                completionTokens: data.usage.completion_tokens,
                                totalTokens: data.usage.total_tokens,
                                reasoningTokens: data.usage.completion_tokens_details?.reasoning_tokens || 0
                            });
                        }
                    } catch (e) {
                        console.warn("DeepSeek SSE parse error:", e);
                    }
                }
            }
        }

        console.log(
            `%c✅ [AIService.generateStream] FLUJO FINALIZADO CON ÉXITO %c\n` +
            `• Longitud del texto recibido: ${fullResponseText.length} caracteres`,
            "background: #10b981; color: white; padding: 3px 6px; border-radius: 4px; font-weight: bold;",
            "color: inherit;"
        );
        console.log("📝 Respuesta completa devuelta:", fullResponseText);
    }
};

export default AIService;
