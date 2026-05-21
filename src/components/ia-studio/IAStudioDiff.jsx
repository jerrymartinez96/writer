import React from 'react';
import { X, Check, RotateCcw, FileText } from 'lucide-react';
import { cleanText } from './IAStudioUtils';

const IAStudioDiff = ({ currentContent, proposedContent, onApply, onClose, onRegenerate, destinationTitle }) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-main)] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                            <FileText size={16} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-[var(--text-main)]">Vista de Cambios</h3>
                            {destinationTitle && (
                                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500">
                                    Destino: {destinationTitle}
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    <div className="grid grid-cols-2 gap-6">
                        {/* Current Content */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Actual</span>
                            </div>
                            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 text-sm leading-relaxed text-[var(--text-main)] max-h-[60vh] overflow-y-auto scrollbar-hide">
                                {currentContent ? (
                                    <div dangerouslySetInnerHTML={{ __html: currentContent }} />
                                ) : (
                                    <span className="italic text-[var(--text-muted)] opacity-50">(Vacío)</span>
                                )}
                            </div>
                        </div>

                        {/* Proposed Content */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Propuesto</span>
                            </div>
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 text-sm leading-relaxed text-[var(--text-main)] max-h-[60vh] overflow-y-auto scrollbar-hide">
                                {proposedContent ? (
                                    <div dangerouslySetInnerHTML={{ __html: proposedContent }} />
                                ) : (
                                    <span className="italic text-[var(--text-muted)] opacity-50">(Vacío)</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-main)] bg-[var(--bg-editor)]/50 shrink-0">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-muted)]">
                        <span className="opacity-60">Diferencias:</span>
                        <span className="text-red-500">{cleanText(currentContent).split(' ').filter(Boolean).length} palabras</span>
                        <span className="opacity-30">→</span>
                        <span className="text-emerald-500">{cleanText(proposedContent).split(' ').filter(Boolean).length} palabras</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onRegenerate}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all border border-[var(--border-main)]"
                        >
                            <RotateCcw size={14} />
                            Regenerar
                        </button>
                        <button
                            onClick={onApply}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
                        >
                            <Check size={14} />
                            Aplicar Cambios
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IAStudioDiff;
