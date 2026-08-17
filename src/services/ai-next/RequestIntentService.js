import AIService from '../AIService';
import { getConfiguredAIOptions } from './AIRequestOptions';
import { buildRegisteredPrompt, INTENT_RESPONSE_SCHEMA } from './PromptRegistry';
import { parseAndValidate } from './StructuredResponse';

const getApiKey = (profile) => profile?.aiConfig?.deepseekApiKey || profile?.deepseekApiKey || window.localStorage.getItem('deepseekApiKey') || '';

export const classifyRequestIntent = async ({ profile, message, context = '' }) => {
    const apiKey = getApiKey(profile);
    if (!apiKey) throw new Error('Configura una API Key de DeepSeek para analizar la intención.');
    const prompt = buildRegisteredPrompt('classifyRequestIntent', { message, context });
    const options = getConfiguredAIOptions(profile, {
        temperature: 0.05,
        responseMode: 'json',
        max_tokens: 900,
    });
    let result;
    try {
        const raw = await AIService.sendMessage(prompt, apiKey, options);
        result = parseAndValidate(raw, INTENT_RESPONSE_SCHEMA, 'clasificación de intención');
    } catch (firstError) {
        const recoveryPrompt = `${prompt}\n\nLa respuesta anterior no se pudo interpretar. Responde ahora únicamente con un objeto JSON válido, sin Markdown, explicación ni razonamiento.`;
        try {
            const recoveryRaw = await AIService.sendMessage(recoveryPrompt, apiKey, {
                ...options,
                temperature: 0,
                max_tokens: 600,
            });
            result = parseAndValidate(recoveryRaw, INTENT_RESPONSE_SCHEMA, 'clasificación de intención');
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
