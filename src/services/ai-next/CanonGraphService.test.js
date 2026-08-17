import { describe, expect, it } from 'vitest';
import { emptyCanonGraph, getCanonStats, setCanonFactStatusByTriple, updateCanonEntity, upsertCanonEntities, upsertCanonFacts, upsertCanonRelations } from './CanonGraphService';

describe('CanonGraphService', () => {
    it('guarda hechos sin duplicar el mismo triple', () => {
        const first = upsertCanonFacts(emptyCanonGraph(), [{ subject: 'Narev', predicate: 'fue construida sobre', object: 'una estación orbital' }]);
        const second = upsertCanonFacts(first, [{ subject: 'Narev', predicate: 'fue construida sobre', object: 'una estación orbital', status: 'canon' }]);
        expect(second.facts).toHaveLength(1);
        expect(second.facts[0].status).toBe('canon');
    });

    it('actualiza el estado de un hecho por sus tres elementos', () => {
        const graph = upsertCanonFacts(emptyCanonGraph(), [{ subject: 'Elena', predicate: 'conoce', object: 'Narev' }]);
        const next = setCanonFactStatusByTriple(graph, { subject: 'Elena', predicate: 'conoce', object: 'Narev' }, 'canon');
        expect(next.facts[0].status).toBe('canon');
    });

    it('normaliza relaciones y calcula estadísticas del canon', () => {
        let graph = upsertCanonFacts(emptyCanonGraph(), [{ subject: 'Narev', predicate: 'contiene', object: 'un secreto', status: 'canon' }]);
        graph = upsertCanonRelations(graph, [{ source: 'Elena', predicate: 'vive en', target: 'Narev' }]);
        expect(graph.relations).toHaveLength(1);
        expect(getCanonStats(graph)).toMatchObject({ facts: 1, canonicalFacts: 1, relations: 1 });
    });

    it('crea y edita entidades sin duplicar nombres', () => {
        let graph = upsertCanonEntities(emptyCanonGraph(), [{ name: 'Narev', type: 'place' }]);
        graph = upsertCanonEntities(graph, [{ name: 'narev', notes: 'Ciudad principal' }]);
        expect(graph.entities).toHaveLength(1);
        const next = updateCanonEntity(graph, graph.entities[0].id, { status: 'canon' });
        expect(next.entities[0].notes).toBe('Ciudad principal');
        expect(next.entities[0].status).toBe('canon');
    });
});
