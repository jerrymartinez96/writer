import React, { useState } from 'react';
import { Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { requestToolRoomProposal } from '../../services/ai-next/ToolRoomAIService';
import SanitizedContentPreview from './SanitizedContentPreview';

const ToolRoomCreateEntity = ({ roomName, entityLabel, placeholder, contextContent = '', onCreate }) => {
    const { profile } = useData();
    const [name, setName] = useState('');
    const [proposal, setProposal] = useState(null);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');

    const generate = async () => {
        if (!name.trim() || status === 'loading' || status === 'saving') return;
        setStatus('loading');
        setError('');
        try {
            const nextProposal = await requestToolRoomProposal({
                profile,
                roomName,
                instruction: `Crea ${entityLabel} llamado "${name.trim()}" con una ficha completa y útil para una obra narrativa.`,
                sourceContent: '(entidad nueva: no existe contenido previo)',
                contextContent,
            });
            setProposal(nextProposal);
            setStatus('review');
        } catch (requestError) {
            setError(requestError?.message || 'No se pudo preparar la creación.');
            setStatus('error');
        }
    };

    const approve = async () => {
        if (!proposal || status === 'saving') return;
        setStatus('saving');
        setError('');
        try {
            await onCreate({ name: name.trim(), content: proposal.replacement }, proposal);
            setStatus('saved');
        } catch (createError) {
            setError(createError?.message || 'No se pudo crear la entidad.');
            setStatus('review');
        }
    };

    const reset = () => {
        if (status === 'saving') return;
        setProposal(null);
        setError('');
        setStatus('idle');
    };

    return <div className="mt-6 rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-indigo-500">Crear con IA</p><p className="mt-1 text-sm font-black">Nueva {entityLabel}</p></div><span className="text-[10px] font-bold text-[var(--text-muted)]">{status === 'saved' ? 'Guardado' : status === 'review' ? 'Requiere aprobación' : 'Sin escrituras automáticas'}</span></div>
        <input value={name} onChange={(event) => setName(event.target.value)} disabled={status === 'loading' || status === 'saving' || status === 'saved'} placeholder={placeholder} className="mt-4 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] px-3 py-2.5 text-sm outline-none focus:border-indigo-500 disabled:opacity-60" />
        {status === 'review' && proposal && <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2"><div className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3"><p className="text-[9px] font-black uppercase text-[var(--text-muted)]">Original</p><SanitizedContentPreview content="(entidad nueva)" className="mt-2" /></div><div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"><p className="text-[9px] font-black uppercase text-emerald-600">Propuesta</p><div className="mt-2 max-h-56 overflow-auto"><SanitizedContentPreview content={proposal.replacement} /></div></div></div>}
        {proposal?.summary && <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{proposal.summary}</p>}
        {error && <p className="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">{(!proposal || status === 'error') && <button type="button" onClick={generate} disabled={!name.trim() || status === 'loading' || status === 'saving'} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {status === 'loading' ? 'Consultando IA…' : status === 'error' ? 'Reintentar' : 'Preparar creación'}</button>}{status === 'review' && <><button type="button" onClick={approve} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{status === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {status === 'saving' ? 'Guardando…' : 'Aprobar y crear'}</button><button type="button" onClick={reset} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><X size={14} /> Rechazar</button><button type="button" onClick={generate} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><RefreshCw size={14} /> Regenerar</button></>}{status === 'saved' && <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><RefreshCw size={14} /> Crear otra</button>}</div>
    </div>;
};

export default ToolRoomCreateEntity;
