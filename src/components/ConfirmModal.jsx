import React from 'react';
import Modal from './Modal';
import { AlertTriangle, Trash2, CheckCircle2 } from 'lucide-react';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirmar", cancelText = "Cancelar", type = "danger" }) => {
    const isDanger = type === "danger";

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="p-8 space-y-8 flex flex-col items-center text-center font-sans">
                <div className={`w-20 h-20 ${isDanger ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'} rounded-full flex items-center justify-center border shadow-inner`}>
                    {isDanger ? <Trash2 size={36} /> : <CheckCircle2 size={36} />}
                </div>
                
                <p className="text-[var(--text-main)] text-xl font-bold leading-relaxed tracking-tight">
                    {message}
                </p>

                <div className="flex flex-col sm:flex-row gap-3 w-full border-t border-[var(--border-main)] pt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-4 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] hover:bg-[var(--bg-app)] hover:text-indigo-500 transition-all shadow-sm active:scale-95"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`flex-1 px-8 py-4 ${isDanger ? 'bg-red-500 shadow-red-500/20 hover:bg-red-600' : 'bg-indigo-600 shadow-indigo-600/20 hover:bg-indigo-700'} text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ConfirmModal;
