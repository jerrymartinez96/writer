import React from 'react';
import { AlertTriangle, CheckCircle2, Eye, FileText, X } from 'lucide-react';

const riskStyles = {
    low: { label: 'Bajo riesgo', className: 'text-emerald-500 bg-emerald-500/10', icon: CheckCircle2 },
    medium: { label: 'Revisión recomendada', className: 'text-amber-500 bg-amber-500/10', icon: AlertTriangle },
    high: { label: 'Requiere aprobación', className: 'text-red-500 bg-red-500/10', icon: AlertTriangle },
};

const ToolRoomProposalCard = ({ proposal, onReview, onDismiss }) => {
    if (!proposal) return null;
    const risk = riskStyles[proposal.risk || 'low'];
    const RiskIcon = risk.icon;
    return <article className="rounded-2xl border border-[var(--accent-main)]/25 bg-[var(--accent-soft)]/40 p-4">
        <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2"><span className="w-8 h-8 rounded-lg bg-[var(--accent-main)] text-white flex items-center justify-center"><FileText size={15} /></span><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Propuesta pendiente</p><h3 className="text-sm font-black">{proposal.title || 'Plan de trabajo'}</h3></div></div>
            {onDismiss && <button type="button" onClick={onDismiss} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10" title="Descartar propuesta"><X size={15} /></button>}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{proposal.summary || 'La IA trabajará con el contexto seleccionado y generará cambios revisables antes de aplicar.'}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${risk.className}`}><RiskIcon size={12} /> {risk.label}</span>{proposal.contextLabel && <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-editor)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-muted)]"><Eye size={12} /> {proposal.contextLabel}</span>}</div>
        {onReview && <button type="button" onClick={onReview} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-main)] px-3 py-2 text-xs font-black text-white hover:opacity-90"><Eye size={14} /> Revisar en IA Studio</button>}
    </article>;
};

export default ToolRoomProposalCard;
