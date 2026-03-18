import { useState, useEffect, useMemo } from 'react';
import { 
    Sparkles, Edit3, ChevronDown, CheckCircle2, MessageSquare, 
    BookOpen, UserCheck, Zap, Database, ArrowUpCircle, 
    RefreshCw, Loader2, ArrowLeftRight, Trash2, Wand2, X, AlertCircle,
    FilePlus, Maximize2, Hash, ChevronRight, ShieldCheck
} from 'lucide-react';
import { cleanText, computeEstructuraLabels, generateComprehensiveWorldContext } from '../IAStudioUtils';
import AIService from '../../../services/AIService';
import { useToast } from '../../Toast';

const IALiveMode = ({ 
    activeBook,
    updateBookData,
    chapters, 
    characters, 
    worldItems, 
    liveTab, 
    setLiveTab,
    createCharacter, 
    updateCharacter,
    deleteCharacter,
    createWorldItem,
    updateWorldItem,
    deleteWorldItem,
    updateChapter, 
    setIsChapterModalOpen,
    liveSelectedChapterId,
    setLiveSelectedChapterId,
    setReviewSelectionType,
    generationLength,
    setGenerationLength,
    generationMode,
    setGenerationMode,
    sceneGoals,
    setSceneGoals,
    promptNotes,
    setPromptNotes,
    setIsContextModalOpen,
    masterDocContext,
    includeCharacters = true,
    selectedCharacters = []
}) => {
    const toast = useToast();
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [liveResponse, setLiveResponse] = useState('');
    const [liveOriginalText, setLiveOriginalText] = useState('');
    const [liveInstructions, setLiveInstructions] = useState('');
    const [showLiveComparison, setShowLiveComparison] = useState(false);
    const [coherenceAnalysis, setCoherenceAnalysis] = useState('');
    const [extractedEntities, setExtractedEntities] = useState([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [importText, setImportText] = useState('');
    const [importResults, setImportResults] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [promptWeight, setPromptWeight] = useState(0);
    const [availableModels, setAvailableModels] = useState(AIService.MODELS);

    const effectiveAISettings = useMemo(() => ({
        openRouterKey: activeBook?.aiSettings?.openRouterKey || '',
        googleApiKey: activeBook?.aiSettings?.googleApiKey || '',
        selectedAiModel: activeBook?.aiSettings?.selectedAiModel || 'google/gemini-2.0-flash-exp:free'
    }), [activeBook?.aiSettings]);

    useEffect(() => {
        const fetchModels = async () => {
            const models = await AIService.getFreeModels();
            setAvailableModels(models);
        };
        fetchModels();
    }, []);

    const estLabels = computeEstructuraLabels(worldItems);

    const generateMasterDocJSON = () => {
        // Helper para obtener items de forma recursiva
        const getItemsRecursive = (parentId) => {
            return worldItems
                .filter(i => i.parentId === parentId)
                .map(i => ({
                    id: i.id,
                    title: i.title,
                    content: i.content,
                    isCategory: i.isCategory,
                    items: i.isCategory ? getItemsRecursive(i.id) : undefined
                }));
        };

        // Personajes
        const chars = characters.map(c => ({
            id: c.id,
            name: c.name,
            description: c.description
        }));

        // Mundo con Jerarquía Completa
        const worldHierarchy = [
            ...getItemsRecursive(null),
            { id: 'system_estructura', title: 'Estructura y Volúmenes', isCategory: true, items: getItemsRecursive('system_estructura') },
            { id: 'system_notas', title: 'Notas Generales', isCategory: true, items: getItemsRecursive('system_notas') }
        ];

        return JSON.stringify({ 
            characters: chars, 
            world: worldHierarchy 
        }, null, 2);
    };

    // Efecto para calcular el peso del contexto estimado (Fase 6)
    useEffect(() => {
        let total = 0;
        if (liveTab === 'import') {
            total += (importText || '').length;
            total += generateMasterDocJSON().length;
        } else if (liveTab === 'refine' || liveTab === 'coherence' || liveTab === 'extraction') {
            const chap = chapters.find(c => c.id === liveSelectedChapterId);
            total += (chap?.content || '').length;
            total += (liveInstructions || '').length;
            total += generateBibliaContextForLive().length;
        } else if (liveTab === 'writing') {
            total += (promptNotes || '').length;
            total += (sceneGoals || '').length;
            total += generateBibliaContextForLive().length;
        }
        setPromptWeight(total);
    }, [importText, liveInstructions, liveSelectedChapterId, worldItems, characters, liveTab]);

    const weightStatus = useMemo(() => {
        const currentModel = availableModels.find(m => m.id === effectiveAISettings.selectedAiModel) || availableModels[0];
        const modelLimit = currentModel?.context_length || 128000;
        const percent = Math.min((promptWeight / modelLimit) * 100, 100);
        
        if (percent < 25) return { label: 'Óptimo', color: 'text-emerald-500', bg: 'bg-emerald-500', percent, limit: modelLimit };
        if (percent < 75) return { label: 'Estable', color: 'text-indigo-500', bg: 'bg-indigo-500', percent, limit: modelLimit };
        return { label: 'Pesado', color: 'text-red-500', bg: 'bg-red-500', percent, limit: modelLimit };
    }, [promptWeight, effectiveAISettings.selectedAiModel, availableModels]);

    const generateBibliaContextForLive = () => {
        const charactersXml = (includeCharacters && characters.length > 0) 
            ? characters.map(c => `Nombre: ${c.name}\nRol: ${c.role || 'No especificado'}\nDescripción: ${cleanText(c.description)}`).join('\n---\n') 
            : "No se han proporcionado fichas de personajes.";
        
        const worldXml = generateComprehensiveWorldContext(worldItems, {}, { 
            includeEstructura: true, 
            includeNotasGenerales: true 
        });

        return `
<master_document>
${worldXml}
</master_document>

<personajes_relevantes>
${charactersXml}
</personajes_relevantes>
        `.trim();
    };

    const handleLiveRefine = async () => {
        const { openRouterKey, googleApiKey, selectedAiModel } = effectiveAISettings;

        if (!openRouterKey && !selectedAiModel?.startsWith('google_direct/')) {
            toast.error("Configura tu API Key de OpenRouter en Ajustes.");
            return;
        }
        if (selectedAiModel?.startsWith('google_direct/') && !googleApiKey) {
            toast.error("Configura tu API Key de Google en Ajustes.");
            return;
        }

        if (!liveSelectedChapterId) {
            toast.error("Selecciona un capítulo.");
            return;
        }

        const targetChapter = chapters?.find(c => c.id === liveSelectedChapterId);
        if (!targetChapter) return;

        setIsAnalyzing(true);
        setLiveOriginalText(cleanText(targetChapter.content) || '');

        try {
            const bibliaContext = generateBibliaContextForLive();
            const systemPersona = "Actúa como un escritor y editor literario profesional de bestsellers. Tu objetivo es ayudar al autor a elevar la calidad de su obra, manteniendo la coherencia perfecta con el mundo, la trama y los personajes establecidos. Escribe con un estilo fluido, evocador y profesional.";

            const prompt = `${systemPersona}

# REFINAR TEXTO: ${targetChapter.title}

Tu objetivo es refinar el texto proporcionado, elevando su calidad literaria, ritmo y profundidad, siguiendo estrictamente las instrucciones del autor.

${bibliaContext}

<instrucciones_especificas>
${liveInstructions || 'Mejora la calidad literaria del texto manteniendo el tono original y la coherencia con el Lore.'}
</instrucciones_especificas>

<texto_original_para_refinar>
${cleanText(targetChapter.content)}
</texto_original_para_refinar>

Por favor, devuelve el texto REFINADO de forma íntegra. No respondas con nada que no sea el texto literario final.`;

            const response = await AIService.sendMessage(prompt, effectiveAISettings.openRouterKey, { 
                model: effectiveAISettings.selectedAiModel,
                googleApiKey: effectiveAISettings.googleApiKey
            });
            setLiveResponse(response);
            setShowLiveComparison(true);
            toast.success("¡IA ha respondido!");
        } catch (error) {
            console.error("AI Error:", error);
            toast.error("Error al conectar con la IA.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCoherenceAnalysis = async () => {
        const { openRouterKey, googleApiKey, selectedAiModel } = effectiveAISettings;

        if (!openRouterKey && !selectedAiModel?.startsWith('google_direct/')) {
            toast.error("Configura tu API Key en Ajustes.");
            return;
        }
        if (selectedAiModel?.startsWith('google_direct/') && !googleApiKey) {
            toast.error("Configura tu API Key de Google en Ajustes.");
            return;
        }

        if (!liveSelectedChapterId) {
            toast.error("Selecciona un capítulo.");
            return;
        }

        const targetChapter = chapters?.find(c => c.id === liveSelectedChapterId);
        if (!targetChapter) return;

        setIsAnalyzing(true);
        try {
            const bibliaContext = generateBibliaContextForLive();
            const prompt = `Actúa como un Detective de Continuidad y Editor de Coherencia Literaria profesional. 
Tu tarea es analizar el texto del capítulo proporcionado comparándolo con la "Biblia del Proyecto" (Master Doc) en busca de contradicciones, huecos de trama, errores de continuidad o inconsistencias de personajes.

# ANÁLISIS DE COHERENCIA: ${targetChapter.title}

${bibliaContext}

<texto_del_capitulo_a_analizar>
${cleanText(targetChapter.content)}
</texto_del_capitulo_a_analizar>

Por favor, realiza un análisis exhaustivo centrándote en:
1. **Contradicciones con el Lore:** Lugares, reglas del mundo o eventos pasados que no coincidan.
2. **Coherencia de Personajes:** Acciones o diálogos que contradigan la personalidad o historia establecida.
3. **Continuidad Física:** Errores de tiempo, clima o posición de objetos/personajes en la escena.
4. **Huecos de Narrativa:** Información confusa por falta de contexto o lógica.

Formato de respuesta:
Usa Markdown con títulos claros y bullet points. Si no encuentras errores, felicita al autor por su impecable trabajo de continuidad.`;

            const response = await AIService.sendMessage(prompt, effectiveAISettings.openRouterKey, { 
                model: effectiveAISettings.selectedAiModel,
                googleApiKey: effectiveAISettings.googleApiKey
            });
            setCoherenceAnalysis(response);
            toast.success("Análisis de coherencia finalizado.");
        } catch (error) {
            console.error("Coherence Error:", error);
            toast.error("Error al realizar el análisis.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleExtractEntities = async () => {
        const { openRouterKey, googleApiKey, selectedAiModel } = effectiveAISettings;

        if (!openRouterKey && !selectedAiModel?.startsWith('google_direct/')) {
            toast.error("Configura tu API Key en Ajustes.");
            return;
        }
        if (selectedAiModel?.startsWith('google_direct/') && !googleApiKey) {
            toast.error("Configura tu API Key de Google en Ajustes.");
            return;
        }

        if (!liveSelectedChapterId) {
            toast.error("Selecciona un capítulo.");
            return;
        }

        const targetChapter = chapters?.find(c => c.id === liveSelectedChapterId);
        if (!targetChapter) return;

        setIsExtracting(true);
        try {
            const prompt = `Actúa como un Bibliotecario de Mundos y Analista de Narrativa. 
Tu tarea es leer el capítulo proporcionado e identificar personajes, lugares u objetos importantes que MEREZCAN tener una ficha en el Master Doc (Biblia) y que aporten valor al world-building.

# EXTRACCIÓN DE ENTIDADES: ${targetChapter.title}

<texto_del_capitulo>
${cleanText(targetChapter.content)}
</texto_del_capitulo>

Reglas de Extracción:
1. Identifica entidades (Personajes, Lugares, Objetos) que aparezcan o sean mencionados con relevancia.
2. Extrae descripciones detalladas basadas SOLO en el texto proporcionado.
3. Ignorar elementos genéricos o sin importancia narrativa.

RESPUESTA ÚNICAMENTE EN JSON:
{
  "entities": [
    { "name": "Nombre", "type": "Personaje/Lugar/Objeto", "description": "Resumen detallado del elemento..." }
  ]
}
No incluyas explicaciones adicionales fuera del JSON.`;

            const response = await AIService.sendMessage(prompt, effectiveAISettings.openRouterKey, { 
                model: effectiveAISettings.selectedAiModel, 
                temperature: 0.3,
                googleApiKey: effectiveAISettings.googleApiKey
            });
            
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                const data = JSON.parse(jsonMatch ? jsonMatch[0] : response);
                setExtractedEntities(data.entities || []);
                toast.success("Menciones extraídas correctamente.");
            } catch (e) {
                console.error("JSON Parse Error:", response);
                toast.error("La IA no devolvió un formato válido.");
            }
        } catch (error) {
            console.error("Extraction Error:", error);
            toast.error("Error al extraer entidades.");
        } finally {
            setIsExtracting(false);
        }
    };

    const handleCreateExtractedEntity = async (entity) => {
        try {
            if (entity.type === 'Personaje') {
                const exists = characters.find(c => c.name?.toLowerCase() === entity.name?.toLowerCase());
                if (exists) {
                    await updateCharacter(exists.id, { 
                        description: entity.description 
                    });
                    toast.success(`${entity.name} actualizado en Personajes`);
                } else {
                    await createCharacter({
                        name: entity.name,
                        role: 'Extraído automáticamente',
                        description: entity.description,
                        isFavorite: false
                    });
                    toast.success(`${entity.name} creado en Personajes`);
                }
            } else {
                const typeName = entity.type === 'Lugar' ? 'Lugares' : 'Objetos';
                let parentId = null;
                const parentFolder = worldItems.find(i => i.title === typeName && i.isCategory);
                if (parentFolder) parentId = parentFolder.id;

                const exists = worldItems.find(i => i.title?.toLowerCase() === entity.name?.toLowerCase() && i.parentId === parentId);
                
                if (exists) {
                    await updateWorldItem(exists.id, { 
                        content: entity.description 
                    });
                    toast.success(`${entity.name} actualizado en el Master Doc`);
                } else {
                    await createWorldItem({
                        title: entity.name,
                        content: entity.description,
                        parentId: parentId,
                        isCategory: false
                    });
                    toast.success(`${entity.name} creado en el Master Doc`);
                }
            }
            setExtractedEntities(prev => prev.filter(e => e.name !== entity.name));
        } catch (error) {
            toast.error("Error al procesar la entidad.");
        }
    };

    const handleSmartImport = async () => {
        const { openRouterKey, googleApiKey, selectedAiModel } = effectiveAISettings;

        if (!openRouterKey && !selectedAiModel?.startsWith('google_direct/')) {
            toast.error("Configura tu API Key en Ajustes.");
            return;
        }
        if (selectedAiModel?.startsWith('google_direct/') && !googleApiKey) {
            toast.error("Configura tu API Key de Google en Ajustes.");
            return;
        }

        if (!importText.trim()) {
            toast.error("Pega algo de texto para analizar.");
            return;
        }

        setIsImporting(true);
        try {
            const masterDocJSON = generateMasterDocJSON();
            const prompt = `Actúa como un Arquitecto de Información y Curador de Lore profesional.
Tu tarea es analizar el texto bruto proporcionado y proponer cambios precisos (crear, actualizar o eliminar) en el "Master Doc" (Biblia) actual para integrar la nueva información.

# ANÁLISIS DE IMPORTACIÓN INTELIGENTE

<master_doc_actual_jerarquico>
${masterDocJSON}
</master_doc_actual_jerarquico>

<texto_bruto_a_procesar_e_integrar>
${importText}
</texto_bruto_a_procesar_e_integrar>

Instrucciones de Procesamiento:
1. Compara minuciosamente el texto bruto con la estructura actual.
2. Identifica entidades que ya existen para actualizarlas o nuevas para crearlas.
3. Respeta la jerarquía de categorías. Si falta una categoría esencial, propón crearla.
4. Responde ÚNICAMENTE con el siguiente objeto JSON:

{
  "world_changes": [
    {
      "categoryName": "Nombre de Carpeta/Categoría",
      "categoryId": "ID_si_existe",
      "categoryAction": "create|update|none",
      "items": [
        { "id": "ID_si_existe", "title": "...", "content": "Contenido completo integrado", "action": "create|update|delete" }
      ]
    }
  ],
  "character_changes": [
    { "id": "ID_si_existe", "name": "...", "content": "Descripción, rol y detalles", "action": "create|update|delete" }
  ]
}

No incluyas texto explicativo, solo el JSON.`;

            const response = await AIService.sendMessage(prompt, effectiveAISettings.openRouterKey, { 
                model: effectiveAISettings.selectedAiModel, 
                temperature: 0.3,
                googleApiKey: effectiveAISettings.googleApiKey
            });
            
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                const data = JSON.parse(jsonMatch ? jsonMatch[0] : response);
                setImportResults(data);
                toast.success("Análisis jerárquico listo para revisar.");
            } catch (e) {
                console.error("Parse Error:", response);
                toast.error("Error al procesar la respuesta jerárquica.");
            }
        } catch (error) {
            console.error("Import Error:", error);
            toast.error("Error al procesar el texto.");
        } finally {
            setIsImporting(false);
        }
    };

    const handleApplyImportResults = async () => {
        if (!importResults || isImporting) return;
        
        setIsImporting(true);
        try {
            let createdCount = 0;
            let updatedCount = 0;
            let deletedCount = 0;

            // 1. Procesar Personajes
            for (const char of (importResults.character_changes || [])) {
                if (char.action === 'delete') {
                    const targetId = char.id || characters.find(c => c.name?.toLowerCase() === char.name?.toLowerCase())?.id;
                    if (targetId) { await deleteCharacter(targetId); deletedCount++; }
                    continue;
                }

                const exists = char.id ? characters.find(c => c.id === char.id) : characters.find(c => c.name?.toLowerCase() === char.name?.toLowerCase());
                if (exists) {
                    await updateCharacter(exists.id, { description: char.content });
                    updatedCount++;
                } else {
                    await createCharacter({ name: char.name, description: char.content, role: 'Smart Import', isFavorite: false });
                    createdCount++;
                }
            }

            // 2. Procesar Mundo (Jerárquico)
            for (const group of (importResults.world_changes || [])) {
                let parentId = group.categoryId;
                
                // Asegurar categoría
                if (!parentId) {
                    const existingCat = worldItems.find(i => i.isCategory && i.title?.toLowerCase() === group.categoryName?.toLowerCase());
                    if (existingCat) {
                        parentId = existingCat.id;
                    } else if (group.categoryAction !== 'none') {
                        const newCat = await createWorldItem({ title: group.categoryName, isCategory: true, parentId: null });
                        parentId = newCat.id;
                    }
                }

                // Procesar ítems del grupo
                for (const item of (group.items || [])) {
                    if (item.action === 'delete') {
                        const targetId = item.id || worldItems.find(i => i.title?.toLowerCase() === item.title?.toLowerCase() && i.parentId === parentId)?.id;
                        if (targetId) { await deleteWorldItem(targetId); deletedCount++; }
                        continue;
                    }

                    const exists = item.id ? worldItems.find(i => i.id === item.id) : worldItems.find(i => i.title?.toLowerCase() === item.title?.toLowerCase() && i.parentId === parentId);
                    if (exists) {
                        await updateWorldItem(exists.id, { content: item.content });
                        updatedCount++;
                    } else {
                        await createWorldItem({ title: item.title, content: item.content, parentId: parentId, isCategory: false });
                        createdCount++;
                    }
                }
            }

            toast.success(`Importados: ${createdCount}, Actualizados: ${updatedCount}, Eliminados: ${deletedCount}`);
            setImportResults(null);
            setImportText('');
            setLiveTab('refine');
        } catch (error) {
            console.error("Apply Import Error:", error);
            toast.error("Error al aplicar la importación jerárquica.");
        } finally {
            setIsImporting(false);
        }
    };

    const handleLiveGenerate = async () => {
        const { googleApiKey, selectedAiModel, openRouterKey } = effectiveAISettings;
        
        // Gemini only requirement for direct generation
        if (!googleApiKey && selectedAiModel.startsWith('google_direct/')) {
            toast.error("Configura tu API Key de Google (IA Studio) en Ajustes para usar la Generación Directa.");
            return;
        }

        if (!liveSelectedChapterId) {
            toast.error("Selecciona un capítulo objetivo en la Estructura.");
            return;
        }

        setIsAnalyzing(true);
        try {
            const systemPersona = "Actúa como un escritor y editor literario profesional de bestsellers. Tu objetivo es ayudar al autor a elevar la calidad de su obra, manteniendo la coherencia perfecta con el mundo, la trama y los personajes establecidos. Escribe con un estilo fluido, evocador y profesional.";
            const targetChapter = worldItems.find(c => c.id === liveSelectedChapterId) || chapters.find(c => c.id === liveSelectedChapterId);

            let chapterHeading = "";
            let chapterInstruction = "";

            if (generationMode === 'create') {
                if (targetChapter) {
                    let volumeContext = "";
                    if (targetChapter.parentId && targetChapter.parentId !== 'system_estructura') {
                        const vol = worldItems.find(c => c.id === targetChapter.parentId);
                        if (vol) volumeContext = ` [Perteneciente a: ${estLabels[vol.id] || ''}${vol.title}]`;
                    }
                    chapterHeading = `ESCRIBIR CAPÍTULO: ${estLabels[targetChapter.id] || ''}${targetChapter.title}${volumeContext}`;
                    chapterInstruction = `Tu tarea fundamental es escribir el contenido narrativo completo de este capítulo. Utiliza la información proporcionada en el <master_document> (Estructura, Biblia y Notas) para asegurar que cada detalle, personaje y punto de trama encaje perfectamente con la visión del autor.`;
                } else {
                    chapterHeading = "CREAR NUEVA ESCENA O CAPÍTULO";
                    chapterInstruction = "Inicia una nueva escena o capítulo de la historia de forma creativa, manteniendo la coherencia con el mundo establecido.";
                }
            } else {
                // Expansion mode
                chapterHeading = `EXPANDIR CAPÍTULO: ${targetChapter?.title || 'Capítulo Seleccionado'}`;
                chapterInstruction = `Toma el contenido actual y EXPÁNDELO significativamente. No te limites a resumir; añade profundidad psicológica, descripciones sensoriales vívidas, diálogs enriquecidos y expande las acciones. El objetivo es elevar la prosa y la extensión manteniendo la esencia original.\n\nContenido original para expandir:\n${targetChapter?.content || 'Selecciona un capítulo con contenido para expandir.'}`;
            }

            const lengthTxt = generationLength === 'short' ? '800 a 1000 palabras' : generationLength === 'medium' ? '1000 a 1500 palabras' : '1500 a 2000 palabras';
            const lengthPrompt = `LONGITUD OBJETIVO: Aproximadamente ${lengthTxt}.`;

            const filteredChars = selectedCharacters.length > 0 ? characters.filter(c => selectedCharacters.includes(c.id)) : characters;
            const charactersXml = (includeCharacters && filteredChars.length > 0) ? filteredChars.map(c => `Nombre: ${c.name}\nRol: ${c.role || 'No especificado'}\nDescripción: ${cleanText(c.description)}`).join('\n---\n') : "Sin personajes específicos.";

            const prompt = `${systemPersona}

# ${chapterHeading}
${lengthPrompt}

${chapterInstruction}

<master_document>
${masterDocContext}
</master_document>

<personajes_relevantes>
${charactersXml}
</personajes_relevantes>

<instrucciones_adicionales>
Objetivos de la escena: ${sceneGoals || 'Desarrollar la trama según la lógica del Master Doc.'}
Notas del autor: ${promptNotes || 'Sin notas adicionales.'}
</instrucciones_adicionales>

Escribe el texto narrativo completo ahora. No respondas con nada que no sea la historia.`;

            const response = await AIService.sendMessage(prompt, openRouterKey, { 
                model: selectedAiModel,
                googleApiKey: googleApiKey,
                max_tokens: 4000
            });

            setLiveOriginalText(generationMode === 'create' ? '' : cleanText(targetChapter?.content || ''));
            setLiveResponse(response);
            setShowLiveComparison(true);
            toast.success("¡Capítulo generado con éxito!");
        } catch (error) {
            console.error("Generation Error:", error);
            toast.error("Error al generar el capítulo.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleApplyLiveChanges = async () => {
        if (!liveSelectedChapterId || !liveResponse) return;
        try {
            await updateChapter(liveSelectedChapterId, { content: liveResponse });
            toast.success("¡Manuscrito actualizado con éxito!");
            setShowLiveComparison(false);
            setLiveResponse('');
        } catch (error) {
            toast.error("Error al actualizar el capítulo.");
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            {/* Model & Context Status Bar */}
            <div className="flex flex-col md:flex-row items-center gap-6 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-[32px] overflow-hidden">
                {/* 1. Model Selection (Flexible space) */}
                <div className="flex-1 flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-indigo-500 text-white rounded-xl shadow-lg ring-4 ring-indigo-500/10 shrink-0">
                        <Zap size={16} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest leading-none mb-1">Modelo Activo</h4>
                        <div className="flex items-center gap-2">
                            <select 
                                value={effectiveAISettings.selectedAiModel}
                                onChange={(e) => updateBookData({ 
                                    aiSettings: { ...activeBook?.aiSettings, selectedAiModel: e.target.value } 
                                })}
                                className="max-w-[150px] lg:max-w-[250px] bg-transparent text-sm font-black text-[var(--text-main)] font-serif italic outline-none cursor-pointer hover:text-indigo-600 transition-colors truncate"
                            >
                                {availableModels.map(model => (
                                    <option key={model.id} value={model.id} className="bg-[var(--bg-app)] text-[var(--text-main)] font-sans not-italic font-medium">
                                        {model.name} ({Math.round(model.context_length / 1000)}k)
                                    </option>
                                ))}
                            </select>
                            <span className="hidden sm:inline-block px-2 py-0.5 bg-indigo-500/10 text-indigo-600 text-[9px] font-black rounded-md border border-indigo-500/20 uppercase shrink-0">
                                {effectiveAISettings.selectedAiModel?.includes('free') ? 'Gratis' : 'Premium'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 2. Stats Section (Fixed space) */}
                <div className="flex items-center gap-8 shrink-0">
                    <div className="hidden sm:flex flex-col items-end gap-1">
                        <h4 className="text-[10px] font-black text-indigo-400/60 uppercase tracking-widest leading-none">Ventana de Contexto</h4>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[var(--text-main)] italic">{(weightStatus.limit / 1000).toFixed(0)}k</span>
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/10 ${weightStatus.color}`}>{weightStatus.label}</span>
                        </div>
                    </div>

                    <div className="w-[140px] flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-indigo-400/60 uppercase tracking-widest leading-none">Saturación</h4>
                            <span className={`text-[10px] font-black ${weightStatus.percent > 80 ? 'text-red-500' : 'text-indigo-500'}`}>{Math.round(weightStatus.percent)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-black/20 border border-[var(--border-main)] rounded-full overflow-hidden p-[0.5px]">
                            <div 
                                className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${weightStatus.bg}`}
                                style={{ width: `${weightStatus.percent}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sub-Tabs View Conditional */}
            {liveTab === 'writing' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
                    {/* LEFT SIDEBAR CONTROLS */}
                    <div className="lg:col-span-4 space-y-6">
                        {/* 1. MODO & CONTEXTO */}
                        <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] p-6 shadow-xl space-y-6">
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <FilePlus size={14} strokeWidth={2.5} /> Modo de Escritura
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setGenerationMode('create')}
                                        className={`py-4 rounded-2xl border text-[11px] font-black uppercase tracking-wider flex flex-col items-center justify-center gap-2 transition-all ${generationMode === 'create' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-[var(--bg-editor)] text-[var(--text-muted)] border-[var(--border-main)] hover:border-indigo-500 hover:bg-indigo-500/5'}`}
                                    >
                                        <FilePlus size={18} />
                                        Crear Nuevo
                                    </button>
                                    <button 
                                        onClick={() => setGenerationMode('expand')}
                                        className={`py-4 rounded-2xl border text-[11px] font-black uppercase tracking-wider flex flex-col items-center justify-center gap-2 transition-all ${generationMode === 'expand' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-[var(--bg-editor)] text-[var(--text-muted)] border-[var(--border-main)] hover:border-indigo-500 hover:bg-indigo-500/5'}`}
                                    >
                                        <Maximize2 size={18} />
                                        Expandir
                                    </button>
                                </div>
                            </div>

                            <div className="h-px bg-gradient-to-r from-transparent via-[var(--border-main)] to-transparent"></div>

                            <div className="space-y-4 text-left">
                                <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Database size={14} /> Fuente de Datos
                                </h3>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => {
                                            setReviewSelectionType('single'); 
                                            setIsChapterModalOpen(true);
                                        }}
                                        className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl px-5 py-4 hover:border-indigo-500 transition-all text-left flex items-center justify-between group shadow-sm"
                                    >
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[9px] uppercase font-black text-[var(--text-muted)] tracking-widest leading-none">Ubicación / Capítulo</span>
                                            <span className="font-bold text-sm text-[var(--text-main)] truncate max-w-[200px]">
                                                {liveSelectedChapterId ? (worldItems.find(c => c.id === liveSelectedChapterId)?.title || chapters.find(c => c.id === liveSelectedChapterId)?.title) : "Estructura Proyecto"}
                                            </span>
                                        </div>
                                        <ChevronDown size={14} className="text-indigo-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                                    </button>

                                    <button
                                        onClick={() => setIsContextModalOpen(true)}
                                        className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl px-5 py-4 hover:border-indigo-500 transition-all text-left flex items-center justify-between group shadow-sm"
                                    >
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[9px] uppercase font-black text-indigo-500 tracking-widest leading-none">Lore & Personajes</span>
                                            <span className="font-bold text-sm text-[var(--text-main)]">Configurar Master Doc</span>
                                        </div>
                                        <ChevronRight size={14} className="text-indigo-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 2. EXTENSIÓN */}
                        <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] p-6 shadow-xl space-y-4">
                            <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Hash size={14} /> Extensión del Capítulo
                            </h3>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'short', label: '800-1k', desc: 'Corto' },
                                    { id: 'medium', label: '1k-1.5k', desc: 'Medio' },
                                    { id: 'long', label: '1.5k-2k', desc: 'Largo' }
                                ].map(opt => (
                                    <button 
                                        key={opt.id}
                                        onClick={() => setGenerationLength(opt.id)}
                                        className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${generationLength === opt.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-[var(--bg-editor)] text-[var(--text-muted)] border-[var(--border-main)] hover:border-emerald-500/30'}`}
                                    >
                                        <span className="text-[11px] font-black leading-none">{opt.label}</span>
                                        <span className="text-[8px] uppercase font-bold opacity-60 tracking-wider leading-none">{opt.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* MAIN CONTENT AREA */}
                    <div className="lg:col-span-8 flex flex-col space-y-6">
                        <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] p-10 shadow-xl flex-1 flex flex-col relative overflow-hidden group h-full text-left">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                            
                            <div className="relative space-y-8 flex-1 flex flex-col h-full">
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-[0.3em] flex items-center gap-2">
                                        <Sparkles size={16} className="text-indigo-500" /> Dirección de Escena
                                    </h3>
                                    <textarea
                                        value={sceneGoals}
                                        onChange={(e) => setSceneGoals(e.target.value)}
                                        placeholder="Define qué debe pasar en esta escena... (Ej: 'Iara descubre el mapa secreto bajo la alfombra del rey')"
                                        className="w-full p-8 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-3xl text-xl font-serif leading-relaxed resize-none outline-none focus:ring-4 ring-indigo-500/10 transition-all opacity-90 hover:opacity-100 placeholder:text-[var(--text-muted)]/20"
                                        rows="3"
                                    ></textarea>
                                </div>

                                <div className="space-y-4 flex-1 flex flex-col">
                                    <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <MessageSquare size={14} /> Instrucciones para Gemini
                                    </h3>
                                    <textarea
                                        value={promptNotes}
                                        onChange={(e) => setPromptNotes(e.target.value)}
                                        placeholder="Estilo literario, tono, énfasis... (Ej: 'Voz poética, ritmo rápido, diálogos cortantes')"
                                        className="w-full flex-1 p-8 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl text-sm font-serif italic resize-none outline-none focus:ring-4 ring-indigo-500/10 transition-all shadow-inner placeholder:text-[var(--text-muted)]/40"
                                    ></textarea>
                                </div>
                                
                                <div className="pt-6">
                                    <button
                                        onClick={handleLiveGenerate}
                                        disabled={isAnalyzing || !liveSelectedChapterId}
                                        className="w-full h-24 bg-indigo-600 text-white font-black text-2xl rounded-3xl shadow-2xl shadow-indigo-600/30 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-4 relative group"
                                    >
                                        {isAnalyzing ? <Loader2 className="animate-spin" size={32} /> : <Wand2 size={32} />}
                                        {isAnalyzing ? 'ORQUESTANDO CAPÍTULO...' : 'GENERAR CAPÍTULO AHORA'}
                                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {liveTab === 'refine' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Input Selection */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[24px] p-6 shadow-sm text-left">
                            <h3 className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <BookOpen size={14} /> 1. Contenido Base
                            </h3>
                            <button
                                onClick={() => {
                                    setReviewSelectionType('single'); 
                                    setIsChapterModalOpen(true);
                                }}
                                className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-4 hover:border-indigo-500 transition-all text-left flex items-center justify-between group"
                            >
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest mb-1">Capítulo Seleccionado</span>
                                    <span className="font-bold text-[var(--text-main)] truncate max-w-[150px]">
                                        {liveSelectedChapterId ? chapters.find(c => c.id === liveSelectedChapterId)?.title : "-- Selecciona --"}
                                    </span>
                                </div>
                                <ChevronDown size={14} className="text-indigo-500" />
                            </button>
                        </div>

                    </div>

                    {/* Right: Instructions & Action */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[24px] p-8 shadow-sm relative overflow-hidden group h-full flex flex-col text-left">
                            <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full"></div>
                            <h3 className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <MessageSquare size={14} /> 3. Instrucciones de Refinado
                            </h3>
                            <textarea
                                value={liveInstructions}
                                onChange={(e) => setLiveInstructions(e.target.value)}
                                placeholder="Ej: 'Añade más tensión al diálogo final', 'Describe mejor el ambiente gótico', 'Elimina oraciones redundantes'..."
                                className="w-full flex-1 bg-transparent border-none text-[var(--text-main)] resize-none focus:outline-none font-serif text-lg leading-relaxed placeholder:text-[var(--text-muted)]/40 scrollbar-hide"
                            ></textarea>

                            <div className="flex items-center justify-between pt-6 border-t border-[var(--border-main)]/50 mt-4">
                                <div className="flex items-center gap-2">
                                    <Zap size={14} className="text-amber-500" />
                                    <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Listo para procesar</span>
                                </div>
                                <button
                                    onClick={handleLiveRefine}
                                    disabled={isAnalyzing || !liveSelectedChapterId}
                                    className="px-10 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center gap-3"
                                >
                                    {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                                    {isAnalyzing ? 'REFINANDO...' : 'REFINAR AHORA'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {liveTab === 'coherence' && (
                <div className="grid grid-cols-1 gap-8 max-w-5xl mx-auto">
                    <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] p-10 shadow-sm relative overflow-hidden text-left">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                            <div>
                                <h3 className="text-2xl font-serif font-black text-[var(--text-main)] italic mb-2">Analista de Coherencia</h3>
                                <p className="text-sm text-[var(--text-muted)] max-w-xl leading-relaxed">Escanea tu capítulo en busca de contradicciones con lo establecido en tu Master Doc, errores de tiempo o huecos en la trama.</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => {
                                        setReviewSelectionType('single'); 
                                        setIsChapterModalOpen(true);
                                    }}
                                    className="px-4 py-3 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl text-xs font-bold flex items-center gap-2 hover:border-indigo-500 transition-all"
                                >
                                    <BookOpen size={14} /> {liveSelectedChapterId ? chapters.find(c => c.id === liveSelectedChapterId)?.title : "Seleccionar Capítulo"}
                                </button>
                                <button
                                    onClick={handleCoherenceAnalysis}
                                    disabled={isAnalyzing || !liveSelectedChapterId}
                                    className="px-8 py-3 bg-indigo-600 text-white text-xs font-black rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                    INICIAR ESCANEO
                                </button>
                            </div>
                        </div>

                        {coherenceAnalysis ? (
                            <div className="bg-[var(--bg-editor)] rounded-2xl border border-[var(--border-main)] p-8 prose prose-invert max-w-none text-left font-[Arial,sans-serif]">
                                <div dangerouslySetInnerHTML={{ __html: coherenceAnalysis.replace(/\n/g, '<br/>') }}></div>
                            </div>
                        ) : (
                            <div className="h-64 border-2 border-dashed border-[var(--border-main)] rounded-3xl flex flex-col items-center justify-center text-[var(--text-muted)] group">
                                <div className="p-4 bg-[var(--bg-editor)] rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-500"><ShieldCheck size={32} className="opacity-20" /></div>
                                <p className="text-xs font-bold uppercase tracking-widest opacity-60">Selecciona un capítulo y pulsa "Iniciar Escaneo"</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {liveTab === 'extraction' && (
                <div className="grid grid-cols-1 gap-8 max-w-5xl mx-auto">
                    <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] p-10 shadow-sm relative overflow-hidden text-left">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                            <div>
                                <h3 className="text-2xl font-serif font-black text-[var(--text-main)] italic mb-2">Auto-Extractor de Entidades</h3>
                                <p className="text-sm text-[var(--text-muted)] max-w-xl leading-relaxed">Identifica automáticamente personajes, lugares y objetos mencionados en tu capítulo e intégralos en tu Biblia con un clic.</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => {
                                        setReviewSelectionType('single'); 
                                        setIsChapterModalOpen(true);
                                    }}
                                    className="px-4 py-3 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl text-xs font-bold flex items-center gap-2 hover:border-indigo-500 transition-all"
                                >
                                    <BookOpen size={14} /> {liveSelectedChapterId ? chapters.find(c => c.id === liveSelectedChapterId)?.title : "Seleccionar Capítulo"}
                                </button>
                                <button
                                    onClick={handleExtractEntities}
                                    disabled={isExtracting || !liveSelectedChapterId}
                                    className="px-8 py-3 bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                                    EXTRAER MENCIONES
                                </button>
                            </div>
                        </div>

                        {extractedEntities.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {extractedEntities.map((entity, idx) => (
                                    <div key={idx} className="bg-[var(--bg-app)] border border-[var(--border-main)] p-6 rounded-3xl flex flex-col gap-4 group hover:border-emerald-500/30 transition-all">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${entity.type === 'Personaje' ? 'bg-blue-500' : entity.type === 'Lugar' ? 'bg-indigo-500' : 'bg-orange-500'} text-white`}>
                                                    {entity.type === 'Personaje' ? <UserCheck size={14} /> : entity.type === 'Lugar' ? <Database size={14} /> : <Zap size={14} />}
                                                </div>
                                                <div className="text-left">
                                                    <h4 className="font-bold text-[var(--text-main)]">{entity.name}</h4>
                                                    <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">{entity.type}</span>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleCreateExtractedEntity(entity)}
                                                className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                                                title="Añadir a la Biblia"
                                            >
                                                <CheckCircle2 size={18} />
                                            </button>
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] italic leading-relaxed">"{entity.description}"</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-64 border-2 border-dashed border-[var(--border-main)] rounded-3xl flex flex-col items-center justify-center text-[var(--text-muted)] group">
                                <div className="p-4 bg-[var(--bg-editor)] rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-500"><Database size={32} className="opacity-20" /></div>
                                <p className="text-xs font-bold uppercase tracking-widest opacity-60">Extrae las menciones para verlas aquí</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {liveTab === 'import' && (
                <div className="grid grid-cols-1 gap-8 max-w-5xl mx-auto">
                    <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] p-10 shadow-sm relative overflow-hidden text-left">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                            <div>
                                <h3 className="text-2xl font-serif font-black text-[var(--text-main)] italic mb-2">Smart Importer (Beta)</h3>
                                <p className="text-sm text-[var(--text-muted)] max-w-xl leading-relaxed">Pega cualquier texto bruto (notas sueltas, resúmenes) y la IA lo convertirá automáticamente en categorías y elementos estructurados para tu Biblia.</p>
                            </div>
                            {!importResults && (
                                <button
                                    onClick={handleSmartImport}
                                    disabled={isImporting || !importText.trim()}
                                    className="px-8 py-3 bg-indigo-600 text-white text-xs font-black rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isImporting ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpCircle size={16} />}
                                    ANALIZAR PARA IMPORTAR
                                </button>
                            )}
                        </div>

                        {!importResults ? (
                            <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] p-8 shadow-sm text-left">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Cargar Contenido Bruto</h4>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-24 h-1.5 bg-[var(--bg-editor)] rounded-full overflow-hidden border border-[var(--border-main)]">
                                                <div 
                                                    className={`h-full transition-all duration-500 ${weightStatus.bg}`}
                                                    style={{ width: `${weightStatus.percent}%` }}
                                                ></div>
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-tighter ${weightStatus.color}`}>Contexto: {weightStatus.label}</span>
                                        </div>
                                        <span className="text-[10px] text-indigo-500 font-bold">La IA detectará categorías y elementos</span>
                                    </div>
                                </div>
                                <textarea
                                    value={importText}
                                    onChange={(e) => setImportText(e.target.value)}
                                    placeholder="Pega aquí tu lore, descripciones de ciudades, mitologías o resúmenes de personajes..."
                                    className="w-full h-64 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl p-6 text-[var(--text-main)] font-serif text-lg focus:ring-2 ring-indigo-500/30 transition-all resize-none outline-none scrollbar-hide"
                                ></textarea>
                            </div>
                        ) : (
                            <div className="space-y-6 animate-in zoom-in-95 duration-500">
                                <div className="flex items-center justify-between px-4">
                                    <div className="text-left">
                                        <h4 className="text-xl font-serif font-black text-[var(--text-main)] italic">Vista Previa de Importación</h4>
                                        <p className="text-xs text-[var(--text-muted)] font-medium">Revisa lo que se creará en tu Biblia.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setImportResults(null)}
                                            className="px-4 py-2 text-xs font-bold text-[var(--text-muted)] hover:text-red-500 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleApplyImportResults}
                                            disabled={isImporting}
                                            className="px-6 py-3 bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg hover:bg-emerald-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
                                        >
                                            {isImporting ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                                            {isImporting ? 'IMPORTANDO...' : 'Confirmar Importación'}
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-6">
                                    {/* Personajes */}
                                    {(importResults.character_changes || []).map((char, idx) => (
                                        <div key={`char-${idx}`} className="bg-blue-500/5 border border-blue-500/20 p-6 rounded-3xl flex flex-col gap-3 text-left">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${char.action === 'delete' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                                        Personaje {char.action === 'update' ? '(Actualizar)' : char.action === 'delete' ? '(Eliminar)' : '(Nuevo)'}
                                                    </span>
                                                    <h5 className="font-bold text-[var(--text-main)] italic">{char.name}</h5>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-[var(--text-muted)] leading-relaxed italic line-clamp-2">{char.content}</p>
                                        </div>
                                    ))}

                                    {/* Mundo por Categorías */}
                                    {(importResults.world_changes || []).map((group, gIdx) => (
                                        <div key={`group-${gIdx}`} className="space-y-3">
                                            <div className="flex items-center gap-2 px-2">
                                                <div className="w-6 h-6 rounded bg-indigo-500 text-white flex items-center justify-center"><Database size={10} /></div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Carpeta: {group.categoryName}</span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l-2 border-indigo-500/10">
                                                {group.items.map((item, iIdx) => (
                                                    <div key={`item-${gIdx}-${iIdx}`} className="bg-[var(--bg-app)] border border-[var(--border-main)] p-4 rounded-3xl flex flex-col gap-2 text-left">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-lg ${item.action === 'delete' ? 'bg-red-500/10 text-red-500' : item.action === 'update' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                                {item.action}
                                                            </span>
                                                            <h6 className="font-bold text-xs text-[var(--text-main)] truncate">{item.title}</h6>
                                                        </div>
                                                        <p className="text-[9px] text-[var(--text-muted)] line-clamp-2">{item.content}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Comparison view for Direct Refine */}
            {showLiveComparison && (
                <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300">
                    <div className="bg-[var(--bg-app)] w-full max-w-7xl h-full max-h-[90vh] rounded-[40px] shadow-2xl border border-[var(--border-main)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-500">
                        {/* Header Comparison */}
                        <div className="p-8 border-b border-[var(--border-main)] bg-[var(--bg-editor)]/50 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-600/20"><Sparkles size={24} /></div>
                                <div className="text-left">
                                    <h4 className="text-2xl font-serif font-black text-[var(--text-main)] italic">Revisión de Cambios</h4>
                                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-black">Compara el original con la propuesta de la IA</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setShowLiveComparison(false)}
                                    className="px-6 py-3 text-xs font-bold text-[var(--text-muted)] hover:text-red-500 transition-all uppercase tracking-widest"
                                >
                                    Descartar
                                </button>
                                <button
                                    onClick={handleApplyLiveChanges}
                                    className="px-10 py-4 bg-emerald-500 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/20 hover:scale-[1.05] active:scale-95 transition-all flex items-center gap-3"
                                >
                                    <CheckCircle2 size={18} /> APLICAR CAMBIOS
                                </button>
                            </div>
                        </div>

                        {/* Comparison Grid */}
                        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                            {/* Version Original */}
                            <div className="flex-1 overflow-y-auto p-10 border-r border-[var(--border-main)] bg-[var(--bg-app)] text-left flex flex-col">
                                <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-red-500"></div> VERSIÓN ORIGINAL
                                </span>
                                <div className="font-serif text-lg leading-relaxed text-[var(--text-muted)] opacity-60 line-through select-none whitespace-pre-wrap">
                                    {liveOriginalText}
                                </div>
                            </div>
                            
                            {/* Propuesta IA */}
                            <div className="flex-1 overflow-y-auto p-10 bg-[var(--bg-editor)] text-left flex flex-col">
                                <div className="flex items-center justify-between mb-6">
                                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> PROPUESTA REFINADA
                                    </span>
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(liveResponse);
                                            toast.success("Copiado al portapapeles");
                                        }}
                                        className="text-[10px] font-black text-indigo-500 hover:underline uppercase tracking-widest"
                                    >
                                        Copiar Texto
                                    </button>
                                </div>
                                <div className="font-serif text-lg leading-relaxed text-[var(--text-main)] animate-in fade-in slide-in-from-bottom-4 duration-700 whitespace-pre-wrap">
                                    {liveResponse}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IALiveMode;
