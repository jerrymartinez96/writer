import { afterEach, describe, expect, it } from 'vitest';
import {
    cancelManualAIRequest,
    getActiveManualAIRequest,
    requestManualAIResponse,
    resetManualAIRequestsForTests,
    submitManualAIResponse,
    validateManualAIResponse,
} from './ManualAIRequestService';

const TEST_TOOL = {
    type: 'function',
    function: {
        name: 'respuesta_prueba',
        parameters: {
            type: 'object',
            properties: { summary: { type: 'string' }, score: { type: 'number' } },
            required: ['summary', 'score'],
        },
    },
};

const CHAPTER_TOOL = {
    type: 'function',
    function: {
        name: 'redactar_capitulo_desde_estructura',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string' },
                replacement: { type: 'string' },
                wordCount: { type: 'number' },
                usedScenes: { type: 'array', items: { type: 'number' } },
                risk: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['summary', 'replacement', 'wordCount', 'usedScenes', 'risk'],
        },
    },
};

describe('ManualAIRequestService', () => {
    afterEach(() => resetManualAIRequestsForTests());

    it('pauses a text request and resumes it with the pasted response', async () => {
        const pending = requestManualAIResponse('Analiza esta escena', { responseMode: 'text' });
        const request = getActiveManualAIRequest();
        expect(request.prompt).toContain('Analiza esta escena');

        submitManualAIResponse(request.id, 'La escena mantiene la tensión.');
        await expect(pending).resolves.toBe('La escena mantiene la tensión.');
        expect(getActiveManualAIRequest()).toBeNull();
    });

    it('keeps the request open until a structured response satisfies its schema', async () => {
        const pending = requestManualAIResponse('Devuelve el análisis', { responseMode: 'tool', tools: [TEST_TOOL] });
        const request = getActiveManualAIRequest();
        expect(request.prompt).toContain('INSTRUCCIÓN DE FORMATO PARA RESPUESTA MANUAL');
        expect(() => submitManualAIResponse(request.id, '{"summary":"Lista"}')).toThrow('score es obligatorio');
        expect(getActiveManualAIRequest()?.id).toBe(request.id);

        submitManualAIResponse(request.id, '```json\n{"summary":"Lista","score":0.9}\n```');
        await expect(pending).resolves.toContain('"score":0.9');
    });

    it('advances queued requests after cancellation', async () => {
        const first = requestManualAIResponse('Primera', { responseMode: 'text' });
        const second = requestManualAIResponse('Segunda', { responseMode: 'text' });
        const firstRequest = getActiveManualAIRequest();
        cancelManualAIRequest(firstRequest.id);
        await expect(first).rejects.toMatchObject({ name: 'AbortError' });

        const secondRequest = getActiveManualAIRequest();
        expect(secondRequest.prompt).toBe('Segunda');
        submitManualAIResponse(secondRequest.id, 'Respuesta');
        await expect(second).resolves.toBe('Respuesta');
    });

    it('allows cancellation after validation and before applying the response', async () => {
        const pending = requestManualAIResponse('Analiza y devuelve texto', { responseMode: 'text' });
        const request = getActiveManualAIRequest();

        expect(validateManualAIResponse(request.id, 'Respuesta ya validada')).toBe('Respuesta ya validada');
        cancelManualAIRequest(request.id);

        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        expect(getActiveManualAIRequest()).toBeNull();
    });

    it('adapts a chapter pasted as plain text and derives its metadata', async () => {
        const pending = requestManualAIResponse('Redacta el capítulo', { responseMode: 'tool', tools: [CHAPTER_TOOL] });
        const request = getActiveManualAIRequest();

        submitManualAIResponse(request.id, 'Elena abrió la puerta.\n\nNadie respondió.');

        await expect(pending).resolves.toBe(JSON.stringify({
            replacement: 'Elena abrió la puerta.\n\nNadie respondió.',
            summary: 'Respuesta manual preparada para revisión.',
            wordCount: 6,
            usedScenes: [],
            risk: 'medium',
        }));
    });

    it('unwraps a tool response and repairs common chapter field aliases', async () => {
        const pending = requestManualAIResponse('Redacta el capítulo', { responseMode: 'tool', tools: [CHAPTER_TOOL] });
        const request = getActiveManualAIRequest();

        submitManualAIResponse(request.id, JSON.stringify({
            name: 'redactar_capitulo_desde_estructura',
            arguments: JSON.stringify({ chapter: 'Una sombra cruzó el patio.' }),
        }));

        await expect(pending).resolves.toContain('"replacement":"Una sombra cruzó el patio."');
    });
});
