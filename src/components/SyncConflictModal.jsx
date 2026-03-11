import React, { useMemo } from 'react';
import Modal from './Modal';
import { Share2, Laptop, Cloud, AlertCircle, CheckCircle2, Smartphone, AlertTriangle, ChevronRight, Eye } from 'lucide-react';
import { diff_match_patch } from 'diff-match-patch';

const SyncConflictModal = ({ isOpen, conflict, onResolve }) => {
    if (!conflict) return null;

    const { local, cloud, isTokenConflict } = conflict;

    const formatDate = (timestamp) => {
        if (!timestamp) return '---';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('es-ES', {
            hour: '2-digit', minute: '2-digit',
            day: '2-digit', month: 'short'
        });
    };

    // Calculate Diffs
    const diffHtml = useMemo(() => {
        if (!local?.content || !cloud?.content) return null;
        
        const dmp = new diff_match_patch();
        // Strip tags for a cleaner text diff, or compare HTML
        // For writing, text diff is usually more readable
        const cleanLocal = local.content.replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n');
        const cleanCloud = cloud.content.replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n');
        
        const diffs = dmp.diff_main(cleanCloud, cleanLocal);
        dmp.diff_cleanupSemantic(diffs);
        
        return diffs.map(([op, text], i) => {
            if (op === 1) return <ins key={i} className="bg-emerald-500/20 text-emerald-600 no-underline px-0.5 rounded">{text}</ins>;
            if (op === -1) return <del key={i} className="bg-rose-500/10 text-rose-500 line-through px-0.5 rounded opacity-50">{text}</del>;
            return <span key={i}>{text}</span>;
        });
    }, [local?.content, cloud?.content]);

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={() => {}} // Block closing without resolving
            title={isTokenConflict ? "Conflicto Multi-dispositivo" : "Diferencias de Sincronización"}
            size="xl"
        >
            <div className="space-y-6">
                <div className={`flex items-start gap-4 p-4 rounded-2xl border ${isTokenConflict ? 'bg-rose-500/10 border-rose-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                    {isTokenConflict ? (
                        <AlertTriangle className="text-rose-500 shrink-0 mt-1" size={24} />
                    ) : (
                        <AlertCircle className="text-amber-500 shrink-0 mt-1" size={24} />
                    )}
                    <div>
                        <h4 className={`font-bold ${isTokenConflict ? 'text-rose-600' : 'text-amber-600'}`}>
                            {isTokenConflict ? '¡Cuidado! Este capítulo fue editado en otro dispositivo' : '¿Qué versión quieres conservar?'}
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                            {isTokenConflict 
                                ? 'Alguien (o tú mismo desde otro equipo) guardó cambios recientemente. Compara las versiones antes de elegir.'
                                : 'Tienes cambios locales que no se han guardado en la nube. Revisa qué es lo que te falta sincronizar.'}
                        </p>
                    </div>
                </div>

                {/* Diff Previewer */}
                <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] overflow-hidden">
                    <div className="bg-[var(--bg-editor)] px-4 py-2 border-b border-[var(--border-main)] flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[var(--text-muted)]">
                            <Eye size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Comparativa de cambios</span>
                        </div>
                        <div className="flex items-center gap-4 text-[9px] font-bold">
                            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500/20 border border-emerald-500/30"></div> Tus Cambios</span>
                            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500/10 border border-rose-500/20"></div> Borrado en Nube</span>
                        </div>
                    </div>
                    <div className="p-6 max-h-[300px] overflow-y-auto text-sm leading-relaxed font-serif whitespace-pre-wrap selection:bg-indigo-100">
                        {diffHtml || <p className="text-center italic opacity-50 py-10">Calculando diferencias...</p>}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Local Version Card */}
                    <button 
                        onClick={() => onResolve('local')}
                        className="group flex flex-col p-6 rounded-2xl border-2 border-[var(--border-main)] bg-[var(--bg-app)] hover:border-[var(--accent-main)] hover:bg-[var(--accent-soft)]/20 transition-all text-left relative overflow-hidden"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-main)]">
                                <Laptop size={20} />
                            </div>
                            <div>
                                <h5 className="font-black text-sm uppercase tracking-wider text-[var(--text-main)]">Mi Versión Actual</h5>
                                <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-0.5">La que tienes abierta ahora</p>
                            </div>
                        </div>
                        
                        <div className="mt-auto space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-[var(--text-muted)]">Origen:</span>
                                <span className="font-bold text-[var(--text-main)] italic">Editor Local</span>
                            </div>
                            <div className={`text-[9px] font-black py-1 px-3 rounded-full w-fit uppercase tracking-widest ${isTokenConflict ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                {isTokenConflict ? 'Riesgo de sobrescritura' : 'Nuevos párrafos'}
                            </div>
                        </div>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CheckCircle2 size={24} className="text-[var(--accent-main)]" />
                        </div>
                    </button>

                    {/* Cloud Version Card */}
                    <button 
                        onClick={() => onResolve('cloud')}
                        className="group flex flex-col p-6 rounded-2xl border-2 border-[var(--border-main)] bg-[var(--bg-app)] hover:border-indigo-400 hover:bg-indigo-500/10 transition-all text-left relative overflow-hidden"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500">
                                {isTokenConflict ? <Smartphone size={20} /> : <Cloud size={20} />}
                            </div>
                            <div>
                                <h5 className="font-black text-sm uppercase tracking-wider text-[var(--text-main)]">
                                    {isTokenConflict ? 'Versión Externa' : 'Versión en la Nube'}
                                </h5>
                                <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-0.5">
                                    {isTokenConflict ? 'Guardada desde otro lugar' : 'Lo que está en el servidor'}
                                </p>
                            </div>
                        </div>
                        
                        <div className="mt-auto space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-[var(--text-muted)]">Último Sync:</span>
                                <span className="font-bold text-[var(--text-main)]">{formatDate(cloud.updatedAt)}</span>
                            </div>
                        </div>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CheckCircle2 size={24} className="text-indigo-500" />
                        </div>
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SyncConflictModal;
