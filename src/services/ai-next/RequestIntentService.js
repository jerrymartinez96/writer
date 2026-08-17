import AIService from '../AIService';
import { getConfiguredAIOptions } from './AIRequestOptions';

const parseJson = (value) => {
    if (value && typeof value === 'object') return value;
    const raw = String(value || '').trim();
    const candidates = [raw];
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) candidates.unshift(fenced[1].trim());
    for (let start = raw.indexOf('{'); start >= 0; start = raw.indexOf('{', start + 1)) {
        let depth = 0;
        let quoted = false;
        let escaped = false;
        for (let index = start; index < raw.length; index += 1) {
            const character = raw[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (character === '\\') escaped = true;
                else if (character === '"') quoted = false;
                continue;
            }
            if (character === '"') quoted = true;
            else if (character === '{') depth += 1;
            else if (character === '}') {
                depth -= 1;
                if (depth === 0) {
                    candidates.push(raw.slice(start, index + 1));
                    break;
                }
            }
        }
    }
    for (const candidate of candidates) {
        try { return JSON.parse(candidate); } catch { /* intenta otro bloque */ }
    }
    throw new Error('La IA no devolvió una clasificación válida.');
};

const getApiKey = (profile) => profile?.aiConfig?.deepseekApiKey || profile?.deepseekApiKey || window.localStorage.getItem('deepseekApiKey') || '';

export const classifyRequestIntent = async ({ profile, message, context = '' }) => {
    const apiKey = getApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek para analizar la intención.');
    const prompt = `Clasifica la intención real de la solicitud del escritor. No decidas por palabras aisladas: interpreta el significado completo y el objetivo del mensaje.

Devuelve únicamente JSON con esta forma:
{"intent":"change|question|analysis|creative|specialized","changeType":"text|narrative|continuity|none","scope":"single|multiple|unknown","confidence":0.0,"reason":"...","recommendedTool":"none|cowriter|world|coherence|consistency"}

Reglas:
- intent=change solo si el escritor pide modificar, eliminar, sustituir, conservar o redefinir algo de su obra.
- Una pregunta sobre un cambio hipotético no es necesariamente una orden de cambio.
- changeType=narrative cuando cambia el arco, motivación, lealtad, redención, canon o función de un personaje.
- changeType=continuity cuando exige revisar hechos relacionados en varios documentos.
- scope=multiple solo con evidencia de que afecta más de un documento o entidad.
- No prepares parches ni propongas contenido; solo clasifica la intención.

Solicitud del escritor:
${message}

Contexto disponible:
${context || '(sin contexto adicional)'}`;
    const options = getConfiguredAIOptions(profile, {
        temperature: 0.05,
        useJsonMode: true,
        enableTools: false,
        max_tokens: 900,
    });
    let result;
    try {
        const raw = await AIService.sendMessage(prompt, apiKey, options);
        result = parseJson(raw);
    } catch (firstError) {
        const recoveryPrompt = `${prompt}\n\nLa respuesta anterior no se pudo interpretar. Responde ahora únicamente con un objeto JSON válido, sin Markdown, explicación ni razonamiento.`;
        try {
            const recoveryRaw = await AIService.sendMessage(recoveryPrompt, apiKey, {
                ...options,
                temperature: 0,
                reasoningMode: false,
                reasoningEffort: 'disabled',
                max_tokens: 600,
            });
            result = parseJson(recoveryRaw);
        } catch {
            throw firstError;
        }
    }
    return {
        intent: ['change', 'question', 'analysis', 'creative', 'specialized'].includes(result.intent) ? result.intent : 'question',
        changeType: ['text', 'narrative', 'continuity', 'none'].includes(result.changeType) ? result.changeType : 'none',
        scope: ['single', 'multiple', 'unknown'].includes(result.scope) ? result.scope : 'unknown',
        confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0)),
        reason: String(result.reason || ''),
        recommendedTool: String(result.recommendedTool || 'none'),
    };
};

export default classifyRequestIntent;
