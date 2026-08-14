import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User, Bot, FileDiff, Copy, Check, RotateCw, RotateCcw, FileText, Lightbulb, Search, ChevronDown, ChevronUp, Trash2, Film, AlertTriangle, Wrench, CheckCircle2, Loader2, X, Sparkles } from 'lucide-react';
import { parseInconsistenciesFromResponse, parseSuggestionsFromResponse, getDocumentDisplayLabel } from './IAStudioUtils';

const ReviewModal = ({ title, count, icon, accent = 'purple', onClose, children }) => {
    const palette = accent === 'amber'
        ? { text: 'text-amber-500', soft: 'bg-amber-500/10', border: 'border-amber-500/20', glow: 'shadow-[0_0_35px_rgba(245,158,11,0.08)]' }
        : { text: 'text-purple-500', soft: 'bg-purple-500/10', border: 'border-purple-500/20', glow: 'shadow-[0_0_35px_rgba(168,85,247,0.08)]' };

    return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-200">
        <div className={`relative flex h-full w-full flex-col overflow-hidden bg-[var(--bg-app)] sm:h-[92vh] sm:max-w-6xl sm:rounded-[2rem] sm:border sm:border-[var(--border-main)] ${palette.glow} shadow-[0_30px_100px_rgba(0,0,0,0.65)]`}>
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-purple-500/[0.07] to-transparent pointer-events-none" />
            <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-main)] bg-[var(--bg-editor)]/85 px-4 py-3 backdrop-blur-xl sm:px-7 sm:py-5">
                <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${palette.soft} ${palette.text} ring-1 ${palette.border}`}>{icon}</div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-black uppercase tracking-wider text-[var(--text-main)] sm:text-base">{title}</h3>
                            <span className={`hidden rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider sm:inline-flex ${palette.soft} ${palette.text} ${palette.border}`}>Revisión guiada</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{count} elemento{count === 1 ? '' : 's'} · selecciona una tarjeta para trabajarla</p>
                    </div>
                </div>
                <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)]/50 text-[var(--text-muted)] transition-all hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-500 active:scale-95" aria-label="Cerrar revisión"><X size={17} /></button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-7">
                <div className="mx-auto w-full max-w-5xl">{children}</div>
            </div>
            <div className="relative flex shrink-0 items-center justify-between border-t border-[var(--border-main)] bg-[var(--bg-editor)]/70 px-4 py-2.5 text-[9px] text-[var(--text-muted)] sm:px-7">
                <span className="flex items-center gap-1.5"><Sparkles size={11} className={palette.text} /> Revisa cada propuesta antes de continuar</span>
                <span className="hidden sm:inline">ESC para cerrar</span>
            </div>
        </div>
    </div>
    );
};

const SuggestionCardsView = ({ message, onSuggestionAction, onClose, isModal = false }) => {
    const suggestions = useMemo(() => parseSuggestionsFromResponse(message.rawResponse || message.content), [message.rawResponse, message.content]);
    const [edited, setEdited] = useState({});
    const [hidden, setHidden] = useState({});
    const [isOpen, setIsOpen] = useState(false);
    const [actionStates, setActionStates] = useState({});

    const actionLabels = {
        develop: 'Desarrollar',
        analyze: 'Analizar impacto',
        prepare: 'Preparar cambios',
        variant: 'Otra variante',
    };

    const handleSuggestionAction = async (suggestion, action) => {
        const actionKey = suggestion.id;
        if (actionStates[actionKey]?.status === 'sending') return;

        setActionStates(prev => ({
            ...prev,
            [actionKey]: { status: 'sending', action }
        }));
        onClose?.();

        try {
            await Promise.resolve(onSuggestionAction?.(suggestion, action));
            setActionStates(prev => ({
                ...prev,
                [actionKey]: { status: 'sent', action }
            }));
        } catch {
            setActionStates(prev => ({
                ...prev,
                [actionKey]: { status: 'error', action }
            }));
        }
    };

    const impactClass = {
        bajo: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        medio: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        alto: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    };

    if (!isModal) {
        return (
            <>
                <button onClick={() => setIsOpen(true)} className="flex w-full items-center justify-between rounded-2xl border border-purple-500/25 bg-purple-500/[0.06] px-4 py-3 text-left hover:bg-purple-500/[0.1]">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-purple-500"><Lightbulb size={15} /> Propuestas creativas</span>
                    <span className="rounded-lg bg-purple-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white">Revisar {suggestions.length}</span>
                </button>
                {isOpen && <ReviewModal title="Propuestas creativas" count={suggestions.length} accent="purple" icon={<Lightbulb size={17} />} onClose={() => setIsOpen(false)}><SuggestionCardsView message={message} onSuggestionAction={onSuggestionAction} onClose={() => setIsOpen(false)} isModal /></ReviewModal>}
            </>
        );
    }

    return (
        <div className="space-y-3 my-2">
            <div className="flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-widest text-purple-500">
                <Lightbulb size={14} /> Propuestas creativas
            </div>
            {suggestions.map(suggestion => {
                if (hidden[suggestion.id]) return null;
                const currentIdea = edited[suggestion.id] ?? suggestion.idea;
                const impact = suggestion.impact in impactClass ? suggestion.impact : 'medio';
                const actionState = actionStates[suggestion.id];
                const isSending = actionState?.status === 'sending';
                return (
                    <div key={suggestion.id} className="rounded-2xl border-2 border-purple-500/20 bg-purple-500/[0.025] overflow-hidden shadow-sm">
                        <div className="px-4 py-3 border-b border-purple-500/10 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h4 className="text-xs font-bold text-[var(--text-main)]">{suggestion.title}</h4>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${impactClass[impact]}`}>
                                        Impacto {impact}
                                    </span>
                                    {suggestion.documents.map(doc => (
                                        <span key={doc} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[var(--border-main)]/40 text-[var(--text-muted)]">📁 {doc}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-4 space-y-3">
                            <textarea
                                value={currentIdea}
                                onChange={event => setEdited(prev => ({ ...prev, [suggestion.id]: event.target.value }))}
                                rows={10}
                                className="w-full min-h-48 resize-y rounded-xl border border-[var(--border-main)]/60 bg-[var(--bg-app)]/40 p-3 text-xs leading-relaxed text-[var(--text-main)] outline-none focus:border-purple-500/50"
                                aria-label={`Editar propuesta ${suggestion.title}`}
                            />
                            {suggestion.consequences && (
                                <div className="rounded-xl border border-[var(--border-main)]/40 bg-[var(--bg-app)]/30 p-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
                                    <span className="font-black uppercase tracking-wider text-[9px] text-purple-400">Consecuencias previstas</span>
                                    <p className="mt-1 whitespace-pre-wrap">{suggestion.consequences}</p>
                                </div>
                            )}
                            {actionState && (
                                <div
                                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold ${
                                        actionState.status === 'error'
                                            ? 'border-rose-500/25 bg-rose-500/10 text-rose-500'
                                            : actionState.status === 'sending'
                                                ? 'border-purple-500/25 bg-purple-500/10 text-purple-500'
                                                : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500'
                                    }`}
                                    role="status"
                                    aria-live="polite"
                                >
                                    {actionState.status === 'sending' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                    <span>
                                        {actionState.status === 'sending'
                                            ? `Enviando: ${actionLabels[actionState.action]}…`
                                            : actionState.status === 'error'
                                                ? 'No se pudo enviar la solicitud. Inténtalo de nuevo.'
                                                : `Solicitud enviada: ${actionLabels[actionState.action]}. Revisa el chat.`}
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                                <button disabled={isSending} onClick={() => handleSuggestionAction({ ...suggestion, idea: currentIdea }, 'develop')} className="rounded-lg bg-purple-500 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white hover:bg-purple-600 disabled:cursor-wait disabled:opacity-50">Desarrollar</button>
                                <button disabled={isSending} onClick={() => handleSuggestionAction({ ...suggestion, idea: currentIdea }, 'analyze')} className="rounded-lg border border-indigo-500/25 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-indigo-500 hover:bg-indigo-500/10 disabled:cursor-wait disabled:opacity-50">Analizar impacto</button>
                                <button disabled={isSending} onClick={() => handleSuggestionAction({ ...suggestion, idea: currentIdea }, 'prepare')} className="rounded-lg border border-emerald-500/25 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-emerald-500 hover:bg-emerald-500/10 disabled:cursor-wait disabled:opacity-50">Preparar cambios</button>
                                <button disabled={isSending} onClick={() => handleSuggestionAction({ ...suggestion, idea: currentIdea }, 'variant')} className="rounded-lg border border-amber-500/25 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-amber-500 hover:bg-amber-500/10 disabled:cursor-wait disabled:opacity-50">Otra variante</button>
                                <button disabled={isSending} onClick={() => setHidden(prev => ({ ...prev, [suggestion.id]: true }))} className="rounded-lg border border-[var(--border-main)] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] disabled:cursor-wait disabled:opacity-50">Descartar</button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

/**
 * Renders an interactive view for inconsistency and plot-hole cards inside the chat message.
 */
const InconsistencyCardsView = ({ message, onResolveInconsistency, onReopenInconsistency, chapters, worldItems, characters, isModal = false }) => {
    const inconsistencies = useMemo(() => {
        if (message.inconsistencies) return message.inconsistencies;
        return parseInconsistenciesFromResponse(message.rawResponse || message.content) || [];
    }, [message.inconsistencies, message.rawResponse, message.content]);

    // Estado local para almacenar las selecciones de cada tarjeta
    // { [incId]: { selectedOption: 'A' | 'B' | null, customText: '', isResolving: false } }
    const [cardStates, setCardStates] = useState(() => {
        const initial = {};
        inconsistencies.forEach(inc => {
            initial[inc.id] = {
                selectedOption: inc.selectedOption || null,
                customText: inc.customText || '',
                showCustom: inc.selectedOption === 'CUSTOM',
                isResolving: false
            };
        });
        return initial;
    });
    const [isOpen, setIsOpen] = useState(false);

    // Sincronizar estado si las inconsistencias cambian
    useEffect(() => {
        setCardStates(prev => {
            const next = { ...prev };
            inconsistencies.forEach(inc => {
                if (!next[inc.id]) {
                    next[inc.id] = {
                        selectedOption: inc.selectedOption || null,
                        customText: inc.customText || '',
                        showCustom: inc.selectedOption === 'CUSTOM',
                        isResolving: false
                    };
                } else {
                    next[inc.id] = {
                        ...next[inc.id],
                        selectedOption: inc.selectedOption !== undefined && inc.selectedOption !== null ? inc.selectedOption : next[inc.id].selectedOption,
                        customText: inc.customText !== undefined && inc.customText !== null ? inc.customText : next[inc.id].customText,
                        showCustom: (inc.selectedOption !== undefined && inc.selectedOption !== null ? inc.selectedOption : next[inc.id].selectedOption) === 'CUSTOM',
                    };
                }
            });
            return next;
        });
    }, [inconsistencies]);

    const handleOptionSelect = (incId, optionLetter) => {
        setCardStates(prev => ({
            ...prev,
            [incId]: {
                ...prev[incId],
                selectedOption: optionLetter,
                showCustom: false
            }
        }));
    };

    const handleCustomToggle = (incId) => {
        setCardStates(prev => ({
            ...prev,
            [incId]: {
                ...prev[incId],
                selectedOption: 'CUSTOM',
                showCustom: true
            }
        }));
    };

    const handleCustomTextChange = (incId, text) => {
        setCardStates(prev => ({
            ...prev,
            [incId]: {
                ...prev[incId],
                customText: text
            }
        }));
    };

    const handleResolve = async (incId) => {
        const state = cardStates[incId];
        if (!state) return;

        const inc = inconsistencies.find(i => i.id === incId);
        if (!inc) return;

        let solutionOption = state.selectedOption;
        let solutionText = '';

        if (solutionOption === 'CUSTOM') {
            solutionText = state.customText.trim();
            if (!solutionText) {
                window.dispatchEvent(new CustomEvent('ia-toast', {
                    detail: { message: 'Por favor, describe tu solución personalizada.', type: 'warning' }
                }));
                return;
            }
        } else if (solutionOption) {
            const opt = inc.options.find(o => o.letter === solutionOption);
            solutionText = opt ? opt.text : '';
        } else {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Selecciona una solución para procesar el cambio.', type: 'warning' }
            }));
            return;
        }

        // Marcar temporalmente como resolviendo en la UI local
        setCardStates(prev => ({
            ...prev,
            [incId]: {
                ...prev[incId],
                isResolving: true
            }
        }));

        try {
            if (onResolveInconsistency) {
                await onResolveInconsistency(message.id, incId, solutionOption, solutionText);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setCardStates(prev => ({
                ...prev,
                [incId]: {
                    ...prev[incId],
                    isResolving: false
                }
            }));
        }
    };

    if (!isModal && inconsistencies.length > 0) {
        const pendingCount = inconsistencies.filter(item => !item.resolved).length;
        return (
            <>
                <button onClick={() => setIsOpen(true)} className="flex w-full items-center justify-between rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-left hover:bg-amber-500/[0.1]">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-500"><AlertTriangle size={15} /> Inconsistencias de lore</span>
                    <span className="rounded-lg bg-amber-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white">Revisar {pendingCount}/{inconsistencies.length}</span>
                </button>
                {isOpen && <ReviewModal title="Revisión de inconsistencias" count={inconsistencies.length} accent="amber" icon={<AlertTriangle size={17} />} onClose={() => setIsOpen(false)}><InconsistencyCardsView message={message} onResolveInconsistency={onResolveInconsistency} onReopenInconsistency={onReopenInconsistency} chapters={chapters} worldItems={worldItems} characters={characters} isModal /></ReviewModal>}
            </>
        );
    }

    if (inconsistencies.length === 0) {
        return (
            <div className="p-4 border border-[var(--border-main)] rounded-2xl bg-amber-500/5 text-amber-500 flex items-center gap-2 text-xs">
                <AlertTriangle size={14} />
                <span>No se pudieron estructurar las inconsistencias. Revisa la respuesta en texto plano.</span>
            </div>
        );
    }

    return (
        <div className="space-y-4 my-2 max-w-full">
            <div className="flex items-center gap-2 mb-1 px-1">
                <AlertTriangle size={14} className="text-amber-500 animate-pulse shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                    Se detectaron {inconsistencies.length} inconsistencias de lore
                </span>
            </div>

            {inconsistencies.map(inc => {
                const state = cardStates[inc.id] || { selectedOption: null, customText: '', showCustom: false, isResolving: false };
                const isResolved = inc.resolved;
                const wasResolved = inc.wasResolved;
                const labelList = (inc.files || []).map(fId => getDocumentDisplayLabel(fId, chapters, worldItems, characters)).join(' y ');

                return (
                    <div
                        key={inc.id}
                        className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
                            isResolved
                                ? 'border-emerald-500/30 bg-emerald-500/[0.02] shadow-sm shadow-emerald-500/[0.02]'
                                : wasResolved
                                    ? 'border-amber-500/40 bg-amber-500/[0.02] hover:border-amber-500/60'
                                    : 'border-[var(--border-main)] bg-[var(--bg-editor)]/40 hover:border-amber-500/20'
                        }`}
                    >
                        {/* Card Header */}
                        <div className={`px-4 py-3 border-b flex items-start justify-between gap-3 ${
                            isResolved ? 'border-emerald-500/10 bg-emerald-500/[0.04]' : wasResolved ? 'border-amber-500/10 bg-amber-500/[0.04]' : 'border-[var(--border-main)]/40 bg-[var(--accent-soft)]/10'
                        }`}>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                        isResolved ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'
                                    }`}>
                                        {isResolved ? 'Resuelto' : 'Pendiente'}
                                    </span>
                                    {wasResolved && !isResolved && (
                                        <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 flex items-center gap-1">
                                            <RotateCcw size={8} strokeWidth={3} />
                                            Reabierta
                                        </span>
                                    )}
                                    {(inc.files || []).map((fId, idx) => (
                                        <span key={`${fId}-${idx}`} className="text-[8px] font-bold bg-[var(--border-main)]/40 text-[var(--text-muted)] px-1.5 py-0.5 rounded">
                                            📁 {getDocumentDisplayLabel(fId, chapters, worldItems, characters)}
                                        </span>
                                    ))}
                                </div>
                                <h4 className={`text-xs font-bold leading-snug ${isResolved ? 'text-emerald-500' : wasResolved ? 'text-amber-400' : 'text-[var(--text-main)]'}`}>
                                    {inc.title}
                                </h4>
                            </div>
                            
                            {isResolved && (
                                <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                    <CheckCircle2 size={11} className="text-emerald-500" strokeWidth={3} />
                                </div>
                            )}
                        </div>

                        {/* Card Body */}
                        <div className="p-4 space-y-3.5">
                            <p className="text-xs text-[var(--text-muted)] leading-relaxed bg-[var(--bg-app)]/40 p-3 rounded-xl border border-[var(--border-main)]/20">
                                {inc.problem}
                            </p>

                            {!isResolved ? (
                                <div className="space-y-2.5">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-60">
                                        Selecciona una solución para aplicar:
                                    </p>
                                    
                                    <div className="space-y-2">
                                        {inc.options.map(opt => {
                                            const isSelected = state.selectedOption === opt.letter;
                                            return (
                                                <button
                                                    key={opt.letter}
                                                    onClick={() => handleOptionSelect(inc.id, opt.letter)}
                                                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs leading-relaxed transition-all duration-200 hover:bg-[var(--accent-soft)]/20 flex items-start ${
                                                        isSelected
                                                            ? 'border-amber-500 bg-amber-500/[0.03] text-[var(--text-main)] font-semibold'
                                                            : 'border-[var(--border-main)]/60 text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-app)]/30'
                                                    }`}
                                                >
                                                    <span className={`inline-block w-4 h-4 rounded-md text-[9px] font-black uppercase flex items-center justify-center mr-2 shrink-0 ${
                                                        isSelected ? 'bg-amber-500 text-white' : 'bg-[var(--border-main)]/60 text-[var(--text-muted)]'
                                                    }`}>
                                                        {opt.letter}
                                                    </span>
                                                    <span className="flex-1">{opt.text}</span>
                                                </button>
                                            );
                                        })}

                                        {/* Custom option */}
                                        <button
                                            onClick={() => handleCustomToggle(inc.id)}
                                            className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs leading-relaxed transition-all duration-200 hover:bg-[var(--accent-soft)]/20 flex items-center ${
                                                state.selectedOption === 'CUSTOM'
                                                    ? 'border-amber-500 bg-amber-500/[0.03] text-[var(--text-main)] font-semibold'
                                                    : 'border-[var(--border-main)]/60 text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-app)]/30'
                                            }`}
                                        >
                                            <span className={`inline-block w-4 h-4 rounded-md text-[9px] font-black flex items-center justify-center mr-2 shrink-0 ${
                                                state.selectedOption === 'CUSTOM' ? 'bg-amber-500 text-white' : 'bg-[var(--border-main)]/60 text-[var(--text-muted)]'
                                            }`}>
                                                ✍️
                                            </span>
                                            <span className="flex-1">Proponer solución propia personalizada...</span>
                                        </button>

                                        {state.showCustom && (
                                            <textarea
                                                value={state.customText}
                                                onChange={(e) => handleCustomTextChange(inc.id, e.target.value)}
                                                placeholder="Escribe aquí tu solución de lore detallada..."
                                                className="w-full h-20 text-xs px-3 py-2.5 rounded-xl bg-[var(--bg-editor)] border border-amber-500/40 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none text-[var(--text-main)] placeholder-[var(--text-muted)]/50 resize-none leading-relaxed transition-all"
                                            />
                                        )}
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex gap-2 w-full">
                                        <button
                                            onClick={() => handleResolve(inc.id)}
                                            disabled={!state.selectedOption || state.isResolving}
                                            className="flex-1 py-2.5 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest text-white bg-amber-500 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-amber-500/10 flex items-center justify-center gap-2"
                                        >
                                            {state.isResolving ? (
                                                <>
                                                    <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
                                                    <span>Procesando...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Wrench size={11} className="shrink-0" />
                                                    <span>Procesar con IA</span>
                                                </>
                                            )}
                                        </button>

                                        <button
                                            onClick={async () => {
                                                if (onResolveInconsistency) {
                                                    await onResolveInconsistency(message.id, inc.id, 'OMIT', 'Omitido / Ignorado por el escritor');
                                                }
                                            }}
                                            disabled={state.isResolving}
                                            className="px-4 py-2.5 rounded-xl border border-[var(--border-main)] hover:bg-rose-500/10 hover:border-rose-500/30 text-rose-500 hover:text-rose-600 disabled:opacity-40 disabled:pointer-events-none text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                                            title="Omitir e ignorar esta inconsistencia"
                                        >
                                            <span>Omitir</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className={`${inc.selectedOption === 'OMIT' ? 'bg-amber-500/[0.03] border-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/[0.03] border-emerald-500/10 text-emerald-600 dark:text-emerald-400'} border rounded-xl p-3 text-xs leading-relaxed`}>
                                        <p className={`font-bold flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${inc.selectedOption === 'OMIT' ? 'text-amber-500' : 'text-emerald-500'} mb-1`}>
                                            {inc.selectedOption === 'OMIT' ? (
                                                <>
                                                    <AlertTriangle size={10} className="shrink-0" />
                                                    Inconsistencia Omitida:
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 size={10} className="shrink-0" />
                                                    Solución Aplicada a {labelList}:
                                                </>
                                            )}
                                        </p>
                                        <p className="italic">
                                            {inc.selectedOption === 'OMIT' ? 'Esta alerta de lore ha sido omitida e ignorada por el escritor.' : (inc.selectedOption === 'CUSTOM' ? inc.customText : (inc.options.find(o => o.letter === inc.selectedOption)?.text || 'Aplicado'))}
                                        </p>
                                    </div>
                                    {/* Reopen button */}
                                    <button
                                        onClick={() => onReopenInconsistency && onReopenInconsistency(message.id, inc.id)}
                                        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] hover:bg-indigo-500/10 hover:border-indigo-500/40 text-indigo-400 hover:text-indigo-300 text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.98] duration-200"
                                        title="Volver a poner como pendiente"
                                    >
                                        <RotateCcw size={10} strokeWidth={3} />
                                        <span>Reabrir como pendiente</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

/**
 * Renders the content of an assistant message based on its responseType.
 *
 * - 'content'    → green preview pill (HTML generated, use diff to review)
 * - 'analysis'   → plain text rendered natively
 * - 'suggestion' → plain text rendered natively
 * - 'error'      → plain text red message
 * - default      → whitespace-pre-wrap (streaming / unknown)
 */
const MessageContent = ({ message, content, responseType: rawResponseType, isStreaming, onResolveInconsistency, onReopenInconsistency, onSuggestionAction, chapters, worldItems, characters }) => {
    const responseType = useMemo(() => {
        if (rawResponseType === 'analysis' && content && (content.includes('<inconsistencia') || content.includes('<inconsistencias') || content.includes('[[inconsistencia'))) {
            return 'inconsistencies';
        }
        return rawResponseType;
    }, [rawResponseType, content]);

    // === Completed format result card ===
    if (!isStreaming && responseType === 'format') {
        return (
            <div className="space-y-3 p-4 rounded-2xl border-2 border-violet-500/25 bg-gradient-to-br from-violet-500/[0.06] to-purple-600/[0.04] shadow-[0_0_18px_rgba(139,92,246,0.08)] min-w-[240px] sm:min-w-[320px] max-w-full">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
                        <span className="text-sm">✨</span>
                    </div>
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-violet-400">Formateo completado</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Espaciado y saltos de línea optimizados</p>
                    </div>
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {content?.replace(/\*\*/g, '').replace(/✨/g, '').replace(/^\s*—\s*/gm, '→ ').trim()}
                </div>
            </div>
        );
    }

    // Skeleton while waiting for first chunk
    if (isStreaming && !content) {
        return (
            <div className="space-y-3 p-3.5 rounded-2xl border-2 border-indigo-500/20 bg-indigo-500/[0.03] min-w-[240px] sm:min-w-[320px] shadow-[0_0_14px_rgba(99,102,241,0.06)]">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-indigo-400">
                    <Loader2 size={14} className="animate-spin shrink-0" />
                    <span>{message.processingStage || 'La IA está analizando tu solicitud…'}</span>
                </div>
                <div className="h-3 w-11/12 rounded bg-gradient-to-r from-[var(--border-main)] via-[var(--accent-soft)] to-[var(--border-main)] bg-[length:200%_100%] animate-shimmer" />
                <div className="h-3 w-4/5 rounded bg-gradient-to-r from-[var(--border-main)] via-[var(--accent-soft)] to-[var(--border-main)] bg-[length:200%_100%] animate-shimmer" style={{ animationDelay: '0.15s' }} />
                <div className="h-3 w-2/3 rounded bg-gradient-to-r from-[var(--border-main)] via-[var(--accent-soft)] to-[var(--border-main)] bg-[length:200%_100%] animate-shimmer" style={{ animationDelay: '0.3s' }} />
            </div>
        );
    }

    // Streaming in progress — show raw text + cursor or premium interactive skeletons for tool calls
    if (isStreaming) {
        const isChapter = content.includes('🆕');
        const isPatch = content.includes('✂️');
        const isInconsistency = content.includes('⚠️');

        const isFormat = rawResponseType === 'format' || content.includes('Formateando');

        if (isChapter || isPatch || isInconsistency || isFormat) {
            return (
                <div className={`space-y-3 p-3.5 rounded-2xl animate-pulse min-w-[240px] sm:min-w-[320px] max-w-full border-2 overflow-hidden ${
                    isFormat
                        ? 'border-violet-500/20 bg-violet-500/[0.03] shadow-[0_0_12px_rgba(139,92,246,0.07)]'
                        : 'border-indigo-500/20 bg-indigo-500/[0.02] shadow-[0_0_12px_rgba(99,102,241,0.05)]'
                }`}>
                    <div className="flex items-center gap-2 text-xs font-bold">
                        {isChapter && <FileText size={14} className="animate-spin text-emerald-400 shrink-0" style={{ animationDuration: '3s' }} />}
                        {isPatch && <FileDiff size={14} className="animate-bounce text-indigo-400 shrink-0" />}
                        {isInconsistency && <AlertTriangle size={14} className="animate-pulse text-amber-400 shrink-0" />}
                        {isFormat && <span className="text-base shrink-0" style={{ lineHeight: 1 }}>✨</span>}
                        <span className={`text-[10px] font-black uppercase tracking-wider ${
                            isFormat ? 'text-violet-400' : 'text-indigo-400'
                        }`}>
                            {isChapter && 'Generando Nuevo Capítulo...'}
                            {isPatch && 'Redactando Parche Quirúrgico...'}
                            {isInconsistency && 'Analizando Lore y Conflictos...'}
                            {isFormat && 'Optimizando formato y espaciado...'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-[var(--text-muted)] -mt-1">
                        <Loader2 size={11} className="animate-spin text-indigo-400 shrink-0" />
                        <span>{message.processingStage || 'Procesando con la IA…'}</span>
                    </div>

                    <div className="space-y-2 pt-1">
                        <div className={`h-3 w-11/12 rounded bg-gradient-to-r bg-[length:200%_100%] animate-shimmer ${
                            isFormat
                                ? 'from-[var(--border-main)] via-violet-500/20 to-[var(--border-main)]'
                                : 'from-[var(--border-main)] via-[var(--accent-soft)] to-[var(--border-main)]'
                        }`} />
                        <div className={`h-3 w-4/5 rounded bg-gradient-to-r bg-[length:200%_100%] animate-shimmer ${
                            isFormat
                                ? 'from-[var(--border-main)] via-violet-500/20 to-[var(--border-main)]'
                                : 'from-[var(--border-main)] via-[var(--accent-soft)] to-[var(--border-main)]'
                        }`} style={{ animationDelay: '0.15s' }} />
                    </div>

                    {!isFormat && (
                        <div className="text-[10px] font-mono text-[var(--text-muted)] opacity-60 bg-[var(--bg-app)]/40 p-2.5 rounded-xl border border-[var(--border-main)]/20 leading-relaxed max-w-full whitespace-pre-wrap break-words">
                            {content}
                        </div>
                    )}
                    {isFormat && (
                        <div className="text-[10px] text-violet-400/60 flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                            <span className="ml-1">Procesando estructura del documento</span>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div>
                <span className="whitespace-pre-wrap">{content}</span>
                <span className="inline-block w-2 h-4 bg-[var(--accent-main)] ml-0.5 animate-pulse" />
            </div>
        );
    }

    // Content response — show a clean "document ready" indicator
    if (responseType === 'content') {
        return (
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={14} className="text-emerald-500" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-[var(--text-main)] leading-snug">
                        Contenido generado
                    </p>
                    {content && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed line-clamp-3 opacity-70">
                            {content}
                        </p>
                    )}
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mt-2 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Haz clic en "Ver Cambios" para revisar y aplicar
                    </p>
                </div>
            </div>
        );
    }

    // Patch response — show a fragment ready indicator
    if (responseType === 'patch') {
        return (
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <FileDiff size={14} className="text-indigo-500" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-[var(--text-main)] leading-snug">
                        Fragmento editado
                    </p>
                    {content && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed line-clamp-3 opacity-70">
                            {content}
                        </p>
                    )}
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mt-2 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        Haz clic en "Ver Cambios" para revisar y aplicar
                    </p>
                </div>
            </div>
        );
    }

    // Section response — show a section ready indicator
    if (responseType === 'section') {
        return (
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={14} className="text-sky-500" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-[var(--text-main)] leading-snug">
                        Sección generada
                    </p>
                    {content && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed line-clamp-3 opacity-70">
                            {content}
                        </p>
                    )}
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-500 mt-2 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                        Haz clic en "Ver Cambios" para revisar y aplicar
                    </p>
                </div>
            </div>
        );
    }

    // Scene response — show a scene ready indicator
    if (responseType === 'scene') {
        return (
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
                    <Film size={14} className="text-sky-500" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-[var(--text-main)] leading-snug">
                        Escena generada
                    </p>
                    {content && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed line-clamp-3 opacity-70">
                            {content}
                        </p>
                    )}
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-500 mt-2 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                        Haz clic en "Ver Cambios" para revisar e integrar al manuscrito
                    </p>
                </div>
            </div>
        );
    }

    if (responseType === 'suggestion' && !isStreaming) {
        return <SuggestionCardsView message={message} onSuggestionAction={onSuggestionAction} />;
    }

    // Analysis — render with plain text
    if (responseType === 'analysis') {
        return (
            <div className="whitespace-pre-wrap text-[var(--text-main)]">
                {content}
            </div>
        );
    }

    // Inconsistencies response — render inconsistency cards
    if (responseType === 'inconsistencies') {
        // Remover todas las etiquetas XML/corchetes de inconsistencia y su contenido para no mostrar el XML crudo
        const cleanExplanationText = (text) => {
            if (!text) return '';
            return text
                .replace(/\[\[inconsistencia[\s\S]*?\[\[\/inconsistencia\]\]/gi, '')
                .replace(/\[\[inconsistencia[^\]]*\]\]([\s\S]*?)\[\[\/inconsistencia\]\]/gi, '')
                .replace(/\[\[titulo\]\][\s\S]*?\[\[\/titulo\]\]/gi, '')
                .replace(/\[\[problema\]\][\s\S]*?\[\[\/problema\]\]/gi, '')
                .replace(/\[\[solucion[^\]]*\]\][\s\S]*?\[\[\/solucion\]\]/gi, '')
                .replace(/<inconsistencia[\s\S]*?<\/inconsistencia>/gi, '')
                .replace(/<inconsistencia[^>]*>([\s\S]*?)<\/inconsistencia>/gi, '')
                .replace(/<titulo>[\s\S]*?<\/titulo>/gi, '')
                .replace(/<problema>[\s\S]*?<\/problema>/gi, '')
                .replace(/<solucion[^>]*>[\s\S]*?<\/solucion>/gi, '')
                .replace(/```xml[\s\S]*?```/gi, '')
                .replace(/```[\s\S]*?```/gi, '')
                .trim();
        };

        const introText = cleanExplanationText(content);

        return (
            <div className="space-y-4">
                {introText && (
                    <div className="whitespace-pre-wrap text-[var(--text-main)] opacity-85 border-b border-[var(--border-main)]/30 pb-3 leading-relaxed">
                        {introText}
                    </div>
                )}
                <InconsistencyCardsView
                    message={message}
                    onResolveInconsistency={onResolveInconsistency}
                    onReopenInconsistency={onReopenInconsistency}
                    chapters={chapters}
                    worldItems={worldItems}
                    characters={characters}
                />
            </div>
        );
    }

    // Error messages — render with plain text
    if (responseType === 'error') {
        return (
            <div className="whitespace-pre-wrap text-rose-500 font-medium">
                {content}
            </div>
        );
    }

    return <div className="whitespace-pre-wrap">{content}</div>;
};

const IAStudioMessage = ({ message, onShowDiff, onRegenerate, onDelete, isLast, onResolveInconsistency, onReopenInconsistency, onSuggestionAction, chapters, worldItems, characters }) => {
    const isUser = message.role === 'user';
    const isStreaming = message.isStreaming;
    const rawResponseType = message.responseType || 'analysis';

    const responseType = useMemo(() => {
        if (rawResponseType === 'analysis' && message.content && (message.content.includes('<inconsistencia') || message.content.includes('<inconsistencias') || message.content.includes('[[inconsistencia'))) {
            return 'inconsistencies';
        }
        return rawResponseType;
    }, [rawResponseType, message.content]);

    const [copied, setCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isExpandable, setIsExpandable] = useState(false);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const contentRef = useRef(null);
    const deleteTimeoutRef = useRef(null);

    // Auto-reset delete confirmation after 3 seconds
    useEffect(() => {
        if (showConfirmDelete) {
            deleteTimeoutRef.current = setTimeout(() => {
                setShowConfirmDelete(false);
            }, 3000);
        } else {
            if (deleteTimeoutRef.current) {
                clearTimeout(deleteTimeoutRef.current);
            }
        }
        return () => {
            if (deleteTimeoutRef.current) {
                clearTimeout(deleteTimeoutRef.current);
            }
        };
    }, [showConfirmDelete]);

    // Determine if this message has applicable content (to show diff button)
    const hasApplicableContent = !isUser && !isStreaming && (responseType === 'content' || responseType === 'patch' || responseType === 'section' || responseType === 'scene' || responseType === 'format');

    // Determine icon for the response type
    const ResponseTypeIcon = useMemo(() => {
        if (responseType === 'analysis') return Search;
        if (responseType === 'suggestion') return Lightbulb;
        if (responseType === 'scene') return Film;
        if (responseType === 'inconsistencies') return AlertTriangle;
        return Bot;
    }, [responseType]);

    // Measure element scrollHeight to see if it exceeds ~10 lines (240px)
    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            if (!isStreaming && contentRef.current && responseType !== 'inconsistencies') {
                setIsExpandable(contentRef.current.scrollHeight > 240);
            } else {
                setIsExpandable(false);
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [message.content, isStreaming, responseType]);

    const handleCopy = () => {
        if (!message.content) return;
        
        // Strip out HTML tags for a clean plain-text clipboard copy
        const cleanContent = message.content
            .replace(/<[^>]*>/g, '')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/#{1,6}\s/g, '')
            .trim();
            
        navigator.clipboard.writeText(cleanContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${isUser ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
                isUser
                    ? 'bg-[var(--accent-main)] text-white shadow-md'
                    : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md'
            }`}>
                {isUser ? <User size={14} /> : <ResponseTypeIcon size={14} />}
            </div>

            {/* Content */}
            <div className={`flex-1 max-w-[88%] sm:max-w-[80%] ${isUser ? 'text-right' : ''}`}>
                <div className={`inline-block text-left px-4 py-3 rounded-2xl text-sm leading-relaxed relative group transition-all ${
                    isUser && message.isFormatCommand
                        ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-tr-md shadow-lg shadow-violet-900/20'
                        : isUser && message.isDetectCommand
                            ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-tr-md shadow-lg shadow-amber-900/20'
                            : isUser
                                ? 'bg-[var(--accent-main)] text-white rounded-tr-md'
                                : 'bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-tl-md text-[var(--text-main)] pr-10'
                }`}>
                    {/* Format Command Card (user side) */}
                    {isUser && message.isFormatCommand && (
                        <div className="flex items-center gap-2.5 min-w-[180px]">
                            <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                                <span className="text-sm">✨</span>
                            </div>
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wider text-white/90">Formatear documento</p>
                                <p className="text-[10px] text-white/60 mt-0.5 truncate max-w-[180px]" title={message.formatDocTitle}>
                                    {message.formatDocTitle || 'Capítulo activo'}
                                    {message.formatWordCount ? ` · ${message.formatWordCount.toLocaleString()} palabras` : ''}
                                </p>
                            </div>
                        </div>
                    )}
                    {/* Detect Command Card (user side) */}
                    {isUser && message.isDetectCommand && (
                        <div className="flex items-center gap-2.5 min-w-[180px]">
                            <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                                <Search size={13} className="text-white" strokeWidth={3} />
                            </div>
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wider text-white/90">Auditar Lore</p>
                                <p className="text-[10px] text-white/60 mt-0.5 truncate max-w-[180px]">
                                    Detectar Inconsistencias
                                </p>
                            </div>
                        </div>
                    )}
                    {/* Floating Hover Copy Button (desktop) */}
                    {!isUser && !isStreaming && message.content && (responseType === 'analysis' || responseType === 'suggestion') && (
                        <button
                            onClick={handleCopy}
                            className="absolute top-2 right-2 w-6 h-6 rounded-md bg-[var(--bg-app)] border border-[var(--border-main)] flex items-center justify-center text-[var(--text-muted)] hover:text-emerald-500 hover:border-emerald-500/30 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shadow-sm active:scale-90"
                            title="Copiar respuesta"
                        >
                            {copied ? (
                                <Check size={11} className="text-emerald-500 animate-in zoom-in-50 duration-200" strokeWidth={3} />
                            ) : (
                                <Copy size={11} className="transition-transform group-hover:scale-110 duration-200" />
                            )}
                        </button>
                    )}

                    {!(isUser && (message.isFormatCommand || message.isDetectCommand)) && (
                    <div
                        ref={contentRef}
                        style={!isExpanded && isExpandable ? { maxHeight: '240px', overflow: 'hidden' } : {}}
                        className="relative transition-all duration-300"
                    >
                        {message.mode === 'cowriter' && (
                            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-purple-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                Coescritor
                            </div>
                        )}
                        <MessageContent
                            message={message}
                            content={message.content}
                            responseType={responseType}
                            isStreaming={isStreaming}
                            onResolveInconsistency={onResolveInconsistency}
                            onReopenInconsistency={onReopenInconsistency}
                            onSuggestionAction={onSuggestionAction}
                            chapters={chapters}
                            worldItems={worldItems}
                            characters={characters}
                        />

                        {/* Gradient Fade-out Mask */}
                        {!isExpanded && isExpandable && (
                            <div className={`absolute bottom-0 left-0 right-0 h-16 pointer-events-none bg-gradient-to-t ${
                                isUser 
                                    ? 'from-[var(--accent-main)] to-transparent' 
                                    : 'from-[var(--bg-editor)] to-transparent'
                            }`} />
                        )}
                    </div>
                    )}

                    {/* Expand/Collapse Button */}
                    {isExpandable && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={`w-full text-center mt-2.5 pt-2 border-t text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                isUser 
                                    ? 'text-white/80 hover:text-white border-white/10' 
                                    : 'text-indigo-500 hover:text-indigo-600 border-[var(--border-main)]/40'
                            }`}
                        >
                            {isExpanded ? (
                                <>
                                    <span>Contraer</span>
                                    <ChevronUp size={11} strokeWidth={3} />
                                </>
                            ) : (
                                <>
                                    <span>Expandir</span>
                                    <ChevronDown size={11} strokeWidth={3} />
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* Actions for user messages */}
                {isUser && !isStreaming && (
                    <div className="flex items-center justify-end gap-2 mt-1.5 px-1 animate-in fade-in duration-200">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (showConfirmDelete) {
                                    onDelete();
                                    window.dispatchEvent(new CustomEvent('ia-toast', {
                                        detail: { message: '🗑️ Mensaje eliminado.', type: 'success' }
                                    }));
                                } else {
                                    setShowConfirmDelete(true);
                                }
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 duration-200 ${
                                showConfirmDelete
                                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                                    : 'text-rose-500/70 hover:text-rose-500 hover:bg-rose-500/10'
                            }`}
                            title={showConfirmDelete ? "Confirmar eliminación" : "Eliminar mensaje"}
                        >
                            <Trash2 size={12} className={showConfirmDelete ? 'animate-bounce' : ''} />
                            <span>{showConfirmDelete ? '¿Seguro?' : 'Eliminar'}</span>
                        </button>
                    </div>
                )}

                {/* Actions for assistant messages */}
                {!isUser && !isStreaming && message.content && (
                    <div className="flex items-center gap-2 mt-1.5 px-1">
                        {/* Diff Viewer Button — only for content type */}
                        {hasApplicableContent && (
                            <button
                                onClick={() => onShowDiff(message.rawResponse || message.content)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:bg-indigo-500/10 transition-all"
                                title="Ver cambios propuestos"
                            >
                                <FileDiff size={12} />
                                Ver Cambios
                            </button>
                        )}

                        {/* Copy Button — for text-based responses */}
                        {(responseType === 'analysis' || responseType === 'suggestion') && (
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-emerald-500 hover:bg-emerald-500/10 transition-all"
                                title="Copiar texto de respuesta"
                            >
                                {copied ? (
                                    <Check size={12} className="animate-in zoom-in-50 duration-200" strokeWidth={3} />
                                ) : (
                                    <Copy size={12} />
                                )}
                                <span>{copied ? 'Copiado' : 'Copiar'}</span>
                            </button>
                        )}

                        {/* Regenerate Button — last message only */}
                        {isLast && onRegenerate && (
                            <button
                                onClick={onRegenerate}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-purple-500 hover:bg-purple-500/10 transition-all"
                                title="Regenerar última respuesta"
                            >
                                <RotateCw size={12} />
                                <span>Regenerar</span>
                            </button>
                        )}

                        {/* Response Time Badge */}
                        {message.duration && (
                            <span className="text-[9px] font-bold font-mono text-[var(--text-muted)] opacity-50 px-1 py-0.5 select-none" title={`La IA respondió en ${(message.duration / 1000).toFixed(2)} segundos`}>
                                ⏱️ {(message.duration / 1000).toFixed(1)}s
                            </span>
                        )}

                        {/* Delete Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (showConfirmDelete) {
                                    onDelete();
                                    window.dispatchEvent(new CustomEvent('ia-toast', {
                                        detail: { message: '🗑️ Mensaje de IA eliminado.', type: 'success' }
                                    }));
                                } else {
                                    setShowConfirmDelete(true);
                                }
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 duration-200 ml-auto ${
                                showConfirmDelete
                                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                                    : 'text-rose-500/70 hover:text-rose-500 hover:bg-rose-500/10'
                            }`}
                            title={showConfirmDelete ? "Confirmar eliminación" : "Eliminar mensaje"}
                        >
                            <Trash2 size={12} className={showConfirmDelete ? 'animate-bounce' : ''} />
                            <span>{showConfirmDelete ? '¿Seguro?' : 'Eliminar'}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default IAStudioMessage;
