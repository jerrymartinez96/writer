import React, { useState, useCallback, useEffect, useRef } from 'react';
import IAStudioChat from './IAStudioChat';
import IAStudioDiff from './IAStudioDiff';
import IAStudioContextConfigModal from './IAStudioContextConfigModal';
import SessionManager from './IAStudioSessionManager';
import {
    buildContextFromSelections,
    buildSystemPrompt,
    parseDestinationsFromResponse,
    tryParseAIJsonExported,
    QUICK_ACTIONS,
    findDestinationDoc,
    cleanText,
    cleanHtmlToPlainText,
    plainTextToHtml,
    smartMergePartialResponse,
    applyPatch,
    SYSTEM_WORLD_ITEM_IDS,
    parseInconsistenciesFromResponse,
    SYSTEM_WORLD_ITEM_LABELS,
} from './IAStudioUtils';

import { AIService } from '../../services/AIService';
import { useData } from '../../context/DataContext';
import { useIAStudioContext } from '../../context/IAStudioContext';

const generateMsgId = () => 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

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

const IAStudio = () => {
    const {
        activeBook, activeChapter, chapters, characters, worldItems,
        saveChapterContent, updateChapter, updateWorldItem, createChapter,
        profile, updateBookData, lazyLoadChapters,
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
    const [diffBlocks, setDiffBlocks] = useState(null);
    const [showContextModal, setShowContextModal] = useState(false);
    const [selectedAction, setSelectedAction] = useState('escribir');

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

    // AI settings
    const aiSettings = activeBook?.aiSettings || {};
    const selectedApi = aiSettings.selectedApi || 'openrouter';
    const selectedModel = aiSettings.selectedAiModel || 'google/gemini-2.0-flash-exp:free';
    const temperature = aiSettings.temperature ?? 0.7;

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

    // Listen for fragment updates (from IAStudioChat)
    useEffect(() => {
        const handler = (e) => setActiveFragment(e.detail || '');
        window.addEventListener('ia-studio-fragment', handler);
        return () => window.removeEventListener('ia-studio-fragment', handler);
    }, []);

    // Listen for section mode config
    useEffect(() => {
        const handler = (e) => {
            if (e.detail) {
                setSectionMode(true);
                setSectionConfig(e.detail);
                setCurrentSectionIndex(1);
                setAccumulatedSections([]);
            } else {
                setSectionMode(false);
                setSectionConfig(null);
                setCurrentSectionIndex(1);
                setAccumulatedSections([]);
            }
        };
        window.addEventListener('ia-studio-section-mode', handler);
        return () => window.removeEventListener('ia-studio-section-mode', handler);
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

        const blocks = actionableBlocks.map(block => {
            let currentContent = '';
            let title = block.title || 'Documento';

            if (block.mode === 'manual' && block.docId) {
                const doc = findDestinationDoc(block, chapters, worldItems);
                currentContent = doc?.content || '';
                title = block.title || doc?.title || 'Documento';
            } else if (block.mode === 'auto' && activeChapter) {
                currentContent = activeChapter.content || '';
                title = block.title || activeChapter.title || 'Capítulo activo';
            }

            let proposedContent = block.content;

            // ── Smart Merge para respuestas parciales ──
            // Si la IA devolvió solo las secciones modificadas (omitiendo las sin cambios),
            // fusionamos inteligentemente con el original para preservar las secciones intactas.
            if (currentContent && proposedContent && !block.isPatch && !block.isSection && block.mode !== 'new') {
                const currentText = cleanHtmlToPlainText(currentContent);
                const proposedText = cleanHtmlToPlainText(proposedContent);
                const currentWordCount = currentText.split(/\s+/).filter(Boolean).length;
                const proposedWordCount = proposedText.split(/\s+/).filter(Boolean).length;

                // Detectar respuesta parcial: la IA lo declaró explícitamente, o el texto propuesto
                // es significativamente más corto que el original (< 70% de las palabras)
                const isPartial = block.isPartial || (proposedWordCount < currentWordCount * 0.7);

                if (isPartial) {
                    console.log(`[SMART MERGE] Respuesta parcial detectada (${proposedWordCount} vs ${currentWordCount} palabras). Fusionando con original...`);
                    const mergedText = smartMergePartialResponse(currentText, proposedText);
                    proposedContent = plainTextToHtml(mergedText);
                    console.log(`[SMART MERGE] Resultado: ${mergedText.split(/\s+/).filter(Boolean).length} palabras (original preservado).`);
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
    }, [chapters, worldItems, activeChapter]);


    // Get API key
    const getApiKey = useCallback(() => {
        if (selectedApi === 'google_direct') {
            return aiSettings.googleApiKey || profile?.googleApiKey || localStorage.getItem('googleApiKey');
        }
        if (selectedApi === 'deepseek') {
            return aiSettings.deepseekApiKey || profile?.deepseekApiKey || localStorage.getItem('deepseekApiKey');
        }
        return aiSettings.openRouterKey || profile?.openRouterKey || localStorage.getItem('openRouterKey');
    }, [selectedApi, aiSettings, profile]);

    // Send message
    const handleSend = useCallback(async (userMessage, overrideAction = null) => {
        const apiKey = getApiKey();
        let effectiveAction = overrideAction || selectedAction;

        // BUG FIX: Si el Modo Extenso (Secciones) está activo, forzamos la acción
        // efectiva a 'seccion' para activar el prompt y parser correctos.
        if (effectiveAction === 'escribir' && sectionMode) {

            effectiveAction = 'seccion';
        }

        if (!apiKey) {
            const apiName = selectedApi === 'google_direct' ? 'Google' : selectedApi === 'deepseek' ? 'DeepSeek' : 'OpenRouter';
            const errorMsg = `❌ API Key de ${apiName} no configurada. Ve a Ajustes > Inteligencia para configurarla.`;

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

        // Build context
        const contextText = buildContextFromSelections(
            activeBook,
            chapters,
            contextSelections?.chapterIds || [],
            characters,
            worldItems,
            contextSelections?.worldItemIds || [],
            compressContext
        );

        // Build extra options for section mode
        const extraOptions = {};
        extraOptions.chapters = chapters;
        extraOptions.worldItems = worldItems;

        if (effectiveAction === 'seccion' && sectionConfig) {
            extraOptions.sectionIndex = currentSectionIndex;
            extraOptions.totalSections = sectionConfig.total;
            extraOptions.sectionDescription = sectionConfig.descriptions?.[currentSectionIndex - 1] || '';

            // Add accumulated sections as context
            if (accumulatedSections.length > 0) {
                const prevSectionsText = accumulatedSections
                    .map((s, i) => `[Sección ${i + 1} ya escrita]: ${cleanText(s.html || '').substring(0, 500)}...`)
                    .join('\n');
                extraOptions.previousSections = prevSectionsText;
            }
        }

        // If fragment mode, inject the fragment into the message
        let fullUserMessage = userMessage;
        if (effectiveAction === 'fragmento' && activeFragment) {
            fullUserMessage = `FRAGMENTO A EDITAR:\n"""\n${activeFragment}\n"""\n\nINSTRUCCIÓN: ${userMessage}`;
        }

        // Build system prompt
        const systemPrompt = buildSystemPrompt(
            effectiveAction,
            contextText,
            destinationDoc,
            activeChapter,
            extraOptions
        );

        const useJsonMode = false;

        const aiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({
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
            let fullResponse = '';
            let finalUsage = null;

            await AIService.generateStream(aiMessages, {
                selectedAiModel: selectedModel,
                selectedApi: selectedApi,
                openRouterKey: selectedApi === 'openrouter' ? apiKey : null,
                googleApiKey: selectedApi === 'google_direct' ? apiKey : null,
                deepseekApiKey: selectedApi === 'deepseek' ? apiKey : null,
                reasoningMode: aiSettings.reasoningMode ?? false,
                temperature: temperature,
                useJsonMode: useJsonMode,
                signal: abortControllerRef.current.signal,
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

            const isEchoingContext = fullResponse.trim().startsWith('<book>') || fullResponse.trim().startsWith('=== ');

            if (isEchoingContext) {
                const errorMsg = '⚠️ **La IA no pudo procesar tu solicitud.** Devolvió el contexto en lugar de contenido nuevo.';
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: errorMsg, isStreaming: false, responseType: 'error' } : m
                ));
            } else {
                const parsedBlocks = parseDestinationsFromResponse(fullResponse, destinationDoc, chapters, worldItems);

                const textBlocks = parsedBlocks.filter(b => b.mode === 'text');
                const htmlBlocks = parsedBlocks.filter(b => b.mode !== 'text');
                const patchBlocks = parsedBlocks.filter(b => b.isPatch);
                const sectionBlocks = parsedBlocks.filter(b => b.isSection);
                const sceneBlocks = parsedBlocks.filter(b => b.isScene);

                let displayContent;
                let responseType = 'analysis';

                if (patchBlocks.length > 0) {
                    // Patch response — mostrar resumen del cambio
                    responseType = 'patch';
                    const patch = patchBlocks[0];
                    const originalPreview = (patch.original || '').substring(0, 120);
                    const replacementWords = cleanText(patch.content || '').split(/\s+/).filter(Boolean).length;
                    displayContent = `✂️ **Fragmento editado** — ${replacementWords} palabras en el reemplazo\n\n${patch.context ? `> ${patch.context}` : ''}`;

                    if (originalPreview) {
                        displayContent += `\n\n**Original:** "${originalPreview}${patch.original?.length > 120 ? '...' : ''}"`;
                    }
                } else if (sceneBlocks.length > 0) {
                    // Scene response
                    responseType = 'scene';
                    const scene = sceneBlocks[0];
                    const wordCount = cleanText(scene.content || '').split(/\s+/).filter(Boolean).length;
                    displayContent = `🎬 **Escena ${scene.sceneIndex || 1}: ${scene.titleOriginal || 'Nueva Escena'}** generada — ${wordCount} palabras`;
                } else if (sectionBlocks.length > 0) {
                    // Section response
                    responseType = 'section';
                    const section = sectionBlocks[0];
                    const wordCount = cleanText(section.content || '').split(/\s+/).filter(Boolean).length;
                    displayContent = `📄 **Sección ${section.sectionIndex} de ${section.totalSections}** generada — ${wordCount} palabras`;

                    // Acumulate section
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

                // Si la respuesta contiene inconsistencias XML o de doble corchete, promover su tipo a 'inconsistencias'
                // NOTA: Usar .toLowerCase() porque la IA a veces escribe [[INCONSISTENCIA]] en mayúsculas
                const lowerResp = fullResponse.toLowerCase();
                if (responseType === 'analysis' && (lowerResp.includes('<inconsistencia') || lowerResp.includes('[[inconsistencia'))) {
                    responseType = 'inconsistencies';
                }


                const inconsistencies = responseType === 'inconsistencies'
                    ? (parsedBlocks[0]?.inconsistencies || parseInconsistenciesFromResponse(fullResponse) || [])
                    : undefined;

                if (responseType === 'inconsistencies') {
                    // Limpiar el XML crudo, los dobles corchetes y los bloques de código que lo envuelven del displayContent
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


                if (activeSession && finalUsage) {
                    const inputTokenCost = aiSettings.inputTokenCost ?? 0.075;
                    const outputTokenCost = aiSettings.outputTokenCost ?? 0.15;
                    SessionManager.addSessionCumulativeUsage(activeSession.id, finalUsage, inputTokenCost, outputTokenCost);
                }

                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { 
                        ...m, 
                        content: displayContent || fullResponse, 
                        rawResponse: fullResponse, 
                        isStreaming: false, 
                        responseType, 
                        inconsistencies,
                        usage: finalUsage 
                    } : m
                ));
                if (activeSession) {
                    SessionManager.updateLastAssistantMessage(
                        activeSession.id, 
                        displayContent || fullResponse, 
                        true, 
                        responseType, 
                        fullResponse, 
                        finalUsage,
                        inconsistencies
                    );
                    // Sync active session and sessions in state with cumulativeUsage changes
                    setActiveSession(SessionManager.getSession(activeSession.id));
                    setSessions(SessionManager.getSessions());
                }

                const shouldShowDiff = htmlBlocks.length > 0 || patchBlocks.length > 0 || sectionBlocks.length > 0 || sceneBlocks.length > 0;

                if (shouldShowDiff && !isEchoingContext) {
                    handleShowDiff(parsedBlocks);
                }

                // Advance section index if in section mode
                if (effectiveAction === 'seccion' && sectionConfig && currentSectionIndex < sectionConfig.total) {
                    setCurrentSectionIndex(prev => prev + 1);
                }
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log("Generación cancelada por el usuario.");
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
    }, [messages, activeBook, chapters, characters, worldItems, contextSelections, destinationDoc, selectedAction,
        selectedApi, selectedModel, temperature, aiSettings, getApiKey, handleShowDiff, activeSession, setMessages,
        setSessions, compressContext, activeFragment, sectionConfig, sectionMode, currentSectionIndex, accumulatedSections,
        activeChapter]);

    // Resolve an inconsistency by requesting the IA to edit the affected documents
    const handleResolveInconsistency = useCallback(async (messageId, inconsistencyId, option, solutionText, isRetry = false) => {
        const apiKey = getApiKey();
        if (!apiKey) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '❌ API Key no configurada. Ve a Ajustes > Inteligencia.', type: 'error' }
            }));
            return;
        }

        // 1. Localizar la inconsistencia en el historial de mensajes
        const msg = messages.find(m => m.id === messageId);
        if (!msg) return;

        const inconsistencies = msg.inconsistencies || parseInconsistenciesFromResponse(msg.rawResponse || msg.content) || [];
        const inc = inconsistencies.find(i => i.id === inconsistencyId);
        if (!inc) return;

        // 2. Reunir contenidos de los archivos afectados
        const affectedContents = [];
        inc.files.forEach(fId => {
            let docContent = '';
            let docTitle = fId;
            if (fId.startsWith('system_')) {
                const doc = worldItems?.find(w => w.id === fId);
                docContent = doc?.content || '';
                docTitle = SYSTEM_WORLD_ITEM_LABELS[fId] || fId;
            } else {
                // Buscar en capítulos por título o ID
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
            // 3. Construir el contexto general desde las selecciones
            const contextText = buildContextFromSelections(
                activeBook,
                chapters,
                contextSelections?.chapterIds || [],
                characters,
                worldItems,
                contextSelections?.worldItemIds || [],
                compressContext
            );

            // 4. Construir el system prompt usando el catálogo centralizado
            const extraOptions = { chapters, worldItems };
            const systemPrompt = buildSystemPrompt(
                'inconsistencia',
                contextText,
                destinationDoc,
                activeChapter,
                extraOptions
            );

            // 5. Mensaje de usuario con los detalles específicos de la inconsistencia + archivos afectados
            const userPrompt = `RESOLUCIÓN DE INCONSISTENCIA:

CONFLICTO DE LORE: "${inc.title}"
PROBLEMA DETECTADO: "${inc.problem}"
SOLUCIÓN SELECCIONADA POR EL ESCRITOR: "${solutionText}" (${option})

DOCUMENTOS AFECTADOS (contenido actual):
${filesContextText}

APLICA LA SOLUCIÓN: Edita SOLO las secciones necesarias de los documentos afectados.
NUNCA reescribas un documento completo — usa SIEMPRE [ÁMBITO: parcial].
Si el cambio es pequeño y localizado, usa [TIPO: fragmento] con el bloque [ORIGINAL].`;

            const aiMessages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const response = await AIService.sendMessage(aiMessages, apiKey, {
                model: selectedModel,
                apiSelected: selectedApi,
                temperature: 0.2 // Baja temperatura para parches precisos
            });

            // 6. Parsear destinos y mostrar visor de diferencias
            const parsedBlocks = parseDestinationsFromResponse(response, destinationDoc, chapters, worldItems);
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
    }, [messages, chapters, worldItems, characters, activeBook, contextSelections, compressContext,
        getApiKey, selectedModel, selectedApi, destinationDoc, activeChapter, handleShowDiff, activeResolution]);


    // Cancel Stream Generation
    const handleCancelStream = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
    }, []);

    // Switch Model mid-chat
    const handleModelChange = useCallback((modelId) => {
        let api = selectedApi;
        if (modelId.startsWith('google_direct/')) {
            api = 'google_direct';
        } else if (modelId.startsWith('deepseek-')) {
            api = 'deepseek';
        } else if (modelId.includes('/') && !modelId.startsWith('google_direct/')) {
            api = 'openrouter';
        }

        updateBookData({
            aiSettings: {
                ...aiSettings,
                selectedApi: api,
                selectedAiModel: modelId
            }
        });
    }, [aiSettings, selectedApi, updateBookData]);

    // Remove item from selected Context
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
        }
    }, [contextSelections, onContextChange]);

    // Regenerate
    const handleRegenerate = useCallback(() => {
        const lastMsg = lastUserMessageRef.current;
        if (lastMsg && messages.length >= 2) {
            setMessages(prev => prev.slice(0, -2));
            if (activeSession) {
                SessionManager.deleteLastTwoMessages(activeSession.id);
                setSessions(SessionManager.getSessions());
            }
            setDiffBlocks(null);
            handleSend(lastMsg);
        }
    }, [handleSend, messages, activeSession, setMessages, setSessions]);

    // Helper to convert plain text to HTML
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

    // Apply changes — supports regular content, patches, and section accumulation
    const handleApplyChanges = useCallback((editedBlocks) => {
        const blocks = (Array.isArray(editedBlocks) && editedBlocks.length > 0) ? editedBlocks : lastParsedBlocksRef.current;
        if (!blocks || blocks.length === 0) {
            return;
        }

        blocks.forEach((block, idx) => {
            if (block.mode === 'text') return;

            // ── Patch mode ──
            if (block.isPatch) {
                const targetDoc = block.mode === 'manual' && block.docId
                    ? findDestinationDoc(block, chapters, worldItems)
                    : (activeChapter || null);

                const targetHtml = targetDoc?.content || activeChapter?.content || '';
                const { success, html: patchedHtml, method } = applyPatch(targetHtml, block.original, block.proposedContent);

                if (!success) {
                    console.warn(`[IAStudio] Patch not applied (method: ${method}). Fragment not found in document.`);
                    // Fallback: alert the user via a toast or just skip
                    window.dispatchEvent(new CustomEvent('ia-toast', {
                        detail: { message: '⚠️ No se encontró el fragmento exacto en el documento. Aplica el cambio manualmente.', type: 'warning' }
                    }));
                    return;
                }

                if (block.mode === 'manual' && block.docId) {
                    if (block.docType === 'chapter') {
                        if (block.docId === activeChapter?.id) {
                            saveChapterContent(patchedHtml);
                        } else {
                            updateChapter(block.docId, { content: patchedHtml });
                        }
                    } else if (block.docType === 'worldItem') {
                        updateWorldItem(block.docId, { content: patchedHtml });
                    }
                } else if (activeChapter) {
                    saveChapterContent(patchedHtml);
                }
                return;
            }

            // ── Section mode: apply accumulated sections ──
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
                    if (block.docType === 'chapter') {
                        if (block.docId === activeChapter?.id) {
                            saveChapterContent(htmlContent);
                        } else {
                            updateChapter(block.docId, { content: htmlContent });
                        }
                    }
                } else if (activeChapter) {
                    saveChapterContent(htmlContent);
                } else {
                    createChapter({ title: block.title || 'Nuevo capítulo', content: htmlContent });
                }
                return;
            }

            // ── Scene mode: apply accumulated/appended scene ──
            if (block.isScene) {
                const targetDoc = block.mode === 'manual' && block.docId
                    ? findDestinationDoc(block, chapters, worldItems)
                    : (activeChapter || null);

                const currentHtml = targetDoc?.content || '';
                const sceneHtml = ensureHtmlFormat(block.proposedContent);
                
                // Separador personalizado: "Escena N: [Nombre]"
                const divider = `<h3>Escena ${block.sceneIndex || 1}: ${block.titleOriginal || 'Nueva Escena'}</h3>`;
                
                const existingHtml = currentHtml.trim();
                const combinedHtml = existingHtml 
                    ? `${existingHtml}\n${divider}\n${sceneHtml}` 
                    : `${divider}\n${sceneHtml}`;

                if (block.mode === 'manual' && block.docId) {
                    if (block.docType === 'chapter') {
                        if (block.docId === activeChapter?.id) {
                            saveChapterContent(combinedHtml);
                        } else {
                            updateChapter(block.docId, { content: combinedHtml });
                        }
                    } else if (block.docType === 'worldItem') {
                        updateWorldItem(block.docId, { content: combinedHtml });
                    }
                } else if (activeChapter) {
                    saveChapterContent(combinedHtml);
                } else {
                    createChapter({ title: block.title || 'Nuevo capítulo', content: combinedHtml });
                }
                return;
            }

            // ── Standard content mode ──
            const htmlContent = ensureHtmlFormat(block.proposedContent);

            if (block.mode === 'manual' && block.docId) {
                if (block.docType === 'chapter') {
                    if (block.docId === activeChapter?.id) {
                        saveChapterContent(htmlContent);
                    } else {
                        updateChapter(block.docId, { content: htmlContent });
                    }
                } else if (block.docType === 'worldItem') {
                    updateWorldItem(block.docId, { content: htmlContent });
                }
            } else if (block.mode === 'auto') {
                if (activeChapter) {
                    saveChapterContent(htmlContent);
                } else {
                    const title = block.title || 'Nuevo capítulo';
                    createChapter({ title, content: htmlContent });
                }
            } else if (block.mode === 'new') {
                const title = block.title || 'Nuevo capítulo';
                createChapter({ title, content: htmlContent });
            }
        });

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

            // Guardar en la sesión de Firebase/SessionManager para persistencia
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
    }, [saveChapterContent, updateChapter, updateWorldItem, createChapter, activeChapter, chapters, worldItems, accumulatedSections, activeResolution, setMessages, activeSession, setSessions]);


    // Export conversation
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
        URL.revokeObjectURL(url);
    }, [messages]);

    // Clear conversation
    const handleNewChat = useCallback(() => {
        newSession();
        setDiffBlocks(null);
        setSectionMode(false);
        setSectionConfig(null);
        setCurrentSectionIndex(1);
        setAccumulatedSections([]);
        setActiveFragment('');
    }, [newSession]);


    return (
        <div className="h-full flex bg-[var(--bg-app)] overflow-hidden">
            <IAStudioChat
                messages={messages}
                onSend={handleSend}
                onDeleteMessage={deleteMessage}
                activeSession={activeSession}
                onRenameSession={renameSession}
                onDeleteSession={deleteSession}
                onShowDiff={(content) => {
                    const parsed = parseDestinationsFromResponse(content, destinationDoc, chapters, worldItems);
                    handleShowDiff(parsed);
                }}
                isLoading={isLoading}
                selectedAction={selectedAction}
                onNewChat={handleNewChat}
                onOpenContext={() => setShowContextModal(true)}
                onOpenSessions={() => window.dispatchEvent(new CustomEvent('open-mobile-sidebar'))}
                onExport={handleExport}
                QUICK_ACTIONS={QUICK_ACTIONS}
                selectedApi={selectedApi}
                selectedModel={selectedModel}
                contextSelections={contextSelections}
                activeBook={activeBook}
                chapters={chapters}
                characters={characters}
                worldItems={worldItems}
                onModelChange={handleModelChange}
                onRemoveContextItem={handleRemoveContextItem}
                onCancelStream={handleCancelStream}
                onRegenerate={handleRegenerate}
                compressContext={compressContext}
                onToggleCompress={() => setCompressContext(prev => !prev)}
                activeFragment={activeFragment}
                sectionMode={sectionMode}
                sectionConfig={sectionConfig}
                currentSectionIndex={currentSectionIndex}
                accumulatedSections={accumulatedSections}
                destinationDoc={destinationDoc}
                onResolveInconsistency={handleResolveInconsistency}
            />

            {/* Diff Modal */}
            {diffBlocks && diffBlocks.length > 0 && (
                <IAStudioDiff
                    diffBlocks={diffBlocks}
                    destinationTitle={diffBlocks[0]?.title}
                    onApply={handleApplyChanges}
                    onClose={() => {
                        setDiffBlocks(null);
                        setActiveResolution(null);
                    }}
                    onRegenerate={() => {
                        if (activeResolution) {
                            handleResolveInconsistency(
                                activeResolution.messageId,
                                activeResolution.inconsistencyId,
                                activeResolution.option,
                                activeResolution.customText || 'applied',
                                true // isRetry
                            );
                        } else {
                            handleRegenerate();
                        }
                    }}
                    accumulatedSections={accumulatedSections}
                    activeResolution={activeResolution}
                />
            )}

            {/* Context Config Modal */}
            <IAStudioContextConfigModal
                isOpen={showContextModal}
                onClose={() => setShowContextModal(false)}
                chapters={chapters}
                worldItems={worldItems}
            />
        </div>
    );
};

export default IAStudio;
