import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, Download, Loader2, RefreshCw, Upload } from 'lucide-react';
import { useToast } from '../Toast';
import { buildNarradorAudioVariant } from '../../services/NarradorAudioIdentity';
import {
    downloadNarradorChapterToCache,
    getNarradorCloudChapterStatus,
    isNarradorCloudConfigured,
    uploadCachedNarradorChapter
} from '../../services/NarradorCloudService';

const emptyProgress = { completed: 0, total: 0, uploaded: 0, downloaded: 0, skipped: 0, missing: 0, failed: 0, errors: [] };

const NarradorCloudBackupPanel = ({
    profile,
    bookId,
    chapterId,
    chapterTitle,
    segments = [],
    onCacheChanged,
    onSegmentCached,
    onSyncStateChange
}) => {
    const toast = useToast();
    const [operation, setOperation] = useState(null);
    const [progress, setProgress] = useState(emptyProgress);
    const [backupStatus, setBackupStatus] = useState(null);
    const [isStatusLoading, setIsStatusLoading] = useState(false);
    const [statusError, setStatusError] = useState('');
    const scopeRef = useRef('');

    const variantKey = buildNarradorAudioVariant(profile);
    const scopeKey = `${bookId || ''}:${chapterId || ''}:${variantKey}`;
    const cloudConfigured = isNarradorCloudConfigured(profile);
    const isBusy = Boolean(operation);

    const refreshBackupStatus = useCallback(async () => {
        const requestScope = scopeKey;
        if (scopeRef.current !== requestScope) return;
        if (!bookId || !chapterId) {
            setBackupStatus(null);
            setStatusError('');
            return;
        }
        if (segments.length === 0) {
            setBackupStatus({ total: 0, localReady: 0, cloudReady: 0, localMissingIndexes: [], cloudMissingIndexes: [] });
            setStatusError('');
            return;
        }

        setIsStatusLoading(true);
        try {
            const nextStatus = await getNarradorCloudChapterStatus({ bookId, chapterId, segments, variantKey });
            if (scopeRef.current !== requestScope) return;
            setBackupStatus(nextStatus);
            setStatusError('');
        } catch (error) {
            if (scopeRef.current !== requestScope) return;
            setBackupStatus(null);
            setStatusError(error.message || 'No se pudo consultar el respaldo de este capítulo.');
        } finally {
            if (scopeRef.current === requestScope) setIsStatusLoading(false);
        }
    }, [bookId, chapterId, scopeKey, segments, variantKey]);

    useEffect(() => {
        scopeRef.current = scopeKey;
        void refreshBackupStatus();
    }, [refreshBackupStatus, scopeKey]);

    useEffect(() => {
        onSyncStateChange?.(isBusy);
        return () => onSyncStateChange?.(false);
    }, [isBusy, onSyncStateChange]);

    const updateProgressForScope = useCallback((requestScope, nextProgress) => {
        if (scopeRef.current === requestScope) setProgress(nextProgress);
    }, []);

    const handleUpload = async () => {
        if (!bookId || !chapterId) return;
        if (!cloudConfigured) {
            toast.warning('Configura Cloud name y Upload preset desde la configuración del Narrador.');
            return;
        }
        if (segments.length === 0) {
            toast.warning('Espera a que se cargue el capítulo antes de respaldar sus audios.');
            return;
        }

        const requestScope = scopeKey;
        setOperation('upload');
        setProgress(emptyProgress);
        try {
            const result = await uploadCachedNarradorChapter({
                profile,
                bookId,
                chapterId,
                chapterTitle: chapterTitle || '',
                segments,
                variantKey,
                onProgress: (nextProgress) => updateProgressForScope(requestScope, nextProgress)
            });
            if (scopeRef.current !== requestScope) return;
            if (result.total === 0) {
                toast.info(result.missing > 0
                    ? 'No hay audio vigente en este dispositivo para respaldar.'
                    : 'Este capítulo no tiene fragmentos locales para respaldar.');
            } else if (result.failed > 0) {
                toast.warning(`Respaldo parcial: ${result.uploaded + result.skipped} de ${result.total}. Puedes reintentar los fallidos.`);
            } else {
                toast.success(`Respaldo actualizado: ${result.uploaded} fragmento(s) subido(s).`);
            }
            await refreshBackupStatus();
        } catch (error) {
            if (scopeRef.current !== requestScope) return;
            console.error('[NarradorCloud] Error en la acción de subir desde el panel', {
                bookId,
                chapterId,
                error: { name: error?.name || 'Error', message: error?.message || String(error), code: error?.code || null, status: error?.status || null }
            });
            toast.error(error.message || 'No se pudo subir el respaldo a la nube.');
            await refreshBackupStatus();
        } finally {
            setOperation(null);
        }
    };

    const handleDownload = async () => {
        if (!bookId || !chapterId) return;
        if (segments.length === 0) {
            toast.warning('Espera a que se cargue el capítulo antes de descargar sus audios.');
            return;
        }

        const requestScope = scopeKey;
        setOperation('download');
        setProgress({ ...emptyProgress, total: segments.length });
        try {
            const result = await downloadNarradorChapterToCache({
                profile,
                bookId,
                chapterId,
                segments,
                variantKey,
                onProgress: (nextProgress) => updateProgressForScope(requestScope, nextProgress),
                onSegmentCached
            });
            if (scopeRef.current !== requestScope) return;
            await onCacheChanged?.();
            if (result.downloaded === 0 && result.skipped === result.total) {
                toast.info('Los fragmentos ya estaban disponibles en este dispositivo.');
            } else if (result.failed > 0 || result.missing > 0) {
                toast.warning(`Descarga parcial: ${result.downloaded + result.skipped} disponibles, ${result.missing} no encontrados. Puedes reintentarla.`);
            } else {
                toast.success(`Audio disponible en este dispositivo: ${result.downloaded} fragmento(s) descargado(s).`);
            }
            await refreshBackupStatus();
        } catch (error) {
            if (scopeRef.current !== requestScope) return;
            console.error('[NarradorCloud] Error en la acción de descargar desde el panel', {
                bookId,
                chapterId,
                error: { name: error?.name || 'Error', message: error?.message || String(error), code: error?.code || null, status: error?.status || null }
            });
            toast.error(error.message || 'No se pudo descargar el respaldo de la nube.');
            await refreshBackupStatus();
        } finally {
            setOperation(null);
        }
    };

    const progressLabel = operation === 'upload'
        ? `Subiendo ${progress.completed}/${progress.total}`
        : `Descargando ${progress.completed}/${progress.total}`;
    const readyTotal = backupStatus?.total ?? segments.length;

    return (
        <section className="rounded-3xl border border-sky-500/25 bg-sky-500/[0.03] p-5 lg:p-7" aria-label="Respaldo de narración entre dispositivos">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sky-600">Respaldo entre dispositivos</p>
                    <h2 className="mt-2 text-2xl font-serif font-black">Nube y descarga local</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
                        Sube los fragmentos ya generados en este equipo o descarga el respaldo para dejarlo disponible en la caché local de otro dispositivo. No reproduce el audio ni modifica el capítulo.
                    </p>
                </div>
                <Cloud className="hidden shrink-0 text-sky-500 sm:block" size={28} />
            </div>

            <div className="mt-5 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-[var(--text-main)]">Capítulo:</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]" title={chapterTitle}>{chapterTitle || 'Sin selección'}</span>
                    {isStatusLoading && <Loader2 className="animate-spin text-sky-500" size={14} />}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <span className="rounded-xl bg-[var(--bg-editor)] px-3 py-2 text-[var(--text-muted)]">Texto: <strong className="text-[var(--text-main)]">{readyTotal}</strong></span>
                    <span className="rounded-xl bg-emerald-500/5 px-3 py-2 text-emerald-600">En este equipo: <strong>{backupStatus?.localReady ?? '—'}/{readyTotal}</strong></span>
                    <span className="rounded-xl bg-sky-500/5 px-3 py-2 text-sky-700">En la nube: <strong>{backupStatus?.cloudReady ?? '—'}/{readyTotal}</strong></span>
                </div>
                {statusError && <p className="mt-3 flex items-start gap-1.5 text-amber-600"><AlertTriangle className="mt-0.5 shrink-0" size={13} />{statusError}</p>}
            </div>

            {!cloudConfigured && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-[var(--text-muted)]">
                    <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={15} />
                    <span>Configura el Cloud name y el Upload preset en el botón <strong className="text-[var(--text-main)]">Voz</strong> para subir nuevos respaldos. Las descargas de respaldos existentes no requieren esos datos.</span>
                </div>
            )}

            {isBusy && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4 text-xs font-bold text-sky-700">
                    <Loader2 className="animate-spin" size={15} />
                    <span>{progressLabel}</span>
                </div>
            )}

            {!isBusy && progress.total > 0 && (
                <div className={`mt-4 flex items-start gap-2 rounded-2xl border p-4 text-xs leading-relaxed ${progress.failed > 0 || progress.missing > 0 ? 'border-amber-500/30 bg-amber-500/5 text-[var(--text-muted)]' : 'border-emerald-500/25 bg-emerald-500/5 text-[var(--text-muted)]'}`}>
                    {progress.failed > 0 || progress.missing > 0 ? <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={15} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={15} />}
                    <span>{progress.failed > 0 || progress.missing > 0
                        ? `${progress.downloaded + progress.uploaded + progress.skipped} listos; ${progress.failed} con error y ${progress.missing} no encontrados.`
                        : `${progress.downloaded + progress.uploaded + progress.skipped} fragmento(s) disponibles. La caché existente no se sobrescribe.`}</span>
                </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={handleUpload} disabled={!cloudConfigured || isBusy || !bookId || !chapterId || segments.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-sky-500/20 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40">
                    {operation === 'upload' ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                    {operation === 'upload' ? progressLabel : 'Subir audio disponible'}
                </button>
                <button type="button" onClick={handleDownload} disabled={isBusy || !bookId || !chapterId || segments.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/35 px-4 py-3 text-sm font-black text-indigo-600 hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-40">
                    {operation === 'download' ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                    {operation === 'download' ? progressLabel : 'Descargar a este equipo'}
                </button>
                <button type="button" onClick={() => void refreshBackupStatus()} disabled={isBusy || isStatusLoading || !bookId || !chapterId} className="inline-flex items-center gap-2 rounded-xl px-3 py-3 text-xs font-black text-[var(--text-muted)] hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40" title="Actualizar estado del respaldo">
                    <RefreshCw className={isStatusLoading ? 'animate-spin' : ''} size={15} /> Actualizar
                </button>
            </div>
        </section>
    );
};

export default NarradorCloudBackupPanel;
