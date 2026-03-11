import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children }) => {
    // Close on escape
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEsc);
        }
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={onClose}></div>

            <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200 m-4">
                <div className="flex items-center justify-between p-5 border-b border-[var(--border-main)]">
                    <h3 className="text-xl font-bold text-[var(--text-main)] font-serif">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-editor)] hover:text-red-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
