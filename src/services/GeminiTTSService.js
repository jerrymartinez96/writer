/**
 * GeminiTTSService.js
 * Generación de audio multimodal usando Gemini 2.5 Flash TTS.
 */

let MAX_TPM_LIMIT = 2; // Límite base: 2 peticiones por minuto (por llave)
let lastRequestTime = 0;

export const NARRATION_INSTRUCTIONS = `Lee esto con un tono dulce calido y fluido`;

/**
 * Ajusta dinámicamente el límite de cuota basado en las llaves disponibles.
 * @param {number} keyCount - Cantidad de llaves configuradas.
 */
export const setDynamicTPM = (keyCount) => {
    MAX_TPM_LIMIT = Math.max(2, keyCount * 2);
};

/**
 * Añade una cabecera WAV a datos PCM crudos (L16).
 * Gemini devuelve PCM 16-bit, 24kHz, Mono.
 */
const addWavHeader = (pcmData, sampleRate = 24000) => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    // RIFF identifier
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + pcmData.byteLength, true); // length
    view.setUint32(8, 0x57415645, false); // "WAVE"
    
    // "fmt " chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // chunk size (16 for PCM)
    view.setUint16(20, 1, true); // audio format (1 for PCM)
    view.setUint16(22, 1, true); // number of channels (1 for Mono)
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * 2, true); // byte rate (SampleRate * Channels * BitsPerSample / 8)
    view.setUint16(32, 2, true); // block align (Channels * BitsPerSample / 8)
    view.setUint16(34, 16, true); // bits per sample
    
    // "data" chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, pcmData.byteLength, true); // data size
    
    return new Blob([header, pcmData], { type: 'audio/wav' });
};

/**
 * Genera audio para un fragmento de texto usando Gemini 2.5 Flash TTS.
 * @param {string} text - El texto a narrar.
 * @param {string} apiKey - API Key de Google.
 * @returns {Promise<Blob>} - El audio generado en formato Blob.
 */
export const generateGeminiAudio = async (text, apiKey) => {
    // 1. Control de Cuota (Ahora gestionado por AudioQueueManager)
    // El AudioQueueManager se encarga de no saturar las llaves y manejar los 429.
    // Mantenemos una pequeña pausa mínima de seguridad de 500ms entre llamadas si es la misma sesión.
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < 500) {
        await new Promise(r => setTimeout(r, 500 - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();

    // 2. Endpoint de Gemini 2.5 Flash TTS
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

    const prompt = `
        ${NARRATION_INSTRUCTIONS}
        
        TEXTO A NARRAR:
        ${text}
    `;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.95,
                    topK: 40,
                    maxOutputTokens: 8192,
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: "Despina" 
                            }
                        }
                    }
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || "Error en la generación de audio con Gemini");
        }

        const data = await response.json();
        
        // Gemini devuelve el audio en el campo 'inlineData'
        const audioPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        
        if (!audioPart || !audioPart.inlineData) {
            throw new Error("El modelo no devolvió datos de audio válidos.");
        }

        // Convertir base64 a Buffer
        const base64Content = audioPart.inlineData.data;
        const binaryString = atob(base64Content);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Gemini devuelve PCM crudo (L16), necesitamos añadir cabecera WAV para que sea reproducible
        return addWavHeader(bytes.buffer, 24000);

    } catch (error) {
        console.error("[Gemini TTS Error]:", error);
        throw error;
    }
};
