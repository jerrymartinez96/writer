import { useState, useCallback, useEffect, useRef } from 'react';
import {
    buildContextFromSelections,
    buildSystemPrompt,
    parseDestinationsFromResponse,
    tryParseAIJsonExported,
    findDestinationDoc,
    cleanText,
    cleanHtmlToPlainText,
    plainTextToHtml,
    smartMergePartialResponse,
    applyPatch,
    SYSTEM_WORLD_ITEM_IDS,
    parseInconsistenciesFromResponse,
    SYSTEM_WORLD_ITEM_LABELS,
    parseToolCallResponse,
    QUICK_ACTIONS,
} from '../IAStudioUtils';
import { classifyAction } from '../utils/intentClassifier';

import { AIService } from '../../../services/AIService';
import { useData } from '../../../context/DataContext';
import { useIAStudioContext } from '../../../context/IAStudioContext';
import SessionManager from '../IAStudioSessionManager';

const generateMsgId = () => 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 12);

/**
 * Cleans a previous assistant message content before sending it back to the AI as history.
 * Removes HTML tags and trims JSON wrappers so we don't waste tokens.
 */
const sanitizeMessageForHistory = (content) => {
    if (!content) return '';

    const parsed = tryParseAIJsonExported(content);
    if (parsed) {
        if (parsed.type === 'content' && parsed.html) {
            const wordCount = cleanText(parsed.html).split(/\s+/).filter(Boolean).length;
            return `[Contenido generado — ${wordCount} palabras]`;
        }
        if (parsed.type === 'patch') {
            return `[Fragmento editado — "${(parsed.original || '').substring(0, 60)}..."]`;
        }
        if (parsed.type === 'section') {
            return `[Sección ${parsed.sectionIndex || '?'} generada — ${cleanText(parsed.html || '').split(/\s+/).filter(Boolean).length} palabras]`;
        }
        if (parsed.text) return parsed.text;
    }

    return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

export const useIAStudioState = () => {
    const {
        activeBook, activeChapter, activeWorldDoc, chapters, characters, worldItems,
        saveChapterContent, saveWorldDocContent, updateChapter, updateWorldItem, createChapter,
        profile, updateBookData, lazyLoadChapters, saveDocumentSnapshot,
        editor
    } = useData();

    const { 
        contextSelections, 
        destinationDoc, 
        onContextChange, 
        onDestinationChange,
        sessions,
        activeSession,
        messages,
        setMessages,
        setSessions,
        setActiveSession,
        newSession,
        deleteSession,
        renameSession,
        compressContext,
        setCompressContext,
        deleteMessage
    } = useIAStudioContext();

    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingAutoCorrect, setIsLoadingAutoCorrect] = useState(false);
    const [diffBlocks, setDiffBlocks] = useState(null);
    const [showContextModal, setShowContextModal] = useState(false);
    const [showDestinationModal, setShowDestinationModal] = useState(false);
    const [selectedAction, setSelectedAction] = useState('chat');

    // Modo sección: acumulación de secciones generadas
    const [sectionMode, setSectionMode] = useState(false);
    const [sectionConfig, setSectionConfig] = useState(null); // { total, descriptions[] }
    const [currentSectionIndex, setCurrentSectionIndex] = useState(1);
    const [accumulatedSections, setAccumulatedSections] = useState([]);

    // Fragmento activo (para modo patch)
    const [activeFragment, setActiveFragment] = useState('');

    // Inconsistencia activa que se está resolviendo
    const [activeResolution, setActiveResolution] = useState(null); // { messageId, inconsistencyId, title, option, customText, retryCount }

    const lastUserMessageRef = useRef('');
    const lastParsedBlocksRef = useRef([]);
    const abortControllerRef = useRef(null);
    const messagesRef = useRef([]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    const activeResolutionRef = useRef(null);
    useEffect(() => { activeResolutionRef.current = activeResolution; }, [activeResolution]);

    // AI settings resolved from profile.aiConfig
    const aiConfig = profile?.aiConfig || {};
    const defaultModel = aiConfig.defaultModel || 'deepseek-v4-flash';
    const temperature = aiConfig.temperature ?? 0.7;

    // Local overrides for model, reasoning mode and reasoning effort in the active chat session
    const [chatModel, setChatModel] = useState('');
    const [chatReasoningMode, setChatReasoningMode] = useState(false);
    const [chatReasoningEffort, setChatReasoningEffort] = useState('high');

    // Sync model preferences when activeSession or profile changes
    useEffect(() => {
        if (activeSession) {
            setChatModel(activeSession.selectedModel || profile?.aiConfig?.defaultModel || 'deepseek-v4-flash');
            setChatReasoningMode(activeSession.chatReasoningMode ?? profile?.aiConfig?.reasoningMode ?? false);
            setChatReasoningEffort(activeSession.chatReasoningEffort || profile?.aiConfig?.reasoningEffort || 'high');
        } else if (profile?.aiConfig) {
            setChatModel(profile.aiConfig.defaultModel || 'deepseek-v4-flash');
            setChatReasoningMode(profile.aiConfig.reasoningMode ?? false);
            setChatReasoningEffort(profile.aiConfig.reasoningEffort || 'high');
        }
    }, [activeSession?.id, profile?.aiConfig]);

    const handleModelChange = useCallback((modelId) => {
        setChatModel(modelId);
        if (activeSession) {
            SessionManager.updateSessionModelConfig(activeSession.id, { selectedModel: modelId });
            setActiveSession(prev => prev ? { ...prev, selectedModel: modelId } : prev);
            setSessions(SessionManager.getSessions());
        }
    }, [activeSession, setActiveSession, setSessions]);

    const handleReasoningModeChange = useCallback((mode) => {
        setChatReasoningMode(mode);
        if (activeSession) {
            SessionManager.updateSessionModelConfig(activeSession.id, { chatReasoningMode: mode });
            setActiveSession(prev => prev ? { ...prev, chatReasoningMode: mode } : prev);
            setSessions(SessionManager.getSessions());
        }
    }, [activeSession, setActiveSession, setSessions]);

    const handleReasoningEffortChange = useCallback((effort) => {
        setChatReasoningEffort(effort);
        if (activeSession) {
            SessionManager.updateSessionModelConfig(activeSession.id, { chatReasoningEffort: effort });
            setActiveSession(prev => prev ? { ...prev, chatReasoningEffort: effort } : prev);
            setSessions(SessionManager.getSessions());
        }
    }, [activeSession, setActiveSession, setSessions]);

    // Listen for action changes from sidebar
    useEffect(() => {
        const handler = (e) => setSelectedAction(e.detail);
        window.addEventListener('ia-studio-action', handler);
        return () => window.removeEventListener('ia-studio-action', handler);
    }, []);

    // Listen for context modal from sidebar
    useEffect(() => {
        const openCtx = () => setShowContextModal(true);
        window.addEventListener('open-context-modal', openCtx);
        return () => window.removeEventListener('open-context-modal', openCtx);
    }, []);

    const handleActionChange = useCallback((actionId) => {
        setSelectedAction(actionId);
    }, []);

    const handleFragmentChange = useCallback((fragmentValue) => {
        setActiveFragment(fragmentValue || '');
    }, []);

    const handleSectionModeChange = useCallback((config) => {
        if (config) {
            setSectionMode(true);
            setSectionConfig(config);
            setCurrentSectionIndex(1);
            setAccumulatedSections([]);
        } else {
            setSectionMode(false);
            setSectionConfig(null);
            setCurrentSectionIndex(1);
            setAccumulatedSections([]);
        }
    }, []);

    // Automatically select all chapters and world items by default for new/empty context selections
    useEffect(() => {
        if ((chapters && chapters.length > 0) || (worldItems && worldItems.length > 0)) {
            const hasChapters = chapters && chapters.length > 0;
            const hasWorldItems = worldItems && worldItems.length > 0;

            if (contextSelections && !contextSelections.hasBeenInitialized) {
                const allChapterIds = hasChapters
                    ? chapters.filter(c => !c.isVolume).map(c => c.id)
                    : [];

                const customWorldItemIds = hasWorldItems
                    ? worldItems.filter(w => !SYSTEM_WORLD_ITEM_IDS.includes(w.id)).map(w => w.id)
                    : [];
                const allWorldItemIds = [
                    ...SYSTEM_WORLD_ITEM_IDS,
                    ...customWorldItemIds
                ];

                onContextChange({
                    chapterIds: allChapterIds,
                    worldItemIds: allWorldItemIds,
                    hasBeenInitialized: true
                });
            }
        }
    }, [chapters, worldItems, contextSelections, onContextChange]);

    // Lazy-load context chapters in the background when selections change
    useEffect(() => {
        if (contextSelections?.chapterIds && contextSelections.chapterIds.length > 0 && lazyLoadChapters) {
            lazyLoadChapters(contextSelections.chapterIds);
        }
    }, [contextSelections?.chapterIds, lazyLoadChapters]);

    // Show diff - supports multiple document blocks
    const handleShowDiff = useCallback((parsedBlocks) => {
        if (!parsedBlocks || parsedBlocks.length === 0) return;

        const actionableBlocks = parsedBlocks.filter(b => b.mode !== 'text');
        if (actionableBlocks.length === 0) return;

        const blocks = actionableBlocks.map((block, idx) => {
            let currentContent = '';
            let title = block.title || 'Documento';

            if (block.mode === 'manual' && block.docId) {
                const doc = findDestinationDoc(block, chapters, worldItems, characters);
                currentContent = doc?.content || '';
                title = block.title || doc?.title || doc?.name || 'Documento';
            } else if (block.mode === 'auto') {
                if (block.title && block.isPatch) {
                    const byTitle = [...(worldItems || []), ...(chapters || [])].find(d => {
                        const dTitle = d.title || d.name || '';
                        return dTitle.toLowerCase().trim() === block.title.toLowerCase().trim();
                    });
                    if (byTitle) {
                        currentContent = byTitle.content || '';
                        title = byTitle.title || byTitle.name || block.title;
                    } else {
                        const activeDoc = activeChapter || activeWorldDoc;
                        currentContent = activeDoc?.content || '';
                        title = block.title || activeDoc?.title || activeDoc?.name || 'Documento activo';
                    }
                } else {
                    const activeDoc = activeChapter || activeWorldDoc;
                    if (activeDoc) {
                        currentContent = activeDoc.content || '';
                        title = block.title || activeDoc.title || activeDoc.name || 'Documento activo';
                    }
                }
            }

            let proposedContent = block.content;

            if (currentContent && proposedContent && !block.isPatch && !block.isSection && block.mode !== 'new') {
                const currentText = cleanHtmlToPlainText(currentContent);
                const proposedText = cleanHtmlToPlainText(proposedContent);
                const currentWordCount = currentText.split(/\s+/).filter(Boolean).length;
                const proposedWordCount = proposedText.split(/\s+/).filter(Boolean).length;

                const isPartial = block.isPartial || (proposedWordCount < currentWordCount * 0.7);

                if (isPartial) {
                    const mergedText = smartMergePartialResponse(currentText, proposedText);
                    proposedContent = plainTextToHtml(mergedText);
                }
            }

            return {
                docType: block.docType,
                docId: block.docId,
                mode: block.mode,
                currentContent,
                proposedContent,
                title,
                isPatch: block.isPatch || false,
                original: block.original || '',
                isSection: block.isSection || false,
                sectionIndex: block.sectionIndex,
                totalSections: block.totalSections,
                context: block.context || '',
            };
        });

        lastParsedBlocksRef.current = blocks;
        setDiffBlocks(blocks);
    }, [chapters, worldItems, activeChapter, activeWorldDoc, characters]);

    const getApiKey = useCallback(() => {
        const aiConfig = profile?.aiConfig || {};
        return aiConfig.deepseekApiKey || profile?.deepseekApiKey || localStorage.getItem('deepseekApiKey') || '';
    }, [profile]);

    const handleDetectInterceptor = useCallback(async (userMessage) => {
        const trimmedMessage = userMessage.trim();
        const detectArgs = trimmedMessage.substring(9).trim();
        
        const spaceIndex = detectArgs.indexOf(' ');
        const action = spaceIndex !== -1 ? detectArgs.substring(0, spaceIndex).trim() : detectArgs;
        
        if (action === 'inconsistencias') {
            const displayUserMessage = `/detectar inconsistencias`;
            
            const apiKey = getApiKey();
            if (!apiKey) {
                const userMsg = { id: generateMsgId(), role: 'user', content: displayUserMessage, timestamp: Date.now() };
                const aiMsg = { id: generateMsgId(), role: 'assistant', content: '❌ API Key de DeepSeek no configurada.', timestamp: Date.now(), responseType: 'error' };
                setMessages(prev => [...prev, userMsg, aiMsg]);
                return;
            }
            
            lastUserMessageRef.current = displayUserMessage;
            
            const contextText = buildContextFromSelections(
                activeBook,
                chapters,
                contextSelections?.chapterIds || [],
                characters?.filter(c => !c.isCategory),
                worldItems,
                contextSelections?.worldItemIds || [],
                true,
                contextSelections?.characterIds || []
            );
            
            const aiUserMessage = `Audita el manuscrito y las fichas de lore buscando contradicciones o inconsistencias dramáticas.`;
            
            const modelId = chatModel || defaultModel;
            const enableTools = typeof modelId === 'string' && modelId.startsWith('deepseek');
            const systemPrompt = buildSystemPrompt('detectar_inconsistencias', contextText, destinationDoc, activeChapter || activeWorldDoc, { useNativeTools: enableTools });
            const aiMessages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: aiUserMessage }
            ];
            
            const userMsgId = generateMsgId();
            const aiMsgId = generateMsgId();
            const userMsg = { id: userMsgId, role: 'user', content: displayUserMessage, isDetectCommand: true, timestamp: Date.now() };
            const aiMsg = { id: aiMsgId, role: 'assistant', content: '', isStreaming: true, timestamp: Date.now() };
            
            setMessages(prev => [...prev, userMsg, aiMsg]);
            if (activeSession) {
                SessionManager.addMessage(activeSession.id, userMsg);
                SessionManager.addMessage(activeSession.id, aiMsg);
                setSessions(SessionManager.getSessions());
            }
            
            setIsLoading(true);
            if (abortControllerRef.current) abortControllerRef.current.abort();
            abortControllerRef.current = new AbortController();
            
            try {
                const startTime = Date.now();
                let fullResponse = '';
                let lastToolCall = { name: '', args: '' };
                
                await AIService.generateStream(aiMessages, {
                    selectedAiModel: modelId,
                    deepseekApiKey: apiKey,
                    reasoningMode: chatReasoningMode,
                    reasoningEffort: chatReasoningEffort,
                    temperature: 0.2,
                    signal: abortControllerRef.current.signal,
                    enableTools,
            onToolCall: (name, argsText, isComplete) => {
                        console.info('[IAStudio][Chat] Tool call:', { name, isComplete, argsText });
                        if (isComplete) lastToolCall = { name, args: argsText };
                        const parsedBlocks = parseToolCallResponse(name, argsText, destinationDoc, chapters, worldItems, characters);
                        let displayContent = '⚠️ Analizando coherencia de lore...';
                        let inconsistencies = undefined;
                        
                        if (name === 'registrar_inconsistencia') {
                            const block = parsedBlocks[0];
                            inconsistencies = block?.inconsistencies || [];
                            displayContent = `⚠️ Se están detectando inconsistencias de lore...\n\n**Título:** ${inconsistencies[0]?.title || '...'}\n**Conflicto:** ${inconsistencies[0]?.problem || '...'}`;
                        }
                        
                        setMessages(prev => prev.map(m =>
                            m.id === aiMsgId ? {
                                ...m,
                                content: displayContent,
                                rawResponse: isComplete ? JSON.stringify({ tool_call: { name, arguments: argsText } }) : '',
                                responseType: name === 'registrar_inconsistencia' ? 'inconsistencies' : undefined,
                                inconsistencies: inconsistencies
                            } : m
                        ));
                        
                        if (activeSession) {
                            SessionManager.updateLastAssistantMessage(
                                activeSession.id,
                                displayContent,
                                isComplete,
                                name === 'registrar_inconsistencia' ? 'inconsistencies' : undefined,
                                isComplete ? JSON.stringify({ tool_call: { name, arguments: argsText } }) : undefined,
                                undefined,
                                inconsistencies
                            );
                        }
                    }
                }, (chunk) => {
                    fullResponse += chunk;
                    setMessages(prev => prev.map(m =>
                        m.id === aiMsgId && !lastToolCall.name ? { ...m, content: fullResponse } : m
                    ));
                }, () => {});
                
                const durationMs = Date.now() - startTime;
                
                if (lastToolCall.name === 'registrar_inconsistencia') {
                    const parsedBlocks = parseToolCallResponse(lastToolCall.name, lastToolCall.args, destinationDoc, chapters, worldItems, characters);
                    const block = parsedBlocks[0];
                    const inconsistencies = block?.inconsistencies || [];
                    const displayContent = `⚠️ Se han detectado ${inconsistencies.length} inconsistencias de lore. Revisa y resuelve las tarjetas mostradas arriba.`;
                    
                    setMessages(prev => prev.map(m =>
                        m.id === aiMsgId ? {
                            ...m,
                            content: displayContent,
                            isStreaming: false,
                            responseType: 'inconsistencies',
                            duration: durationMs
                        } : m
                    ));
                    
                    if (activeSession) {
                        SessionManager.updateLastAssistantMessage(
                            activeSession.id,
                            displayContent,
                            true,
                            'inconsistencies',
                            JSON.stringify({ tool_call: { name: lastToolCall.name, arguments: lastToolCall.args } }),
                            undefined,
                            inconsistencies,
                            durationMs
                        );
                        setActiveSession(SessionManager.getSession(activeSession.id));
                        setSessions(SessionManager.getSessions());
                    }
                } else {
                    setMessages(prev => prev.map(m =>
                        m.id === aiMsgId ? { ...m, isStreaming: false, duration: durationMs } : m
                    ));
                    if (activeSession) {
                        SessionManager.updateLastAssistantMessage(activeSession.id, fullResponse, true, undefined, undefined, undefined, undefined, durationMs);
                        setActiveSession(SessionManager.getSession(activeSession.id));
                        setSessions(SessionManager.getSessions());
                    }
                }
                
            } catch (error) {
                if (error.name !== 'AbortError') {
                    setMessages(prev => prev.map(m =>
                        m.id === aiMsgId ? { ...m, content: `❌ Error al auditar coherencia: ${error.message}`, isStreaming: false, responseType: 'error' } : m
                    ));
                }
            } finally {
                setIsLoading(false);
            }
        } else {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: `⚠️ Acción "/detectar ${action}" no reconocida o no implementada aún.`, type: 'warning' }
            }));
        }
    }, [getApiKey, setMessages, activeBook, chapters, contextSelections, characters, worldItems, chatModel, defaultModel, destinationDoc, activeChapter, activeWorldDoc, activeSession, setSessions, setIsLoading, chatReasoningMode, chatReasoningEffort, setActiveSession]);

    const handleFormatInterceptor = useCallback(async (userMessage) => {
        const trimmedMessage = userMessage.trim();
        const formatDocName = trimmedMessage.substring(7).trim();
        
        let targetDoc = null;
        if (formatDocName) {
            const searchName = formatDocName.toLowerCase().trim();
            targetDoc = chapters?.find(c => c.title?.toLowerCase() === searchName || c.id === formatDocName) ||
                        worldItems?.find(w => w.id === formatDocName || w.title?.toLowerCase() === searchName);
        }
        
        if (!targetDoc) {
            targetDoc = activeChapter || activeWorldDoc;
        }
        
        if (!targetDoc) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '⚠️ No hay un documento activo seleccionado para formatear.', type: 'warning' }
            }));
            return;
        }
        
        const docTitle = targetDoc.title || targetDoc.name || 'Capítulo Activo';
        const docContent = targetDoc.content || '';
        const plainTextContent = cleanHtmlToPlainText(docContent);
        const wordCount = plainTextContent.split(/\s+/).filter(Boolean).length;
        
        const displayUserMessage = `/format ${docTitle}`;
        const aiUserMessage = `Por favor formatea el siguiente texto del documento "${docTitle}" (${wordCount} palabras). Aplica saltos de línea dobles entre secciones, personajes y párrafos. NO modifiques ninguna palabra:\n\n${plainTextContent}`;

        const apiKey = getApiKey();
        if (!apiKey) {
            const userMsg = { id: generateMsgId(), role: 'user', content: displayUserMessage, timestamp: Date.now() };
            const aiMsg = { id: generateMsgId(), role: 'assistant', content: '❌ API Key de DeepSeek no configurada.', timestamp: Date.now(), responseType: 'error' };
            setMessages(prev => [...prev, userMsg, aiMsg]);
            return;
        }

        lastUserMessageRef.current = displayUserMessage;

        const contextText = buildContextFromSelections(
            activeBook, chapters, contextSelections?.chapterIds || [],
            characters, worldItems, contextSelections?.worldItemIds || [], compressContext,
            contextSelections?.characterIds || []
        );
        const extraOptions = { chapters, worldItems };
        const modelId = chatModel || defaultModel;
        const enableTools = typeof modelId === 'string' && modelId.startsWith('deepseek');
        extraOptions.useNativeTools = enableTools;

        const systemPrompt = buildSystemPrompt('formatear', contextText, destinationDoc, activeChapter || activeWorldDoc, extraOptions);
        const aiMessages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: aiUserMessage }
        ];

        const userMsgId = generateMsgId();
        const aiMsgId = generateMsgId();
        const userMsg = { id: userMsgId, role: 'user', content: displayUserMessage, isFormatCommand: true, formatDocTitle: docTitle, formatWordCount: wordCount, timestamp: Date.now() };
        const aiMsg = { id: aiMsgId, role: 'assistant', content: '', isStreaming: true, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg, aiMsg]);
        if (activeSession) {
            SessionManager.addMessage(activeSession.id, userMsg);
            SessionManager.addMessage(activeSession.id, aiMsg);
            setSessions(SessionManager.getSessions());
        }
        setIsLoading(true);
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        try {
            const startTime = Date.now();
            let lastToolCall = { name: '', args: '' };
            await AIService.generateStream(aiMessages, {
                selectedAiModel: modelId,
                deepseekApiKey: apiKey,
                temperature: 0.0,
                signal: abortControllerRef.current.signal,
                enableTools,
                onToolCall: (name, argsText, isComplete) => {
                    if (isComplete) lastToolCall = { name, args: argsText };
                    if (name === 'aplicar_formateo_lectura') {
                        setMessages(prev => prev.map(m =>
                            m.id === aiMsgId ? { ...m, content: `✨ **Formateando "${docTitle}"...**`, responseType: 'format' } : m
                        ));
                    }
                }
            }, () => {}, () => {});

            const durationMs = Date.now() - startTime;
            if (lastToolCall.name === 'aplicar_formateo_lectura') {
                const parsedBlocks = parseToolCallResponse(lastToolCall.name, lastToolCall.args, destinationDoc, chapters, worldItems, characters);
                const block = parsedBlocks[0];
                const charCount = cleanText(block?.content || '').length;
                const displayContent = `✨ **Formateo completado** — "${docTitle}"\n\n${charCount > 0 ? `${Math.ceil(charCount / 5)} palabras procesadas.` : ''}\n\nHaz clic en **Ver Cambios** para revisar y aplicar el nuevo espaciado.`;
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: displayContent, rawResponse: JSON.stringify({ tool_call: { name: lastToolCall.name, arguments: lastToolCall.args } }), isStreaming: false, responseType: 'format', duration: durationMs } : m
                ));
                if (activeSession) {
                    SessionManager.updateLastAssistantMessage(activeSession.id, displayContent, true, 'format', JSON.stringify({ tool_call: { name: lastToolCall.name, arguments: lastToolCall.args } }));
                    setActiveSession(SessionManager.getSession(activeSession.id));
                    setSessions(SessionManager.getSessions());
                }
                if (parsedBlocks.length > 0) handleShowDiff(parsedBlocks);
            } else {
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: '⚠️ El modelo no utilizó la herramienta de formateo. Intenta de nuevo.', isStreaming: false, responseType: 'error' } : m
                ));
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: `❌ Error al formatear: ${error.message}`, isStreaming: false, responseType: 'error' } : m
                ));
            }
        } finally {
            setIsLoading(false);
        }
    }, [chapters, worldItems, activeChapter, activeWorldDoc, getApiKey, setMessages, activeBook, contextSelections, characters, compressContext, chatModel, defaultModel, destinationDoc, activeSession, setSessions, setIsLoading, handleShowDiff, setActiveSession]);

    const handleMockInterceptor = useCallback(async (userMessage) => {
        const trimmedMessage = userMessage.trim();
        const mockArgs = trimmedMessage.substring(5).trim();
        
        let mockType = 'content';
        let targetDocName = '';
        
        if (mockArgs.startsWith('patch')) {
            mockType = 'patch';
            targetDocName = mockArgs.substring(5).trim();
        } else if (mockArgs.startsWith('section')) {
            mockType = 'section';
            targetDocName = mockArgs.substring(7).trim();
        } else if (mockArgs.startsWith('scene')) {
            mockType = 'scene';
            targetDocName = mockArgs.substring(5).trim();
        } else if (mockArgs.startsWith('content')) {
            mockType = 'content';
            targetDocName = mockArgs.substring(7).trim();
        } else {
            mockType = 'content';
            targetDocName = mockArgs;
        }
        
        let targetDoc = null;
        if (targetDocName) {
            const searchName = targetDocName.toLowerCase().trim();
            targetDoc = chapters?.find(c => c.title?.toLowerCase() === searchName || c.id === targetDocName) ||
                        worldItems?.find(w => w.title?.toLowerCase() === searchName || w.id === targetDocName);
        }
        
        if (!targetDoc) {
            targetDoc = activeChapter || activeWorldDoc;
        }
        
        const docTitle = targetDoc?.title || targetDoc?.name || 'Capítulo Activo';
        const docContent = targetDoc?.content || '<p>Érase una vez en un reino muy lejano...</p>';
        
        const userMsgId = generateMsgId();
        const aiMsgId = generateMsgId();
        
        const userMsg = { id: userMsgId, role: 'user', content: userMessage, timestamp: Date.now() };
        const aiMsg = { id: aiMsgId, role: 'assistant', content: 'Generando simulación...', isStreaming: true, timestamp: Date.now() };
        
        setMessages(prev => [...prev, userMsg, aiMsg]);
        if (activeSession) {
            SessionManager.addMessage(activeSession.id, userMsg);
            SessionManager.addMessage(activeSession.id, aiMsg);
            setSessions(SessionManager.getSessions());
        }
        
        setIsLoading(true);
        try {
            const startTime = Date.now();
            await new Promise(resolve => setTimeout(resolve, 800));
            const durationMs = Date.now() - startTime;
            
            let fakeResponse = '';
            
            if (mockType === 'patch') {
                let plainText = cleanHtmlToPlainText(docContent);
                let originalFragment = '';
                
                if (plainText.length > 50) {
                    const paragraphs = plainText.split(/\n\n+/);
                    if (paragraphs.length > 1) {
                        originalFragment = paragraphs.slice(0, 3).join('\n\n');
                    } else {
                        const sentences = plainText.split(/[.!?]/);
                        originalFragment = sentences.find(s => s.trim().length > 10)?.trim() || plainText.substring(0, 80);
                    }
                } else {
                    originalFragment = plainText || 'el texto original';
                }
                
                const replacementText = `${originalFragment} (prueba de ${docTitle})`;
                fakeResponse = `<response_type>patch</response_type>
<target_doc>${docTitle}</target_doc>
<context>Corrección de prueba simulada para ${docTitle}</context>
<original>${originalFragment}</original>
<replacement_text>${replacementText}</replacement_text>`;
            } else if (mockType === 'section') {
                const updatedContent = `${docContent} <p>(prueba de ${docTitle})</p>`;
                fakeResponse = `<response_type>section</response_type>
<target_doc>${docTitle}</target_doc>
<section_index>1</section_index>
<total_sections>1</total_sections>
<title>Sección de Pruebas en ${docTitle}</title>
<content_text>${updatedContent.replace(/<[^>]*>/g, '\n').trim()}</content_text>`;
            } else if (mockType === 'scene') {
                const updatedContent = `${docContent} <p>(prueba de ${docTitle})</p>`;
                fakeResponse = `<response_type>scene</response_type>
<target_doc>${docTitle}</target_doc>
<section_index>1</section_index>
<title>Escena de Pruebas en ${docTitle}</title>
<content_text>${updatedContent.replace(/<[^>]*>/g, '\n').trim()}</content_text>`;
            } else {
                const updatedContent = `${docContent} <p>(prueba de ${docTitle})</p>`;
                fakeResponse = `<response_type>content</response_type>
<target_doc>${docTitle}</target_doc>
<title>${docTitle} (Prueba)</title>
<content_text>${updatedContent.replace(/<[^>]*>/g, '\n').trim()}</content_text>`;
            }
            
            let streamResponseType = 'analysis';
            if (mockType === 'patch') streamResponseType = 'patch';
            else if (mockType === 'section') streamResponseType = 'section';
            else if (mockType === 'scene') streamResponseType = 'scene';
            else if (mockType === 'content') streamResponseType = 'content';
            
            setMessages(prev => prev.map(m =>
                m.id === aiMsgId ? { ...m, content: fakeResponse, responseType: streamResponseType } : m
            ));
            
            if (activeSession) {
                SessionManager.updateLastAssistantMessage(activeSession.id, fakeResponse, false, streamResponseType);
            }
            
            await new Promise(resolve => setTimeout(resolve, 400));
            
            const parsedBlocks = parseDestinationsFromResponse(fakeResponse, destinationDoc, chapters, worldItems, characters);
            const htmlBlocks = parsedBlocks.filter(b => b.mode !== 'text');
            const patchBlocks = parsedBlocks.filter(b => b.isPatch);
            const sectionBlocks = parsedBlocks.filter(b => b.isSection);
            const sceneBlocks = parsedBlocks.filter(b => b.isScene);
            
            let displayContent = fakeResponse;
            let responseType = streamResponseType;
            
            if (patchBlocks.length > 0) {
                responseType = 'patch';
                const patch = patchBlocks[0];
                const originalPreview = (patch.original || '').substring(0, 120);
                const replacementWords = cleanText(patch.content || '').split(/\s+/).filter(Boolean).length;
                displayContent = `✂️ **Fragmento editado (MOCK)** — ${replacementWords} palabras en el reemplazo\n\n${patch.context ? `> ${patch.context}` : ''}`;
                if (originalPreview) {
                    displayContent += `\n\n**Original:** "${originalPreview}${patch.original?.length > 120 ? '...' : ''}"`;
                }
            } else if (sceneBlocks.length > 0) {
                responseType = 'scene';
                const scene = sceneBlocks[0];
                const wordCount = cleanText(scene.content || '').split(/\s+/).filter(Boolean).length;
                displayContent = `🎬 **Escena (MOCK) ${scene.sceneIndex || 1}: ${scene.titleOriginal || 'Nueva Escena'}** generada — ${wordCount} palabras`;
            } else if (sectionBlocks.length > 0) {
                responseType = 'section';
                const section = sectionBlocks[0];
                const wordCount = cleanText(section.content || '').split(/\s+/).filter(Boolean).length;
                displayContent = `📄 **Sección (MOCK) ${section.sectionIndex} de ${section.totalSections}** generada — ${wordCount} palabras`;
                
                const newSection = { sectionIndex: section.sectionIndex, html: section.content, title: section.title };
                setAccumulatedSections(prev => {
                    const updated = [...prev.filter(s => s.sectionIndex !== section.sectionIndex), newSection];
                    return updated.sort((a, b) => a.sectionIndex - b.sectionIndex);
                });
            } else if (htmlBlocks.length > 0) {
                responseType = 'content';
                const parsed = tryParseAIJsonExported(fakeResponse);
                if (parsed?.html) {
                    const preview = cleanText(parsed.html);
                    displayContent = preview.substring(0, 400) + (preview.length > 400 ? '…' : '');
                } else {
                    displayContent = htmlBlocks.map(b => {
                        const actionLabel = b.mode === 'new' ? '🆕 Nuevo documento' : `✏️ ${b.title}`;
                        return actionLabel;
                    }).join('\n');
                }
            }
            
            setMessages(prev => prev.map(m =>
                m.id === aiMsgId ? { 
                    ...m, 
                    content: displayContent, 
                    rawResponse: fakeResponse, 
                    isStreaming: false, 
                    responseType,
                    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                    duration: durationMs
                } : m
            ));
            
            if (activeSession) {
                SessionManager.updateLastAssistantMessage(
                    activeSession.id, 
                    displayContent, 
                    true, 
                    responseType, 
                    fakeResponse, 
                    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                    undefined,
                    durationMs
                );
                setActiveSession(SessionManager.getSession(activeSession.id));
                setSessions(SessionManager.getSessions());
            }
            
            const shouldShowDiff = htmlBlocks.length > 0 || patchBlocks.length > 0 || sectionBlocks.length > 0 || sceneBlocks.length > 0;
            if (shouldShowDiff) {
                handleShowDiff(parsedBlocks);
            }
        } catch (error) {
            console.error("Mock error:", error);
            setMessages(prev => prev.map(m =>
                m.id === aiMsgId ? { ...m, content: `❌ Error de Simulación: ${error.message}`, isStreaming: false, responseType: 'error' } : m
            ));
        } finally {
            setIsLoading(false);
        }
    }, [chapters, worldItems, activeChapter, activeWorldDoc, setMessages, activeSession, setSessions, setIsLoading, destinationDoc, characters, handleShowDiff, setActiveSession]);

    const handleSend = useCallback(async (userMessage, overrideAction = null) => {
        let effectiveAction = overrideAction || selectedAction;

        if (effectiveAction === 'escribir' && sectionMode) {
            effectiveAction = 'seccion';
        }

        if (userMessage.trim().startsWith('/detectar')) {
            return handleDetectInterceptor(userMessage);
        }

        if (userMessage.trim().startsWith('/format')) {
            return handleFormatInterceptor(userMessage);
        }

        if (userMessage.trim().startsWith('/mock')) {
            return handleMockInterceptor(userMessage);
        }

        const apiKey = getApiKey();

        // ── Clasificación automática de intención (chat general) ──
        // Si el usuario está en modo "chat" (sin acción manual seleccionada),
        // se pregunta al modelo QUÉ acción corresponde antes de ejecutar.
        // Los comandos ("/detectar", "/format", "/mock") ya fueron interceptados arriba.
        if (effectiveAction === 'chat' && !overrideAction && apiKey) {
            const modelId = chatModel || defaultModel;
            const bookContext = activeBook
                ? `Libro: ${activeBook.title || ''}${activeBook.description ? `\nSinopsis: ${activeBook.description}` : ''}`
                : '';

            const classifiedId = await classifyAction(
                userMessage,
                QUICK_ACTIONS || [],
                apiKey,
                modelId,
                bookContext
            );

            if (classifiedId && classifiedId !== 'chat') {
                effectiveAction = classifiedId;
            }
        }

        if (!apiKey) {
            const errorMsg = `❌ API Key de DeepSeek no configurada. Ve a Ajustes > Mi Cuenta para configurarla.`;

            const userMsg = { id: generateMsgId(), role: 'user', content: userMessage, timestamp: Date.now() };
            const aiMsg = { id: generateMsgId(), role: 'assistant', content: errorMsg, timestamp: Date.now(), responseType: 'error' };

            setMessages(prev => [...prev, userMsg, aiMsg]);
            
            if (activeSession) {
                SessionManager.addMessage(activeSession.id, userMsg);
                SessionManager.addMessage(activeSession.id, aiMsg);
                setSessions(SessionManager.getSessions());
            }
            return;
        }

        lastUserMessageRef.current = userMessage;

        const contextText = buildContextFromSelections(
            activeBook,
            chapters,
            contextSelections?.chapterIds || [],
            characters,
            worldItems,
            contextSelections?.worldItemIds || [],
            compressContext,
            contextSelections?.characterIds || []
        );

        const extraOptions = {};
        extraOptions.chapters = chapters;
        extraOptions.worldItems = worldItems;

        const modelId = chatModel || defaultModel;
        const enableTools = typeof modelId === 'string' && modelId.startsWith('deepseek');
        extraOptions.useNativeTools = enableTools;

        if (effectiveAction === 'seccion' && sectionConfig) {
            extraOptions.sectionIndex = currentSectionIndex;
            extraOptions.totalSections = sectionConfig.total;
            extraOptions.sectionDescription = sectionConfig.descriptions?.[currentSectionIndex - 1] || '';

            if (accumulatedSections.length > 0) {
                const prevSectionsText = accumulatedSections
                    .map((s, i) => `[Sección ${i + 1} ya escrita]: ${cleanText(s.html || '').substring(0, 500)}...`)
                    .join('\n');
                extraOptions.previousSections = prevSectionsText;
            }
        }

        const MULTI_DOC_KEYWORDS = [
            'todos los personajes', 'todos los caracteres', 'cada personaje', 'todos los protagonists',
            'varios personajes', 'múltiples personajes', 'multiples personajes', 'elenco completo',
            'al elenco', 'a los personajes', 'cada ficha', 'cada uno de los personajes',
            'varios documentos', 'todos los documentos', 'todos los archivos', 'múltiples documentos',
            'en todos los', 'actualiza todo el', 'modifica todo el', 'cambia todo el',
            'todos los capítulos', 'todos los capitulos', 'varios capítulos', 'varios capitulos',
            'actualiza todos', 'modifica todos', 'cambia todos', 'en cada uno',
            'para cada personaje', 'en los demás', 'en el resto', 'actualiza a todos',
            'modifica a todos', 'cambia a todos', 'aplica a todos', 'hazlo en todos'
        ];
        const msgLower = userMessage.toLowerCase();
        const isMultiDocIntent = effectiveAction === 'chat' &&
            MULTI_DOC_KEYWORDS.some(kw => kw.split(' ').length >= 2 && msgLower.includes(kw));

        let fullUserMessage = userMessage;
        if (effectiveAction === 'fragmento' && activeFragment) {
            fullUserMessage = `FRAGMENTO A EDITAR:\n"""\n${activeFragment}\n"""\n\nINSTRUCCIÓN: ${userMessage}`;
        }

        if (isMultiDocIntent) {
            fullUserMessage = `${fullUserMessage}\n\n[NOTA TÉCNICA: Esta instrucción afecta a MÚLTIPLES documentos. Usa obligatoriamente la herramienta \`aplicar_parches_resolucion\` con un parche separado por cada documento/personaje afectado. NO uses \`aplicar_parche\` (singular).]`;
        }

        const systemPrompt = buildSystemPrompt(
            effectiveAction,
            contextText,
            destinationDoc,
            activeChapter || activeWorldDoc,
            extraOptions
        );

        const useJsonMode = false;

        const aiMessages = [
            { role: 'system', content: systemPrompt },
            ...messagesRef.current.map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.role === 'assistant' ? sanitizeMessageForHistory(m.content) : m.content
            })),
            { role: 'user', content: fullUserMessage }
        ];

        const userMsgId = generateMsgId();
        const aiMsgId = generateMsgId();

        const userMsg = { id: userMsgId, role: 'user', content: userMessage, timestamp: Date.now() };
        const aiMsg = { id: aiMsgId, role: 'assistant', content: '', isStreaming: true, timestamp: Date.now() };

        setMessages(prev => [...prev, userMsg, aiMsg]);
        
        if (activeSession) {
            SessionManager.addMessage(activeSession.id, userMsg);
            SessionManager.addMessage(activeSession.id, aiMsg);
            setSessions(SessionManager.getSessions());
        }

        setIsLoading(true);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        try {
            const startTime = Date.now();
            let fullResponse = '';
            let finalUsage = null;
            let lastToolCall = { name: '', args: '' };
            let lastToolReasoningContent = '';

            await AIService.generateStream(aiMessages, {
                selectedAiModel: modelId,
                deepseekApiKey: apiKey,
                reasoningMode: chatReasoningMode,
                reasoningEffort: chatReasoningEffort,
                temperature: effectiveAction === 'formatear' ? 0.0 : temperature,
                useJsonMode: useJsonMode,
                signal: abortControllerRef.current.signal,
                enableTools: enableTools,
                onToolCall: (name, argsText, isComplete, toolCallId, reasoningContent) => {
                    console.info('[IAStudio][Chat] Tool call:', { name, isComplete, argsText });
                    if (isComplete) {
                        lastToolCall = { name, args: argsText };
                        lastToolReasoningContent = reasoningContent || '';
                    }
                    
                    const parsedBlocks = parseToolCallResponse(name, argsText, destinationDoc, chapters, worldItems, characters);
                    let streamResponseType = undefined;
                    let displayContent = 'Procesando comando inteligente...';
                    let inconsistencies = undefined;

                    if (name === 'crear_capitulo') {
                        streamResponseType = 'content';
                        const block = parsedBlocks[0];
                        displayContent = `🆕 **Nuevo Capítulo (Streaming)**: ${block?.title || 'Creando...'}\n\n`;
                    } else if (name === 'aplicar_parche' || name === 'localizar_parche_exacto') {
                        streamResponseType = 'patch';
                        const patch = parsedBlocks[0];
                        displayContent = `✂️ **Fragmento editado (Streaming)** en *${patch?.title || 'Buscando documento...'}*\n\n**Original:**\n> ${patch?.original || '...'}\n\n**Reemplazo:**\n> ${patch?.content || '...'}`;
                    } else if (name === 'aplicar_parches_resolucion') {
                        streamResponseType = 'patch';
                        const numParches = parsedBlocks.length;
                        displayContent = isComplete
                            ? `🔧 **${numParches} parche(s) de resolución listos** — aplicando cambios en ${numParches} documento(s)...`
                            : `🔧 **Construyendo parches de resolución...** (${numParches} detectado(s) hasta ahora)`;
                    } else if (name === 'registrar_inconsistencia') {
                        streamResponseType = 'inconsistencies';
                        const block = parsedBlocks[0];
                        inconsistencies = block?.inconsistencies || [];
                        displayContent = `⚠️ Se está detectando una inconsistencia de lore...\n\n**Título:** ${inconsistencies[0]?.title || '...'}\n**Conflicto:** ${inconsistencies[0]?.problem || '...'}`;
                    }

                    setMessages(prev => prev.map(m =>
                        m.id === aiMsgId ? { 
                            ...m, 
                            content: displayContent, 
                            rawResponse: isComplete ? JSON.stringify({ tool_call: { name, arguments: argsText } }) : '', 
                            responseType: streamResponseType,
                            inconsistencies: inconsistencies
                        } : m
                    ));
                    
                    if (activeSession) {
                        SessionManager.updateLastAssistantMessage(
                            activeSession.id, 
                            displayContent, 
                            isComplete, 
                            streamResponseType,
                            isComplete ? JSON.stringify({ tool_call: { name, arguments: argsText } }) : undefined,
                            undefined,
                            inconsistencies
                        );
                    }
                }
            }, (chunk) => {
                fullResponse += chunk;
                
                let streamResponseType = undefined;
                const match = /\[tipo\s*:\s*([^\]\s]*)/i.exec(fullResponse);
                if (match) {
                    const t = match[1].toLowerCase();
                    if (t.startsWith('conten')) streamResponseType = 'content';
                    else if (t.startsWith('frag') || t.startsWith('parc') || t.startsWith('patch')) streamResponseType = 'patch';
                    else if (t.startsWith('secc') || t.startsWith('sect')) streamResponseType = 'section';
                    else if (t.startsWith('esce') || t.startsWith('scen')) streamResponseType = 'scene';
                    else if (t.startsWith('anal') || t.startsWith('anál')) streamResponseType = 'analysis';
                    else if (t.startsWith('suge')) streamResponseType = 'suggestion';
                }

                if (!streamResponseType) {
                    const lowerResp = fullResponse.toLowerCase();
                    if (lowerResp.includes('<response_type>content') || lowerResp.includes('<response-type>content')) {
                        streamResponseType = 'content';
                    } else if (lowerResp.includes('<response_type>patch') || lowerResp.includes('<response-type>patch')) {
                        streamResponseType = 'patch';
                    } else if (lowerResp.includes('<response_type>section') || lowerResp.includes('<response-type>section')) {
                        streamResponseType = 'section';
                    } else if (lowerResp.includes('<response_type>scene') || lowerResp.includes('<response-type>scene')) {
                        streamResponseType = 'scene';
                    } else if (lowerResp.includes('<response_type>analysis') || lowerResp.includes('<response-type>analysis')) {
                        streamResponseType = 'analysis';
                    } else if (lowerResp.includes('<response_type>suggestion') || lowerResp.includes('<response-type>suggestion')) {
                        streamResponseType = 'suggestion';
                    }
                }

                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: fullResponse, responseType: streamResponseType } : m
                ));
                if (activeSession) {
                    SessionManager.updateLastAssistantMessage(activeSession.id, fullResponse, false, streamResponseType);
                }
            }, (usage) => {
                finalUsage = usage;
            });

            // Si el modelo primero pidió leer un documento, continuar el ciclo
            // con el contenido real en lugar de finalizar con una respuesta vacía.
            if (lastToolCall.name === 'leer_documento') {
                let readArgs = {};
                try { readArgs = JSON.parse(lastToolCall.args || '{}'); } catch (error) {
                    console.warn('[IAStudio][Chat] Argumentos inválidos de leer_documento:', error);
                }
                const requestedId = readArgs.documento_id || '';
                const readDoc = [
                    ...(worldItems || []).filter(item => item.title),
                    ...(chapters || []).filter(item => item.title),
                    ...(characters || []).filter(item => item.name).map(item => ({ ...item, title: item.name })),
                ].find(item => item.id === requestedId || item.title === requestedId);

                if (readDoc) {
                    console.info('[IAStudio][Chat] Continuando después de leer_documento:', readDoc.title);
                    const toolId = `chat_read_${Date.now().toString(36)}`;
                    const continuationMessages = [
                        ...aiMessages,
                            {
                                role: 'assistant',
                                content: null,
                                ...(lastToolReasoningContent ? { reasoning_content: lastToolReasoningContent } : {}),
                                tool_calls: [{
                                id: toolId,
                                type: 'function',
                                function: { name: 'leer_documento', arguments: JSON.stringify(readArgs) },
                            }],
                        },
                        {
                            role: 'tool',
                            tool_call_id: toolId,
                            content: `Contenido actual de "${readDoc.title}":\n${readDoc.content || '<p></p>'}\n\n` +
                                `Debes ejecutar ahora una modificación. No respondas con explicaciones ni texto conversacional. ` +
                                `Llama obligatoriamente a aplicar_parche usando documento_id "${readDoc.title}". ` +
                                `Si el documento está vacío, usa texto_original como cadena vacía y texto_reemplazo como el contenido solicitado por el escritor, en HTML limpio.`,
                        },
                    ];
                    fullResponse = '';
                    lastToolCall = { name: '', args: '' };
                    await AIService.generateStream(continuationMessages, {
                        selectedAiModel: modelId,
                        deepseekApiKey: apiKey,
                        // La continuación incluye un tool-call previo. Si se deja
                        // thinking activo, DeepSeek exige reasoning_content en el
                        // mensaje assistant; el stream no siempre lo entrega.
                        reasoningMode: false,
                        temperature: effectiveAction === 'formatear' ? 0.0 : temperature,
                        signal: abortControllerRef.current.signal,
                        enableTools,
                        toolChoice: { type: 'function', function: { name: 'aplicar_parche' } },
                        onToolCall: (name, argsText, isComplete) => {
                            console.info('[IAStudio][Chat] Tool call continuación:', { name, isComplete, argsText });
                            if (isComplete) lastToolCall = { name, args: argsText };
                        },
                    }, (chunk) => { fullResponse += chunk; }, (usage) => { finalUsage = usage; });
                }
            }

            if ((!fullResponse || fullResponse.trim().length === 0) && !lastToolCall.name) {
                throw new Error("La IA cerró la conexión sin devolver ningún contenido. Esto puede deberse a límites de cuota, filtros de seguridad del proveedor o inestabilidad en la red.");
            }

            const isEchoingContext = fullResponse.trim().startsWith('<book>') || fullResponse.trim().startsWith('=== ');

            if (isEchoingContext) {
                const errorMsg = '⚠️ **La IA no pudo procesar tu solicitud.** Devolvió el contexto en lugar de contenido nuevo.';
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: errorMsg, isStreaming: false, responseType: 'error' } : m
                ));
            } else {
                let parsedBlocks = [];
                let displayContent = '';
                let responseType = 'analysis';
                let inconsistencies = undefined;

                if (lastToolCall.name) {
                    parsedBlocks = parseToolCallResponse(lastToolCall.name, lastToolCall.args, destinationDoc, chapters, worldItems, characters);
                    const block = parsedBlocks[0];
                    if (lastToolCall.name === 'crear_capitulo') {
                        responseType = 'content';
                        displayContent = `🆕 **Nuevo Capítulo creado con éxito**\n\nTítulo: **${block?.title}**`;
                    } else if (lastToolCall.name === 'aplicar_parche' || lastToolCall.name === 'localizar_parche_exacto') {
                        responseType = 'patch';
                        const patch = block;
                        const originalPreview = (patch.original || '').substring(0, 120);
                        const replacementWords = cleanText(patch.content || '').split(/\s+/).filter(Boolean).length;
                        displayContent = `✂️ **Fragmento editado** — ${replacementWords} palabras en el reemplazo\n\n${patch.context ? `> ${patch.context}` : ''}`;
                        if (originalPreview) {
                            displayContent += `\n\n**Original:** "${originalPreview}${patch.original?.length > 120 ? '...' : ''}"`;
                        }
                    } else if (lastToolCall.name === 'aplicar_parches_resolucion') {
                        responseType = 'patch';
                        const numParches = parsedBlocks.length;
                        const docs = [...new Set(parsedBlocks.map(b => b.title).filter(Boolean))];
                        displayContent = `🔧 **${numParches} parche(s) aplicados** en ${numParches} documento(s): ${docs.join(', ')}`;
                    } else if (lastToolCall.name === 'registrar_inconsistencia') {
                        responseType = 'inconsistencies';
                        inconsistencies = block?.inconsistencies || [];
                        displayContent = `⚠️ Se han detectado inconsistencias de lore. Revisa y resuelve las tarjetas mostradas arriba.`;
                    }
                } else {
                    parsedBlocks = parseDestinationsFromResponse(fullResponse, destinationDoc, chapters, worldItems, characters);

                    const textBlocks = parsedBlocks.filter(b => b.mode === 'text');
                    const htmlBlocks = parsedBlocks.filter(b => b.mode !== 'text');
                    const patchBlocks = parsedBlocks.filter(b => b.isPatch);
                    const sectionBlocks = parsedBlocks.filter(b => b.isSection);
                    const sceneBlocks = parsedBlocks.filter(b => b.isScene);

                    if (patchBlocks.length > 0) {
                        responseType = 'patch';
                        const patch = patchBlocks[0];
                        const originalPreview = (patch.original || '').substring(0, 120);
                        const replacementWords = cleanText(patch.content || '').split(/\s+/).filter(Boolean).length;
                        displayContent = `✂️ **Fragmento editado** — ${replacementWords} palabras en el reemplazo\n\n${patch.context ? `> ${patch.context}` : ''}`;

                        if (originalPreview) {
                            displayContent += `\n\n**Original:** "${originalPreview}${patch.original?.length > 120 ? '...' : ''}"`;
                        }
                    } else if (sceneBlocks.length > 0) {
                        responseType = 'scene';
                        const scene = sceneBlocks[0];
                        const wordCount = cleanText(scene.content || '').split(/\s+/).filter(Boolean).length;
                        displayContent = `🎬 **Escena ${scene.sceneIndex || 1}: ${scene.titleOriginal || 'Nueva Escena'}** generada — ${wordCount} palabras`;
                    } else if (sectionBlocks.length > 0) {
                        responseType = 'section';
                        const section = sectionBlocks[0];
                        const wordCount = cleanText(section.content || '').split(/\s+/).filter(Boolean).length;
                        displayContent = `📄 **Sección ${section.sectionIndex} de ${section.totalSections}** generada — ${wordCount} palabras`;

                        const newSection = { sectionIndex: section.sectionIndex, html: section.content, title: section.title };
                        setAccumulatedSections(prev => {
                            const updated = [...prev.filter(s => s.sectionIndex !== section.sectionIndex), newSection];
                            return updated.sort((a, b) => a.sectionIndex - b.sectionIndex);
                        });
                    } else if (htmlBlocks.length > 0) {
                        responseType = 'content';
                        const parsed = tryParseAIJsonExported(fullResponse);
                        if (parsed?.html) {
                            const preview = cleanText(parsed.html);
                            displayContent = preview.substring(0, 400) + (preview.length > 400 ? '…' : '');
                        } else {
                            displayContent = htmlBlocks.map(b => {
                                const actionLabel = b.mode === 'new' ? '🆕 Nuevo documento' : `✏️ ${b.title}`;
                                return actionLabel;
                            }).join('\n');
                        }
                    } else if (textBlocks.length > 0) {
                        responseType = parsedBlocks[0]?.responseType || 'analysis';
                        displayContent = textBlocks.map(b => b.content).join('\n\n');
                    } else {
                        displayContent = fullResponse;
                    }

                    const lowerResp = fullResponse.toLowerCase();
                    if (responseType === 'analysis' && (lowerResp.includes('<inconsistencia') || lowerResp.includes('[[inconsistencia'))) {
                        responseType = 'inconsistencies';
                    }

                    inconsistencies = responseType === 'inconsistencies'
                        ? (parsedBlocks[0]?.inconsistencies || parseInconsistenciesFromResponse(fullResponse) || [])
                        : undefined;

                    if (responseType === 'inconsistencies') {
                        displayContent = (displayContent || fullResponse)
                            .replace(/\[\[inconsistencia[\s\S]*?\[\/inconsistencia\]\]/gi, '')
                            .replace(/\[\[inconsistencia[^\]]*\]\]([\s\S]*?)\[\[\/inconsistencia\]\]/gi, '')
                            .replace(/\[\[inconsistencia\s+\d+[^\]]*\]\][\s\S]*?(?=\[\[inconsistencia|\z)/gi, '')
                            .replace(/\[\[titulo\]\][\s\S]*?\[\[\/titulo\]\]/gi, '')
                            .replace(/\[\[problema\]\][\s\S]*?\[\[\/problema\]\]/gi, '')
                            .replace(/\[\[solucion[^\]]*\]\][\s\S]*?\[\[\/solucion\]\]/gi, '')
                            .replace(/UBICACIÓN:\s*[^\n]+\n?/gi, '')
                            .replace(/SOLUCIÓ?N\s+[A-D]\s*:\s*[\s\S]*?(?=\n(?:SOLUCIÓ?N|\[\[|\z))/gi, '')
                            .replace(/<inconsistencia[\s\S]*?<\/inconsistencia>/gi, '')
                            .replace(/<inconsistencia[^>]*>([\s\S]*?)<\/inconsistencia>/gi, '')
                            .replace(/<titulo>[\s\S]*?<\/titulo>/gi, '')
                            .replace(/<problema>[\s\S]*?<\/problema>/gi, '')
                            .replace(/<solucion[^>]*>[\s\S]*?<\/solucion>/gi, '')
                            .replace(/```xml[\s\S]*?```/gi, '')
                            .replace(/```[\s\S]*?```/gi, '')
                            .replace(/\n{3,}/g, '\n\n')
                            .trim();
                    }
                }

                if (activeSession && finalUsage) {
                    const inputTokenCost = aiConfig.inputTokenCost ?? 0.075;
                    const outputTokenCost = aiConfig.outputTokenCost ?? 0.15;
                    SessionManager.addSessionCumulativeUsage(activeSession.id, finalUsage, inputTokenCost, outputTokenCost);
                }

                const durationMs = Date.now() - startTime;

                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { 
                        ...m, 
                        content: displayContent || fullResponse, 
                        rawResponse: lastToolCall.name ? JSON.stringify({ tool_call: { name: lastToolCall.name, arguments: lastToolCall.args } }) : fullResponse, 
                        isStreaming: false, 
                        responseType, 
                        inconsistencies,
                        usage: finalUsage,
                        duration: durationMs
                    } : m
                ));
                if (activeSession) {
                    SessionManager.updateLastAssistantMessage(
                        activeSession.id, 
                        displayContent || fullResponse, 
                        true, 
                        responseType, 
                        lastToolCall.name ? JSON.stringify({ tool_call: { name: lastToolCall.name, arguments: lastToolCall.args } }) : fullResponse, 
                        finalUsage,
                        inconsistencies,
                        durationMs
                    );
                    setActiveSession(SessionManager.getSession(activeSession.id));
                    setSessions(SessionManager.getSessions());
                }

                const shouldShowDiff = parsedBlocks.some(b => b.isPatch || b.isSection || b.isScene || b.isFormat || (b.mode !== 'text' && b.mode !== 'auto' && b.content))
                    || (lastToolCall.name && ['crear_capitulo', 'aplicar_parche', 'localizar_parche_exacto', 'aplicar_parches_resolucion', 'aplicar_formateo_lectura'].includes(lastToolCall.name));

                if (shouldShowDiff && !isEchoingContext) {
                    handleShowDiff(parsedBlocks);
                }

                if (effectiveAction === 'seccion' && sectionConfig && currentSectionIndex < sectionConfig.total) {
                    setCurrentSectionIndex(prev => prev + 1);
                }
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: m.content || "⏹️ Generación cancelada por el usuario.", isStreaming: false, responseType: 'error' } : m
                ));
                if (activeSession) {
                    SessionManager.updateLastAssistantMessage(activeSession.id, null, true);
                    setSessions(SessionManager.getSessions());
                }
                return;
            }

            console.error("IA Studio Error:", error);
            const isRateLimit = error.message?.includes('429') || error.message?.includes('Too Many Requests');
            const errorMsg = isRateLimit
                ? `❌ **Demasiadas solicitudes (429).** Espera unos segundos e intenta de nuevo.`
                : `❌ Error: ${error.message || 'Error al comunicarse con la IA'}`;

            setMessages(prev => prev.map(m =>
                m.id === aiMsgId ? { ...m, content: errorMsg, isStreaming: false, responseType: 'error' } : m
            ));
            if (activeSession) {
                SessionManager.updateLastAssistantMessage(activeSession.id, errorMsg, true);
                setSessions(SessionManager.getSessions());
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [activeBook, chapters, characters, worldItems, contextSelections, destinationDoc, selectedAction,
        chatModel, defaultModel, temperature, aiConfig, chatReasoningMode, chatReasoningEffort, getApiKey, handleShowDiff, activeSession, setMessages,
        setSessions, compressContext, activeFragment, sectionConfig, sectionMode, currentSectionIndex, accumulatedSections,
        activeChapter, handleDetectInterceptor, handleFormatInterceptor, handleMockInterceptor, setActiveSession]);

    const handleResolveInconsistency = useCallback(async (messageId, inconsistencyId, option, solutionText, isRetry = false) => {
        if (option === 'OMIT') {
            setMessages(prev => prev.map(m => {
                if (m.id === messageId) {
                    const currentInconsistencies = m.inconsistencies || parseInconsistenciesFromResponse(m.rawResponse || m.content) || [];
                    const updated = currentInconsistencies.map(inc => {
                        if (inc.id === inconsistencyId) {
                            return { ...inc, resolved: true, selectedOption: 'OMIT', customText: 'Omitido / Ignorado por el escritor' };
                        }
                        return inc;
                    });
                    return { ...m, inconsistencies: updated };
                }
                return m;
            }));

            if (activeSession) {
                setTimeout(() => {
                    const currentSession = SessionManager.getSession(activeSession.id);
                    if (currentSession) {
                        const updatedMsgList = currentSession.messages.map(m => {
                            if (m.id === messageId) {
                                const currentInconsistencies = m.inconsistencies || parseInconsistenciesFromResponse(m.rawResponse || m.content) || [];
                                const updated = currentInconsistencies.map(inc => {
                                    if (inc.id === inconsistencyId) {
                                        return { ...inc, resolved: true, selectedOption: 'OMIT', customText: 'Omitido / Ignorado por el escritor' };
                                    }
                                    return inc;
                                });
                                return { ...m, inconsistencies: updated };
                            }
                            return m;
                        });
                        SessionManager.saveSessionMessages(activeSession.id, updatedMsgList);
                    }
                }, 100);
            }
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '👁️ Inconsistencia omitida e ignorada.', type: 'info' }
            }));
            return;
        }

        const apiKey = getApiKey();
        if (!apiKey) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '❌ API Key no configurada. Ve a Ajustes > Inteligencia.', type: 'error' }
            }));
            return;
        }

        const msg = messagesRef.current.find(m => m.id === messageId);
        if (!msg) return;

        const inconsistencies = msg.inconsistencies || parseInconsistenciesFromResponse(msg.rawResponse || msg.content) || [];
        const inc = inconsistencies.find(i => i.id === inconsistencyId);
        if (!inc) return;

        const affectedContents = [];
        inc.files.forEach(fId => {
            let docContent = '';
            let docTitle = fId;
            if (fId.startsWith('system_')) {
                const doc = worldItems?.find(w => w.id === fId);
                docContent = doc?.content || '';
                docTitle = SYSTEM_WORLD_ITEM_LABELS[fId] || fId;
            } else {
                const doc = chapters?.find(c => c.title?.toLowerCase() === fId.toLowerCase() || c.id === fId);
                docContent = doc?.content || '';
                docTitle = doc?.title || fId;
            }
            affectedContents.push(`--- DOCUMENTO: "${docTitle}" (ID: ${fId}) ---\n${docContent}`);
        });

        const filesContextText = affectedContents.join('\n\n');

        setIsLoading(true);
        setActiveResolution({
            messageId,
            inconsistencyId,
            title: inc.title,
            option,
            customText: option === 'CUSTOM' ? solutionText : '',
            retryCount: isRetry ? ((activeResolution?.retryCount || 0) + 1) : 0
        });

        try {
            const contextText = buildContextFromSelections(
                activeBook,
                chapters,
                contextSelections?.chapterIds || [],
                characters,
                worldItems,
                contextSelections?.worldItemIds || [],
                compressContext,
                contextSelections?.characterIds || []
            );

            const modelId = chatModel || defaultModel;
            const enableTools = typeof modelId === 'string' && modelId.startsWith('deepseek');
            
            const systemPrompt = buildSystemPrompt('inconsistencia', contextText, destinationDoc, activeChapter || activeWorldDoc, { useNativeTools: enableTools });

            const userMessage = `Resuelve la inconsistencia: "${inc.title}".\nDetalle: ${inc.problem}\nOpción elegida por el escritor: ${option === 'CUSTOM' ? solutionText : option}\n\nContenido de los documentos afectados:\n${filesContextText}\n\nUsa obligatoriamente la herramienta \`aplicar_parches_resolucion\` para aplicar los cambios a los documentos correspondientes de forma limpia.`;

            const aiMessages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ];

            const response = await AIService.sendMessage(aiMessages, apiKey, {
                model: modelId,
                temperature: 0.2,
                enableTools: true,
                deepseekApiKey: apiKey
            });

            setMessages(prev => prev.map(m => {
                if (m.id === messageId) {
                    const currentInconsistencies = m.inconsistencies || parseInconsistenciesFromResponse(m.rawResponse || m.content) || [];
                    const updated = currentInconsistencies.map(item => {
                        if (item.id === inconsistencyId) {
                            return { ...item, resolved: true, selectedOption: option, customText: option === 'CUSTOM' ? solutionText : undefined };
                        }
                        return item;
                    });
                    return { ...m, inconsistencies: updated };
                }
                return m;
            }));

            if (activeSession) {
                setTimeout(() => {
                    const currentSession = SessionManager.getSession(activeSession.id);
                    if (currentSession) {
                        const updatedMessages = currentSession.messages.map(m => {
                            if (m.id === messageId) {
                                const currentInconsistencies = m.inconsistencies || parseInconsistenciesFromResponse(m.rawResponse || m.content) || [];
                                const updated = currentInconsistencies.map(item => {
                                    if (item.id === inconsistencyId) {
                                        return { ...item, resolved: true, selectedOption: option, customText: option === 'CUSTOM' ? solutionText : undefined };
                                    }
                                    return item;
                                });
                                return { ...m, inconsistencies: updated };
                            }
                            return m;
                        });
                        SessionManager.saveSessionMessages(activeSession.id, updatedMessages);
                        setActiveSession(SessionManager.getSession(activeSession.id));
                        setSessions(SessionManager.getSessions());
                    }
                }, 100);
            }

            const parsedBlocks = parseDestinationsFromResponse(response, destinationDoc, chapters, worldItems, characters);
            if (parsedBlocks && parsedBlocks.length > 0) {
                handleShowDiff(parsedBlocks);
            } else {
                window.dispatchEvent(new CustomEvent('ia-toast', {
                    detail: { message: '⚠️ La IA no devolvió cambios válidos. Inténtalo de nuevo.', type: 'warning' }
                }));
            }
        } catch (error) {
            console.error("Error al resolver inconsistencia:", error);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: `❌ Error: ${error.message || 'Error al comunicarse con la IA'}`, type: 'error' }
            }));
        } finally {
            setIsLoading(false);
        }
    }, [chapters, worldItems, characters, activeBook, contextSelections, compressContext,
        getApiKey, chatModel, defaultModel, destinationDoc, activeChapter, handleShowDiff, activeResolution, setMessages, activeSession, setSessions]);

    const handleReopenInconsistency = useCallback((messageId, inconsistencyId) => {
        setMessages(prev => prev.map(m => {
            if (m.id === messageId) {
                const currentInconsistencies = m.inconsistencies || parseInconsistenciesFromResponse(m.rawResponse || m.content) || [];
                const updated = currentInconsistencies.map(inc => {
                    if (inc.id === inconsistencyId) {
                        return { ...inc, resolved: false, wasResolved: true, selectedOption: null };
                    }
                    return inc;
                });
                return { ...m, inconsistencies: updated };
            }
            return m;
        }));

        if (activeSession) {
            setTimeout(() => {
                const currentSession = SessionManager.getSession(activeSession.id);
                if (currentSession) {
                    const updatedMsgList = currentSession.messages.map(m => {
                        if (m.id === messageId) {
                            const currentInconsistencies = m.inconsistencies || parseInconsistenciesFromResponse(m.rawResponse || m.content) || [];
                            const updated = currentInconsistencies.map(inc => {
                                    if (inc.id === inconsistencyId) {
                                        return { ...inc, resolved: false, wasResolved: true, selectedOption: null };
                                    }
                                    return inc;
                                });
                                return { ...m, inconsistencies: updated };
                            }
                            return m;
                        }
                    );
                    SessionManager.saveSessionMessages(activeSession.id, updatedMsgList);
                }
            }, 100);
        }

        window.dispatchEvent(new CustomEvent('ia-toast', {
            detail: { message: '↩️ Inconsistencia marcada como pendiente nuevamente.', type: 'info' }
        }));
    }, [activeSession, setMessages]);

    const handleCancelStream = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
    }, []);

    const handleRemoveContextItem = useCallback((type, id) => {
        if (type === 'chapter') {
            const newChapterIds = (contextSelections?.chapterIds || []).filter(cid => cid !== id);
            onContextChange({
                ...contextSelections,
                chapterIds: newChapterIds
            });
        } else if (type === 'worldItem') {
            const newWorldItemIds = (contextSelections?.worldItemIds || []).filter(wid => wid !== id);
            onContextChange({
                ...contextSelections,
                worldItemIds: newWorldItemIds
            });
        } else if (type === 'character') {
            const newCharacterIds = (contextSelections?.characterIds || []).filter(cid => cid !== id);
            onContextChange({
                ...contextSelections,
                characterIds: newCharacterIds
            });
        }
    }, [contextSelections, onContextChange]);

    const handleRegenerate = useCallback(() => {
        const lastMsg = lastUserMessageRef.current;
        if (lastMsg && messagesRef.current.length >= 2) {
            setMessages(prev => prev.slice(0, -2));
            if (activeSession) {
                SessionManager.deleteLastTwoMessages(activeSession.id);
                setSessions(SessionManager.getSessions());
            }
            setDiffBlocks(null);
            handleSend(lastMsg);
        }
    }, [handleSend, activeSession, setMessages, setSessions]);

    const ensureHtmlFormat = (content) => {
        if (!content) return '';
        if (content.includes('<p>') || content.includes('<h')) return content;
        return content
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
                if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
                return `<p>${line}</p>`;
            })
            .join('');
    };

    const handleAutoCorrectPatch = useCallback(async (blockIndex, block) => {
        setIsLoadingAutoCorrect(true);
        try {
            const apiKey = getApiKey();
            if (!apiKey) throw new Error("API Key no configurada.");

            const docId = block.docId;
            let docContent = '';
            let docTitle = block.title;
            if (docId) {
                const doc = [...(worldItems || []), ...(chapters || [])].find(d => d.id === docId);
                docContent = doc?.content || '';
                docTitle = doc?.title || doc?.name || block.title;
            } else {
                const activeDoc = activeChapter || activeWorldDoc;
                docContent = activeDoc?.content || '';
                docTitle = activeDoc?.title || activeDoc?.name || 'Documento';
            }

            const systemPrompt = `Eres un asistente de escritura e inyección de parches ultra-preciso.
El escritor tiene un documento de texto y quiere aplicar un cambio propuesto por la IA, pero el motor de inyección automático no pudo encontrar el fragmento original exacto.
Tu tarea es analizar el documento completo, encontrar la ubicación semántica y lógica más probable para aplicar la corrección, y devolver un bloque [[parche]] con el [[ORIGINAL]] copiado LETRA POR LETRA Y DE FORMA TOTALMENTE EXACTA del documento provisto, para que pueda ser reemplazado de manera automatizada.

NUNCA inventes, resumas ni alteres el texto de [[ORIGINAL]]. Debe existir exactamente igual dentro del texto del documento para que el buscador exacto lo localice.

Devuelve tu respuesta en este formato hermético:
[[TIPO: fragmento]]
[[DESTINO: ${block.docId || 'activo'}]]
[[ORIGINAL]]
[texto exacto copiado del documento]
[[/ORIGINAL]]
[[REEMPLAZO]]
${block.proposedContent}
[[/REEMPLAZO]]`;

            const userPrompt = `DOCUMENTO ORIGINAL:
"""
${cleanHtmlToPlainText(docContent)}
"""

FRACASO DE COINCIDENCIA:
El motor de parches no encontró esta parte:
"${block.original}"

EL CAMBIO PROPUESTO QUE DEBES APLICAR ES:
"${block.proposedContent}"

Por favor, localiza en el documento dónde va este cambio, extrae el texto original exacto como aparece allí y genera el bloque de parche corregido con el [[ORIGINAL]] exacto.`;

            const aiMessages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '🔄 Buscando ubicación y corrigiendo parche con la IA...', type: 'info' }
            }));

            const response = await AIService.sendMessage(aiMessages, apiKey, {
                model: chatModel || defaultModel,
                temperature: 0.1
            });

            const parsedBlocks = parseDestinationsFromResponse(response, destinationDoc, chapters, worldItems, characters);
            if (parsedBlocks && parsedBlocks.length > 0) {
                const correctedBlock = parsedBlocks[0];
                
                setDiffBlocks(prev => prev.map((b, idx) => {
                    if (idx === blockIndex) {
                        return {
                            ...b,
                            original: correctedBlock.original || b.original,
                            proposedContent: correctedBlock.proposedContent || correctedBlock.content || b.proposedContent,
                            borderColor: undefined,
                            currentContent: docContent
                        };
                    }
                    return b;
                }));

                window.dispatchEvent(new CustomEvent('ia-toast', {
                    detail: { message: '✅ Parche corregido por la IA. ¡Coincidencia lista!', type: 'success' }
                }));
            } else {
                throw new Error("No se pudo parsear el parche corregido de la respuesta de la IA.");
            }

        } catch (error) {
            console.error("Error al autocorregir parche:", error);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: `❌ Error de autocorrección: ${error.message}`, type: 'error' }
            }));
        } finally {
            setIsLoadingAutoCorrect(false);
        }
    }, [chapters, worldItems, activeChapter, activeWorldDoc, getApiKey, chatModel, defaultModel, destinationDoc]);

    const handleApplyToSelection = useCallback(async (blockIndex, block) => {
        if (!editor) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '❌ El editor debe estar abierto para aplicar en la selección.', type: 'error' }
            }));
            return;
        }

        const { from, to } = editor.state.selection;
        if (from === to) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '⚠️ Por favor, sombrea/selecciona el texto en el editor donde deseas aplicar este cambio.', type: 'warning' }
            }));
            return;
        }

        let replacementHtml = block.proposedContent;
        const trimmedRep = replacementHtml.trim();
        if (trimmedRep.toLowerCase().startsWith('<p>') && trimmedRep.toLowerCase().endsWith('</p>')) {
            replacementHtml = trimmedRep.substring(3, trimmedRep.length - 4);
        }

        try {
            editor.chain().focus().insertContentAt({ from, to }, replacementHtml).run();

            const newContent = editor.getHTML();
            saveChapterContent(newContent, 'ia');

            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '✅ Cambio aplicado con éxito en tu selección.', type: 'success' }
            }));

            setDiffBlocks(prev => {
                const remaining = prev.filter((_, idx) => idx !== blockIndex);
                if (remaining.length === 0) {
                    return null;
                }
                return remaining;
            });

        } catch (error) {
            console.error("Error al aplicar en selección:", error);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '❌ Ocurrió un error al inyectar el cambio en la selección.', type: 'error' }
            }));
        }
    }, [editor, saveChapterContent]);

    const handleApplyChanges = useCallback(async (editedBlocks) => {
        const blocks = (Array.isArray(editedBlocks) && editedBlocks.length > 0) ? editedBlocks : lastParsedBlocksRef.current;
        if (!blocks || blocks.length === 0) {
            return;
        }

        const modifiedDocs = {};

        for (const block of blocks) {
            if (block.mode === 'text') {
                continue;
            }

            let targetDoc = null;
            if (block.mode === 'manual' && block.docId) {
                targetDoc = findDestinationDoc(block, chapters, worldItems, characters);
            } else if (block.isPatch && block.title) {
                targetDoc = [...(worldItems || []), ...(chapters || []), ...(characters || [])].find(d => {
                    const dTitle = d.title || d.name || '';
                    return dTitle.toLowerCase().trim() === block.title.toLowerCase().trim();
                }) || null;
            }
            if (!targetDoc) {
                targetDoc = activeChapter || activeWorldDoc || null;
            }

            if (block.isPatch) {
                let targetHtml = '';
                if (targetDoc?.id && modifiedDocs[targetDoc.id]) {
                    targetHtml = modifiedDocs[targetDoc.id].finalHtml;
                } else {
                    targetHtml = targetDoc?.content || '';
                }

                const { success, html: patchedHtml, method } = applyPatch(targetHtml, block.original, block.proposedContent);

                if (!success) {
                    console.warn(`[IAStudio] Patch not applied (method: ${method}). Fragment not found in document.`);
                    window.dispatchEvent(new CustomEvent('ia-toast', {
                        detail: { message: `⚠️ No se encontró el fragmento en "${block.title || 'el documento'}". Aplica el cambio manualmente.`, type: 'warning' }
                    }));
                    continue;
                }

                if (targetDoc?.id) {
                    const isChapter = chapters?.some(c => c.id === targetDoc.id);
                    const isWorldItem = worldItems?.some(w => w.id === targetDoc.id);
                    
                    modifiedDocs[targetDoc.id] = {
                        finalHtml: patchedHtml,
                        targetDoc,
                        isChapter,
                        isWorldItem
                    };
                } else {
                    const activeDoc = activeChapter || activeWorldDoc;
                    if (activeDoc) {
                        modifiedDocs[activeDoc.id] = {
                            finalHtml: patchedHtml,
                            targetDoc: activeDoc,
                            isChapter: !!activeChapter,
                            isWorldItem: !!activeWorldDoc
                        };
                    }
                }
                continue;
            }

            if (block.isSection) {
                const allSections = accumulatedSections.length > 0
                    ? accumulatedSections
                    : [{ sectionIndex: block.sectionIndex, html: block.proposedContent }];

                const combinedHtml = allSections
                    .sort((a, b) => a.sectionIndex - b.sectionIndex)
                    .map(s => s.html)
                    .join('\n');

                const htmlContent = ensureHtmlFormat(combinedHtml);

                if (block.mode === 'manual' && block.docId) {
                    const isChapter = block.docType === 'chapter';
                    const isWorldItem = block.docType === 'worldItem';
                    modifiedDocs[block.docId] = {
                        finalHtml: htmlContent,
                        targetDoc: { id: block.docId },
                        isChapter,
                        isWorldItem
                    };
                } else {
                    const activeDoc = activeChapter || activeWorldDoc;
                    if (activeDoc) {
                        modifiedDocs[activeDoc.id] = {
                            finalHtml: htmlContent,
                            targetDoc: activeDoc,
                            isChapter: !!activeChapter,
                            isWorldItem: !!activeWorldDoc
                        };
                    } else {
                        createChapter({ title: block.title || 'Nuevo capítulo', content: htmlContent });
                    }
                }
                continue;
            }

            if (block.isScene) {
                let currentHtml = '';
                if (targetDoc?.id && modifiedDocs[targetDoc.id]) {
                    currentHtml = modifiedDocs[targetDoc.id].finalHtml;
                } else {
                    currentHtml = targetDoc?.content || '';
                }

                const sceneHtml = ensureHtmlFormat(block.proposedContent);
                const divider = `<h3>Escena ${block.sceneIndex || 1}: ${block.titleOriginal || 'Nueva Escena'}</h3>`;
                
                const existingHtml = currentHtml.trim();
                const combinedHtml = existingHtml 
                    ? `${existingHtml}\n${divider}\n${sceneHtml}` 
                    : `${divider}\n${sceneHtml}`;

                if (block.mode === 'manual' && block.docId) {
                    const isChapter = block.docType === 'chapter';
                    const isWorldItem = block.docType === 'worldItem';
                    modifiedDocs[block.docId] = {
                        finalHtml: combinedHtml,
                        targetDoc: { id: block.docId },
                        isChapter,
                        isWorldItem
                    };
                } else {
                    const activeDoc = activeChapter || activeWorldDoc;
                    if (activeDoc) {
                        modifiedDocs[activeDoc.id] = {
                            finalHtml: combinedHtml,
                            targetDoc: activeDoc,
                            isChapter: !!activeChapter,
                            isWorldItem: !!activeWorldDoc
                        };
                    } else {
                        createChapter({ title: block.title || 'Nuevo capítulo', content: combinedHtml });
                    }
                }
                continue;
            }

            const htmlContent = ensureHtmlFormat(block.proposedContent);

            if (block.mode === 'manual' && block.docId) {
                const isChapter = block.docType === 'chapter';
                const isWorldItem = block.docType === 'worldItem';
                modifiedDocs[block.docId] = {
                    finalHtml: htmlContent,
                    targetDoc: { id: block.docId },
                    isChapter,
                    isWorldItem
                };
            } else if (block.mode === 'auto') {
                const activeDoc = activeChapter || activeWorldDoc;
                if (activeDoc) {
                    modifiedDocs[activeDoc.id] = {
                        finalHtml: htmlContent,
                        targetDoc: activeDoc,
                        isChapter: !!activeChapter,
                        isWorldItem: !!activeWorldDoc
                    };
                } else {
                    const title = block.title || 'Nuevo capítulo';
                    createChapter({ title, content: htmlContent });
                }
            } else if (block.mode === 'new') {
                const title = destinationDoc?.docTitle || block.title || 'Nuevo capítulo';
                createChapter({ title, content: htmlContent });
            }
        }

        for (const docId of Object.keys(modifiedDocs)) {
            const { finalHtml, isChapter, isWorldItem } = modifiedDocs[docId];

            if (isChapter) {
                if (docId === activeChapter?.id) {
                    saveChapterContent(finalHtml, 'ia');
                    await saveDocumentSnapshot(docId, finalHtml, 'ia');
                } else {
                    updateChapter(docId, { content: finalHtml });
                    await saveDocumentSnapshot(docId, finalHtml, 'ia');
                }
            } else if (isWorldItem) {
                if (docId === activeWorldDoc?.id) {
                    saveWorldDocContent(finalHtml, 'ia');
                    await saveDocumentSnapshot(docId, finalHtml, 'ia');
                } else {
                    updateWorldItem(docId, { content: finalHtml });
                    await saveDocumentSnapshot(docId, finalHtml, 'ia');
                }
            }
        }

        if (activeResolution) {
            const { messageId, inconsistencyId, option, customText } = activeResolution;
            setMessages(prev => prev.map(m => {
                if (m.id === messageId) {
                    const currentInconsistencies = m.inconsistencies || parseInconsistenciesFromResponse(m.rawResponse || m.content) || [];
                    const updated = currentInconsistencies.map(inc => {
                        if (inc.id === inconsistencyId) {
                            return { ...inc, resolved: true, selectedOption: option, customText };
                        }
                        return inc;
                    });
                    return { ...m, inconsistencies: updated };
                }
                return m;
            }));

            if (activeSession) {
                setTimeout(() => {
                    const currentSession = SessionManager.getSession(activeSession.id);
                    if (currentSession) {
                        const updatedMsgList = currentSession.messages.map(m => {
                            if (m.id === messageId) {
                                const currentInconsistencies = m.inconsistencies || parseInconsistenciesFromResponse(m.rawResponse || m.content) || [];
                                const updated = currentInconsistencies.map(inc => {
                                    if (inc.id === inconsistencyId) {
                                        return { ...inc, resolved: true, selectedOption: option, customText };
                                    }
                                    return inc;
                                });
                                return { ...m, inconsistencies: updated };
                            }
                            return m;
                        });
                        SessionManager.saveSessionMessages(activeSession.id, updatedMsgList);
                        setActiveSession(SessionManager.getSession(activeSession.id));
                        setSessions(SessionManager.getSessions());
                    }
                }, 100);
            }

            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '✅ Cambios guardados e Inconsistencia resuelta con éxito.', type: 'success' }
            }));

            setActiveResolution(null);
        }

        setDiffBlocks(null);
    }, [saveChapterContent, saveWorldDocContent, updateChapter, updateWorldItem, createChapter, activeChapter, activeWorldDoc, chapters, worldItems, accumulatedSections, activeResolution, setMessages, activeSession, setSessions]);

    const handleExport = useCallback(() => {
        if (messages.length === 0) return;

        const lines = [];
        lines.push('=== IA Studio - Conversación ===');
        lines.push(`Fecha: ${new Date().toLocaleDateString()}`);
        lines.push('');
        lines.push('--- Conversación ---');
        lines.push('');

        messages.forEach(msg => {
            const role = msg.role === 'user' ? '👤 Tú' : '🤖 IA';
            const cleanContent = msg.content?.replace(/<[^>]*>/g, '') || '';
            lines.push(`${role}:`);
            lines.push(cleanContent);
            lines.push('');
        });

        const text = lines.join('\n');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ia-studio-conversacion-${Date.now()}.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, [messages]);

    const handleNewChat = useCallback(() => {
        newSession();
        setDiffBlocks(null);
        setSectionMode(false);
        setSectionConfig(null);
        setCurrentSectionIndex(1);
        setAccumulatedSections([]);
        setActiveFragment('');
    }, [newSession]);

    return {
        // States
        isLoading,
        isLoadingAutoCorrect,
        diffBlocks,
        showContextModal,
        showDestinationModal,
        selectedAction,
        sectionMode,
        sectionConfig,
        currentSectionIndex,
        accumulatedSections,
        activeFragment,
        activeResolution,
        chatModel,
        chatReasoningMode,
        chatReasoningEffort,
        messages,
        activeSession,
        contextSelections,
        activeBook,
        chapters,
        characters,
        worldItems,
        compressContext,
        destinationDoc,
        defaultModel,

        // Setters for UI modals
        setShowContextModal,
        setShowDestinationModal,
        setDiffBlocks,
        setActiveResolution,
        setCompressContext,

        // Callbacks / Handlers
        handleSend,
        handleResolveInconsistency,
        handleReopenInconsistency,
        handleCancelStream,
        handleRemoveContextItem,
        handleRegenerate,
        handleAutoCorrectPatch,
        handleApplyToSelection,
        handleApplyChanges,
        handleExport,
        handleNewChat,
        handleModelChange,
        handleReasoningModeChange,
        handleReasoningEffortChange,
        handleActionChange,
        handleFragmentChange,
        handleSectionModeChange,
        deleteMessage,
        renameSession,
        deleteSession
    };
};
