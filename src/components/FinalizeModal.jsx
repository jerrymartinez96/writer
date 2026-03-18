import React, { useState } from 'react';
import Modal from './Modal';
import { ShieldCheck, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';

const FinalizeModal = ({ isOpen, onClose, onConfirm }) => {
    const [shouldCleanup, setShouldCleanup] = useState(false);

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Finalizar Capítulo"
            size="md"
        >
            <div className="p-8 space-y-8 font-sans">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 bg-indigo-500/5 text-indigo-500 rounded-full flex items-center justify-center border border-indigo-500/10 shadow-inner">
                        <ShieldCheck size={44} />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black text-[var(--text-main)] italic">¡Capítulo Finalizado!</h3>
                        <p className="text-sm text-[var(--text-muted)] max-w-xs leading-relaxed font-medium">
                            Estás a punto de marcar este capítulo como <strong>listo</strong> para su versión definitiva.
                        </p>
                    </div>
                </div>

                <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl p-6 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-red-500/5 text-red-500 border border-red-500/10">
                                <Trash2 size={20} />
                            </div>
                            <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-[var(--text-main)]">Limpiar Historial</h4>
                                <p className="text-[10px] font-bold text-[var(--text-muted)] opacity-60">Eliminar respaldos temporales previos</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer scale-110">
                            <input 
                                type="checkbox" 
                                checked={shouldCleanup} 
                                onChange={(e) => setShouldCleanup(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-[var(--border-main)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                        </label>
                    </div>

                    {!shouldCleanup && (
                        <div className="flex items-start gap-3 p-4 bg-amber-500/5 rounded-xl border border-amber-500/10">
                            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-600/80 font-bold italic leading-relaxed uppercase tracking-tighter">
                                Recomendado: conservar respaldos históricos para consultas futuras.
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3 pt-4 border-t border-[var(--border-main)]">
                    <button 
                        onClick={() => onConfirm(shouldCleanup)}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 active:scale-95"
                    >
                        <CheckCircle2 size={18} />
                        Confirmar Versión Final
                    </button>
                    <button 
                        onClick={onClose}
                        className="w-full py-3 text-[var(--text-muted)] hover:text-indigo-600 font-black text-[10px] uppercase tracking-[0.2em] transition-all text-center"
                    >
                        Volver al Editor
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default FinalizeModal;
