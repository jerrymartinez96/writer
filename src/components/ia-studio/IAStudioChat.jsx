import React, { useState, useRef, useEffect } from 'react';
import IAStudioMessage from './IAStudioMessage';
import { Send, Loader2, Sparkles, Plus, ChevronDown, Check, Download } from 'lucide-react';

const API_LABELS = {
    openrouter: 'OpenRouter',
    google_direct: 'Google',
    deepseek: 'DeepSeek'
};

const IAStudioChat = ({
    messages,
    onSend,
    onShowDiff,
    isLoading,
    selectedAction,
    onNewChat,
    onOpenContext,
    onExport,
    QUICK_ACTIONS,
    selectedApi = 'openrouter',
    selectedModel = '',
}) => {
    const [inputValue, setInputValue] = useState('');
    const [showActionDropdown, setShowActionDropdown] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const currentAction = QUICK_ACTIONS?.find(a => a.id === selectedAction);

    // Auto-scroll
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Focus input
    useEffect(() => {
        if (!isLoading && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isLoading]);

    const handleActionChange = (actionId) => {
        window.dispatchEvent(new CustomEvent('ia-studio-action', { detail: actionId }));
        setShowActionDropdown(false);
    };

    const handleSend = () => {
        const trimmed = inputValue.trim();
        if (!trimmed || isLoading) return;
        onSend(trimmed);
        setInputValue('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-app)]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-[var(--border-main)] bg-[var(--bg-app)] shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shrink-0">
                        <Sparkles size={18} className="text-white" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-black text-[var(--text-main)]">IA Studio</h2>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 text-[8px] font-black uppercase tracking-wider leading-none">
                                {API_LABELS[selectedApi] || selectedApi}
                            </span>
                            <span className="text-[8px] font-medium text-[var(--text-muted)] truncate max-w-[120px]" title={selectedModel}>
                                {selectedModel?.split('/').pop() || '—'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* New chat button */}
                    <button
                        onClick={onNewChat}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-purple-500 hover:bg-purple-500/10 transition-all"
                        title="Nueva conversación"
                    >
                        <Plus size={12} /> Nuevo
                    </button>

                    {/* Context button */}
                    <button
                        onClick={onOpenContext}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all"
                        title="Contexto y Destino"
                    >
                        <Sparkles size={16} />
                    </button>

                    {/* Export button */}
                    {messages.length > 0 && onExport && (
                        <button
                            onClick={onExport}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all"
                            title="Exportar conversación"
                        >
                            <Download size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 scrollbar-hide">
                <div className="max-w-3xl mx-auto space-y-6">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center text-[var(--text-muted)]">
                            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center mb-6">
                                <Sparkles size={36} className="text-indigo-500 opacity-50" />
                            </div>
                            <p className="text-lg font-medium mb-2 text-[var(--text-main)]">
                                ¿En qué te ayudo?
                            </p>
                            <p className="text-xs font-medium opacity-60 max-w-md">
                                Selecciona el contexto a la izquierda, elige un destino y empieza a escribir.
                                Puedes analizar, modificar o crear contenido para tu manuscrito o Master Doc.
                            </p>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <IAStudioMessage
                                key={msg.id || i}
                                message={msg}
                                onShowDiff={onShowDiff}
                            />
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="px-4 lg:px-6 py-4 border-t border-[var(--border-main)] bg-[var(--bg-app)]">
                <div className="max-w-3xl mx-auto space-y-2">
                    {/* Action Selector - Custom Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowActionDropdown(!showActionDropdown)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-editor)] border border-[var(--border-main)] text-[9px] font-black uppercase tracking-widest text-[var(--text-main)] hover:bg-[var(--accent-soft)]/30 transition-all"
                        >
                            <Sparkles size={10} className="text-purple-500" />
                            <span>{currentAction?.label?.replace(/[💬✏️📝🔍💡]/g, '').trim() || 'Personalizado'}</span>
                            <ChevronDown size={10} className="text-[var(--text-muted)]" />
                        </button>

                        {showActionDropdown && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setShowActionDropdown(false)} />
                                <div className="absolute bottom-full left-0 mb-1 w-56 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl shadow-xl z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    {QUICK_ACTIONS?.map(action => (
                                        <button
                                            key={action.id}
                                            onClick={() => handleActionChange(action.id)}
                                            className={`w-full text-left px-3 py-2.5 text-xs transition-all flex items-center gap-2 ${
                                                action.id === selectedAction
                                                    ? 'bg-purple-500/10 text-purple-600 font-bold'
                                                    : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'
                                            }`}
                                        >
                                            <span className="text-sm">{action.label?.match(/^.{1,2}/)?.[0] || '💬'}</span>
                                            <div className="flex-1 min-w-0">
                                                <span className="block truncate">{action.label?.replace(/[💬✏️📝🔍💡]/g, '').trim()}</span>
                                                <span className="block text-[9px] text-[var(--text-muted)] opacity-60 truncate">{action.description}</span>
                                            </div>
                                            {action.id === selectedAction && (
                                                <Check size={12} className="text-purple-500 shrink-0" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Input + Send */}
                    <div className="flex items-center gap-2 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl px-5 py-3 focus-within:border-[var(--accent-main)] focus-within:ring-2 focus-within:ring-[var(--accent-main)]/20 transition-all shadow-sm">
                        <textarea
                            ref={inputRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Escribe tu mensaje... (Enter para enviar)"
                            className="flex-1 bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-40 focus:outline-none resize-none py-1 max-h-32 scrollbar-hide"
                            rows={1}
                            disabled={isLoading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isLoading}
                            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--accent-main)] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--accent-main)]/80 transition-all active:scale-95 shadow-md"
                        >
                            {isLoading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Send size={18} />
                            )}
                        </button>
                    </div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-30 mt-2 text-center">
                        Shift+Enter para nueva línea · Los mensajes se pierden al cerrar la app
                    </p>
                </div>
            </div>
        </div>
    );
};

export default IAStudioChat;
