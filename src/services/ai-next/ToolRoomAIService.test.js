import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIService from '../AIService';
import { buildCoherencePatches, getStructureSourceHash, requestChapterDirections, requestChapterDraft, requestChapterFormatting, requestChapterScene, requestChapterStructureAnalysis, requestCoherenceAnalysis, requestCoherenceResolutionOptions, requestGlobalConsistencyAnalysis, requestToolRoomInsight, requestToolRoomProposal, validateCoherenceFinding } from './ToolRoomAIService';

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

    it('normaliza el análisis de estructura y conserva solo coincidencias válidas', async () => {
        AIService.sendMessage.mockResolvedValue(JSON.stringify({
            summary: 'Hay un capítulo pendiente.',
            chapters: [
                { id: 'chapter-1', title: 'La llegada', position: 1, status: 'written', summary: 'Llega al pueblo.' },
                { id: 'chapter-2', title: 'La pista', position: 2, status: 'pending', summary: 'Encuentra una pista.' },
            ],
            matches: [
                { structureChapterId: 'chapter-1', manuscriptChapterId: 'manuscript-1', confidence: 0.95, reason: 'Título y hechos coinciden.' },
                { structureChapterId: 'fake', manuscriptChapterId: 'manuscript-1', confidence: 0.99 },
            ],
            openThreads: ['La identidad del informante'],
            recommendedNextChapterId: 'chapter-2',
            recommendation: 'Continuar con La pista.',
        }));

        const result = await requestChapterStructureAnalysis({
            profile,
            structureContent: 'Capítulo 1: La llegada\nCapítulo 2: La pista',
            chapters: [{ id: 'manuscript-1', title: 'La llegada', content: '<p>Contenido</p>' }],
            lastChapter: { title: 'La llegada', content: '<p>Contenido</p>' },
        });

        expect(result.chapters).toHaveLength(2);
        expect(result.matches).toHaveLength(1);
        expect(result.pendingChapters[0].id).toBe('chapter-2');
        expect(result.recommendedNextChapterId).toBe('chapter-2');
    });

    it('mantiene la huella del análisis mientras Estructura no cambia', () => {
        const first = getStructureSourceHash({ structureContent: '<p>Capítulo 1</p>' });
        const same = getStructureSourceHash({ structureContent: '<p>Capítulo 1</p>' });
        const changed = getStructureSourceHash({ structureContent: '<p>Capítulo 2</p>' });
        expect(same).toBe(first);
        expect(changed).not.toBe(first);
    });

    it('normaliza tres direcciones narrativas', async () => {
        AIService.sendMessage.mockResolvedValue(JSON.stringify({ directions: [
            { id: 'a', title: 'Conservadora', premise: 'Sigue la pista.', risk: 'low' },
            { id: 'b', title: 'Tensa', premise: 'Provoca una confrontación.', risk: 'medium' },
            { id: 'c', title: 'Arriesgada', premise: 'Cambia el punto de vista.', risk: 'high' },
        ] }));

        const result = await requestChapterDirections({ profile, idea: 'Una pista sobre el hermano.' });
        expect(result.directions).toHaveLength(3);
        expect(result.directions[1].title).toBe('Tensa');
    });

    it('devuelve una escena normalizada para continuar el diseño', async () => {
        AIService.sendMessage.mockResolvedValue(JSON.stringify({ scene: {
            id: 'scene-1', number: 1, title: 'La estación', objective: 'Encontrar la pista', setting: 'Estación abandonada',
            characters: ['Elena'], conflict: 'Alguien la observa', action: 'Revisa una taquilla', revelation: 'Encuentra una fecha',
            emotionalChange: 'Pasa de curiosidad a miedo', transition: 'Escucha pasos', estimatedWords: 700,
        } }));

        const result = await requestChapterScene({ profile, chapterPlan: { title: 'La pista' }, direction: { title: 'Tensa' }, scenes: [] });
        expect(result).toMatchObject({ number: 1, title: 'La estación', estimatedWords: 700 });
        expect(result.characters).toEqual(['Elena']);
    });

    it('recupera el análisis de estructura cuando la respuesta inicial llega vacía', async () => {
        AIService.sendMessage
            .mockResolvedValueOnce('')
            .mockResolvedValueOnce(JSON.stringify({ summary: 'Estructura recuperada', chapters: [], matches: [], openThreads: [], recommendation: '' }));

        const result = await requestChapterStructureAnalysis({
            profile,
            structureContent: 'Capítulo 1: La llegada',
            chapters: [{ id: 'chapter-1', title: 'Capítulo 1', content: '<p>La llegada.</p>' }],
        });

        expect(result.summary).toBe('Estructura recuperada');
        expect(AIService.sendMessage).toHaveBeenCalledTimes(2);
        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({ reasoningMode: true, enableTools: true, toolChoice: 'auto' }));
    });

    it('reintenta el análisis estructurado cuando los argumentos de la tool no son JSON válido', async () => {
        AIService.sendMessage
            .mockResolvedValueOnce('{"summary":"incompleto"')
            .mockResolvedValueOnce(JSON.stringify({ summary: 'Análisis reparado', chapters: [], matches: [], openThreads: [], recommendation: '' }));

        const result = await requestChapterStructureAnalysis({ profile, structureContent: 'Capítulo 1', chapters: [] });

        expect(result.summary).toBe('Análisis reparado');
        expect(AIService.sendMessage).toHaveBeenCalledTimes(2);
        expect(AIService.sendMessage.mock.calls[1][2]).toEqual(expect.objectContaining({ reasoningMode: false, toolChoice: 'required' }));
    });

    it('permite puntos suspensivos dentro del capítulo pero rechaza un marcador de truncamiento al final', async () => {
        AIService.sendMessage.mockResolvedValue(JSON.stringify({ summary: 'Capítulo', replacement: '—No estoy segura… —dijo Nora.\n\nLa puerta se cerró.', wordCount: 8, usedScenes: [1], risk: 'low' }));
        await expect(requestChapterDraft({ profile, title: 'La puerta', sizeLabel: '', contextContent: 'Contexto' })).resolves.toMatchObject({ replacement: expect.stringContaining('No estoy segura') });

        AIService.sendMessage.mockResolvedValue(JSON.stringify({ summary: 'Capítulo', replacement: 'La escena quedó incompleta […]', wordCount: 5, usedScenes: [1], risk: 'high' }));
        await expect(requestChapterDraft({ profile, title: 'La puerta', sizeLabel: '', contextContent: 'Contexto' })).rejects.toThrow('capítulo truncado');
    });

    it('formatea un capítulo sin permitir cambios de contenido', async () => {
        AIService.sendMessage.mockResolvedValue(JSON.stringify({ formattedText: 'Primero.\n\n—Hola —dijo Kai.' }));
        const result = await requestChapterFormatting({ profile, text: 'Primero. —Hola —dijo Kai.' });
        expect(result).toBe('Primero.\n\n—Hola —dijo Kai.');
    });

    it('normaliza hallazgos de consistencia global y descarta documentos inválidos', async () => {
        AIService.sendMessage.mockResolvedValue(JSON.stringify({
            summary: 'Se encontraron dos apariciones para revisar.',
            findings: [
                { id: 'f-1', documentId: 'chapter-1', category: 'mulettilla', title: 'Muletilla repetida', excerpt: 'Elena dijo: ya sabes…', originalText: 'ya sabes', replacementText: '', reason: 'Aparece varias veces.', confidence: 0.94, severity: 'medium' },
                { id: 'invalid', documentId: 'missing', originalText: 'x', replacementText: 'y', confidence: 1 },
            ],
        }));

        const result = await requestGlobalConsistencyAnalysis({ profile, auditType: 'mulettilla', query: 'Elena', documents: [{ id: 'chapter-1', type: 'chapter', title: 'Capítulo 1', content: '<p>Elena dijo: ya sabes</p>' }] });
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0]).toMatchObject({ documentId: 'chapter-1', originalText: 'ya sabes', confidence: 0.94 });
    });

    it('reintenta el análisis de consistencia sin razonamiento cuando la primera respuesta llega vacía', async () => {
        AIService.sendMessage
            .mockResolvedValueOnce('')
            .mockResolvedValueOnce(JSON.stringify({ summary: 'Análisis recuperado', findings: [] }));

        const result = await requestGlobalConsistencyAnalysis({
            profile,
            auditType: 'custom',
            query: 'detalle',
            documents: [{ id: 'chapter-1', type: 'chapter', title: 'Capítulo 1', content: '<p>Texto</p>' }],
        });

        expect(result).toEqual({ summary: 'Análisis recuperado', findings: [] });
        expect(AIService.sendMessage).toHaveBeenCalledTimes(2);
        expect(AIService.sendMessage.mock.calls[1][2]).toEqual(expect.objectContaining({ reasoningMode: false, useJsonMode: true, enableTools: false }));
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
