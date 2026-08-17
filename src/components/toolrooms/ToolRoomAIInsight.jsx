import React, { useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { requestNarrativeInsight } from '../../services/ai-next/ToolRoomAIService';

const ToolRoomAIInsight = ({ roomName, instruction, sourceContent = '', contextContent = '', buttonLabel = 'Consultar IA' }) => {
    const { profile } = useData();
    const [result, setResult] = useState(null);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');

    const run = async () => {
        setStatus('loading');
        setError('');
        try {
            setResult(await requestNarrativeInsight({ profile, roomName, instruction, sourceContent, contextContent }));
            setStatus('ready');
        } catch (requestError) {
            setError(requestError?.message || 'No se pudo completar la consulta.');
            setStatus('error');
        }
    };

    return <div className="mt-6 rounded-2xl border border-[var(--accent-main)]/25 bg-[var(--accent-soft)]/30 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--accent-main)]">Análisis especializado</p><p className="mt-1 text-sm font-black">{result ? 'Resultado de IA disponible' : 'Ejecutar en esta Tool Room'}</p></div><span className="text-[10px] font-bold text-[var(--text-muted)]">Solo lectura</span></div>{result && <div className="mt-4 space-y-3"><div className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3"><p className="text-xs leading-relaxed">{result.result || result.summary || 'La IA no incluyó un resumen.'}</p></div>{Array.isArray(result.items) && result.items.map((item, index) => <div key={`${item.title || 'item'}-${index}`} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3"><p className="text-sm font-black">{item.title || `Hallazgo ${index + 1}`}</p><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{item.detail || item.description || ''}</p>{item.severity && <span className="mt-2 inline-flex rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase text-amber-600">{item.severity}</span>}</div>)}</div>}{error && <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-600">{error}</div>}<div className="mt-4"><button type="button" onClick={run} disabled={status === 'loading'} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-main)] px-3 py-2 text-xs font-black text-white disabled:opacity-50">{status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : result ? <RefreshCw size={14} /> : <Sparkles size={14} />} {status === 'loading' ? 'Consultando IA…' : result ? 'Actualizar resultado' : buttonLabel}</button></div></div>;
};

export default ToolRoomAIInsight;
