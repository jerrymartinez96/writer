import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Check, RotateCcw, FileText, ChevronDown, ChevronUp, Scissors, Layers, GitMerge } from 'lucide-react';
import { cleanText, cleanHtmlToPlainText, computeWordDiff } from './IAStudioUtils';
import DiffMatchPatch from 'diff-match-patch';

// ─── Diff engine ─────────────────────────────────────────────────────────────

const dmp = new DiffMatchPatch();

/**
 * Calcula un diff a nivel de PALABRA entre dos contenidos HTML.
 * Devuelve un array de diffs [op, text] donde las diferencias son por palabra completa.
 * Esto evita fragmentación como 'elf' → 'human' y muestra 'elfos' → 'humanos'.
 */
const computeParagraphDiff = (htmlA, htmlB) => {
    const textA = cleanHtmlToPlainText(htmlA || '');
    const textB = cleanHtmlToPlainText(htmlB || '');

    return computeWordDiff(textA, textB);
};

/**
 * Calcula un diff de texto completo y devuelve bloques para renderizar con highlighting.
 */
const computeInlineDiff = (textA, textB) => {
    const diffs = dmp.diff_main(textA || '', textB || '');
    dmp.diff_cleanupSemantic(diffs);
    return diffs;
};

// ─── Componente de diff inline ────────────────────────────────────────────────

const InlineDiffView = ({ oldText, newText }) => {
    const diffs = useMemo(() => computeInlineDiff(oldText, newText), [oldText, newText]);

    const hasChanges = diffs.some(([op]) => op !== 0);

    if (!hasChanges) {
        return (
            <p className="text-[var(--text-muted)] opacity-50 italic text-sm">
                Sin cambios en este bloque
            </p>
        );
    }

    return (
        <div className="text-sm leading-relaxed font-mono whitespace-pre-wrap break-words">
            {diffs.map(([op, text], i) => {
                if (op === 0) {
                    return <span key={i} className="text-[var(--text-main)] opacity-70">{text}</span>;
                }
                if (op === -1) {
                    return (
                        <span key={i} className="bg-red-500/20 text-red-400 line-through decoration-red-500/60 px-0.5 rounded">
                            {text}
                        </span>
                    );
                }
                if (op === 1) {
                    return (
                        <span key={i} className="bg-emerald-500/20 text-emerald-400 px-0.5 rounded">
                            {text}
                        </span>
                    );
                }
                return null;
            })}
        </div>
    );
};

// ─── Vista de párrafos con cherry-pick ───────────────────────────────────────

const SemanticDiffView = ({ currentContent, proposedContent, onCherryPickChange }) => {
    const currentText = cleanHtmlToPlainText(currentContent || '');
    const proposedText = cleanHtmlToPlainText(proposedContent || '');

    const diffs = useMemo(() => computeParagraphDiff(currentText, proposedText), [currentText, proposedText]);

    // Build paragraph-level change groups with smart grouping
    const paragraphGroups = useMemo(() => {
        const rawGroups = [];
        let currentGroup = null;
        let groupCounter = 0;

        diffs.forEach(([op, text]) => {
            if (op === 0) {
                // Equal — split by paragraphs to preserve boundaries
                const paragraphs = text.split('\n\n');
                paragraphs.forEach((pText, pIdx) => {
                    let prefix = '';
                    if (pIdx > 0) {
                        prefix = '\n\n';
                    }

                    if (pText || prefix) {
                        rawGroups.push({
                            type: 'equal',
                            text: prefix + pText,
                            id: `eq-${groupCounter++}`
                        });
                    }
                });
                currentGroup = null;
            } else {
                // Changed (delete or insert) — group consecutive changes
                // NO hacemos trim() aquí para no perder espacios significativos
                if (!text) return;

                if (currentGroup && currentGroup.type === 'changed') {
                    if (op === -1) currentGroup.oldText += text;
                    if (op === 1) currentGroup.newText += text;
                } else {
                    currentGroup = {
                        type: 'changed',
                        id: `chg-${groupCounter++}`,
                        oldText: op === -1 ? text : '',
                        newText: op === 1 ? text : '',
                        selected: true,
                    };
                    rawGroups.push(currentGroup);
                }
            }
        });

        // Post-procesamiento: absorber bloques "equal" pequeños (<15 chars)
        // que estén entre dos bloques "changed", uniéndolos en un solo cambio.
        // Esto evita fragmentación como: CAMBIO[2→6] + equal[". "] + CAMBIO[texto]
        const groups = [];
        for (let i = 0; i < rawGroups.length; i++) {
            const g = rawGroups[i];

            if (
                g.type === 'equal' &&
                g.text.trim().length < 15 &&
                i > 0 && i < rawGroups.length - 1 &&
                groups.length > 0 &&
                groups[groups.length - 1].type === 'changed' &&
                rawGroups[i + 1].type === 'changed'
            ) {
                // Absorber este equal pequeño: agregar su texto a ambos lados del grupo changed anterior
                const prevChanged = groups[groups.length - 1];
                const nextChanged = rawGroups[i + 1];

                prevChanged.oldText += g.text + nextChanged.oldText;
                prevChanged.newText += g.text + nextChanged.newText;
                i++; // saltar el nextChanged ya que lo absorbimos
            } else {
                groups.push(g);
            }
        }

        return groups;
    }, [diffs]);

    const [selectedIds, setSelectedIds] = useState(() =>
        new Set(paragraphGroups.filter(g => g.type === 'changed').map(g => g.id))
    );
    const [collapsedEqual, setCollapsedEqual] = useState(new Set());

    useEffect(() => {
        setSelectedIds(new Set(paragraphGroups.filter(g => g.type === 'changed').map(g => g.id)));
    }, [paragraphGroups]);

    useEffect(() => {
        if (onCherryPickChange) {
            onCherryPickChange(selectedIds, paragraphGroups);
        }
    }, [selectedIds, paragraphGroups, onCherryPickChange]);

    const toggleChange = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const changedCount = paragraphGroups.filter(g => g.type === 'changed').length;
    const selectedCount = selectedIds.size;

    if (changedCount === 0) {
        return (
            <div className="flex items-center justify-center h-32 text-[var(--text-muted)] opacity-50 text-sm italic">
                Sin diferencias detectadas
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Cherry-pick header */}
            <div className="flex items-center justify-between px-1 mb-3">
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    <GitMerge size={10} className="text-indigo-500" />
                    <span>{selectedCount} de {changedCount} cambios seleccionados</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setSelectedIds(new Set(paragraphGroups.filter(g => g.type === 'changed').map(g => g.id)))}
                        className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all"
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                    >
                        Ninguno
                    </button>
                </div>
            </div>

            {paragraphGroups.map((group, idx) => {
                if (group.type === 'equal') {
                    const isCollapsed = collapsedEqual.has(group.id);
                    const cleanText = group.text.trim();
                    const preview = cleanText.substring(0, 80) + (cleanText.length > 80 ? '...' : '');
                    return (
                        <div key={group.id}
                            className="rounded-xl border border-[var(--border-main)]/30 overflow-hidden"
                        >
                            <button
                                onClick={() => setCollapsedEqual(prev => {
                                    const next = new Set(prev);
                                    if (next.has(group.id)) next.delete(group.id);
                                    else next.add(group.id);
                                    return next;
                                })}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/20 transition-all text-left"
                            >
                                {isCollapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
                                <span className="text-[9px] font-medium opacity-50 italic flex-1 truncate">
                                    {isCollapsed ? preview : '▲ Ocultar sección sin cambios'}
                                </span>
                                <span className="text-[8px] opacity-30 shrink-0">sin cambios</span>
                            </button>
                            {!isCollapsed && (
                                <div className="px-4 pb-3 text-xs text-[var(--text-muted)] opacity-60 leading-relaxed whitespace-pre-wrap">
                                    {cleanText}
                                </div>
                            )}
                        </div>
                    );
                }

                // Changed block
                const isSelected = selectedIds.has(group.id);
                return (
                    <div key={group.id}
                        className={`rounded-xl border-2 overflow-hidden transition-all duration-200 ${isSelected
                            ? 'border-emerald-500/40 bg-emerald-500/[0.03]'
                            : 'border-[var(--border-main)]/30 opacity-50'
                        }`}
                    >
                        {/* Change block header */}
                        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-main)]/20">
                            <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-500' : 'bg-[var(--border-main)]'}`} />
                                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                    Cambio {idx + 1}
                                </span>
                            </div>
                            <button
                                onClick={() => toggleChange(group.id)}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${isSelected
                                    ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                                    : 'bg-[var(--accent-soft)] text-[var(--text-muted)] hover:bg-emerald-500/10 hover:text-emerald-500'
                                }`}
                            >
                                <Check size={8} strokeWidth={3} />
                                {isSelected ? 'Aplicar' : 'Omitir'}
                            </button>
                        </div>

                        {/* Old text */}
                        {group.oldText.trim() && (
                            <div className="px-4 py-2.5 border-b border-[var(--border-main)]/10 bg-red-500/5">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                    <span className="text-[8px] font-black uppercase tracking-widest text-red-500">Eliminar</span>
                                </div>
                                <p className="text-xs text-red-400/80 line-through decoration-red-500/40 leading-relaxed">
                                    {group.oldText.trim()}
                                </p>
                            </div>
                        )}

                        {/* New text */}
                        {group.newText.trim() && (
                            <div className="px-4 py-2.5 bg-emerald-500/5">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500">Agregar</span>
                                </div>
                                <p className="text-xs text-emerald-400/90 leading-relaxed">
                                    {group.newText.trim()}
                                </p>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── Vista de patch (fragmento) ───────────────────────────────────────────────

const PatchDiffView = ({ original, proposedContent, context }) => {
    const oldText = original || '';
    const newText = cleanText(proposedContent || '');

    return (
        <div className="space-y-4">
            {/* Context info */}
            {context && (
                <div className="px-4 py-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-1">Descripción del cambio</p>
                    <p className="text-xs text-[var(--text-main)] leading-relaxed">{context}</p>
                </div>
            )}

            {/* Inline diff */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-red-500">Fragmento original</span>
                    </div>
                    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-sm text-[var(--text-main)] leading-relaxed min-h-[80px]">
                        {oldText || <span className="italic opacity-40">(vacío)</span>}
                    </div>
                </div>
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Fragmento modificado</span>
                    </div>
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-sm text-[var(--text-main)] leading-relaxed min-h-[80px]">
                        {newText || <span className="italic opacity-40">(vacío)</span>}
                    </div>
                </div>
            </div>

            {/* Inline diff highlight */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Diferencias resaltadas</span>
                </div>
                <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl p-4 overflow-x-auto">
                    <InlineDiffView oldText={oldText} newText={newText} />
                </div>
            </div>
        </div>
    );
};

// ─── Vista de secciones acumuladas ────────────────────────────────────────────

const SectionAccumulatorView = ({ blocks, accumulatedSections }) => {
    const sections = accumulatedSections && accumulatedSections.length > 0
        ? accumulatedSections
        : blocks.filter(b => b.isSection);

    const totalExpected = blocks[0]?.totalSections || sections.length;
    const completedCount = sections.length;
    const progress = Math.round((completedCount / totalExpected) * 100);

    return (
        <div className="space-y-4">
            {/* Progress bar */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Layers size={12} className="text-indigo-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">
                            Progreso de escritura
                        </span>
                    </div>
                    <span className="text-[9px] font-black text-indigo-500">{completedCount}/{totalExpected} secciones</span>
                </div>
                <div className="w-full bg-[var(--border-main)]/20 rounded-full h-1.5">
                    <div
                        className="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Section list */}
            <div className="space-y-3">
                {sections.map((section, idx) => {
                    const wordCount = cleanText(section.html || section.proposedContent || '').split(/\s+/).filter(Boolean).length;
                    return (
                        <div key={section.sectionIndex || idx}
                            className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] overflow-hidden"
                        >
                            <div className="flex items-center gap-3 px-4 py-3">
                                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                    <span className="text-[9px] font-black text-emerald-500">{section.sectionIndex || idx + 1}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-[var(--text-main)] truncate">
                                        {section.title || `Sección ${section.sectionIndex || idx + 1}`}
                                    </p>
                                    <p className="text-[9px] text-[var(--text-muted)] opacity-60">{wordCount} palabras</p>
                                </div>
                                <Check size={12} className="text-emerald-500 shrink-0" />
                            </div>
                        </div>
                    );
                })}

                {/* Pending sections */}
                {Array.from({ length: totalExpected - completedCount }, (_, i) => (
                    <div key={`pending-${i}`}
                        className="rounded-xl border border-[var(--border-main)]/30 bg-[var(--accent-soft)]/10 overflow-hidden opacity-40"
                    >
                        <div className="flex items-center gap-3 px-4 py-3">
                            <div className="w-6 h-6 rounded-lg bg-[var(--border-main)]/20 flex items-center justify-center shrink-0">
                                <span className="text-[9px] font-black text-[var(--text-muted)]">{completedCount + i + 1}</span>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] italic">Pendiente de generar</p>
                        </div>
                    </div>
                ))}
            </div>

            {completedCount < totalExpected && (
                <p className="text-[10px] text-[var(--text-muted)] opacity-60 text-center italic">
                    Genera las secciones restantes antes de aplicar, o aplica las actuales.
                </p>
            )}
        </div>
    );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const IAStudioDiff = ({ diffBlocks = [], onApply, onClose, onRegenerate, destinationTitle, accumulatedSections = [] }) => {
    const [activeIndex, setActiveIndex] = useState(0);

    // Adjust state when props change during render to avoid cascading renders and ESLint errors
    const [prevDiffBlocks, setPrevDiffBlocks] = useState(diffBlocks);
    const [localBlocks, setLocalBlocks] = useState(() => {
        if (Array.isArray(diffBlocks) && diffBlocks.length > 0) {
            return diffBlocks.map(b => ({ ...b }));
        }
        return [
            { currentContent: '', proposedContent: '', title: destinationTitle || 'Documento' }
        ];
    });

    if (diffBlocks !== prevDiffBlocks) {
        setPrevDiffBlocks(diffBlocks);
        setLocalBlocks(Array.isArray(diffBlocks) && diffBlocks.length > 0 ? diffBlocks.map(b => ({ ...b })) : [
            { currentContent: '', proposedContent: '', title: destinationTitle || 'Documento' }
        ]);
    }

    const [viewMode, setViewMode] = useState('sidebyside'); // 'semantic' | 'sidebyside'
    const [cherryPickState, setCherryPickState] = useState({ selectedIds: null, groups: null });

    // Memorize cherry-pick callback to avoid React infinite update loop
    const handleCherryPickChange = useCallback((selectedIds, groups) => {
        setCherryPickState({ selectedIds, groups });
    }, []);

    // Close on escape
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const blocks = localBlocks.length > 0 ? localBlocks : [
        { currentContent: '', proposedContent: '', title: destinationTitle || 'Documento' }
    ];

    const currentBlock = blocks[activeIndex] || blocks[0];
    const isPatchMode = currentBlock.isPatch;
    const isSectionMode = currentBlock.isSection || (accumulatedSections.length > 0);

    // Word count stats
    const currentWords = cleanText(currentBlock.currentContent || '').split(/\s+/).filter(Boolean).length;
    const proposedWords = cleanText(currentBlock.proposedContent || '').split(/\s+/).filter(Boolean).length;
    const wordDiff = proposedWords - currentWords;

    const handleProposedBlur = (e) => {
        const newHtml = e.currentTarget.innerHTML;
        setLocalBlocks(prev => prev.map((b, idx) =>
            idx === activeIndex ? { ...b, proposedContent: newHtml } : b
        ));
    };

    const handleApply = () => {
        console.log("[AUDIT 5] handleApply ejecutado en IAStudioDiff. viewMode actual:", viewMode);
        // Only reconstruct cherry-picked content if in 'semantic' view
        if (viewMode === 'semantic' && cherryPickState.selectedIds && cherryPickState.groups && !isPatchMode && !isSectionMode) {
            console.log("[AUDIT 5.1] Cherry-pick activo. IDs seleccionados:", Array.from(cherryPickState.selectedIds));
            // Reconstruct proposed content using only selected changes
            const { selectedIds, groups } = cherryPickState;
            const filteredText = groups.map(g => {
                if (g.type === 'equal') return g.text;
                if (g.type === 'changed') {
                    if (selectedIds.has(g.id)) return g.newText;
                    return g.oldText; // Keep original for unselected changes
                }
                return '';
            }).join('');

            console.log("[AUDIT 5.2] Texto plano reconstruido tras cherry-pick semántico:\n", filteredText);

            // Create modified blocks with cherry-picked content, preserving original paragraph breaks (\n\n)
            const cherryBlocks = blocks.map((b, idx) => {
                if (idx !== activeIndex) return b;
                
                // Wrap double-newline separated paragraphs in proper <p> tags
                const paragraphs = filteredText
                    .split(/\n\n+/)
                    .map(p => p.trim())
                    .filter(Boolean)
                    .map(p => `<p>${p}</p>`)
                    .join('');

                console.log("[AUDIT 5.3] HTML reconstruido para guardar:\n", paragraphs);
                return { ...b, proposedContent: paragraphs || b.proposedContent };
            });
            onApply(cherryBlocks);
        } else {
            console.log("[AUDIT 5.4] Sin cherry-pick o en vista Lado a Lado. Aplicando bloques propuestos crudos:\n", JSON.stringify(blocks, null, 2));
            onApply(blocks);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[4px] animate-in fade-in duration-300 px-4">
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-[0_30px_100px_rgba(0,0,0,0.5)] w-full max-w-5xl max-h-[90vh] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--border-main)] bg-[var(--bg-editor)]/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                            {isPatchMode ? <Scissors size={16} className="text-white" /> :
                             isSectionMode ? <Layers size={16} className="text-white" /> :
                             <FileText size={16} className="text-white" />}
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-[var(--text-main)] font-serif italic">
                                {isPatchMode ? 'Edición de Fragmento' :
                                 isSectionMode ? 'Escritura por Secciones' :
                                 'Vista de Cambios'}
                            </h3>
                            {currentBlock.title && (
                                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500">
                                    {isPatchMode ? '✂️ Modo Patch' : isSectionMode ? `📄 ${accumulatedSections.length} sección(es) listas` : `Destino: ${currentBlock.title}`}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* View mode toggle — only for regular content */}
                        {!isPatchMode && !isSectionMode && (
                            <div className="flex items-center bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl p-0.5 text-[8px] font-black uppercase tracking-widest">
                                <button
                                    onClick={() => setViewMode('semantic')}
                                    className={`px-2.5 py-1.5 rounded-lg transition-all ${viewMode === 'semantic' ? 'bg-indigo-500 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                >
                                    Semántico
                                </button>
                                <button
                                    onClick={() => setViewMode('sidebyside')}
                                    className={`px-2.5 py-1.5 rounded-lg transition-all ${viewMode === 'sidebyside' ? 'bg-indigo-500 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                >
                                    Lado a lado
                                </button>
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500 transition-all active:scale-95"
                        >
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {/* Tabs for multiple documents */}
                {blocks.length > 1 && (
                    <div className="flex gap-1 px-5 pt-3 pb-0 border-b border-[var(--border-main)] bg-[var(--bg-editor)]/30 overflow-x-auto shrink-0">
                        {blocks.map((block, idx) => (
                            <button
                                key={idx}
                                onClick={() => setActiveIndex(idx)}
                                className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-t-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                    idx === activeIndex
                                        ? 'bg-[var(--bg-app)] text-indigo-500 border-t border-l border-r border-[var(--border-main)] -mb-px'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/30'
                                }`}
                            >
                                <div className={`w-1.5 h-1.5 rounded-full ${block.isPatch ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                <span className="truncate max-w-[120px]">{block.title}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">

                    {/* ── Patch mode ── */}
                    {isPatchMode && (
                        <PatchDiffView
                            original={currentBlock.original}
                            proposedContent={currentBlock.proposedContent}
                            context={currentBlock.context}
                        />
                    )}

                    {/* ── Section accumulator mode ── */}
                    {!isPatchMode && isSectionMode && (
                        <SectionAccumulatorView
                            blocks={blocks}
                            accumulatedSections={accumulatedSections}
                        />
                    )}

                    {/* ── Regular content mode ── */}
                    {!isPatchMode && !isSectionMode && (
                        viewMode === 'semantic' ? (
                            <SemanticDiffView
                                currentContent={currentBlock.currentContent}
                                proposedContent={currentBlock.proposedContent}
                                onCherryPickChange={handleCherryPickChange}
                            />
                        ) : (
                            /* Side-by-side with contenteditable */
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 min-h-[40vh]">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-2 h-2 rounded-full bg-red-500" />
                                        <span className="text-[9px] font-black uppercase tracking-widest text-red-500">Actual</span>
                                    </div>
                                    <div className="flex-1 bg-red-500/5 border border-red-500/20 rounded-2xl p-5 text-sm leading-relaxed text-[var(--text-main)] overflow-y-auto">
                                        {currentBlock.currentContent ? (
                                            <div dangerouslySetInnerHTML={{ __html: currentBlock.currentContent }} />
                                        ) : (
                                            <span className="italic text-[var(--text-muted)] opacity-50">(Vacío)</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Propuesto</span>
                                        </div>
                                        <span className="text-[9px] font-black uppercase tracking-wider text-emerald-500/80 bg-emerald-500/10 px-2 py-0.5 rounded-md animate-pulse">
                                            ✍️ Editable
                                        </span>
                                    </div>
                                    <div
                                        contentEditable={true}
                                        suppressContentEditableWarning={true}
                                        onBlur={handleProposedBlur}
                                        className="flex-1 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 text-sm leading-relaxed text-[var(--text-main)] overflow-y-auto outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50"
                                        dangerouslySetInnerHTML={{ __html: currentBlock.proposedContent }}
                                    />
                                </div>
                            </div>
                        )
                    )}
                </div>

                {/* Footer */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-5 py-4 border-t border-[var(--border-main)] bg-[var(--bg-editor)]/50 shrink-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-[var(--text-muted)]">
                        {isPatchMode ? (
                            <span className="flex items-center gap-1.5 text-amber-500">
                                <Scissors size={10} />
                                Patch — solo se modifica el fragmento seleccionado
                            </span>
                        ) : isSectionMode ? (
                            <span className="flex items-center gap-1.5 text-indigo-500">
                                <Layers size={10} />
                                {accumulatedSections.length} sección(es) · {accumulatedSections.reduce((s, sec) => s + cleanText(sec.html || '').split(/\s+/).filter(Boolean).length, 0)} palabras totales
                            </span>
                        ) : (
                            <>
                                <span className="opacity-50">Palabras:</span>
                                <span className="text-red-500">{currentWords.toLocaleString()}</span>
                                <span className="opacity-30">→</span>
                                <span className="text-emerald-500">{proposedWords.toLocaleString()}</span>
                                {wordDiff !== 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-md text-[8px] ${wordDiff > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                        {wordDiff > 0 ? '+' : ''}{wordDiff}
                                    </span>
                                )}
                                {blocks.length > 1 && (
                                    <span className="ml-1 opacity-40">· {blocks.length} documentos</span>
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <button
                            onClick={onRegenerate}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all border border-[var(--border-main)]"
                        >
                            <RotateCcw size={13} />
                            Regenerar
                        </button>
                        <button
                            onClick={handleApply}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
                        >
                            <Check size={13} />
                            {isPatchMode ? 'Aplicar Patch' : isSectionMode ? 'Aplicar Secciones' : 'Aplicar Cambios'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IAStudioDiff;
