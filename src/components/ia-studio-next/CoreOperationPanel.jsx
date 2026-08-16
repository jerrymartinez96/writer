import React, { useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import AIService from '../../services/AIService';
import { applyPatchesAtomically } from '../../services/ai/OperationEngine';
import { saveEntitySnapshot } from '../../services/db';
import SanitizedContentPreview from '../toolrooms/SanitizedContentPreview';
import { getConfiguredAIOptions } from '../../services/ai-next/AIRequestOptions';

const parseJson = (value) => {
    if (value && typeof value === 'object') return value;
    const raw = String(value || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return JSON.parse(raw); } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('La IA no devolvió una operación JSON válida.');
        return JSON.parse(match[0]);
    }
};

const getApiKey = (profile) => profile?.aiConfig?.deepseekApiKey || profile?.deepseekApiKey || window.localStorage.getItem('deepseekApiKey') || '';

const CoreOperationPanel = ({ request, capability, onClose }) => {
    const { activeBook, activeChapter, chapters = [], characters = [], worldItems = [], profile, updateCharacter, updateWorldItem, selectChapter } = useData();
    const [proposal, setProposal] = useState(null);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const isMulti = capability === 'multi_patch';
    const scopedDocuments = useMemo(() => {
        const chapterIds = request?.context?.chapterIds || [];
        const characterIds = request?.context?.characterIds || [];
        const worldItemIds = request?.context?.worldItemIds || [];
        const scopedChapters = chapterIds.length ? chapters.filter((item) => chapterIds.includes(item.id)) : (activeChapter ? [activeChapter] : chapters.slice(0, isMulti ? 12 : 1));
        const scopedCharacters = characterIds.length ? characters.filter((item) => characterIds.includes(item.id)) : characters.slice(0, isMulti ? 12 : 0);
        const scopedWorldItems = worldItemIds.length ? worldItems.filter((item) => worldItemIds.includes(item.id)) : worldItems.slice(0, isMulti ? 12 : 0);
        return { chapters: scopedChapters, characters: scopedCharacters, worldItems: scopedWorldItems };
    }, [request, chapters, characters, worldItems, activeChapter, isMulti]);
    const contextText = useMemo(() => [...scopedDocuments.chapters.map((item) => `[chapter:${item.id}] ${item.title}\n${item.content || ''}`), ...scopedDocuments.worldItems.map((item) => `[world:${item.id}] ${item.title}\n${item.content || ''}`), ...scopedDocuments.characters.map((item) => `[character:${item.id}] ${item.name}\n${item.description || ''}`)].join('\n\n'), [scopedDocuments]);

    const generate = async () => {
        setStatus('loading'); setError('');
        try {
            const key = getApiKey(profile);
            if (!key) throw new Error('Configura una API Key de DeepSeek para preparar cambios.');
            const limit = isMulti ? 'uno o más parches solo donde sean necesarios' : 'exactamente un parche';
            const prompt = `Eres el Core de edición. Prepara ${limit}. Devuelve únicamente JSON: {"summary":"texto plano","patches":[{"docId":"ID exacto","title":"texto plano","original":"fragmento exacto","content":"reemplazo en texto plano"}]}. Está estrictamente prohibido usar HTML, Markdown, negritas, títulos especiales, listas con formato o cualquier markup. Usa solo texto plano y saltos de línea simples. No inventes IDs. El fragmento original debe copiarse literalmente del contexto y content debe conservar lo no afectado. Solicitud: ${request.message}\n\nDocumentos disponibles:\n${contextText}`;
            const raw = await AIService.sendMessage(prompt, key, getConfiguredAIOptions(profile, { temperature: 0.2, useJsonMode: true, enableTools: false, max_tokens: 5000 }));
            const result = parseJson(raw);
            if (!Array.isArray(result.patches) || result.patches.length === 0) throw new Error('La IA no devolvió parches aplicables.');
            if (!isMulti && result.patches.length !== 1) throw new Error('El parche puntual debe contener exactamente un cambio.');
            if (result.patches.some((patch) => !patch.docId || !patch.original || typeof patch.content !== 'string')) throw new Error('La propuesta contiene un parche incompleto.');
            setProposal(result); setStatus('review');
        } catch (requestError) { setError(requestError?.message || 'No se pudo preparar la operación.'); setStatus('error'); }
    };

    const approve = async () => {
        if (!proposal || status === 'saving') return;
        setStatus('saving'); setError('');
        try {
            const result = await applyPatchesAtomically({
                patches: proposal.patches,
                documents: scopedDocuments,
                saveDocument: async (target, html) => {
                    if (target.docType === 'character') { await updateCharacter(target.docId, { description: html }); return; }
                    if (target.docType === 'worldItem') { await updateWorldItem(target.docId, { content: html }); return; }
                    const { updateChapterContent } = await import('../../services/db');
                    await updateChapterContent(activeBook.id, target.docId, html);
                },
                snapshot: async (docId, html) => {
                    const patch = proposal.patches.find((item) => item.docId === docId);
                    const collection = patch?.collection || (scopedDocuments.characters.some((item) => item.id === docId) ? 'characters' : scopedDocuments.worldItems.some((item) => item.id === docId) ? 'world' : 'chapters');
                    await saveEntitySnapshot(activeBook.id, collection, docId, html, `core-${capability}`);
                },
            });
            if (result.status !== 'applied') throw new Error(result.failures?.join(' ') || 'La operación fue rechazada.');
            if (activeChapter && proposal.patches.some((patch) => patch.docId === activeChapter.id)) await selectChapter(activeChapter.id);
            setStatus('saved');
        } catch (applyError) { setError(applyError?.message || 'No se pudo aplicar la operación.'); setStatus('review'); }
    };

    return <section className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-600">Operación Core · {isMulti ? 'Multiparche' : 'Parche'}</p><p className="mt-1 text-sm font-black">{status === 'saved' ? 'Cambios guardados' : proposal ? 'Revisa antes de aprobar' : 'Preparar cambios seguros'}</p></div><button type="button" onClick={onClose} disabled={status === 'saving'} className="rounded-lg p-1 text-[var(--text-muted)] hover:text-red-500 disabled:opacity-40"><X size={15} /></button></div>
        {proposal && <div className="mt-4 space-y-3">{proposal.patches.map((patch, index) => <div key={`${patch.docId}-${index}`} className="grid grid-cols-1 gap-2 lg:grid-cols-2"><div className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3"><p className="text-[9px] font-black uppercase text-[var(--text-muted)]">Original · {patch.title || patch.docId}</p><div className="mt-2 max-h-36 overflow-auto"><SanitizedContentPreview content={patch.original} /></div></div><div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"><p className="text-[9px] font-black uppercase text-emerald-600">Reemplazo</p><div className="mt-2 max-h-36 overflow-auto"><SanitizedContentPreview content={patch.content} /></div></div></div>)}</div>}
        {error && <p className="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">{!proposal && <button type="button" onClick={generate} disabled={status === 'loading'} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} {status === 'loading' ? 'Preparando…' : 'Preparar diff'}</button>}{status === 'review' && <><button type="button" onClick={approve} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><Check size={14} /> {status === 'saving' ? 'Guardando…' : 'Aprobar y guardar'}</button><button type="button" onClick={() => { setProposal(null); setStatus('idle'); }} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><X size={14} /> Rechazar</button><button type="button" onClick={generate} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><RefreshCw size={14} /> Regenerar</button></>}{status === 'saved' && <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-600"><Check size={14} /> Operación completada</span>}</div>
    </section>;
};

export default CoreOperationPanel;
