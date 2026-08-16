import React, { useState } from 'react';
import { Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { requestToolRoomProposal } from '../../services/ai-next/ToolRoomAIService';
import SanitizedContentPreview from './SanitizedContentPreview';

const ToolRoomAIProposal = ({ roomName, instruction, sourceContent = '', contextContent = '', onApply, applyLabel = 'Aprobar y guardar' }) => {
    const { profile } = useData();
    const [proposal, setProposal] = useState(null);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');

    const generate = async () => {
        if (status === 'loading' || status === 'saving') return;
        setStatus('loading');
        setError('');
        try {
            const nextProposal = await requestToolRoomProposal({ profile, instruction, sourceContent, contextContent, roomName });
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
                    </div>
                </div>
            )}

            {proposal?.summary && <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{proposal.summary}</p>}
            {error && <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-600">{error}</div>}

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
