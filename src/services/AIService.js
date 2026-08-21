/**
 * Service to handle AI interactions exclusively via DeepSeek Direct API
 */
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const AI_SERVICE_VERBOSE_LOGS = false;

/**
 * Helper: wait for a given number of milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper: retry a fetch with exponential backoff for rate-limited requests (429).
 */
const retryOnRateLimit = async (fetchFn, maxRetries = 3, initialDelay = 2000) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await fetchFn();
        if (response.ok) return response;

        if (response.status !== 429) {
            return response;
        }

        const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(
            `[AIService] Rate limited (429) on attempt ${attempt + 1}/${maxRetries}. ` +
            `Retrying in ${Math.round(delay)}ms...`
        );
        await sleep(delay);
    }
    // Último intento definitivo después de todos los reintentos
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

export const COHERENCE_AUDIT_SCHEMA = {
    type: "function",
    function: {
        name: "reportar_incoherencias",
        description: "Devuelve únicamente contradicciones objetivas encontradas entre documentos del libro. No reportes dudas, omisiones, mejoras narrativas ni situaciones compatibles.",
        parameters: {
            type: "object",
            properties: {
                summary: { type: "string", description: "Resumen breve de la revisión." },
                findings: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            documentAId: { type: "string", description: "ID exacto del primer documento en conflicto." },
                            documentBId: { type: "string", description: "ID exacto del segundo documento en conflicto." },
                            title: { type: "string", description: "Título breve de la contradicción real." },
                            claimA: { type: "string", description: "Afirmación verificable del documento A." },
                            claimB: { type: "string", description: "Afirmación verificable del documento B." },
                            evidenceA: { type: "string", description: "Fragmento o dato concreto que demuestra la afirmación A." },
                            evidenceB: { type: "string", description: "Fragmento o dato concreto que demuestra la afirmación B." },
                            whyContradictory: { type: "string", description: "Explicación precisa de por qué ambas afirmaciones no pueden ser verdaderas al mismo tiempo." },
                            severity: { type: "string", enum: ["medium", "high"] },
                            confidence: { type: "number", minimum: 0, maximum: 1 },
                            suggestedAction: { type: "string", description: "Acción concreta para resolver el conflicto." }
                        },
                        required: ["documentAId", "documentBId", "title", "claimA", "claimB", "evidenceA", "evidenceB", "whyContradictory", "severity", "confidence", "suggestedAction"]
                    }
                }
            },
            required: ["summary", "findings"]
        }
    }
};

export const DEEPSEEK_SCHEMAS = [
    {
        type: "function",
        function: {
            name: "leer_documento",
            description: "Obtiene el contenido completo y actual de un documento del libro (capítulo, sección del Master Doc, ficha de personaje o elemento del mundo). ÚSALA cuando necesites ver el texto exacto de un documento antes de modificarlo, citarlo, o cuando el contexto compartido esté incompleto o comprimido. El documento se identifica por su título exacto (ej. 'Información General', nombre de personaje, 'Capítulo 1') o por su ID. 'Personajes' es solo una lista, no un documento.",
            parameters: {
                type: "object",
                properties: {
                    documento_id: { type: "string", description: "El título exacto o ID del documento a leer (ej. 'Información General', 'system_core', 'Alistair Vance', 'Capítulo 1'). No uses 'Personajes'." }
                },
                required: ["documento_id"]
            }
        }
    },
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
            name: "crear_personaje",
            description: "Crea una ficha individual de personaje en la colección de personajes. Nunca lo guardes como capítulo ni en el documento 'Personajes'.",
            parameters: {
                type: "object",
                properties: {
                    nombre: { type: "string", description: "Nombre exacto del personaje." },
                    descripcion_html: { type: "string", description: "Descripción o ficha del personaje en HTML limpio." },
                    rol: { type: "string", description: "Rol narrativo opcional." }
                },
                required: ["nombre", "descripcion_html"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "aplicar_parche",
            description: "Reemplaza un fragmento de texto exacto de un capítulo, documento de lore o ficha de personaje existente por un nuevo texto revisado. Úsala solo cuando el escritor pide una modificación puntual de un único documento; si la petición implica continuidad, varios documentos o una estructura completa, usa aplicar_parches_resolucion.",
            parameters: {
                type: "object",
                properties: {
                    documento_id: { type: "string", description: "El ID o título del documento/capítulo a modificar." },
                    texto_original: { type: "string", description: "El fragmento exacto que se desea cambiar de forma textual." },
                    texto_reemplazo: { type: "string", minLength: 1, description: "El nuevo texto corregido que sustituye al original. Nunca lo dejes vacío: una cadena vacía solo sería válida si el escritor pidió eliminar explícitamente ese fragmento." },
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
            description: "Registra una o más inconsistencias dramáticas, lógicas o vacíos de lore en el manuscrito para su revisión interactiva por el usuario.",
            parameters: {
                type: "object",
                properties: {
                    inconsistencias: {
                        type: "array",
                        description: "Lista de inconsistencias detectadas (de 1 a N).",
                        items: {
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
                required: ["inconsistencias"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "aplicar_parches_resolucion",
            description: "Aplica de forma simultánea múltiples parches de texto para resolver inconsistencias, cambios de continuidad o actualizaciones que afectan varios documentos. Cada parche debe modificar contenido real; nunca devuelvas texto_reemplazo vacío ni uses esta herramienta para borrar partes sin una instrucción explícita.",
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
                                texto_reemplazo: { type: "string", minLength: 1, description: "El nuevo texto corregido y no vacío. Debe conservar la información original no afectada." }
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
    },
    {
        type: "function",
        function: {
            name: "aplicar_formateo_lectura",
            description: "Toma el texto completo de un documento y lo devuelve con el espaciado vertical optimizado para su lectura cómoda. NO modifica ninguna palabra, solo reorganiza los saltos de línea y párrafos para que sea fácil de leer.",
            parameters: {
                type: "object",
                properties: {
                    documento_id: { type: "string", description: "El ID o título del documento/capítulo que se está formateando." },
                    texto_formateado: { type: "string", description: "El contenido completo del documento, idéntico al original en redacción pero con saltos de línea dobles (\\n\\n) entre cada sección, personaje, párrafo o bloque temático para mejorar la lectura." }
                },
                required: ["documento_id", "texto_formateado"]
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
    getModelsForProvider() {
        return this.MODELS;
    },

    /**
     * Fetches current free models (simplified to return available DeepSeek models)
     */
    async getFreeModels() {
        return this.MODELS;
    },

    /**
     * Estimates token count (rough approximation).
     * Factor calibrado para texto en español: ~3.3 chars/token.
     * El factor 4 es válido para inglés, pero el español usa más
     * caracteres por token debido a vocales, acentos y sílabas largas.
     */
    estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 3.3);
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
            const responseMode = options.responseMode || (options.enableTools ? 'tool' : options.useJsonMode ? 'json' : 'text');
            const shouldUseTools = responseMode === 'tool' || options.enableTools === true;
            console.info('[AIService] Request no-stream:', {
                model,
                messageCount: messagesList.length,
                responseMode,
                enableTools: shouldUseTools,
                useJsonMode: responseMode === 'json' || !!options.useJsonMode,
                reasoningMode: options.reasoningMode ?? false,
                reasoningEffort: options.reasoningMode ? (options.reasoningEffort || 'default') : 'disabled',
                maxTokens: options.max_tokens || 8192,
            });

            // Enable schemas for tool calling if requested
            if (shouldUseTools) {
                body.tools = options.tools || DEEPSEEK_SCHEMAS;
                // DeepSeek Thinking rechaza el parámetro tool_choice completo,
                // incluso cuando su valor es "auto". Con Thinking activo basta
                // enviar los schemas y dejar la selección implícita de la API.
                if (!options.reasoningMode) {
                    body.tool_choice = options.toolChoice || (responseMode === 'tool' ? 'required' : 'auto');
                }
            }

            // JSON mode and tool calling are intentionally mutually exclusive.
            if ((responseMode === 'json' || options.useJsonMode) && !body.tools) {
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
                    body: JSON.stringify(body),
                    signal: options.signal
                });
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `Error en DeepSeek (${response.status})`);
            }

            const data = await response.json();
            console.info('[AIService] Response no-stream:', { model, status: response.status, hasChoices: !!data.choices?.length, finishReason: data.choices?.[0]?.finish_reason, messageKeys: Object.keys(data.choices?.[0]?.message || {}), contentLength: data.choices?.[0]?.message?.content?.length || 0, reasoningContentLength: data.choices?.[0]?.message?.reasoning_content?.length || 0, toolCallCount: data.choices?.[0]?.message?.tool_calls?.length || 0 });
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
        const responseMode = settings?.responseMode || (settings?.enableTools ? 'tool' : settings?.useJsonMode ? 'json' : 'text');



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
        console.info('[AIService] Request stream:', {
            model: modelId,
            messageCount: messages.length,
            responseMode,
            enableTools: responseMode === 'tool',
            lastRole: messages[messages.length - 1]?.role,
            lastMessage: String(messages[messages.length - 1]?.content || '').slice(0, 160),
        });

        // Inject schemas for DeepSeek tool calling if requested
        if (responseMode === 'tool' || settings?.enableTools) {
            body.tools = DEEPSEEK_SCHEMAS;
            if (!settings?.reasoningMode) {
                body.tool_choice = settings.toolChoice || (responseMode === 'tool' ? 'required' : 'auto');
            }
        }

        // Enable JSON mode if requested (only if tools are not being called)
        if ((responseMode === 'json' || settings?.useJsonMode) && !settings?.enableTools && !body.tools) {
            body.response_format = { type: "json_object" };
        }

        // Enable reasoning (thinking) mode for DeepSeek V4 if configured
        if (settings?.reasoningMode) {
            body.thinking = { type: "enabled" };
            if (settings?.reasoningEffort) {
                body.reasoning_effort = settings.reasoningEffort; // 'high'
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
                        if (AI_SERVICE_VERBOSE_LOGS && data.choices?.[0]?.finish_reason) {
                            console.debug('[AIService] SSE final:', data.choices[0].finish_reason);
                        }
                        const delta = data.choices?.[0]?.delta;
                        const text = delta?.content || '';
                        if (text) onChunk(text);

                        // Capture tool calls
                        if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
                            // Los argumentos llegan fragmentados; no se registra
                            // cada fragmento para evitar llenar la consola.
                            delta.tool_calls.forEach(tc => {
                                const idx = tc.index ?? 0;
                                if (!activeToolCalls[idx]) {
                                    activeToolCalls[idx] = {
                                        id: tc.id || '',
                                        name: tc.function?.name || '',
                                        arguments: tc.function?.arguments || '',
                                        reasoningContent: delta.reasoning_content || ''
                                    };
                                } else {
                                    if (tc.id) activeToolCalls[idx].id = tc.id;
                                    if (tc.function?.name) activeToolCalls[idx].name = tc.function.name;
                                    if (tc.function?.arguments) activeToolCalls[idx].arguments += tc.function.arguments;
                                    if (delta.reasoning_content) activeToolCalls[idx].reasoningContent = (activeToolCalls[idx].reasoningContent || '') + delta.reasoning_content;
                                }

                                if (settings?.onToolCall && activeToolCalls[idx].name) {
                                    settings.onToolCall(
                                        activeToolCalls[idx].name,
                                        activeToolCalls[idx].arguments,
                                        false,
                                        activeToolCalls[idx].id,
                                        activeToolCalls[idx].reasoningContent || ''
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
                        console.warn("[AIService] Error al interpretar respuesta SSE:", e?.message || e);
                    }
                }
            }
        }

        // Trigger completed callbacks for tool calls if any
        if (activeToolCalls.length > 0 && settings?.onToolCall) {
            activeToolCalls.forEach(tc => {
                if (tc && tc.name) {
                    settings.onToolCall(tc.name, tc.arguments, true, tc.id, tc.reasoningContent || '');
                }
            });
        }

        console.info('[AIService] Stream finalizado:', {
            textLength: fullResponseText.length,
            toolCallCount: activeToolCalls.length,
        });


    }
};

export default AIService;
