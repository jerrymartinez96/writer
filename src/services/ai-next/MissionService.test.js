import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIService from '../AIService';
import { mergeLoadedMissionChapters, requestMissionImpact } from './MissionService';

vi.mock('../AIService', () => ({
    default: { sendMessage: vi.fn() },
}));

const profile = {
    deepseekApiKey: 'test-key',
    aiConfig: { defaultModel: 'deepseek-v4', reasoningMode: true, reasoningEffort: 'high' },
};

const mission = {
    id: 'global-test',
    type: 'develop_canon',
    objective: 'Cambiar el origen de Elena sin perder la continuidad.',
    scope: 'all',
};

const documents = [{ id: 'chapter-1', type: 'chapter', title: 'Capítulo 1', content: 'Elena llegó al puerto.' }];

describe('MissionService', () => {
    beforeEach(() => vi.resetAllMocks());

    it('reemplaza los metadatos de capítulos por su contenido precargado', () => {
        const prepared = mergeLoadedMissionChapters([
            { id: 'chapter-1', type: 'chapter', title: 'Capítulo 1', content: '' },
            { id: 'world-1', type: 'world', title: 'Mundo', content: 'Dato de mundo' },
        ], [{ id: 'chapter-1', content: '<p>Contenido completo del capítulo.</p>' }]);

        expect(prepared).toEqual([
            { id: 'chapter-1', type: 'chapter', title: 'Capítulo 1', content: '<p>Contenido completo del capítulo.</p>' },
            { id: 'world-1', type: 'world', title: 'Mundo', content: 'Dato de mundo' },
        ]);
    });

    it('normaliza valores equivalentes y campos de revisión seguros en el impacto', async () => {
        AIService.sendMessage.mockResolvedValueOnce(JSON.stringify({
            summary: 'Hay que revisar el capítulo.',
            risk: 'medio',
            confidence: '80%',
            affectedDocuments: [{ documentId: 'chapter-1', reason: 'Contiene el hecho anterior.', evidence: 'Elena llegó al puerto.' }],
            warnings: [],
        }));

        const result = await requestMissionImpact({ profile, mission, documents });

        expect(result).toMatchObject({ risk: 'medium', confidence: 0.8 });
        expect(result.affectedDocuments).toEqual([expect.objectContaining({ impact: 'medium', action: 'review' })]);
        expect(AIService.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('descarta impactos que no incluyan una cita literal del documento', async () => {
        AIService.sendMessage.mockResolvedValueOnce(JSON.stringify({
            summary: 'El capítulo contiene una forma que debe cambiarse.', risk: 'medium', confidence: 0.8,
            affectedDocuments: [{ documentId: 'chapter-1', impact: 'medium', action: 'review', reason: 'Forma detectada.', evidence: 'vosotros no está en el documento' }], warnings: [],
        }));

        const result = await requestMissionImpact({ profile, mission, documents });

        expect(result.summary).toContain('No se encontraron citas textuales verificables');
        expect(result.affectedDocuments).toEqual([]);
        expect(result.warnings[0]).toContain('no se muestran como afectados');
    });

    it('muestra el error sin reintentar cuando la llamada estructurada llega vacía', async () => {
        AIService.sendMessage.mockResolvedValueOnce('');

        await expect(requestMissionImpact({ profile, mission, documents })).rejects.toThrow('no se reintentó automáticamente');

        expect(AIService.sendMessage).toHaveBeenCalledTimes(1);
        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({ reasoningMode: true, responseMode: 'tool' }));
        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({ reasoningEffort: 'high', max_tokens: 25000 }));
        expect(AIService.sendMessage.mock.calls[0][2]).not.toHaveProperty('toolChoice');
    });

    it('muestra el detalle de un contrato inválido sin usar JSON directo', async () => {
        AIService.sendMessage.mockResolvedValueOnce('{}');

        await expect(requestMissionImpact({ profile, mission, documents })).rejects.toThrow('no cumple el contrato');

        expect(AIService.sendMessage).toHaveBeenCalledTimes(1);
        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({ responseMode: 'tool', reasoningMode: true }));
    });
});
