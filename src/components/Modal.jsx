import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
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

    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-2xl',
        xl: 'max-w-5xl',
        '2xl': 'max-w-7xl',
        full: 'max-w-[95vw]'
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[4px] animate-in fade-in duration-300 px-4">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={onClose}></div>

            <div className={`relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-[0_30px_100px_rgba(0,0,0,0.5)] w-full ${sizeClasses[size] || sizeClasses.md} flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden`}>
                <div className="flex items-center justify-between p-6 border-b border-[var(--border-main)] bg-[var(--bg-editor)]/50">
                    <h3 className="text-xl md:text-2xl font-black text-[var(--text-main)] font-serif italic">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500 transition-all active:scale-95"
                    >
                        <X size={24} />
                    </button>
                </div>
                <div className="p-0 overflow-y-auto max-h-[85vh]">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
