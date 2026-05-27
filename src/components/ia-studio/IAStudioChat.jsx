import React, { useState, useRef, useEffect, useCallback } from 'react';
import IAStudioMessage from './IAStudioMessage';
import { Send, Sparkles, ChevronDown, Check, Download, X, Square, Scissors, Layers, Zap, AlertTriangle, BookOpen, Target, Trash2, MessageSquare, Users, Plus, ChevronRight, RefreshCw, Loader2, ArrowLeft } from 'lucide-react';
import Modal from '../Modal';
import { buildContextFromSelections, estimateContextWeight, HEAVY_CONTEXT_THRESHOLD } from './IAStudioUtils';
import { AIService } from '../../services/AIService';
import { useData } from '../../context/DataContext';
import { 
    FOCUSES, 
    extractJSON, 
    parseCharactersFromMarkers,
    buildDetectionPrompt, 
    buildRefineSuggestionsPrompt,
    buildNameProposalsPrompt, 
    buildCharacterSuggestionsPrompt, 
    buildChatQuestionsPrompt, 
    buildAnswerSuggestionsPrompt, 
    buildSynthesisPrompt 
} from './CharacterChatPrompts';

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

    // --- COMANDOS MOCK DE PRUEBA ---
    const COMMANDS = [
        { id: '/mock patch', label: '✂️ /mock patch', description: 'Simular patch (fragmento)' },
        { id: '/mock section', label: '📄 /mock section', description: 'Simular sección de capítulo' },
        { id: '/mock scene', label: '🎬 /mock scene', description: 'Simular escena agregada' },
        { id: '/mock content', label: '✏️ /mock content', description: 'Simular contenido completo' }
    ];

    const [showCommandAutocomplete, setShowCommandAutocomplete] = useState(false);
    const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

    const getFilteredCommands = () => {
        const trimmedVal = inputValue.toLowerCase().trim();
        
        // Expresión regular para detectar si están escribiendo "/mock [cmd] [doc]" o si acaban de escribir "/mock [cmd]"
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

    // Conversational Character Creator State
    const { profile, updateWorldItem } = useData();
    const [charFlow, setCharFlow] = useState(null);
    const [nameSuggestionLoading, setNameSuggestionLoading] = useState(false);
    const [nameProposals, setNameProposals] = useState([]);
    const [questionsLoading, setQuestionsLoading] = useState(false);
    const [suggestionsLoading, setSuggestionsLoading] = useState({});
    const [answerSuggestions, setAnswerSuggestions] = useState({});
    const [selectedFocus, setSelectedFocus] = useState('general');
    const [suggestedCharacters, setSuggestedCharacters] = useState([]);
    const [suggestLoading, setSuggestLoading] = useState(false);
    const [addedSuggestions, setAddedSuggestions] = useState({});
    const [customNameInput, setCustomNameInput] = useState('');
    const [customIdeaInput, setCustomIdeaInput] = useState('');
    const [charAnswerInput, setCharAnswerInput] = useState('');
    const [refineAspectInput, setRefineAspectInput] = useState('');
    const [refineSuggestions, setRefineSuggestions] = useState([]);
    const [refineSuggestionsLoading, setRefineSuggestionsLoading] = useState(false);
    const [loadingTime, setLoadingTime] = useState(0);

    useEffect(() => {
        let interval = null;
        const isLoadingStep = charFlow?.step === 'detecting' || 
                              charFlow?.step === 'interview_loading' || 
                              charFlow?.step === 'synthesizing_loading' || 
                              charFlow?.step === 'loading';
        if (isLoadingStep) {
            setLoadingTime(0);
            interval = setInterval(() => {
                setLoadingTime(prev => prev + 1);
            }, 1000);
        } else {
            setLoadingTime(0);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [charFlow?.step]);

    const apiSelected = 'deepseek';
    const modelSelected = selectedModel;

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

        const selectedChapterIds = contextSelections?.chapterIds || [];
        const selectedWorldItemIds = contextSelections?.worldItemIds || [];

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
    const contextTokens = Math.ceil(contextCharCount / 3.8);
    
    const messagesCharCount = messages.reduce((sum, msg) => sum + (msg.content || '').length, 0);
    const messagesTokens = Math.ceil(messagesCharCount / 3.8);
    const totalInputTokens = contextTokens + messagesTokens;

    const assistantCharCount = messages
        .filter(m => m.role === 'assistant')
        .reduce((sum, m) => sum + (m.content || '').length, 0);
    const outputTokens = Math.ceil(assistantCharCount / 3.8);

    // Custom Token Costs from activeBook settings or Gemini 2.0 Flash defaults
    const aiConfig = profile?.aiConfig || {};
    const inputTokenCost = aiConfig.inputTokenCost ?? 0.075;
    const outputTokenCost = aiConfig.outputTokenCost ?? 0.15;

    // Híbrido Estimado-Acumulado (Para todos los proveedores de IA)
    const cumulativeUsage = activeSession?.cumulativeUsage;
    const hasCumulativeCost = cumulativeUsage && (cumulativeUsage.cost > 0 || cumulativeUsage.totalTokens > 0);

    let displayMessagesTokens = messagesTokens;
    let displayTotalTokens = totalInputTokens + outputTokens;
    let totalCost = 0;
    const isEstimated = !hasCumulativeCost;

    if (hasCumulativeCost) {
        // Si hay consumo acumulado real persistido, mostramos las cifras reales de la API
        displayTotalTokens = cumulativeUsage.totalTokens || displayTotalTokens;
        totalCost = cumulativeUsage.cost;
    } else {
        // Si no hay consumo acumulado, mostramos la estimación del costo de la siguiente consulta
        const inputCost = (totalInputTokens / 1000000) * inputTokenCost;
        const outputCost = (outputTokens / 1000000) * outputTokenCost;
        totalCost = inputCost + outputCost;
    }

    const currentAction = QUICK_ACTIONS?.find(a => a.id === selectedAction);

    const handleScroll = useCallback(() => {
        if (!chatContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        // Check if user is scrolled within 60px of the bottom
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
        window.dispatchEvent(new CustomEvent('ia-studio-action', { detail: actionId }));
        setShowActionDropdown(false);
        // Reset section mode when switching away
        if (actionId !== 'escribir') {
            setShowSectionSetup(false);
        }
    };

    // Sync fragment to parent
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('ia-studio-fragment', { detail: fragmentValue }));
    }, [fragmentValue]);

    // Auto-fetch suggestions when question changes in interview flow
    useEffect(() => {
        if (charFlow?.step === 'interview_questions') {
            const qIdx = charFlow.currentQuestionIndex;
            const hasSuggestions = answerSuggestions[qIdx] && answerSuggestions[qIdx].length > 0;
            const isSugLoading = suggestionsLoading[qIdx] || false;
            
            if (!hasSuggestions && !isSugLoading) {
                getAnswerSuggestions(qIdx);
            }
        }
    }, [charFlow?.currentQuestionIndex, charFlow?.step]);

    // Sync compress context toggle
    const handleToggleCompress = () => {
        if (onToggleCompress) {
            onToggleCompress();
        }
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

    const getLocalApiKey = () => {
        const aiConfig = profile?.aiConfig || {};
        return aiConfig.deepseekApiKey || profile?.deepseekApiKey || localStorage.getItem('deepseekApiKey') || '';
    };

    const getBookContext = () => {
        const bookTitle = activeBook?.title || 'Mi Novela';
        const generalInfo = worldItems?.find(w => w.id === 'system_core')?.content || '';
        const cleanInfo = generalInfo.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return `Título del libro: ${bookTitle}\nInformación General y Sinopsis: ${cleanInfo.substring(0, 1500)}`;
    };

    const startCreateFlow = () => {
        setCustomNameInput('');
        setCustomIdeaInput('');
        setNameProposals([]);
        setCharFlow({
            mode: 'create',
            step: 'config',
            characterName: '',
            initialIdea: '',
            questions: [],
            currentQuestionIndex: 0,
            answers: [],
            loading: false,
            generatedProfile: ''
        });
    };

    const suggestNames = async (option) => {
        const apiKey = getLocalApiKey();
        if (!apiKey) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Por favor, configura tu API Key en Ajustes antes de continuar.', type: 'error' }
            }));
            return;
        }
        setNameSuggestionLoading(true);
        try {
            const prompt = buildNameProposalsPrompt(getBookContext(), option);
            const response = await AIService.sendMessage(prompt, apiKey, { model: modelSelected, apiSelected: apiSelected });
            const list = extractJSON(response) || [];
            setNameProposals(list);
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al generar sugerencias de nombres.', type: 'error' }
            }));
        } finally {
            setNameSuggestionLoading(false);
        }
    };

    const selectName = (name) => {
        setCharFlow(prev => ({ ...prev, characterName: name, step: 'interview_init' }));
    };

    const startInterview = async (name, idea = '') => {
        const apiKey = getLocalApiKey();
        if (!apiKey) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Por favor, configura tu API Key en Ajustes antes de continuar.', type: 'error' }
            }));
            return;
        }
        setQuestionsLoading(true);
        const charName = name || charFlow?.characterName || customNameInput;
        const charIdea = idea || charFlow?.initialIdea || customIdeaInput;
        
        setCharFlow(prev => ({ 
            ...prev, 
            characterName: charName, 
            initialIdea: charIdea, 
            step: 'interview_loading' 
        }));

        try {
            const isRefining = charFlow?.mode === 'refine';
            const existingProfile = charFlow?.selectedCharacter?.fragment_exacto || '';
            const charDoc = worldItems?.find(w => w.id === 'system_personajes');
            const docContent = charDoc?.content || '';
            const bookContext = getBookContext();

            const prompt = buildChatQuestionsPrompt(
                charName, 
                selectedFocus, 
                isRefining ? existingProfile : charIdea, 
                isRefining,
                isRefining ? refineAspectInput : "",
                docContent,
                bookContext
            );
            const response = await AIService.sendMessage(prompt, apiKey, { model: modelSelected, apiSelected: apiSelected });
            const qs = extractJSON(response) || [];
            
            setCharFlow(prev => ({
                ...prev,
                questions: qs,
                currentQuestionIndex: 0,
                answers: Array(qs.length).fill(''),
                step: 'interview_questions'
            }));
            setCharAnswerInput('');
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al generar las preguntas de la entrevista.', type: 'error' }
            }));
            setCharFlow(prev => ({ ...prev, step: 'config' }));
        } finally {
            setQuestionsLoading(false);
        }
    };

    const getAnswerSuggestions = async (qIdx) => {
        const apiKey = getLocalApiKey();
        if (!apiKey) return;
        setSuggestionsLoading(prev => ({ ...prev, [qIdx]: true }));
        try {
            const charName = charFlow?.characterName;
            const question = charFlow?.questions[qIdx];
            const prompt = buildAnswerSuggestionsPrompt(charName, selectedFocus, question);
            const response = await AIService.sendMessage(prompt, apiKey, { model: modelSelected, apiSelected: apiSelected });
            const list = extractJSON(response) || [];
            setAnswerSuggestions(prev => ({ ...prev, [qIdx]: list }));
        } catch (e) {
            console.error(e);
        } finally {
            setSuggestionsLoading(prev => ({ ...prev, [qIdx]: false }));
        }
    };

    const chooseSuggestion = (qIdx, text) => {
        setCharAnswerInput(text);
    };

    const skipQuestion = () => {
        const idx = charFlow.currentQuestionIndex;
        const newAnswers = [...charFlow.answers];
        newAnswers[idx] = '[OMITIDO]';

        if (idx < charFlow.questions.length - 1) {
            setCharFlow(prev => ({
                ...prev,
                answers: newAnswers,
                currentQuestionIndex: idx + 1
            }));
            setCharAnswerInput('');
        } else {
            synthesizeProfile(newAnswers);
        }
    };

    const nextQuestion = () => {
        const idx = charFlow.currentQuestionIndex;
        const currentAnswer = charAnswerInput.trim();
        if (!currentAnswer) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Por favor, escribe una respuesta o selecciona una idea.', type: 'warning' }
            }));
            return;
        }

        const newAnswers = [...charFlow.answers];
        newAnswers[idx] = currentAnswer;

        if (idx < charFlow.questions.length - 1) {
            setCharFlow(prev => ({
                ...prev,
                answers: newAnswers,
                currentQuestionIndex: idx + 1
            }));
            setCharAnswerInput('');
        } else {
            synthesizeProfile(newAnswers);
        }
    };

    const convertMarkdownToHtml = (markdown) => {
        if (!markdown) return '';
        let html = markdown;
        html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/^\*\s+(.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.+?<\/li>)+/gs, '<ul>$&</ul>');
        
        const paragraphs = html.split(/\n\n+/).map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            if (trimmed.startsWith('<h') || trimmed.startsWith('<blockquote') || trimmed.startsWith('<ul')) return trimmed;
            return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
        });
        return paragraphs.filter(p => p).join('\n');
    };

    const synthesizeProfile = async (completedAnswers) => {
        const apiKey = getLocalApiKey();
        if (!apiKey) return;
        setCharFlow(prev => ({ ...prev, answers: completedAnswers, step: 'synthesizing_loading' }));
        try {
            const isRefining = charFlow.mode === 'refine';
            const charName = charFlow.characterName;
            const qaList = charFlow.questions.map((q, i) => ({ question: q, answer: completedAnswers[i] }));
            const existingProfile = isRefining ? charFlow.selectedCharacter?.fragment_exacto : '';
            const charDoc = worldItems?.find(w => w.id === 'system_personajes');
            const docContent = charDoc?.content || '';
            const bookContext = getBookContext();

            const prompt = buildSynthesisPrompt(charName, selectedFocus, qaList, existingProfile, docContent, bookContext);
            const response = await AIService.sendMessage(prompt, apiKey, { model: modelSelected, apiSelected: apiSelected });
            
            setCharFlow(prev => ({
                ...prev,
                generatedProfile: convertMarkdownToHtml(response),
                step: 'preview'
            }));
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al sintetizar el perfil del personaje.', type: 'error' }
            }));
            setCharFlow(prev => ({ ...prev, step: 'interview_questions' }));
        }
    };

    const saveToDocument = () => {
        try {
            const charDoc = worldItems?.find(w => w.id === 'system_personajes');
            const docContent = charDoc?.content || '';
            const isRefining = charFlow.mode === 'refine';
            let newContent = '';

            if (isRefining) {
                const originalFragment = charFlow.selectedCharacter?.fragment_exacto;
                if (docContent.includes(originalFragment)) {
                    newContent = docContent.replace(originalFragment, charFlow.generatedProfile);
                } else {
                    newContent = docContent + '\n\n' + charFlow.generatedProfile;
                }
            } else {
                newContent = docContent + (docContent.trim() ? '\n\n' : '') + charFlow.generatedProfile;
            }

            updateWorldItem('system_personajes', { content: newContent });
            
            setCharFlow(prev => ({ ...prev, step: 'success' }));
            
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: isRefining ? '¡Ficha de personaje refinada y guardada con éxito!' : '¡Nuevo personaje creado y guardado en tu documento!', type: 'success' }
            }));
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al guardar los cambios en el documento.', type: 'error' }
            }));
        }
    };

    const startRefineFlow = async () => {
        const apiKey = getLocalApiKey();
        if (!apiKey) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Por favor, configura tu API Key en Ajustes antes de continuar.', type: 'error' }
            }));
            return;
        }
        setCharFlow({
            mode: 'refine',
            step: 'detecting',
            detectedCharacters: [],
            selectedCharacter: null,
            questions: [],
            currentQuestionIndex: 0,
            answers: [],
            loading: true
        });

        try {
            const charDoc = worldItems?.find(w => w.id === 'system_personajes');
            const docContent = charDoc?.content || '';
            const prompt = buildDetectionPrompt(docContent);
            const response = await AIService.sendMessage(prompt, apiKey, { model: modelSelected, apiSelected: apiSelected });
            const list = parseCharactersFromMarkers(response) || [];
            
            setCharFlow(prev => ({
                ...prev,
                detectedCharacters: list,
                step: 'select',
                loading: false
            }));
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al analizar los personajes existentes en el documento.', type: 'error' }
            }));
            setCharFlow(null);
        }
    };

    const fetchRefineSuggestions = async () => {
        const apiKey = getLocalApiKey();
        if (!apiKey) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Por favor, configura tu API Key en Ajustes antes de continuar.', type: 'error' }
            }));
            return;
        }

        setRefineSuggestionsLoading(true);
        try {
            const charDoc = worldItems?.find(w => w.id === 'system_personajes');
            const docContent = charDoc?.content || '';
            const charName = charFlow?.characterName;
            const charProfile = charFlow?.selectedCharacter?.fragment_exacto || '';
            
            const prompt = buildRefineSuggestionsPrompt(charName, charProfile, docContent, getBookContext());
            const response = await AIService.sendMessage(prompt, apiKey, { model: modelSelected, apiSelected: apiSelected });
            const list = extractJSON(response) || [];
            
            setRefineSuggestions(list);
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al generar sugerencias de refinamiento.', type: 'error' }
            }));
        } finally {
            setRefineSuggestionsLoading(false);
        }
    };

    const selectCharacterToRefine = (charObj) => {
        setRefineAspectInput('');
        setRefineSuggestions([]);
        setRefineSuggestionsLoading(false);
        setCharFlow(prev => ({
            ...prev,
            selectedCharacter: charObj,
            characterName: charObj.nombre,
            step: 'config'
        }));
    };

    const startSuggestFlow = async () => {
        const apiKey = getLocalApiKey();
        if (!apiKey) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Por favor, configura tu API Key en Ajustes antes de continuar.', type: 'error' }
            }));
            return;
        }
        setCharFlow({
            mode: 'suggest',
            step: 'loading',
            suggestions: []
        });
        setSuggestLoading(true);

        try {
            const prompt = buildCharacterSuggestionsPrompt(getBookContext());
            const response = await AIService.sendMessage(prompt, apiKey, { model: modelSelected, apiSelected: apiSelected });
            const list = extractJSON(response) || [];
            setCharFlow(prev => ({
                ...prev,
                suggestions: list,
                step: 'suggestions'
            }));
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al generar sugerencias de personajes.', type: 'error' }
            }));
            setCharFlow(null);
        } finally {
            setSuggestLoading(false);
        }
    };

    const addSuggestedCharacter = (sugg) => {
        try {
            const charDoc = worldItems?.find(w => w.id === 'system_personajes');
            const docContent = charDoc?.content || '';
            const formatted = `<h2>${sugg.nombre}</h2><p><strong>Rol Dramático:</strong> ${sugg.rol}</p><p>${sugg.concepto}</p>`;
            const newContent = docContent + (docContent.trim() ? '\n\n' : '') + formatted;

            updateWorldItem('system_personajes', { content: newContent });

            setAddedSuggestions(prev => ({ ...prev, [sugg.nombre]: true }));
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: `¡${sugg.nombre} añadido al documento!`, type: 'success' }
            }));
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al añadir la sugerencia.', type: 'error' }
            }));
        }
    };

    const renderCharFlow = () => {
        if (charFlow === null) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-8 bg-gradient-to-tr from-indigo-950/5 via-blue-950/5 to-transparent border border-[var(--border-main)] rounded-3xl shadow-sm animate-in zoom-in-95 duration-300 my-4 font-sans">
                    <h3 className="text-2xl font-black font-serif italic text-[var(--text-main)] mb-3">Diseñador de Personajes IA</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-lg mb-8 leading-relaxed">
                        Crea, refina y descubre el elenco de tu novela de forma completamente conversacional e interactiva, guardando los resultados directamente en tu documento central de personajes.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
                        {/* Card 1: Crear */}
                        <button
                            onClick={() => startCreateFlow()}
                            className="group p-5 bg-[var(--bg-editor)]/40 hover:bg-blue-500/[0.03] border border-[var(--border-main)] hover:border-blue-500/40 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] text-left  h-30 shadow-sm"
                        >
                            <div>
                                <h4 className="font-bold text-sm text-[var(--text-main)] mb-1">Crear Personaje</h4>
                                <p className="text-[10px] text-[var(--text-muted)] leading-normal">Diseña un nuevo integrante desde cero con preguntas psicológicas guiadas.</p>
                            </div>
                        </button>

                        {/* Card 2: Refinar */}
                        <button
                            onClick={() => startRefineFlow()}
                            className="group p-5 bg-[var(--bg-editor)]/40 hover:bg-indigo-500/[0.03] border border-[var(--border-main)] hover:border-indigo-500/40 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] text-left h-30 shadow-sm"
                        >
                            <div>
                                <h4 className="font-bold text-sm text-[var(--text-main)] mb-1">Refinar Existente</h4>
                                <p className="text-[10px] text-[var(--text-muted)] leading-normal">Detecta personajes en tu documento y expande su psicología en profundidad.</p>
                            </div>
                        </button>

                        {/* Card 3: Sugerir */}
                        <button
                            onClick={() => startSuggestFlow()}
                            className="group p-5 bg-[var(--bg-editor)]/40 hover:bg-orange-500/[0.03] border border-[var(--border-main)] hover:border-orange-500/40 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] text-left h-30 shadow-sm"
                        >
                            <div>
                                <h4 className="font-bold text-sm text-[var(--text-main)] mb-1">Sugerir Ideas</h4>
                                <p className="text-[10px] text-[var(--text-muted)] leading-normal">Genera nombres y arquetipos inspirados en el universo de tu libro.</p>
                            </div>
                        </button>
                    </div>
                </div>
            );
        }

        // ─── 1. DETECTING CHARACTERS LOADING ───
        if (charFlow.step === 'detecting') {
            const formatTime = (secs) => {
                const m = Math.floor(secs / 60);
                const s = secs % 60;
                return `${m}:${s < 10 ? '0' : ''}${s}`;
            };

            return (
                <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-8 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in fade-in duration-300 font-sans">
                    <Loader2 size={40} className="text-indigo-500 animate-spin mb-6" />
                    <h3 className="text-lg font-bold text-[var(--text-main)] mb-2 font-serif italic">Analizando documento...</h3>
                    <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed mb-5">
                        La IA está escaneando tu documento de personajes de forma semántica en busca de perfiles existentes.
                    </p>
                    
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/[0.06] border border-indigo-500/15 rounded-full text-[11px] font-mono text-indigo-500 font-bold shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        <span>Tiempo transcurrido: {formatTime(loadingTime)}</span>
                    </div>
                </div>
            );
        }

        // ─── 2. SELECT CHARACTER TO REFINE ───
        if (charFlow.step === 'select') {
            return (
                <div className="flex flex-col min-h-[420px] p-6 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans">
                    <div className="flex items-center gap-3 mb-6">
                        <button 
                            onClick={() => setCharFlow(null)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-soft)] text-[var(--text-muted)]"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div>
                            <h3 className="text-lg font-black font-serif italic text-[var(--text-main)]">Refinar Personaje</h3>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Selecciona el personaje del documento que deseas profundizar:</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[300px] scrollbar-hide py-2 space-y-2">
                        {charFlow.detectedCharacters?.map((c, i) => (
                            <button
                                key={i}
                                onClick={() => selectCharacterToRefine(c)}
                                className="w-full text-left p-4 rounded-xl border border-[var(--border-main)] hover:border-indigo-500/40 bg-[var(--bg-app)] hover:bg-indigo-500/[0.02] flex items-center justify-between group transition-all hover:scale-[1.01] active:scale-[0.99]"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-indigo-500/10 rounded-lg text-indigo-500 flex items-center justify-center">
                                        <Users size={16} />
                                    </div>
                                    <span className="font-semibold text-xs text-[var(--text-main)]">{c.nombre}</span>
                                </div>
                                <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:translate-x-0.5 transition-transform" />
                            </button>
                        ))}

                        {charFlow.detectedCharacters?.length === 0 && (
                            <div className="text-center py-16 text-xs text-[var(--text-muted)] opacity-60">
                                No se detectaron personajes estructurados en el documento actual. ¡Empieza creando uno nuevo!
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // ─── 3. CONFIGURATION STEP (NAME INPUT OR FOCUS SELECTION) ───
        if (charFlow.step === 'config') {
            const isRefine = charFlow.mode === 'refine';
            return (
                <div className="flex flex-col min-h-[420px] p-6 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans text-left">
                    <div className="flex items-center gap-3 mb-6">
                        <button 
                            onClick={() => isRefine ? setCharFlow(prev => ({ ...prev, step: 'select' })) : setCharFlow(null)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-soft)] text-[var(--text-muted)]"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div>
                            <h3 className="text-lg font-black font-serif italic text-[var(--text-main)]">
                                {isRefine ? `Refinar: ${charFlow.characterName}` : 'Nuevo Personaje'}
                            </h3>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Configura el enfoque de la entrevista e ideas base.</p>
                        </div>
                    </div>

                    <div className="flex-grow space-y-5 overflow-y-auto max-h-[340px] pr-1 scrollbar-hide">
                        {isRefine ? (
                            /* REFINE FLOW: CUSTOM ASPECT INPUT & AI GAP SUGGESTIONS */
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-2">
                                        ¿Qué aspecto o detalle deseas refinar de {charFlow.characterName}?
                                    </label>
                                    <textarea
                                        value={refineAspectInput}
                                        onChange={(e) => setRefineAspectInput(e.target.value)}
                                        placeholder="Ej: Quiero pulir su motivación oculta, aclarar su pasado familiar o detallar su enemistad con Sylas..."
                                        className="w-full h-20 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl p-3 text-xs text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none mb-3"
                                    />
                                    
                                    <div className="flex justify-between items-center">
                                        <button
                                            type="button"
                                            onClick={fetchRefineSuggestions}
                                            disabled={refineSuggestionsLoading}
                                            className="px-4 py-2.5 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white border border-indigo-500/20 rounded-xl text-[10px] text-indigo-400 font-bold uppercase tracking-wider transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer shrink-0"
                                        >
                                            {refineSuggestionsLoading ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Sparkles size={12} />
                                            )}
                                            No sé, sugiéreme qué refinar
                                        </button>
                                    </div>
                                </div>

                                {refineSuggestionsLoading && (
                                    <div className="flex flex-col items-center justify-center p-6 bg-[var(--bg-app)]/30 border border-[var(--border-main)] rounded-2xl animate-in fade-in duration-300">
                                        <Loader2 size={24} className="text-indigo-500 animate-spin mb-3" />
                                        <p className="text-[10px] text-[var(--text-muted)] font-mono animate-pulse">
                                            Analizando elenco y buscando vacíos...
                                        </p>
                                    </div>
                                )}

                                {!refineSuggestionsLoading && refineSuggestions.length > 0 && (
                                    <div className="space-y-2 animate-in fade-in duration-300">
                                        <label className="block text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                            Vacíos o sugerencias de mejora detectados:
                                        </label>
                                        <div className="grid grid-cols-1 gap-2">
                                            {refineSuggestions.map((sugg, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => setRefineAspectInput(sugg.titulo + ": " + sugg.descripcion)}
                                                    className="w-full text-left p-3 bg-[var(--bg-app)] hover:bg-blue-500/[0.02] border border-[var(--border-main)] hover:border-blue-500/30 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] flex gap-2 cursor-pointer"
                                                >
                                                    <span className="text-sm shrink-0">🎯</span>
                                                    <div>
                                                        <h5 className="font-bold text-[11px] text-[var(--text-main)]">{sugg.titulo}</h5>
                                                        <p className="text-[9px] text-[var(--text-muted)] leading-relaxed mt-0.5">{sugg.descripcion}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* CREATE FLOW (AS IT WAS): NAME INPUT & FOCUS SELECTION */
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-2">Nombre del Personaje</label>
                                    <div className="flex gap-2 mb-2">
                                        <input 
                                            type="text"
                                            value={customNameInput}
                                            onChange={(e) => setCustomNameInput(e.target.value)}
                                            placeholder="Ej: Sylas Vance..."
                                            className="flex-1 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl px-4 py-2.5 text-xs text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => suggestNames('completo')}
                                            disabled={nameSuggestionLoading}
                                            className="px-4 bg-gradient-to-tr from-blue-600/10 to-indigo-600/10 hover:from-blue-600 hover:to-indigo-600 hover:text-white border border-blue-500/20 rounded-xl text-[10px] text-blue-400 font-bold uppercase tracking-wider transition-all disabled:opacity-40 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                                        >
                                            {nameSuggestionLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                            Sugerir Nombres
                                        </button>
                                    </div>

                                    {nameProposals.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 p-3 bg-[var(--bg-app)]/50 rounded-xl border border-[var(--border-main)] mb-2 animate-in fade-in duration-300">
                                            {nameProposals.map((name, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => setCustomNameInput(name)}
                                                    className="text-[10px] font-medium bg-[var(--bg-editor)] hover:bg-blue-500/10 hover:text-blue-400 border border-[var(--border-main)] rounded-lg px-2.5 py-1 text-[var(--text-main)] transition-all cursor-pointer"
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <label className="block text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] mt-4 mb-2">Idea Inicial o Arquetipo (Opcional)</label>
                                    <textarea
                                        value={customIdeaInput}
                                        onChange={(e) => setCustomIdeaInput(e.target.value)}
                                        placeholder="Ej: Un contrabandista astuto que oculta su pasado real y teme ser traicionado por quienes ama..."
                                        className="w-full h-16 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl p-3 text-xs text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-2">Enfoque Narrativo Principal</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {Object.values(FOCUSES).map((focus) => {
                                            const isSelected = selectedFocus === focus.id;
                                            return (
                                                <button
                                                    key={focus.id}
                                                    type="button"
                                                    onClick={() => setSelectedFocus(focus.id)}
                                                    className={`w-full text-left p-3.5 rounded-xl border transition-all text-xs flex gap-3 cursor-pointer ${
                                                        isSelected
                                                            ? 'border-indigo-500 bg-indigo-500/[0.02] shadow-sm'
                                                            : 'border-[var(--border-main)] bg-[var(--bg-app)]/30 hover:bg-[var(--bg-app)]'
                                                    }`}
                                                >
                                                    <span className="text-base shrink-0">{focus.title.split(' ')[0]}</span>
                                                    <div>
                                                        <h5 className="font-semibold text-xs text-[var(--text-main)]">{focus.label}</h5>
                                                        <p className="text-[9px] text-[var(--text-muted)] leading-relaxed mt-0.5">{focus.description}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => startInterview(isRefine ? charFlow.characterName : customNameInput, isRefine ? '' : customIdeaInput)}
                        disabled={isRefine ? !refineAspectInput.trim() : !customNameInput.trim()}
                        className="mt-6 w-full py-3.5 bg-gradient-to-tr from-blue-600 to-indigo-600 hover:shadow-lg hover:shadow-blue-500/10 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer shrink-0"
                    >
                        <Sparkles size={14} /> {isRefine ? 'Iniciar Refinamiento' : 'Iniciar Entrevista'}
                    </button>
                </div>
            );
        }

        // ─── 4. INTERVIEW LOADING SCREEN ───
        if (charFlow.step === 'interview_loading') {
            const formatTime = (secs) => {
                const m = Math.floor(secs / 60);
                const s = secs % 60;
                return `${m}:${s < 10 ? '0' : ''}${s}`;
            };

            return (
                <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-8 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans">
                    <Loader2 size={40} className="text-indigo-500 animate-spin mb-6" />
                    <h3 className="text-lg font-bold text-[var(--text-main)] mb-2 font-serif italic animate-pulse">Canalizando preguntas...</h3>
                    <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed opacity-85 mb-5">
                        Diseñando cuestionario adaptativo de {FOCUSES[selectedFocus]?.label} para el perfil de {charFlow.characterName}...
                    </p>
                    
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/[0.06] border border-indigo-500/15 rounded-full text-[11px] font-mono text-indigo-500 font-bold shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        <span>Tiempo transcurrido: {formatTime(loadingTime)}</span>
                    </div>
                </div>
            );
        }

        // ─── 5. QUESTION SYSTEM (INTERVIEW QUESTIONS) ───
        if (charFlow.step === 'interview_questions') {
            const qIdx = charFlow.currentQuestionIndex;
            const question = charFlow.questions[qIdx];
            const hasSuggestions = answerSuggestions[qIdx] && answerSuggestions[qIdx].length > 0;
            const suggestionsList = answerSuggestions[qIdx] || [];
            const isSugLoading = suggestionsLoading[qIdx] || false;

            return (
                <div className="flex flex-col min-h-[420px] p-6 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-200 font-sans text-left justify-between">
                    <div className="space-y-5">
                        {/* Progress */}
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                            <span>{FOCUSES[selectedFocus]?.label}</span>
                            <span className="bg-indigo-500/10 text-indigo-400 px-2.5 py-0.5 rounded-full">Pregunta {qIdx + 1} de {charFlow.questions.length}</span>
                        </div>

                        {/* Question Card */}
                        <div className="p-4 bg-gradient-to-tr from-indigo-950/10 via-[var(--bg-app)] to-transparent border border-[var(--border-main)] rounded-2xl relative overflow-hidden shadow-inner">
                            <div className="absolute top-0 right-0 p-3 opacity-10">
                                <MessageSquare size={48} className="text-indigo-500" />
                            </div>
                            <h4 className="font-serif italic text-sm md:text-base font-bold text-[var(--text-main)] leading-relaxed relative z-10">
                                "{question}"
                            </h4>
                        </div>

                        {/* Suggestion Section */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Sugerencias del Co-piloto</span>
                                {!hasSuggestions && !isSugLoading && (
                                    <button
                                        onClick={() => getAnswerSuggestions(qIdx)}
                                        className="text-[9px] font-bold text-indigo-400 hover:text-indigo-500 uppercase tracking-wider flex items-center gap-1 shrink-0"
                                    >
                                        <Sparkles size={10} className="animate-pulse" /> Generar ideas rápidas
                                    </button>
                                )}
                            </div>

                            {isSugLoading && (
                                <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] p-2 bg-[var(--bg-app)]/50 rounded-xl border border-[var(--border-main)]/50 animate-pulse">
                                    <Loader2 size={12} className="animate-spin text-indigo-500" />
                                    Generando ideas literarias...
                                </div>
                            )}

                            {hasSuggestions && (
                                <div className="grid grid-cols-1 gap-1.5 animate-in fade-in duration-300">
                                    {suggestionsList.map((sugg, i) => (
                                        <button
                                            key={i}
                                            onClick={() => chooseSuggestion(qIdx, sugg)}
                                            className="w-full text-left p-2.5 bg-[var(--bg-app)]/60 hover:bg-indigo-500/[0.03] hover:border-indigo-500/30 border border-[var(--border-main)] rounded-xl text-[10px] text-[var(--text-main)] leading-relaxed transition-all active:scale-[0.99]"
                                        >
                                            {sugg}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Answer Input */}
                        <div>
                            <label className="block text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-2">Tu respuesta</label>
                            <textarea
                                value={charAnswerInput}
                                onChange={(e) => setCharAnswerInput(e.target.value)}
                                placeholder="Escribe tu respuesta aquí... Deja volar tu imaginación o edita las sugerencias de arriba."
                                className="w-full h-24 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl p-3.5 text-xs text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none leading-relaxed"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 mt-6">
                        {qIdx > 0 && (
                            <button
                                onClick={() => {
                                    const prevIdx = qIdx - 1;
                                    setCharAnswerInput(charFlow.answers[prevIdx] || '');
                                    setCharFlow(prev => ({ ...prev, currentQuestionIndex: prevIdx }));
                                }}
                                className="px-5 py-3 border border-[var(--border-main)] hover:bg-[var(--accent-soft)] text-[var(--text-muted)] font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                            >
                                Atrás
                            </button>
                        )}
                        <button
                            onClick={skipQuestion}
                            className="px-5 py-3 border border-dashed border-[var(--border-main)] hover:border-orange-500/50 hover:bg-orange-500/5 text-orange-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                        >
                            Omitir
                        </button>
                        <button
                            onClick={nextQuestion}
                            className="flex-1 py-3 bg-gradient-to-tr from-blue-600 to-indigo-600 hover:shadow-lg hover:shadow-blue-500/10 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                        >
                            {qIdx === charFlow.questions.length - 1 ? 'Generar Perfil' : 'Siguiente'}
                            <ArrowLeft size={14} className="rotate-180" />
                        </button>
                    </div>
                </div>
            );
        }

        // ─── 6. SYNTHESIZING PROGRESS SCREEN ───
        if (charFlow.step === 'synthesizing_loading') {
            const formatTime = (secs) => {
                const m = Math.floor(secs / 60);
                const s = secs % 60;
                return `${m}:${s < 10 ? '0' : ''}${s}`;
            };

            return (
                <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-8 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans">
                    <Loader2 size={40} className="text-indigo-500 animate-spin mb-6" />
                    <h3 className="text-lg font-bold text-[var(--text-main)] mb-2 font-serif italic animate-pulse">Esculpiendo arquetipo...</h3>
                    <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed opacity-85 mb-5">
                        La IA está fusionando tus respuestas psicológicas para redactar una ficha tridimensional literaria completa.
                    </p>
                    
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/[0.06] border border-indigo-500/15 rounded-full text-[11px] font-mono text-indigo-500 font-bold shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        <span>Tiempo transcurrido: {formatTime(loadingTime)}</span>
                    </div>
                </div>
            );
        }

        // ─── 7. PREVIEW SCREEN ───
        if (charFlow.step === 'preview') {
            const isRefine = charFlow.mode === 'refine';
            return (
                <div className="flex flex-col min-h-[420px] p-6 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans text-left justify-between">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                            <span>SÍNTESIS FINAL COMPLETA</span>
                            <span className="text-indigo-400 font-bold">{charFlow.characterName}</span>
                        </div>

                        {/* Profile Preview Panel */}
                        <div 
                            className="flex-1 overflow-y-auto max-h-[260px] p-4 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl text-xs text-[var(--text-main)] space-y-3 leading-relaxed scrollbar-hide border-l-4 border-l-indigo-500 shadow-inner font-sans"
                            dangerouslySetInnerHTML={{ __html: charFlow.generatedProfile }}
                        />
                    </div>

                    <div className="flex gap-2 mt-6">
                        <button
                            onClick={() => setCharFlow(null)}
                            className="px-5 py-3.5 border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-500 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                        >
                            Descartar
                        </button>
                        <button
                            onClick={saveToDocument}
                            className="flex-1 py-3.5 bg-gradient-to-tr from-emerald-600 to-teal-600 hover:shadow-lg hover:shadow-emerald-500/10 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
                        >
                            <Check size={14} strokeWidth={3} />
                            {isRefine ? 'Guardar Cambios' : 'Guardar en Documento'}
                        </button>
                    </div>
                </div>
            );
        }

        // ─── 8. SUCCESS SCREEN ───
        if (charFlow.step === 'success') {
            const isRefine = charFlow.mode === 'refine';
            return (
                <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-8 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans">
                    <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-full flex items-center justify-center text-white mb-6 shadow-lg shadow-emerald-500/20 scale-110 animate-bounce">
                        <Check size={32} strokeWidth={3} />
                    </div>
                    <h3 className="text-xl font-bold text-[var(--text-main)] mb-2 font-serif italic">
                        {isRefine ? '¡Refinamiento Guardado!' : '¡Personaje Creado!'}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed mb-8">
                        {isRefine 
                            ? 'Los cambios y adiciones psicológicas se han integrado y reemplazado con éxito en tu documento central de personajes.'
                            : 'La ficha del nuevo personaje ha sido consolidada en texto estructurado y anexada al final del documento central.'
                        }
                    </p>
                    <button
                        onClick={() => setCharFlow(null)}
                        className="px-8 py-3.5 bg-[var(--bg-app)] border border-[var(--border-main)] hover:border-indigo-500/50 text-[var(--text-main)] hover:text-indigo-400 font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                    >
                        Volver al Panel Principal
                    </button>
                </div>
            );
        }

        // ─── 9. SUGGESTION RESULTS PANEL ───
        if (charFlow.step === 'suggestions') {
            return (
                <div className="flex flex-col min-h-[420px] p-6 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans text-left justify-between">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => setCharFlow(null)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-soft)] text-[var(--text-muted)]"
                            >
                                <ArrowLeft size={16} />
                            </button>
                            <div>
                                <h3 className="text-lg font-black font-serif italic text-[var(--text-main)]">Sugerencias de Elenco</h3>
                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Propuestas dramáticas coherentes con el tono de tu historia:</p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto max-h-[280px] scrollbar-hide py-2 space-y-3">
                            {charFlow.suggestions?.map((sugg, i) => {
                                const isAdded = addedSuggestions[sugg.nombre];
                                return (
                                    <div 
                                        key={i}
                                        className="p-4 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl flex flex-col justify-between gap-3 text-xs leading-relaxed"
                                    >
                                        <div>
                                            <div className="flex justify-between items-start mb-1 gap-2">
                                                <span className="font-bold text-sm text-indigo-400 font-serif">{sugg.nombre}</span>
                                                <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-black uppercase tracking-wider shrink-0">{sugg.rol}</span>
                                            </div>
                                            <p className="text-[10px] text-[var(--text-muted)] leading-relaxed mt-1.5">{sugg.concepto}</p>
                                        </div>

                                        <button
                                            onClick={() => !isAdded && addSuggestedCharacter(sugg)}
                                            disabled={isAdded}
                                            className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all flex items-center justify-center gap-1.5 ${
                                                isAdded
                                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 cursor-default'
                                                    : 'bg-[var(--bg-editor)] hover:bg-indigo-500/10 border-[var(--border-main)] hover:border-indigo-500/30 text-[var(--text-main)] hover:text-indigo-400 active:scale-[0.98]'
                                            }`}
                                        >
                                            {isAdded ? (
                                                <>
                                                    <Check size={11} strokeWidth={3} /> ¡Añadido al libro!
                                                </>
                                            ) : (
                                                <>
                                                    <Plus size={11} /> Añadir a mi libro
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        onClick={() => setCharFlow(null)}
                        className="mt-6 w-full py-3 border border-[var(--border-main)] hover:bg-[var(--accent-soft)] text-[var(--text-muted)] font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                    >
                        Volver al Panel
                    </button>
                </div>
            );
        }

        // ─── 10. SUGGEST LOADING ───
        if (charFlow.step === 'loading') {
            const formatTime = (secs) => {
                const m = Math.floor(secs / 60);
                const s = secs % 60;
                return `${m}:${s < 10 ? '0' : ''}${s}`;
            };

            return (
                <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-8 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans">
                    <Loader2 size={40} className="text-orange-500 animate-spin mb-6" />
                    <h3 className="text-lg font-bold text-[var(--text-main)] mb-2 font-serif italic animate-pulse">Bocetando personajes...</h3>
                    <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed opacity-85 mb-5">
                        La IA está analizando tu universo narrativo para conjurar arquetipos tridimensionales coherentes...
                    </p>
                    
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/[0.06] border border-orange-500/15 rounded-full text-[11px] font-mono text-orange-500 font-bold shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        <span>Tiempo transcurrido: {formatTime(loadingTime)}</span>
                    </div>
                </div>
            );
        }

        return null;
    };




    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-app)]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-[var(--border-main)] bg-[var(--bg-app)] shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => setShowSettingsModal(true)}
                        className="group flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)]/75 hover:bg-[var(--accent-soft)] hover:border-indigo-500/30 transition-all shadow-sm active:scale-[0.98] text-left min-w-0"
                        title="Ajustes de la conversación"
                    >
                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-600/10 border border-indigo-500/20 group-hover:from-indigo-500 group-hover:to-purple-600 flex items-center justify-center shadow-sm shrink-0 transition-all duration-300">
                            <Sparkles size={14} className="text-indigo-500 group-hover:text-white transition-colors duration-300" />
                        </div>
                        <div className="min-w-0">
                            <span className="block text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)] opacity-60 leading-none">IA Studio</span>
                            <span className="block text-xs font-black text-[var(--text-main)] truncate max-w-[120px] sm:max-w-[200px] mt-0.5 group-hover:text-indigo-500 transition-colors leading-tight">
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
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] text-[11px] font-bold text-[var(--text-main)] hover:bg-[var(--accent-soft)] hover:border-[var(--border-main)]/80 transition-all shadow-sm"
                            title="Cambiar modelo activo"
                        >
                            <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 text-[8px] font-black uppercase tracking-wider leading-none shrink-0">
                                DeepSeek
                            </span>
                            <span className="truncate max-w-[80px] sm:max-w-[140px] font-medium text-[var(--text-main)]">
                                {selectedModelName}
                            </span>
                            <ChevronDown size={12} className="opacity-70 text-[var(--text-muted)] shrink-0" />
                        </button>
                        
                        {showModelDropdown && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setShowModelDropdown(false)} />
                                <div className="absolute top-full right-0 mt-1.5 w-64 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl shadow-xl z-45 overflow-hidden animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-200 p-1.5 space-y-0.5">
                                    {/* Reasoning Mode Switch */}
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

                                            {/* Thinking Effort Control (Only if reasoning mode is enabled) */}
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

                    {/* Contexto y Destino button */}
                    <button
                        onClick={onOpenContext}
                        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-[11px] font-bold text-indigo-500 hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all shadow-sm shrink-0"
                        title="Configurar Contexto y Destino"
                    >
                        <Sparkles size={12} className="text-indigo-500" />
                        <span className="hidden sm:inline">Contexto y Destino</span>
                    </button>

                    {/* Export button */}
                    {messages.length > 0 && onExport && (
                        <button
                            onClick={onExport}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all shrink-0"
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
                        renderCharFlow()
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
            <div className="px-4 lg:px-6 py-4 border-t border-[var(--border-main)] bg-[var(--bg-app)]">
                <div className="max-w-3xl mx-auto space-y-3">
                    
                    {/* Stats Bar */}
                    <div className="flex md:hidden flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-2 text-[10px] text-[var(--text-muted)] opacity-85 border-b border-[var(--border-main)]/25 pb-2.5">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 w-full sm:w-auto">
                            <span className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${contextWeight.isHeavy && isEstimated ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />
                                {isEstimated ? 'Contexto:' : 'Entrada (Real):'} <strong className={`font-semibold ${contextWeight.isHeavy && isEstimated ? 'text-amber-500' : 'text-[var(--text-main)]'}`}>{((isEstimated ? contextTokens : (cumulativeUsage?.promptTokens || 0)) / 1000).toFixed(1)}k</strong> tkn
                                {contextWeight.isHeavy && isEstimated && (
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
                                {isEstimated ? 'Conversación:' : 'Salida (Real):'} <strong className="text-[var(--text-main)] font-semibold">{((isEstimated ? displayMessagesTokens : (cumulativeUsage?.completionTokens || 0)) / 1000).toFixed(1)}k</strong> tkn
                            </span>
                            <span className="flex items-center gap-1">
                                {isEstimated ? 'Total est.:' : 'Total real:'} <strong className="text-[var(--text-main)] font-semibold">{(displayTotalTokens / 1000).toFixed(1)}k</strong> tkn
                            </span>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto pt-1.5 sm:pt-0 border-t border-[var(--border-main)]/10 sm:border-0">
                            <span>{isEstimated ? 'Costo est. (Siguiente consulta):' : 'Costo acumulado (Exacto):'}</span>
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
                    {selectedAction === 'escribir' && !sectionMode && (
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

                    {/* Summary Bar */}
                    <div className="text-[10px] text-[var(--text-muted)] font-medium flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-1">
                        <span className="flex items-center gap-1">
                            <BookOpen size={11} className="text-indigo-500" /> 
                            Contexto: 
                            <strong className="text-indigo-600 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/15">
                                {selectedChapterIds.length + selectedWorldItemIds.length} elem
                            </strong>
                        </span>
                        <span className="opacity-30 hidden xs:inline">·</span>
                        <span className="flex items-center gap-1">
                            <Target size={11} className="text-emerald-500" /> 
                            Destino: 
                            <strong className="text-emerald-600 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/15 truncate max-w-[150px]" title={currentDestLabel()}>
                                {destinationDoc?.mode === 'auto' ? 'Automático' : destinationDoc?.mode === 'new' ? 'Crear Nuevo' : destinationDoc?.docTitle || 'Manual'}
                            </strong>
                        </span>
                    </div>

                    {/* Input + Send (unified, fused, responsive) */}
                    <div className="flex items-center gap-2.5 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl pl-3 pr-4 py-3 focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all duration-300 shadow-sm relative">
                        {/* Autocomplete Dropdown de Comandos de Pruebas */}
                        {shouldShowAutocomplete && (
                            <div className="absolute bottom-full left-0 mb-3 w-64 bg-[var(--bg-editor)]/95 backdrop-blur-2xl border border-[var(--border-main)] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 overflow-hidden p-1.5 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-200">
                                <div className="px-2.5 py-1 text-[8px] font-black text-[var(--text-muted)] uppercase tracking-wider">Comandos de Pruebas</div>
                                {filteredCommands.map((cmd, idx) => {
                                    const isSelected = idx === selectedCommandIndex;
                                    return (
                                        <button
                                            key={cmd.id}
                                            onClick={() => selectCommand(cmd.id)}
                                            onMouseEnter={() => setSelectedCommandIndex(idx)}
                                            className={`w-full text-left px-3 py-2 text-xs transition-all flex items-center justify-between rounded-xl border border-transparent ${
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
                        {/* Action Selector - Custom Dropdown */}
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
                                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all duration-300 shadow-sm hover:scale-[1.02] active:scale-95 ${activeColorClass}`}
                                        >
                                            <span className="text-xs transition-transform duration-300">{currentAction?.label?.match(/^.{1,2}/)?.[0] || '💬'}</span>
                                            <span className="hidden xs:inline">{currentAction?.label?.replace(/[💬✏️📝🎬👥✂️🔍💡]/g, '').trim() || 'Chat'}</span>
                                            <ChevronDown size={11} className={`text-current opacity-80 transition-transform duration-300 shrink-0 ${showActionDropdown ? 'rotate-180' : ''}`} />
                                        </button>

                                        {showActionDropdown && (
                                            <>
                                                <div className="fixed inset-0 z-30" onClick={() => setShowActionDropdown(false)} />
                                                <div className="absolute bottom-full left-0 mb-2.5 w-64 bg-[var(--bg-editor)]/95 backdrop-blur-2xl border border-[var(--border-main)]/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-40 overflow-hidden animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-200 p-1.5 space-y-0.5">
                                                    {QUICK_ACTIONS?.map(action => {
                                                        const isSelected = action.id === selectedAction;
                                                        return (
                                                            <button
                                                                key={action.id}
                                                                onClick={() => {
                                                                    handleActionChange(action.id);
                                                                    setShowActionDropdown(false);
                                                                }}
                                                                className={`w-full text-left px-3 py-2 text-xs transition-all flex items-center gap-2.5 rounded-xl border border-transparent ${
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
                                placeholder="Escribe tu mensaje... (Enter para enviar o '/' para comandos)"
                                className="flex-1 bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-40 focus:outline-none resize-none py-1.5 max-h-32 scrollbar-hide leading-relaxed"
                                rows={1}
                                disabled={isLoading}
                            />
                        )}

                        {/* Redactar Escena shortcut button */}
                        {selectedAction === 'escena' && (
                            <button
                                onClick={() => {
                                    const prompt = "Escribe la escena ahora de acuerdo a lo planificado.";
                                    onSend(prompt);
                                }}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-[9px] font-black uppercase tracking-widest text-sky-500 hover:bg-sky-500/20 transition-all shrink-0 hover:scale-[1.03] active:scale-95 disabled:opacity-40"
                                title="Generar la prosa de la escena planificada"
                            >
                                <Sparkles size={11} className="text-sky-500" />
                                <span className="hidden xs:inline">Redactar Escena</span>
                            </button>
                        )}


                        {/* Send / Stop button */}
                        <button
                            onClick={isLoading ? onCancelStream : handleSend}
                            disabled={!isLoading && !inputValue.trim() && selectedAction !== 'escena'}
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

            {/* Conversation Settings Modal */}
            <Modal
                isOpen={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
                title="Ajustes de Conversación"
                size="md"
            >
                <div className="p-6 space-y-6 font-sans">
                    {/* Rename Field */}
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

                    {/* Stats Summary */}
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

                    {/* Danger Zone */}
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

        </div>
    );
};

export default IAStudioChat;
