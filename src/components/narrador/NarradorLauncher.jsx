/**
 * NarradorLauncher — Botón flotante en la esquina inferior derecha.
 * Solo visible en modo lectura (isFocusMode).
 */
import React from 'react';
import { Volume2, AudioLines, Sparkles, X } from 'lucide-react';

const NarradorLauncher = ({
    isFocusMode,
    narrador,
    onTogglePanel
}) => {
    const {
        status,
        motorUsado,
        hasGeminiKey,
        showResumePrompt,
        resumeInfo
    } = narrador;

    // No mostrar si no estamos en modo lectura
    if (!isFocusMode) return null;

    const isActive = status === 'speaking' || status === 'connecting' || status === 'paused';
    const isGemini = motorUsado === 'gemini';

    return (
        <>
            {/* Resume prompt */}
            {showResumePrompt && resumeInfo && (
                <div className="fixed bottom-24 right-6 z-[70] w-80 bg-[var(--bg-app)]/95 backdrop-blur-2xl border border-indigo-500/30 rounded-3xl shadow-2xl shadow-indigo-500/10 p-4 animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-200">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                            <Sparkles size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">
                                Tienes progreso guardado
                            </p>
                            <p className="text-[11px] font-bold text-[var(--text-main)] leading-snug">
                                Continuar narración desde el segmento {resumeInfo.segmentIndex + 1} de {resumeInfo.totalSegments}?
                            </p>
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => {
                                        narrador.setShowResumePrompt(false);
                                        narrador.startNarration(resumeInfo.segmentIndex);
                                    }}
                                    className="flex-1 px-3 py-2 rounded-lg bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                                >
                                    Continuar
                                </button>
                                <button
                                    onClick={() => {
                                        narrador.setShowResumePrompt(false);
                                        narrador.startNarration(0);
                                    }}
                                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-editor)] border border-[var(--border-main)] text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest hover:border-indigo-500/50 transition-all cursor-pointer"
                                >
                                    Desde cero
                                </button>
                                <button
                                    onClick={() => narrador.setShowResumePrompt(false)}
                                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main floating button */}
            <button
                onClick={onTogglePanel}
                className={`fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 ${
                    isActive
                        ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-purple-500/40'
                        : hasGeminiKey
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-indigo-500/40'
                            : 'bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] shadow-black/20'
                }`}
                title={isActive ? 'Narrador activo' : hasGeminiKey ? 'Narrar capítulo' : 'Narrador (fallback navegador)'}
            >
                {isActive ? (
                    <AudioLines size={22} className={status === 'paused' ? '' : 'animate-pulse'} />
                ) : (
                    <Volume2 size={22} />
                )}

                {/* Badge indicador de motor */}
                {!hasGeminiKey && !isActive && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-[var(--bg-app)] shadow-sm"></span>
                )}
                {isGemini && isActive && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[var(--bg-app)] shadow-sm"></span>
                )}
            </button>
        </>
    );
};

export default NarradorLauncher;