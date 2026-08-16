import { describe, expect, it } from 'vitest';
import { createRequestEnvelope, REQUEST_SOURCES } from './RequestEnvelope';

describe('RequestEnvelope', () => {
    it('crea un sobre normalizado con contexto seguro', () => {
        const envelope = createRequestEnvelope({
            userMessage: '  Analiza el capítulo  ',
            activeBookId: 'book-1',
            context: { chapterIds: ['chapter-1'], selectedText: 'Texto seleccionado' },
        });

        expect(envelope.source).toBe(REQUEST_SOURCES.CORE_CHAT);
        expect(envelope.userMessage).toBe('Analiza el capítulo');
        expect(envelope.activeBookId).toBe('book-1');
        expect(envelope.context.chapterIds).toEqual(['chapter-1']);
        expect(envelope.context.worldItemIds).toEqual([]);
        expect(envelope.requestId).toMatch(/^req-/);
        expect(envelope.createdAt).toBeTruthy();
    });

    it('tolera entrada vacía sin romper el contrato', () => {
        const envelope = createRequestEnvelope({ userMessage: null, context: null });
        expect(envelope.userMessage).toBe('');
        expect(envelope.context).toEqual({
            chapterIds: [], worldItemIds: [], characterIds: [], selectedText: null, destination: null,
        });
    });
});
