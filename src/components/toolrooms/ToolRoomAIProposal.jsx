import React, { useState } from 'react';
import { AlertTriangle, Check, Copy, Expand, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { requestChapterDraft, requestChapterFormatting, requestToolRoomProposal } from '../../services/ai-next/ToolRoomAIService';
import SanitizedContentPreview from './SanitizedContentPreview';

const ToolRoomAIProposal = ({ roomName, instruction, sourceContent = '', contextContent = '', onApply, applyLabel = 'Aprobar y guardar', proposalRequest = null, proposalValidator = null }) => {
    const { profile } = useData();
    const [proposal, setProposal] = useState(null);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [isFormatting, setIsFormatting] = useState(false);

    const generate = async () => {
        if (status === 'loading' || status === 'saving') return;
        setStatus('loading');
        setError('');
        try {
            const chapterDraftRequest = roomName === 'Redactor desde Estructura'
                ? ({ profile: requestProfile, contextContent: requestContext, instruction: requestInstruction }) => requestChapterDraft({
                    profile: requestProfile,
                    title: requestInstruction.match(/capítulo\s+(.+?)\s+respetando/i)?.[1] || 'Capítulo',
                    structure: requestContext,
                    contextContent: requestContext,
                    sizeLabel: requestInstruction.match(/Extensión (?:orientativa|objetivo):\s*([^]+)/i)?.[1] || '1,200–2,000 palabras',
                })
                : null;
            const nextProposal = proposalRequest
                ? await proposalRequest({ profile, instruction, sourceContent, contextContent, roomName })
                : chapterDraftRequest
                    ? await chapterDraftRequest({ profile, contextContent, instruction })
                : await requestToolRoomProposal({ profile, instruction, sourceContent, contextContent, roomName });
            if (proposalValidator) proposalValidator(nextProposal);
            setProposal(nextProposal);
            setStatus('review');
        } catch (requestError) {
            setError(requestError?.message || 'No se pudo generar la propuesta.');
            setStatus('error');
        }
    };

    const reject = () => {
        if (status === 'saving') return;
        setProposal(null);
        setError('');
        setStatus('idle');
    };

    const apply = async () => {
        if (!proposal || status === 'saving') return;
        setStatus('saving');
        setError('');
        try {
            await onApply(proposal.replacement, proposal);
            setStatus('saved');
        } catch (applyError) {
            setError(applyError?.message || 'No se pudo guardar la propuesta.');
            setStatus('review');
        }
    };

    const busy = status === 'loading' || status === 'saving';
    const updateReplacement = (replacement) => setProposal((current) => {
        if (!current) return current;
        const wordCount = replacement.trim().split(/\s+/).filter(Boolean).length;
        const sizeWarning = current.maximumWords && wordCount > current.maximumWords
            ? `La propuesta tiene ${wordCount.toLocaleString()} palabras y supera el objetivo orientativo de ${current.maximumWords.toLocaleString()}. Puedes recortarla o aprobarla completa.`
            : '';
        return { ...current, replacement, wordCount, sizeWarning };
    });
    const copyProposal = async () => {
        if (!proposal?.replacement || !navigator.clipboard) return;
        await navigator.clipboard.writeText(proposal.replacement);
    };
    const formatProposal = async () => {
        if (!proposal?.replacement || isFormatting) return;
        setIsFormatting(true);
        setError('');
        try {
            const formatted = await requestChapterFormatting({ profile, text: proposal.replacement });
            setProposal((current) => current ? { ...current, replacement: formatted } : current);
        } catch (formatError) {
            setError(formatError?.message || 'No se pudo formatear la propuesta.');
        } finally {
            setIsFormatting(false);
        }
    };

    return (
        <div className="mt-6 rounded-2xl border border-[var(--accent-main)]/25 bg-[var(--accent-soft)]/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--accent-main)]">Ejecución de Tool Room</p>
                    <p className="mt-1 text-sm font-black">{status === 'saved' ? 'Cambios guardados' : proposal ? 'Propuesta lista para revisar' : 'Generar propuesta con IA'}</p>
                </div>
                <span className="text-[10px] font-bold text-[var(--text-muted)]">{status === 'saved' ? 'Completado' : status === 'saving' ? 'Guardando…' : status === 'loading' ? 'Consultando IA…' : status === 'review' ? 'Requiere aprobación' : 'Sin escrituras automáticas'}</span>
            </div>

            {status === 'review' && proposal && (
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3">
                        <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Original</p>
                        <div className="mt-2 max-h-52 overflow-auto"><SanitizedContentPreview content={sourceContent} /></div>
                    </div>
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                        <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Propuesta · riesgo {proposal.risk}</p>
                        <div className="mt-2 max-h-52 overflow-auto"><SanitizedContentPreview content={proposal.replacement} /></div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">{roomName === 'Redactor desde Estructura' && <button type="button" onClick={formatProposal} disabled={isFormatting || busy} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 px-2.5 py-1.5 text-[10px] font-black text-emerald-700 disabled:opacity-60">{isFormatting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {isFormatting ? 'Formateando…' : 'Formatear texto'}</button>}<button type="button" onClick={() => setIsExpanded(true)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 px-2.5 py-1.5 text-[10px] font-black text-emerald-700"><Expand size={13} /> Ver completa y editar</button>{proposal.wordCount && <span className="text-[10px] text-[var(--text-muted)]">{proposal.wordCount.toLocaleString()} palabras</span>}</div>
                    </div>
                </div>
            )}

            {proposal?.summary && <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{proposal.summary}</p>}
            {proposal?.sizeWarning && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{proposal.sizeWarning}</span></div>}
            {error && <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-600">{error}</div>}

            {isExpanded && proposal && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsExpanded(false)}><div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] shadow-2xl" role="dialog" aria-modal="true" aria-label="Propuesta completa"><div className="flex items-center justify-between gap-3 border-b border-[var(--border-main)] p-5"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--accent-main)]">Revisión ampliada</p><h3 className="mt-1 text-xl font-serif font-black">{roomName}</h3></div><div className="flex items-center gap-2"><button type="button" onClick={copyProposal} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><Copy size={14} /> Copiar</button><button type="button" onClick={() => setIsExpanded(false)} className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]" aria-label="Cerrar"><X size={18} /></button></div></div><textarea value={proposal.replacement} onChange={(event) => updateReplacement(event.target.value)} className="min-h-[55vh] flex-1 resize-none bg-[var(--bg-app)] p-6 font-serif text-base leading-8 outline-none" /><div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-main)] p-4"><span className="text-xs text-[var(--text-muted)]">{proposal.replacement.split(/\s+/).filter(Boolean).length.toLocaleString()} palabras · Puedes editar antes de aprobar.</span><button type="button" onClick={() => setIsExpanded(false)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white"><Check size={14} /> Terminar revisión</button></div></div></div>}

            <div className="mt-4 flex flex-wrap gap-2">
                {!proposal && (
                    <button type="button" onClick={generate} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-main)] px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                        {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        {status === 'loading' ? 'Consultando IA…' : 'Generar propuesta'}
                    </button>
                )}
                {status === 'error' && (
                    <button type="button" onClick={generate} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-500/5 disabled:opacity-50">
                        <RefreshCw size={14} /> Reintentar
                    </button>
                )}
                {status === 'review' && (
                    <>
                        <button type="button" onClick={apply} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
                            {status === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            {status === 'saving' ? 'Guardando…' : applyLabel}
                        </button>
                        <button type="button" onClick={reject} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black hover:border-red-500 hover:text-red-500 disabled:opacity-50"><X size={14} /> Rechazar</button>
                        <button type="button" onClick={generate} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black hover:border-[var(--accent-main)] disabled:opacity-50"><RefreshCw size={14} /> Regenerar</button>
                    </>
                )}
                {status === 'saved' && <button type="button" onClick={reject} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><RefreshCw size={14} /> Crear otra propuesta</button>}
            </div>
        </div>
    );
};

export default ToolRoomAIProposal;
