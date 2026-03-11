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
            <div className="space-y-6">
                <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-16 h-16 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center">
                        <ShieldCheck size={40} />
                    </div>
                    <h3 className="text-xl font-black text-[var(--text-main)]">¡Misión Cumplida!</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-sm">
                        Estás a punto de marcar este capítulo como <strong>Finalizado</strong>. Esto indica que el contenido está listo para su versión definitiva.
                    </p>
                </div>

                <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                                <Trash2 size={18} />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-[var(--text-main)]">Optimizar Almacenamiento</h4>
                                <p className="text-[10px] text-[var(--text-muted)]">Eliminar respaldos temporales e históricos</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
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
                        <div className="flex items-start gap-2 p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-600/80 italic leading-relaxed">
                                Si no seleccionas esta opción, conservaremos todos tus respaldos históricos para que puedas consultarlos en el futuro desde el historial.
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3">
                    <button 
                        onClick={() => onConfirm(shouldCleanup)}
                        className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group"
                    >
                        <CheckCircle2 size={20} className="group-hover:scale-110 transition-transform" />
                        CONFIRMAR Y FINALIZAR
                    </button>
                    <button 
                        onClick={onClose}
                        className="w-full py-3 text-[var(--text-muted)] hover:text-[var(--text-main)] font-bold text-sm transition-colors text-center"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default FinalizeModal;
