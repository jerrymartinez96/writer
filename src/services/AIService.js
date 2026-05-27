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

export const DEEPSEEK_SCHEMAS = [
    {
        type: "function",
        function: {
            name: "crear_capitulo",
            description: "Crea un nuevo capítulo en el manuscrito con el título y contenido especificados.",
            parameters: {
                type: "object",
                properties: {
                    titulo: { type: "string", description: "El título del nuevo capítulo." },
                    contenido_html: { type: "string", description: "El contenido narrativo en formato HTML limpio para el editor." }
                },
                required: ["titulo", "contenido_html"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "aplicar_parche",
            description: "Reemplaza un fragmento de texto exacto de un capítulo o documento existente por un nuevo texto revisado o corregido.",
            parameters: {
                type: "object",
                properties: {
                    documento_id: { type: "string", description: "El ID o título del documento/capítulo a modificar." },
                    texto_original: { type: "string", description: "El fragmento exacto que se desea cambiar de forma textual." },
                    texto_reemplazo: { type: "string", description: "El nuevo texto corregido que sustituye al original." },
                    contexto_linea: { type: "string", description: "Opcional. Contexto o líneas alrededor para asegurar el match exacto." }
                },
                required: ["documento_id", "texto_original", "texto_reemplazo"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "registrar_inconsistencia",
            description: "Registra inconsistencias dramáticas, lógicas o vacíos de lore en el manuscrito para su revisión interactiva por el usuario.",
            parameters: {
                type: "object",
                properties: {
                    titulo: { type: "string", description: "Título descriptivo del conflicto o inconsistencia de lore." },
                    problema: { type: "string", description: "Explicación detallada del porqué existe una inconsistencia." },
                    archivos_involucrados: { 
                        type: "array", 
                        items: { type: "string" }, 
                        description: "Nombres o IDs de los capítulos, personajes o elementos del lore en conflicto." 
                    },
                    opciones_resolucion: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                letra: { type: "string", description: "Opción A, B, C, D" },
                                texto: { type: "string", description: "Propuesta de solución para resolver la inconsistencia." }
                            },
                            required: ["letra", "texto"]
                        }
                    }
                },
                required: ["titulo", "problema", "archivos_involucrados", "opciones_resolucion"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "aplicar_parches_resolucion",
            description: "Aplica de forma simultánea múltiples parches de texto para resolver inconsistencias o actualizar varios documentos a la vez de forma quirúrgica.",
            parameters: {
                type: "object",
                properties: {
                    parches: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                documento_id: { type: "string", description: "El ID o título del documento a modificar." },
                                texto_original: { type: "string", description: "El fragmento exacto que se desea cambiar." },
                                texto_reemplazo: { type: "string", description: "El nuevo texto corregido." }
                            },
                            required: ["documento_id", "texto_original", "texto_reemplazo"]
                        }
                    }
                },
                required: ["parches"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "localizar_parche_exacto",
            description: "Busca y ubica un parche propuesto en el documento, identificando el texto original exacto para su reemplazo.",
            parameters: {
                type: "object",
                properties: {
                    documento_id: { type: "string", description: "El ID o título del documento." },
                    texto_original_exacto: { type: "string", description: "El texto original encontrado en el documento." },
                    texto_reemplazo: { type: "string", description: "El nuevo texto corregido." }
                },
                required: ["documento_id", "texto_original_exacto", "texto_reemplazo"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "sugerir_nombres",
            description: "Sugiere una lista de nombres creativos para personajes basados en el contexto literario.",
            parameters: {
                type: "object",
                properties: {
                    nombres: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                nombre: { type: "string", description: "El nombre sugerido." },
                                personalidad: { type: "string", description: "Rasgo o justificación del nombre." }
                            },
                            required: ["nombre", "personalidad"]
                        }
                    }
                },
                required: ["nombres"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "proponer_preguntas_entrevista",
            description: "Propone preguntas personalizadas de entrevista para moldear un personaje.",
            parameters: {
                type: "object",
                properties: {
                    preguntas: {
                        type: "array",
                        items: { type: "string" },
                        description: "Lista de preguntas para la entrevista."
                    }
                },
                required: ["preguntas"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "sugerir_respuestas_rapidas",
            description: "Propone sugerencias de respuestas rápidas para que el escritor responda a la entrevista de personajes.",
            parameters: {
                type: "object",
                properties: {
                    respuestas: {
                        type: "array",
                        items: { type: "string" },
                        description: "Lista de respuestas cortas y creativas."
                    }
                },
                required: ["respuestas"]
            }
        }
    }
];

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

            // Enable schemas for tool calling if requested
            if (options.enableTools || (typeof model === 'string' && model.startsWith('deepseek') && options.enableTools !== false)) {
                body.tools = DEEPSEEK_SCHEMAS;
                body.tool_choice = "auto";
            }

            // Enable JSON mode if requested (only if tools are not active)
            if (options.useJsonMode && !body.tools) {
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
                const msg = data.choices[0].message;
                if (msg.tool_calls && msg.tool_calls.length > 0) {
                    // Si se llamó una herramienta síncrona, retornamos sus argumentos como string
                    return msg.tool_calls[0].function?.arguments || "";
                }
                return msg.content || "";
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

        // Inject schemas for DeepSeek tool calling if requested
        if (settings?.enableTools) {
            body.tools = DEEPSEEK_SCHEMAS;
            body.tool_choice = "auto";
        }

        // Enable JSON mode if requested (only if tools are not being called)
        if (useJsonMode && !settings?.enableTools) {
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
        let activeToolCalls = [];

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
                        const delta = data.choices?.[0]?.delta;
                        const text = delta?.content || '';
                        if (text) onChunk(text);

                        // Capture tool calls
                        if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
                            delta.tool_calls.forEach(tc => {
                                const idx = tc.index ?? 0;
                                if (!activeToolCalls[idx]) {
                                    activeToolCalls[idx] = {
                                        id: tc.id || '',
                                        name: tc.function?.name || '',
                                        arguments: tc.function?.arguments || ''
                                    };
                                } else {
                                    if (tc.id) activeToolCalls[idx].id = tc.id;
                                    if (tc.function?.name) activeToolCalls[idx].name = tc.function.name;
                                    if (tc.function?.arguments) activeToolCalls[idx].arguments += tc.function.arguments;
                                }

                                if (settings?.onToolCall && activeToolCalls[idx].name) {
                                    settings.onToolCall(
                                        activeToolCalls[idx].name,
                                        activeToolCalls[idx].arguments,
                                        false
                                    );
                                }
                            });
                        }

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

        // Trigger completed callbacks for tool calls if any
        if (activeToolCalls.length > 0 && settings?.onToolCall) {
            activeToolCalls.forEach(tc => {
                if (tc && tc.name) {
                    settings.onToolCall(tc.name, tc.arguments, true);
                }
            });
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
