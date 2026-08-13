import { applyPatch } from '../../components/ia-studio/utils/diffUtils';
import { resolveTargetDoc } from '../../components/ia-studio/utils/domainUtils';

/**
 * Contrato común para operaciones ejecutadas por IA Studio y Coescritor.
 * La IA propone; este módulo decide si la propuesta es válida y cuándo se
 * puede considerar realmente aplicada.
 */
export const OPERATION_STATUS = {
    PROPOSED: 'proposed',
    AWAITING_APPROVAL: 'awaiting_approval',
    APPLYING: 'applying',
    APPLIED: 'applied',
    PARTIAL_FAILURE: 'partial_failure',
    FAILED: 'failed',
};

export const classifyPatchRisk = (patches = []) => {
    const list = Array.isArray(patches) ? patches : [];
    const reasons = [];
    const multiDocument = new Set(list.map(p => p.docId || p.title).filter(Boolean)).size > 1;
    const hasDeletion = list.some(p => !(p.content || '').trim());
    const hasLargeRewrite = list.some(p => {
        const originalWords = String(p.original || '').trim().split(/\s+/).filter(Boolean).length;
        const replacementWords = String(p.content || '').trim().split(/\s+/).filter(Boolean).length;
        return originalWords > 0 && replacementWords > originalWords * 2;
    });
    const highImpactText = list.some(p => /edad|fecha|nombre|identidad|relaci[oó]n|parentesco|regla|canon|continuidad|muerte|vivo|muert[oa]/i.test(`${p.original || ''} ${p.content || ''}`));

    if (multiDocument) reasons.push('afecta varios documentos');
    if (hasDeletion) reasons.push('elimina texto');
    if (hasLargeRewrite) reasons.push('reescribe una sección extensa');
    if (highImpactText) reasons.push('afecta continuidad o datos de canon');

    return {
        risk: reasons.length === 0 ? 'low' : (highImpactText || multiDocument ? 'high' : 'medium'),
        requiresApproval: reasons.length > 0,
        reasons,
    };
};

const findDocument = (patch, documents) => {
    const resolved = resolveTargetDoc(patch.docId || patch.title || '', documents.chapters, documents.worldItems, documents.characters);
    if (!resolved) return null;
    const source = resolved.docType === 'character'
        ? documents.characters?.find(c => c.id === resolved.docId)
        : resolved.docType === 'worldItem'
            ? documents.worldItems?.find(w => w.id === resolved.docId)
            : documents.chapters?.find(c => c.id === resolved.docId);
    if (!source) return null;
    return { ...resolved, source };
};

const getContent = (doc) => doc.docType === 'character' ? (doc.source.description || '') : (doc.source.content || '');

/**
 * Valida todos los parches antes de guardar cualquiera. Si uno falla, no se
 * escribe ningún documento y el llamador recibe un resultado verificable.
 */
export const applyPatchesAtomically = async ({
    patches = [],
    documents,
    saveDocument,
    flushSaves,
    snapshot,
}) => {
    const list = Array.isArray(patches) ? patches : [];
    if (list.length === 0) return { status: OPERATION_STATUS.FAILED, successCount: 0, failedCount: 1, failures: ['No hay parches para aplicar.'] };

    const prepared = [];
    const staged = new Map();
    const failures = [];
    for (const patch of list) {
        const target = findDocument(patch, documents);
        const currentContent = target ? (staged.get(target.docId) ?? getContent(target)) : '';
        let validation = target
            ? { ok: true, target, result: applyPatch(currentContent, patch.original || '', patch.content || '') }
            : { ok: false, error: `Documento "${patch.title || patch.docId || 'desconocido'}" no encontrado.` };
        if (validation.ok && !validation.result.success) validation = { ok: false, error: `No se encontró el texto original en "${target.title}".` };
        if (validation.ok && validation.result.html === currentContent) validation = { ok: false, error: `El parche de "${target.title}" no produce cambios.` };
        if (!validation.ok) failures.push(validation.error);
        else {
            staged.set(target.docId, validation.result.html);
            prepared.push({ patch, ...validation });
        }
    }
    if (failures.length > 0) {
        return { status: OPERATION_STATUS.FAILED, successCount: 0, failedCount: failures.length, failures };
    }

    try {
        for (const item of prepared) {
            await saveDocument(item.target, item.result.html);
            if (snapshot) await snapshot(item.target.docId, item.result.html);
        }
        if (flushSaves) await flushSaves();
    } catch (error) {
        return {
            status: OPERATION_STATUS.PARTIAL_FAILURE,
            successCount: 0,
            failedCount: 1,
            failures: [`Error al guardar la operación: ${error?.message || 'error desconocido'}`],
        };
    }

    return {
        status: OPERATION_STATUS.APPLIED,
        successCount: prepared.length,
        failedCount: 0,
        failures: [],
        documents: prepared.map(item => item.target.title),
    };
};

export const buildOperationSummary = (patches = []) => (patches || []).map(p => {
    const action = !(p.content || '').trim() ? 'eliminar texto' : 'modificar';
    return `${action} en "${p.title || p.docId || 'Documento'}"`;
}).join('; ');

export default {
    OPERATION_STATUS,
    classifyPatchRisk,
    applyPatchesAtomically,
    buildOperationSummary,
};
