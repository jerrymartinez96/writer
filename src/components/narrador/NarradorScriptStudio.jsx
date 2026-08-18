import React, { useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { requestNarrationScript } from '../../services/ai-next/ToolRoomAIService';

const NarradorScriptStudio = ({ chapter, contextContent = '', onScriptReady }) => {
    const { profile } = useData();
    const [script, setScript] = useState(null);
    const [instruction, setInstruction] = useState('Usa pausas naturales y conserva literalmente el texto.');
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');

    const run = async () => {
        setStatus('loading');
        setError('');
        try {
            const nextScript = await requestNarrationScript({
                profile,
                chapterId: chapter?.id,
                sourceContent: chapter?.content || '',
                contextContent,
                instruction,
            });
            setScript(nextScript);
            onScriptReady?.(nextScript);
            setStatus('ready');
        } catch (requestError) {
            setError(requestError?.message || 'No se pudo diseñar el guion de narración.');
            setStatus('error');
        }
    };

    const updateSegment = (index, patch) => {
        setScript((previous) => {
            if (!previous) return previous;
            const nextScript = { ...previous, segments: previous.segments.map((segment, segmentIndex) => segmentIndex === index ? { ...segment, ...patch } : segment) };
            return nextScript;
        });
    };

    return <section className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-violet-600">Producción asistida</p><h3 className="mt-1 text-sm font-black">Guion de narración</h3><p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">Añade pausas e indicaciones de voz sin modificar el texto original del capítulo.</p></div>
            {script && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase text-emerald-600"><CheckCircle2 size={12} /> Revisable</span>}
        </div>
        <label className="mt-4 block text-xs font-black">Instrucción de dirección<input value={instruction} onChange={(event) => setInstruction(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-violet-500" /></label>
        {script && <div className="mt-4 space-y-2"><p className="text-xs leading-relaxed text-[var(--text-muted)]">{script.summary}</p>{script.warnings?.map((warning, index) => <p key={`warning-${index}`} className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{warning}</p>)}<div className="max-h-72 space-y-2 overflow-y-auto pr-1">{script.segments.map((segment, index) => <div key={`${segment.index}-${index}`} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-wider text-violet-600">Segmento {index + 1}</span><span className="text-[9px] text-[var(--text-muted)]">{segment.tone}</span></div><textarea value={segment.text} onChange={(event) => updateSegment(index, { text: event.target.value })} rows={2} className="mt-2 w-full resize-y rounded-lg border border-[var(--border-main)] bg-[var(--bg-editor)] p-2 text-xs leading-relaxed outline-none focus:border-violet-500" /><input value={segment.direction} onChange={(event) => updateSegment(index, { direction: event.target.value })} placeholder="Dirección de voz opcional" className="mt-2 w-full rounded-lg border border-[var(--border-main)] bg-[var(--bg-editor)] p-2 text-[11px] outline-none focus:border-violet-500" /></div>)}</div></div>}
        {error && <p className="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}
        {script && <button type="button" onClick={() => onScriptReady?.(script)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 px-3 py-2 text-xs font-black text-emerald-600 hover:bg-emerald-500/10">Aplicar cambios al reproductor</button>}
        <button type="button" onClick={run} disabled={status === 'loading' || !chapter?.content} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white disabled:cursor-wait disabled:opacity-50">{status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : script ? <RefreshCw size={14} /> : <Sparkles size={14} />} {status === 'loading' ? 'Diseñando guion…' : script ? 'Regenerar guion' : 'Diseñar guion de voz'}</button>
    </section>;
};

export default NarradorScriptStudio;
