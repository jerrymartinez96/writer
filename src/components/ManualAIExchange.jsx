import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Clipboard, ClipboardCheck, Loader2, X } from 'lucide-react';
import {
    cancelManualAIRequest,
    getActiveManualAIRequest,
    submitManualAIResponse,
    subscribeToManualAIRequests,
    validateManualAIResponse,
} from '../services/ai-next/ManualAIRequestService';
import { useToast } from './Toast';

const copyPrompt = async (prompt) => {
    if (!navigator.clipboard?.writeText) throw new Error('El navegador no permitió copiar automáticamente. Usa «Copiar prompt».');
    await navigator.clipboard.writeText(prompt);
};

const ManualAIExchangeRequest = ({ request }) => {
    const toast = useToast();
    const [response, setResponse] = useState('');
    const [copyStatus, setCopyStatus] = useState('copying');
    const [error, setError] = useState('');
    const [accepted, setAccepted] = useState(false);
    const submitTimerRef = useRef(null);

    const handleCancel = useCallback(() => {
        if (submitTimerRef.current) {
            window.clearTimeout(submitTimerRef.current);
            submitTimerRef.current = null;
        }
        cancelManualAIRequest(request.id);
        toast.info('Solicitud manual cancelada. No se aplicó ningún cambio.', 4000);
    }, [request.id, toast]);

    useEffect(() => {
        copyPrompt(request.prompt)
            .then(() => setCopyStatus('copied'))
            .catch((copyError) => {
                setCopyStatus('failed');
                setError(copyError?.message || 'No se pudo copiar el prompt automáticamente.');
            });
        return () => {
            if (submitTimerRef.current) window.clearTimeout(submitTimerRef.current);
        };
    }, [request]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') handleCancel();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleCancel]);

    const handleCopy = async () => {
        setCopyStatus('copying');
        setError('');
        try {
            await copyPrompt(request.prompt);
            setCopyStatus('copied');
        } catch (copyError) {
            setCopyStatus('failed');
            setError(copyError?.message || 'No se pudo copiar el prompt.');
        }
    };

    const handleSubmit = () => {
        setError('');
        try {
            validateManualAIResponse(request.id, response);
            setAccepted(true);
            toast.success('Respuesta validada. Verne está preparando el resultado y el siguiente paso.', 5500);
            submitTimerRef.current = window.setTimeout(() => {
                submitTimerRef.current = null;
                submitManualAIResponse(request.id, response);
            }, 700);
        } catch (submitError) {
            setError(submitError?.message || 'La respuesta no tiene el formato esperado.');
        }
    };

    return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) handleCancel(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="manual-ai-title" className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-indigo-500/25 bg-[var(--bg-app)] text-[var(--text-main)] shadow-2xl">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border-main)] bg-indigo-500/5 p-4 sm:p-6">
                <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Clipboard size={19} /></span><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500">Modo prompt manual</p><h2 id="manual-ai-title" className="mt-1 font-serif text-xl font-black">Completa la solicitud en tu chat de IA</h2><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">El flujo queda pausado aquí hasta que pegues una respuesta válida.</p></div></div>
                <button type="button" onClick={handleCancel} className="rounded-xl border border-[var(--border-main)] p-2 text-[var(--text-muted)] transition-colors hover:border-red-500/40 hover:text-red-500" aria-label="Cancelar solicitud manual"><X size={17} /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                    <section className="min-w-0"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black">1. Lleva este prompt a la IA</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">Se intenta copiar automáticamente al abrir.</p></div><button type="button" onClick={handleCopy} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-xs font-black text-indigo-600 hover:bg-indigo-500/10">{copyStatus === 'copying' ? <Loader2 size={14} className="animate-spin" /> : copyStatus === 'copied' ? <ClipboardCheck size={14} /> : <Clipboard size={14} />}{copyStatus === 'copied' ? 'Copiado' : 'Copiar prompt'}</button></div><textarea readOnly value={request.prompt} rows={16} aria-label="Prompt preparado" className="mt-3 min-h-[260px] w-full resize-none rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-4 font-mono text-[11px] leading-relaxed text-[var(--text-muted)] outline-none" /></section>
                    <section className="min-w-0"><div><p className="text-xs font-black">2. Pega aquí la respuesta completa</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">La estructura se valida antes de reanudar la acción.</p></div><textarea value={response} onChange={(event) => setResponse(event.target.value)} rows={16} aria-label="Respuesta de la IA" placeholder="Pega aquí la respuesta del chat externo…" className="mt-3 min-h-[260px] w-full resize-none rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-4 text-sm leading-relaxed outline-none placeholder:text-[var(--text-muted)] focus:border-indigo-500" /></section>
                </div>
                {accepted && <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm leading-relaxed text-emerald-700 dark:text-emerald-300"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={15} /></span><div><p className="font-black">Respuesta validada correctamente</p><p className="mt-1 text-xs text-[var(--text-muted)]">Ahora se cerrará este panel y verás el resultado o el siguiente paso dentro de la herramienta.</p></div></div>}
                {error && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border-main)] p-4 sm:px-6"><p className="text-[10px] text-[var(--text-muted)]">Cancelar no modifica documentos ni consume una llamada API.</p><div className="flex gap-2"><button type="button" onClick={handleCancel} className="rounded-xl border border-[var(--border-main)] px-4 py-2.5 text-xs font-black text-[var(--text-muted)] hover:text-[var(--text-main)]">Cancelar</button><button type="button" onClick={handleSubmit} disabled={!response.trim() || accepted} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed ${accepted ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40'}`}>{accepted ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {accepted ? 'Preparando resultado…' : 'Validar y continuar'}</button></div></footer>
        </section>
    </div>;
};

const ManualAIExchange = () => {
    const [request, setRequest] = useState(getActiveManualAIRequest);
    useEffect(() => subscribeToManualAIRequests(setRequest), []);
    return request ? <ManualAIExchangeRequest key={request.id} request={request} /> : null;
};

export default ManualAIExchange;
