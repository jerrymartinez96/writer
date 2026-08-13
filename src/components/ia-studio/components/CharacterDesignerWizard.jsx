import React, { useState, useEffect } from 'react';
import { 
    Users, ArrowLeft, Loader2, Check, AlertTriangle, 
    Scissors, Plus, ChevronRight, Sparkles, MessageSquare 
} from 'lucide-react';
import { useData } from '../../../context/DataContext';
import { AIService } from '../../../services/AIService';
import CharacterAlignmentWizard from '../CharacterAlignmentWizard';
import { 
    FOCUSES, 
    extractJSON, 
    buildMultiCharacterDetectionPrompt,
    buildRefineSuggestionsPrompt,
    buildNameProposalsPrompt, 
    buildCharacterSuggestionsPrompt, 
    buildChatQuestionsPrompt, 
    buildAnswerSuggestionsPrompt, 
    buildSynthesisPrompt 
} from '../CharacterChatPrompts';

const CharacterDesignerWizard = ({
    selectedModel,
    activeBook,
    worldItems,
    characters,
    onExit
}) => {
    const { profile, createCharacter, updateCharacter, deleteCharacter } = useData();

    const [charFlow, setCharFlow] = useState(null);
    const [isAlignmentWizardOpen, setIsAlignmentWizardOpen] = useState(false);
    const [separatingDocId, setSeparatingDocId] = useState(null);
    const [nameSuggestionLoading, setNameSuggestionLoading] = useState(false);
    const [nameProposals, setNameProposals] = useState([]);
    const [, setQuestionsLoading] = useState(false);
    const [suggestionsLoading, setSuggestionsLoading] = useState({});
    const [answerSuggestions, setAnswerSuggestions] = useState({});
    const [selectedFocus, setSelectedFocus] = useState('general');
    const [addedSuggestions, setAddedSuggestions] = useState({});
    const [customNameInput, setCustomNameInput] = useState('');
    const [customIdeaInput, setCustomIdeaInput] = useState('');
    const [charAnswerInput, setCharAnswerInput] = useState('');
    const [refineAspectInput, setRefineAspectInput] = useState('');
    const [refineSuggestions, setRefineSuggestions] = useState([]);
    const [refineSuggestionsLoading, setRefineSuggestionsLoading] = useState(false);
    const [loadingTime, setLoadingTime] = useState(0);

    const apiSelected = 'deepseek';
    const modelSelected = selectedModel;

    useEffect(() => {
        let interval = null;
        const isLoadingStep = charFlow?.step === 'detecting' || 
                              charFlow?.step === 'detecting_groups' || 
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
            const docContent = characters.map(c => `👤 PERSONAJE: ${c.name}\n${(c.description || '').replace(/<[^>]*>/g, ' ')}`).join('\n\n');
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
            const docContent = characters.map(c => `👤 PERSONAJE: ${c.name}\n${(c.description || '').replace(/<[^>]*>/g, ' ')}`).join('\n\n');
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

    const saveToDocument = async () => {
        try {
            const isRefining = charFlow.mode === 'refine';

            if (isRefining) {
                const targetCharId = charFlow.selectedCharacter?.id;
                if (targetCharId) {
                    await updateCharacter(targetCharId, { description: charFlow.generatedProfile });
                } else {
                    throw new Error("Missing character ID for refinement");
                }
            } else {
                await createCharacter({
                    name: charFlow.characterName,
                    role: '',
                    description: charFlow.generatedProfile,
                    images: [],
                    parentId: null,
                    isCategory: false
                });
            }
            
            setCharFlow(prev => ({ ...prev, step: 'success' }));
            
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: isRefining ? '¡Ficha de personaje refinada y guardada con éxito!' : '¡Nuevo personaje creado y guardado en tu tablero!', type: 'success' }
            }));
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al guardar los cambios en el personaje.', type: 'error' }
            }));
        }
    };

    const startRefineFlow = () => {
        const list = characters.map(c => ({
            id: c.id,
            nombre: c.name,
            fragment_exacto: c.description || ''
        }));
        
        setCharFlow({
            mode: 'refine',
            step: 'select',
            detectedCharacters: list,
            selectedCharacter: null,
            questions: [],
            currentQuestionIndex: 0,
            answers: [],
            loading: false
        });
    };

    const startDetectionFlow = async () => {
        const apiKey = getLocalApiKey();
        if (!apiKey) {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Por favor, configura tu API Key en Ajustes antes de continuar.', type: 'error' }
            }));
            return;
        }

        setCharFlow({
            mode: 'refine',
            step: 'detecting_groups',
            detectedCharacters: [],
            selectedCharacter: null,
            questions: [],
            currentQuestionIndex: 0,
            answers: [],
            loading: true,
            groupedDocs: []
        });

        try {
            const docsToAnalyze = characters.map(c => ({
                id: c.id,
                title: c.name,
                content: c.description || ''
            }));

            if (docsToAnalyze.length === 0) {
                window.dispatchEvent(new CustomEvent('ia-toast', {
                    detail: { message: 'No hay fichas de personajes creadas para analizar.', type: 'warning' }
                }));
                setCharFlow(null);
                return;
            }

            const prompt = buildMultiCharacterDetectionPrompt(docsToAnalyze);
            const response = await AIService.sendMessage(prompt, apiKey, { model: modelSelected, apiSelected: apiSelected });
            const parsed = extractJSON(response) || {};

            const detectedCharsList = (parsed.characters || []).map(c => ({
                id: c.sourceDocId,
                nombre: c.name,
                fragment_exacto: c.description || ''
            }));

            const groupedDocsList = parsed.groupedDocuments || [];

            if (groupedDocsList.length > 0) {
                setCharFlow({
                    mode: 'refine',
                    step: 'review_groups',
                    detectedCharacters: detectedCharsList,
                    selectedCharacter: null,
                    questions: [],
                    currentQuestionIndex: 0,
                    answers: [],
                    loading: false,
                    groupedDocs: groupedDocsList,
                    allParsedCharacters: parsed.characters || []
                });
            } else {
                setCharFlow({
                    mode: 'refine',
                    step: 'no_groups_success',
                    detectedCharacters: [],
                    selectedCharacter: null,
                    questions: [],
                    currentQuestionIndex: 0,
                    answers: [],
                    loading: false,
                    groupedDocs: [],
                    analyzedCount: docsToAnalyze.length
                });
            }
        } catch (e) {
            console.error("Error detecting groups:", e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al escanear los documentos de personajes.', type: 'error' }
            }));
            setCharFlow(null);
        }
    };

    // Reserved for the grouped-character detection entry point.
    void startDetectionFlow;

    const handleSeparateCharacters = async (group) => {
        setSeparatingDocId(group.docId);
        try {
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Separando personajes en fichas individuales...', type: 'info' }
            }));
            
            const groupChars = charFlow.allParsedCharacters.filter(c => c.sourceDocId === group.docId);
            
            for (const charItem of groupChars) {
                await createCharacter({
                    name: charItem.name,
                    role: '',
                    description: charItem.description,
                    images: [],
                    parentId: null,
                    isCategory: false
                });
            }

            await deleteCharacter(group.docId);

            const remainingGroups = charFlow.groupedDocs.filter(g => g.docId !== group.docId);
            
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: `¡Personajes del documento "${group.docTitle}" separados correctamente!`, type: 'success' }
            }));

            if (remainingGroups.length === 0) {
                setTimeout(() => {
                    setSeparatingDocId(null);
                    setCharFlow(null);
                }, 1000);
            } else {
                setSeparatingDocId(null);
                setCharFlow(prev => ({
                    ...prev,
                    groupedDocs: remainingGroups
                }));
            }
        } catch (e) {
            console.error(e);
            setSeparatingDocId(null);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al separar los personajes.', type: 'error' }
            }));
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
            const docContent = characters.map(c => `👤 PERSONAJE: ${c.name}\n${(c.description || '').replace(/<[^>]*>/g, ' ')}`).join('\n\n');
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
        }
    };

    const addSuggestedCharacter = async (sugg) => {
        try {
            const desc = `<p><strong>Rol Dramático:</strong> ${sugg.rol}</p><p>${sugg.concepto}</p>`;
            await createCharacter({
                name: sugg.nombre,
                role: sugg.rol,
                description: desc,
                images: [],
                parentId: null,
                isCategory: false
            });

            setAddedSuggestions(prev => ({ ...prev, [sugg.nombre]: true }));
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: `¡${sugg.nombre} añadido al tablero de personajes!`, type: 'success' }
            }));
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('ia-toast', {
                detail: { message: 'Error al añadir el personaje sugerido.', type: 'error' }
            }));
        }
    };

    const renderCharFlow = () => {
        if (charFlow === null) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-8 bg-gradient-to-tr from-indigo-950/5 via-blue-950/5 to-transparent border border-[var(--border-main)] rounded-3xl shadow-sm animate-in zoom-in-95 duration-300 my-4 font-sans">
                    <div className="flex w-full justify-between items-center mb-6">
                        <button
                            onClick={onExit}
                            className="px-3 py-1.5 border border-[var(--border-main)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] rounded-lg font-black uppercase tracking-widest transition-all cursor-pointer"
                        >
                            ← Volver al Chat
                        </button>
                    </div>
                    <h3 className="text-2xl font-black font-serif italic text-[var(--text-main)] mb-3">Diseñador de Personajes IA</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-lg mb-8 leading-relaxed">
                        Crea, refina y descubre el elenco de tu novela de forma completamente conversacional e interactiva, guardando los resultados directamente en tu documento central de personajes.
                    </p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
                        <button
                            onClick={() => startCreateFlow()}
                            className="group p-5 bg-[var(--bg-editor)]/40 hover:bg-blue-500/[0.03] border border-[var(--border-main)] hover:border-blue-500/40 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] text-left h-36 shadow-sm flex flex-col justify-between"
                        >
                            <div>
                                <h4 className="font-bold text-sm text-[var(--text-main)] mb-1">Crear Personaje</h4>
                                <p className="text-[10px] text-[var(--text-muted)] leading-normal">Diseña un nuevo integrante desde cero con preguntas psicológicas guiadas.</p>
                            </div>
                        </button>

                        <button
                            onClick={() => startRefineFlow()}
                            className="group p-5 bg-[var(--bg-editor)]/40 hover:bg-indigo-500/[0.03] border border-[var(--border-main)] hover:border-indigo-500/40 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] text-left h-36 shadow-sm flex flex-col justify-between"
                        >
                            <div>
                                <h4 className="font-bold text-sm text-[var(--text-main)] mb-1">Refinar Existente</h4>
                                <p className="text-[10px] text-[var(--text-muted)] leading-normal">Elige directamente de tu tablero el personaje que deseas profundizar al instante.</p>
                            </div>
                        </button>

                        <button
                            onClick={() => setIsAlignmentWizardOpen(true)}
                            className="group p-5 bg-[var(--bg-editor)]/40 hover:bg-purple-500/[0.03] border border-[var(--border-main)] hover:border-purple-500/40 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] text-left h-36 shadow-sm flex flex-col justify-between"
                        >
                            <div>
                                <h4 className="font-bold text-sm text-[var(--text-main)] mb-1">Sincronizar Lore</h4>
                                <p className="text-[10px] text-[var(--text-muted)] leading-normal">Ajusta detalles a varios personajes en lote y mantén al día la información general.</p>
                            </div>
                        </button>

                        <button
                            onClick={() => startSuggestFlow()}
                            className="group p-5 bg-[var(--bg-editor)]/40 hover:bg-orange-500/[0.03] border border-[var(--border-main)] hover:border-orange-500/40 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] text-left h-36 shadow-sm flex flex-col justify-between"
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

        if (charFlow.step === 'detecting' || charFlow.step === 'detecting_groups') {
            const formatTime = (secs) => {
                const m = Math.floor(secs / 60);
                const s = secs % 60;
                return `${m}:${s < 10 ? '0' : ''}${s}`;
            };

            return (
                <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-8 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in fade-in duration-300 font-sans">
                    <Loader2 size={40} className="text-indigo-500 animate-spin mb-6" />
                    <h3 className="text-lg font-bold text-[var(--text-main)] mb-2 font-serif italic">
                        {charFlow.step === 'detecting_groups' ? 'Analizando integridad de personajes...' : 'Analizando documento...'}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed mb-5">
                        {charFlow.step === 'detecting_groups' 
                            ? 'La IA está escaneando tus documentos y el Master Doc para verificar si hay varios personajes agrupados en un solo archivo.' 
                            : 'La IA está escaneando tu documento de personajes de forma semántica en busca de perfiles existentes.'}
                    </p>
                    
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/[0.06] border border-indigo-500/15 rounded-full text-[11px] font-mono text-indigo-500 font-bold shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        <span>Tiempo transcurrido: {formatTime(loadingTime)}</span>
                    </div>
                </div>
            );
        }

        if (charFlow.step === 'review_groups') {
            return (
                <div className="flex flex-col min-h-[420px] p-6 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans">
                    <div className="flex items-center gap-3 mb-5">
                        <button 
                            onClick={() => setCharFlow(null)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-soft)] text-[var(--text-muted)]"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div>
                            <h3 className="text-lg font-black font-serif italic text-[var(--text-main)]">Personajes Agrupados</h3>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Integridad y organización del lore</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-left">
                        <div className="p-4 bg-indigo-500/[0.03] border border-indigo-500/15 rounded-2xl flex gap-3">
                            <AlertTriangle size={20} className="text-indigo-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <h4 className="text-xs font-bold text-[var(--text-main)]">¿Por qué separar los personajes?</h4>
                                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                                    Para que la IA de IA Studio pueda detectar de forma inteligente las **relaciones automáticas** e inyectar el contexto de cada personaje de forma precisa, te recomendamos tener **una ficha independiente por personaje**.
                                </p>
                            </div>
                        </div>

                        <p className="text-[11px] font-black uppercase tracking-wider text-[var(--text-muted)]">Documentos agrupados detectados:</p>

                        <div className="space-y-2.5">
                            {charFlow.groupedDocs?.map((group, idx) => (
                                <div key={idx} className="p-4 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:border-[var(--border-main)]/95 shadow-sm">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                            <span className="font-bold text-xs text-[var(--text-main)] truncate">{group.docTitle}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-3.5">
                                            <span className="text-[9px] text-[var(--text-muted)]">Contiene a:</span>
                                            {group.characterNames?.map((name, i) => (
                                                <span key={i} className="text-[9px] bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-medium">
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleSeparateCharacters(group)}
                                        disabled={separatingDocId !== null}
                                        className="sm:self-auto self-stretch flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-indigo-500/10 active:scale-95 shrink-0 disabled:opacity-50"
                                    >
                                        {separatingDocId === group.docId ? (
                                            <>
                                                <Loader2 size={11} className="animate-spin" /> Separando...
                                            </>
                                        ) : (
                                            <>
                                                <Scissors size={11} /> Separar Fichas
                                            </>
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-[var(--border-main)]/50 pt-4 mt-4 flex items-center justify-between gap-3 shrink-0">
                        <button
                            onClick={() => setCharFlow(null)}
                            className="px-5 py-2.5 border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95"
                        >
                            Cancelar
                        </button>
                        
                        <button
                            onClick={() => {
                                const list = characters.map(c => ({
                                    id: c.id,
                                    nombre: c.name,
                                    fragment_exacto: c.description || ''
                                }));
                                setCharFlow(prev => ({ ...prev, step: 'select', detectedCharacters: list }));
                            }}
                            className="px-5 py-2.5 bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]/80 text-[var(--text-main)] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95"
                        >
                            Continuar de todos modos →
                        </button>
                    </div>
                </div>
            );
        }

        if (charFlow.step === 'no_groups_success') {
            return (
                <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-8 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans">
                    <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-5 border border-emerald-500/15">
                        <Check size={22} strokeWidth={3} />
                    </div>
                    <h3 className="text-lg font-bold text-[var(--text-main)] mb-2 font-serif italic">¡Fichas perfectamente organizadas!</h3>
                    <p className="text-xs text-[var(--text-muted)] max-w-sm leading-relaxed mb-6">
                        La IA ha analizado todos tus documentos de personajes de manera exhaustiva y **no ha detectado perfiles agrupados** en un mismo archivo. Cada personaje cuenta con su propia ficha individual, garantizando el máximo rendimiento del sistema relacional.
                    </p>
                    
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/[0.06] border border-emerald-500/15 rounded-full text-[11px] font-mono text-emerald-500 font-bold shadow-sm mb-8">
                        <span>Fichas analizadas: {charFlow.analyzedCount || 0}</span>
                    </div>

                    <button
                        onClick={() => setCharFlow(null)}
                        className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-indigo-500/10 active:scale-95"
                    >
                        Volver al Diseñador
                    </button>
                </div>
            );
        }

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

        if (charFlow.step === 'interview_questions') {
            const qIdx = charFlow.currentQuestionIndex;
            const question = charFlow.questions[qIdx];
            const hasSuggestions = answerSuggestions[qIdx] && answerSuggestions[qIdx].length > 0;
            const suggestionsList = answerSuggestions[qIdx] || [];
            const isSugLoading = suggestionsLoading[qIdx] || false;

            return (
                <div className="flex flex-col min-h-[420px] p-6 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-200 font-sans text-left justify-between">
                    <div className="space-y-5">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                            <span>{FOCUSES[selectedFocus]?.label}</span>
                            <span className="bg-indigo-500/10 text-indigo-400 px-2.5 py-0.5 rounded-full">Pregunta {qIdx + 1} de {charFlow.questions.length}</span>
                        </div>

                        <div className="p-4 bg-gradient-to-tr from-indigo-950/10 via-[var(--bg-app)] to-transparent border border-[var(--border-main)] rounded-2xl relative overflow-hidden shadow-inner">
                            <div className="absolute top-0 right-0 p-3 opacity-10">
                                <MessageSquare size={48} className="text-indigo-500" />
                            </div>
                            <h4 className="font-serif italic text-sm md:text-base font-bold text-[var(--text-main)] leading-relaxed relative z-10">
                                "{question}"
                            </h4>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Sugerencias del Co-piloto</span>
                                {!hasSuggestions && !isSugLoading && (
                                    <button
                                        onClick={() => getAnswerSuggestions(qIdx)}
                                        className="text-[9px] font-bold text-indigo-400 hover:text-indigo-500 uppercase tracking-wider flex items-center gap-1 shrink-0 cursor-pointer"
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
                                            className="w-full text-left p-2.5 bg-[var(--bg-app)]/60 hover:bg-indigo-500/[0.03] hover:border-indigo-500/30 border border-[var(--border-main)] rounded-xl text-[10px] text-[var(--text-main)] leading-relaxed transition-all active:scale-[0.99] cursor-pointer"
                                        >
                                            {sugg}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

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
                                className="px-5 py-3 border border-[var(--border-main)] hover:bg-[var(--accent-soft)] text-[var(--text-muted)] font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
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

        if (charFlow.step === 'preview') {
            const isRefine = charFlow.mode === 'refine';
            return (
                <div className="flex flex-col min-h-[420px] p-6 bg-[var(--bg-editor)]/35 border border-[var(--border-main)] rounded-3xl animate-in zoom-in-95 duration-300 font-sans text-left justify-between">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                            <span>SÍNTESIS FINAL COMPLETA</span>
                            <span className="text-indigo-400 font-bold">{charFlow.characterName}</span>
                        </div>

                        <div 
                            className="flex-1 overflow-y-auto max-h-[260px] p-4 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl text-xs text-[var(--text-main)] space-y-3 leading-relaxed scrollbar-hide border-l-4 border-l-indigo-500 shadow-inner font-sans"
                            dangerouslySetInnerHTML={{ __html: charFlow.generatedProfile }}
                        />
                    </div>

                    <div className="flex gap-2 mt-6">
                        <button
                            onClick={() => setCharFlow(null)}
                            className="px-5 py-3.5 border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-500 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                        >
                            Descartar
                        </button>
                        <button
                            onClick={saveToDocument}
                            className="flex-1 py-3.5 bg-gradient-to-tr from-emerald-600 to-teal-600 hover:shadow-lg hover:shadow-emerald-500/10 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                        >
                            <Check size={14} strokeWidth={3} />
                            {isRefine ? 'Guardar Cambios' : 'Guardar en Documento'}
                        </button>
                    </div>
                </div>
            );
        }

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
                        className="px-8 py-3.5 bg-[var(--bg-app)] border border-[var(--border-main)] hover:border-indigo-500/50 text-[var(--text-main)] hover:text-indigo-400 font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                        Volver al Panel Principal
                    </button>
                </div>
            );
        }

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
                        className="mt-6 w-full py-3 border border-[var(--border-main)] hover:bg-[var(--accent-soft)] text-[var(--text-muted)] font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                        Volver al Panel
                    </button>
                </div>
            );
        }

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
        <div className="w-full">
            {renderCharFlow()}
            <CharacterAlignmentWizard 
                isOpen={isAlignmentWizardOpen} 
                onClose={() => setIsAlignmentWizardOpen(false)} 
            />
        </div>
    );
};

export default CharacterDesignerWizard;
