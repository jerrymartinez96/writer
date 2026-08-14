import React, { useState, useRef, useEffect, useCallback } from 'react';
import IAStudioMessage from './IAStudioMessage';
import { Sparkles, ChevronDown, Check, Download, X, Square, Scissors, Layers, AlertTriangle, BookOpen, Target, Loader2, Wand2, Settings, Volume2, Wrench, Search, ArrowRight, MessageSquare, UserRound, Lightbulb, FileSearch, PenLine, SlidersHorizontal } from 'lucide-react';
import Modal from '../Modal';
import ConfirmModal from '../ConfirmModal';
import { AIService } from '../../services/AIService';
import CharacterDesignerWizard from './components/CharacterDesignerWizard';
import CoWriterSettingsModal from '../coescritor/CoWriterSettingsModal';
import useCoWriter from '../coescritor/useCoWriter';

const IAStudioChat = ({
    messages,
    onSend,
    onShowDiff,
    isLoading,
    selectedAction,
    onOpenContext,
    onOpenDestination,
    onExport,
    QUICK_ACTIONS,
    selectedModel = '',
    contextSelections,
    activeBook,
    chapters,
    characters,
    worldItems,
    onModelChange,
    onCancelStream,
    onRegenerate,
    onDeleteMessage,
    activeSession = null,
    onRenameSession = null,
    onDeleteSession = null,
    // New props
    sectionMode = false,
    sectionConfig = null,
    currentSectionIndex = 1,
    accumulatedSections = [],
    destinationDoc = null,
    onResolveInconsistency = null,
    onReopenInconsistency = null,
    chatReasoningMode = false,
    onReasoningModeChange = null,
    chatReasoningEffort = 'high',
    onReasoningEffortChange = null,
    // Callbacks directos para comunicación hijo→padre
    onActionChange = null,
    onFragmentChange = null,
    onSectionModeChange = null,
}) => {
    const [inputValue, setInputValue] = useState('');
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [fragmentValue, setFragmentValue] = useState('');
    const [showSectionSetup, setShowSectionSetup] = useState(false);
    const [sectionSetupTotal, setSectionSetupTotal] = useState(3);
    const [sectionDescriptions, setSectionDescriptions] = useState(['', '', '']);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showToolsModal, setShowToolsModal] = useState(false);
    const [toolSearch, setToolSearch] = useState('');
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [editSessionName, setEditSessionName] = useState('');
    const [isCoWriterOpen, setIsCoWriterOpen] = useState(false);
    const [isCoWriterSettingsOpen, setIsCoWriterSettingsOpen] = useState(false);
    const [coWriterCommand, setCoWriterCommand] = useState(''); // último comando enviado al Coescritor (para re-narrar/mostrar)

    // --- COMANDOS MOCK DE PRUEBA ---
    const COMMANDS = [
        { id: '/detectar', label: '🔍 /detectar [acción]', description: 'Ejecutar una auditoría inteligente sobre tu obra (ej. inconsistencias)' },
        { id: '/format', label: '✨ /format [documento]', description: 'Dar formato y espaciado de lectura ultra-legible a un documento' },
        { id: '/mock patch', label: '✂️ /mock patch', description: 'Simular patch (fragmento)' },
        { id: '/mock section', label: '📄 /mock section', description: 'Simular sección de capítulo' },
        { id: '/mock scene', label: '🎬 /mock scene', description: 'Simular escena agregada' },
        { id: '/mock content', label: '✏️ /mock content', description: 'Simular contenido completo' }
    ];

    const [showCommandAutocomplete, setShowCommandAutocomplete] = useState(false);
    const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

    const getFilteredCommands = () => {
        const matchDetectCmd = /^\/detectar\s+(.*)/i.exec(inputValue);
        const matchDetectStart = /^\/detectar\s*$/i.test(inputValue);
        
        if (matchDetectCmd || matchDetectStart) {
            const filterAction = matchDetectCmd ? matchDetectCmd[1].toLowerCase() : '';
            
            const availableActions = [
                { id: 'inconsistencias', label: 'inconsistencias', description: 'Detectar contradicciones de lore, tiempo o personajes' }
            ];
            
            const filteredActions = availableActions.filter(a => a.label.toLowerCase().includes(filterAction));
            
            return filteredActions.map(a => ({
                id: `/detectar ${a.label}`,
                label: `🔍 /detectar ${a.label}`,
                description: a.description
            }));
        }
        
        const matchFormatCmd = /^\/format\s+(.*)/i.exec(inputValue);
        const matchFormatStart = /^\/format\s*$/i.test(inputValue);
        
        if (matchFormatCmd || matchFormatStart) {
            const filterDocName = matchFormatCmd ? matchFormatCmd[1].toLowerCase() : '';
            
            const docs = [
                ...(chapters || []).filter(c => !c.isVolume).map(c => ({ id: c.title, label: c.title, type: 'chapter' })),
                ...(worldItems || []).map(w => ({ id: w.title, label: w.title, type: 'world' }))
            ];
            
            const filteredDocs = docs.filter(d => d.label.toLowerCase().includes(filterDocName));
            
            return filteredDocs.map(d => ({
                id: `/format ${d.label}`,
                label: `✨ /format ${d.label}`,
                description: `Formatear: ${d.label} (${d.type === 'chapter' ? 'Capítulo' : 'Master Doc'})`
            }));
        }
        
        const matchMockCmd = /^\/mock\s+(patch|section|scene|content)\s+(.*)/i.exec(inputValue);
        const matchMockStart = /^\/mock\s+(patch|section|scene|content)\s*$/i.test(inputValue);
        
        if (matchMockCmd || matchMockStart) {
            const cmdType = matchMockCmd ? matchMockCmd[1].toLowerCase() : inputValue.trim().split(/\s+/)[1].toLowerCase();
            const filterDocName = matchMockCmd ? matchMockCmd[2].toLowerCase() : '';
            
            const docs = [
                ...(chapters || []).filter(c => !c.isVolume).map(c => ({ id: c.title, label: c.title, type: 'chapter' })),
                ...(worldItems || []).map(w => ({ id: w.title, label: w.title, type: 'world' }))
            ];
            
            const filteredDocs = docs.filter(d => d.label.toLowerCase().includes(filterDocName));
            
            return filteredDocs.map(d => ({
                id: `/mock ${cmdType} ${d.label}`,
                label: `${cmdType === 'patch' ? '✂️' : cmdType === 'section' ? '📄' : cmdType === 'scene' ? '🎬' : '✏️'} /mock ${cmdType} ${d.label}`,
                description: `Simular en: ${d.label} (${d.type === 'chapter' ? 'Capítulo' : 'Master Doc'})`
            }));
        }
        
        return COMMANDS.filter(cmd => 
            cmd.id.startsWith(inputValue.toLowerCase())
        );
    };

    const filteredCommands = getFilteredCommands();

    const isMatch = filteredCommands.length === 1 && filteredCommands[0].id === inputValue;
    const shouldShowAutocomplete = showCommandAutocomplete && filteredCommands.length > 0 && !isMatch;

    const handleInputChange = (val) => {
        setInputValue(val);
        if (val.startsWith('/')) {
            setShowCommandAutocomplete(true);
            setSelectedCommandIndex(0);
        } else {
            setShowCommandAutocomplete(false);
        }
    };

    const selectCommand = (cmdId) => {
        setInputValue(cmdId + ' ');
        setShowCommandAutocomplete(false);
        if (inputRef.current) {
            inputRef.current.focus();
        }
    };

    const cowriter = useCoWriter();

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            if (activeSession) setEditSessionName(activeSession.name || '');
        });
        return () => cancelAnimationFrame(frame);
    }, [activeSession]);
    
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const shouldAutoScrollRef = useRef(true);
    const inputRef = useRef(null);
    const fragmentRef = useRef(null);

    // Load available models for active quick switcher
    useEffect(() => {
        const fetchModels = async () => {
            const models = await AIService.getFreeModels();
            setAvailableModels(models);
        };
        fetchModels();
    }, []);

    const filteredModels = availableModels;
    const selectedModelObj = filteredModels.find(m => m.id === selectedModel);
    const selectedModelName = selectedModelObj?.name || selectedModel?.split('/').pop() || '—';

    const handleModelSelect = (modelId) => {
        if (onModelChange) {
            onModelChange(modelId);
        }
        setShowModelDropdown(false);
    };

    const selectedChapterIds = contextSelections?.chapterIds || [];
    const selectedWorldItemIds = contextSelections?.worldItemIds || [];
    const selectedCharacterIds = contextSelections?.characterIds || [];

    const currentDestLabel = () => {
        if (destinationDoc?.mode === 'auto') return 'Automático (La IA decide)';
        if (destinationDoc?.mode === 'new') return 'Crear nuevo capítulo';
        return destinationDoc?.docTitle || 'Documento específico';
    };

    const handleScroll = useCallback(() => {
        if (!chatContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
        shouldAutoScrollRef.current = isAtBottom;
    }, []);

    // Auto-scroll
    useEffect(() => {
        const isLastMsgUser = messages.length > 0 && messages[messages.length - 1].role === 'user';
        if (isLastMsgUser) {
            shouldAutoScrollRef.current = true;
        }

        if (shouldAutoScrollRef.current && messagesEndRef.current) {
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
        if (onActionChange) {
            onActionChange(actionId);
        } else {
            window.dispatchEvent(new CustomEvent('ia-studio-action', { detail: actionId }));
        }
        if (actionId !== 'escribir') {
            setShowSectionSetup(false);
        }
    };

    // Sync fragment to parent
    useEffect(() => {
        if (onFragmentChange) {
            onFragmentChange(fragmentValue);
        } else {
            window.dispatchEvent(new CustomEvent('ia-studio-fragment', { detail: fragmentValue }));
        }
    }, [fragmentValue, onFragmentChange]);

    const handleStartSectionMode = () => {
        const descriptions = Array.from({ length: sectionSetupTotal }, (_, i) => sectionDescriptions[i] || '');
        const config = { total: sectionSetupTotal, descriptions };
        if (onSectionModeChange) {
            onSectionModeChange(config);
        } else {
            window.dispatchEvent(new CustomEvent('ia-studio-section-mode', { detail: config }));
        }
        setShowSectionSetup(false);
    };

    const handleExitSectionMode = () => {
        if (onSectionModeChange) {
            onSectionModeChange(null);
        } else {
            window.dispatchEvent(new CustomEvent('ia-studio-section-mode', { detail: null }));
        }
    };

    const handleSend = async () => {
        const trimmed = inputValue.trim();
        if (!trimmed || isLoading) return;
        if (selectedAction === 'fragmento' && !fragmentValue.trim()) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '✂️ Pega el fragmento que quieres editar en el campo de arriba.', type: 'warning' }
            }));
            return;
        }
        // En modo Coescritor, el texto va a DeepSeek con narración (no al chat de IA Studio).
        if (isCoWriterOpen) {
            console.info('[IAStudio][CoWriter] Enviando instrucción:', trimmed);
            setCoWriterCommand(trimmed);
            void cowriter.executeText(trimmed).catch((error) => {
                console.error('[IAStudio][CoWriter] Error no capturado:', error);
                window.dispatchEvent(new CustomEvent('ia-toast', {
                    detail: { message: `❌ Coescritor: ${error?.message || 'error desconocido'}`, type: 'error' }
                }));
            });
            setInputValue('');
            return;
        }
        console.info('[IAStudio][Chat] Enviando instrucción:', trimmed);
        try {
            await onSend(trimmed);
        } catch (error) {
            console.error('[IAStudio][Chat] Error no capturado:', error);
            throw error;
        }
        setInputValue('');
    };

    const handleSuggestionAction = async (suggestion, action) => {
        const idea = suggestion.idea?.trim();
        if (!idea || !onSend) return;
        const prompts = {
            develop: `Desarrolla esta propuesta creativa sin modificar documentos todavía. Explica cómo podría funcionar en la historia y ofrece una versión más concreta:\n\n${idea}`,
            analyze: `Analiza las consecuencias narrativas de esta propuesta. Identifica ventajas, riesgos, continuidad afectada y documentos que habría que revisar. No modifiques documentos:\n\n${idea}`,
            prepare: `Quiero aplicar esta propuesta a la obra: ${idea}. Lee los documentos necesarios, identifica todos los capítulos o fichas afectados y prepara una vista de cambios con parches separados. No guardes nada todavía.`,
            variant: `Propón tres variantes distintas de esta idea, explicando el impacto y los riesgos de cada una. No modifiques documentos:\n\n${idea}`,
        };
        // Se fuerza el planificador automático para que el modo manual
        // "Sugerir" no bloquee una acción posterior como preparar parches.
        try {
            await onSend(prompts[action] || prompts.develop, 'chat');
        } catch (error) {
            console.error('[IAStudio][Chat] Error al procesar sugerencia:', error);
            throw error;
        }
    };

    const handleKeyDown = (e) => {
        if (shouldShowAutocomplete) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedCommandIndex(prev => (prev + 1) % filteredCommands.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedCommandIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                selectCommand(filteredCommands[selectedCommandIndex].id);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowCommandAutocomplete(false);
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const inputHeight = `${Math.min(6, Math.max(1, Math.ceil((inputValue.length || 1) / 80))) * 24}px`;
    const toolGroups = [
        { id: 'explorar', label: 'Explorar', icon: Lightbulb, ids: ['sugerir', 'chat'] },
        { id: 'crear', label: 'Crear', icon: PenLine, ids: ['escribir', 'escena', 'constructor_personaje'] },
        { id: 'revisar', label: 'Revisar', icon: FileSearch, ids: ['analizar', 'fragmento', 'formatear'] },
    ]
        .map(group => ({
            ...group,
            actions: (QUICK_ACTIONS || []).filter(action => group.ids.includes(action.id) && action.id !== 'chat')
                .filter(action => {
                    const query = toolSearch.trim().toLowerCase();
                    return !query || `${action.label} ${action.description}`.toLowerCase().includes(query);
                }),
        }))
        .filter(group => group.actions.length > 0);

    const toolIcons = {
        escribir: PenLine,
        escena: Sparkles,
        constructor_personaje: UserRound,
        fragmento: Scissors,
        analizar: FileSearch,
        sugerir: Lightbulb,
        formatear: Wand2,
    };

    const toolThemes = {
        chat: { label: 'Chat general', icon: MessageSquare, text: 'text-violet-600 dark:text-violet-400', soft: 'bg-violet-500/5', softStrong: 'bg-violet-500/10', border: 'border-violet-500/20', focus: 'focus-within:border-violet-500/50 focus-within:ring-violet-500/10', button: 'bg-violet-600 hover:bg-violet-700' },
        escribir: { label: 'Escritura', icon: PenLine, text: 'text-emerald-600 dark:text-emerald-400', soft: 'bg-emerald-500/5', softStrong: 'bg-emerald-500/10', border: 'border-emerald-500/25', focus: 'focus-within:border-emerald-500/50 focus-within:ring-emerald-500/10', button: 'bg-emerald-600 hover:bg-emerald-700' },
        escena: { label: 'Escena por escena', icon: Sparkles, text: 'text-sky-600 dark:text-sky-400', soft: 'bg-sky-500/5', softStrong: 'bg-sky-500/10', border: 'border-sky-500/25', focus: 'focus-within:border-sky-500/50 focus-within:ring-sky-500/10', button: 'bg-sky-600 hover:bg-sky-700' },
        constructor_personaje: { label: 'Creador de personajes', icon: UserRound, text: 'text-indigo-600 dark:text-indigo-400', soft: 'bg-indigo-500/5', softStrong: 'bg-indigo-500/10', border: 'border-indigo-500/25', focus: 'focus-within:border-indigo-500/50 focus-within:ring-indigo-500/10', button: 'bg-indigo-600 hover:bg-indigo-700' },
        fragmento: { label: 'Edición de fragmentos', icon: Scissors, text: 'text-amber-600 dark:text-amber-400', soft: 'bg-amber-500/5', softStrong: 'bg-amber-500/10', border: 'border-amber-500/25', focus: 'focus-within:border-amber-500/50 focus-within:ring-amber-500/10', button: 'bg-amber-600 hover:bg-amber-700' },
        analizar: { label: 'Análisis y continuidad', icon: FileSearch, text: 'text-blue-600 dark:text-blue-400', soft: 'bg-blue-500/5', softStrong: 'bg-blue-500/10', border: 'border-blue-500/25', focus: 'focus-within:border-blue-500/50 focus-within:ring-blue-500/10', button: 'bg-blue-600 hover:bg-blue-700' },
        sugerir: { label: 'Ideas y sugerencias', icon: Lightbulb, text: 'text-purple-600 dark:text-purple-400', soft: 'bg-purple-500/5', softStrong: 'bg-purple-500/10', border: 'border-purple-500/25', focus: 'focus-within:border-purple-500/50 focus-within:ring-purple-500/10', button: 'bg-purple-600 hover:bg-purple-700' },
        formatear: { label: 'Formatear documento', icon: Wand2, text: 'text-teal-600 dark:text-teal-400', soft: 'bg-teal-500/5', softStrong: 'bg-teal-500/10', border: 'border-teal-500/25', focus: 'focus-within:border-teal-500/50 focus-within:ring-teal-500/10', button: 'bg-teal-600 hover:bg-teal-700' },
    };

    const toolTheme = toolThemes[selectedAction] || toolThemes.chat;
    const ActiveToolIcon = toolTheme.icon;

    const selectTool = (actionId) => {
        handleActionChange(actionId);
        setShowToolsModal(false);
        setToolSearch('');
    };

    const configurationControls = (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 order-1 overflow-hidden sm:order-2 sm:flex-none">
            <button type="button" onClick={onOpenContext} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-2 py-1.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors sm:w-auto sm:flex-none" title="Configurar contexto de referencia">
                <BookOpen size={12} />
                <span className="truncate">Contexto</span>
                <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-bold">{selectedChapterIds.length + selectedWorldItemIds.length + selectedCharacterIds.length}</span>
            </button>
            <button type="button" onClick={onOpenDestination} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors sm:w-auto sm:flex-none" title={`Configurar destino: ${currentDestLabel()}`}>
                <Target size={12} />
                <span className="shrink-0">Destino</span>
                <span className="min-w-0 flex-1 truncate rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold">{destinationDoc?.mode === 'auto' ? 'Automático' : destinationDoc?.mode === 'new' ? 'Nuevo capítulo' : destinationDoc?.docTitle || 'Manual'}</span>
            </button>
        </div>
    );

    return (
        <div className={`flex-1 flex flex-col min-h-0 max-w-full overflow-x-hidden bg-[var(--bg-app)] border-l-2 ${toolTheme.border} transition-colors duration-300`}>
            {/* Header */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-2 sm:px-4 lg:px-6 py-2.5 sm:py-3 border-b border-[var(--border-main)] bg-[var(--bg-app)] shrink-0">
                <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex sm:order-1">
                    <div className={`w-7 h-7 rounded-xl ${toolTheme.softStrong} border ${toolTheme.border} flex items-center justify-center shadow-sm shrink-0`}>
                        <ActiveToolIcon size={14} className={toolTheme.text} />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] opacity-70">IA Studio</span>
                </div>

                {configurationControls}
                <div className="flex items-center gap-1.5 sm:gap-2 order-2 ml-auto sm:order-3">
                    {/* Secondary conversation actions */}
                    <div className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => setShowMoreMenu(prev => !prev)}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${showMoreMenu ? `${toolTheme.softStrong} ${toolTheme.text}` : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]'}`}
                            title="Configuración"
                            aria-label="Configuración"
                        >
                            <Settings size={16} />
                        </button>
                        {showMoreMenu && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
                                <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] shadow-xl z-40 p-1.5 text-left animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-200">
                                    <div className="px-2.5 py-2 border-b border-[var(--border-main)]/40 mb-1">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Conversación</p>
                                        <p className="text-[10px] text-[var(--text-main)] truncate mt-0.5">{activeSession?.name || 'Conversación'}</p>
                                    </div>
                                    <div className="px-2.5 py-2 border-b border-[var(--border-main)]/40 mb-1">
                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Configuración de IA</span>
                                            <span className="text-[8px] text-indigo-500 font-bold">Modelo</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowModelDropdown(prev => !prev)}
                                            className="w-full flex items-center justify-between gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] px-2.5 py-2 text-[10px] font-bold text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all"
                                        >
                                            <span className="truncate">{selectedModelName}</span>
                                            <ChevronDown size={11} className={`text-[var(--text-muted)] shrink-0 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                                        </button>
                                        {showModelDropdown && (
                                            <div className="mt-1.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-1">
                                                <div className="max-h-48 overflow-y-auto space-y-0.5">
                                                    {filteredModels.map(model => {
                                                        const isSelected = model.id === selectedModel;
                                                        return (
                                                            <button key={model.id} type="button" onClick={() => handleModelSelect(model.id)} className={`w-full text-left px-2 py-2 rounded-lg text-[10px] flex items-center justify-between ${isSelected ? 'bg-indigo-500/10 text-indigo-500 font-bold' : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]/40'}`}>
                                                                <span className="truncate pr-2">{model.name}</span>
                                                                {isSelected && <Check size={10} className="text-indigo-500 shrink-0" strokeWidth={3} />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setShowSettingsModal(true); setShowMoreMenu(false); }}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-colors"
                                    >
                                        <Settings size={14} className="text-[var(--text-muted)]" />
                                        Ajustes de conversación
                                    </button>
                                    {messages.length > 0 && onExport && (
                                        <button
                                            type="button"
                                            onClick={() => { onExport(); setShowMoreMenu(false); }}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-colors"
                                        >
                                            <Download size={14} className="text-[var(--text-muted)]" />
                                            Exportar conversación
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { setIsCoWriterSettingsOpen(true); setShowMoreMenu(false); }}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-colors"
                                    >
                                        <Wand2 size={14} className={isCoWriterOpen ? 'text-purple-500' : 'text-[var(--text-muted)]'} />
                                        Configurar Coescritor
                                    </button>
                                    {onReasoningModeChange && (
                                        <div className="mt-1 border-t border-[var(--border-main)]/40 px-2.5 py-2.5 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <SlidersHorizontal size={14} className={chatReasoningMode ? 'text-yellow-500' : 'text-[var(--text-muted)]'} />
                                                    <span className="text-[10px] font-semibold text-[var(--text-main)]">Razonamiento profundo</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => onReasoningModeChange(!chatReasoningMode)}
                                                    className={`rounded-full p-0.5 transition-colors flex items-center ${chatReasoningMode ? 'bg-indigo-600' : 'bg-[var(--border-main)]'}`}
                                                    style={{ width: '2rem', height: '1.125rem' }}
                                                    title="Activar razonamiento profundo"
                                                >
                                                    <div className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${chatReasoningMode ? 'translate-x-3.5' : 'translate-x-0'}`} />
                                                </button>
                                            </div>
                                            {chatReasoningMode && onReasoningEffortChange && (
                                                <div className="flex items-center justify-between bg-[var(--bg-app)] border border-[var(--border-main)]/50 rounded-lg p-1">
                                                    <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider pl-1">Esfuerzo</span>
                                                    <div className="flex gap-1">
                                                        {['high', 'max'].map(effort => (
                                                            <button key={effort} type="button" onClick={() => onReasoningEffortChange(effort)} className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${chatReasoningEffort === effort ? 'bg-indigo-500 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                                                                {effort === 'high' ? 'Alto' : 'Max'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {selectedAction !== 'chat' && (
                <div className={`flex items-center gap-2 px-3 sm:px-4 lg:px-6 py-1.5 ${toolTheme.soft} border-b ${toolTheme.border} shrink-0 animate-in fade-in slide-in-from-top-1 duration-200`}>
                    <ActiveToolIcon size={12} className={`${toolTheme.text} shrink-0`} />
                    <span className={`min-w-0 flex-1 truncate text-[9px] font-black uppercase tracking-wider ${toolTheme.text}`}>{toolTheme.label}</span>
                    <button type="button" onClick={() => handleActionChange('chat')} className={`${toolTheme.text} opacity-70 hover:opacity-100 shrink-0`} title="Volver al chat general" aria-label="Volver al chat general">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Messages */}
            <div 
                ref={chatContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 scrollbar-hide"
            >
                <div className="max-w-3xl mx-auto space-y-6">
                    {selectedAction === 'constructor_personaje' ? (
                        <CharacterDesignerWizard 
                            selectedModel={selectedModel}
                            activeBook={activeBook}
                            worldItems={worldItems}
                            characters={characters}
                            onExit={() => handleActionChange('chat')}
                        />
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col justify-center h-full min-h-[400px] text-center text-[var(--text-muted)] space-y-8 py-4">
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-600/10 flex items-center justify-center mb-4">
                                    <Sparkles size={28} className="text-indigo-500 opacity-60" />
                                </div>
                                <p className="text-base font-bold mb-1.5 text-[var(--text-main)] font-serif italic animate-pulse">
                                    ¿En qué te ayudo hoy?
                                </p>
                                <p className="text-xs font-medium opacity-50 max-w-md">
                                    Escribe lo que necesitas. La IA interpretará si quieres consultar, crear, modificar o revisar.
                                </p>
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <IAStudioMessage
                                key={msg.id || i}
                                message={msg}
                                onShowDiff={onShowDiff}
                                onRegenerate={onRegenerate}
                                onDelete={() => onDeleteMessage && onDeleteMessage(msg.id)}
                                isLast={i === messages.length - 1}
                                onResolveInconsistency={onResolveInconsistency}
                                onReopenInconsistency={onReopenInconsistency}
                                onSuggestionAction={handleSuggestionAction}
                                chapters={chapters}
                                worldItems={worldItems}
                                characters={characters}
                            />
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="px-4 lg:px-6 py-4 border-t border-[var(--border-main)] bg-[var(--bg-app)] shrink-0">
                <div className="max-w-3xl mx-auto space-y-3">
                    {/* ── Buffer vivo del Coescritor: comando + estado + detener/re-narrar ── */}
                    {(isCoWriterOpen || coWriterCommand) && (
                        <div className={`rounded-xl border px-3 py-2 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200 ${
                            cowriter.isVoiceNarrating
                                ? 'bg-emerald-500/5 border-emerald-500/25'
                                : cowriter.status === 'processing'
                                    ? 'bg-amber-500/5 border-amber-500/25'
                                    : 'bg-indigo-500/5 border-indigo-500/15'
                        }`}>
                            <div className="flex items-center gap-2">
                                {cowriter.isVoiceNarrating ? (
                                    <Volume2 size={11} className="text-emerald-500 animate-pulse shrink-0" />
                                ) : cowriter.status === 'processing' ? (
                                    <Loader2 size={11} className="animate-spin text-amber-500 shrink-0" />
                                ) : (
                                    <Wand2 size={11} className="text-indigo-500 shrink-0" />
                                )}
                                <span className="text-[8px] font-black uppercase tracking-widest ${
                                    cowriter.isVoiceNarrating ? 'text-emerald-500' :
                                    cowriter.status === 'processing' ? 'text-amber-500' : 'text-indigo-500'
                                }">
                                    {cowriter.isVoiceNarrating ? 'Narrando respuesta…' :
                                     cowriter.status === 'processing' ? 'Procesando con DeepSeek…' : 'Coescritor activo · respuesta por voz'}
                                </span>
                                <span className="ml-auto flex items-center gap-1">
                                    {coWriterCommand && cowriter.status === 'idle' && (
                                        <button
                                            onClick={() => cowriter.executeText(coWriterCommand)}
                                            className="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer"
                                            title="Volver a escuchar la respuesta"
                                        >
                                            🔊 Re-narrar
                                        </button>
                                    )}
                                    {cowriter.isVoiceNarrating && (
                                        <button
                                            onClick={() => cowriter.stopNarration()}
                                            className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer"
                                            title="Detener narración"
                                        >
                                            ⏹ Detener
                                        </button>
                                    )}
                                </span>
                            </div>
                            {coWriterCommand && (
                                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed truncate">
                                    <span className="font-bold text-[var(--text-main)]">› </span>{coWriterCommand}
                                </p>
                            )}
                            {/* ── Insignia de acción resuelta: transparencia del chat general automatizado ── */}
                            {cowriter.resolvedAction && cowriter.resolvedAction.label && cowriter.status === 'processing' && (
                                <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <Sparkles size={10} className="text-purple-500 shrink-0" />
                                    <span className="text-[9px] font-bold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-lg border border-purple-500/15 uppercase tracking-wider">
                                        {cowriter.resolvedAction.label}
                                    </span>
                                    <span className="text-[8px] text-[var(--text-muted)] opacity-60 uppercase tracking-wider">
                                        acción resuelta automáticamente
                                    </span>
                                </div>
                            )}
                            {cowriter.resultText && !cowriter.isVoiceNarrating && cowriter.status === 'idle' && !cowriter.pendingChanges && (
                                <p className="text-[10px] font-medium text-emerald-600 leading-relaxed line-clamp-2">
                                    {cowriter.resultText}
                                </p>
                            )}

                            {/* ── Fase de aprobación: cambios grandes que requieren tu visto bueno ── */}
                            {cowriter.pendingChanges && (
                                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-1.5">
                                        <AlertTriangle size={11} className="text-amber-500 shrink-0" />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-amber-500">
                                            El motor de IA generó cambios · requiere aprobación
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-[var(--text-main)] leading-relaxed">
                                        {cowriter.pendingChanges.summary}
                                    </p>
                                    {cowriter.pendingChanges.reasons?.length > 0 && (
                                        <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
                                            ⚠️ {cowriter.pendingChanges.reasons.join(' · ')}
                                        </p>
                                    )}
                                    <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                                        <button
                                            onClick={() => cowriter.openManualReview()}
                                            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--bg-editor)] border border-[var(--border-main)] text-[var(--text-main)] hover:border-indigo-500/40 hover:bg-indigo-500/5 text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer"
                                            title="Abrir el documento afectado para que revises el cambio tú mismo"
                                        >
                                            <BookOpen size={10} />
                                            Revisar manualmente
                                        </button>
                                        <button
                                            onClick={() => cowriter.declineChanges()}
                                            disabled={cowriter.isApplyingChanges}
                                            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 text-[8px] font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                                            title="Descartar los cambios propuestos sin modificar nada"
                                        >
                                            <X size={10} />
                                            Descartar
                                        </button>
                                        <button
                                            onClick={() => cowriter.approveChanges()}
                                            disabled={cowriter.isApplyingChanges}
                                            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 text-[8px] font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                                            title="Aprobar y aplicar todos los cambios propuestos"
                                        >
                                            {cowriter.isApplyingChanges
                                                ? <Loader2 size={10} className="animate-spin" />
                                                : <Check size={10} />}
                                            {cowriter.isApplyingChanges ? 'Aplicando…' : 'Aprobar y aplicar'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Modo Fragmento ── */}
                    {selectedAction === 'fragmento' && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-200 text-left">
                            <div className="flex items-center gap-2 mb-2">
                                <Scissors size={11} className="text-amber-500" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">Fragmento a editar</span>
                                {fragmentValue && (
                                    <span className="text-[8px] text-[var(--text-muted)] opacity-60 ml-auto">
                                        {fragmentValue.trim().split(/\s+/).length} palabras
                                    </span>
                                )}
                            </div>
                            <div className="relative">
                                <textarea
                                    ref={fragmentRef}
                                    value={fragmentValue}
                                    onChange={(e) => setFragmentValue(e.target.value)}
                                    placeholder="Pega aquí el fragmento exacto que quieres modificar (puede ser uno o varios párrafos)…"
                                    className="w-full bg-amber-500/5 border border-amber-500/30 rounded-xl px-4 py-3 text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-40 resize-none outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition-all scrollbar-hide leading-relaxed"
                                    rows={3}
                                    style={{ maxHeight: '120px', overflowY: 'auto' }}
                                />
                                {fragmentValue && (
                                    <button
                                        onClick={() => setFragmentValue('')}
                                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 flex items-center justify-center transition-all cursor-pointer"
                                    >
                                        <X size={9} strokeWidth={3} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Modo Sección ── */}
                    {selectedAction === 'escribir' && !sectionMode && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSectionSetup(prev => !prev)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:bg-indigo-500/20 transition-all cursor-pointer"
                            >
                                <Layers size={10} />
                                Modo Extenso (Secciones)
                            </button>
                        </div>
                    )}

                    {/* Section setup panel */}
                    {showSectionSetup && !sectionMode && (
                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 text-left">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Layers size={12} className="text-indigo-500" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Escritura por secciones</span>
                                </div>
                                <button onClick={() => setShowSectionSetup(false)} className="text-[var(--text-muted)] hover:text-red-500 transition-colors cursor-pointer">
                                    <X size={12} />
                                </button>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="text-[10px] text-[var(--text-muted)] shrink-0">Total de secciones:</label>
                                <div className="flex items-center gap-1.5">
                                    {[2, 3, 4, 5, 6].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => {
                                                setSectionSetupTotal(n);
                                                setSectionDescriptions(prev => Array.from({ length: n }, (_, i) => prev[i] || ''));
                                            }}
                                            className={`w-8 h-8 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                                sectionSetupTotal === n
                                                    ? 'bg-indigo-500 text-white shadow-md'
                                                    : 'bg-[var(--bg-editor)] border border-[var(--border-main)] text-[var(--text-muted)] hover:border-indigo-500/40'
                                            }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                {Array.from({ length: sectionSetupTotal }, (_, i) => (
                                    <input
                                        key={i}
                                        type="text"
                                        value={sectionDescriptions[i] || ''}
                                        onChange={(e) => setSectionDescriptions(prev => prev.map((d, idx) => idx === i ? e.target.value : d))}
                                        placeholder={`Sección ${i + 1}: descripción opcional (ej: "Apertura — introducir al protagonista")`}
                                        className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-lg px-3 py-2 text-[10px] text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-40 outline-none focus:border-indigo-500/50 transition-all"
                                    />
                                ))}
                            </div>
                            <button
                                onClick={handleStartSectionMode}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-widest transition-all shadow-md shadow-indigo-600/20 active:scale-[0.99] cursor-pointer"
                            >
                                <Layers size={11} />
                                Iniciar escritura en {sectionSetupTotal} secciones
                            </button>
                        </div>
                    )}

                    {/* Section mode progress banner */}
                    {sectionMode && sectionConfig && (
                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl px-4 py-3 flex items-center gap-3 animate-in fade-in duration-200">
                            <Layers size={14} className="text-indigo-500 shrink-0" />
                            <div className="flex-1 min-w-0 text-left">
                                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Modo Extenso Activo</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="flex gap-1">
                                        {Array.from({ length: sectionConfig.total }, (_, i) => (
                                            <div
                                                key={i}
                                                className={`h-1 w-6 rounded-full transition-all ${
                                                    i < accumulatedSections.length
                                                        ? 'bg-emerald-500'
                                                        : i === accumulatedSections.length
                                                        ? 'bg-indigo-500 animate-pulse'
                                                        : 'bg-[var(--border-main)]/40'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    <span className="text-[9px] text-[var(--text-muted)]">
                                        Sección {Math.min(currentSectionIndex, sectionConfig.total)} de {sectionConfig.total}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={handleExitSectionMode}
                                className="text-[var(--text-muted)] hover:text-red-500 transition-colors shrink-0 cursor-pointer"
                                title="Salir del modo extenso"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Input + Send */}
                    <div className={`flex items-center gap-2 sm:gap-2.5 bg-[var(--bg-editor)] rounded-2xl pl-2 sm:pl-3 pr-2.5 sm:pr-4 py-2.5 sm:py-3 transition-all duration-300 shadow-sm relative ${
                        isCoWriterOpen
                            ? 'border-2 border-purple-500/50 bg-gradient-to-r from-indigo-500/10 to-purple-600/10 ring-2 ring-purple-500/30 shadow-[0_0_24px_rgba(139,92,246,0.25)]'
                            : `border ${toolTheme.border} ${toolTheme.focus} focus-within:ring-4 focus-within:shadow-[0_0_20px_rgba(99,102,241,0.15)]`
                    }`}>
                        {/* Autocomplete Dropdown */}
                        {shouldShowAutocomplete && (
                            <div className="absolute bottom-full left-0 mb-3 w-64 bg-[var(--bg-editor)]/95 backdrop-blur-2xl border border-[var(--border-main)] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 overflow-hidden p-1.5 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-200 text-left">
                                <div className="px-2.5 py-1 text-[8px] font-black text-[var(--text-muted)] uppercase tracking-wider">Comandos de Pruebas</div>
                                {filteredCommands.map((cmd, idx) => {
                                    const isSelected = idx === selectedCommandIndex;
                                    return (
                                        <button
                                            key={cmd.id}
                                            onClick={() => selectCommand(cmd.id)}
                                            onMouseEnter={() => setSelectedCommandIndex(idx)}
                                            className={`w-full text-left px-3 py-2 text-xs transition-all flex items-center justify-between rounded-xl border border-transparent cursor-pointer ${
                                                isSelected
                                                    ? 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 font-bold border-indigo-500/20'
                                                    : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]/50'
                                            }`}
                                        >
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-semibold truncate">{cmd.label}</span>
                                                <span className="text-[9px] text-[var(--text-muted)] opacity-60 truncate">{cmd.description}</span>
                                            </div>
                                            {isSelected && (
                                                <span className="text-[8px] opacity-40 px-1 bg-indigo-500/20 text-indigo-600 rounded">Tab</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {/* Specialized tools shortcut: icon-only to keep the composer calm. */}
                        <button
                            type="button"
                            onClick={() => setShowToolsModal(true)}
                            className={`shrink-0 w-9 h-9 rounded-xl border ${toolTheme.border} ${toolTheme.soft} ${toolTheme.text} flex items-center justify-center hover:brightness-95 transition-all active:scale-95`}
                            title="Explorar herramientas especializadas"
                            aria-label="Explorar herramientas especializadas"
                        >
                            <Wrench size={15} />
                        </button>

                        {/* Textarea */}
                        {selectedAction === 'constructor_personaje' ? (
                            <div className="flex-1 text-center py-2.5 text-xs text-[var(--text-muted)] font-medium italic select-none">
                                Esta acción se ejecuta interactivamente mediante el <span className="text-indigo-400 font-bold">Diseñador Conversacional</span>.
                            </div>
                        ) : (
                            <textarea
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={isCoWriterOpen
                                    ? "Escribe un comando para el Coescritor… ej. 'Corrige la edad de Nora de 19 a 18'"
                                    : "Escribe tu mensaje... (Enter para enviar o '/' para comandos)"}
                                className="flex-1 min-w-0 self-center bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-40 focus:outline-none resize-none py-0 pl-2 max-h-32 scrollbar-hide leading-6"
                                rows={1}
                                style={{ height: inputHeight }}
                                disabled={isLoading}
                            />
                        )}

                        {/* Redactar Escena shortcut */}
                        {selectedAction === 'escena' && (
                            <button
                                onClick={() => {
                                    const prompt = "Escribe la escena ahora de acuerdo a lo planificado.";
                                    onSend(prompt);
                                }}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-[9px] font-black uppercase tracking-widest text-sky-500 hover:bg-sky-500/20 transition-all shrink-0 hover:scale-[1.03] active:scale-95 disabled:opacity-40 cursor-pointer"
                                title="Generar la prosa de la escena planificada"
                            >
                                <Sparkles size={11} className="text-sky-500" />
                                <span className="hidden xs:inline">Redactar Escena</span>
                            </button>
                        )}

                        {/* Coescritor: botón varita que se transforma según el estado (procesando → gira, narrando → ondas y para) */}
                        <button
                            onClick={() => {
                                if (cowriter.isVoiceNarrating) {
                                    cowriter.stopNarration();
                                } else if (cowriter.status === 'processing') {
                                    cowriter.stopAll && cowriter.stopAll();
                                } else {
                                    setIsCoWriterOpen(prev => !prev);
                                }
                            }}
                            disabled={isLoading}
                            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer relative overflow-hidden ${
                                cowriter.isVoiceNarrating
                                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md ring-2 ring-emerald-400/50'
                                    : cowriter.status === 'processing'
                                        ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md ring-2 ring-amber-400/50'
                                        : isCoWriterOpen
                                            ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-md ring-2 ring-purple-500/40'
                                            : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 hover:bg-indigo-500/20'
                            }`}
                            title={
                                cowriter.isVoiceNarrating ? "Detener narración" :
                                cowriter.status === 'processing' ? "Procesando con DeepSeek..." :
                                (isCoWriterOpen ? "Desactivar Coescritor" : "Activar Coescritor")
                            }
                        >
                            {cowriter.isVoiceNarrating ? (
                                <Volume2 size={16} className="animate-pulse" />
                            ) : cowriter.status === 'processing' ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Volume2 size={16} />
                            )}
                        </button>

                        {/* Enter sends messages; only expose a stop control while a response is streaming. */}
                        {isLoading && (
                            <button
                                type="button"
                                onClick={onCancelStream}
                                className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500 text-white hover:bg-rose-600 transition-all active:scale-95 shadow-md cursor-pointer"
                                title="Detener generación"
                            >
                                <Square size={15} fill="currentColor" className="animate-pulse" />
                            </button>
                        )}
                    </div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-30 mt-2 text-center animate-pulse">
                        Enter para enviar · Shift+Enter para nueva línea · Sesiones guardadas automáticamente en local
                    </p>
                </div>
            </div>

            {/* Conversation Settings Modal */}
            <Modal
                isOpen={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
                title="Ajustes de Conversación"
                size="md"
            >
                <div className="p-6 space-y-6 font-sans text-left">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
                            Nombre del Chat
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editSessionName}
                                onChange={(e) => setEditSessionName(e.target.value)}
                                className="flex-1 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all leading-relaxed"
                                placeholder="Ej. Lluvia de ideas..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && editSessionName.trim()) {
                                        onRenameSession(activeSession.id, editSessionName.trim());
                                        window.dispatchEvent(new CustomEvent('ia-toast', {
                                            detail: { message: '✏️ Conversación renombrada.', type: 'success' }
                                        }));
                                    }
                                }}
                            />
                            <button
                                onClick={() => {
                                    if (editSessionName.trim()) {
                                        onRenameSession(activeSession.id, editSessionName.trim());
                                        window.dispatchEvent(new CustomEvent('ia-toast', {
                                            detail: { message: '✏️ Conversación renombrada.', type: 'success' }
                                        }));
                                    }
                                }}
                                disabled={!editSessionName.trim() || editSessionName.trim() === activeSession?.name}
                                className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-[0.97] shadow-lg shadow-indigo-600/10 shrink-0 cursor-pointer"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>

                    <div className="bg-[var(--bg-editor)]/30 border border-[var(--border-main)]/50 rounded-2xl p-4 space-y-2.5 shadow-sm text-xs">
                        <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-60 mb-1 border-b border-[var(--border-main)]/30 pb-1.5">
                            Estadísticas del Chat
                        </div>
                        <div className="flex justify-between items-center text-[11px] text-[var(--text-main)]">
                            <span className="text-[var(--text-muted)]">Fecha de creación:</span>
                            <span className="font-semibold">
                                {activeSession ? new Date(activeSession.createdAt).toLocaleString() : '—'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] text-[var(--text-main)]">
                            <span className="text-[var(--text-muted)]">Mensajes en este chat:</span>
                            <span className="font-bold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/10">
                                {activeSession?.messages?.length || 0}
                            </span>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-[var(--border-main)]/40 space-y-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1.5">
                            <AlertTriangle size={12} /> Zona de Peligro
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-rose-500/[0.02] border border-rose-500/15 rounded-2xl">
                            <div className="space-y-0.5">
                                <h4 className="text-xs font-bold text-[var(--text-main)]">Eliminar conversación</h4>
                                <p className="text-[10px] text-[var(--text-muted)] opacity-70">
                                    Esta acción eliminará de forma irreversible todo el historial de este chat.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="w-full sm:w-auto px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.97] shadow-lg shadow-rose-600/15 text-center cursor-pointer shrink-0"
                            >
                                Eliminar Chat
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Specialized tools library */}
            <Modal
                isOpen={showToolsModal}
                onClose={() => {
                    setShowToolsModal(false);
                    setToolSearch('');
                }}
                title="Herramientas de IA Studio"
                size="lg"
            >
                <div className="p-5 sm:p-6 space-y-5 text-left">
                    <div className="flex items-start gap-3 rounded-2xl border border-indigo-500/15 bg-indigo-500/5 p-4">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                            <Sparkles size={17} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[var(--text-main)]">El chat general sigue siendo el punto de partida</p>
                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-1">
                                Escribe lo que necesitas y la IA interpretará si conviene consultar, crear, modificar o revisar. Usa una herramienta cuando quieras entrar directamente a un flujo especializado.
                            </p>
                        </div>
                    </div>

                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                            value={toolSearch}
                            onChange={(e) => setToolSearch(e.target.value)}
                            placeholder="Buscar una herramienta…"
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl pl-9 pr-3 py-2.5 text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-60 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10"
                        />
                    </div>

                    <div className="space-y-5">
                        {toolGroups.map(group => {
                            const GroupIcon = group.icon;
                            return (
                                <section key={group.id}>
                                    <div className="flex items-center gap-2 mb-2.5">
                                        <GroupIcon size={13} className="text-indigo-500" />
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{group.label}</h4>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {group.actions.map(action => {
                                            const ToolIcon = toolIcons[action.id] || Wrench;
                                            const isActive = selectedAction === action.id;
                                            return (
                                                <button
                                                    key={action.id}
                                                    type="button"
                                                    onClick={() => selectTool(action.id)}
                                                    className={`group flex items-start gap-3 text-left p-3 rounded-2xl border transition-all active:scale-[0.99] ${
                                                        isActive
                                                            ? 'border-indigo-500/40 bg-indigo-500/10'
                                                            : 'border-[var(--border-main)] bg-[var(--bg-editor)] hover:border-indigo-500/30 hover:bg-indigo-500/[0.04]'
                                                    }`}
                                                >
                                                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isActive ? 'bg-indigo-500 text-white' : 'bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white'}`}>
                                                        <ToolIcon size={15} />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-main)]">
                                                            {action.label?.replace(/^\S+\s/u, '').trim()}
                                                            {isActive && <Check size={12} className="text-indigo-500" strokeWidth={3} />}
                                                        </span>
                                                        <span className="block text-[10px] text-[var(--text-muted)] leading-relaxed mt-0.5">{action.description}</span>
                                                    </span>
                                                    <ArrowRight size={13} className="mt-1 text-[var(--text-muted)] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                        {toolGroups.length === 0 && (
                            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                                No encontramos una herramienta con ese nombre.
                            </div>
                        )}
                    </div>

                    <div className="border-t border-[var(--border-main)]/60 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                            ¿No sabes cuál elegir? Regresa al chat y deja que la IA lo determine.
                        </p>
                        <button
                            type="button"
                            onClick={() => selectTool('chat')}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-violet-500/20 bg-violet-500/5 text-violet-600 dark:text-violet-400 text-[10px] font-bold hover:bg-violet-500/10 transition-colors shrink-0"
                        >
                            <MessageSquare size={12} />
                            Seguir en el chat
                        </button>
                    </div>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => {
                    onDeleteSession?.(activeSession.id);
                    setShowSettingsModal(false);
                    window.dispatchEvent(new CustomEvent('ia-toast', {
                        detail: { message: '🗑️ Conversación eliminada.', type: 'success' }
                    }));
                }}
                title="¿Eliminar conversación?"
                message={`Esta acción eliminará de forma irreversible el historial de «${activeSession?.name || 'esta conversación'}».`}
                confirmText="Sí, eliminar"
                type="danger"
            />

            {/* Coescritor Settings Modal */}
            <CoWriterSettingsModal
                isOpen={isCoWriterSettingsOpen}
                onClose={() => setIsCoWriterSettingsOpen(false)}
                thresholdWords={cowriter.thresholdWords}
                setThresholdWords={cowriter.setThresholdWords}
            />
        </div>
    );
};

export default IAStudioChat;
