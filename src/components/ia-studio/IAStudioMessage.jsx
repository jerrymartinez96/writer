import React, { useState, useMemo } from 'react';
import { User, Bot, FileDiff, Copy, Check, RotateCw, FileText, Lightbulb, Search } from 'lucide-react';

/**
 * Renders the content of an assistant message based on its responseType.
 *
 * - 'content'    → green preview pill (HTML generated, use diff to review)
 * - 'analysis'   → plain text rendered natively
 * - 'suggestion' → plain text rendered natively
 * - 'error'      → plain text red message
 * - default      → whitespace-pre-wrap (streaming / unknown)
 */
const MessageContent = ({ content, responseType, isStreaming }) => {
    // Skeleton while waiting for first chunk
    if (isStreaming && !content) {
        return (
            <div className="space-y-2 py-1 min-w-[200px] sm:min-w-[300px]">
                <div className="h-3 w-11/12 rounded bg-gradient-to-r from-[var(--border-main)] via-[var(--accent-soft)] to-[var(--border-main)] bg-[length:200%_100%] animate-shimmer" />
                <div className="h-3 w-4/5 rounded bg-gradient-to-r from-[var(--border-main)] via-[var(--accent-soft)] to-[var(--border-main)] bg-[length:200%_100%] animate-shimmer" style={{ animationDelay: '0.15s' }} />
                <div className="h-3 w-2/3 rounded bg-gradient-to-r from-[var(--border-main)] via-[var(--accent-soft)] to-[var(--border-main)] bg-[length:200%_100%] animate-shimmer" style={{ animationDelay: '0.3s' }} />
            </div>
        );
    }

    // Streaming in progress — show raw text + cursor
    if (isStreaming) {
        return (
            <div>
                <span className="whitespace-pre-wrap">{content}</span>
                <span className="inline-block w-2 h-4 bg-[var(--accent-main)] ml-0.5 animate-pulse" />
            </div>
        );
    }

    // Content response — show a clean "document ready" indicator
    if (responseType === 'content') {
        return (
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={14} className="text-emerald-500" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-[var(--text-main)] leading-snug">
                        Contenido generado
                    </p>
                    {content && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed line-clamp-3 opacity-70">
                            {content}
                        </p>
                    )}
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mt-2 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Haz clic en "Ver Cambios" para revisar y aplicar
                    </p>
                </div>
            </div>
        );
    }

    // Analysis or suggestion — render with plain text
    if (responseType === 'analysis' || responseType === 'suggestion') {
        return (
            <div className="whitespace-pre-wrap text-[var(--text-main)]">
                {content}
            </div>
        );
    }

    // Error messages — render with plain text
    if (responseType === 'error') {
        return (
            <div className="whitespace-pre-wrap text-rose-500 font-medium">
                {content}
            </div>
        );
    }

    return <div className="whitespace-pre-wrap">{content}</div>;
};

const IAStudioMessage = ({ message, onShowDiff, onRegenerate, isLast }) => {
    const isUser = message.role === 'user';
    const isStreaming = message.isStreaming;
    const responseType = message.responseType || 'analysis';
    const [copied, setCopied] = useState(false);

    // Determine if this message has applicable content (to show diff button)
    const hasApplicableContent = !isUser && !isStreaming && responseType === 'content';

    // Determine icon for the response type
    const ResponseTypeIcon = useMemo(() => {
        if (responseType === 'analysis') return Search;
        if (responseType === 'suggestion') return Lightbulb;
        return Bot;
    }, [responseType]);

    const handleCopy = () => {
        if (!message.content) return;
        
        // Strip out HTML tags for a clean plain-text clipboard copy
        const cleanContent = message.content
            .replace(/<[^>]*>/g, '')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/#{1,6}\s/g, '')
            .trim();
            
        navigator.clipboard.writeText(cleanContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${isUser ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
                isUser
                    ? 'bg-[var(--accent-main)] text-white shadow-md'
                    : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md'
            }`}>
                {isUser ? <User size={14} /> : <ResponseTypeIcon size={14} />}
            </div>

            {/* Content */}
            <div className={`flex-1 max-w-[88%] sm:max-w-[80%] ${isUser ? 'text-right' : ''}`}>
                <div className={`inline-block text-left px-4 py-3 rounded-2xl text-sm leading-relaxed relative group transition-all ${
                    isUser
                        ? 'bg-[var(--accent-main)] text-white rounded-tr-md'
                        : 'bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-tl-md text-[var(--text-main)] pr-10'
                }`}>
                    {/* Floating Hover Copy Button (desktop) */}
                    {!isUser && !isStreaming && message.content && responseType !== 'content' && (
                        <button
                            onClick={handleCopy}
                            className="absolute top-2 right-2 w-6 h-6 rounded-md bg-[var(--bg-app)] border border-[var(--border-main)] flex items-center justify-center text-[var(--text-muted)] hover:text-emerald-500 hover:border-emerald-500/30 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shadow-sm active:scale-90"
                            title="Copiar respuesta"
                        >
                            {copied ? (
                                <Check size={11} className="text-emerald-500 animate-in zoom-in-50 duration-200" strokeWidth={3} />
                            ) : (
                                <Copy size={11} className="transition-transform group-hover:scale-110 duration-200" />
                            )}
                        </button>
                    )}

                    <MessageContent
                        content={message.content}
                        responseType={responseType}
                        isStreaming={isStreaming}
                    />
                </div>

                {/* Actions for assistant messages */}
                {!isUser && !isStreaming && message.content && (
                    <div className="flex items-center gap-2 mt-1.5 px-1">
                        {/* Diff Viewer Button — only for content type */}
                        {hasApplicableContent && (
                            <button
                                onClick={() => onShowDiff(message.content)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:bg-indigo-500/10 transition-all"
                                title="Ver cambios propuestos"
                            >
                                <FileDiff size={12} />
                                Ver Cambios
                            </button>
                        )}

                        {/* Copy Button — for text-based responses */}
                        {responseType !== 'content' && (
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-emerald-500 hover:bg-emerald-500/10 transition-all"
                                title="Copiar texto de respuesta"
                            >
                                {copied ? (
                                    <Check size={12} className="animate-in zoom-in-50 duration-200" strokeWidth={3} />
                                ) : (
                                    <Copy size={12} />
                                )}
                                <span>{copied ? 'Copiado' : 'Copiar'}</span>
                            </button>
                        )}

                        {/* Regenerate Button — last message only */}
                        {isLast && onRegenerate && (
                            <button
                                onClick={onRegenerate}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-purple-500 hover:bg-purple-500/10 transition-all"
                                title="Regenerar última respuesta"
                            >
                                <RotateCw size={12} />
                                <span>Regenerar</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default IAStudioMessage;
