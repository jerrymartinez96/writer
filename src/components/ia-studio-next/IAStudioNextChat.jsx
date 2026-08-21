import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Check, ChevronDown, Copy, Loader2, Plus, Send, Sparkles, Square, Trash2, Wrench } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useIAStudioContext } from '../../context/IAStudioContext';
import { useToolRooms } from '../../context/ToolRoomContext';
import * as SessionManager from '../../services/ai-next/CoreSessionStore';
import CoreContextConfigModal from './CoreContextConfigModal';
import AIService from '../../services/AIService';
import { createRequestEnvelope } from '../../services/ai-next/RequestEnvelope';
import { classifyCoreRequest } from '../../services/ai-next/CoreRouter';
import { classifyRequestIntent } from '../../services/ai-next/RequestIntentService';
import CoreOperationPanel from './CoreOperationPanel';
import { getConfiguredAIOptions, isManualAIExecution } from '../../services/ai-next/AIRequestOptions';
import { buildRegisteredPrompt } from '../../services/ai-next/PromptRegistry';

const getApiKey = (profile) => profile?.aiConfig?.deepseekApiKey || profile?.deepseekApiKey || window.localStorage.getItem('deepseekApiKey') || '';

const renderInlineMarkdown = (value) => {
    const tokens = String(value || '').split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^\s)]+\))/g).filter(Boolean);
    return tokens.map((token, index) => {
        if (token.startsWith('**') || token.startsWith('__')) return <strong key={index}>{token.slice(2, -2)}</strong>;
        if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) return <em key={index}>{token.slice(1, -1)}</em>;
        if (token.startsWith('`')) return <code key={index}>{token.slice(1, -1)}</code>;
        const link = token.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
        if (link) {
            const safeHref = /^(https?:|mailto:)/i.test(link[2]) ? link[2] : '#';
            return <a key={index} href={safeHref} target="_blank" rel="noreferrer">{link[1]}</a>;
        }
        return <React.Fragment key={index}>{token}</React.Fragment>;
    });
};

const MarkdownMessage = ({ content }) => {
    const lines = String(content || '').replace(/\r/g, '').split('\n');
    const blocks = [];
    let paragraph = [];
    const flushParagraph = () => {
        if (!paragraph.length) return;
        blocks.push(<span key={`p-${blocks.length}`} className="ia-md-paragraph">{paragraph.map((line, index) => <React.Fragment key={index}>{index > 0 && <br />}{renderInlineMarkdown(line)}</React.Fragment>)}</span>);
        paragraph = [];
    };
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.trim()) { flushParagraph(); continue; }
        if (/^```/.test(line)) {
            flushParagraph();
            const code = [];
            index += 1;
            while (index < lines.length && !/^```/.test(lines[index])) { code.push(lines[index]); index += 1; }
            blocks.push(<span key={`code-${blocks.length}`} className="ia-md-code-block"><code>{code.join('\n')}</code></span>);
            continue;
        }
        const heading = line.match(/^(#{1,4})\s+(.+)$/);
        if (heading) { flushParagraph(); blocks.push(<span key={`h-${blocks.length}`} className={`ia-md-heading ia-md-heading-${heading[1].length}`}>{renderInlineMarkdown(heading[2])}</span>); continue; }
        if (/^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) { flushParagraph(); blocks.push(<span key={`hr-${blocks.length}`} className="ia-md-divider" />); continue; }
        const list = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/);
        if (list) {
            flushParagraph();
            const ordered = /^\d/.test(list[1]);
            const items = [list[2]];
            while (index + 1 < lines.length) {
                const next = lines[index + 1].match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/);
                if (!next || /^\d/.test(next[1]) !== ordered) break;
                items.push(next[2]); index += 1;
            }
            blocks.push(<span key={`list-${blocks.length}`} className={`ia-md-list ${ordered ? 'ia-md-list-ordered' : ''}`}>{items.map((item, itemIndex) => <span className="ia-md-list-item" key={itemIndex}><span className="ia-md-marker">{ordered ? `${itemIndex + 1}.` : '•'}</span><span className="ia-md-list-content">{renderInlineMarkdown(item)}</span></span>)}</span>);
            continue;
        }
        const quote = line.match(/^\s*>\s?(.*)$/);
        if (quote) { flushParagraph(); blocks.push(<span key={`quote-${blocks.length}`} className="ia-md-quote">{renderInlineMarkdown(quote[1])}</span>); continue; }
        paragraph.push(line);
    }
    flushParagraph();
    return <span className="ia-markdown">{blocks}</span>;
};

const toDisplayMessage = (message) => ({ ...message, content: <MarkdownMessage content={message.content} /> });

const SessionToolbar = ({ sessions, activeSession, onSwitch, onNew }) => {
    const { deleteSession: removeSession } = useIAStudioContext();
    const [open, setOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const containerRef = useRef(null);
    useEffect(() => {
        const close = (event) => { if (!containerRef.current?.contains(event.target)) setOpen(false); };
        const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', closeOnEscape);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', closeOnEscape); };
    }, []);
    const selectSession = (sessionId) => { onSwitch(sessionId); setOpen(false); };
    const removeActiveSession = () => {
        if (!activeSession) return;
        setConfirmDelete(true);
    };
    return <><div className="flex items-center gap-2"><div ref={containerRef} className="relative"><button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex max-w-48 items-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] px-3 py-2 text-[10px] font-black outline-none transition-colors hover:border-indigo-500 focus:border-indigo-500"><span className="max-w-32 truncate">{activeSession?.name || 'Seleccionar sesión'}</span><ChevronDown size={13} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} /></button>{open && <div role="listbox" aria-label="Sesiones del Core" className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-1.5 shadow-2xl">{sessions.length === 0 ? <p className="px-3 py-2 text-xs text-[var(--text-muted)]">No hay sesiones.</p> : sessions.map((session) => <button key={session.id} type="button" role="option" aria-selected={activeSession?.id === session.id} onClick={() => selectSession(session.id)} className={`w-full rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${activeSession?.id === session.id ? 'bg-indigo-500/10 text-indigo-500' : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'}`}><span className="block truncate">{session.name}</span><span className="mt-0.5 block text-[9px] font-medium text-[var(--text-muted)]">{session.messages?.length || 0} mensajes</span></button>)}</div>}</div><button type="button" onClick={onNew} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-main)] px-2.5 py-2 text-[10px] font-black text-[var(--text-muted)] hover:border-indigo-500 hover:text-indigo-500" title="Nueva sesión"><Plus size={13} /> <span className="hidden sm:inline">Nueva</span></button><button type="button" onClick={removeActiveSession} disabled={!activeSession} className="inline-flex items-center justify-center rounded-xl border border-[var(--border-main)] px-2.5 py-2 text-[var(--text-muted)] hover:border-red-500 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40" title="Eliminar conversación" aria-label="Eliminar conversación"><Trash2 size={14} /></button></div>{confirmDelete && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(false); }}><div role="dialog" aria-modal="true" aria-labelledby="delete-session-title" className="w-full max-w-sm rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 shadow-2xl"><h2 id="delete-session-title" className="text-base font-black">¿Eliminar la conversación?</h2><p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">Se eliminará «{activeSession?.name}» y sus mensajes.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black text-[var(--text-muted)]">Cancelar</button><button type="button" onClick={() => { removeSession(activeSession.id); setConfirmDelete(false); }} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-500">Eliminar</button></div></div></div>}</>;
};

const ContextToolbar = ({ chapters, characters, worldItems, selections }) => {
    const [open, setOpen] = useState(false);
    const groups = [
        { key: 'chapterIds', label: 'Capítulos', items: chapters, getId: (item) => item.id, getName: (item) => item.title },
        { key: 'characterIds', label: 'Personajes', items: characters, getId: (item) => item.id, getName: (item) => item.name },
        { key: 'worldItemIds', label: 'Mundo', items: worldItems, getId: (item) => item.id, getName: (item) => item.title },
    ];
    const total = groups.reduce((sum, group) => sum + (selections?.[group.key]?.length || 0), 0);
    return <><button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] px-3 py-2 text-[10px] font-black text-[var(--text-muted)] hover:border-indigo-500 hover:text-indigo-500"><span>Contexto</span><span className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-indigo-500">{total}</span><ChevronDown size={13} /></button><CoreContextConfigModal isOpen={open} onClose={() => setOpen(false)} chapters={chapters} worldItems={worldItems} characters={characters} /></>;
};

const IAStudioNextChat = ({ onBack }) => {
    const { activeBook, activeChapter, chapters = [], characters = [], worldItems = [], profile } = useData();
    const { messages: storedMessages, setMessages: setStoredMessages, sessions, activeSession, switchSession, newSession, contextSelections, deleteMessage } = useIAStudioContext();
    const { openToolRoom } = useToolRooms();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [operation, setOperation] = useState(null);
    const [copiedMessageId, setCopiedMessageId] = useState(null);
    const [messagePendingDeletion, setMessagePendingDeletion] = useState(null);
    const abortControllerRef = useRef(null);
    const context = useMemo(() => {
        const selectedChapters = chapters.filter((item) => (contextSelections?.chapterIds || []).includes(item.id));
        const selectedCharacters = characters.filter((item) => (contextSelections?.characterIds || []).includes(item.id));
        const selectedWorld = worldItems.filter((item) => (contextSelections?.worldItemIds || []).includes(item.id));
        const selected = [...selectedChapters.map((item) => `Capítulo: ${item.title}\n${item.content || ''}`), ...selectedCharacters.map((item) => `Personaje: ${item.name}\n${item.description || ''}`), ...selectedWorld.map((item) => `Mundo: ${item.title}\n${item.content || ''}`)];
        if (selected.length) return selected.join('\n\n');
        return activeChapter ? `Capítulo activo: ${activeChapter.title}\n${activeChapter.content || ''}` : 'No hay un capítulo activo seleccionado.';
    }, [activeChapter, chapters, characters, worldItems, contextSelections]);

    useEffect(() => {
        const initialMessages = storedMessages?.length ? storedMessages : [{ role: 'assistant', content: 'Soy el Core de IA Studio. Puedo conversar, analizar tu obra y derivar trabajos especializados a la Tool Room adecuada.' }];
        setMessages(initialMessages.map(toDisplayMessage));
    }, [activeSession?.id, storedMessages]);

    const appendMessage = (message) => {
        const nextMessage = { ...message, id: message.id || `next-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        setMessages((previous) => [...previous, toDisplayMessage(nextMessage)]);
        setStoredMessages((previous) => [...previous, nextMessage]);
        if (activeSession?.id) SessionManager.addMessage(activeSession.id, nextMessage);
    };

    const removeMessage = (message) => {
        if (!message?.id) return;
        setMessagePendingDeletion(message);
    };

    const confirmRemoveMessage = () => {
        if (!messagePendingDeletion?.id) return;
        const messageId = messagePendingDeletion.id;
        deleteMessage(messageId);
        setMessages((previous) => previous.filter((item) => item.id !== messageId));
        setMessagePendingDeletion(null);
    };

    const copyMessage = async (message) => {
        if (!message?.id) return;
        const storedMessage = storedMessages.find((item) => item.id === message.id);
        const text = String(storedMessage?.content ?? message.content ?? '');
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMessageId(message.id);
            window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? null : current), 1600);
        } catch (copyError) {
            setError(copyError?.message || 'No se pudo copiar el mensaje al portapapeles.');
        }
    };

    const send = async () => {
        const message = input.trim();
        if (!message || loading) return;
        const selectedContext = {
            chapterIds: contextSelections?.chapterIds?.length ? contextSelections.chapterIds : (activeChapter?.id ? [activeChapter.id] : []),
            characterIds: contextSelections?.characterIds || [],
            worldItemIds: contextSelections?.worldItemIds || [],
        };
        const envelope = createRequestEnvelope({ userMessage: message, activeBookId: activeBook?.id, context: selectedContext });
        setInput(''); setError(''); appendMessage({ role: 'user', content: message });
        let route;
        setLoading(true);
        if (isManualAIExecution(profile)) {
            // En modo manual evitamos pedir al usuario un viaje adicional solo
            // para clasificar. El enrutador local conserva una única interacción
            // de copiar/pegar para la solicitud que realmente produce valor.
            route = { ...classifyCoreRequest(envelope), classificationFallback: true };
        } else {
            try {
                const intent = await classifyRequestIntent({ profile, message, context });
                if (intent.intent === 'change') {
                    const multi = intent.scope === 'multiple' || intent.changeType === 'continuity';
                    route = {
                        route: 'core',
                        capability: multi ? 'multi_patch' : 'patch',
                        impactLevel: 'medium',
                        recommendedTool: intent.recommendedTool === 'none' ? (intent.changeType === 'continuity' ? 'coherence' : null) : intent.recommendedTool,
                        confidence: intent.confidence,
                        reason: intent.reason,
                    };
                } else {
                    const fallbackRoute = classifyCoreRequest(envelope);
                    route = intent.intent === 'specialized' && fallbackRoute.route === 'toolroom'
                        ? fallbackRoute
                        : { route: 'core', capability: intent.intent === 'analysis' ? 'analyze' : 'chat', toolId: null, confidence: intent.confidence, needsConfirmation: false, reason: intent.reason };
                }
            } catch {
                // La clasificación es una ayuda de enrutamiento, no debe bloquear el chat.
                route = { ...classifyCoreRequest(envelope), classificationFallback: true };
            }
        }
        if (route.capability === 'patch' || route.capability === 'multi_patch') {
            if (route.recommendedTool === 'global-constructor') {
                setLoading(false);
                try { window.sessionStorage.setItem('verne-ia-studio-launch', JSON.stringify({ roomId: 'global-constructor', prompt: message, context: envelope.context, contextLabel: activeChapter?.title || '', createdAt: new Date().toISOString() })); } catch { /* navigation continues */ }
                openToolRoom('toolroom:global-constructor');
                return;
            }
            setLoading(false);
            setOperation({ request: { message, context: envelope.context, impactLevel: route.impactLevel, recommendedTool: route.recommendedTool }, capability: route.capability });
            return;
        }
        if (route.route === 'toolroom' && route.toolId) {
            setLoading(false);
            try { window.sessionStorage.setItem('verne-ia-studio-launch', JSON.stringify({ roomId: route.toolId, prompt: message, context: envelope.context, contextLabel: activeChapter?.title || '', createdAt: new Date().toISOString() })); } catch { /* navigation continues */ }
            openToolRoom(`toolroom:${route.toolId}`);
            return;
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        setLoading(true);
        try {
            const key = getApiKey(profile);
            if (!key && !isManualAIExecution(profile)) throw new Error('Configura una API Key de DeepSeek para usar el Core.');
            const prompt = buildRegisteredPrompt('coreChat', { capability: route.capability, message, context });
            const response = await AIService.sendMessage(prompt, key, getConfiguredAIOptions(profile, { temperature: 0.35, responseMode: 'text', max_tokens: 3000, signal: abortController.signal }));
            appendMessage({ role: 'assistant', content: response, route });
        } catch (requestError) {
            if (requestError?.name !== 'AbortError') setError(requestError?.message || 'No se pudo completar la respuesta.');
        } finally {
            if (abortControllerRef.current === abortController) abortControllerRef.current = null;
            setLoading(false);
        }
    };

    const stop = () => abortControllerRef.current?.abort();

    return <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)]"><header className="shrink-0 border-b border-[var(--border-main)] bg-[var(--bg-app)]/90 px-3 py-2.5 sm:px-4 lg:px-8"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2.5"><div className="flex min-w-0 items-center gap-2.5"><button type="button" onClick={onBack} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border-main)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]"><ArrowLeft size={14} /> <span className="hidden xs:inline">IA Studio</span></button><div className="hidden h-6 w-px bg-[var(--border-main)] sm:block" /><div className="flex min-w-0 items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"><Bot size={16} /></span><div className="min-w-0"><p className="truncate text-[8px] font-black uppercase tracking-[0.16em] text-indigo-500">Core IA Studio</p><h1 className="truncate text-sm font-serif font-black">Chat principal</h1></div></div></div><div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto"><SessionToolbar sessions={sessions} activeSession={activeSession} onSwitch={switchSession} onNew={newSession} /><ContextToolbar selections={contextSelections} chapters={chapters} characters={characters} worldItems={worldItems} /></div></div></header><div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-3xl space-y-3 p-3 sm:space-y-4 sm:p-4 lg:p-8">{messages.map((item, index) => <article key={item.id || `${item.role}-${index}`} className={`group relative rounded-2xl border p-3.5 sm:p-4 ${item.role === 'user' ? 'sm:ml-8 border-indigo-500/20 bg-indigo-500/5' : 'sm:mr-8 border-[var(--border-main)] bg-[var(--bg-editor)]'}`}><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">{item.role === 'assistant' ? <Bot size={13} className="shrink-0 text-indigo-500" /> : <Wrench size={13} className="shrink-0 text-amber-500" />} {item.role === 'assistant' ? 'Core IA' : 'Tú'}{item.route && <span className="ml-auto rounded-full bg-indigo-500/10 px-2 py-1 text-[9px] text-indigo-500">Core · {item.route.capability}</span>}{item.id && <div className="ml-auto flex items-center gap-1"><button type="button" onClick={() => copyMessage(item)} className="rounded-lg p-1 text-[var(--text-muted)] opacity-60 hover:bg-indigo-500/10 hover:text-indigo-500 group-hover:opacity-100" title="Copiar mensaje" aria-label="Copiar mensaje">{copiedMessageId === item.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}</button><button type="button" onClick={() => removeMessage(item)} className="rounded-lg p-1 text-[var(--text-muted)] opacity-60 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100" title="Eliminar mensaje" aria-label="Eliminar mensaje"><Trash2 size={14} /></button></div>}</div><p className="mt-2.5 whitespace-pre-wrap break-words text-sm leading-relaxed sm:mt-3">{item.content}</p></article>)}{loading && <div className="sm:mr-8 flex items-center gap-2 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-3.5 text-xs text-[var(--text-muted)] sm:p-4"><Loader2 size={15} className="shrink-0 animate-spin text-indigo-500" /> El Core está consultando la IA…</div>}{error && <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</div>}{operation && <CoreOperationPanel request={operation.request} capability={operation.capability} onClose={() => setOperation(null)} />}</div></div><div className="shrink-0 border-t border-[var(--border-main)] bg-[var(--bg-app)]/95 px-3 py-2.5 backdrop-blur-xl sm:p-4"><div className="mx-auto max-w-3xl"><div className="relative"><textarea aria-label="Mensaje para Core IA Studio" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} rows={1} placeholder="Escribe una pregunta o instrucción…" className="min-h-12 w-full resize-none rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] px-4 py-3 pr-14 text-sm leading-6 outline-none placeholder:text-center focus:border-indigo-500 sm:min-h-14 sm:px-5 sm:py-3.5 sm:pr-14" /><button type="button" onClick={loading ? stop : send} disabled={!loading && !input.trim()} aria-label={loading ? 'Parar respuesta' : 'Enviar mensaje'} title={loading ? 'Parar respuesta' : 'Enviar mensaje'} className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-white transition-colors ${loading ? 'bg-rose-500 hover:bg-rose-400' : 'bg-indigo-600 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40'}`}>{loading ? <Square size={14} fill="currentColor" /> : <Send size={15} />}</button></div></div></div>{messagePendingDeletion && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMessagePendingDeletion(null); }}><div role="dialog" aria-modal="true" aria-labelledby="delete-message-title" className="w-full max-w-sm rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 shadow-2xl"><h2 id="delete-message-title" className="text-base font-black">¿Eliminar este mensaje?</h2><p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">El mensaje se quitará de esta conversación.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setMessagePendingDeletion(null)} className="rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black text-[var(--text-muted)] hover:text-[var(--text-main)]">Cancelar</button><button type="button" onClick={confirmRemoveMessage} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-500">Eliminar</button></div></div></div>}</section>;
};

export default IAStudioNextChat;
