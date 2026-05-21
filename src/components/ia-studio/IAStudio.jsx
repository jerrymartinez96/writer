import React, { useState, useCallback, useEffect, useRef } from 'react';
import IAStudioChat from './IAStudioChat';
import IAStudioDiff from './IAStudioDiff';
import IAStudioContextConfigModal from './IAStudioContextConfigModal';
import {
    buildContextFromSelections,
    buildSystemPrompt,
    extractHtmlContent,
    QUICK_ACTIONS,
    findDestinationDoc,
} from './IAStudioUtils';
import { AIService } from '../../services/AIService';
import { useData } from '../../context/DataContext';
import { useIAStudioContext } from '../../context/IAStudioContext';

const generateMsgId = () => 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

const IAStudio = () => {
    const {
        activeBook, activeChapter, chapters, characters, worldItems,
        saveChapterContent, updateWorldItem, createChapter,
        profile,
    } = useData();

    const { contextSelections, destinationDoc } = useIAStudioContext();

    // Simple in-memory messages array
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [diffContent, setDiffContent] = useState(null);
    const [showContextModal, setShowContextModal] = useState(false);
    const [selectedAction, setSelectedAction] = useState('personalizado');

    // Track for regeneration
    const lastUserMessageRef = useRef('');

    // AI settings
    const aiSettings = activeBook?.aiSettings || {};
    const selectedApi = aiSettings.selectedApi || 'openrouter';
    const selectedModel = aiSettings.selectedAiModel || 'google/gemini-2.0-flash-exp:free';

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

    // Show diff
    const handleShowDiff = useCallback((aiContent) => {
        const dest = destinationDoc || { mode: 'auto' };

        if (dest.mode === 'manual' && dest.docId) {
            const doc = findDestinationDoc(dest, chapters, worldItems);
            const currentContent = doc?.content || '';
            setDiffContent({
                currentContent,
                proposedContent: aiContent,
                destinationTitle: dest.docTitle || doc?.title || 'Documento',
                destinationDoc: dest,
            });
        } else {
            setDiffContent({
                currentContent: '',
                proposedContent: aiContent,
                destinationTitle: dest.mode === 'new' ? 'Nuevo documento' : 'Automático',
                destinationDoc: dest,
            });
        }
    }, [destinationDoc, chapters, worldItems]);

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
    const handleSend = useCallback(async (userMessage) => {
        const apiKey = getApiKey();
        if (!apiKey) {
            const apiName = selectedApi === 'google_direct' ? 'Google' : selectedApi === 'deepseek' ? 'DeepSeek' : 'OpenRouter';
            const errorMsg = `❌ API Key de ${apiName} no configurada. Ve a Ajustes > Inteligencia para configurarla.`;

            setMessages(prev => [
                ...prev,
                { id: generateMsgId(), role: 'user', content: userMessage, timestamp: Date.now() },
                { id: generateMsgId(), role: 'assistant', content: errorMsg, timestamp: Date.now() },
            ]);
            return;
        }

        // Save last message for regeneration
        lastUserMessageRef.current = userMessage;

        // Build context from selected documents
        const contextText = buildContextFromSelections(
            activeBook,
            chapters,
            contextSelections?.chapterIds || [],
            characters,
            worldItems,
            contextSelections?.worldItemIds || []
        );

        // Build system prompt
        const systemPrompt = buildSystemPrompt(
            selectedAction,
            contextText,
            destinationDoc,
            chapters,
            worldItems
        );

        // Prepare messages array for the AI
        const aiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content
            })),
            { role: 'user', content: userMessage }
        ];

        // Add user message and placeholder assistant
        const userMsgId = generateMsgId();
        const aiMsgId = generateMsgId();

        setMessages(prev => [
            ...prev,
            { id: userMsgId, role: 'user', content: userMessage, timestamp: Date.now() },
            { id: aiMsgId, role: 'assistant', content: '', isStreaming: true, timestamp: Date.now() },
        ]);

        setIsLoading(true);

        try {
            let fullResponse = '';

            await AIService.generateStream(aiMessages, {
                selectedAiModel: selectedModel,
                selectedApi: selectedApi,
                openRouterKey: selectedApi === 'openrouter' ? apiKey : null,
                googleApiKey: selectedApi === 'google_direct' ? apiKey : null,
                deepseekApiKey: selectedApi === 'deepseek' ? apiKey : null,
                reasoningMode: aiSettings.reasoningMode ?? false,
            }, (chunk) => {
                fullResponse += chunk;
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: fullResponse } : m
                ));
            });

            // Finalize
            const cleanedContent = extractHtmlContent(fullResponse);
            const isEchoingContext = fullResponse.trim().startsWith('===');

            if (isEchoingContext) {
                const errorMsg = '⚠️ **La IA no pudo procesar tu solicitud.** Devolvió el contexto en lugar de contenido nuevo.';
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: errorMsg, isStreaming: false } : m
                ));
            } else {
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: cleanedContent || fullResponse, isStreaming: false } : m
                ));
            }

            // Auto-show diff for create/modify actions
            const wantsToModify = /crear|modificar|escribir|añadir|agregar|insertar|editar|cambiar|reescribir|generar|nuev/i.test(userMessage);
            const shouldShowDiff = selectedAction === 'crear' ||
                                   selectedAction === 'modificar' ||
                                   (selectedAction === 'personalizado' && wantsToModify);

            if (shouldShowDiff && !isEchoingContext) {
                handleShowDiff(cleanedContent || fullResponse);
            }
        } catch (error) {
            console.error("IA Studio Error:", error);
            const isRateLimit = error.message?.includes('429') || error.message?.includes('Too Many Requests');
            const errorMsg = isRateLimit
                ? `❌ **Demasiadas solicitudes (429).** Espera unos segundos e intenta de nuevo.`
                : `❌ Error: ${error.message || 'Error al comunicarse con la IA'}`;

            setMessages(prev => prev.map(m =>
                m.id === aiMsgId ? { ...m, content: errorMsg, isStreaming: false } : m
            ));
        } finally {
            setIsLoading(false);
        }
    }, [messages, activeBook, chapters, characters, worldItems, contextSelections, destinationDoc, selectedAction, selectedApi, selectedModel, aiSettings, getApiKey, handleShowDiff]);

    // Regenerate
    const handleRegenerate = useCallback(() => {
        const lastMsg = lastUserMessageRef.current;
        if (lastMsg) {
            setDiffContent(null);
            handleSend(lastMsg);
        }
    }, [handleSend]);

    // Apply changes
    const handleApplyChanges = useCallback(() => {
        if (!diffContent) return;

        let htmlContent = diffContent.proposedContent;
        if (!htmlContent.includes('<p>') && !htmlContent.includes('<h')) {
            htmlContent = htmlContent
                .split('\n')
                .filter(line => line.trim())
                .map(line => {
                    if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
                    if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
                    return `<p>${line}</p>`;
                })
                .join('');
        }

        const dest = diffContent.destinationDoc || { mode: 'auto' };

        if (dest.mode === 'manual' && dest.docId) {
            if (dest.docType === 'chapter') {
                saveChapterContent(htmlContent);
            } else if (dest.docType === 'worldItem') {
                updateWorldItem(dest.docId, { content: htmlContent });
            }
        } else if (dest.mode === 'new') {
            const title = diffContent.destinationTitle || 'Nuevo capítulo';
            createChapter({ title, content: htmlContent });
        }

        setDiffContent(null);
    }, [diffContent, saveChapterContent, updateWorldItem, createChapter]);

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
        setMessages([]);
        setDiffContent(null);
    }, []);

    return (
        <div className="h-full flex bg-[var(--bg-app)]">
            <IAStudioChat
                messages={messages}
                onSend={handleSend}
                onShowDiff={handleShowDiff}
                isLoading={isLoading}
                selectedAction={selectedAction}
                onNewChat={handleNewChat}
                onOpenContext={() => setShowContextModal(true)}
                onExport={handleExport}
                QUICK_ACTIONS={QUICK_ACTIONS}
                selectedApi={selectedApi}
                selectedModel={selectedModel}
            />

            {/* Diff Modal */}
            {diffContent && (
                <IAStudioDiff
                    currentContent={diffContent.currentContent}
                    proposedContent={diffContent.proposedContent}
                    destinationTitle={diffContent.destinationTitle}
                    onApply={handleApplyChanges}
                    onClose={() => setDiffContent(null)}
                    onRegenerate={handleRegenerate}
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
