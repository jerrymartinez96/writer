import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Download, FileAudio, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { downloadCachedChapterWav, getCachedChapterSegments, getNarradorCacheSize } from '../../services/NarradorCache';

const formatBytes = (bytes = 0) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const NarradorExportPanel = ({
    bookId,
    chapterId,
    chapterTitle,
    segments = [],
    variantKey = 'default',
    onPrepare,
    onOpenPlayer,
}) => {
    const [cacheState, setCacheState] = useState({ ready: 0, total: 0, missingIndexes: [] });
    const [cacheInfo, setCacheInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState('');

    const loadState = useCallback(async () => {
        if (!bookId || !chapterId || segments.length === 0) {
            setCacheState({ ready: 0, total: segments.length, missingIndexes: segments.map((_, index) => index) });
            setCacheInfo(null);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const [chapterCache, stats] = await Promise.all([
                getCachedChapterSegments(bookId, chapterId, segments, variantKey),
                getNarradorCacheSize()
            ]);
            setCacheState({
                ready: chapterCache.segments.length,
                total: segments.length,
                missingIndexes: chapterCache.missingIndexes
            });
            setCacheInfo(stats);
        } catch (loadError) {
            setError(loadError.message || 'No se pudo leer la caché de audio.');
        } finally {
            setIsLoading(false);
        }
    }, [bookId, chapterId, segments, variantKey]);

    useEffect(() => { loadState(); }, [loadState]);

    const isComplete = cacheState.total > 0 && cacheState.ready === cacheState.total;
    const progress = cacheState.total > 0 ? Math.round((cacheState.ready / cacheState.total) * 100) : 0;
    const missingLabel = useMemo(() => {
        if (cacheState.missingIndexes.length === 0) return '';
        if (cacheState.missingIndexes.length > 4) return `${cacheState.missingIndexes.length} segmentos`;
        return cacheState.missingIndexes.map(index => index + 1).join(', ');
    }, [cacheState.missingIndexes]);

    const handleExport = async () => {
        setIsExporting(true);
        setError('');
        try {
            const result = await downloadCachedChapterWav({ bookId, chapterId, chapterTitle, segments, variantKey });
            if (result.missingIndexes.length > 0) {
                setError('La exportación necesita que todos los segmentos estén preparados.');
                setCacheState({ ready: result.segments.length, total: segments.length, missingIndexes: result.missingIndexes });
            }
        } catch (exportError) {
            setError(exportError.message || 'No se pudo exportar el audio.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <details className="group rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 outline-none lg:p-6 [&::-webkit-details-marker]:hidden">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500">Exportar</p>
                    <h2 className="mt-1 text-lg font-serif font-black">Descarga una copia de audio</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
                        Exporta únicamente el audio ya generado y cacheado. El capítulo original y el guion permanecen intactos.
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-emerald-500">
                    <FileAudio className="hidden sm:block" size={22} />
                    <ChevronDown className="transition-transform group-open:rotate-180" size={18} />
                </div>
            </summary>

            <div className="border-t border-[var(--border-main)] p-5 lg:p-7">

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Capítulo</p>
                    <p className="mt-2 truncate text-sm font-bold" title={chapterTitle}>{chapterTitle || 'Sin selección'}</p>
                </div>
                <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Segmentos listos</p>
                    <p className="mt-2 text-sm font-bold">{isLoading ? 'Calculando…' : `${cacheState.ready} / ${cacheState.total}`}</p>
                </div>
                <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Caché total</p>
                    <p className="mt-2 text-sm font-bold">{cacheInfo ? formatBytes(cacheInfo.bytes) : '—'}</p>
                </div>
            </div>

            <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    <span>Preparación para exportar</span>
                    <span>{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-app)]">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
            </div>

            {error && (
                <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-[var(--text-muted)]">
                    <TriangleAlert className="mt-0.5 shrink-0 text-amber-500" size={15} />
                    <span>{error}</span>
                </div>
            )}

            {!isLoading && !isComplete && cacheState.total > 0 && (
                <div className="mt-5 flex items-start gap-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 text-xs leading-relaxed text-[var(--text-muted)]">
                    <ShieldCheck className="mt-0.5 shrink-0 text-violet-500" size={15} />
                    <span>Faltan {missingLabel || 'segmentos'} por preparar. Puedes volver a Preparar y regresar aquí cuando termine.</span>
                </div>
            )}

            {!isLoading && isComplete && (
                <div className="mt-5 flex items-start gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-xs leading-relaxed text-[var(--text-muted)]">
                    <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={15} />
                    <span>Todos los segmentos están disponibles en la variante de audio actual.</span>
                </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
                {!isComplete && (
                    <button type="button" onClick={onPrepare} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/20 hover:bg-violet-600">
                        <FileAudio size={16} /> Preparar audio
                    </button>
                )}
                {isComplete && (
                    <button type="button" onClick={handleExport} disabled={isExporting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 disabled:opacity-60">
                        {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                        {isExporting ? 'Exportando…' : 'Descargar WAV'}
                    </button>
                )}
                <button type="button" onClick={loadState} disabled={isLoading} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-4 py-3 text-sm font-black hover:border-emerald-500 disabled:opacity-50">
                    <RefreshCw className={isLoading ? 'animate-spin' : ''} size={16} /> Actualizar estado
                </button>
                <button type="button" onClick={onOpenPlayer} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-4 py-3 text-sm font-black hover:border-violet-500">
                    Escuchar capítulo
                </button>
            </div>
            </div>
        </details>
    );
};

export default NarradorExportPanel;
