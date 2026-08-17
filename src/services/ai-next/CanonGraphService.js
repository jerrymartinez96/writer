import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const STORAGE_PREFIX = 'verne-canon-graph-v1';
const PENDING_SYNC_PREFIX = 'verne-canon-pending-sync-v1';

export const CANON_STATUSES = ['proposed', 'in_review', 'canon', 'rejected', 'obsolete', 'conflict'];

const storageKey = (bookId) => `${STORAGE_PREFIX}:${bookId || 'no-book'}`;
const pendingSyncKey = (bookId) => `${PENDING_SYNC_PREFIX}:${bookId || 'no-book'}`;
const remoteRef = (bookId) => doc(db, 'books', bookId, 'canon', 'graph');

const normalizeFact = (fact, index = 0) => ({
    id: String(fact.id || `fact-${Date.now()}-${index}`),
    subject: String(fact.subject || '').trim(),
    predicate: String(fact.predicate || '').trim(),
    object: String(fact.object || '').trim(),
    status: CANON_STATUSES.includes(fact.status) ? fact.status : 'proposed',
    sourceDocumentIds: Array.isArray(fact.sourceDocumentIds) ? fact.sourceDocumentIds.map(String) : [],
    source: String(fact.source || 'constructor-global'),
    createdAt: fact.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
});

const normalizeRelation = (relation, index = 0) => {
    const source = String(relation.source || relation.from || '').trim();
    const target = String(relation.target || relation.to || '').trim();
    if (!source || !target) return null;
    return {
        id: String(relation.id || `relation-${Date.now()}-${index}`),
        source,
        predicate: String(relation.predicate || relation.type || 'relacionado con').trim(),
        target,
        status: CANON_STATUSES.includes(relation.status) ? relation.status : 'proposed',
        sourceDocumentIds: Array.isArray(relation.sourceDocumentIds) ? relation.sourceDocumentIds.map(String) : [],
        createdAt: relation.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
};

const normalizeEntity = (entity, index = 0) => {
    const name = String(entity.name || entity.label || '').trim();
    if (!name) return null;
    return {
        id: String(entity.id || `entity-${Date.now()}-${index}`),
        name,
        type: String(entity.type || 'concept'),
        status: CANON_STATUSES.includes(entity.status) ? entity.status : 'proposed',
        notes: String(entity.notes || ''),
        aliases: Array.isArray(entity.aliases) ? entity.aliases.map(String) : [],
        sourceDocumentIds: Array.isArray(entity.sourceDocumentIds) ? entity.sourceDocumentIds.map(String) : [],
        appearances: Array.isArray(entity.appearances) ? entity.appearances.map((appearance) => ({ documentId: String(appearance.documentId || ''), excerpt: String(appearance.excerpt || '') })).filter((appearance) => appearance.documentId) : [],
        createdAt: entity.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
};

export const emptyCanonGraph = () => ({ version: 1, entities: [], facts: [], relations: [], updatedAt: new Date().toISOString() });

export const loadCanonGraph = (bookId) => {
    try {
        const raw = window.localStorage.getItem(storageKey(bookId));
        if (!raw) return emptyCanonGraph();
        const parsed = JSON.parse(raw);
        return {
            version: 1,
            entities: (Array.isArray(parsed.entities) ? parsed.entities : []).map(normalizeEntity).filter(Boolean),
            facts: (Array.isArray(parsed.facts) ? parsed.facts : []).map(normalizeFact).filter(Boolean),
            relations: (Array.isArray(parsed.relations) ? parsed.relations : []).map(normalizeRelation).filter(Boolean),
            updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
    } catch {
        return emptyCanonGraph();
    }
};

export const saveCanonGraph = (bookId, graph) => {
    const next = {
        version: 1,
        entities: (graph.entities || []).map(normalizeEntity).filter(Boolean),
        facts: (graph.facts || []).map(normalizeFact).filter(Boolean),
        relations: (graph.relations || []).map(normalizeRelation).filter(Boolean),
        updatedAt: new Date().toISOString(),
    };
    try { window.localStorage.setItem(storageKey(bookId), JSON.stringify(next)); } catch { /* persistence is best effort */ }
    return next;
};

export const loadCanonGraphRemote = async (bookId) => {
    if (!bookId) return null;
    try {
        const snapshot = await getDoc(remoteRef(bookId));
        if (!snapshot.exists()) return null;
        return {
            version: 1,
            entities: (snapshot.data().entities || []).map(normalizeEntity).filter(Boolean),
            facts: (snapshot.data().facts || []).map(normalizeFact).filter(Boolean),
            relations: (snapshot.data().relations || []).map(normalizeRelation).filter(Boolean),
            updatedAt: snapshot.data().updatedAt || new Date().toISOString(),
        };
    } catch (error) {
        console.warn('No se pudo cargar el canon remoto; se conserva la copia local.', error);
        return null;
    }
};

export const saveCanonGraphRemote = async (bookId, graph) => {
    if (!bookId) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        try { window.localStorage.setItem(pendingSyncKey(bookId), JSON.stringify(graph)); } catch { /* best effort */ }
        return false;
    }
    try {
        await setDoc(remoteRef(bookId), {
            version: 1,
            entities: graph.entities || [],
            facts: graph.facts || [],
            relations: graph.relations || [],
            updatedAt: serverTimestamp(),
        }, { merge: true });
        return true;
    } catch (error) {
        try { window.localStorage.setItem(pendingSyncKey(bookId), JSON.stringify(graph)); } catch { /* best effort */ }
        console.warn('No se pudo sincronizar el canon remoto; la copia local permanece disponible.', error);
        return false;
    }
};

export const flushPendingCanonSync = async (bookId) => {
    if (!bookId) return false;
    try {
        const raw = window.localStorage.getItem(pendingSyncKey(bookId));
        if (!raw) return true;
        const synced = await saveCanonGraphRemote(bookId, JSON.parse(raw));
        if (synced) window.localStorage.removeItem(pendingSyncKey(bookId));
        return synced;
    } catch {
        return false;
    }
};

export const upsertCanonEntities = (graph, entities = []) => {
    const nextEntities = [...(graph.entities || [])];
    entities.forEach((entity, index) => {
        const normalized = normalizeEntity(entity, index);
        if (!normalized) return;
        const existingIndex = nextEntities.findIndex((item) => item.name.toLowerCase() === normalized.name.toLowerCase());
        if (existingIndex >= 0) nextEntities[existingIndex] = { ...nextEntities[existingIndex], ...normalized, id: nextEntities[existingIndex].id };
        else nextEntities.unshift(normalized);
    });
    return { ...graph, entities: nextEntities, updatedAt: new Date().toISOString() };
};

export const updateCanonEntity = (graph, entityId, patch) => ({
    ...graph,
    entities: (graph.entities || []).map((entity) => entity.id === entityId ? { ...entity, ...patch, updatedAt: new Date().toISOString() } : entity),
    updatedAt: new Date().toISOString(),
});

export const upsertCanonFacts = (graph, facts, sourceDocumentIds = []) => {
    const nextFacts = [...(graph.facts || [])];
    facts.forEach((fact, index) => {
        const normalized = normalizeFact({ ...fact, sourceDocumentIds: fact.sourceDocumentIds || sourceDocumentIds }, index);
        if (!normalized) return;
        const existingIndex = nextFacts.findIndex((item) => item.subject.toLowerCase() === normalized.subject.toLowerCase() && item.predicate.toLowerCase() === normalized.predicate.toLowerCase() && item.object.toLowerCase() === normalized.object.toLowerCase());
        if (existingIndex >= 0) nextFacts[existingIndex] = { ...nextFacts[existingIndex], ...normalized, id: nextFacts[existingIndex].id };
        else nextFacts.unshift(normalized);
    });
    return { ...graph, facts: nextFacts, updatedAt: new Date().toISOString() };
};

export const upsertCanonRelations = (graph, relations, sourceDocumentIds = []) => {
    const nextRelations = [...(graph.relations || [])];
    relations.forEach((relation, index) => {
        const normalized = normalizeRelation({ ...relation, sourceDocumentIds: relation.sourceDocumentIds || sourceDocumentIds }, index);
        if (!normalized) return;
        const existingIndex = nextRelations.findIndex((item) => item.source.toLowerCase() === normalized.source.toLowerCase() && item.predicate.toLowerCase() === normalized.predicate.toLowerCase() && item.target.toLowerCase() === normalized.target.toLowerCase());
        if (existingIndex >= 0) nextRelations[existingIndex] = { ...nextRelations[existingIndex], ...normalized, id: nextRelations[existingIndex].id };
        else nextRelations.unshift(normalized);
    });
    return { ...graph, relations: nextRelations, updatedAt: new Date().toISOString() };
};

export const setCanonItemStatus = (graph, itemId, status, kind = 'facts') => {
    if (!CANON_STATUSES.includes(status)) return graph;
    return { ...graph, [kind]: (graph[kind] || []).map((item) => item.id === itemId ? { ...item, status, updatedAt: new Date().toISOString() } : item), updatedAt: new Date().toISOString() };
};

export const setCanonFactStatusByTriple = (graph, fact, status) => ({
    ...graph,
    facts: (graph.facts || []).map((item) => item.subject.toLowerCase() === String(fact.subject || '').toLowerCase()
        && item.predicate.toLowerCase() === String(fact.predicate || '').toLowerCase()
        && item.object.toLowerCase() === String(fact.object || '').toLowerCase()
        ? { ...item, status, updatedAt: new Date().toISOString() } : item),
    updatedAt: new Date().toISOString(),
});

export const getCanonStats = (graph) => ({
    facts: graph?.facts?.length || 0,
    canonicalFacts: graph?.facts?.filter((fact) => fact.status === 'canon').length || 0,
    pendingFacts: graph?.facts?.filter((fact) => ['proposed', 'in_review', 'conflict'].includes(fact.status)).length || 0,
    relations: graph?.relations?.length || 0,
});
