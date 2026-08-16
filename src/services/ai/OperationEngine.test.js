import { describe, expect, it, vi } from 'vitest';
import { applyPatchesAtomically, classifyPatchRisk } from './OperationEngine';

const documents = {
    chapters: [{ id: 'chapter-1', title: 'Capítulo 1', content: '<p>Elena llegó.</p>' }],
    worldItems: [{ id: 'world-1', title: 'La ciudad', content: '<p>La ciudad tiene tres puertas.</p>' }],
    characters: [{ id: 'character-1', name: 'Elena', description: '<p>Teme al abandono.</p>' }],
};

describe('OperationEngine', () => {
    it('valida y aplica un parche puntual', async () => {
        const saveDocument = vi.fn().mockResolvedValue(undefined);
        const result = await applyPatchesAtomically({
            documents,
            patches: [{ docId: 'chapter-1', original: 'Elena', content: 'Elisa' }],
            saveDocument,
        });

        expect(result.status).toBe('applied');
        expect(result.successCount).toBe(1);
        expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({ docId: 'chapter-1', docType: 'chapter' }), '<p>Elisa llegó.</p>');
    });

    it('rechaza todo el multiparche si un cambio no coincide', async () => {
        const saveDocument = vi.fn().mockResolvedValue(undefined);
        const result = await applyPatchesAtomically({
            documents,
            patches: [
                { docId: 'chapter-1', original: 'Elena', content: 'Elisa' },
                { docId: 'chapter-1', original: 'TEXTO_INEXISTENTE', content: 'No guardar' },
            ],
            saveDocument,
        });

        expect(result.status).toBe('failed');
        expect(result.successCount).toBe(0);
        expect(saveDocument).not.toHaveBeenCalled();
    });

    it('crea snapshots después de cada documento aplicado', async () => {
        const snapshot = vi.fn().mockResolvedValue(undefined);
        const result = await applyPatchesAtomically({
            documents,
            patches: [{ docId: 'chapter-1', original: 'Elena', content: 'Elisa' }],
            saveDocument: vi.fn().mockResolvedValue(undefined),
            snapshot,
        });

        expect(result.status).toBe('applied');
        expect(snapshot).toHaveBeenCalledWith('chapter-1', '<p>Elisa llegó.</p>');
    });

    it('resuelve correctamente contenido de personajes y mundo', async () => {
        const saveDocument = vi.fn().mockResolvedValue(undefined);
        const result = await applyPatchesAtomically({
            documents,
            patches: [
                { docId: 'character-1', original: 'Teme al abandono.', content: 'Confía en su grupo.' },
                { docId: 'world-1', original: 'tres puertas', content: 'cuatro puertas' },
            ],
            saveDocument,
        });

        expect(result.status).toBe('applied');
        expect(saveDocument).toHaveBeenNthCalledWith(1, expect.objectContaining({ docType: 'character' }), '<p>Confía en su grupo.</p>');
        expect(saveDocument).toHaveBeenNthCalledWith(2, expect.objectContaining({ docType: 'worldItem' }), '<p>La ciudad tiene cuatro puertas</p>');
    });

    it('no escribe cuando recibe una lista vacía', async () => {
        const saveDocument = vi.fn();
        const result = await applyPatchesAtomically({ documents, patches: [], saveDocument });
        expect(result.status).toBe('failed');
        expect(saveDocument).not.toHaveBeenCalled();
    });

    it('informa fallo parcial si el snapshot no puede guardarse', async () => {
        const result = await applyPatchesAtomically({
            documents,
            patches: [{ docId: 'chapter-1', original: 'Elena', content: 'Elisa' }],
            saveDocument: vi.fn().mockResolvedValue(undefined),
            snapshot: vi.fn().mockRejectedValue(new Error('Firestore no disponible')),
        });

        expect(result.status).toBe('partial_failure');
        expect(result.failures[0]).toContain('Firestore no disponible');
    });

    it('clasifica como alto riesgo un cambio de continuidad en varios documentos', () => {
        const result = classifyPatchRisk([
            { docId: 'chapter-1', original: 'Elena', content: 'Elisa' },
            { docId: 'character-1', original: 'Teme al abandono.', content: 'La regla del canon indica que nunca teme nada.' },
        ]);

        expect(result.risk).toBe('high');
        expect(result.requiresApproval).toBe(true);
        expect(result.reasons).toEqual(expect.arrayContaining(['afecta varios documentos', 'afecta continuidad o datos de canon']));
    });
});
