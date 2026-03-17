/**
 * Service to handle AI interactions via OpenRouter
 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const AIService = {
    /**
     * Models available in the free tier or recommended
     */
    MODELS: [
        // OpenRouter Free Models
        { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash (OR Gratis)", provider: "OpenRouter", context_length: 1048576 },
        { id: "google/gemini-2.0-flash-lite-preview-02-05:free", name: "Gemini 2.0 Lite (OR Gratis)", provider: "OpenRouter", context_length: 1048576 },
        { id: "google/gemini-2.0-pro-exp-02-05:free", name: "Gemini 2.0 Pro (OR Gratis)", provider: "OpenRouter", context_length: 1048576 },
        { id: "google/gemini-1.5-flash:free", name: "Gemini 1.5 Flash (OR Gratis)", provider: "OpenRouter", context_length: 1048576 },
        { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (Gratis)", provider: "OpenRouter", context_length: 64000 },
        { id: "mistralai/mistral-7b-instruct:free", name: "Mistral 7B (Gratis)", provider: "OpenRouter", context_length: 32000 },
        // Direct Google AI Studio Models (Prefix: google_direct/)
        { id: "google_direct/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Lite (Google Directo)", provider: "Google", context_length: 1048576 },
        { id: "google_direct/gemini-3-flash", name: "Gemini 3 Flash (Google Directo)", provider: "Google", context_length: 1048576 },
        { id: "google_direct/gemini-2.5-flash", name: "Gemini 2.5 Flash (Google Directo)", provider: "Google", context_length: 1048576 }
    ],

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
            
            // Combine with direct models (which are always available if key is present)
            return [
                ...this.MODELS.filter(m => m.id.startsWith('google_direct/')),
                ...orModels
            ];
        } catch (error) {
            console.error("Error fetching free models:", error);
            return this.MODELS; 
        }
    },

    /**
     * Estimates token count (rough approximation: 1 token ≈ 4 characters for English/Spanish)
     * @param {string} text 
     * @returns {number}
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

        if (modelId.startsWith('google_direct/')) {
            const googleKey = options.googleApiKey || apiKey; // Fallback if user used same field
            return this.sendGeminiMessage(prompt, googleKey, modelId.split('/')[1], options);
        }

        if (!apiKey) {
            throw new Error("API Key de OpenRouter no configurada.");
        }

        const temperature = options.temperature ?? 0.7;

        try {
            const response = await fetch(OPENROUTER_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "Writer IA Studio",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: "user", content: prompt }
                    ],
                    temperature: temperature,
                    max_tokens: options.max_tokens || 4000,
                })
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
    }
};

export default AIService;
