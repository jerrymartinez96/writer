import { describe, expect, it } from 'vitest';
import { buildRegisteredPrompt, getPromptDefinition, INTENT_RESPONSE_SCHEMA } from './PromptRegistry';
import { parseAndValidate, StructuredResponseError } from './StructuredResponse';

describe('StructuredResponse y PromptRegistry', () => {
    it('construye prompts desde un registro versionado', () => {
        const definition = getPromptDefinition('classifyRequestIntent');
        const prompt = buildRegisteredPrompt('classifyRequestIntent', { message: 'Quita la escena del puerto', context: 'Capítulo 1' });

        expect(definition.version).toBe('1.0.0');
        expect(definition.responseMode).toBe('json');
        expect(prompt).toContain('Quita la escena del puerto');
        expect(prompt).toContain('No inventes IDs');
    });

    it('parsea JSON encapsulado y valida el contrato', () => {
        const result = parseAndValidate('```json\n{"intent":"question","changeType":"none","scope":"unknown","confidence":0.9,"reason":"Es una pregunta","recommendedTool":"none"}\n```', INTENT_RESPONSE_SCHEMA, 'intención');
        expect(result.intent).toBe('question');
    });

    it('rechaza respuestas incompletas o con valores inválidos', () => {
        expect(() => parseAndValidate('{"intent":"change"}', INTENT_RESPONSE_SCHEMA, 'intención')).toThrow(StructuredResponseError);
        expect(() => parseAndValidate('{"intent":"other","changeType":"none","scope":"unknown","confidence":0.9,"reason":"x","recommendedTool":"none"}', INTENT_RESPONSE_SCHEMA, 'intención')).toThrow('valor no permitido');
    });
});
