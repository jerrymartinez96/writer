import { useState, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import AIService from '../services/AIService';
import { 
    Sparkles, Copy, CheckCircle2, ChevronDown, CheckSquare, Square, 
    Edit3, ShieldCheck, Database, MessageSquare, BookOpen, 
    UserCheck, Zap, AlertCircle, FileJson, FolderDown, Upload, Clipboard
} from 'lucide-react';

// New Modular Components
import IALiveMode from './ia-studio/LiveMode/IALiveMode';
import AIPersonalityModal from './ia-studio/Modals/AIPersonalityModal';
import ContextConfigModal from './ia-studio/Modals/ContextConfigModal';
import ChapterSelectionModal from './ia-studio/Modals/ChapterSelectionModal';
import { cleanText, computeEstructuraLabels, computeChapterLabels } from './ia-studio/IAStudioUtils';

const AI_ROLES = [
    {
        id: 'mentor',
        name: 'Mentor Amigable',
        desc: 'Te guía paso a paso, explicando el porqué de cada cambio de forma sencilla y motivadora.',
        prompt: 'Actúa como un mentor literario empático que ayuda a escritores novatos. Tu objetivo es enseñar, no solo corregir. Reglas: 1) Empieza siempre destacando dos cosas que el autor hizo muy bien. 2) Señala de 1 a 3 áreas de mejora, explicando el "porqué" de forma pedagógica y sin tecnicismos. 3) Da un pequeño ejemplo de cómo mejorarlo. 4) Termina con un mensaje motivador. Tono: Cálido, alentador y constructivo.'
    },
    {
        id: 'editor_estricto',
        name: 'Editor Honesto',
        desc: 'Directo al grano. Te dice qué no funciona y cómo arreglarlo sin rodeos ni adornos.',
        prompt: 'Actúa como un editor profesional, estricto y directo de una gran editorial. No tienes tiempo para adornar tus críticas. Reglas: 1) Ve directo al grano. 2) Identifica sin piedad las palabras sobrantes, los clichés y las debilidades. 3) Usa viñetas (bullet points) para listar los errores. 4) Ofrece soluciones prácticas inmediatas o directrices de corte. Tono: Clínico, profesional, severo pero inmensamente útil.'
    },
    {
        id: 'fan_entusiasta',
        name: 'Lector Fan (Lector Beta)',
        desc: 'Reacciona a tu historia con emoción, destacando lo que más le engancha.',
        prompt: 'Actúa como el mayor fan de este género literario y un excelente Lector Beta. Tu tarea es dar la "reacción del lector". Reglas: 1) Resalta qué partes te hicieron sentir emociones (emoción, miedo, risa). 2) Señala exactamente en qué punto no podías dejar de leer (el gancho). 3) Menciona si hubo alguna parte donde te aburriste o te distrajiste levemente. Tono: Emocionado, pasional, usando exclamaciones y reaccionando como un verdadero fanático.'
    },
    {
        id: 'maestro_vocabulario',
        name: 'Maestro del Estilo',
        desc: 'Se enfoca en que tu escritura suene más bella, eliminando repeticiones y adverbios.',
        prompt: 'Actúa como un corrector de estilo obsesionado con la prosa bella y precisa. Reglas: 1) Aplica la regla de "Mostrar, no contar" (Show, don\'t tell). 2) Identifica y sugiere eliminar adverbios terminados en "-mente". 3) Cambia verbos débiles (ser, estar, tener, hacer) por verbos de acción fuertes. 4) Sugiere sinónimos elegantes para palabras repetidas. Proporciona una tabla o lista de "Cambia esto -> Por esto". Tono: Culto, sofisticado y meticuloso.'
    },
    {
        id: 'experto_emociones',
        name: 'Psicólogo de Personajes',
        desc: 'Te ayuda a que los personajes sientan y transmitan emociones reales y profundas.',
        prompt: 'Actúa como un psicólogo experto en comportamiento humano y desarrollo de personajes. Reglas: 1) Analiza si las reacciones emocionales del personaje son creíbles según su contexto. 2) Ayuda a traducir los sentimientos en respuestas físicas y lenguaje corporal, en lugar de solo nombrar la emoción (ej. en lugar de "estaba triste", sugiere "se le formó un nudo en la garganta"). 3) Evalúa el monólogo interno. Tono: Analítico, empático y profundo.'
    },
    {
        id: 'arquitecto_visual',
        name: 'Director de Arte',
        desc: 'Ayuda a que tus descripciones se "vean" como una película en la mente usando los 5 sentidos.',
        prompt: 'Actúa como un director de cine and director de arte. Tu misión es la inmersión visual y sensorial. Reglas: 1) Evalúa si la escena tiene un anclaje físico claro (¿sabemos dónde están los personajes?). 2) Sugiere detalles para estimular al menos 3 de los 5 sentidos (vista, oído, olfato, tacto, gusto). 3) Ayuda a usar la iluminación, el clima y el entorno para reflejar el tono de la escena (falacia patética). Tono: Evocador, visual y artístico.'
    },
    {
        id: 'pulidor_dialogos',
        name: 'Mago de los Diálogos',
        desc: 'Hace que tus personajes hablen de forma natural, diferenciando sus voces y añadiendo subtexto.',
        prompt: 'Actúa como un guionista experto en diálogos. Reglas: 1) Elimina los diálogos "de exposición" (donde los personajes dicen cosas que ya saben solo para informar al lector). 2) Introduce "subtexto": lo que los personajes piensan pero no dicen. 3) Diferencia las voces: asegúrate de que no todos suenen igual. 4) Sugiere eliminar acotaciones innecesarias ("dijo él", "respondió ella") si la acción ya deja claro quién habla. Tono: Dinámico, teatral y astuto.'
    },
    {
        id: 'cazador_logica',
        name: 'Detective de Continuidad',
        desc: 'Busca huecos en la trama, cosas que no tienen sentido o contradicciones.',
        prompt: 'Actúa como un detective de historias implacable. Tu trabajo es encontrar agujeros de guion (plot holes). Reglas: 1) Cuestiona las motivaciones de los personajes: ¿por qué hacen esto si sería más fácil hacer lo otro? 2) Busca errores de continuidad física (ej. un personaje sostiene un vaso y en el siguiente párrafo tiene las manos en los bolsillos). 3) Señala información que el lector necesita y que el autor olvidó incluir. Tono: Curioso, lógico e inquisitivo.'
    },
    {
        id: 'fantasma',
        name: 'Escritor Invisible',
        desc: 'Toma tu texto y lo reescribe completamente con un estilo fluido de autor publicado.',
        prompt: 'Actúa como un "escritor fantasma" (ghostwriter) veterano de bestsellers. Tu tarea no es dar consejos, sino REESCRIBIR. Reglas: 1) Toma el texto proporcionado y reescríbelo por completo. 2) Mejora el ritmo, la prosa, el vocabulario y el flujo narrativo. 3) Mantén la idea original y la voz del autor en la medida de lo posible, pero elévala a calidad de publicación profesional. Entregable: Solo el texto reescrito, sin comentarios extra.'
    },
    {
        id: 'companero_lluvia',
        name: 'Socio de Ideas',
        desc: 'Te da sugerencias creativas, giros inesperados y opciones sobre hacia dónde ir.',
        prompt: 'Actúa como un compañero de lluvia de ideas (brainstorming). Reglas: 1) No corrijas gramática ni estilo. 2) Haz la pregunta mágica: "¿Qué pasaría si...?". 3) Ofrece al menos 3 giros argumentales o ideas creativas basadas en el texto actual. 4) Sugiere un obstáculo nuevo para el protagonista en esta escena. Tono: Entusiasta, imaginativo y muy colaborativo.'
    },
    {
        id: 'simplificador',
        name: 'Maestro de la Claridad',
        desc: 'Te ayuda a limpiar textos enrevesados para que sean ágiles y fáciles de entender.',
        prompt: 'Actúa como un editor especializado en claridad y concisión. Reglas: 1) Identifica oraciones demasiado largas o laberínticas y divídelas. 2) Elimina la "paja" (palabras de relleno que no aportan significado). 3) Aclara cualquier párrafo donde la acción o la idea principal se pierda. Devuelve el texto simplificado mostrando el antes y el después. Tono: Minimalista, claro y eficiente.'
    },
    {
        id: 'mago_ritmo',
        name: 'Mago del Ritmo',
        desc: 'Equilibra el ritmo (pacing) alternando oraciones largas, cortas, acción y pausa.',
        prompt: 'Actúa como un experto en ritmo narrativo (pacing). Reglas: 1) Analiza la longitud de las oraciones: sugiere usar oraciones cortas para la acción/tensión, y largas para la introspección/descripción. 2) Indica si la escena avanza demasiado rápido sin dar respiro al lector, o si se estanca en detalles innecesarios. 3) Asegúrate de que haya un equilibrio correcto entre Escena (acción) y Secuela (reacción del personaje). Tono: Musical, rítmico y estructurado.'
    },
    {
        id: 'arquitecto_estructura',
        name: 'Arquitecto de Estructura',
        desc: 'Se aleja para ver el panorama general: arcos de personajes, incidentes incitadores y clímax.',
        prompt: 'Actúa como un analista de estructura narrativa (Story Grid / Save the Cat). Reglas: 1) Evalúa el propósito de la escena: ¿cambia la polaridad (de positivo a negativo o viceversa)? Si la escena no cambia nada, sugiere cómo hacer que avance la trama. 2) Analiza qué está en juego (stakes) para el protagonista en este fragmento. 3) Comprueba si el fragmento respeta el arco general del personaje. Tono: Analítico, macro-orientado y estratégico.'
    },
    {
        id: 'constructor_mundos',
        name: 'Creador de Mundos',
        desc: 'Ideal para Fantasía, Sci-Fi o Histórica. Asegura que tu mundo se sienta real y coherente.',
        prompt: 'Actúa como un experto en Worldbuilding. Reglas: 1) Analiza cómo las reglas del mundo (magia, tecnología, sociedad, política, época histórica) afectan la escena actual. 2) Señala oportunidades para tejer información del mundo (lore) de forma natural en la narración sin recurrir al "info-dumping" (vertido de información masivo). 3) Cuestiona las incongruencias en las reglas de tu universo. Tono: Erudito, detallista y fascinado por los universos ficticios.'
    }
];

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
    const [activeTab, setActiveTab] = useState('generation'); // 'generation', 'refine', 'master_refine', 'review'
    const [liveTab, setLiveTab] = useState('refine');
    const [aiRoles, setAiRoles] = useState(['mentor']);
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
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [isContextModalOpen, setIsContextModalOpen] = useState(false);
    const [isChapterModalOpen, setIsChapterModalOpen] = useState(false);
    const [importJson, setImportJson] = useState('');
    const [isImporting, setIsImporting] = useState(false);

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
            if (promptStudioPreload.tab) setActiveTab(promptStudioPreload.tab);
            if (promptStudioPreload.chapterId) setSelectedRefineChapterId(promptStudioPreload.chapterId);
            if (promptStudioPreload.instructions) setPromptNotes(promptStudioPreload.instructions);
            setIncludeAutorNotes(true);
            setIsPostCopyView(false);
            setPromptStudioPreload(null);
        }
    }, [promptStudioPreload]);

    useEffect(() => {
        let total = 0;
        if (activeTab === 'generation') total = generatePrompt().length;
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
        if (activeTab === 'generation') prompt = generatePrompt();
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

    // Prompt Generators
    const generatePrompt = () => {
        const targetChapter = worldItems.find(c => c.id === selectedChapterId);
        let chapterContext = "Por favor continúa la historia desde donde se quedó. Si es el primer capítulo, iníciala.";

        if (targetChapter) {
            let volumeContext = "";
            if (targetChapter.parentId && targetChapter.parentId !== 'system_estructura') {
                const vol = worldItems.find(c => c.id === targetChapter.parentId);
                if (vol) volumeContext = ` (Parte de: ${estLabels[vol.id] || ''}${vol.title})`;
            }
            chapterContext = `Volumen/Ubicación: ${estLabels[targetChapter.id] || ''}${targetChapter.title}${volumeContext}. Escribe el contenido narrativo completo enfocado a este capítulo basándote en la información que está en el documento maestro (master_document).`;
        }

        const filteredChars = selectedCharacters.length > 0 ? characters.filter(c => selectedCharacters.includes(c.id)) : characters;
        const charactersXml = (includeCharacters && filteredChars.length > 0) ? filteredChars.map(c => `Nombre: ${c.name}\nRol: ${c.role || 'No especificado'}\nDescripción: ${cleanText(c.description)}`).join('\n') : "Sin personajes.";

        const masterDocText = generateFullMasterDocContext();
        const selectedRolesData = AI_ROLES.filter(r => aiRoles.includes(r.id));
        const combinedPrompt = selectedRolesData.length > 0 ? selectedRolesData.map(r => r.prompt).join(' ') : AI_ROLES[0].prompt;

        return `${combinedPrompt}\n<master_document>\n${masterDocText}\n</master_document>\n<personajes>\n${charactersXml}\n</personajes>\n<contexto>\n${chapterContext}\nObjetivos: ${sceneGoals}\nNotas: ${promptNotes}\n</contexto>`;
    };

    const generateReviewPrompt = () => {
        const targetChapter = chapters?.find(c => c.id === selectedReviewChapterId);
        const charactersXml = (includeCharacters && characters.length > 0) ? characters.map(c => `Nombre: ${c.name}\nRol: ${c.role || ''}`).join('\n') : "Sin personajes.";
        const masterDocText = generateFullMasterDocContext();
        
        let chaptersText = "";
        const flatChapters = (chapters || []).filter(c => !c.isVolume);
        if (reviewStartId && reviewEndId) {
            const startIndex = flatChapters.findIndex(c => c.id === reviewStartId);
            const endIndex = flatChapters.findIndex(c => c.id === reviewEndId);
            const range = flatChapters.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);
            chaptersText = range.map(c => `--- [CAPÍTULO: ${c.title}] ---\n${cleanText(c.content)}`).join('\n\n');
        } else if (targetChapter) {
            chaptersText = `--- [REVISAR] ${targetChapter.title} ---\n${cleanText(targetChapter.content)}`;
        }

        return `Analiza coherencia y continuidad.\n<master_document>\n${masterDocText}\n</master_document>\n<personajes>\n${charactersXml}\n</personajes>\n<capitulos>\n${chaptersText}\n</capitulos>\nInstrucciones: ${promptNotes}`;
    };

    const generateRefinePrompt = () => {
        const targetChapter = chapters?.find(c => c.id === selectedRefineChapterId);
        const masterDocText = generateFullMasterDocContext();
        return `Refina el siguiente texto.\n<master_document>\n${masterDocText}\n</master_document>\n<texto>\n${cleanText(targetChapter?.content)}\n</texto>\nInstrucciones: ${promptNotes}`;
    };

    const generateMasterRefinePrompt = () => {
        const masterDocText = generateFullMasterDocContext();
        return `Mejora mi Master Doc.\n<master_document>\n${masterDocText}\n</master_document>\nInstrucciones: ${promptNotes}`;
    };

    const generateFullMasterDocContext = () => {
        const includedDynamicSections = worldItems.filter(sec => sec.parentId === null && includedSections[sec.id]);
        return includedDynamicSections.map(sec => `${sec.title}: ${cleanText(sec.content)}`).join('\n');
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
                            {['generation', 'refine', 'master_refine', 'review', 'import'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shrink-0 ${activeTab === tab ? 'bg-[var(--accent-main)] text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-[var(--bg-app)]'}`}
                                >
                                    {tab === 'generation' ? 'Escribir' : tab === 'refine' ? 'Refinar' : tab === 'master_refine' ? 'Biblia' : tab === 'review' ? 'Revisar' : 'Importar'}
                                </button>
                            ))}
                        </div>
                    )}

                    {mainTab === 'live' && (
                        <div className="flex bg-[var(--bg-editor)]/50 p-1 rounded-xl border border-[var(--border-main)] shrink-0 shadow-sm overflow-x-auto scrollbar-hide w-full md:w-max animate-in fade-in slide-in-from-top-2 duration-300">
                             {['refine', 'coherence', 'extraction', 'import'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setLiveTab(tab)}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shrink-0 ${liveTab === tab ? 'bg-indigo-600 text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-indigo-500/10'}`}
                                >
                                    {tab === 'refine' ? 'Refinado' : tab === 'coherence' ? 'Coherencia' : tab === 'extraction' ? 'Extractor' : tab === 'import' ? 'Importer' : ''}
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
                            profile={profile}
                            updateProfile={updateProfile}
                            chapters={chapters}
                            characters={characters}
                            worldItems={worldItems}
                            aiRoles={aiRoles}
                            AI_ROLES={AI_ROLES}
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
                            setIsRoleModalOpen={setIsRoleModalOpen}
                            liveSelectedChapterId={liveSelectedChapterId}
                            setLiveSelectedChapterId={setLiveSelectedChapterId}
                            setReviewSelectionType={setReviewSelectionType}
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
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <button onClick={() => setIsChapterModalOpen(true)} className="p-8 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl text-left hover:border-[var(--accent-main)] transition-all group">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)] mb-1">Capítulo Objetivo</h4>
                                            <p className="font-bold text-lg font-serif">
                                                {activeTab === 'generation' 
                                                    ? (selectedChapterId ? worldItems.find(c => c.id === selectedChapterId)?.title : 'Autogeneración Libre')
                                                    : activeTab === 'refine'
                                                        ? (selectedRefineChapterId ? chapters.find(c => c.id === selectedRefineChapterId)?.title : 'Seleccionar...')
                                                        : (selectedReviewChapterId ? chapters.find(c => c.id === selectedReviewChapterId)?.title : 'Carga General')}
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
            <AIPersonalityModal 
                isOpen={isRoleModalOpen} 
                onClose={() => setIsRoleModalOpen(false)}
                aiRoles={aiRoles}
                setAiRoles={setAiRoles}
                AI_ROLES={AI_ROLES}
            />

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
                activeTab={activeTab}
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
