import React from 'react';
import Modal from './Modal';
import { Share2, Laptop, Cloud, AlertCircle, CheckCircle2 } from 'lucide-react';

const SyncConflictModal = ({ isOpen, conflict, onResolve }) => {
    if (!conflict) return null;

    const { local, cloud } = conflict;

    const formatDate = (timestamp) => {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('es-ES', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: 'short'
        });
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={() => {}} // Block closing without resolving
            title="Diferencias de Contenido Detectadas"
            size="lg"
        >
            <div className="space-y-6">
                <div className="flex items-start gap-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                    <AlertCircle className="text-amber-500 shrink-0 mt-1" size={24} />
                    <div>
                        <h4 className="font-bold text-amber-500">¿Qué versión quieres conservar?</h4>
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                            Hemos detectado que tienes cambios en este dispositivo que son más recientes que la versión guardada en la nube. Esto suele pasar cuando escribes sin internet.
                        </p>
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
                                <h5 className="font-black text-sm uppercase tracking-wider text-[var(--text-main)]">Versión Local</h5>
                                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-0.5">La de este dispositivo</p>
                            </div>
                        </div>
                        
                        <div className="mt-auto space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-[var(--text-muted)]">Último cambio:</span>
                                <span className="font-bold text-[var(--text-main)]">{formatDate(local.createdAt)}</span>
                            </div>
                            <div className="text-[10px] bg-[var(--accent-main)]/10 text-[var(--accent-main)] font-black py-1 px-3 rounded-full w-fit uppercase tracking-widest">
                                Más reciente (Recomendado)
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
                                <Cloud size={20} />
                            </div>
                            <div>
                                <h5 className="font-black text-sm uppercase tracking-wider text-[var(--text-main)]">Versión Nube</h5>
                                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-0.5">Sincronizada previamente</p>
                            </div>
                        </div>
                        
                        <div className="mt-auto space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-[var(--text-muted)]">Último cambio:</span>
                                <span className="font-bold text-[var(--text-main)]">{formatDate(cloud.updatedAt)}</span>
                            </div>
                        </div>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CheckCircle2 size={24} className="text-indigo-500" />
                        </div>
                    </button>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg-editor)] border border-[var(--border-main)] italic text-center">
                    <p className="text-xs text-[var(--text-muted)]">
                        Protip: Si no estás seguro, elige la versión Local. Casi siempre contiene tu progreso más reciente.
                    </p>
                </div>
            </div>
        </Modal>
    );
};

export default SyncConflictModal;
