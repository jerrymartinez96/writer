import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIService from '../AIService';
import { getStructureSourceHash, requestChapterDirections, requestChapterDraft, requestChapterFormatting, requestChapterScene, requestChapterStructureAnalysis, requestGlobalConsistencyAnalysis, requestToolRoomInsight, requestToolRoomProposal } from './ToolRoomAIService';

vi.mock('../AIService', () => ({
    default: { sendMessage: vi.fn() },
    COHERENCE_AUDIT_SCHEMA: { type: 'function', function: { name: 'reportar_incoherencias' } },
}));

const profile = { deepseekApiKey: 'test-key', aiConfig: { defaultModel: 'deepseek-v4', reasoningMode: true, reasoningEffort: 'max' } };

describe('ToolRoomAIService', () => {
    beforeEach(() => vi.resetAllMocks());

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

    it('respeta el razonamiento desactivado en una solicitud estructurada', async () => {
        AIService.sendMessage.mockResolvedValue('{"summary":"Sin cambios","replacement":"Texto revisado","risk":"low"}');

        await requestToolRoomProposal({
            profile: { ...profile, aiConfig: { ...profile.aiConfig, reasoningMode: false } },
            roomName: 'Estudio creativo',
            instruction: 'Revisa el tono',
            sourceContent: 'Texto original',
        });

        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({
            reasoningMode: false,
            responseMode: 'tool',
            toolChoice: 'required',
        }));
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
                { id: 'chapter-1', title: 'La llegada', position: 1, status: 'written', summary: 'Llega al pueblo.', purpose: 'Presentar la llegada.', conflict: 'No conoce el lugar.', characters: ['Elena'] },
                { id: 'chapter-2', title: 'La pista', position: 2, status: 'pending', summary: 'Encuentra una pista.', purpose: 'Revelar una pista.', conflict: 'La pista está incompleta.', characters: ['Elena'] },
            ],
            matches: [
                { structureChapterId: 'chapter-1', manuscriptChapterId: 'manuscript-1', confidence: 0.95, reason: 'Título y hechos coinciden.' },
                { structureChapterId: 'fake', manuscriptChapterId: 'manuscript-1', confidence: 0.99, reason: 'ID no válido para el análisis.' },
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
            .mockResolvedValueOnce(JSON.stringify({ summary: 'Estructura recuperada', chapters: [], matches: [], openThreads: [], recommendedNextChapterId: '', recommendation: '' }));

        const result = await requestChapterStructureAnalysis({
            profile,
            structureContent: 'Capítulo 1: La llegada',
            chapters: [{ id: 'chapter-1', title: 'Capítulo 1', content: '<p>La llegada.</p>' }],
        });

        expect(result.summary).toBe('Estructura recuperada');
        expect(AIService.sendMessage).toHaveBeenCalledTimes(2);
        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({ reasoningMode: true, responseMode: 'tool' }));
        expect(AIService.sendMessage.mock.calls[0][2]).not.toHaveProperty('toolChoice');
        expect(AIService.sendMessage.mock.calls[1][2]).toEqual(expect.objectContaining({ reasoningMode: false, responseMode: 'json' }));
        expect(AIService.sendMessage.mock.calls[1][2]).not.toHaveProperty('tools');
    });

    it('reintenta el análisis estructurado cuando los argumentos de la tool no son JSON válido', async () => {
        AIService.sendMessage
            .mockResolvedValueOnce('{"summary":"incompleto"')
            .mockResolvedValueOnce(JSON.stringify({ summary: 'Análisis reparado', chapters: [], matches: [], openThreads: [], recommendedNextChapterId: '', recommendation: '' }));

        const result = await requestChapterStructureAnalysis({ profile, structureContent: 'Capítulo 1', chapters: [] });

        expect(result.summary).toBe('Análisis reparado');
        expect(AIService.sendMessage).toHaveBeenCalledTimes(2);
        expect(AIService.sendMessage.mock.calls[1][2]).toEqual(expect.objectContaining({ reasoningMode: false, responseMode: 'json' }));
        expect(AIService.sendMessage.mock.calls[1][2]).not.toHaveProperty('tools');
    });

    it('recupera una respuesta JSON que no cumple el contrato obligatorio', async () => {
        AIService.sendMessage
            .mockResolvedValueOnce('{}')
            .mockResolvedValueOnce(JSON.stringify({ summary: 'Auditoría reparada', findings: [] }));

        const result = await requestGlobalConsistencyAnalysis({
            profile,
            auditType: 'full',
            documents: [{ id: 'chapter-1', type: 'chapter', title: 'Capítulo 1', content: '<p>Texto</p>' }],
        });

        expect(result).toEqual({ summary: 'Auditoría reparada', findings: [] });
        expect(AIService.sendMessage).toHaveBeenCalledTimes(2);
        expect(AIService.sendMessage.mock.calls[1][2]).toEqual(expect.objectContaining({ reasoningMode: false, responseMode: 'json' }));
        expect(AIService.sendMessage.mock.calls[1][2]).not.toHaveProperty('tools');
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
                { id: 'invalid', documentId: 'missing', category: 'detail', title: 'Inválido', reason: 'No existe el documento.', severity: 'high', originalText: 'x', replacementText: 'y', confidence: 1 },
            ],
        }));

        const result = await requestGlobalConsistencyAnalysis({ profile, auditType: 'mulettilla', query: 'Elena', documents: [{ id: 'chapter-1', type: 'chapter', title: 'Capítulo 1', content: '<p>Elena dijo: ya sabes</p>' }] });
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0]).toMatchObject({ documentId: 'chapter-1', originalText: 'ya sabes', confidence: 0.94 });
    });

    it('repara variantes comunes de campos en hallazgos de auditoría', async () => {
        AIService.sendMessage.mockResolvedValue(JSON.stringify({
            summary: 'Se detectaron detalles para revisar.',
            findings: [
                { title: 'Cronología', type: 'contradiction', whyContradictory: 'Las fechas no coinciden.', severity: 'critical', confidence: '85%', documentId: 'chapter-1' },
                { label: 'Causalidad', explanation: 'Falta explicar la consecuencia.', severity: 'warning', certainty: '0.6', documentId: 'chapter-1' },
            ],
        }));

        const result = await requestGlobalConsistencyAnalysis({
            profile,
            auditType: 'full',
            documents: [{ id: 'chapter-1', type: 'chapter', title: 'Capítulo 1', content: '<p>Texto</p>' }],
        });

        expect(result.findings).toHaveLength(2);
        expect(result.findings[0]).toMatchObject({ category: 'contradiction', reason: 'Las fechas no coinciden.', severity: 'high', confidence: 0.85 });
        expect(result.findings[1]).toMatchObject({ title: 'Causalidad', reason: 'Falta explicar la consecuencia.', severity: 'medium', confidence: 0.6 });
    });

    it('conserva hallazgos estructurales con IDs alternativos y sin reemplazo textual', async () => {
        AIService.sendMessage.mockResolvedValue(JSON.stringify({
            summary: 'Se detectó una contradicción entre capítulos.',
            findings: [{
                title: 'Fecha incompatible',
                category: 'timeline',
                reason: 'La fecha del evento cambia entre ambos capítulos.',
                severity: 'high',
                confidence: 0.92,
                documentAId: 'chapter-1',
                documentBId: 'chapter-2',
                evidence: [
                    { documentId: 'chapter-1', quote: 'Ocurrió el lunes.' },
                    { documentId: 'chapter-2', quote: 'Ocurrió el martes.' },
                ],
                replacementText: 'Ajustar la cronología.',
            }],
        }));

        const result = await requestGlobalConsistencyAnalysis({
            profile,
            auditType: 'timeline',
            documents: [
                { id: 'chapter-1', type: 'chapter', title: 'Capítulo 1', content: '<p>Lunes</p>' },
                { id: 'chapter-2', type: 'chapter', title: 'Capítulo 2', content: '<p>Martes</p>' },
            ],
        });

        expect(result.findings).toHaveLength(1);
        expect(result.findings[0]).toMatchObject({ documentId: 'chapter-1', status: 'detected' });
        expect(result.findings[0].documentIds).toEqual(['chapter-1', 'chapter-2']);
    });

    it('reintenta el análisis de consistencia con JSON directo', async () => {
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
        expect(AIService.sendMessage.mock.calls[1][2]).toEqual(expect.objectContaining({ reasoningMode: false, responseMode: 'json' }));
        expect(AIService.sendMessage.mock.calls[1][2]).not.toHaveProperty('tools');
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
        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({ reasoningMode: true, responseMode: 'tool', max_tokens: 8000 }));
        expect(AIService.sendMessage.mock.calls[0][2]).not.toHaveProperty('toolChoice');
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

});
