import React from 'react';
import { User, Bot, FileDiff } from 'lucide-react';

const IAStudioMessage = ({ message, onShowDiff }) => {
    const isUser = message.role === 'user';
    const isStreaming = message.isStreaming;

    return (
        <div className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${isUser ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
                isUser
                    ? 'bg-[var(--accent-main)] text-white shadow-md'
                    : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md'
            }`}>
                {isUser ? <User size={14} /> : <Bot size={14} />}
            </div>

            {/* Content */}
            <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
                <div className={`inline-block text-left px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    isUser
                        ? 'bg-[var(--accent-main)] text-white rounded-tr-md'
                        : 'bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-tl-md text-[var(--text-main)]'
                }`}>
                    {isStreaming ? (
                        <div>
                            <span>{message.content}</span>
                            <span className="inline-block w-2 h-4 bg-[var(--accent-main)] ml-0.5 animate-pulse" />
                        </div>
                    ) : (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                    )}
                </div>

                {/* Acciones para mensajes de la IA */}
                {!isUser && !isStreaming && message.content && (
                    <div className="flex items-center gap-2 mt-1.5 px-1">
                        <button
                            onClick={() => onShowDiff(message.content)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:bg-indigo-500/10 transition-all"
                            title="Ver cambios propuestos"
                        >
                            <FileDiff size={12} />
                            Ver Cambios
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default IAStudioMessage;
