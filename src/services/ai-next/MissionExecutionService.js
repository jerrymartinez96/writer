import { applyPlainTextPatch } from './plainText';

// Deterministic, dependency-free fingerprint for optimistic concurrency checks.
export const fingerprintText = (value = '') => {
    const text = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

export const validateOperationAgainstDocument = (operation, document) => {
    if (!operation || !document) return { valid: false, reason: 'El documento de destino ya no existe.' };
    if (operation.baseFingerprint && fingerprintText(document.content) !== operation.baseFingerprint) {
        return { valid: false, stale: true, reason: `El documento «${document.title}» cambió desde que se generó la propuesta.` };
    }
    if (operation.action === 'review' || operation.action === 'fact' || operation.action === 'create') return { valid: true, nextContent: document.content };
    const nextContent = operation.action === 'replace'
        ? operation.replacementText
        : applyPlainTextPatch(document.content, operation.originalText, operation.replacementText);
    if (nextContent === null) return { valid: false, stale: true, reason: `El fragmento original de «${document.title}» ya no coincide.` };
    if (typeof nextContent !== 'string') return { valid: false, reason: 'La operación no produjo texto válido.' };
    return { valid: true, nextContent };
};

export const prepareOperations = (operations = [], documents = []) => operations.map((operation) => {
    const document = documents.find((item) => item.id === operation.documentId);
    return { ...operation, baseFingerprint: operation.baseFingerprint || (document ? fingerprintText(document.content) : '') };
});

export const validateOperations = (operations = [], documents = []) => operations.map((operation) => ({
    operation,
    ...validateOperationAgainstDocument(operation, documents.find((document) => document.id === operation.documentId)),
}));

export const executeOperationsWithRollback = async ({ operations = [], documents = [], approvedOperationIds = new Set(), apply, rollback }) => {
    const approved = operations.filter((operation) => ['patch', 'replace', 'delete'].includes(operation.action) && (operation.status === 'approved' || approvedOperationIds.has(operation.id)));
    // Validate sequentially against a working copy so multiple operations on the
    // same document compose instead of overwriting one another.
    const workingDocuments = documents.map((document) => ({ ...document }));
    const checks = [];
    const validatedDocuments = new Set();
    for (const operation of approved) {
        const document = workingDocuments.find((item) => item.id === operation.documentId);
        const check = validateOperationAgainstDocument(validatedDocuments.has(operation.documentId) ? { ...operation, baseFingerprint: '' } : operation, document);
        if (!check.valid) {
            checks.push({ operation, ...check });
            break;
        }
        checks.push({ operation, ...check });
        validatedDocuments.add(operation.documentId);
        if (document && typeof check.nextContent === 'string') document.content = check.nextContent;
    }
    const invalid = checks.find((check) => !check.valid);
    if (invalid) throw new Error(invalid.reason || 'Una operación ya no es aplicable.');
    const applied = [];
    try {
        for (const check of checks) {
            await apply(check.operation, check.nextContent, documents.find((document) => document.id === check.operation.documentId));
            applied.push(check.operation);
        }
        return { status: 'applied', applied };
    } catch (error) {
        for (const operation of applied.reverse()) {
            const document = documents.find((item) => item.id === operation.documentId);
            try { await rollback(operation, document); } catch { /* best effort; preserve original error */ }
        }
        throw error;
    }
};
