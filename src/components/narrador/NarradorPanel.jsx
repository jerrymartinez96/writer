/**
 * NarradorPanel — Interfaz de control flotante para la narración de capítulos.
 * Aparece en la esquina inferior derecha durante el modo lectura.
 */
import React, { useState } from 'react';
import {
    Play, Pause, Square, SkipBack, SkipForward,
    Volume2, Settings, X, Sparkles, Globe, ChevronDown, BookOpenText, Minimize2, RefreshCw, CheckCircle2, CircleDashed, Loader2, Download, StopCircle
} from 'lucide-react';
import NarradorSettingsModal from './NarradorSettingsModal';

const SegmentList = ({ segments, currentSegmentIndex, status, cachedSegmentIndexes, isPreparing, preparationIndex, skipToSegment, regenerateSegment }) => (
    <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
        {segments.map((segment, index) => (
            (() => {
                const preparing = isPreparing && preparationIndex === index && !cachedSegmentIndexes.has(index);
                const generating = preparing || (status === 'connecting' && index === currentSegmentIndex);
                return (
            <div key={`${segment.index}-${segment.hash}`} className={`flex items-center gap-1 rounded-lg ${index === currentSegmentIndex ? 'bg-indigo-500/10' : ''}`}>
                <button
                    onClick={() => skipToSegment(index)}
                    className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[9px] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                    title={segment.text}
                >
                    <span className="mr-1 font-black text-[var(--accent-main)]">{index + 1}.</span>
                    {segment.text}
                </button>
                <span
                    className={`flex shrink-0 items-center gap-1 text-[8px] font-bold uppercase tracking-wide ${cachedSegmentIndexes.has(index) ? 'text-emerald-500' : generating ? 'text-amber-500' : 'text-[var(--text-muted)]'}`}
                    title={cachedSegmentIndexes.has(index) ? 'Audio disponible en caché' : generating ? 'Preparando audio...' : 'Audio aún no generado'}
                >
                    {cachedSegmentIndexes.has(index) ? <CheckCircle2 size={12} /> : generating ? <Loader2 size={12} className="animate-spin" /> : <CircleDashed size={12} />}
                    <span className="hidden sm:inline">{cachedSegmentIndexes.has(index) ? 'Caché' : generating ? 'Preparando' : 'Pendiente'}</span>
                </span>
                <button
                    onClick={() => regenerateSegment(index)}
                    disabled={status === 'connecting' || isPreparing}
                    className="p-1.5 text-[var(--text-muted)] hover:text-purple-500 disabled:opacity-30 cursor-pointer"
                    title={isPreparing ? 'No disponible mientras se prepara el capítulo' : 'Regenerar este fragmento'}
                >
                    <RefreshCw size={12} />
                </button>
            </div>
                );
            })()
        ))}
    </div>
);

const KaraokeTranscript = ({ text, progress, isPlaying, isSyncReady }) => {
    const sentences = String(text || '')
        .replace(/([.!?…])([A-ZÁÉÍÓÚÜÑ])/g, '$1 $2')
        .split(/(?<=[.!?…])\s+/)
        .filter(Boolean);
    const sentenceWeights = sentences.map(sentence => {
        const words = sentence.trim().split(/\s+/).filter(Boolean).length;
        const commas = (sentence.match(/[,;:]/g) || []).length;
        const dashes = (sentence.match(/[—–-]/g) || []).length;
        const lengthAdjustment = Math.min(1.5, sentence.length / 140);
        return Math.max(1, words + (commas * 0.35) + (dashes * 0.45) + lengthAdjustment);
    });
    const totalWeight = sentenceWeights.reduce((sum, weight) => sum + weight, 0);
    const targetWeight = Math.max(0, Math.min(0.999, progress)) * totalWeight;
    let accumulatedWeight = 0;
    const activeSentence = sentences.length
        ? sentenceWeights.findIndex(weight => {
            accumulatedWeight += weight;
            return accumulatedWeight > targetWeight;
        })
        : 0;

    if (!text) {
        return <p className="text-[var(--text-muted)] italic text-lg">La transcripción aparecerá aquí al iniciar la narración.</p>;
    }

    return (
        <p className="text-xl md:text-3xl leading-[1.9] md:leading-[2.05] tracking-[-0.015em] text-center">
            {sentences.map((sentence, index) => {
                const isActive = index === activeSentence && isPlaying && isSyncReady;
                const isPast = index < activeSentence;
                return (
                    <span
                        key={index}
                        className="inline rounded-xl px-1.5 transition-all duration-500"
                        style={{
                            color: 'var(--text-main)',
                            opacity: isActive ? 1 : isPast ? 0.48 : 0.36,
                            background: isActive ? 'color-mix(in srgb, var(--accent-main) 18%, transparent)' : 'transparent',
                            boxShadow: isActive ? '0 0 24px color-mix(in srgb, var(--accent-main) 18%, transparent)' : 'none'
                        }}
                    >
                        {sentence}{index < sentences.length - 1 ? ' ' : ''}
                    </span>
                );
            })}
        </p>
    );
};

const formatPreparationEta = (seconds) => {
    const value = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (value <= 0) return '';
    if (value < 60) return `${value}s`;

    const minutes = Math.ceil(value / 60);
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
};

const NarradorPanel = ({
    narrador,
    activeChapter,
    onClose,
    embedded = false,
}) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
    const [isPrepareMenuOpen, setIsPrepareMenuOpen] = useState(false);

    const {
        status,
        segments,
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
        regenerateSegment,
        refreshCacheStats,
        hasGeminiKey,
        isNarratorMode,
        toggleNarratorMode,
        currentTranscript,
        segmentProgress,
        isSegmentSyncReady,
        cachedSegmentIndexes,
        isPreparing,
        isPreparationPaused,
        preparationProgress,
        prepareAudio,
        cancelPreparation,
        pausePreparation,
        resumePreparation
    } = narrador;

    const isPlaying = status === 'speaking';
    const isConnecting = status === 'connecting';
    const isPaused = status === 'paused';

    const chapterTitle = activeChapter?.title || 'Capítulo';
    const preparationEta = formatPreparationEta(preparationProgress.etaSeconds);
    const preparationSegmentLabel = Number.isInteger(preparationProgress.currentIndex)
        ? `Cargando ${preparationProgress.currentIndex + 1}`
        : 'Preparando audio';
    const preparationLabel = preparationProgress.total > 0
        ? `${isPreparationPaused ? 'Pausado · ' : ''}${preparationSegmentLabel} · ${preparationProgress.completed}/${preparationProgress.total}${preparationEta ? ` · ~${preparationEta}` : ''}`
        : 'Preparar';

    const renderPreparationControls = () => (
        <div className="relative w-full">
            <div className="flex items-center gap-2">
                <button
                    onClick={() => { if (!isPreparing) setIsPrepareMenuOpen(previous => !previous); }}
                    disabled={!hasGeminiKey || isPlaying || isConnecting || isPaused}
                    className={`min-w-0 flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-app)] border text-[10px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer ${isPreparing ? 'border-emerald-500/40 text-[var(--text-main)]' : 'border-[var(--border-main)] text-[var(--text-muted)] hover:border-emerald-500/50'}`}
                    title={hasGeminiKey ? 'Preparar audio en caché' : 'Requiere una API key de Gemini'}
                >
                    {isPreparing ? (isPreparationPaused ? <Play size={12} className="shrink-0 text-amber-500" /> : <Loader2 size={12} className="shrink-0 animate-spin text-emerald-500" />) : <Download size={12} />}
                    <span className="truncate">{isPreparing ? preparationLabel : 'Preparar'}</span>
                    {!isPreparing && <ChevronDown size={12} />}
                </button>
                {isPreparing && (
                    <>
                        <button onClick={isPreparationPaused ? resumePreparation : pausePreparation} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/50 text-amber-600 hover:bg-amber-500/10" title={isPreparationPaused ? 'Reanudar preparación' : 'Pausar preparación'}>
                            {isPreparationPaused ? <Play size={13} /> : <Pause size={13} />}
                        </button>
                        <button onClick={cancelPreparation} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/50 text-red-500 hover:bg-red-500/10" title="Cancelar preparación">
                            <StopCircle size={13} />
                        </button>
                    </>
                )}
            </div>
            {!isPreparing && isPrepareMenuOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsPrepareMenuOpen(false)}></div>
                    <div className="absolute bottom-full left-0 mb-1 w-52 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl shadow-2xl z-50 overflow-hidden p-1">
                        {[
                            ['chapter', 'Completo'],
                            ['half', 'Mitad y reproducir'],
                            ['start', 'Inicio (3 fragmentos)']
                        ].map(([mode, label]) => (
                            <button key={mode} onClick={() => { setIsPrepareMenuOpen(false); prepareAudio(mode); }} className="w-full text-left px-3 py-2 rounded-lg text-[10px] font-black text-[var(--text-main)] hover:bg-emerald-500/10 hover:text-emerald-500 cursor-pointer">
                                {label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );

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
        ? Math.min(100, Math.round(((currentSegmentIndex + segmentProgress) / totalSegments) * 100))
        : 0;
    const motorLabel = motorUsado === 'gemini' ? '✨ Gemini' : motorUsado === 'web-speech' ? '🌐 Navegador' : 'Sin iniciar';

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
                    <div className="relative flex-1 flex items-center overflow-y-auto px-4 sm:px-8 md:px-12 py-8 scrollbar-hide bg-[radial-gradient(circle_at_50%_45%,rgba(99,102,241,0.12),transparent_48%)]">
                        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-40 -translate-y-1/2 bg-gradient-to-b from-transparent via-indigo-500/[0.035] to-transparent" />
                        <div className="relative mx-auto w-full max-w-5xl">
                            <KaraokeTranscript
                                text={currentTranscript}
                                progress={segmentProgress}
                                isPlaying={status === 'speaking'}
                                isSyncReady={isSegmentSyncReady}
                            />
                        </div>
                    </div>

                    {/* Pie: controles */}
                    <div className="px-4 sm:px-8 py-4 border-t border-[var(--border-main)] bg-[var(--bg-editor)]/50">
                        <div className="mx-auto max-w-4xl">
                            <div className="mb-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                        {getStatusLabel()} · sincronización estimada
                                    </span>
                                    <span className="text-[9px] font-black text-[var(--text-muted)] tabular-nums">
                                        {Math.round(segmentProgress * 100)}% · segmento {currentSegmentIndex + 1} de {totalSegments}
                                    </span>
                                </div>
                                <div className="h-1.5 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-full overflow-hidden">
                                    <div
                                        className={`h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ${status === 'connecting' ? 'tts-generating' : ''}`}
                                        style={{ width: `${Math.max(3, segmentProgress * 100)}%` }}
                                    ></div>
                                </div>
                                <div className="mt-2 flex items-end justify-center gap-1 h-5 opacity-70" aria-hidden="true">
                                    {[0.35, 0.65, 0.95, 0.55, 0.8, 0.45, 0.75, 0.5, 0.9, 0.6, 0.4, 0.7].map((height, index) => (
                                        <span
                                            key={index}
                                            className={`w-1 rounded-full bg-indigo-400 transition-transform duration-300 ${status === 'speaking' ? 'animate-pulse' : ''}`}
                                            style={{ height: `${height * 100}%`, transform: status === 'speaking' ? `scaleY(${0.75 + ((index + Math.floor(segmentProgress * 10)) % 4) / 4})` : 'scaleY(.55)' }}
                                        />
                                    ))}
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

                        {isConnecting ? (
                            <button disabled className="w-14 h-14 rounded-2xl bg-[var(--accent-main)] text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center opacity-80" title="Conectando">
                                <Loader2 size={22} className="animate-spin" />
                            </button>
                        ) : isPlaying ? (
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

                            <div className="mt-4 border-t border-[var(--border-main)] pt-3">
                                <SegmentList
                                    segments={segments}
                                    currentSegmentIndex={currentSegmentIndex}
                                    status={status}
                                    cachedSegmentIndexes={cachedSegmentIndexes}
                                    isPreparing={isPreparing}
                                    preparationIndex={preparationProgress.currentIndex}
                                    skipToSegment={skipToSegment}
                                    regenerateSegment={regenerateSegment}
                                />
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
            <div className={`${embedded ? 'w-full' : 'fixed bottom-20 right-6 z-[60] w-80'} bg-[var(--bg-app)]/95 backdrop-blur-2xl border border-[var(--border-main)] rounded-3xl shadow-2xl shadow-black/20 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-200`}>
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
                            {motorLabel}
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
                            aria-label="Cerrar reproductor"
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

                        {isConnecting ? (
                            <button disabled className="w-12 h-12 rounded-2xl bg-[var(--accent-main)] text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center opacity-80" title="Conectando">
                                <Loader2 size={20} className="animate-spin" />
                            </button>
                        ) : isPlaying ? (
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

                    <div className="border-t border-[var(--border-main)] pt-3">
                        <SegmentList
                            segments={segments}
                            currentSegmentIndex={currentSegmentIndex}
                            status={status}
                            cachedSegmentIndexes={cachedSegmentIndexes}
                            isPreparing={isPreparing}
                            preparationIndex={preparationProgress.currentIndex}
                            skipToSegment={skipToSegment}
                            regenerateSegment={regenerateSegment}
                        />
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
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-main)]">
                        {renderPreparationControls()}
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
