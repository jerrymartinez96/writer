import { describe, expect, it } from 'vitest';
import { executeOperationsWithRollback, fingerprintText, prepareOperations, validateOperationAgainstDocument } from './MissionExecutionService';

describe('MissionExecutionService', () => {
    it('genera fingerprints estables y diferentes para contenidos distintos', () => {
        expect(fingerprintText('texto')).toBe(fingerprintText('texto'));
        expect(fingerprintText('texto')).not.toBe(fingerprintText('otro texto'));
    });

    it('marca como obsoleta una operación cuando el documento cambió', () => {
        const document = { id: 'chapter-1', title: 'Capítulo 1', content: 'Texto actualizado' };
        const prepared = prepareOperations([{ id: 'op-1', documentId: 'chapter-1', action: 'replace', replacementText: 'Nuevo' }], [{ ...document, content: 'Texto original' }]);
        const result = validateOperationAgainstDocument(prepared[0], document);
        expect(result.valid).toBe(false);
        expect(result.stale).toBe(true);
    });

    it('rechaza operaciones cuyo documento ya no existe', () => {
        const [operation] = prepareOperations([{ id: 'op-missing', documentId: 'deleted', action: 'replace', replacementText: 'Nuevo' }], []);
        const result = validateOperationAgainstDocument(operation, null);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('no existe');
    });

    it('valida un parche exacto sobre el contenido base', () => {
        const document = { id: 'chapter-1', title: 'Capítulo 1', content: 'La puerta estaba cerrada.' };
        const [operation] = prepareOperations([{ id: 'op-1', documentId: 'chapter-1', action: 'patch', originalText: 'cerrada', replacementText: 'entreabierta' }], [document]);
        const result = validateOperationAgainstDocument(operation, document);
        expect(result.valid).toBe(true);
        expect(result.nextContent).toContain('entreabierta');
    });

    it('revierte las operaciones ya aplicadas cuando una posterior falla', async () => {
        const documents = [
            { id: 'a', title: 'A', content: 'uno' },
            { id: 'b', title: 'B', content: 'dos' },
        ];
        const operations = prepareOperations([
            { id: 'op-a', documentId: 'a', action: 'replace', replacementText: 'nuevo uno' },
            { id: 'op-b', documentId: 'b', action: 'replace', replacementText: 'nuevo dos' },
        ], documents);
        const applied = [];
        await expect(executeOperationsWithRollback({
            operations,
            documents,
            approvedOperationIds: new Set(operations.map((operation) => operation.id)),
            apply: async (operation) => { applied.push(operation.id); if (operation.id === 'op-b') throw new Error('fallo'); },
            rollback: async (operation) => { applied.push(`rollback-${operation.id}`); },
        })).rejects.toThrow('fallo');
        expect(applied).toEqual(['op-a', 'op-b', 'rollback-op-a']);
    });

    it('no ejecuta operaciones que no fueron aprobadas', async () => {
        const documents = [{ id: 'a', title: 'A', content: 'uno' }];
        const operations = prepareOperations([{ id: 'op-a', documentId: 'a', action: 'replace', replacementText: 'nuevo' }], documents);
        let calls = 0;
        const result = await executeOperationsWithRollback({ operations, documents, approvedOperationIds: new Set(), apply: async () => { calls += 1; }, rollback: async () => {} });
        expect(calls).toBe(0);
        expect(result.applied).toEqual([]);
    });
});
