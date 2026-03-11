import React from 'react';
import Modal from './Modal';
import { AlertTriangle, Trash2, CheckCircle2 } from 'lucide-react';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirmar", cancelText = "Cancelar", type = "danger" }) => {
    const isDanger = type === "danger";

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="flex flex-col items-center text-center">
                <div className={`w-16 h-16 ${isDanger ? 'bg-red-500/10 text-red-500' : 'bg-indigo-500/10 text-indigo-500'} rounded-full flex items-center justify-center mb-6 shadow-xl`}>
                    {isDanger ? <Trash2 size={32} /> : <CheckCircle2 size={32} />}
                </div>
                
                <p className="text-[var(--text-main)] text-lg font-medium leading-relaxed mb-8">
                    {message}
                </p>

                <div className="flex flex-col sm:flex-row gap-3 w-full mt-4">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-3.5 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl font-black text-sm text-[var(--text-muted)] hover:bg-[var(--bg-app)] hover:text-indigo-500 transition-all shadow-sm active:scale-95"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`flex-1 px-6 py-3.5 ${isDanger ? 'bg-red-500 shadow-red-500/20' : 'bg-indigo-600 shadow-indigo-600/20'} text-white rounded-2xl font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ConfirmModal;
