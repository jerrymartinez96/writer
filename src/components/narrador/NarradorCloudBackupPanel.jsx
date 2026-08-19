import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, Download, Loader2, Upload } from 'lucide-react';
import { useToast } from '../Toast';
import { buildNarradorAudioVariant } from '../../services/NarradorAudioIdentity';
import {
    downloadNarradorChapterToCache,
    isNarradorCloudConfigured,
    uploadCachedNarradorChapter
} from '../../services/NarradorCloudService';

const NarradorCloudBackupPanel = ({
    profile,
    bookId,
    chapterId,
    chapterTitle,
    segments = [],
    onCacheChanged,
    onSegmentCached
}) => {
    const toast = useToast();
    const [operation, setOperation] = useState(null);
    const [progress, setProgress] = useState({ completed: 0, total: 0, uploaded: 0, downloaded: 0, skipped: 0, missing: 0, failed: 0 });

    const cloudConfigured = isNarradorCloudConfigured(profile);

    const handleUpload = async () => {
        if (!bookId || !chapterId) return;
        if (!cloudConfigured) {
            toast.warning('Configura Cloud name y Upload preset desde la configuración del Narrador.');
            return;
        }

        setOperation('upload');
        setProgress({ completed: 0, total: 0, uploaded: 0, downloaded: 0, skipped: 0, missing: 0, failed: 0 });
        try {
            const result = await uploadCachedNarradorChapter({
                profile,
                bookId,
                chapterId,
                chapterTitle: chapterTitle || '',
                onProgress: setProgress
            });
            if (result.total === 0) {
                toast.info('Este capítulo no tiene fragmentos guardados localmente para respaldar.');
            } else if (result.failed > 0) {
                console.warn('[NarradorCloud] La subida terminó con errores', {
                    bookId,
                    chapterId,
                    uploaded: result.uploaded,
                    skipped: result.skipped,
                    failed: result.failed,
                    errors: result.errors
                });
                toast.warning(`Respaldo parcial: ${result.uploaded + result.skipped} de ${result.total}.`);
            } else {
                toast.success(`Respaldo actualizado: ${result.uploaded} fragmento(s) subido(s).`);
            }
        } catch (error) {
            console.error('[NarradorCloud] Error en la acción de subir desde el panel', {
                bookId,
                chapterId,
                error: {
                    name: error?.name || 'Error',
                    message: error?.message || String(error),
                    code: error?.code || null,
                    status: error?.status || null
                }
            });
            toast.error(error.message || 'No se pudo subir el respaldo a la nube.');
        } finally {
            setOperation(null);
        }
    };

    const handleDownload = async () => {
        if (!bookId || !chapterId) return;
        if (!cloudConfigured) {
            toast.warning('Configura Cloud name y Upload preset desde la configuración del Narrador.');
            return;
        }
        if (segments.length === 0) {
            toast.warning('Este capítulo todavía no tiene fragmentos preparados para comparar con la nube.');
            return;
        }

        setOperation('download');
        setProgress({ completed: 0, total: segments.length, uploaded: 0, downloaded: 0, skipped: 0, missing: 0, failed: 0 });
        try {
            const result = await downloadNarradorChapterToCache({
                profile,
                bookId,
                chapterId,
                segments,
                variantKey: buildNarradorAudioVariant(profile),
                onProgress: setProgress,
                onSegmentCached
            });
            await onCacheChanged?.();
            if (result.downloaded === 0 && result.skipped === result.total) {
                toast.info('Los fragmentos ya estaban disponibles en este dispositivo.');
            } else if (result.failed > 0 || result.missing > 0) {
                console.warn('[NarradorCloud] La descarga terminó con incidencias', {
                    bookId,
                    chapterId,
                    downloaded: result.downloaded,
                    skipped: result.skipped,
                    missing: result.missing,
                    failed: result.failed,
                    errors: result.errors
                });
                toast.warning(`Descarga parcial: ${result.downloaded + result.skipped} disponibles, ${result.missing} no encontrados.`);
            } else {
                toast.success(`Audio disponible en este dispositivo: ${result.downloaded} fragmento(s) descargado(s).`);
            }
        } catch (error) {
            console.error('[NarradorCloud] Error en la acción de descargar desde el panel', {
                bookId,
                chapterId,
                error: {
                    name: error?.name || 'Error',
                    message: error?.message || String(error),
                    code: error?.code || null,
                    status: error?.status || null
                }
            });
            toast.error(error.message || 'No se pudo descargar el respaldo de la nube.');
        } finally {
            setOperation(null);
        }
    };

    const isBusy = Boolean(operation);
    const progressLabel = operation === 'upload'
        ? `Subiendo ${progress.completed}/${progress.total}`
        : `Descargando ${progress.completed}/${progress.total}`;

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

            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 text-xs">
                <span className="font-black text-[var(--text-main)]">Capítulo:</span>
                <span className="min-w-0 truncate text-[var(--text-muted)]" title={chapterTitle}>{chapterTitle || 'Sin selección'}</span>
                <span className="ml-auto text-[var(--text-muted)]">{segments.length} fragmentos preparados</span>
            </div>

            {!cloudConfigured && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-[var(--text-muted)]">
                    <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={15} />
                    <span>Configura el Cloud name y el Upload preset en el botón <strong className="text-[var(--text-main)]">Voz</strong> del reproductor para activar la sincronización.</span>
                </div>
            )}

            {isBusy && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4 text-xs font-bold text-sky-700">
                    <Loader2 className="animate-spin" size={15} />
                    <span>{progressLabel}</span>
                </div>
            )}

            {!isBusy && progress.total > 0 && (progress.uploaded + progress.downloaded + progress.skipped > 0) && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-xs leading-relaxed text-[var(--text-muted)]">
                    <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={15} />
                    <span>La caché local existente se conserva; los fragmentos disponibles se reutilizan sin sobrescribirlos.</span>
                </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!cloudConfigured || isBusy || !bookId || !chapterId}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-sky-500/20 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {operation === 'upload' ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                    {operation === 'upload' ? progressLabel : 'Subir caché del capítulo'}
                </button>
                <button
                    type="button"
                    onClick={handleDownload}
                    disabled={!cloudConfigured || isBusy || !bookId || !chapterId || segments.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/35 px-4 py-3 text-sm font-black text-indigo-600 hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {operation === 'download' ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                    {operation === 'download' ? progressLabel : 'Descargar a la caché local'}
                </button>
            </div>
        </section>
    );
};

export default NarradorCloudBackupPanel;
