import React, { useEffect, useState } from 'react';
import { Check, Eye, Loader2, Sparkles, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { requestCoherenceCustomResolution, requestCoherenceResolutionOptions, validateCoherenceFinding } from '../../services/ai-next/ToolRoomAIService';

const riskLabel = { low: 'Riesgo bajo', medium: 'Riesgo medio', high: 'Riesgo alto' };

const CoherenceFindingCard = ({ finding, documents = [], onPreview, onApply, onIgnore: ignoreCallback }) => {
    const { profile } = useData();
    const [status, setStatus] = useState(finding.status || (finding.options?.length ? 'options_ready' : 'detected'));
    const [options, setOptions] = useState(finding.options || []);
    const [selectedOption, setSelectedOption] = useState(null);
    const [patches, setPatches] = useState([]);
    const [customOpen, setCustomOpen] = useState(false);
    const [customInstruction, setCustomInstruction] = useState('');
    const [customStatus, setCustomStatus] = useState('idle');
    const [previewStatus, setPreviewStatus] = useState('idle');
    const [error, setError] = useState('');
    const ignoreFinding = () => {
        setStatus('ignored');
        ignoreCallback?.(finding);
    };
    const onIgnore = ignoreFinding;

    useEffect(() => {
        // The parent can invalidate this card after another shared document changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (finding.status === 'stale') setStatus('stale');
    }, [finding.status]);

    const generateOptions = async (force = false) => {
        if (status === 'loading') return;
        setStatus('loading');
        setError('');
        try {
            const validated = force || finding.status === 'confirmed'
                ? { ...finding, status: 'confirmed' }
                : await validateCoherenceFinding({ profile, finding, documents });
            if (validated.status !== 'confirmed') {
                setStatus('needs_review');
                setError(validated.validationReason || 'La IA no pudo confirmar una contradicción objetiva.');
                return;
            }
            setStatus('validating');
            const nextOptions = await requestCoherenceResolutionOptions({ profile, finding: { ...validated, status: 'confirmed' }, documents, force });
            setOptions(nextOptions);
            setStatus('options_ready');
            window.dispatchEvent(new CustomEvent('coherence-options-generated', { detail: { findingId: finding.id, options: nextOptions } }));
        } catch (requestError) {
            setStatus('error');
            setError(requestError?.message || 'No se pudieron generar las soluciones.');
        }
    };

    const apply = async () => {
        if (!selectedOption || !patches.length || status === 'applying') return;
        setStatus('applying');
        setError('');
        try {
            await onApply({ ...finding, status: 'confirmed', forcedResolution: finding.status !== 'confirmed' }, selectedOption, patches);
            setStatus('resolved');
        } catch (applyError) {
            setStatus('options_ready');
            setError(applyError?.message || 'No se pudo aplicar la solución.');
        }
    };

    const preview = async () => {
        if (!selectedOption || status === 'loading') return;
        setStatus('loading');
        setPreviewStatus('loading');
        setError('');
        try {
            const nextPatches = await (onPreview || ((nextFinding, nextOption) => onApply(nextFinding, nextOption, null, { preview: true })))({ ...finding, status: 'confirmed' }, selectedOption);
            setPatches(nextPatches);
            setStatus('preview');
            setPreviewStatus('ready');
        } catch (previewError) {
            setStatus('options_ready');
            setPreviewStatus('error');
            setError(previewError?.message || 'No se pudo preparar la vista previa.');
        }
    };

    const generateCustomOption = async () => {
        if (!customInstruction.trim() || status === 'loading') return;
        setStatus('loading');
        setCustomStatus('loading');
        setError('');
        try {
            const customOption = await requestCoherenceCustomResolution({ profile, finding: { ...finding, status: 'confirmed' }, documents, instruction: customInstruction });
            setOptions((previous) => [...previous, customOption]);
            setSelectedOption(customOption);
            setCustomOpen(false);
            setPatches([]);
            setStatus('options_ready');
            setCustomStatus('ready');
            window.dispatchEvent(new CustomEvent('coherence-options-generated', { detail: { findingId: finding.id, options: [...options, customOption] } }));
        } catch (customError) {
            setStatus('options_ready');
            setCustomStatus('error');
            setError(customError?.message || 'No se pudo crear la versión alternativa.');
        }
    };

    if (status === 'ignored') return <article className="rounded-2xl border border-dashed border-[var(--border-main)] p-4 opacity-60"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black line-through">{finding.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Hallazgo descartado por el usuario.</p></div><button type="button" onClick={() => setStatus('needs_review')} className="text-xs font-black text-cyan-600">Restaurar</button></div></article>;

    const isResolved = status === 'resolved';
    return (
        <article className={`rounded-2xl border p-4 ${isResolved ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[var(--border-main)] bg-[var(--bg-editor)]'}`}>
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${isResolved ? 'text-emerald-500' : 'text-cyan-500'}`}>{isResolved ? <Check size={18} /> : <Eye size={18} />}</div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-sm font-black">{finding.title}</h3>
                        <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[9px] font-black uppercase text-cyan-600">{isResolved ? 'Resuelta' : status === 'stale' ? 'Requiere actualizar' : `${Math.round(Number(finding.confidence || 0) * 100)}% confianza`}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{finding.explanation || finding.detail}</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {[finding.evidenceA, finding.evidenceB].filter(Boolean).map((evidence, index) => <div key={`${evidence.documentId}-${index}`} className="rounded-xl bg-[var(--bg-app)] p-3 text-xs"><p className="font-black">{documents.find((item) => item.id === evidence.documentId)?.label || evidence.documentId}</p><p className="mt-1 text-[var(--text-muted)]">“{evidence.quote}”</p></div>)}
                    </div>
                </div>
            </div>

            {!isResolved && <div className="mt-4 flex flex-wrap gap-2">{(status === 'detected' || status === 'stale') && <button type="button" onClick={() => generateOptions(false)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white"><Sparkles size={14} /> {status === 'stale' ? 'Actualizar soluciones' : 'Validar y generar 3 soluciones'}</button>}{(status === 'loading' || status === 'validating' || status === 'applying') && <span className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-600"><Loader2 size={14} className="animate-spin" /> {status === 'applying' ? 'Aplicando…' : 'Analizando…'}</span>}{status === 'error' && <button type="button" onClick={() => generateOptions(false)} className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-black text-red-600">Reintentar</button>}{status === 'needs_review' && <><span className="w-full rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-700">La IA no confirmó una contradicción objetiva.</span><button type="button" onClick={() => onIgnore?.(finding)} className="rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black text-[var(--text-muted)]">Descartar falso positivo</button><button type="button" onClick={() => generateOptions(true)} className="rounded-xl border border-amber-500/40 px-3 py-2 text-xs font-black text-amber-700">Generar soluciones de todos modos</button></>}{status !== 'loading' && status !== 'validating' && status !== 'applying' && status !== 'needs_review' && status !== 'stale' && <button type="button" onClick={() => { setStatus('ignored'); onIgnore?.(finding); }} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black text-[var(--text-muted)]"><X size={14} /> Ignorar</button>}</div>}

            {options.length > 0 && !isResolved && <div className="mt-4 space-y-2"><p className="text-[9px] font-black uppercase tracking-wider text-cyan-600">Elige una solución para esta inconsistencia</p>{options.map((option) => <button key={option.id} type="button" onClick={() => { setSelectedOption(option); setPatches([]); setPreviewStatus('idle'); }} className={`w-full rounded-xl border p-3 text-left ${selectedOption?.id === option.id ? 'border-cyan-500 bg-cyan-500/5' : 'border-[var(--border-main)]'}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-black">{option.title}{option.custom ? ' · Personalizada' : ''}</span><span className="text-[9px] font-black uppercase text-[var(--text-muted)]">{riskLabel[option.risk]}</span></div><p className="mt-1 text-xs text-[var(--text-muted)]">{option.description}</p><p className="mt-2 text-[10px] text-[var(--text-muted)]">Afecta: {option.documentIds.map((id) => documents.find((item) => item.id === id)?.label || id).join(', ')}</p></button>)}{selectedOption && !patches.length && <button type="button" onClick={preview} disabled={previewStatus === 'loading'} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500 px-3 py-2 text-xs font-black text-cyan-600">{previewStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} {previewStatus === 'loading' ? 'Preparando vista previa…' : 'Preparar vista previa'}</button>}<button type="button" onClick={() => setCustomOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black text-[var(--text-muted)]">Trabajar versión alternativa</button>{customOpen && <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-3"><label className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Describe tu solución</label><textarea value={customInstruction} onChange={(event) => setCustomInstruction(event.target.value)} rows={3} placeholder="Ej. Mantén la fecha, pero explica que las invocaciones ocurrieron durante un entrenamiento secreto…" className="mt-2 w-full resize-none rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-xs outline-none focus:border-indigo-500" /><button type="button" onClick={generateCustomOption} disabled={!customInstruction.trim() || customStatus === 'loading'} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{customStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {customStatus === 'loading' ? 'Generando versión alternativa…' : 'Generar versión alternativa'}</button>{customStatus === 'loading' && <p className="mt-2 text-[10px] text-indigo-700">DeepSeek está convirtiendo tu idea en una solución aplicable…</p>}</div>}</div>}
            {status === 'needs_review' && !customOpen && <button type="button" onClick={() => setCustomOpen(true)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 px-3 py-2 text-xs font-black text-indigo-600">Trabajar versión alternativa</button>}
            {status === 'needs_review' && customOpen && <div className="mt-3 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-3"><label className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Describe tu solución</label><textarea value={customInstruction} onChange={(event) => setCustomInstruction(event.target.value)} rows={3} placeholder="Ej. Mantén la fecha, pero explica que las invocaciones ocurrieron durante un entrenamiento secreto…" className="mt-2 w-full resize-none rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-xs outline-none focus:border-indigo-500" /><button type="button" onClick={generateCustomOption} disabled={!customInstruction.trim()} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><Sparkles size={14} /> Generar versión alternativa</button></div>}
            {customStatus === 'loading' && options.length === 0 && <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-500/10 px-3 py-2 text-xs font-black text-indigo-700"><Loader2 size={14} className="animate-spin" /> Generando versión alternativa…</div>}
            {patches.length > 0 && !isResolved && <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-amber-700">Vista previa · revisa antes de aplicar</p>{patches.map((patch) => <div key={`${patch.documentId}-${patch.originalText}`} className="mt-3 rounded-lg bg-[var(--bg-app)] p-3 text-xs"><p className="font-black">{documents.find((item) => item.id === patch.documentId)?.label || patch.documentId}</p><div className="mt-2 grid gap-2 md:grid-cols-2"><div className="rounded border border-red-500/20 bg-red-500/5 p-2"><p className="text-[9px] font-black uppercase text-red-600">Original</p><p className="mt-1 whitespace-pre-wrap">{patch.originalText}</p></div><div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2"><p className="text-[9px] font-black uppercase text-emerald-600">Nuevo</p><p className="mt-1 whitespace-pre-wrap">{patch.replacementText}</p></div></div><p className="mt-2 text-[10px] text-[var(--text-muted)]">{patch.reason}</p></div>)}<button type="button" onClick={apply} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"><Check size={14} /> Confirmar y aplicar solución</button></div>}
            {error && <p className="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-600">{error}</p>}
        </article>
    );
};

export default CoherenceFindingCard;
