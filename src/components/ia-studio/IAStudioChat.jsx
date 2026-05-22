import React, { useState, useRef, useEffect } from 'react';
import IAStudioMessage from './IAStudioMessage';
import { Send, Sparkles, ChevronDown, Check, Download, X, Square, Scissors, Layers, Zap, AlertTriangle } from 'lucide-react';
import { buildContextFromSelections, estimateContextWeight, HEAVY_CONTEXT_THRESHOLD } from './IAStudioUtils';
import { AIService } from '../../services/AIService';

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
    onOpenSessions,
    onExport,
    QUICK_ACTIONS,
    selectedApi = 'openrouter',
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
    // New props
    compressContext = false,
    activeFragment = '',
    sectionMode = false,
    sectionConfig = null,
    currentSectionIndex = 1,
    accumulatedSections = [],
}) => {
    const [inputValue, setInputValue] = useState('');
    const [showActionDropdown, setShowActionDropdown] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [fragmentValue, setFragmentValue] = useState('');
    const [showSectionSetup, setShowSectionSetup] = useState(false);
    const [sectionSetupTotal, setSectionSetupTotal] = useState(3);
    const [sectionDescriptions, setSectionDescriptions] = useState(['', '', '']);
    
    const messagesEndRef = useRef(null);
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

    const filteredModels = selectedApi === 'openrouter'
        ? availableModels.filter(m => m.provider === 'OpenRouter')
        : AIService.getModelsForProvider(selectedApi);

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

    // Contextual Prompts Generator
    const getContextualPrompts = () => {
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

    // Calculate Token Statistics
    const contextText = buildContextFromSelections(
        activeBook,
        chapters,
        selectedChapterIds,
        characters,
        worldItems,
        selectedWorldItemIds,
        compressContext
    );

    const contextWeight = estimateContextWeight(
        chapters || [],
        selectedChapterIds,
        worldItems || [],
        selectedWorldItemIds
    );
    const contextCharCount = contextText.length;
    const contextTokens = Math.ceil(contextCharCount / 4.2);
    
    const messagesCharCount = messages.reduce((sum, msg) => sum + (msg.content || '').length, 0);
    const messagesTokens = Math.ceil(messagesCharCount / 4.2);
    const totalInputTokens = contextTokens + messagesTokens;

    const assistantCharCount = messages
        .filter(m => m.role === 'assistant')
        .reduce((sum, m) => sum + (m.content || '').length, 0);
    const outputTokens = Math.ceil(assistantCharCount / 4.2);

    // Custom Token Costs from activeBook settings or Gemini 2.0 Flash defaults
    const aiSettings = activeBook?.aiSettings || {};
    const inputTokenCost = aiSettings.inputTokenCost ?? 0.075;
    const outputTokenCost = aiSettings.outputTokenCost ?? 0.15;

    const inputCost = (totalInputTokens / 1000000) * inputTokenCost;
    const outputCost = (outputTokens / 1000000) * outputTokenCost;
    const totalCost = inputCost + outputCost;

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

    // Elastic textarea height adjustment
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [inputValue]);

    const handleActionChange = (actionId) => {
        window.dispatchEvent(new CustomEvent('ia-studio-action', { detail: actionId }));
        setShowActionDropdown(false);
        // Reset section mode when switching away
        if (actionId !== 'seccion') {
            setShowSectionSetup(false);
        }
    };

    // Sync fragment to parent
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('ia-studio-fragment', { detail: fragmentValue }));
    }, [fragmentValue]);

    // Sync compress context toggle
    const handleToggleCompress = () => {
        window.dispatchEvent(new CustomEvent('ia-studio-compress-context', { detail: !compressContext }));
    };

    // Start section mode
    const handleStartSectionMode = () => {
        const descriptions = Array.from({ length: sectionSetupTotal }, (_, i) => sectionDescriptions[i] || '');
        window.dispatchEvent(new CustomEvent('ia-studio-section-mode', {
            detail: { total: sectionSetupTotal, descriptions }
        }));
        setShowSectionSetup(false);
    };

    const handleExitSectionMode = () => {
        window.dispatchEvent(new CustomEvent('ia-studio-section-mode', { detail: null }));
    };

    const handleSend = () => {
        const trimmed = inputValue.trim();
        if (!trimmed || isLoading) return;
        // For fragment mode, validate fragment is present
        if (selectedAction === 'fragmento' && !fragmentValue.trim()) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: '✂️ Pega el fragmento que quieres editar en el campo de arriba.', type: 'warning' }
            }));
            return;
        }
        onSend(trimmed);
        setInputValue('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Construct Context Objects for Pills
    const selectedChapterObjs = selectedChapterIds
        .map(id => chapters?.find(c => c.id === id))
        .filter(Boolean);

    const selectedWorldItemObjs = selectedWorldItemIds
        .map(id => worldItems?.find(w => w.id === id) || characters?.find(c => c.id === id))
        .filter(Boolean);

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-app)]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-[var(--border-main)] bg-[var(--bg-app)] shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shrink-0">
                        <Sparkles size={18} className="text-white" />
                    </div>
                    <div className="min-w-0 animate-in fade-in duration-300">
                        <h2 className="text-sm font-black text-[var(--text-main)]">IA Studio</h2>
                        <div className="flex items-center gap-1.5 mt-0.5 relative">
                            <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 text-[8px] font-black uppercase tracking-wider leading-none">
                                {API_LABELS[selectedApi] || selectedApi}
                            </span>
                            
                            {/* Model Quick Switcher Dropdown */}
                            <button
                                onClick={() => setShowModelDropdown(!showModelDropdown)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--accent-soft)]/50 text-[8px] font-black text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all shrink-0"
                                title="Cambiar modelo activo"
                            >
                                <span className="truncate max-w-[140px]">
                                    {selectedModelName}
                                </span>
                                <ChevronDown size={8} className="opacity-70" />
                            </button>

                            {showModelDropdown && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowModelDropdown(false)} />
                                    <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl shadow-xl z-45 overflow-hidden animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-200 p-1.5 space-y-0.5">
                                        <div className="px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-60 border-b border-[var(--border-main)]/30 mb-1">
                                            Modelos de {API_LABELS[selectedApi] || selectedApi}
                                        </div>
                                        <div className="max-h-60 overflow-y-auto space-y-0.5">
                                            {filteredModels.map(model => {
                                                const isSelected = model.id === selectedModel;
                                                return (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => handleModelSelect(model.id)}
                                                        className={`w-full text-left px-2.5 py-2 text-[10px] transition-all flex items-center justify-between rounded-xl ${
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
                    </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                    {/* Context button */}
                    {/* <button
                        onClick={onOpenContext}
                        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:bg-indigo-500/10 transition-all"
                        title="Contexto y Destino"
                    >
                        <Sparkles size={12} /> <span className="hidden sm:inline">Contexto y Destino</span>
                    </button> */}

                    {/* New chat button */}
                    {/* <button
                        onClick={onNewChat}
                        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-purple-500 hover:bg-purple-500/10 transition-all"
                        title="Nueva conversación"
                    >
                        <Plus size={12} /> <span className="hidden sm:inline">Nuevo</span>
                    </button> */}

                    {/* Sessions button */}
                    {/* <button
                        onClick={onOpenSessions}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-indigo-500 hover:bg-indigo-500/10 transition-all"
                        title="Ver conversaciones guardadas"
                    >
                        <FolderClosed size={16} />
                    </button> */}

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
                            <div className="w-full max-w-xl mx-auto">
                                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-60 mb-3 text-left pl-1 flex items-center gap-1.5">
                                    <Sparkles size={10} className="text-indigo-500" /> sugerencias contextuales
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
                                    {getContextualPrompts().map((item, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => {
                                                setInputValue(item.prompt);
                                                if (inputRef.current) inputRef.current.focus();
                                            }}
                                            className="group flex gap-3 p-3 bg-[var(--bg-editor)] border border-[var(--border-main)]/60 hover:border-indigo-500/40 hover:bg-indigo-500/[0.02] rounded-xl transition-all text-xs text-[var(--text-main)] active:scale-[0.99] shadow-sm hover:shadow"
                                        >
                                            <span className="text-base shrink-0 group-hover:scale-110 transition-transform">{item.icon}</span>
                                            <div className="flex-1 min-w-0">
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
                                isLast={i === messages.length - 1}
                            />
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="px-4 lg:px-6 py-4 border-t border-[var(--border-main)] bg-[var(--bg-app)]">
                <div className="max-w-3xl mx-auto space-y-3">
                    
                    {/* Stats Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-2 text-[10px] text-[var(--text-muted)] opacity-85 border-b border-[var(--border-main)]/25 pb-2.5">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 w-full sm:w-auto">
                            <span className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${contextWeight.isHeavy ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />
                                Contexto: <strong className={`font-semibold ${contextWeight.isHeavy ? 'text-amber-500' : 'text-[var(--text-main)]'}`}>{(contextTokens / 1000).toFixed(1)}k</strong> tkn
                                {contextWeight.isHeavy && (
                                    <button
                                        onClick={handleToggleCompress}
                                        title={compressContext ? 'Contexto resumido activo — click para desactivar' : 'Contexto pesado detectado — click para comprimir'}
                                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${
                                            compressContext
                                                ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                                                : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                                        }`}
                                    >
                                        <Zap size={7} />
                                        {compressContext ? 'Resumido' : 'Comprimir'}
                                    </button>
                                )}
                            </span>
                            <span className="flex items-center gap-1">
                                Conversación: <strong className="text-[var(--text-main)] font-semibold">{(messagesTokens / 1000).toFixed(1)}k</strong> tkn
                            </span>
                            <span className="flex items-center gap-1">
                                Total: <strong className="text-[var(--text-main)] font-semibold">{(totalInputTokens + outputTokens).toLocaleString()}</strong> tkn
                            </span>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto pt-1.5 sm:pt-0 border-t border-[var(--border-main)]/10 sm:border-0">
                            <span>Costo est. ({selectedModel?.split('/').pop()?.split(':')?.[0] || 'Gemini 2.0 Flash'}):</span>
                            <span 
                                className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold tracking-wider shrink-0 cursor-help"
                                title={`Costo calculado con tarifas de:\nEntrada: $${inputTokenCost}/1M tokens\nSalida: $${outputTokenCost}/1M tokens`}
                            >
                                ${totalCost < 0.0001 && totalCost > 0 ? '<$0.0001' : totalCost.toFixed(5)}
                            </span>
                        </div>
                    </div>

                    {/* ── Modo Fragmento — Textarea de fragmento ── */}
                    {selectedAction === 'fragmento' && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
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
                                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 flex items-center justify-center transition-all"
                                    >
                                        <X size={9} strokeWidth={3} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Modo Sección — Setup o Progress ── */}
                    {selectedAction === 'crear' && !sectionMode && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSectionSetup(prev => !prev)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:bg-indigo-500/20 transition-all"
                            >
                                <Layers size={10} />
                                Modo Extenso (Secciones)
                            </button>
                        </div>
                    )}

                    {/* Section setup panel */}
                    {showSectionSetup && !sectionMode && (
                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Layers size={12} className="text-indigo-500" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Escritura por secciones</span>
                                </div>
                                <button onClick={() => setShowSectionSetup(false)} className="text-[var(--text-muted)] hover:text-red-500 transition-colors">
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
                                            className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
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
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-widest transition-all shadow-md shadow-indigo-600/20 active:scale-[0.99]"
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
                            <div className="flex-1 min-w-0">
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
                                className="text-[var(--text-muted)] hover:text-red-500 transition-colors shrink-0"
                                title="Salir del modo extenso"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                    {(selectedChapterObjs.length > 0 || selectedWorldItemObjs.length > 0) && (
                        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1 max-h-24 overflow-y-auto">
                            <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-60 mr-1.5 shrink-0">
                                Contexto Activo:
                            </span>
                            {selectedChapterObjs.map(chapter => (
                                <div 
                                    key={chapter.id} 
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold text-indigo-500 select-none animate-in fade-in zoom-in-95 duration-200 shadow-sm"
                                >
                                    <span>📖 {chapter.title}</span>
                                    <button 
                                        onClick={() => onRemoveContextItem && onRemoveContextItem('chapter', chapter.id)}
                                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-indigo-500/20 text-indigo-500 hover:text-indigo-600 transition-colors shrink-0"
                                        title="Eliminar de contexto"
                                    >
                                        <X size={8} strokeWidth={3} />
                                    </button>
                                </div>
                            ))}
                            {selectedWorldItemObjs.map(item => (
                                <div 
                                    key={item.id} 
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[9px] font-bold text-purple-500 select-none animate-in fade-in zoom-in-95 duration-200 shadow-sm"
                                >
                                    <span>✨ {item.name || item.title}</span>
                                    <button 
                                        onClick={() => onRemoveContextItem && onRemoveContextItem('worldItem', item.id)}
                                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-purple-500/20 text-purple-500 hover:text-purple-600 transition-colors shrink-0"
                                        title="Eliminar de contexto"
                                    >
                                        <X size={8} strokeWidth={3} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
 
                    {/* Input + Send (unified, fused, responsive) */}
                    <div className="flex items-center gap-2.5 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl pl-3 pr-4 py-3 focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all duration-300 shadow-sm relative">
                        {/* Action Selector - Custom Dropdown */}
                        <div className="relative shrink-0 select-none">
                            <button
                                onClick={() => setShowActionDropdown(!showActionDropdown)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-main)] text-[9px] font-black uppercase tracking-widest text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all"
                            >
                                <span className="text-[10px]">{currentAction?.label?.match(/^.{1,2}/)?.[0] || '💬'}</span>
                                <span className="hidden xs:inline">{currentAction?.label?.replace(/[💬✏️📝🔍💡]/g, '').trim() || 'Personalizado'}</span>
                                <ChevronDown size={10} className="text-[var(--text-muted)] opacity-70 shrink-0" />
                            </button>

                            {showActionDropdown && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowActionDropdown(false)} />
                                    <div className="absolute bottom-full left-0 mb-2 w-60 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl shadow-xl z-40 overflow-hidden animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-200 p-1.5 space-y-0.5">
                                        {QUICK_ACTIONS?.map(action => {
                                            const actionColors = {
                                                personalizado: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
                                                crear: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                                                modificar: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                                                analizar: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
                                                sugerir: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
                                            };
                                            const isSelected = action.id === selectedAction;
                                            return (
                                                <button
                                                    key={action.id}
                                                    onClick={() => handleActionChange(action.id)}
                                                    className={`w-full text-left px-3 py-2 text-xs transition-all flex items-center gap-2.5 rounded-xl border border-transparent ${
                                                        isSelected
                                                            ? 'bg-gradient-to-r from-purple-500/5 to-transparent border-l-2 border-l-purple-500 text-purple-600 font-bold'
                                                            : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]/40 hover:translate-x-0.5'
                                                    }`}
                                                >
                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0 border transition-transform ${isSelected ? 'scale-110' : ''} ${actionColors[action.id] || 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                                                        {action.label?.match(/^.{1,2}/)?.[0] || '💬'}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <span className="block truncate font-semibold">{action.label?.replace(/[💬✏️📝🔍💡]/g, '').trim()}</span>
                                                        <span className="block text-[8px] text-[var(--text-muted)] opacity-60 truncate">{action.description}</span>
                                                    </div>
                                                    {isSelected && (
                                                        <Check size={11} className="text-purple-500 shrink-0 animate-in zoom-in-50 duration-200" strokeWidth={3} />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Textarea */}
                        <textarea
                            ref={inputRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Escribe tu mensaje... (Enter para enviar)"
                            className="flex-1 bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-40 focus:outline-none resize-none py-1.5 max-h-32 scrollbar-hide leading-relaxed"
                            rows={1}
                            disabled={isLoading}
                        />

                        {/* Send / Stop button */}
                        <button
                            onClick={isLoading ? onCancelStream : handleSend}
                            disabled={!isLoading && !inputValue.trim()}
                            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-md ${
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
        </div>
    );
};

export default IAStudioChat;
