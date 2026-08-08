import React, { useState, useRef, useEffect, useCallback } from 'react';
import IAStudioMessage from './IAStudioMessage';
import { Send, Sparkles, ChevronDown, Check, Download, X, Square, Scissors, Layers, Zap, AlertTriangle, BookOpen, Target, Loader2, Wand2, Settings, Volume2 } from 'lucide-react';
import Modal from '../Modal';
import { buildContextFromSelections, estimateContextWeight } from './IAStudioUtils';
import { AIService } from '../../services/AIService';
import { useData } from '../../context/DataContext';
import CharacterDesignerWizard from './components/CharacterDesignerWizard';
import CoWriterSettingsModal from '../coescritor/CoWriterSettingsModal';
import useCoWriter from '../coescritor/useCoWriter';

const API_LABELS = {
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
    onOpenDestination,
    onOpenSessions,
    onExport,
    QUICK_ACTIONS,
    selectedModel = '',
    contextSelections,
    activeBook,
    chapters,
    characters,
    worldItems,
    onModelChange,
    onRemoveContextItem,
    onCancelStream,
    onRegenerate,
    onDeleteMessage,
    activeSession = null,
    onRenameSession = null,
    onDeleteSession = null,
    // New props
    compressContext = false,
    onToggleCompress = null,
    activeFragment = '',
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
    const [showActionDropdown, setShowActionDropdown] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [fragmentValue, setFragmentValue] = useState('');
    const [showSectionSetup, setShowSectionSetup] = useState(false);
    const [sectionSetupTotal, setSectionSetupTotal] = useState(3);
    const [sectionDescriptions, setSectionDescriptions] = useState(['', '', '']);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
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
        const trimmedVal = inputValue.toLowerCase().trim();
        
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

    const { profile } = useData();
    const cowriter = useCoWriter();

    useEffect(() => {
        if (activeSession) {
            setEditSessionName(activeSession.name || '');
        }
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

    // Contextual Prompts Generator
    const getContextualPrompts = () => {
        if (selectedAction === 'escena') {
            return [
                {
                    icon: '🎬',
                    text: 'Planificar siguiente escena',
                    prompt: 'Ayúdame a planificar la siguiente escena de este capítulo. Proponme ideas para el conflicto principal y el gancho final.'
                },
                {
                    icon: '💬',
                    text: 'Definir diálogos de la escena',
                    prompt: '¿Qué interacciones y diálogos crees que deberían ocurrir en esta escena basándote en las fichas de los personajes seleccionados?'
                },
                {
                    icon: '🔍',
                    text: 'Proponer ideas de ambientación',
                    prompt: 'Dame ideas sensoriales y de ambientación para situar la escena que estamos planificando.'
                },
                {
                    icon: '💡',
                    text: 'Preguntas guía para enfocar',
                    prompt: 'Hazme preguntas estratégicas sobre la escena actual para ayudarme a enfocar los objetivos del capítulo.'
                }
            ];
        }

        const selectedChaptersCount = selectedChapterIds.length;
        const selectedWorldItemsCount = selectedWorldItemIds.length;

        const prompts = [];

        if (selectedChaptersCount > 0 && selectedWorldItemsCount > 0) {
            prompts.push({
                icon: '🔍',
                text: 'Revisar inconsistencias',
                prompt: 'Analiza los capítulos y elementos del Master Doc seleccionados en el contexto para identificar cualquier inconsistencia o contradicción narrativa.'
            });
            prompts.push({
                icon: '✍️',
                text: 'Enriquecer con Master Doc',
                prompt: 'Utilizando los detalles de los personajes y elementos del Master Doc seleccionados, enriquece las escenas de los capítulos actuales aportando profundidad.'
            });
            prompts.push({
                icon: '💡',
                text: 'Sugerir tramas secundarias',
                prompt: 'Sugiere ideas para entrelazar las fichas de los personajes seleccionados con los sucesos de los capítulos actuales.'
            });
            prompts.push({
                icon: '🎭',
                text: 'Analizar subtextos',
                prompt: 'Revisa el subtexto y las motivaciones de los personajes seleccionados en el transcurso de los capítulos de contexto.'
            });
        } else if (selectedChaptersCount > 0) {
            prompts.push({
                icon: '📝',
                text: 'Aumentar tensión dramática',
                prompt: 'Reescribe la escena clave de los capítulos seleccionados para aumentar la tensión emocional y el ritmo narrativo.'
            });
            prompts.push({
                icon: '💡',
                text: 'Analizar ritmo y estructura',
                prompt: 'Evalúa el ritmo (pacing) y la estructura narrativa de los capítulos seleccionados, proponiendo mejoras específicas.'
            });
            prompts.push({
                icon: '🔍',
                text: 'Identificar palabras repetitivas',
                prompt: 'Busca clichés, explicaciones excesivas (telling) y palabras repetitivas en los capítulos seleccionados.'
            });
            prompts.push({
                icon: '✨',
                text: 'Generar gancho inicial',
                prompt: 'Reescribe los párrafos iniciales de los capítulos seleccionados para crear un gancho de lectura irresistible.'
            });
        } else if (selectedWorldItemsCount > 0) {
            const selectedNames = [];
            selectedWorldItemIds.forEach(id => {
                const item = worldItems?.find(w => w.id === id) || characters?.find(c => c.id === id);
                if (item) selectedNames.push(item.name || item.title);
            });
            const nameList = selectedNames.length > 0 ? selectedNames.slice(0, 2).join(' e ') : 'los personajes';

            prompts.push({
                icon: '💬',
                text: `Escribir diálogo: ${nameList.substring(0, 15)}`,
                prompt: `Escribe una escena de diálogo revelador y tenso entre ${nameList}, basándote en sus perfiles del Master Doc.`
            });
            prompts.push({
                icon: '✍️',
                text: 'Crear escena del pasado',
                prompt: `Crea un breve flashback o escena del pasado que explore la relación o el trasfondo de ${nameList}.`
            });
            prompts.push({
                icon: '💡',
                text: 'Desafíos y conflictos',
                prompt: `Analiza los perfiles de ${nameList} y describe tres posibles conflictos dramáticos que puedan surgir entre ellos.`
            });
            prompts.push({
                icon: '🚀',
                text: 'Proyectar arco de evolución',
                prompt: `Diseña un arco evolutivo interesante para ${nameList} partiendo de sus rasgos actuales en el Master Doc.`
            });
        } else {
            prompts.push({
                icon: '🧠',
                text: 'Planificar estructura del libro',
                prompt: 'Ayúdame a esbozar la estructura de mi próxima novela usando el viaje del héroe. Hazme preguntas guía.'
            });
            prompts.push({
                icon: '✨',
                text: 'Brainstorming de ideas de trama',
                prompt: 'Dame 5 conceptos únicos e intrigantes para una novela, con sus respectivos giros dramáticos al final.'
            });
            prompts.push({
                icon: '👑',
                text: 'Crear plantilla de personaje',
                prompt: 'Crea una ficha completa para el diseño de un personaje tridimensional, detallando su herida, deseo y necesidad.'
            });
            prompts.push({
                icon: '🌎',
                text: 'Construcción de mundo (Worldbuilding)',
                prompt: 'Diseña un sistema de magia, una cultura o una facción política interesante para una historia de fantasía o ciencia ficción.'
            });
        }
        return prompts;
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

    // Elastic textarea height adjustment
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [inputValue]);

    const handleActionChange = (actionId) => {
        if (onActionChange) {
            onActionChange(actionId);
        } else {
            window.dispatchEvent(new CustomEvent('ia-studio-action', { detail: actionId }));
        }
        setShowActionDropdown(false);
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

    const handleSend = () => {
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
        void Promise.resolve(onSend(trimmed)).catch((error) => {
            console.error('[IAStudio][Chat] Error no capturado:', error);
        });
        setInputValue('');
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

    const currentAction = QUICK_ACTIONS?.find(a => a.id === selectedAction);

    return (
        <div className="flex-1 flex flex-col min-h-0 max-w-full overflow-x-hidden bg-[var(--bg-app)]">
            {/* Header */}
            <div className="flex items-center justify-between px-3 sm:px-4 lg:px-6 py-3 border-b border-[var(--border-main)] bg-[var(--bg-app)] shrink-0">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button
                        onClick={() => setShowSettingsModal(true)}
                        className="group flex items-center gap-1.5 sm:gap-2.5 px-2.5 sm:px-3 py-1.5 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)]/75 hover:bg-[var(--accent-soft)] hover:border-indigo-500/30 transition-all shadow-sm active:scale-[0.98] text-left min-w-0"
                        title="Ajustes de la conversación"
                    >
                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-600/10 border border-indigo-500/20 group-hover:from-indigo-500 group-hover:to-purple-600 flex items-center justify-center shadow-sm shrink-0 transition-all duration-300">
                            <Sparkles size={14} className="text-indigo-500 group-hover:text-white transition-colors duration-300" />
                        </div>
                        <div className="min-w-0">
                            <span className="block text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)] opacity-60 leading-none">IA Studio</span>
                            <span className="block text-xs font-black text-[var(--text-main)] truncate max-w-[80px] sm:max-w-[200px] mt-0.5 group-hover:text-indigo-500 transition-colors leading-tight">
                                {activeSession?.name || 'Conversación'}
                            </span>
                        </div>
                        <ChevronDown size={12} className="text-[var(--text-muted)] opacity-70 shrink-0 group-hover:text-indigo-500 transition-colors" />
                    </button>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                    {/* Model Quick Switcher Dropdown */}
                    <div className="relative shrink-0">
                        <button
                            onClick={() => setShowModelDropdown(!showModelDropdown)}
                            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] text-[11px] font-bold text-[var(--text-main)] hover:bg-[var(--accent-soft)] hover:border-[var(--border-main)]/80 transition-all shadow-sm"
                            title="Cambiar modelo activo"
                        >
                            <span className="px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-500 text-[8px] font-black uppercase tracking-wider leading-none shrink-0 hidden xs:inline">
                                DeepSeek
                            </span>
                            <span className="truncate max-w-[65px] sm:max-w-[140px] font-medium text-[var(--text-main)]">
                                {selectedModelName}
                            </span>
                            <ChevronDown size={12} className="opacity-70 text-[var(--text-muted)] shrink-0" />
                        </button>
                        
                        {showModelDropdown && (
                            <>
                                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 sm:hidden animate-in fade-in duration-300" onClick={() => setShowModelDropdown(false)} />
                                <div className="hidden sm:block fixed inset-0 z-30" onClick={() => setShowModelDropdown(false)} />
                                <div className="fixed bottom-0 left-0 right-0 top-auto w-full rounded-t-3xl border-t border-[var(--border-main)] bg-[var(--bg-editor)] shadow-[0_-10px_40px_rgba(0,0,0,0.35)] z-[100] animate-in slide-in-from-bottom duration-300 p-4 space-y-3 sm:absolute sm:bottom-auto sm:left-auto sm:top-full sm:right-0 sm:mt-1.5 sm:w-64 sm:rounded-2xl sm:border sm:shadow-xl sm:z-45 sm:animate-in sm:fade-in sm:slide-in-from-top-1 sm:zoom-in-95 sm:duration-200 sm:p-1.5 sm:space-y-0.5">
                                    <div className="flex justify-center sm:hidden mb-1">
                                        <div className="w-12 h-1 bg-[var(--border-main)] rounded-full opacity-60" />
                                    </div>
                                    
                                    {onReasoningModeChange && (
                                        <div className="px-2.5 py-2 border-b border-[var(--border-main)]/30 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Zap size={13} className={chatReasoningMode ? 'text-yellow-500 animate-pulse' : 'text-[var(--text-muted)]'} />
                                                    <span className="text-[10px] font-bold text-[var(--text-main)]">Razonamiento Profundo</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => onReasoningModeChange(!chatReasoningMode)}
                                                    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors focus:outline-none flex items-center relative ${
                                                        chatReasoningMode ? 'bg-indigo-600' : 'bg-[var(--border-main)]'
                                                    }`}
                                                    style={{ width: '2rem', height: '1.125rem' }}
                                                    title="Modo Razonamiento"
                                                >
                                                    <div
                                                        className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform transform ${
                                                            chatReasoningMode ? 'translate-x-3.5' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </button>
                                            </div>

                                            {chatReasoningMode && onReasoningEffortChange && (
                                                <div className="flex items-center justify-between bg-[var(--bg-app)] border border-[var(--border-main)]/50 rounded-lg p-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                                    <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider pl-1">Esfuerzo:</span>
                                                    <div className="flex gap-1 shrink-0">
                                                        {['high', 'max'].map(effort => {
                                                            const isSelected = chatReasoningEffort === effort;
                                                            return (
                                                                <button
                                                                    key={effort}
                                                                    type="button"
                                                                    onClick={() => onReasoningEffortChange(effort)}
                                                                    className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all ${
                                                                        isSelected
                                                                            ? 'bg-indigo-500 text-white shadow-sm font-black'
                                                                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                                                                    }`}
                                                                >
                                                                    {effort === 'high' ? 'Alto' : 'Max'}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    
                                    <div className="px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-60 border-b border-[var(--border-main)]/30 mb-1">
                                        Modelos de DeepSeek
                                    </div>
                                    <div className="max-h-60 overflow-y-auto space-y-0.5">
                                        {filteredModels.map(model => {
                                            const isSelected = model.id === selectedModel;
                                            return (
                                                <button
                                                    key={model.id}
                                                    onClick={() => handleModelSelect(model.id)}
                                                    className={`w-full text-left px-2.5 py-2.5 sm:py-2 text-[10px] transition-all flex items-center justify-between rounded-xl ${
                                                        isSelected
                                                            ? 'bg-indigo-500/10 text-indigo-500 font-bold'
                                                            : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]/40'
                                                    }`}
                                                >
                                                    <div className="min-w-0 pr-2">
                                                        <span className="block truncate font-semibold">{model.name}</span>
                                                        {model.context_length && (
                                                            <span className="block text-[7px] text-[var(--text-muted)] opacity-60 mt-0.5">
                                                                Contexto: {(model.context_length / 1000).toFixed(0)}k tokens
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isSelected && (
                                                        <Check size={10} className="text-indigo-500 shrink-0" strokeWidth={3} />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Configuración del Coescritor (cabecera, Idea 3) */}
                    <button
                        onClick={() => setIsCoWriterSettingsOpen(true)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                            isCoWriterOpen
                                ? 'text-purple-500 bg-purple-500/10 hover:bg-purple-500/20'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]'
                        }`}
                        title="Configuración del Coescritor"
                    >
                        <Settings size={16} />
                    </button>

                    {/* Export button */}
                    {messages.length > 0 && onExport && (
                        <button
                            onClick={onExport}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all shrink-0 cursor-pointer"
                            title="Exportar conversación"
                        >
                            <Download size={16} />
                        </button>
                    )}
                </div>
            </div>

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
                                    Configura tus referencias a la izquierda o selecciona una sugerencia contextual para guiar tu proceso creativo.
                                </p>
                            </div>

                            {/* Contextual Quick Prompts */}
                            <div className="w-full max-w-xl mx-auto px-1">
                                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-60 mb-3 text-left pl-1 flex items-center gap-1.5">
                                    <Sparkles size={10} className="text-indigo-500" /> sugerencias contextuales
                                </p>
                                <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 gap-2 text-left scrollbar-hide snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0">
                                    {getContextualPrompts().map((item, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => {
                                                setInputValue(item.prompt);
                                                if (inputRef.current) inputRef.current.focus();
                                            }}
                                            className="group flex gap-3 p-3 bg-[var(--bg-editor)] border border-[var(--border-main)]/60 hover:border-indigo-500/40 hover:bg-indigo-500/[0.02] rounded-xl transition-all text-xs text-[var(--text-main)] active:scale-[0.99] shadow-sm hover:shadow shrink-0 w-[240px] sm:w-auto snap-center cursor-pointer"
                                        >
                                            <span className="text-base shrink-0 group-hover:scale-110 transition-transform">{item.icon}</span>
                                            <div className="flex-1 min-w-0 text-left">
                                                <p className="font-semibold truncate text-[11px] group-hover:text-indigo-500 transition-colors">{item.text}</p>
                                                <p className="text-[9px] text-[var(--text-muted)] opacity-60 truncate mt-0.5">{item.prompt}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
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

                    {/* Summary Bar */}
                    <div className="text-[10px] text-[var(--text-muted)] font-medium flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-1">
                        <button
                            type="button"
                            onClick={onOpenContext}
                            className="flex items-center gap-1 hover:opacity-80 active:scale-[0.98] transition-all cursor-pointer"
                            title="Configurar Contexto de Referencia"
                        >
                            <BookOpen size={11} className="text-indigo-500" /> 
                            Contexto: 
                            <strong className="text-indigo-600 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/15">
                                {selectedChapterIds.length + selectedWorldItemIds.length + selectedCharacterIds.length} elem
                            </strong>
                        </button>
                        <span className="opacity-30 hidden sm:inline">·</span>
                        <button
                            type="button"
                            onClick={onOpenDestination}
                            className="flex items-center gap-1 hover:opacity-80 active:scale-[0.98] transition-all cursor-pointer"
                            title="Configurar Destino de Escritura"
                        >
                            <Target size={11} className="text-emerald-500" /> 
                            Destino: 
                            <strong className="text-emerald-600 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/15 truncate max-w-[150px]" title={currentDestLabel()}>
                                {destinationDoc?.mode === 'auto' ? 'Automático' : destinationDoc?.mode === 'new' ? 'Crear Nuevo' : destinationDoc?.docTitle || 'Manual'}
                            </strong>
                        </button>
                    </div>

                    {/* Input + Send */}
                    <div className={`flex items-center gap-2 sm:gap-2.5 bg-[var(--bg-editor)] rounded-2xl pl-2 sm:pl-3 pr-2.5 sm:pr-4 py-2.5 sm:py-3 transition-all duration-300 shadow-sm relative ${
                        isCoWriterOpen
                            ? 'border-2 border-purple-500/50 bg-gradient-to-r from-indigo-500/10 to-purple-600/10 ring-2 ring-purple-500/30 shadow-[0_0_24px_rgba(139,92,246,0.25)]'
                            : 'border border-[var(--border-main)] focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:shadow-[0_0_20px_rgba(99,102,241,0.15)]'
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
                        {/* Action Selector */}
                        <div className="relative shrink-0 select-none">
                            {(() => {
                                const actionColors = {
                                    chat: 'bg-violet-500/10 text-violet-600 border-violet-500/20 hover:bg-violet-500/20 dark:text-violet-400 dark:border-violet-500/30',
                                    escribir: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30',
                                    fragmento: 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30',
                                    escena: 'bg-sky-500/10 text-sky-600 border-sky-500/20 hover:bg-sky-500/20 dark:text-sky-400 dark:border-sky-500/30',
                                    constructor_personaje: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 hover:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30',
                                    analizar: 'bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30',
                                    sugerir: 'bg-purple-500/10 text-purple-600 border-purple-500/20 hover:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30',
                                };
                                const activeColorClass = actionColors[selectedAction] || 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-main)] hover:bg-[var(--accent-soft)]';

                                return (
                                    <>
                                        <button
                                            onClick={() => setShowActionDropdown(!showActionDropdown)}
                                            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all duration-300 shadow-sm hover:scale-[1.02] active:scale-95 cursor-pointer ${activeColorClass}`}
                                        >
                                            <span className="text-xs transition-transform duration-300">{currentAction?.label?.match(/^.{1,2}/)?.[0] || '💬'}</span>
                                            <span className="hidden xs:inline">{currentAction?.label?.replace(/[💬✏️📝🎬👥✂️🔍💡]/g, '').trim() || 'Chat'}</span>
                                            <ChevronDown size={11} className={`text-current opacity-80 transition-transform duration-300 shrink-0 ${showActionDropdown ? 'rotate-180' : ''}`} />
                                        </button>

                                        {showActionDropdown && (
                                            <>
                                                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 sm:hidden animate-in fade-in duration-300" onClick={() => setShowActionDropdown(false)} />
                                                <div className="hidden sm:block fixed inset-0 z-30" onClick={() => setShowActionDropdown(false)} />
                                                <div className="fixed bottom-0 left-0 right-0 top-auto w-full rounded-t-3xl border-t border-[var(--border-main)] bg-[var(--bg-editor)] shadow-[0_-10px_40px_rgba(0,0,0,0.35)] z-[100] animate-in slide-in-from-bottom duration-300 p-4 space-y-3 sm:absolute sm:bottom-full sm:top-auto sm:left-0 sm:right-auto sm:mb-2.5 sm:w-64 sm:rounded-2xl sm:border sm:shadow-[0_20px_50px_rgba(0,0,0,0.3)] sm:z-40 sm:animate-in sm:fade-in sm:slide-in-from-bottom-2 sm:zoom-in-95 sm:duration-200 sm:p-1.5 sm:space-y-0.5 text-left">
                                                    <div className="flex justify-center sm:hidden mb-1">
                                                        <div className="w-12 h-1 bg-[var(--border-main)] rounded-full opacity-60" />
                                                    </div>
                                                    
                                                    <div className="px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-60 border-b border-[var(--border-main)]/30 mb-1 sm:hidden">
                                                        Seleccionar Acción
                                                    </div>
                                                    
                                                    {QUICK_ACTIONS?.map(action => {
                                                        const isSelected = action.id === selectedAction;
                                                        return (
                                                            <button
                                                                key={action.id}
                                                                onClick={() => {
                                                                    handleActionChange(action.id);
                                                                    setShowActionDropdown(false);
                                                                }}
                                                                className={`w-full text-left px-3 py-2.5 sm:py-2 text-xs transition-all flex items-center gap-2.5 rounded-xl border border-transparent cursor-pointer ${
                                                                    isSelected
                                                                        ? `${actionColors[action.id] || 'bg-indigo-500/10 text-indigo-500'} font-bold`
                                                                        : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]/50 hover:translate-x-0.5'
                                                                }`}
                                                            >
                                                                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0 border transition-transform ${isSelected ? 'scale-110' : ''} ${actionColors[action.id] || 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                                                                    {action.label?.match(/^.{1,2}/)?.[0] || '💬'}
                                                                </span>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="block truncate font-semibold">{action.label?.replace(/[💬✏️📝🎬👥✂️🔍💡]/g, '').trim()}</span>
                                                                    <span className="block text-[8px] text-[var(--text-muted)] opacity-60 truncate">{action.description}</span>
                                                                </div>
                                                                {isSelected && (
                                                                    <Check size={11} className="text-current shrink-0 animate-in zoom-in-50 duration-200" strokeWidth={3} />
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

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
                                className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-40 focus:outline-none resize-none py-1.5 max-h-32 scrollbar-hide leading-relaxed"
                                rows={1}
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
                                <Wand2 size={16} />
                            )}
                        </button>

                        {/* Send / Stop button */}
                        <button
                            onClick={isLoading ? onCancelStream : handleSend}
                            disabled={!isLoading && !inputValue.trim() && selectedAction !== 'escena'}
                            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-md cursor-pointer ${
                                isLoading 
                                    ? 'bg-rose-500 text-white hover:bg-rose-600' 
                                    : 'bg-[var(--accent-main)] text-white hover:bg-[var(--accent-main)]/80 disabled:opacity-30 disabled:cursor-not-allowed'
                            }`}
                            title={isLoading ? "Detener generación" : "Enviar mensaje"}
                        >
                            {isLoading ? (
                                <Square size={16} fill="currentColor" className="animate-pulse" />
                            ) : (
                                <Send size={18} />
                            )}
                        </button>
                    </div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-30 mt-2 text-center animate-pulse">
                        Shift+Enter para nueva línea · Sesiones guardadas automáticamente en local
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
                                onClick={() => {
                                    if (confirm('¿Estás seguro de que quieres eliminar esta conversación permanentemente?')) {
                                        onDeleteSession(activeSession.id);
                                        setShowSettingsModal(false);
                                        window.dispatchEvent(new CustomEvent('ia-toast', {
                                            detail: { message: '🗑️ Conversación eliminada.', type: 'success' }
                                        }));
                                    }
                                }}
                                className="w-full sm:w-auto px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.97] shadow-lg shadow-rose-600/15 text-center cursor-pointer shrink-0"
                            >
                                Eliminar Chat
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

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
