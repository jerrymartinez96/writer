import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIService from '../AIService';
import { buildCoherencePatches, requestCoherenceAnalysis, requestCoherenceResolutionOptions, requestToolRoomInsight, requestToolRoomProposal, validateCoherenceFinding } from './ToolRoomAIService';

vi.mock('../AIService', () => ({
    default: { sendMessage: vi.fn() },
    COHERENCE_AUDIT_SCHEMA: { type: 'function', function: { name: 'reportar_incoherencias' } },
}));

const profile = { deepseekApiKey: 'test-key', aiConfig: { defaultModel: 'deepseek-v4', reasoningMode: true, reasoningEffort: 'max' } };

describe('ToolRoomAIService', () => {
    beforeEach(() => vi.clearAllMocks());

    it('separa el contenido editable del contexto de apoyo al construir la propuesta', async () => {
        AIService.sendMessage.mockResolvedValue('{"summary":"Mejora aplicada","replacement":"<p>Nuevo texto</p>","risk":"low"}');

        const result = await requestToolRoomProposal({
            profile,
            roomName: 'Coescritor',
            instruction: 'Aumenta la tensión',
            sourceContent: '<p>Texto editable</p>',
            contextContent: 'Personaje de apoyo: Elena',
        });

        expect(result).toEqual({ summary: 'Mejora aplicada', replacement: 'Nuevo texto', risk: 'low' });
        expect(AIService.sendMessage).toHaveBeenCalledTimes(1);
        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({ model: 'deepseek-v4', reasoningMode: true, reasoningEffort: 'max' }));
        const prompt = AIService.sendMessage.mock.calls[0][0];
        expect(prompt).toContain('Contenido original editable:');
        expect(prompt).toContain('Contexto de apoyo no editable:');
        expect(prompt).toContain('Personaje de apoyo: Elena');
    });

    it('rechaza una propuesta sin replacement válido', async () => {
        AIService.sendMessage.mockResolvedValue('{"summary":"Sin cambio","risk":"low"}');

        await expect(requestToolRoomProposal({
            profile,
            roomName: 'Constructor de mundo',
            instruction: 'Amplía el lugar',
            sourceContent: 'Ciudad',
        })).rejects.toThrow('replacement válido');
    });

    it('normaliza hallazgos de auditoría y conserva el contexto auxiliar', async () => {
        AIService.sendMessage.mockResolvedValue('{"summary":"Revisión completa","findings":[{"documentAId":"chapter-1","documentBId":"world-1","title":"Cronología","claimA":"La fecha es 10","claimB":"La fecha es 12","evidenceA":"Documento A dice 10","evidenceB":"Documento B dice 12","whyContradictory":"No pueden ser ambas fechas para el mismo evento.","severity":"medium","confidence":0.9,"suggestedAction":"Ajustar la fecha"}]}');

        const result = await requestToolRoomInsight({
            profile,
            roomName: 'Auditoría',
            instruction: 'Busca contradicciones',
            sourceContent: 'Capítulo principal',
            contextContent: 'Lore de apoyo',
            documentIds: ['chapter-1', 'world-1'],
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].severity).toBe('medium');
        expect(result.items[0].documentIds).toEqual(['chapter-1', 'world-1']);
        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({ enableTools: true, max_tokens: 8000 }));
        expect(AIService.sendMessage.mock.calls[0][0]).toContain('Contexto de apoyo no analizable:');
        expect(AIService.sendMessage.mock.calls[0][0]).toContain('Lore de apoyo');
    });

    it('rechaza hallazgos que apuntan a documentos inexistentes o carecen de evidencia A/B', async () => {
        AIService.sendMessage.mockResolvedValue('{"summary":"Revisión","findings":[{"documentAId":"fake-a","documentBId":"chapter-1","title":"Falso","claimA":"A","claimB":"B","evidenceA":"A","evidenceB":"B","whyContradictory":"Conflicto","severity":"high","confidence":0.99,"suggestedAction":"Cambiar"},{"documentAId":"chapter-1","documentBId":"world-1","title":"Incompleto","claimA":"A","claimB":"B","evidenceA":"A","evidenceB":"","whyContradictory":"Conflicto","severity":"high","confidence":0.99,"suggestedAction":"Cambiar"}]}');

        const result = await requestToolRoomInsight({
            profile,
            roomName: 'Auditoría',
            instruction: 'Busca contradicciones',
            sourceContent: 'Documentos',
            documentIds: ['chapter-1', 'world-1'],
        });

        expect(result.items).toEqual([]);
    });

    it('detecta solo hallazgos estructurados con evidencia e IDs válidos', async () => {
        AIService.sendMessage.mockResolvedValue(JSON.stringify({ summary: 'Conflicto entre chapter-1 y world-1', findings: [
            { documentIds: ['chapter-1', 'world-1'], title: 'Fecha incompatible', category: 'timeline', severity: 'high', confidence: 0.92, claimA: 'chapter-1 indica Día 1', claimB: 'world-1 indica Día 3', evidenceA: { documentId: 'chapter-1', quote: 'Día 1' }, evidenceB: { documentId: 'world-1', quote: 'Día 3' }, explanation: 'Mismo evento en chapter-1 y world-1 con fechas incompatibles.' },
            { documentIds: ['fake', 'world-1'], title: 'Inválido', confidence: 0.99, claimA: 'A', claimB: 'B', evidenceA: { documentId: 'fake', quote: 'A' }, evidenceB: { documentId: 'world-1', quote: 'B' }, explanation: 'No debe aceptarse.' },
        ] }));
        const result = await requestCoherenceAnalysis({ profile, documents: [
            { id: 'chapter-1', type: 'chapter', title: 'Capítulo', content: '<p>Día 1</p>' },
            { id: 'world-1', type: 'worldItem', title: 'Mundo', content: '<p>Día 3</p>' },
        ] });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].documentIds).toEqual(['chapter-1', 'world-1']);
        expect(result.items[0].evidenceA.quote).toBe('Día 1');
        expect(result.summary).toBe('Conflicto entre Capítulo y Mundo');
        expect(result.items[0].claimA).toBe('Capítulo indica Día 1');
        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({ enableTools: true, reasoningMode: true, useJsonMode: false }));
    });

    it('exige confirmar una inconsistencia antes de generar tres soluciones', async () => {
        const finding = { id: 'finding-1', status: 'detected', documentIds: ['chapter-1', 'world-1'] };
        await expect(requestCoherenceResolutionOptions({ profile, finding, documents: [] })).rejects.toThrow('confirmada');
        AIService.sendMessage.mockResolvedValue(JSON.stringify({ status: 'confirmed', confidence: 0.9, reason: 'Confirmada.' }));
        const validated = await validateCoherenceFinding({ profile, finding, documents: [
            { id: 'chapter-1', content: 'Día 1' },
            { id: 'world-1', content: 'Día 3' },
        ] });
        expect(validated.status).toBe('confirmed');
        AIService.sendMessage.mockResolvedValue(JSON.stringify({ options: [
            { id: 'a', title: 'A', documentIds: ['chapter-1'] },
            { id: 'b', title: 'B', documentIds: ['world-1'] },
            { id: 'c', title: 'C', documentIds: ['chapter-1', 'world-1'] },
        ] }));
        const options = await requestCoherenceResolutionOptions({ profile, finding: validated, documents: [
            { id: 'chapter-1', content: 'Día 1' },
            { id: 'world-1', content: 'Día 3' },
        ] });
        expect(options).toHaveLength(3);
    });

    it('devuelve parches exactos y nunca un reemplazo de documento completo', async () => {
        AIService.sendMessage.mockResolvedValue(JSON.stringify({ patches: [{ documentId: 'chapter-1', baseVersion: 'v1', originalText: 'Día 1', replacementText: 'Día 3', reason: 'Alinear cronología.' }] }));
        const patches = await buildCoherencePatches({ profile, finding: { documentIds: ['chapter-1', 'world-1'] }, option: { documentIds: ['chapter-1'] }, documents: [{ id: 'chapter-1', content: '<p>Día 1</p>', version: 'v1' }] });
        expect(patches[0]).toEqual(expect.objectContaining({ documentId: 'chapter-1', originalText: 'Día 1', replacementText: 'Día 3' }));
    });
});
