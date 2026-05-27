import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User, Bot, FileDiff, Copy, Check, RotateCw, RotateCcw, FileText, Lightbulb, Search, ChevronDown, ChevronUp, Trash2, Film, AlertTriangle, Wrench, CheckCircle2 } from 'lucide-react';
import { parseInconsistenciesFromResponse, SYSTEM_WORLD_ITEM_LABELS } from './IAStudioUtils';

/**
 * Renders an interactive view for inconsistency and plot-hole cards inside the chat message.
 */
const InconsistencyCardsView = ({ message, onResolveInconsistency, onReopenInconsistency }) => {
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
                const labelList = inc.files.map(fId => {
                    return SYSTEM_WORLD_ITEM_LABELS[fId] || fId;
                }).join(' y ');

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
                                    {inc.files.map(fId => (
                                        <span key={fId} className="text-[8px] font-bold bg-[var(--border-main)]/40 text-[var(--text-muted)] px-1.5 py-0.5 rounded">
                                            📁 {SYSTEM_WORLD_ITEM_LABELS[fId] || fId}
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
const MessageContent = ({ message, content, responseType: rawResponseType, isStreaming, onResolveInconsistency, onReopenInconsistency }) => {
    const responseType = useMemo(() => {
        if (rawResponseType === 'analysis' && content && (content.includes('<inconsistencia') || content.includes('<inconsistencias') || content.includes('[[inconsistencia'))) {
            return 'inconsistencies';
        }
        return rawResponseType;
    }, [rawResponseType, content]);

    // Skeleton while waiting for first chunk
    if (isStreaming && !content) {
        return (
            <div className="space-y-2 py-1 min-w-[200px] sm:min-w-[300px]">
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

        if (isChapter || isPatch || isInconsistency) {
            return (
                <div className="space-y-3 p-3.5 border border-indigo-500/20 bg-indigo-500/[0.02] rounded-2xl animate-pulse min-w-[240px] sm:min-w-[320px] shadow-[0_0_12px_rgba(99,102,241,0.05)] border-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
                        {isChapter && <FileText size={14} className="animate-spin text-emerald-400 shrink-0" style={{ animationDuration: '3s' }} />}
                        {isPatch && <FileDiff size={14} className="animate-bounce text-indigo-400 shrink-0" />}
                        {isInconsistency && <AlertTriangle size={14} className="animate-pulse text-amber-400 shrink-0" />}
                        <span className="text-[10px] font-black uppercase tracking-wider">
                            {isChapter && 'Generando Nuevo Capítulo...'}
                            {isPatch && 'Redactando Parche Quirúrgico...'}
                            {isInconsistency && 'Analizando Lore y Conflictos...'}
                        </span>
                    </div>

                    <div className="space-y-2 pt-1">
                        <div className="h-3 w-11/12 rounded bg-gradient-to-r from-[var(--border-main)] via-[var(--accent-soft)] to-[var(--border-main)] bg-[length:200%_100%] animate-shimmer" />
                        <div className="h-3 w-4/5 rounded bg-gradient-to-r from-[var(--border-main)] via-[var(--accent-soft)] to-[var(--border-main)] bg-[length:200%_100%] animate-shimmer" style={{ animationDelay: '0.15s' }} />
                    </div>

                    <div className="text-[10px] font-mono text-[var(--text-muted)] opacity-60 overflow-hidden text-ellipsis whitespace-nowrap bg-[var(--bg-app)]/40 p-2 rounded-xl border border-[var(--border-main)]/20 leading-none">
                        {content}
                    </div>
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

    // Analysis or suggestion — render with plain text
    if (responseType === 'analysis' || responseType === 'suggestion') {
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

const IAStudioMessage = ({ message, onShowDiff, onRegenerate, onDelete, isLast, onResolveInconsistency, onReopenInconsistency }) => {
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
    const hasApplicableContent = !isUser && !isStreaming && (responseType === 'content' || responseType === 'patch' || responseType === 'section' || responseType === 'scene');

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
        if (!isStreaming && contentRef.current && responseType !== 'inconsistencies') {
            const height = contentRef.current.scrollHeight;
            if (height > 240) {
                setIsExpandable(true);
            } else {
                setIsExpandable(false);
            }
        } else {
            setIsExpandable(false);
        }
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
                    isUser
                        ? 'bg-[var(--accent-main)] text-white rounded-tr-md'
                        : 'bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-tl-md text-[var(--text-main)] pr-10'
                }`}>
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

                    <div
                        ref={contentRef}
                        style={!isExpanded && isExpandable ? { maxHeight: '240px', overflow: 'hidden' } : {}}
                        className="relative transition-all duration-300"
                    >
                        <MessageContent
                            message={message}
                            content={message.content}
                            responseType={responseType}
                            isStreaming={isStreaming}
                            onResolveInconsistency={onResolveInconsistency}
                            onReopenInconsistency={onReopenInconsistency}
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
