/**
 * NarradorPanel — Interfaz de control flotante para la narración de capítulos.
 * Aparece en la esquina inferior derecha durante el modo lectura.
 */
import React, { useState } from 'react';
import {
    Play, Pause, Square, SkipBack, SkipForward,
    Volume2, Settings, X, Sparkles, Globe, ChevronDown, BookOpenText, Minimize2
} from 'lucide-react';
import NarradorSettingsModal from './NarradorSettingsModal';

const NarradorPanel = ({
    narrador,
    activeChapter,
    onClose
}) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);

    const {
        status,
        currentSegmentIndex,
        totalSegments,
        motorUsado,
        speed,
        setSpeed,
        startNarration,
        pauseNarration,
        resumeNarration,
        stopNarration,
        skipToSegment,
        refreshCacheStats,
        hasGeminiKey,
        isNarratorMode,
        toggleNarratorMode,
        currentTranscript
    } = narrador;

    const isPlaying = status === 'speaking' || status === 'connecting';
    const isPaused = status === 'paused';

    const chapterTitle = activeChapter?.title || 'Capítulo';

    const getStatusLabel = () => {
        switch (status) {
            case 'connecting': return 'Conectando...';
            case 'speaking': return 'Narrando';
            case 'paused': return 'En pausa';
            case 'stopped': return 'Detenido';
            default: return 'Listo';
        }
    };

    const progressPct = totalSegments > 0
        ? Math.round((currentSegmentIndex / totalSegments) * 100)
        : 0;

    /* ============ MODO NARRADOR: ventana modal inmersiva a todo el ancho ============ */
    if (isNarratorMode) {
        return (
            <>
                <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={onClose}
                ></div>

                <div className="fixed inset-x-2 sm:inset-x-6 md:inset-x-12 lg:inset-x-24 top-4 bottom-4 z-[85] flex flex-col rounded-3xl border border-indigo-500/30 bg-[var(--bg-app)] shadow-2xl shadow-indigo-500/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[var(--border-main)] bg-[var(--bg-editor)]/50">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${motorUsado === 'gemini' ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white' : 'bg-blue-500/10 text-blue-500'}`}>
                                {motorUsado === 'gemini' ? <Sparkles size={18} /> : <Globe size={18} />}
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <BookOpenText size={14} className="text-indigo-500 shrink-0" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] truncate">
                                        Modo narrador
                                    </p>
                                </div>
                                <p className="text-sm font-black text-[var(--text-main)] truncate">{chapterTitle}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className={`hidden sm:inline-flex px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                motorUsado === 'gemini' ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'
                            }`}>
                                {motorUsado === 'gemini' ? '✨ Gemini' : '🌐 Navegador'}
                            </span>
                            <div className="text-[10px] font-black text-[var(--accent-main)] tabular-nums">
                                {totalSegments > 0 ? `${currentSegmentIndex + 1} / ${totalSegments}` : '0 / 0'}
                            </div>
                            <button
                                onClick={toggleNarratorMode}
                                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all cursor-pointer"
                                title="Salir del modo narrador (volver al panel)"
                            >
                                <Minimize2 size={16} />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer"
                                title="Cerrar"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Cuerpo: transcripción del texto, alineada verticalmente al centro */}
                    <div className="flex-1 flex items-center overflow-y-auto px-4 sm:px-8 md:px-12 py-6 scrollbar-hide">
                        <div className="mx-auto max-w-4xl">
                            {currentTranscript ? (
                                currentTranscript
                                    // Normalizar puntos pegados a mayúscula (ej.: "archivo.Claire")
                                    .replace(/([.!?…])([A-ZÁÉÍÓÚÜÑ])/g, '$1 $2')
                                    .split(/(?<=[.!?…])\s+/)
                                    .filter(Boolean)
                                    .map((sentence, idx) => (
                                        <p key={idx} className="text-xl md:text-2xl leading-relaxed md:leading-loose mb-4 last:mb-0">
                                            {sentence}
                                        </p>
                                    ))
                            ) : (
                                <p className="text-[var(--text-muted)] italic text-lg">
                                    La transcripción aparecerá aquí al iniciar la narración.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Pie: controles */}
                    <div className="px-4 sm:px-8 py-4 border-t border-[var(--border-main)] bg-[var(--bg-editor)]/50">
                        <div className="mx-auto max-w-4xl">
                            <div className="mb-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                        {getStatusLabel()}
                                    </span>
                                    <span className="text-[9px] font-black text-[var(--text-muted)] tabular-nums">
                                        Segmento {currentSegmentIndex + 1} de {totalSegments}
                                    </span>
                                </div>
                                <div className="h-1.5 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-full overflow-hidden">
                                    <div
                                        className={`h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ${status === 'connecting' ? 'tts-generating' : ''}`}
                                        style={{ width: `${progressPct}%` }}
                                    ></div>
                                </div>
                            </div>

                            <div className="flex items-center justify-center gap-2 sm:gap-3">
                                <button
                                    onClick={() => skipToSegment(currentSegmentIndex - 1)}
                                    disabled={currentSegmentIndex <= 0}
                                    className="w-11 h-11 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer"
                                    title="Segmento anterior"
                                >
                                    <SkipBack size={18} />
                                </button>

                                {isPlaying ? (
                                    <button
                                        onClick={pauseNarration}
                                        className="w-14 h-14 rounded-2xl bg-[var(--accent-main)] text-white shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                                        title="Pausar"
                                    >
                                        <Pause size={22} fill="currentColor" />
                                    </button>
                                ) : isPaused ? (
                                    <button
                                        onClick={resumeNarration}
                                        className="w-14 h-14 rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                                        title="Reanudar"
                                    >
                                        <Play size={22} fill="currentColor" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => startNarration()}
                                        className="w-14 h-14 rounded-2xl bg-[var(--accent-main)] text-white shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                                        title="Iniciar narración"
                                    >
                                        <Play size={22} fill="currentColor" />
                                    </button>
                                )}

                                <button
                                    onClick={stopNarration}
                                    disabled={status === 'idle'}
                                    className="w-11 h-11 rounded-xl border border-[var(--border-main)] text-red-500 hover:border-red-500/50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer"
                                    title="Detener"
                                >
                                    <Square size={18} fill="currentColor" />
                                </button>

                                <button
                                    onClick={() => skipToSegment(currentSegmentIndex + 1)}
                                    disabled={currentSegmentIndex >= totalSegments - 1}
                                    className="w-11 h-11 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer"
                                    title="Siguiente segmento"
                                >
                                    <SkipForward size={18} />
                                </button>
                            </div>

                            <div className="flex items-center justify-center gap-2 mt-3">
                                <div className="relative">
                                    <button
                                        onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-main)] hover:border-[var(--accent-main)]/50 text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] transition-all cursor-pointer"
                                    >
                                        <span>{speed}x</span>
                                        <ChevronDown size={12} className={`transition-transform ${isSpeedMenuOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isSpeedMenuOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setIsSpeedMenuOpen(false)}></div>
                                            <div className="absolute bottom-full left-0 mb-1 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                                {[0.5, 0.75, 1.0, 1.25, 1.5].map(s => (
                                                    <button
                                                        key={s}
                                                        onClick={() => { setSpeed(s); setIsSpeedMenuOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${speed === s ? 'bg-indigo-500/10 text-indigo-500' : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'}`}
                                                    >
                                                        {s}x
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-main)] hover:border-[var(--accent-main)]/50 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] transition-all cursor-pointer"
                                >
                                    <Volume2 size={12} />
                                    Voz
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Settings Modal */}
                <NarradorSettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    onCacheCleared={refreshCacheStats}
                />
            </>
        );
    }

    /* ============ MODO NORMAL: panel flotante ============ */
    return (
        <>
            <div className="fixed bottom-20 right-6 z-[60] w-80 bg-[var(--bg-app)]/95 backdrop-blur-2xl border border-[var(--border-main)] rounded-3xl shadow-2xl shadow-black/20 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-main)] bg-[var(--bg-editor)]/50">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${motorUsado === 'gemini' ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white' : 'bg-blue-500/10 text-blue-500'}`}>
                            {motorUsado === 'gemini' ? <Sparkles size={16} /> : <Globe size={16} />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] truncate">
                                Narrador
                            </p>
                            <p className="text-xs font-black text-[var(--text-main)] truncate">{chapterTitle}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                            motorUsado === 'gemini' ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'
                        }`}>
                            {motorUsado === 'gemini' ? '✨ Gemini' : '🌐 Navegador'}
                        </span>
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all cursor-pointer"
                            title="Configuración del Narrador"
                        >
                            <Settings size={14} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                    {/* Status + Progress */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                {getStatusLabel()}
                            </span>
                            <span className="text-[9px] font-black text-[var(--accent-main)] tabular-nums">
                                {totalSegments > 0 ? `${currentSegmentIndex + 1} / ${totalSegments}` : '0 / 0'}
                            </span>
                        </div>
                        <div className="h-1.5 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-full overflow-hidden">
                            <div
                                className={`h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ${status === 'connecting' ? 'tts-generating' : ''}`}
                                style={{ width: `${progressPct}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-center gap-2">
                        <button
                            onClick={() => skipToSegment(currentSegmentIndex - 1)}
                            disabled={currentSegmentIndex <= 0}
                            className="w-9 h-9 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer"
                            title="Segmento anterior"
                        >
                            <SkipBack size={16} />
                        </button>

                        {isPlaying ? (
                            <button
                                onClick={pauseNarration}
                                className="w-12 h-12 rounded-2xl bg-[var(--accent-main)] text-white shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                                title="Pausar"
                            >
                                <Pause size={20} fill="currentColor" />
                            </button>
                        ) : isPaused ? (
                            <button
                                onClick={resumeNarration}
                                className="w-12 h-12 rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                                title="Reanudar"
                            >
                                <Play size={20} fill="currentColor" />
                            </button>
                        ) : (
                            <button
                                onClick={() => startNarration()}
                                className="w-12 h-12 rounded-2xl bg-[var(--accent-main)] text-white shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                                title="Iniciar narración"
                            >
                                <Play size={20} fill="currentColor" />
                            </button>
                        )}

                        <button
                            onClick={stopNarration}
                            disabled={status === 'idle'}
                            className="w-9 h-9 rounded-xl border border-[var(--border-main)] text-red-500 hover:border-red-500/50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer"
                            title="Detener"
                        >
                            <Square size={15} fill="currentColor" />
                        </button>

                        <button
                            onClick={() => skipToSegment(currentSegmentIndex + 1)}
                            disabled={currentSegmentIndex >= totalSegments - 1}
                            className="w-9 h-9 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer"
                            title="Siguiente segmento"
                        >
                            <SkipForward size={16} />
                        </button>
                    </div>

                    {/* Modo narrador */}
                    <div className="pt-2 border-t border-[var(--border-main)]">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                Modo narrador
                            </span>
                            <button
                                onClick={toggleNarratorMode}
                                className="px-2.5 py-1 rounded-lg bg-[var(--bg-editor)] border border-[var(--border-main)] text-[var(--text-muted)] hover:border-indigo-500/50 text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5"
                                title="Abrir el modo narrador a pantalla completa"
                            >
                                <BookOpenText size={12} />
                                Inmersivo
                            </button>
                        </div>
                    </div>

                    {/* Quick settings */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-main)]">
                        {/* Speed selector */}
                        <div className="relative flex-1">
                            <button
                                onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-editor)] border border-[var(--border-main)] hover:border-[var(--accent-main)]/50 text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] transition-all cursor-pointer"
                            >
                                <span>{speed}x</span>
                                <ChevronDown size={12} className={`transition-transform ${isSpeedMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isSpeedMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsSpeedMenuOpen(false)}></div>
                                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                        {[0.5, 0.75, 1.0, 1.25, 1.5].map(s => (
                                            <button
                                                key={s}
                                                onClick={() => { setSpeed(s); setIsSpeedMenuOpen(false); }}
                                                className={`w-full text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${speed === s ? 'bg-indigo-500/10 text-indigo-500' : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'}`}
                                            >
                                                {s}x
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Voice selector */}
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-editor)] border border-[var(--border-main)] hover:border-[var(--accent-main)]/50 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] transition-all cursor-pointer"
                        >
                            <span className="flex items-center gap-1.5">
                                <Volume2 size={12} />
                                Voz
                            </span>
                            <ChevronDown size={12} />
                        </button>
                    </div>

                    {/* Fallback notice */}
                    {!hasGeminiKey && (
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
                            <Globe size={12} className="text-blue-500 shrink-0 mt-0.5" />
                            <p className="text-[9px] text-[var(--text-muted)] leading-relaxed font-medium">
                                Usando voz del navegador.{' '}
                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="text-blue-500 font-bold hover:underline"
                                >
                                    Configura Gemini Live
                                </button>{' '}
                                para una narración más natural.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Settings Modal */}
            <NarradorSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                onCacheCleared={refreshCacheStats}
            />
        </>
    );
};

export default NarradorPanel;