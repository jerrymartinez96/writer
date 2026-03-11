import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};

const ICONS = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const STYLES = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    error: 'border-red-500/30 bg-red-500/10 text-red-400',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    info: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
};

const ICON_STYLES = {
    success: 'text-emerald-500',
    error: 'text-red-500',
    warning: 'text-amber-500',
    info: 'text-blue-500',
};

let toastId = 0;

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', duration = 3500) => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, message, type, exiting: false }]);
        setTimeout(() => {
            setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 300);
        }, duration);
        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 300);
    }, []);

    const toast = useCallback({
        success: (msg, dur) => addToast(msg, 'success', dur),
        error: (msg, dur) => addToast(msg, 'error', dur),
        warning: (msg, dur) => addToast(msg, 'warning', dur),
        info: (msg, dur) => addToast(msg, 'info', dur),
    }, [addToast]);

    // Reassign to make it callable with methods
    const toastApi = (msg, type, dur) => addToast(msg, type, dur);
    toastApi.success = (msg, dur) => addToast(msg, 'success', dur);
    toastApi.error = (msg, dur) => addToast(msg, 'error', dur);
    toastApi.warning = (msg, dur) => addToast(msg, 'warning', dur);
    toastApi.info = (msg, dur) => addToast(msg, 'info', dur);

    return (
        <ToastContext.Provider value={toastApi}>
            {children}
            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
                {toasts.map(t => {
                    const Icon = ICONS[t.type] || Info;
                    return (
                        <div
                            key={t.id}
                            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 ${STYLES[t.type]} ${t.exiting ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100 animate-in slide-in-from-right-5 fade-in'
                                }`}
                        >
                            <Icon size={18} className={`shrink-0 mt-0.5 ${ICON_STYLES[t.type]}`} />
                            <p className="text-sm font-semibold text-[var(--text-main)] flex-1 font-[Arial,sans-serif]">{t.message}</p>
                            <button
                                onClick={() => removeToast(t.id)}
                                className="shrink-0 p-0.5 rounded-lg hover:bg-white/10 transition-colors text-[var(--text-muted)]"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
};
