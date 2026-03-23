import { useState, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import AIService from '../services/AIService';
import { 
    Sparkles, Copy, CheckCircle2, ChevronDown, CheckSquare, Square, 
    Edit3, ShieldCheck, Database, MessageSquare, BookOpen, 
    UserCheck, Zap, AlertCircle, FileJson, FolderDown, Upload, Clipboard,
    FilePlus, Maximize2, Type
} from 'lucide-react';

// New Modular Components
import IALiveMode from './ia-studio/LiveMode/IALiveMode';
import ContextConfigModal from './ia-studio/Modals/ContextConfigModal';
import ChapterSelectionModal from './ia-studio/Modals/ChapterSelectionModal';
import { cleanText, computeEstructuraLabels, computeChapterLabels, generateComprehensiveWorldContext } from './ia-studio/IAStudioUtils';



const IAStudioView = () => {
    const { 
        activeBook, updateBookData,
        chapters, characters, worldItems, promptStudioPreload, setPromptStudioPreload, 
        profile, updateChapter, createCharacter, createWorldItem,
        updateCharacter, updateWorldItem, deleteCharacter, deleteWorldItem,
        updateProfile, createChapter: createChapterContext, createWorldItem: createWorldItemContext
    } = useData();
    const toast = useToast();

    // Core States
    const [mainTab, setMainTab] = useState('manual'); // 'manual' or 'live'
    const [activeTab, setActiveTab] = useState('writing'); // 'writing', 'refine', 'master_refine', 'review'
    const [liveTab, setLiveTab] = useState('refine');
    const [selectedChapterId, setSelectedChapterId] = useState('');
    const [selectedRefineChapterId, setSelectedRefineChapterId] = useState('');
    const [selectedReviewChapterId, setSelectedReviewChapterId] = useState('');
    const [liveSelectedChapterId, setLiveSelectedChapterId] = useState('');
    const [reviewStartId, setReviewStartId] = useState('');
    const [reviewEndId, setReviewEndId] = useState('');
    const [sceneGoals, setSceneGoals] = useState('');
    const [promptNotes, setPromptNotes] = useState('');
    const [promptWeight, setPromptWeight] = useState(0);
    const [selectedCharacters, setSelectedCharacters] = useState([]);
    const [copied, setCopied] = useState(false);
    const [isPostCopyView, setIsPostCopyView] = useState(false);
    const [isContextModalOpen, setIsContextModalOpen] = useState(false);
    const [isChapterModalOpen, setIsChapterModalOpen] = useState(false);
    const [importJson, setImportJson] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [generationLength, setGenerationLength] = useState('medium'); // 'short', 'medium', 'long'
    const [generationMode, setGenerationMode] = useState('create'); // 'create', 'expand'

    // Filter states
    const [includeCharacters, setIncludeCharacters] = useState(true);
    const [includeNotasGenerales, setIncludeNotasGenerales] = useState(true);
    const [includeEstructura, setIncludeEstructura] = useState(true);
    const [includeAutorNotes, setIncludeAutorNotes] = useState(true);
    const [includeContinuityCheck, setIncludeContinuityCheck] = useState(true);
    const [reviewSelectionType, setReviewSelectionType] = useState('single');
    const [includedSections, setIncludedSections] = useState({});

    const estLabels = computeEstructuraLabels(worldItems);
    const chapLabels = computeChapterLabels(chapters);

    const effectiveAISettings = useMemo(() => ({
        openRouterKey: activeBook?.aiSettings?.openRouterKey || '',
        googleApiKey: activeBook?.aiSettings?.googleApiKey || '',
        selectedAiModel: activeBook?.aiSettings?.selectedAiModel || 'google/gemini-2.0-flash-exp:free'
    }), [activeBook?.aiSettings]);

    // Effects
    useEffect(() => {
        setIncludedSections(prev => {
            const newState = { ...prev };
            worldItems.forEach(i => {
                if (newState[i.id] === undefined) newState[i.id] = true;
            });
            return newState;
        });
    }, [worldItems]);

    useEffect(() => {
        if (promptStudioPreload) {
            if (promptStudioPreload.tab) {
                setActiveTab(promptStudioPreload.tab);
                setMainTab('manual');
            }
            if (promptStudioPreload.chapterId) setSelectedRefineChapterId(promptStudioPreload.chapterId);
            if (promptStudioPreload.instructions) setPromptNotes(promptStudioPreload.instructions);
            setIncludeAutorNotes(true);
            setIsPostCopyView(false);
            setPromptStudioPreload(null);
        }
    }, [promptStudioPreload]);

    useEffect(() => {
        let total = 0;
        if (activeTab === 'writing') total = generatePrompt().length;
        else if (activeTab === 'review') total = generateReviewPrompt().length;
        else if (activeTab === 'refine') total = generateRefinePrompt().length;
        else if (activeTab === 'master_refine') total = generateMasterRefinePrompt().length;
        setPromptWeight(total);
    }, [
        activeTab, selectedChapterId, selectedRefineChapterId, selectedReviewChapterId,
        reviewStartId, reviewEndId,
        promptNotes, sceneGoals, includeCharacters, includeNotasGenerales,
        includeEstructura, includeAutorNotes, includeContinuityCheck, includedSections,
        chapters, worldItems, characters, selectedCharacters
    ]);

    // Handlers
    const toggleSection = (id) => setIncludedSections(prev => ({ ...prev, [id]: !prev[id] }));
    const toggleCharacter = (id) => setSelectedCharacters(prev => prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]);

    const handleCopy = () => {
        let prompt = '';
        if (activeTab === 'writing') prompt = generatePrompt();
        else if (activeTab === 'review') prompt = generateReviewPrompt();
        else if (activeTab === 'refine') prompt = generateRefinePrompt();
        else if (activeTab === 'master_refine') prompt = generateMasterRefinePrompt();

        navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        setIsPostCopyView(true);
    };

    const handleCopyImportPrompt = () => {
        const prompt = `Actúa como un arquitecto de historias profesional. Genera la estructura de UN SOLO VOLUMEN con sus capítulos en formato JSON.
El formato DEBE ser estrictamente el siguiente:
{
  "volume_title": "Título del Volumen",
  "chapters": [
    {
      "title": "Título del Capítulo 1",
      "content": "Contenido inicial que se usará tanto para el Master Doc como para el Manuscrito"
    }
  ]
}
Responde únicamente con el bloque JSON, sin texto adicional.`;
        navigator.clipboard.writeText(prompt);
        toast.success("Prompt de formato copiado al portapapeles");
    };

    const handleImportVolumeStructured = async () => {
        if (!importJson.trim()) {
            toast.error("Pega el JSON de la estructura primero.");
            return;
        }

        setIsImporting(true);
        try {
            const data = JSON.parse(importJson);
            if (!data.volume_title || !Array.isArray(data.chapters)) {
                throw new Error("Formato JSON inválido. Debe contener 'volume_title' y un array 'chapters'.");
            }

            // 1. Create in Master Doc (World Items)
            const masterVolume = await createWorldItemContext({
                title: data.volume_title,
                isCategory: true,
                parentId: 'system_estructura'
            });

            // 2. Create in Manuscript (Chapters)
            const manuscriptVolume = await createChapterContext({
                title: data.volume_title,
                isVolume: true
            });

            // 3. Create chapters in both places
            for (const chap of data.chapters) {
                // Master Doc Chapter
                await createWorldItemContext({
                    title: chap.title,
                    content: chap.content || '',
                    parentId: masterVolume.id,
                    isCategory: false
                });

                // Manuscript Chapter
                await createChapterContext({
                    title: chap.title,
                    content: chap.content || '',
                    parentId: manuscriptVolume.id,
                    isVolume: false
                });
            }

            toast.success(`Volumen "${data.volume_title}" y ${data.chapters.length} capítulos importados con éxito.`);
            setImportJson('');
            setActiveTab('generation');
        } catch (error) {
            console.error("Import error:", error);
            toast.error(error.message || "Error al procesar el JSON. Verifica el formato.");
        } finally {
            setIsImporting(false);
        }
    };

    const generatePrompt = () => {
        const targetChapter = worldItems.find(c => String(c.id) === String(selectedChapterId)) || 
                             chapters.find(c => String(c.id) === String(selectedChapterId));
        
        let chapterHeading = "";
        let chapterInstruction = "";
        let primaryObjective = "";

        if (generationMode === 'create') {
            if (targetChapter) {
                let volumeContext = "";
                if (targetChapter.parentId && targetChapter.parentId !== 'system_estructura') {
                    const vol = worldItems.find(v => String(v.id) === String(targetChapter.parentId));
                    if (vol) volumeContext = ` (Perteneciente al Volumen: ${vol.title})`;
                }
                const fullLabel = `${estLabels[targetChapter.id] || ''}${targetChapter.title}`;
                chapterHeading = `ESCRIBIR NUEVO CAPÍTULO: ${fullLabel}`;
                primaryObjective = `TU OBJETIVO ESCRUTADO: Escribir desde cero el contenido narrativo de "${fullLabel}"${volumeContext}.`;
                chapterInstruction = `Utiliza la información del <master_document> (específicamente cualquier resumen o nota en la estructura para este capítulo) para desarrollar una escena completa y profesional.`;
            } else {
                chapterHeading = "CREAR NUEVA ESCENA O CAPÍTULO (SIN TÍTULO)";
                primaryObjective = "TU OBJETIVO ESCRUTADO: Iniciar una nueva escena o capítulo de la historia de forma creativa.";
                chapterInstruction = "Mantén la coherencia con el mundo establecido en el <master_document> y sigue las instrucciones adicionales proporcionadas.";
            }
        } else {
            // Expansion mode
            const fullLabel = targetChapter ? `${estLabels[targetChapter.id] || ''}${targetChapter.title}` : 'Capítulo Seleccionado';
            chapterHeading = `EXPANDIR CAPÍTULO EXISTENTE: ${fullLabel}`;
            primaryObjective = `TU OBJETIVO ESCRUTADO: Tomar el contenido actual de "${fullLabel}" y EXPANDIRLO significativamente.`;
            chapterInstruction = `No te limites a resumir; añade profundidad psicológica, descripciones sensoriales vívidas, diálogs enriquecidos y expande las acciones. Eleva la prosa manteniendo la esencia original.\n\nContenido base para expandir:\n${targetChapter?.content || 'Selecciona un capítulo con contenido para expandir.'}`;
        }

        const lengthTxt = generationLength === 'short' ? '800 a 1000 palabras (Relato ágil)' : generationLength === 'medium' ? '1000 a 1500 palabras (Narrativa estándar)' : '1500 a 2000 palabras (Capítulo denso/épico)';
        const lengthPrompt = `LONGITUD OBJETIVO: ${lengthTxt}.`;

        const masterDocText = generateFullMasterDocContext();
        const systemPersona = "Actúa como un escritor y editor literario profesional de bestsellers. Tu objetivo es ayudar al autor a elevar la calidad de su obra, manteniendo la coherencia perfecta con el mundo, la trama y los personajes establecidos. Escribe con un estilo fluido, evocador y profesional.";

        return `${systemPersona}

# ${chapterHeading}
${lengthPrompt}

${primaryObjective}

${chapterInstruction}

<master_document>
==== CONTEXTO INTEGRAL DEL PROYECTO (BIBLIA, PERSONAJES Y ESTRUCTURA) ====
${masterDocText}
</master_document>

<directrices_especificas_del_autor>
OBJETIVOS DE LA ESCENA: ${sceneGoals || 'Desarrollar la trama según la lógica del Master Doc.'}
NOTAS ADICIONALES: ${promptNotes || 'Sin notas adicionales.'}
</directrices_especificas_del_autor>

Escribe la narración literaria completa a continuación de forma ininterrumpida:`;
    };

    const generateReviewPrompt = () => {
        const targetChapter = chapters?.find(c => String(c.id) === String(selectedReviewChapterId));
        const masterDocText = generateFullMasterDocContext();
        
        let chaptersText = "";
        const flatChapters = (chapters || []).filter(c => !c.isVolume);
        let selectionTitle = "Carga General de Capítulos";

        if (reviewStartId && reviewEndId) {
            const startIndex = flatChapters.findIndex(c => String(c.id) === String(reviewStartId));
            const endIndex = flatChapters.findIndex(c => String(c.id) === String(reviewEndId));
            const range = flatChapters.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);
            chaptersText = range.map(c => `--- [INICIO CAPÍTULO: ${c.title}] ---\n${cleanText(c.content)}\n--- [FIN CAPÍTULO: ${c.title}] ---`).join('\n\n');
            selectionTitle = `RANGO: ${flatChapters[startIndex]?.title || ''} HASTA ${flatChapters[endIndex]?.title || ''}`;
        } else if (targetChapter) {
            chaptersText = `--- [REVISAR] ${targetChapter.title} ---\n${cleanText(targetChapter.content)}`;
            selectionTitle = `CAPÍTULO: ${targetChapter.title}`;
        }

        const systemPersona = "Actúa como un Detective de Continuidad y Editor Literario Senior. Tu misión es garantizar la coherencia absoluta y la excelencia narrativa del proyecto.";

        return `${systemPersona}

# AUDITORÍA DE COHERENCIA Y CALIDAD LITERARIA
OBJETIVO: ${selectionTitle}

Tu misión es realizar una autopsia literaria del texto buscando:
1. **Contradicciones con el Lore:** Lugares, reglas del mundo o eventos pasados que colisionen con el <master_document>.
2. **Psicología de Personajes:** Acciones o diálogos que traicionen la esencia definida en <personajes_relevantes>.
3. **Continuidad Espacio-Temporal:** Errores de cronología, clima, o ubicación física de elementos.
4. **Potencial de Prosa:** Ritmo, redundancias y fuerza dramática.

<master_document>
==== BIBLIA, PERSONAJES Y ESTRUCTURA DEL MUNDO ====
${masterDocText}
</master_document>

<texto_del_manuscrito_para_analizar>
${chaptersText || 'No hay texto seleccionado para revisar. Proporciona un análisis general basado en el Master Doc si es posible.'}
</texto_del_manuscrito_para_analizar>

<instrucciones_especificas_del_autor>
${promptNotes || 'Realiza un análisis profundo, crítico y constructivo.'}
</instrucciones_especificas_del_autor>

Genera un informe detallado con puntos de mejora claros:`;
    };

    const generateRefinePrompt = () => {
        const targetChapter = chapters?.find(c => String(c.id) === String(selectedRefineChapterId));
        const masterDocText = generateFullMasterDocContext();
        const systemPersona = "Actúa como un editor literario de élite especializado en bestsellers. Tu objetivo es elevar la prosa a su máximo exponente artístico y comercial.";

        return `${systemPersona}

# PULIDO Y REFINAMIENTO ESTILÍSTICO
TARGET: ${targetChapter?.title || 'Texto Seleccionado'}

Tu misión es transformar el texto original en una pieza de alta calidad literaria, optimizando la fluidez, el impacto emocional y la precisión del lenguaje, sin comprometer la voz del autor.

<master_document_contexto>
${masterDocText}
</master_document_contexto>

<texto_original_a_perfeccionar>
${cleanText(targetChapter?.content) || 'Sin contenido para refinar.'}
</texto_original_a_perfeccionar>

<instrucciones_de_estilo_del_autor>
${promptNotes || 'Mejora la calidad literaria, elimina redundancias y potencia las imágenes sensoriales.'}
</instrucciones_de_style_del_autor>

Reescribe el texto completo a continuación, entregando únicamente la versión final refinada:`;
    };

    const generateMasterRefinePrompt = () => {
        const masterDocText = generateFullMasterDocContext();
        const systemPersona = "Actúa como un arquitecto de mundos (World Architect) y consultor de narrativa estratégica. Tu misión es fortalecer los cimientos de la historia.";

        return `${systemPersona}

# EVOLUCIÓN DEL MASTER DOC (BIBLIA DEL PROYECTO)

Tu objetivo es analizar la estructura y el lore actual del proyecto para proponer mejoras, expansiones lógicas o correcciones de inconsistencias.

<master_document_actual>
${masterDocText}
</master_document_actual>

<directrices_de_expansion_del_autor>
${promptNotes || 'Analiza el contenido actual y sugiere formas de dar más profundidad al mundo y a la trama.'}
</directrices_de_expansion_del_autor>

Proporciona tus propuestas estratégicas para robustecer la Biblia del proyecto:`;
    };

    const generateFullMasterDocContext = () => {
        return generateComprehensiveWorldContext(worldItems, includedSections, { 
            includeEstructura, 
            includeNotasGenerales,
            includeCharacters
        }, characters, selectedCharacters);
    };

    const weightStatus = useMemo(() => {
        const modelData = AIService.MODELS.find(m => m.id === effectiveAISettings.selectedAiModel) || AIService.MODELS[0];
        const modelLimit = modelData?.context_length || 128000;
        const percent = Math.min((promptWeight / modelLimit) * 100, 100);
        
        if (percent < 25) return { label: 'Óptimo', color: 'text-emerald-500', bg: 'bg-emerald-500', percent };
        if (percent < 75) return { label: 'Estable', color: 'text-indigo-500', bg: 'bg-indigo-500', percent };
        return { label: 'Pesado', color: 'text-red-500', bg: 'bg-red-500', percent };
    }, [promptWeight, effectiveAISettings.selectedAiModel]);

    return (
        <div className="w-full h-full flex flex-col bg-[var(--bg-editor)] overflow-hidden">
            {/* Header */}
            <div className="flex-none p-6 md:p-10 border-b border-[var(--border-main)] bg-[var(--bg-app)]/50">
                <div className="max-w-4xl mx-auto">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                        <div>
                            <h1 className="text-3xl md:text-5xl font-black font-serif text-[var(--accent-main)] tracking-tight mb-2">IA Studio</h1>
                            <p className="text-[var(--text-muted)] mt-2 font-medium">Refina, analiza y gestiona tu mundo con potencia IA.</p>
                        </div>

                        <div className="flex bg-[var(--bg-editor)] p-1.5 rounded-2xl border border-[var(--border-main)] shadow-inner ring-1 ring-black/5">
                            <button
                                onClick={() => setMainTab('manual')}
                                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mainTab === 'manual' ? 'bg-[var(--accent-main)] text-white shadow-lg' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]'}`}
                            >
                                <Database size={14} className="inline mr-2" />
                                Modo Manual
                            </button>
                            <button
                                onClick={() => setMainTab('live')}
                                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mainTab === 'live' ? 'bg-indigo-600 text-white shadow-lg' : 'text-[var(--text-muted)] hover:bg-indigo-500/10 hover:text-indigo-500'}`}
                            >
                                <Sparkles size={14} className="inline mr-2" />
                                IA Live
                            </button>
                        </div>
                    </div>

                    {mainTab === 'manual' && (
                        <div className="flex bg-[var(--bg-editor)]/50 p-1 rounded-xl border border-[var(--border-main)] shrink-0 shadow-sm overflow-x-auto scrollbar-hide w-full md:w-max animate-in fade-in slide-in-from-top-2 duration-300">
                            {['writing', 'refine', 'master_refine', 'review', 'import'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shrink-0 ${activeTab === tab ? 'bg-[var(--accent-main)] text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-[var(--bg-app)]'}`}
                                >
                                    {tab === 'writing' ? 'Escritura' : tab === 'refine' ? 'Refinar' : tab === 'master_refine' ? 'Biblia' : tab === 'review' ? 'Revisar' : 'Importar'}
                                </button>
                            ))}
                        </div>
                    )}

                    {mainTab === 'live' && (
                        <div className="flex bg-[var(--bg-editor)]/50 p-1 rounded-xl border border-[var(--border-main)] shrink-0 shadow-sm overflow-x-auto scrollbar-hide w-full md:w-max animate-in fade-in slide-in-from-top-2 duration-300">
                             {['writing', 'refine', 'coherence', 'extraction', 'import'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setLiveTab(tab)}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shrink-0 ${liveTab === tab ? 'bg-indigo-600 text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-indigo-500/10'}`}
                                >
                                    {tab === 'writing' ? 'Escritura' : tab === 'refine' ? 'Refinado' : tab === 'coherence' ? 'Coherencia' : tab === 'extraction' ? 'Extractor' : tab === 'import' ? 'Importer' : ''}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10 scrollbar-hide">
                <div className="max-w-4xl mx-auto">
                    {mainTab === 'live' ? (
                        <IALiveMode 
                            activeBook={activeBook}
                            updateBookData={updateBookData}
                            chapters={chapters}
                            characters={characters}
                            worldItems={worldItems}
                            liveTab={liveTab}
                            setLiveTab={setLiveTab}
                            updateChapter={updateChapter}
                            createCharacter={createCharacter}
                            updateCharacter={updateCharacter}
                            deleteCharacter={deleteCharacter}
                            createWorldItem={createWorldItem}
                            updateWorldItem={updateWorldItem}
                            deleteWorldItem={deleteWorldItem}
                            setIsChapterModalOpen={setIsChapterModalOpen}
                            liveSelectedChapterId={liveSelectedChapterId}
                            setLiveSelectedChapterId={setLiveSelectedChapterId}
                            setReviewSelectionType={setReviewSelectionType}
                            generationLength={generationLength}
                            setGenerationLength={setGenerationLength}
                            generationMode={generationMode}
                            setGenerationMode={setGenerationMode}
                            sceneGoals={sceneGoals}
                            setSceneGoals={setSceneGoals}
                            promptNotes={promptNotes}
                            setPromptNotes={setPromptNotes}
                            setIsContextModalOpen={setIsContextModalOpen}
                            masterDocContext={generateFullMasterDocContext()}
                            includeCharacters={includeCharacters}
                            selectedCharacters={selectedCharacters}
                        />
                    ) : (
                        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
                            {activeTab === 'import' ? (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-8 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)] mb-1">Importación de Estructura</h4>
                                            <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">Importa un volumen completo con sus capítulos tanto al Master Doc como al Manuscrito usando JSON.</p>
                                        </div>
                                        <button 
                                            onClick={handleCopyImportPrompt}
                                            className="p-8 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl text-left hover:bg-indigo-500/10 transition-all group flex flex-col justify-center"
                                        >
                                            <div className="flex items-center gap-2 text-indigo-500 mb-1">
                                                <Clipboard size={16} />
                                                <h4 className="text-[10px] font-black uppercase tracking-widest">Preparar Formato</h4>
                                            </div>
                                            <p className="font-bold text-lg font-serif">Copiar Prompt de Formato</p>
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold font-serif text-[var(--text-main)] italic flex items-center gap-2">
                                            <FileJson size={20} className="text-[var(--accent-main)]" />
                                            Estructura en JSON
                                        </h3>
                                        <div className="relative group">
                                            <textarea 
                                                value={importJson}
                                                onChange={e => setImportJson(e.target.value)}
                                                className="w-full h-64 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl p-8 font-mono text-sm outline-none focus:ring-2 ring-[var(--accent-main)]/20 transition-all shadow-inner scrollbar-hide"
                                                placeholder='{ "volume_title": "...", "chapters": [...] }'
                                            />
                                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="px-3 py-1 bg-[var(--accent-soft)] text-[var(--accent-main)] text-[10px] font-black rounded-full border border-[var(--accent-main)]/20">JSON MODE</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-8 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-sm">
                                        <button 
                                            onClick={handleImportVolumeStructured}
                                            disabled={isImporting || !importJson.trim()}
                                            className="w-full py-6 bg-gradient-to-r from-[var(--accent-main)] to-indigo-600 text-white font-black text-xl rounded-2xl shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
                                        >
                                            {isImporting ? <AlertCircle className="animate-spin" size={24} /> : <FolderDown size={24} />}
                                            {isImporting ? 'IMPORTANDO...' : 'IMPORTAR VOLUMEN AHORA'}
                                        </button>
                                        <p className="text-[10px] text-center text-[var(--text-muted)] mt-4 uppercase tracking-[0.2em] font-black">Se creará en Estructura (Master Doc) y Manuscrito</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {activeTab === 'writing' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="p-8 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl space-y-4">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)]">Modo de Escritura</h4>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button 
                                                        onClick={() => setGenerationMode('create')}
                                                        className={`py-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${generationMode === 'create' ? 'bg-[var(--accent-main)] text-white border-[var(--accent-main)] shadow-lg' : 'bg-[var(--bg-editor)] text-[var(--text-muted)] border-[var(--border-main)] hover:border-[var(--accent-main)]'}`}
                                                    >
                                                        <FilePlus size={14} />
                                                        Crear Nuevo
                                                    </button>
                                                    <button 
                                                        onClick={() => setGenerationMode('expand')}
                                                        className={`py-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${generationMode === 'expand' ? 'bg-[var(--accent-main)] text-white border-[var(--accent-main)] shadow-lg' : 'bg-[var(--bg-editor)] text-[var(--text-muted)] border-[var(--border-main)] hover:border-[var(--accent-main)]'}`}
                                                    >
                                                        <Maximize2 size={14} />
                                                        Expandir
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="p-8 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl space-y-4">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Extensión del Capítulo</h4>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {[
                                                        { id: 'short', label: '800-1000', desc: 'Corto' },
                                                        { id: 'medium', label: '1000-1500', desc: 'Medio' },
                                                        { id: 'long', label: '1500-2000', desc: 'Largo' }
                                                    ].map(opt => (
                                                        <button 
                                                            key={opt.id}
                                                            onClick={() => setGenerationLength(opt.id)}
                                                            className={`py-3 rounded-xl border flex flex-col items-center gap-0.5 transition-all ${generationLength === opt.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-[var(--bg-editor)] text-[var(--text-muted)] border-[var(--border-main)] hover:border-indigo-500'}`}
                                                        >
                                                            <span className="text-[10px] font-black">{opt.label}</span>
                                                            <span className="text-[8px] uppercase tracking-tighter opacity-70">{opt.desc}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <button onClick={() => setIsChapterModalOpen(true)} className="p-8 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl text-left hover:border-[var(--accent-main)] transition-all group">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)] mb-1">
                                                {activeTab === 'writing' && generationMode === 'expand' ? 'Capítulo a Expandir' : 'Capítulo Objetivo'}
                                            </h4>
                                            <p className="font-bold text-lg font-serif">
                                                {activeTab === 'writing' 
                                                    ? (selectedChapterId ? (worldItems.find(c => String(c.id) === String(selectedChapterId))?.title || chapters.find(c => String(c.id) === String(selectedChapterId))?.title) : 'Seleccionar...')
                                                    : activeTab === 'refine'
                                                        ? (selectedRefineChapterId ? chapters.find(c => String(c.id) === String(selectedRefineChapterId))?.title : 'Seleccionar...')
                                                        : (selectedReviewChapterId ? chapters.find(c => String(c.id) === String(selectedReviewChapterId))?.title : 'Carga General')}
                                            </p>
                                        </button>
                                        <button onClick={() => setIsContextModalOpen(true)} className="p-8 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl text-left hover:border-[var(--accent-main)] transition-all">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1">Contexto de Biblia</h4>
                                            <p className="font-bold text-lg font-serif">Configurar Master Doc</p>
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold font-serif text-[var(--text-main)] italic flex items-center gap-2">
                                            <MessageSquare size={20} className="text-[var(--accent-main)]" />
                                            Instrucciones para Gemini
                                        </h3>
                                        <textarea 
                                            value={promptNotes}
                                            onChange={e => setPromptNotes(e.target.value)}
                                            className="w-full h-48 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl p-8 text-lg font-serif outline-none focus:ring-2 ring-[var(--accent-main)]/20 transition-all shadow-inner"
                                            placeholder="Escribe aquí lo que quieres que Gemini haga... (Ej: 'Escribe una escena de acción intensa', 'Busca errores de ritmo', etc.)"
                                        />
                                    </div>

                                    <div className="p-8 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl space-y-6 shadow-sm">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Zap size={18} className={weightStatus.color} />
                                                <span className={`text-sm font-black uppercase tracking-widest ${weightStatus.color}`}>Peso del Prompt: {weightStatus.label}</span>
                                            </div>
                                            <span className="text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-editor)] px-3 py-1 rounded-full">{promptWeight} chars</span>
                                        </div>
                                        <button onClick={handleCopy} className="w-full py-6 bg-[var(--accent-main)] text-white font-black text-xl rounded-2xl shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-3">
                                            {copied ? <CheckCircle2 size={24} /> : <Copy size={24} />}
                                            {copied ? '¡COPIADO CON ÉXITO!' : 'COPIAR PROMPT MAESTRO'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}

            <ContextConfigModal 
                isOpen={isContextModalOpen}
                onClose={() => setIsContextModalOpen(false)}
                activeTab={activeTab}
                includeCharacters={includeCharacters}
                setIncludeCharacters={setIncludeCharacters}
                characters={characters}
                selectedCharacters={selectedCharacters}
                toggleCharacter={toggleCharacter}
                setSelectedCharacters={setSelectedCharacters}
                includeNotasGenerales={includeNotasGenerales}
                setIncludeNotasGenerales={setIncludeNotasGenerales}
                includeEstructura={includeEstructura}
                setIncludeEstructura={setIncludeEstructura}
                includeContinuityCheck={includeContinuityCheck}
                setIncludeContinuityCheck={setIncludeContinuityCheck}
                worldItems={worldItems}
                includedSections={includedSections}
                toggleSection={toggleSection}
            />

            <ChapterSelectionModal 
                isOpen={isChapterModalOpen}
                onClose={() => setIsChapterModalOpen(false)}
                activeTab={activeTab === 'writing' ? 'generation' : activeTab}
                reviewSelectionType={reviewSelectionType}
                chapters={chapters}
                worldItems={worldItems}
                chapLabels={chapLabels}
                estLabels={estLabels}
                selectedChapterId={selectedChapterId}
                setSelectedChapterId={setSelectedChapterId}
                selectedRefineChapterId={selectedRefineChapterId}
                setSelectedRefineChapterId={setSelectedRefineChapterId}
                selectedReviewChapterId={selectedReviewChapterId}
                setSelectedReviewChapterId={setSelectedReviewChapterId}
                reviewStartId={reviewStartId}
                setReviewStartId={setReviewStartId}
                reviewEndId={reviewEndId}
                setReviewEndId={setReviewEndId}
                mainTab={mainTab}
                setLiveSelectedChapterId={setLiveSelectedChapterId}
            />
        </div>
    );
};

export default IAStudioView;
