import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { Sparkles, Copy, CheckCircle2, ChevronDown, CheckSquare, Square, Edit3, ShieldCheck } from 'lucide-react';

const AI_ROLES = [
    {
        id: 'mentor',
        name: 'Mentor Amigable',
        desc: 'Te guía paso a paso, explicando el porqué de cada cambio de forma sencilla.',
        prompt: 'Actúa como un mentor literario amigable que ayuda a escritores novatos. Tu tono es motivador, pedagógico y usas lenguaje sencillo sin tecnicismos complicados.'
    },
    {
        id: 'editor_estricto',
        name: 'Editor Honesto',
        desc: 'Directo al grano. Te dice qué no funciona y cómo arreglarlo sin rodeos.',
        prompt: 'Actúa como un editor profesional honesto y directo. No adornes tus críticas; señala los puntos débiles con claridad y ofrece soluciones prácticas inmediatas.'
    },
    {
        id: 'fan_entusiasta',
        name: 'Lector Fan',
        desc: 'Reacciona a tu historia con emoción, destacando lo que más le emociona.',
        prompt: 'Actúa como un lector entusiasta que ama tu género. Reacciona a la historia con emoción, señala lo que te hace querer seguir leyendo y sugiere mejoras desde el punto de vista de un fan.'
    },
    {
        id: 'maestro_vocabulario',
        name: 'Maestro de Palabras',
        desc: 'Se enfoca en que tu escritura suene más bella y profesional.',
        prompt: 'Actúa como un experto en lenguaje. Tu objetivo es embellecer el texto, sugerir palabras más precisas y elegantes, y mejorar la fluidez de las frases para que suenen profesionales.'
    },
    {
        id: 'experto_emociones',
        name: 'Experto en Sentimientos',
        desc: 'Te ayuda a que los personajes sientan y transmitan más emoción.',
        prompt: 'Actúa como un psicólogo de personajes. Enfócate en las emociones, el lenguaje corporal y la profundidad interna para que el lector conecte emocionalmente con cada escena.'
    },
    {
        id: 'arquitecto_visual',
        name: 'Director de Cine',
        desc: 'Ayuda a que tus descripciones se "vean" como una película en la mente.',
        prompt: 'Actúa como un director de cine visual. Ayuda al autor a pintar escenas vívidas, enfocándote en los sentidos, los colores, la luz y el ambiente para que la historia sea cinematográfica.'
    },
    {
        id: 'pulidor_dialogos',
        name: 'Mago de los Diálogos',
        desc: 'Hace que tus personajes hablen de forma natural y divertida.',
        prompt: 'Actúa como un experto en diálogos. Tu misión es que las conversaciones suenen naturales, tengan ritmo y revelen la personalidad de los personajes sin que parezca forzado.'
    },
    {
        id: 'cazador_logica',
        name: 'Detective de Historias',
        desc: 'Busca huecos en la trama o cosas que no tienen sentido.',
        prompt: 'Actúa como un detective de continuidad. Busca cualquier cosa que no tenga sentido lógico, huecos en la trama o contradicciones, y explícalo de forma que un principiante lo entienda.'
    },
    {
        id: 'fantasma',
        name: 'Escritor Invisible',
        desc: 'Toma tus ideas y las escribe con un estilo fluido de autor publicado.',
        prompt: 'Actúa como un escritor "negro" o ghostwriter veterano. Toma las ideas del autor y dales una forma profesional, con un ritmo perfecto y una estructura narrativa sólida.'
    },
    {
        id: 'companero_lluvia',
        name: 'Socio de Ideas',
        desc: 'Te da sugerencias creativas sobre hacia dónde podría ir tu historia.',
        prompt: 'Actúa como un compañero creativo de lluvia de ideas. No solo corrijas; sugiere caminos interesantes, giros inesperados y posibilidades que el autor quizás no ha visto.'
    },
    {
        id: 'simplificador',
        name: 'Maestro de la Claridad',
        desc: 'Te ayuda a que las partes confusas sean fáciles de entender.',
        prompt: 'Actúa como un experto en comunicación clara. Ayuda al autor a simplificar escenas confusas o textos enrevesados para que cualquier lector pueda seguir la historia sin esfuerzo.'
    },
    {
        id: 'mago_ritmo',
        name: 'Mago del Ritmo',
        desc: 'Se asegura de que tu historia no sea lenta ni demasiado rápida.',
        prompt: 'Actúa como un experto en ritmo narrativo (pacing). Identifica dónde la historia se siente lenta o dónde va demasiado rápido, y sugiere cómo equilibrar la acción con la pausa.'
    }
];

const PromptStudioView = () => {
    const { activeBook, chapters, characters, worldItems, updateBookData, promptStudioPreload, setPromptStudioPreload } = useData();
    const [selectedChapterId, setSelectedChapterId] = useState('');
    const [selectedRefineChapterId, setSelectedRefineChapterId] = useState('');
    const [selectedReviewChapterId, setSelectedReviewChapterId] = useState('');
    const [aiRoles, setAiRoles] = useState(['mentor']);
    const [reviewStartId, setReviewStartId] = useState('');
    const [reviewEndId, setReviewEndId] = useState('');
    const [sceneGoals, setSceneGoals] = useState('');
    const [promptNotes, setPromptNotes] = useState('');
    const [promptWeight, setPromptWeight] = useState(0);
    const [selectedCharacters, setSelectedCharacters] = useState([]);
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState('generation'); // 'generation' or 'review'
    const [isPostCopyView, setIsPostCopyView] = useState(false);
    const [copiedTitleId, setCopiedTitleId] = useState(null);
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [isContextModalOpen, setIsContextModalOpen] = useState(false);
    const [isChapterModalOpen, setIsChapterModalOpen] = useState(false);

    // Filter states
    const [includeCharacters, setIncludeCharacters] = useState(true);
    const [includeNotasGenerales, setIncludeNotasGenerales] = useState(true);
    const [includeEstructura, setIncludeEstructura] = useState(true);
    const [includeAutorNotes, setIncludeAutorNotes] = useState(true);
    const [includeContinuityCheck, setIncludeContinuityCheck] = useState(true);
    const [reviewSelectionType, setReviewSelectionType] = useState('single'); // 'single', 'start', 'end'
    const [includedSections, setIncludedSections] = useState({});

    // Dynamic Master Doc roots
    const rootMasterDocSections = worldItems.filter(i => i.parentId === null);

    // Initialize included sections for dynamic cards
    useEffect(() => {
        setIncludedSections(prev => {
            const newState = { ...prev };
            worldItems.forEach(i => {
                if (newState[i.id] === undefined) newState[i.id] = true;
            });
            return newState;
        });
    }, [worldItems]);

    // Consume Prompt Studio Preload (bridge from Editor inline notes)
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

    const toggleSection = (id) => {
        setIncludedSections(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleCopy = () => {
        let prompt = '';
        if (activeTab === 'generation') prompt = generatePrompt();
        else if (activeTab === 'review') prompt = generateReviewPrompt();
        else if (activeTab === 'refine') prompt = generateRefinePrompt();

        navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        setIsPostCopyView(true);
        // setPromptNotes(''); // Removed auto-clear for persistence
        // setSceneGoals('');  // Removed auto-clear for persistence
        setSelectedCharacters([]);
        setReviewStartId('');
        setReviewEndId('');
    };

    const handleCopyTitle = (id, text) => {
        navigator.clipboard.writeText(text);
        setCopiedTitleId(id);
        setTimeout(() => setCopiedTitleId(null), 2000);
    };

    // Helper for robust text cleaning
    const cleanText = (html) => {
        if (!html) return '';
        return html
            .replace(/<br\s*\/?>/gi, '\n') // Convert BR to newlines
            .replace(/<\/p>/gi, '\n\n')    // Paragraphs to double newlines
            .replace(/<[^>]*>?/gm, '')     // Strip remaining tags
            .replace(/&nbsp;/g, ' ')       // Clean entities
            .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú')
            .replace(/&ntilde;/g, 'ñ')
            .trim();
    };

    const computeEstructuraLabels = () => {
        const labels = {};
        let vCount = 1;
        let standaloneCount = 1;
        worldItems.filter(w => w.parentId === 'system_estructura' && w.isCategory).forEach(vol => {
            labels[vol.id] = `Volumen ${vCount}: `;
            vCount++;
            let volChapCount = 1;
            worldItems.filter(w => w.parentId === vol.id).forEach(c => {
                labels[c.id] = `Capítulo ${volChapCount}: `;
                volChapCount++;
            });
        });
        worldItems.filter(w => w.parentId === 'system_estructura' && !w.isCategory).forEach(c => {
            labels[c.id] = `Capítulo ${standaloneCount}: `;
            standaloneCount++;
        });
        return labels;
    };
    const estLabels = computeEstructuraLabels();

    const computeChapterLabels = () => {
        const labels = {};
        let vCount = 1;
        let standaloneCount = 1;
        if (!chapters) return labels;
        chapters.filter(c => c.isVolume).forEach(vol => {
            labels[vol.id] = `Volumen ${vCount}: `;
            vCount++;
            let volChapCount = 1;
            chapters.filter(c => c.parentId === vol.id).forEach(c => {
                labels[c.id] = `Capítulo ${volChapCount}: `;
                volChapCount++;
            });
        });
        chapters.filter(c => !c.parentId && !c.isVolume).forEach(c => {
            labels[c.id] = `Capítulo ${standaloneCount}: `;
            standaloneCount++;
        });
        return labels;
    };
    const chapLabels = computeChapterLabels();

    // Context Weight Calculation
    useEffect(() => {
        let total = 0;
        if (activeTab === 'generation') total = generatePrompt().length;
        else if (activeTab === 'review') total = generateReviewPrompt().length;
        else if (activeTab === 'refine') total = generateRefinePrompt().length;
        setPromptWeight(total);
    }, [
        activeTab, selectedChapterId, selectedRefineChapterId, selectedReviewChapterId,
        reviewStartId, reviewEndId,
        promptNotes, sceneGoals, includeCharacters, includeNotasGenerales,
        includeEstructura, includeAutorNotes, includeContinuityCheck, includedSections,
        chapters, worldItems, characters, selectedCharacters
    ]);

    const getWeightStatus = () => {
        if (promptWeight < 100000) return { label: 'Óptimo', color: 'text-emerald-500', bg: 'bg-emerald-500', desc: 'Contexto ligero: Gemini Pro procesará esto con máxima velocidad y precisión.' };
        if (promptWeight < 200000) return { label: 'Pesado', color: 'text-orange-500', bg: 'bg-orange-500', desc: 'Contexto denso: Gemini Pro sigue siendo preciso, pero podrías notar más tiempo de procesamiento.' };
        return { label: 'Crítico', color: 'text-red-500', bg: 'bg-red-500', desc: 'Más de 200k caracteres: Riesgo de pérdida de foco en detalles muy específicos.' };
    };

    const toggleCharacter = (id) => {
        setSelectedCharacters(prev =>
            prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
        );
    };
    const weightStatus = getWeightStatus();

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

        // Generate Characters XML
        const filteredChars = selectedCharacters.length > 0
            ? characters.filter(c => selectedCharacters.includes(c.id))
            : characters;

        const charactersXml = (includeCharacters && filteredChars.length > 0) ? filteredChars.map(c => `
Nombre: ${c.name}
Rol: ${c.role || 'No especificado'}
Descripción: ${(c.description || '').replace(/<[^>]*>?/gm, '')}
        `).join('\n') : "Sin personajes definidos o incluidos.";

        // General Notes
        const generalNotesItems = worldItems.filter(i => i.parentId === 'system_notas');
        const generalNotesText = (includeNotasGenerales && generalNotesItems.length > 0) ? generalNotesItems.map(i => `
-- [Nota: ${i.title}] --
${i.content}
        `).join('\n') : "";

        // Function to recursively get content of sections, respecting individual toggles
        const getSectionContent = (parentId) => {
            const children = worldItems.filter(i => i.parentId === parentId && includedSections[i.id]);
            return children.map(c => `
- ${c.title}: ${c.content || ''}
${getSectionContent(c.id)}
            `).join('\n').trim();
        };

        // Custom recursive for estructura to include labels
        const getEstructuraSectionContent = (parentId) => {
            const children = worldItems.filter(i => i.parentId === parentId);
            return children.map(c => `
- [CAPÍTULO ${estLabels[c.id] || ''}] ${c.title}: ${c.content || ''}
${getEstructuraSectionContent(c.id)}
            `).join('\n').trim();
        };

        // Generar Master Doc dinamico (solo los checkeados)
        const estructuraItems = worldItems.filter(i => i.parentId === 'system_estructura');
        const estructuraText = (includeEstructura && estructuraItems.length > 0) ? estructuraItems.map(c => `
- [${c.isCategory ? 'VOLUMEN' : 'CAPÍTULO'} ${estLabels[c.id] || ''}] ${c.title}: ${c.content || ''}
${c.isCategory ? getEstructuraSectionContent(c.id) : ''}
        `).join('\n') : "";

        // Generar Master Doc dinamico (solo los checkeados)
        const includedDynamicSections = rootMasterDocSections.filter(sec => includedSections[sec.id]);

        const worldXml = includedDynamicSections.length > 0 ? includedDynamicSections.map(sec => {
            let sectionText = `--- ${sec.title} ---\n${sec.content || ''}\n`;
            if (sec.isCategory) {
                sectionText += getSectionContent(sec.id);
            }
            return sectionText;
        }).join('\n\n') : "Sin secciones dinámicas del Master Doc incluidas.";

        // Combinar worldXml + Notas Generales en el tag master_document
        const fullMasterDocumentXml = `
${worldXml}
${generalNotesText ? '\n--- NOTAS ADICIONALES DEL MUNDO ---\n' + generalNotesText : ''}
${estructuraText ? '\n--- ESTRUCTURA MAESTRA Y RESÚMENES ---\n' + estructuraText : ''}
        `.trim();

        // Generate Notes XML
        const notesXml = (includeAutorNotes && promptNotes.trim()) ? promptNotes.trim() : "Sin notas adicionales del autor para esta generación.";

        // Role Instructions (Combined)
        const selectedRolesData = AI_ROLES.filter(r => aiRoles.includes(r.id));
        const combinedPrompt = selectedRolesData.length > 0
            ? selectedRolesData.map(r => r.prompt).join(' ')
            : AI_ROLES[0].prompt;

        return `${combinedPrompt}
A continuación, te entrego la biblia de mi obra. Este será tu núcleo de verdad absoluto y nunca lo debes romper.
Escribe por lo menos de 2000 a 3000 palabras.

<master_document>
${fullMasterDocumentXml || 'Documento vacío.'}
</master_document>

<notas_exclusivas_para_esta_respuesta>
${notesXml}
</notas_exclusivas_para_esta_respuesta>

<hitos_u_objetivos_de_la_escena>
${sceneGoals.trim() || "No se definieron hitos específicos para esta escena."}
</hitos_u_objetivos_de_la_escena>

<personajes_relevantes_activos>
${charactersXml.trim()}
</personajes_relevantes_activos>

<objetivo_del_capitulo_actual>
${chapterContext}
</objetivo_del_capitulo_actual>

<instrucciones_de_escritura>
1. Utiliza toda la información del <master_document> como trasfondo implícito. No lo repitas como un diccionario.
2. Escribe de manera extensa y detallada.
3. Continúa y escribe el capítulo completo descrito en <objetivo_del_capitulo_actual>. Desarrolla diálogos agudos e inteligentes. No resumas; dame la escena minuto a minuto.
4. Es OBLIGATORIO que se cumplan los puntos descritos en <hitos_u_objetivos_de_la_escena> dentro del flujo de la narración.
</instrucciones_de_escritura>

Escribe tu respuesta a continuación:
`;
    };
    const generateReviewPrompt = () => {
        const filteredChars = selectedCharacters.length > 0
            ? characters.filter(c => selectedCharacters.includes(c.id))
            : characters;

        const charactersXml = (includeCharacters && filteredChars.length > 0) ? filteredChars.map(c => `
Nombre: ${c.name}
Rol: ${c.role || 'No especificado'}
Descripción: ${(c.description || '').replace(/<[^>]*>?/gm, '')}
        `).join('\n') : "Sin personajes definidos o incluidos.";

        const generalNotesItems = worldItems.filter(i => i.parentId === 'system_notas');
        const generalNotesText = (includeNotasGenerales && generalNotesItems.length > 0) ? generalNotesItems.map(i => `
-- [Nota: ${i.title}] --
${i.content}
        `).join('\n') : "";

        const getSectionContent = (parentId) => {
            const children = worldItems.filter(i => i.parentId === parentId);
            return children.map(c => `
- ${c.title}: ${c.content || ''}
${getSectionContent(c.id)}
            `).join('\n').trim();
        };

        const getEstructuraSectionContent = (parentId) => {
            const children = worldItems.filter(i => i.parentId === parentId);
            return children.map(c => `
- [CAPÍTULO ${estLabels[c.id] || ''}] ${c.title}: ${c.content || ''}
${getEstructuraSectionContent(c.id)}
            `).join('\n').trim();
        };

        const estructuraItems = worldItems.filter(i => i.parentId === 'system_estructura');
        const estructuraText = (includeEstructura && estructuraItems.length > 0) ? estructuraItems.map(c => `
- [${c.isCategory ? 'VOLUMEN' : 'CAPÍTULO'} ${estLabels[c.id] || ''}] ${c.title}: ${c.content || ''}
${c.isCategory ? getEstructuraSectionContent(c.id) : ''}
        `).join('\n') : "";

        const includedDynamicSections = rootMasterDocSections.filter(sec => includedSections[sec.id]);
        const worldXml = includedDynamicSections.length > 0 ? includedDynamicSections.map(sec => {
            let sectionText = `--- ${sec.title} ---\n${sec.content || ''}\n`;
            if (sec.isCategory) {
                sectionText += getSectionContent(sec.id);
            }
            return sectionText;
        }).join('\n\n') : "Sin secciones dinámicas del Master Doc incluidas.";

        const fullMasterDocumentXml = `
${worldXml}
${generalNotesText ? '\n--- NOTAS ADICIONALES DEL MUNDO ---\n' + generalNotesText : ''}
${estructuraText ? '\n--- ESTRUCTURA MAESTRA Y RESÚMENES ---\n' + estructuraText : ''}
        `.trim();

        const notesXml = (includeAutorNotes && promptNotes.trim()) ? promptNotes.trim() : "Sin notas adicionales del autor.";

        const targetChapter = chapters?.find(c => c.id === selectedReviewChapterId);
        let chaptersText = "";

        const flatChapters = (chapters || []).filter(c => !c.isVolume);

        if (reviewStartId && reviewEndId) {
            const startIndex = flatChapters.findIndex(c => c.id === reviewStartId);
            const endIndex = flatChapters.findIndex(c => c.id === reviewEndId);

            if (startIndex !== -1 && endIndex !== -1) {
                const range = flatChapters.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);
                chaptersText = range.map(c => `--- [CAPÍTULO: ${c.title}] ---\n${cleanText(c.content) || 'Sin contenido'}`).join('\n\n');
            }
        } else if (targetChapter) {
            const targetIndex = flatChapters.findIndex(c => c.id === targetChapter.id);
            const prevChapter = targetIndex > 0 ? flatChapters[targetIndex - 1] : null;

            if (prevChapter) {
                chaptersText += `--- [ANTERIOR] CAPÍTULO: ${prevChapter.title} ---\n${cleanText(prevChapter.content) || 'Sin contenido'}\n\n`;
            }

            chaptersText += `--- [ACTUAL A REVISAR] CAPÍTULO: ${targetChapter.title} ---\n${cleanText(targetChapter.content) || 'Sin contenido'}`;
        } else {
            chaptersText = (flatChapters.length > 0) ? flatChapters.filter(c => c.status !== 'Finalizado').map(c => `
--- [CAPÍTULO: ${c.title}] ---
${cleanText(c.content) || 'Sin contenido'}
            `).join('\n') : "Sin capítulos escritos.";
        }

        const selectedRolesData = AI_ROLES.filter(r => aiRoles.includes(r.id));
        const combinedPrompt = selectedRolesData.length > 0
            ? selectedRolesData.map(r => r.prompt).join(' ')
            : AI_ROLES[0].prompt;

        return `${combinedPrompt} 
Tu objetivo es leer el documento maestro (que contiene la biblia y reglas de este mundo) y compararlo con los capítulos que ya he escrito, para detectar de manera amable y constructiva:
1. Huecos argumentales (Plot holes).
2. Errores de trama o de lógica interna.
3. Errores de continuidad${includeContinuityCheck ? ' (Presta especial atención a la transición entre el final del capítulo anterior y el inicio del siguiente, buscando inconsistencias en la posición de los personajes, el tiempo transcurrido y objetos en mano)' : ''}.
4. Mejoras potenciales en el ritmo o las decisiones narrativas de personajes.

No seas excesivamente estricto ni destructivo; sé comprensivo, ofrece sugerencias prácticas para arreglar los detalles y explícame por qué crees que son un problema.

<master_document>
${fullMasterDocumentXml || 'Documento vacío.'}
</master_document>

<notas_exclusivas_del_autor>
${notesXml}
</notas_exclusivas_del_autor>

<personajes_relevantes_activos>
${charactersXml.trim()}
</personajes_relevantes_activos>

<capitulos_actuales_de_la_obra>
${chaptersText}
</capitulos_actuales_de_la_obra>

Por favor, entrégame tu análisis desglosado por errores y áreas de oportunidad, con sugerencias claras sobre cómo podría solucionarlos:
`;
    };

    const generateRefinePrompt = () => {
        const filteredChars = selectedCharacters.length > 0
            ? characters.filter(c => selectedCharacters.includes(c.id))
            : characters;

        const charactersXml = (includeCharacters && filteredChars.length > 0) ? filteredChars.map(c => `
Nombre: ${c.name}
Rol: ${c.role || 'No especificado'}
Descripción: ${(c.description || '').replace(/<[^>]*>?/gm, '')}
        `).join('\n') : "Sin personajes definidos o incluidos.";

        const generalNotesItems = worldItems.filter(i => i.parentId === 'system_notas');
        const generalNotesText = (includeNotasGenerales && generalNotesItems.length > 0) ? generalNotesItems.map(i => `
-- [Nota: ${i.title}] --
${i.content}
        `).join('\n') : "";

        const getSectionContent = (parentId) => {
            const children = worldItems.filter(i => i.parentId === parentId);
            return children.map(c => `
- ${c.title}: ${c.content || ''}
${getSectionContent(c.id)}
            `).join('\n').trim();
        };

        const getEstructuraSectionContent = (parentId) => {
            const children = worldItems.filter(i => i.parentId === parentId);
            return children.map(c => `
- [CAPÍTULO ${estLabels[c.id] || ''}] ${c.title}: ${c.content || ''}
${getEstructuraSectionContent(c.id)}
            `).join('\n').trim();
        };

        const estructuraItems = worldItems.filter(i => i.parentId === 'system_estructura');
        const estructuraText = (includeEstructura && estructuraItems.length > 0) ? estructuraItems.map(c => `
- [${c.isCategory ? 'VOLUMEN' : 'CAPÍTULO'} ${estLabels[c.id] || ''}] ${c.title}: ${c.content || ''}
${c.isCategory ? getEstructuraSectionContent(c.id) : ''}
        `).join('\n') : "";

        const includedDynamicSections = rootMasterDocSections.filter(sec => includedSections[sec.id]);
        const worldXml = includedDynamicSections.length > 0 ? includedDynamicSections.map(sec => {
            let sectionText = `--- ${sec.title} ---\n${sec.content || ''}\n`;
            if (sec.isCategory) {
                sectionText += getSectionContent(sec.id);
            }
            return sectionText;
        }).join('\n\n') : "Sin secciones dinámicas del Master Doc incluidas.";

        const fullMasterDocumentXml = `
${worldXml}
${generalNotesText ? '\n--- NOTAS ADICIONALES DEL MUNDO ---\n' + generalNotesText : ''}
${estructuraText ? '\n--- ESTRUCTURA MAESTRA Y RESÚMENES ---\n' + estructuraText : ''}
        `.trim();

        const goalsXml = sceneGoals.trim() ? sceneGoals.trim() : "No se definieron hitos específicos.";
        const notesXml = (includeAutorNotes && promptNotes.trim()) ? promptNotes.trim() : "Sin instrucciones de refinamiento detalladas.";

        const targetChapter = chapters?.find(c => c.id === selectedRefineChapterId);
        const chapterText = targetChapter ? (cleanText(targetChapter.content) || 'Sin contenido') : 'Capítulo no seleccionado o sin contenido.';
        const chapterTitle = targetChapter ? targetChapter.title : '';

        const selectedRolesData = AI_ROLES.filter(r => aiRoles.includes(r.id));
        const combinedPrompt = selectedRolesData.length > 0
            ? selectedRolesData.map(r => r.prompt).join(' ')
            : AI_ROLES[0].prompt;

        return `${combinedPrompt} Tu objetivo es refinar y mejorar un capítulo específico que ya he escrito, siguiendo mis instrucciones al pie de la letra. No lo reescribas desde cero perdiendo su esencia original, simplemente refínalo para que cumpla con las indicaciones dadas.

<master_document>
${fullMasterDocumentXml || 'Documento vacío.'}
</master_document>

<texto_del_capitulo_original titulo="${chapterTitle}">
${chapterText}
</texto_del_capitulo_original>

<instrucciones_de_refinamiento>
${notesXml}
</instrucciones_de_refinamiento>

<personajes_relevantes_activos>
${charactersXml.trim()}
</personajes_relevantes_activos>

<hitos_u_objetivos_de_la_escena>
${goalsXml}
</hitos_u_objetivos_de_la_escena>

Instrucciones:
1. Lee el <master_document> para recordar el contexto del mundo y las reglas.
2. Lee el <texto_del_capitulo_original> para entender el tono y el ritmo.
3. Aplica las modificaciones solicitadas en <instrucciones_de_refinamiento> sobre el capítulo original.
4. Asegúrate de que el resultado final incorpore los puntos listados en <hitos_u_objetivos_de_la_escena>.
5. Entrega el capítulo pulido y refinado de forma completa, devolviendo solo el texto del capítulo.
`;
    };

    return (
        <div className="w-full h-full flex flex-col bg-[var(--bg-editor)] overflow-hidden">
            {/* Header */}
            <div className="flex-none p-6 md:p-10 border-b border-[var(--border-main)] bg-[var(--bg-app)]/50">
                <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl md:text-5xl font-black font-serif text-[var(--accent-main)] tracking-tight mb-2">Prompt Studio</h1>
                        <p className="text-[var(--text-muted)] mt-2 font-medium">Exporta tu biblia (Master Doc Central) listas para la IA.</p>
                    </div>
                    <div className="flex bg-[var(--bg-editor)] p-1 rounded-xl border border-[var(--border-main)] shrink-0 shadow-sm overflow-x-auto scrollbar-hide w-full md:w-auto">
                        <button
                            onClick={() => setActiveTab('generation')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shrink-0 ${activeTab === 'generation' ? 'bg-[var(--accent-main)] text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]'}`}
                        >
                            <Sparkles size={16} className="inline mr-2" />
                            Crear Capítulos
                        </button>
                        <button
                            onClick={() => setActiveTab('refine')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shrink-0 ${activeTab === 'refine' ? 'bg-blue-500 text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-blue-500/10 hover:text-blue-500'}`}
                        >
                            <Edit3 size={16} className="inline mr-2" />
                            Refinar Capítulo
                        </button>
                        <button
                            onClick={() => setActiveTab('review')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shrink-0 ${activeTab === 'review' ? 'bg-orange-500 text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-orange-500/10 hover:text-orange-500'}`}
                        >
                            <CheckCircle2 size={16} className="inline mr-2" />
                            Revisar Errores
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Studio */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10 scrollbar-hide">
                <div className="max-w-4xl mx-auto flex flex-col gap-8 pb-20">

                    {/* Main UI or Post-Copy View */}
                    {isPostCopyView ? (
                        <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500 py-6 md:py-10 mt-4 md:mt-10">
                            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mb-4 md:mb-6 border border-green-500/20 shadow-lg shadow-green-500/10">
                                <CheckCircle2 size={36} />
                            </div>
                            <h2 className="text-2xl md:text-3xl font-black text-[var(--text-main)] mb-3 font-serif text-center">¡Prompt Copiado Exitosamente!</h2>
                            <p className="text-[var(--text-muted)] text-center max-w-lg mb-8 md:mb-10 text-sm px-4">
                                Tu prompt estructurado ya está en el portapapeles listo para pegarse en Gemini o cualquier IA.
                                {activeTab === 'generation' && selectedChapterId ? " Si necesitas copiar los títulos vinculados a este capítulo, puedes hacerlo usando los botones de abajo." : ""}
                            </p>

                            {activeTab === 'generation' && selectedChapterId && (() => {
                                const targetChapter = worldItems.find(c => c.id === selectedChapterId);
                                let vol = null;
                                if (targetChapter && targetChapter.parentId && targetChapter.parentId !== 'system_estructura') {
                                    vol = worldItems.find(c => c.id === targetChapter.parentId);
                                }
                                return (
                                    <div className="w-full max-w-md space-y-3 mb-10 px-4">
                                        {vol && (
                                            <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-4 shadow-sm">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[10px] uppercase font-bold text-[var(--accent-main)] tracking-widest mb-1">Volumen</div>
                                                        <div className="font-bold text-[var(--text-main)] text-base md:text-lg font-serif break-words">{estLabels[vol.id] || ''}{vol.title}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleCopyTitle('vol', `${estLabels[vol.id] || ''}${vol.title}`)}
                                                        className={`shrink-0 flex items-center justify-center font-bold text-xs px-3 h-9 rounded-xl transition-all ${copiedTitleId === 'vol' ? 'bg-green-500 text-white shadow-md' : 'bg-[var(--accent-soft)] text-[var(--accent-main)] hover:bg-[var(--accent-main)] hover:text-white'}`}
                                                    >
                                                        {copiedTitleId === 'vol' ? <CheckCircle2 size={16} /> : <span className="flex items-center gap-1.5"><Copy size={14} /> Copiar</span>}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        {targetChapter && (
                                            <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-4 shadow-sm">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[10px] uppercase font-bold text-[var(--accent-main)] tracking-widest mb-1">Capítulo</div>
                                                        <div className="font-bold text-[var(--text-main)] text-base md:text-lg font-serif break-words">{estLabels[targetChapter.id] || ''}{targetChapter.title}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleCopyTitle('chap', `${estLabels[targetChapter.id] || ''}${targetChapter.title}`)}
                                                        className={`shrink-0 flex items-center justify-center font-bold text-xs px-3 h-9 rounded-xl transition-all ${copiedTitleId === 'chap' ? 'bg-green-500 text-white shadow-md' : 'bg-[var(--accent-soft)] text-[var(--accent-main)] hover:bg-[var(--accent-main)] hover:text-white'}`}
                                                    >
                                                        {copiedTitleId === 'chap' ? <CheckCircle2 size={16} /> : <span className="flex items-center gap-1.5"><Copy size={14} /> Copiar</span>}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            <button
                                onClick={() => setIsPostCopyView(false)}
                                className="px-6 py-3 md:px-8 md:py-4 border border-[var(--border-main)] text-[var(--text-main)] hover:bg-[var(--bg-app)] font-bold rounded-2xl transition-all text-xs md:text-sm uppercase tracking-widest hover:border-[var(--text-muted)]"
                            >
                                Volver a configurar un nuevo prompt
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                {/* Role Summary Card */}
                                <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <h2 className="text-xs font-bold text-[var(--accent-main)] uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <ShieldCheck size={14} />
                                            <span>IA: {aiRoles.length > 1 ? `${aiRoles.length} Expertos Activos` : AI_ROLES.find(r => r.id === aiRoles[0])?.name}</span>
                                        </h2>
                                        <div className="flex flex-wrap gap-1 mb-4">
                                            {AI_ROLES.filter(r => aiRoles.includes(r.id)).map(role => (
                                                <span key={role.id} className="text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent-main)] px-2 py-0.5 rounded-md border border-[var(--accent-main)]/10">
                                                    {role.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsRoleModalOpen(true)}
                                        className="w-full py-2.5 rounded-xl border border-[var(--accent-main)]/30 text-[var(--accent-main)] text-xs font-bold hover:bg-[var(--accent-soft)] transition-all flex items-center justify-center gap-2"
                                    >
                                        Cambiar Personalidad
                                    </button>
                                </div>

                                {/* Context Summary Card */}
                                <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <h2 className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <CheckSquare size={14} />
                                            <span>Configuración de Contexto</span>
                                        </h2>
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            {includeCharacters && (
                                                <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20">
                                                    Personajes ({selectedCharacters.length || 'Todos'})
                                                </span>
                                            )}
                                            {includeNotasGenerales && (
                                                <span className="px-2 py-1 rounded-lg bg-orange-500/10 text-orange-500 text-[10px] font-bold border border-orange-500/20">
                                                    Notas
                                                </span>
                                            )}
                                            {includeEstructura && (
                                                <span className="px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 text-[10px] font-bold border border-indigo-500/20">
                                                    Estructura
                                                </span>
                                            )}
                                            <span className="px-2 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-main)] text-[10px] font-bold border border-[var(--accent-main)]/20">
                                                Biblia ({Object.values(includedSections).filter(v => v).length} ítems)
                                            </span>
                                            {activeTab === 'review' && includeContinuityCheck && (
                                                <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20">
                                                    Continuidad ON
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsContextModalOpen(true)}
                                        className="w-full py-2.5 rounded-xl border border-blue-500/30 text-blue-500 text-xs font-bold hover:bg-blue-500/10 transition-all flex items-center justify-center gap-2"
                                    >
                                        Configurar Contenido
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Target selection (For Generation, Refine and Review Mode) */}
                                {(activeTab === 'generation' || activeTab === 'refine' || activeTab === 'review') && (
                                    <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-6 shadow-sm animate-in fade-in duration-300">
                                        <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <span className="w-6 h-6 rounded bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent-main)] shrink-0">2</span>
                                            <span>¿Qué Capítulo vamos a {activeTab === 'refine' ? 'refinar' : activeTab === 'review' ? 'revisar' : 'escribir'}?</span>
                                        </h2>
                                        <div className="relative md:ml-8">
                                            {activeTab === 'generation' ? (
                                                <div className="space-y-3">
                                                    <button
                                                        onClick={() => setIsChapterModalOpen(true)}
                                                        className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-4 focus:outline-none hover:border-[var(--accent-main)] transition-all text-left flex items-center justify-between group shadow-sm"
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] uppercase font-bold text-[var(--accent-main)] tracking-widest leading-none mb-1">Capítulo Objetivo</span>
                                                            <span className="font-bold text-[var(--text-main)] font-serif">
                                                                {selectedChapterId ? (
                                                                    <>
                                                                        <span className="text-[var(--accent-main)]/70 mr-1">{estLabels[selectedChapterId] || ''}</span>
                                                                        {worldItems.find(c => c.id === selectedChapterId)?.title}
                                                                    </>
                                                                ) : "-- Autogeneración libre --"}
                                                            </span>
                                                        </div>
                                                        <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent-main)] group-hover:bg-[var(--accent-main)] group-hover:text-white transition-all">
                                                            <Sparkles size={18} />
                                                        </div>
                                                    </button>
                                                </div>
                                            ) : activeTab === 'refine' ? (
                                                <div className="space-y-3">
                                                    <button
                                                        onClick={() => setIsChapterModalOpen(true)}
                                                        className={`w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-4 focus:outline-none hover:border-blue-500 transition-all text-left flex items-center justify-between group shadow-sm ${selectedRefineChapterId && (chapters?.find(c => c.id === selectedRefineChapterId)?.status === 'Finalizado') ? 'ring-2 ring-emerald-500/20 opacity-90' : ''}`}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] uppercase font-bold text-blue-500 tracking-widest leading-none mb-1">Capítulo a Refinar</span>
                                                            <span className="font-bold text-[var(--text-main)] font-serif flex items-center gap-2">
                                                                {selectedRefineChapterId ? (
                                                                    <>
                                                                        {chapters?.find(c => c.id === selectedRefineChapterId)?.status === 'Finalizado' && <ShieldCheck size={14} className="text-emerald-500" />}
                                                                        <span className="text-blue-500/70 mr-1">{chapLabels[selectedRefineChapterId] || ''}</span>
                                                                        {chapters?.find(c => c.id === selectedRefineChapterId)?.title}
                                                                    </>
                                                                ) : "-- Selecciona un capítulo --"}
                                                            </span>
                                                        </div>
                                                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                                            <Edit3 size={18} />
                                                        </div>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-6">
                                                    {/* Opción A: Un solo capítulo (Continuidad) */}
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[10px] uppercase font-bold text-orange-500 tracking-widest ml-1">Revisión Unitaria (Continuidad)</label>
                                                        <button
                                                            onClick={() => {
                                                                setReviewSelectionType('single');
                                                                setIsChapterModalOpen(true);
                                                            }}
                                                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-4 focus:outline-none hover:border-orange-500 transition-all text-left flex items-center justify-between group shadow-sm"
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-[var(--text-main)] font-serif">
                                                                    {selectedReviewChapterId ? (
                                                                        <>
                                                                            <span className="text-orange-500/70 mr-1">{chapLabels[selectedReviewChapterId] || ''}</span>
                                                                            {chapters?.find(c => c.id === selectedReviewChapterId)?.title}
                                                                        </>
                                                                    ) : "-- Todos los borradores --"}
                                                                </span>
                                                            </div>
                                                            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-all">
                                                                <CheckCircle2 size={18} />
                                                            </div>
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center gap-4 py-0">
                                                        <div className="h-px flex-1 bg-[var(--border-main)]"></div>
                                                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">O TAMBIÉN</span>
                                                        <div className="h-px flex-1 bg-[var(--border-main)]"></div>
                                                    </div>

                                                    {/* Opción B: Rango de capítulos */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-[10px] uppercase font-bold text-orange-500 tracking-widest ml-1">Desde</label>
                                                            <button
                                                                onClick={() => {
                                                                    setReviewSelectionType('start');
                                                                    setIsChapterModalOpen(true);
                                                                }}
                                                                className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none hover:border-orange-500 transition-all text-left flex items-center justify-between group shadow-sm"
                                                            >
                                                                <span className="font-bold text-[var(--text-main)] font-serif text-sm truncate">
                                                                    {reviewStartId ? (
                                                                        <>
                                                                            <span className="text-orange-500/70 mr-1">{chapLabels[reviewStartId] || ''}</span>
                                                                            {chapters?.find(c => c.id === reviewStartId)?.title}
                                                                        </>
                                                                    ) : "Selecciona Inicio"}
                                                                </span>
                                                                <ChevronDown size={14} className="text-orange-500" />
                                                            </button>
                                                        </div>
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-[10px] uppercase font-bold text-orange-500 tracking-widest ml-1">Hasta</label>
                                                            <button
                                                                onClick={() => {
                                                                    setReviewSelectionType('end');
                                                                    setIsChapterModalOpen(true);
                                                                }}
                                                                className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none hover:border-orange-500 transition-all text-left flex items-center justify-between group shadow-sm"
                                                            >
                                                                <span className="font-bold text-[var(--text-main)] font-serif text-sm truncate">
                                                                    {reviewEndId ? (
                                                                        <>
                                                                            <span className="text-orange-500/70 mr-1">{chapLabels[reviewEndId] || ''}</span>
                                                                            {chapters?.find(c => c.id === reviewEndId)?.title}
                                                                        </>
                                                                    ) : "Selecciona Fin"}
                                                                </span>
                                                                <ChevronDown size={14} className="text-orange-500" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] mt-4 md:ml-8 font-[Arial,sans-serif]">
                                            {activeTab === 'generation'
                                                ? "* Se le pasará el nombre y el Volumen al cual pertenece este capítulo a Gemini. Su sinopsis o temporalidad debes agregarla abajo."
                                                : activeTab === 'refine' ? "* El texto íntegro del capítulo seleccionado se incluirá en el prompt para que la IA lo utilice como base de la reescritura."
                                                    : "* Selecciona un capítulo para una revisión enfocada. Si no eliges nada, se enviarán todos los borradores."}
                                        </p>
                                    </div>
                                )}

                                {/* Scene Goals (For Generation and Refine Mode) */}
                                {(activeTab === 'generation' || activeTab === 'refine') && (
                                    <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-6 shadow-sm animate-in fade-in duration-300">
                                        <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <span className="w-6 h-6 rounded bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">3</span>
                                            <span>¿Qué DEBE suceder en esta escena? (Hitos)</span>
                                        </h2>
                                        <div className="md:ml-8">
                                            <textarea
                                                value={sceneGoals}
                                                onChange={(e) => setSceneGoals(e.target.value)}
                                                placeholder="Ej: 'Juan encuentra la carta secreta', 'María decide confesar su amor', 'Termina en un cliffhanger'..."
                                                className="w-full h-24 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 text-[var(--text-main)] resize-none transition-all font-[Arial,sans-serif]"
                                            ></textarea>
                                            <div className="flex items-center justify-between mt-2">
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    * Estos puntos serán tratados como requisitos obligatorios para la trama por la IA.
                                                </p>
                                                {sceneGoals && (
                                                    <button
                                                        onClick={() => setSceneGoals('')}
                                                        className="text-[10px] font-bold text-red-500/70 hover:text-red-500 uppercase tracking-tighter transition-colors"
                                                    >
                                                        Limpiar Hitos
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Extra Notes */}
                                <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-4 md:p-6 shadow-sm relative transition-all focus-within:ring-2 focus-within:ring-[var(--accent-main)]/50 focus-within:border-[var(--accent-main)]">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                                        <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-start sm:items-center gap-2">
                                            <span className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${activeTab === 'generation' ? 'bg-[var(--accent-soft)] text-[var(--accent-main)]' : 'bg-orange-500/10 text-orange-500'}`}>
                                                {activeTab === 'generation' ? '4' : '3'}
                                            </span>
                                            <span className="mt-0.5 sm:mt-0">Instrucciones Generativas del Autor (Opcional)</span>
                                        </h2>
                                        <div className="flex items-center gap-4 sm:ml-0 ml-8">
                                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIncludeAutorNotes(!includeAutorNotes)}>
                                                <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">Incluir esto:</span>
                                                {includeAutorNotes ? <CheckSquare size={16} className="text-orange-500" /> : <Square size={16} className="text-[var(--text-muted)]" />}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="md:ml-8">
                                        <textarea
                                            value={promptNotes}
                                            onChange={(e) => setPromptNotes(e.target.value)}
                                            placeholder={activeTab === 'generation' ? "Escribe aquí las sinopsis, directrices o reglas que quieras exportar exclusivamente en este prompt específico..." : activeTab === 'refine' ? "Indica qué quieres modificar del episodio (ej: 'Haz que el diálogo parezca más tenso', 'Añade más descripciones del entorno', etc.)." : "Ej: 'Concéntrate más que nada en la relación de Juan y María', o 'Revisa si mis escenarios tienen sentido'..."}
                                            className={`w-full h-40 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--accent-main)] text-[var(--text-main)] resize-none transition-opacity font-[Arial,sans-serif] ${!includeAutorNotes ? 'opacity-50' : ''}`}
                                        ></textarea>
                                        <div className="flex items-center justify-between mt-3">
                                            <p className="text-xs text-[var(--text-muted)] text-center sm:text-left">Estas instrucciones se mantendrán para que puedas reutilizarlas o ajustarlas.</p>
                                            {promptNotes && (
                                                <button
                                                    onClick={() => setPromptNotes('')}
                                                    className="text-[10px] font-bold text-red-500/70 hover:text-red-500 uppercase tracking-tighter transition-colors"
                                                >
                                                    Limpiar Instrucciones
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Shield banner for finalized chapters */}
                                    {activeTab === 'refine' && selectedRefineChapterId && (() => {
                                        const ch = chapters?.find(c => c.id === selectedRefineChapterId);
                                        if (ch && ch.status === 'Finalizado') {
                                            return (
                                                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-4 animate-in fade-in zoom-in-95 duration-300 mt-4">
                                                    <ShieldCheck className="text-emerald-500 shrink-0 mt-0.5" size={20} />
                                                    <div>
                                                        <h3 className="text-emerald-600 dark:text-emerald-400 font-bold text-sm mb-1">Capítulo Finalizado y Protegido</h3>
                                                        <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 font-[Arial,sans-serif]">Este capítulo ha sido marcado como <strong>Finalizado</strong> por el autor. No se permite refinarlo para proteger la integridad del manuscrito terminado. Si deseas modificarlo, primero cambia su estado en el Editor.</p>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>

                                {/* Selected Mode Warning / Message */}
                                {activeTab === 'review' && (
                                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 flex items-start gap-4 animate-in fade-in zoom-in-95 duration-300">
                                        <CheckCircle2 className="text-orange-500 shrink-0 mt-0.5" size={20} />
                                        <div>
                                            <h3 className="text-orange-600 dark:text-orange-400 font-bold text-sm mb-1">Modo Revisión Activado</h3>
                                            <p className="text-xs text-orange-700/80 dark:text-orange-300/80 font-[Arial,sans-serif]">Este prompt recogerá <strong>todos los capítulos</strong> de tu manuscrito (texto plano) y todo tu Master Doc seleccionado, pidiéndole a la IA que no sea excesivamente estricta y analice errores de continuidad, trama y huecos argumentales con sugerencias amigables.</p>
                                        </div>
                                    </div>
                                )}
                                {activeTab === 'refine' && (
                                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex items-start gap-4 animate-in fade-in zoom-in-95 duration-300">
                                        <Edit3 className="text-blue-500 shrink-0 mt-0.5" size={20} />
                                        <div>
                                            <h3 className="text-blue-600 dark:text-blue-400 font-bold text-sm mb-1">Modo Refinador Activado</h3>
                                            <p className="text-xs text-blue-700/80 dark:text-blue-300/80 font-[Arial,sans-serif]">Este prompt cargará el <strong>texto original</strong> del capítulo seleccionado para que la IA lo modifique de acuerdo a las indicaciones dadas de forma precisa.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Export Action */}
                                <div className={`flex flex-col items-center justify-center mt-10 p-6 bg-gradient-to-br from-[var(--bg-app)] to-[var(--bg-sidebar)] border border-[var(--border-main)] rounded-3xl shadow-sm transition-all duration-500 ${activeTab === 'review' ? 'shadow-orange-500/10 border-orange-500/20' : activeTab === 'refine' ? 'shadow-blue-500/10 border-blue-500/20' : ''}`}>
                                    <button
                                        onClick={handleCopy}
                                        disabled={activeTab === 'refine' && selectedRefineChapterId && chapters?.find(c => c.id === selectedRefineChapterId)?.status === 'Finalizado'}
                                        className={`group relative w-full md:w-auto px-10 py-5 transition-all duration-300 text-white text-lg font-bold rounded-2xl flex items-center justify-center gap-3 overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed ${copied ? 'bg-green-500 hover:bg-green-600' : (activeTab === 'review' ? 'bg-orange-500 hover:bg-orange-600' : activeTab === 'refine' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-[var(--accent-main)] hover:bg-indigo-600')}`}
                                    >
                                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                        <span className="relative z-10 flex items-center gap-2">
                                            {copied ? <CheckCircle2 size={24} /> : (activeTab === 'review' ? <CheckCircle2 size={24} /> : activeTab === 'refine' ? <Edit3 size={24} /> : <Sparkles size={24} />)}
                                            {copied ? "¡Prompt copiado al portapapeles!" : (activeTab === 'review' ? "Copiar Prompt de Revisión" : activeTab === 'refine' ? "Copiar Prompt de Refinado" : "Copiar Prompt Optimizado")}
                                        </span>
                                    </button>
                                    <p className="text-xs text-[var(--text-muted)]/60 mt-4 uppercase tracking-widest font-bold">Pégalo en Gemini y observa la magia</p>

                                    {/* Context Weight Thermometer */}
                                    <div className="w-full max-w-md mt-8 pt-6 border-t border-[var(--border-main)]/50">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${weightStatus.bg} animate-pulse`}></div>
                                                <span className={`text-[10px] uppercase font-black tracking-tighter ${weightStatus.color}`}>Carga de Contexto: {weightStatus.label}</span>
                                            </div>
                                            <span className="text-[10px] font-mono text-[var(--text-muted)]">~{(promptWeight / 4).toFixed(0)} TOKENS</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-[var(--bg-editor)] rounded-full overflow-hidden border border-[var(--border-main)]/30">
                                            <div
                                                className={`h-full transition-all duration-700 ease-out ${weightStatus.bg}`}
                                                style={{ width: `${Math.min((promptWeight / 250000) * 100, 100)}%` }}
                                            ></div>
                                        </div>
                                        <div className="flex flex-col items-center gap-1 mt-3">
                                            <p className="text-[10px] text-center text-[var(--text-muted)] font-medium italic">
                                                "{weightStatus.desc}"
                                            </p>
                                            <p className="text-[8px] uppercase tracking-tighter font-black text-[var(--accent-main)]/50">
                                                Estos prompts están optimizados para los modelos Gemini Pro
                                            </p>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* AI Personality Modal */}
            {isRoleModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsRoleModalOpen(false)}></div>
                    <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-[var(--border-main)]">
                            <div>
                                <h3 className="text-xl font-bold text-[var(--text-main)] font-serif italic">Personalidad de la IA</h3>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Selecciona cómo quieres que actúe Gemini para este prompt.</p>
                            </div>
                            <button onClick={() => setIsRoleModalOpen(false)} className="p-2 rounded-xl hover:bg-[var(--bg-editor)] text-[var(--text-muted)] transition-colors"><ShieldCheck size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {AI_ROLES.map((role) => (
                                    <button
                                        key={role.id}
                                        onClick={() => {
                                            setAiRoles(prev =>
                                                prev.includes(role.id)
                                                    ? (prev.length > 1 ? prev.filter(id => id !== role.id) : prev)
                                                    : [...prev, role.id]
                                            );
                                        }}
                                        className={`flex flex-col p-5 rounded-2xl border text-left transition-all group ${aiRoles.includes(role.id) ? 'bg-[var(--accent-main)] border-[var(--accent-main)] shadow-xl shadow-[var(--accent-main)]/20' : 'bg-[var(--bg-editor)] border-[var(--border-main)] hover:border-[var(--accent-main)]/50 focus:ring-2 ring-[var(--accent-main)]'}`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <span className={`text-sm font-black uppercase tracking-tight ${aiRoles.includes(role.id) ? 'text-white' : 'text-[var(--text-main)]'}`}>{role.name}</span>
                                            {aiRoles.includes(role.id) && <CheckCircle2 size={16} className="text-white" />}
                                        </div>
                                        <p className={`text-xs leading-relaxed font-medium ${aiRoles.includes(role.id) ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>{role.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="p-6 bg-[var(--bg-editor)] border-t border-[var(--border-main)] flex justify-end">
                            <button onClick={() => setIsRoleModalOpen(false)} className="px-6 py-2 bg-[var(--accent-main)] text-white font-bold rounded-xl shadow-lg">Listo</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Context Configuration Modal */}
            {isContextModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsContextModalOpen(false)}></div>
                    <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-[var(--border-main)]">
                            <div>
                                <h3 className="text-xl font-bold text-[var(--text-main)] font-serif italic">Configuración de Contexto</h3>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Activa o desactiva qué información del Master Doc y personajes se enviará a la IA.</p>
                            </div>
                            <button onClick={() => setIsContextModalOpen(false)} className="p-2 rounded-xl hover:bg-[var(--bg-editor)] text-[var(--text-muted)] transition-colors"><Edit3 size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                {/* Left Column: Core Items */}
                                <div className="space-y-8">
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)] flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-main)]"></div>
                                            Elementos Base
                                        </h4>
                                        <div className="grid grid-cols-1 gap-3">
                                            <button onClick={() => setIncludeCharacters(!includeCharacters)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${includeCharacters ? 'bg-blue-500/5 border-blue-500/30' : 'bg-[var(--bg-editor)] border-[var(--border-main)]'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${includeCharacters ? 'bg-blue-500 text-white' : 'bg-[var(--accent-soft)] text-[var(--text-muted)]'}`}><Sparkles size={16} /></div>
                                                    <span className={`text-sm font-bold ${includeCharacters ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Incluir Personajes</span>
                                                </div>
                                                {includeCharacters ? <CheckSquare size={20} className="text-blue-500" /> : <Square size={20} className="text-[var(--text-muted)]" />}
                                            </button>

                                            {includeCharacters && (
                                                <div className="ml-4 p-4 border-l-2 border-blue-500/20 space-y-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {characters.map(c => (
                                                            <button key={c.id} onClick={() => toggleCharacter(c.id)} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${selectedCharacters.includes(c.id) ? 'bg-blue-500 border-blue-600 text-white shadow-md' : 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-blue-500/30'}`}>
                                                                {c.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {selectedCharacters.length > 0 && (
                                                        <button onClick={() => setSelectedCharacters([])} className="text-[10px] font-bold text-red-500/70 hover:text-red-500 transition-colors">LIMPIAR CASTING</button>
                                                    )}
                                                </div>
                                            )}

                                            <button onClick={() => setIncludeNotasGenerales(!includeNotasGenerales)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${includeNotasGenerales ? 'bg-orange-500/5 border-orange-500/30' : 'bg-[var(--bg-editor)] border-[var(--border-main)]'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${includeNotasGenerales ? 'bg-orange-500 text-white' : 'bg-[var(--accent-soft)] text-[var(--text-muted)]'}`}><Edit3 size={16} /></div>
                                                    <span className={`text-sm font-bold ${includeNotasGenerales ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Notas Adicionales del Mundo</span>
                                                </div>
                                                {includeNotasGenerales ? <CheckSquare size={20} className="text-orange-500" /> : <Square size={20} className="text-[var(--text-muted)]" />}
                                            </button>

                                            <button onClick={() => setIncludeEstructura(!includeEstructura)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${includeEstructura ? 'bg-indigo-500/5 border-indigo-500/30' : 'bg-[var(--bg-editor)] border-[var(--border-main)]'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${includeEstructura ? 'bg-indigo-500 text-white' : 'bg-[var(--accent-soft)] text-[var(--text-muted)]'}`}><ShieldCheck size={16} /></div>
                                                    <span className={`text-sm font-bold ${includeEstructura ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Estructura (Timeline)</span>
                                                </div>
                                                {includeEstructura ? <CheckSquare size={20} className="text-indigo-500" /> : <Square size={20} className="text-[var(--text-muted)]" />}
                                            </button>

                                            {activeTab === 'review' && (
                                                <button onClick={() => setIncludeContinuityCheck(!includeContinuityCheck)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${includeContinuityCheck ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-[var(--bg-editor)] border-[var(--border-main)]'}`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-lg ${includeContinuityCheck ? 'bg-emerald-500 text-white' : 'bg-[var(--accent-soft)] text-[var(--text-muted)]'}`}><CheckCircle2 size={16} /></div>
                                                        <span className={`text-sm font-bold ${includeContinuityCheck ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Check de Continuidad</span>
                                                    </div>
                                                    {includeContinuityCheck ? <CheckSquare size={20} className="text-emerald-500" /> : <Square size={20} className="text-[var(--text-muted)]" />}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Master Doc Hierarchy */}
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)] flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-main)]"></div>
                                        Biblia del Mundo (Jerarquía)
                                    </h4>
                                    <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl p-6 overflow-hidden">
                                        {(() => {
                                            const renderTree = (parentId, depth = 0) => {
                                                const items = worldItems.filter(i => i.parentId === parentId);
                                                if (items.length === 0) return null;

                                                return (
                                                    <div className={`space-y-1 ${depth > 0 ? 'ml-6 mt-1 border-l border-[var(--border-main)]/50 pl-4' : ''}`}>
                                                        {items.map(item => (
                                                            <div key={item.id}>
                                                                <button
                                                                    onClick={() => toggleSection(item.id)}
                                                                    className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${includedSections[item.id] ? 'bg-[var(--accent-soft)] text-[var(--accent-main)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-app)]'}`}
                                                                >
                                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                                        {item.isCategory ? <ChevronDown size={14} className={includedSections[item.id] ? '' : '-rotate-90'} /> : <div className="w-3.5 h-3.5 bg-current opacity-10 rounded-sm shrink-0"></div>}
                                                                        <span className="text-xs font-bold truncate">{item.title}</span>
                                                                    </div>
                                                                    {includedSections[item.id] ? <CheckSquare size={14} /> : <Square size={14} />}
                                                                </button>
                                                                {includedSections[item.id] && renderTree(item.id, depth + 1)}
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            };
                                            const roots = worldItems.filter(i => i.parentId === null);
                                            return roots.length > 0 ? renderTree(null) : <p className="text-[10px] text-[var(--text-muted)] italic">No hay categorías personalizadas.</p>;
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-[var(--bg-editor)] border-t border-[var(--border-main)] flex justify-between items-center">
                            <p className="text-[10px] font-medium text-[var(--text-muted)]">Los cambios se aplican inmediatamente al prompt.</p>
                            <button onClick={() => setIsContextModalOpen(false)} className="px-10 py-3 bg-[var(--accent-main)] text-white font-bold rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all">Guardar Configuración</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Chapter Selection Modal (Mosaic Idea 1) */}
            {isChapterModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsChapterModalOpen(false)}></div>
                    <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-[var(--border-main)]">
                            <div>
                                <h3 className="text-xl font-bold text-[var(--text-main)] font-serif italic">Mosaico de Capítulos</h3>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Selecciona el capítulo sobre el cual quieres que Gemini trabaje.</p>
                            </div>
                            <button onClick={() => setIsChapterModalOpen(false)} className="p-2 rounded-xl hover:bg-[var(--bg-editor)] text-[var(--text-muted)] transition-colors"><ChevronDown size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-hide bg-[var(--bg-editor)]/30">
                            <div className="space-y-10">
                                {/* Option: Autogeneration / All Chapters (Only for Generation/Review) */}
                                {(activeTab === 'generation' || activeTab === 'review') && reviewSelectionType === 'single' && (
                                    <div className="flex justify-center">
                                        <button
                                            onClick={() => {
                                                if (activeTab === 'generation') setSelectedChapterId('');
                                                else {
                                                    setSelectedReviewChapterId('');
                                                    setReviewStartId('');
                                                    setReviewEndId('');
                                                }
                                                setIsChapterModalOpen(false);
                                            }}
                                            className={`group relative overflow-hidden px-8 py-5 rounded-2xl border transition-all flex items-center gap-4 ${(activeTab === 'generation' ? !selectedChapterId : !selectedReviewChapterId) ? `bg-[var(--accent-main)] border-[var(--accent-main)] text-white shadow-xl shadow-[var(--accent-main)]/20` : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-[var(--accent-main)] text-[var(--text-main)]'}`}
                                        >
                                            <Sparkles size={24} className={(activeTab === 'generation' ? !selectedChapterId : !selectedReviewChapterId) ? 'text-white' : 'text-[var(--accent-main)]'} />
                                            <div className="text-left">
                                                <div className="text-[10px] uppercase font-bold tracking-widest opacity-70">Modo Directo</div>
                                                <div className="font-bold text-lg font-serif">
                                                    {activeTab === 'generation' ? "Autogeneración Libre" : "Todos los borradores"}
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                )}

                                {/* Volumes and Chapters Mosaic */}
                                {(() => {
                                    // Use chapters from DataContext for Refine/Review, worldItems for Generation
                                    const sourceChapters = (activeTab === 'refine' || activeTab === 'review') ? chapters : worldItems;
                                    const sourceLabels = (activeTab === 'refine' || activeTab === 'review') ? chapLabels : estLabels;
                                    const parentIdField = (activeTab === 'refine' || activeTab === 'review') ? 'parentId' : 'parentId';

                                    const volumes = sourceChapters.filter(w => (activeTab === 'refine' || activeTab === 'review') ? w.isVolume : (w.parentId === 'system_estructura' && w.isCategory));
                                    
                                    return volumes.map(vol => {
                                        const children = sourceChapters.filter(w => w.parentId === vol.id && ((activeTab === 'refine' || activeTab === 'review') ? !w.isVolume : true));
                                        if (children.length === 0) return null;

                                        return (
                                            <div key={vol.id} className="space-y-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--border-main)]"></div>
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] flex items-center gap-2">
                                                        {sourceLabels[vol.id] || ''}{vol.title}
                                                    </h4>
                                                    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--border-main)]"></div>
                                                </div>
                                                
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                                    {children.map(c => {
                                                        const isSelected = activeTab === 'generation' 
                                                            ? selectedChapterId === c.id 
                                                            : activeTab === 'refine' 
                                                                ? selectedRefineChapterId === c.id 
                                                                : reviewSelectionType === 'single' 
                                                                    ? selectedReviewChapterId === c.id 
                                                                    : reviewSelectionType === 'start' 
                                                                        ? reviewStartId === c.id 
                                                                        : reviewEndId === c.id;

                                                        const isFinalized = (activeTab === 'refine' || activeTab === 'review') && c.status === 'Finalizado';
                                                        const isDisabled = activeTab === 'refine' && isFinalized;

                                                        const accentColor = activeTab === 'refine' ? 'blue-500' : activeTab === 'review' ? 'orange-500' : '[var(--accent-main)]';
                                                        const softBg = activeTab === 'refine' ? 'bg-blue-500/10' : activeTab === 'review' ? 'bg-orange-500/10' : 'bg-[var(--accent-soft)]';

                                                        return (
                                                            <button
                                                                key={c.id}
                                                                disabled={isDisabled}
                                                                onClick={() => {
                                                                    if (activeTab === 'generation') setSelectedChapterId(c.id);
                                                                    else if (activeTab === 'refine') setSelectedRefineChapterId(c.id);
                                                                    else {
                                                                        if (reviewSelectionType === 'single') {
                                                                            setSelectedReviewChapterId(c.id);
                                                                            setReviewStartId('');
                                                                            setReviewEndId('');
                                                                        } else if (reviewSelectionType === 'start') {
                                                                            setReviewStartId(c.id);
                                                                            setSelectedReviewChapterId('');
                                                                        } else {
                                                                            setReviewEndId(c.id);
                                                                            setSelectedReviewChapterId('');
                                                                        }
                                                                    }
                                                                    setIsChapterModalOpen(false);
                                                                }}
                                                                className={`group relative p-5 rounded-2xl border transition-all text-left flex flex-col justify-between h-32 ${isSelected ? `bg-${accentColor.replace('[', '').replace(']', '')} border-${accentColor.replace('[', '').replace(']', '')} shadow-xl` : `bg-[var(--bg-app)] border-[var(--border-main)] hover:border-${accentColor.replace('[', '').replace(']', '')}/50 hover:translate-y--1`} ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                                                                style={isSelected && (accentColor === '[var(--accent-main)]') ? { backgroundColor: 'var(--accent-main)', borderColor: 'var(--accent-main)' } : {}}
                                                            >
                                                                <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 flex justify-between items-center ${isSelected ? 'text-white/70' : `text-${accentColor.replace('[', '').replace(']', '')}`}`} style={!isSelected && (accentColor === '[var(--accent-main)]') ? { color: 'var(--accent-main)' } : {}}>
                                                                    <span>{sourceLabels[c.id]?.replace(': ', '') || 'Capítulo'}</span>
                                                                    {isFinalized && <ShieldCheck size={12} />}
                                                                </div>
                                                                <div className={`font-bold text-sm font-serif line-clamp-2 leading-tight ${isSelected ? 'text-white' : 'text-[var(--text-main)]'}`}>
                                                                    {c.title}
                                                                </div>
                                                                <div className="mt-auto flex justify-end">
                                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isSelected ? 'bg-white/20 text-white' : `${softBg} text-${accentColor.replace('[', '').replace(']', '')}`}`} style={!isSelected && (accentColor === '[var(--accent-main)]') ? { color: 'var(--accent-main)' } : {}}>
                                                                        {activeTab === 'refine' ? <Edit3 size={14} /> : activeTab === 'review' ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}

                                {/* Standalone Chapters Mosaic */}
                                {(() => {
                                    const sourceChapters = (activeTab === 'refine' || activeTab === 'review') ? chapters : worldItems;
                                    const sourceLabels = (activeTab === 'refine' || activeTab === 'review') ? chapLabels : estLabels;
                                    
                                    const standalone = sourceChapters.filter(w => (activeTab === 'refine' || activeTab === 'review') ? (!w.parentId && !w.isVolume) : (w.parentId === 'system_estructura' && !w.isCategory));
                                    if (standalone.length === 0) return null;

                                    return (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-4">
                                                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--border-main)]"></div>
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Capítulos Sueltos</h4>
                                                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--border-main)]"></div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                                {standalone.map(c => {
                                                    const isSelected = activeTab === 'generation' 
                                                        ? selectedChapterId === c.id 
                                                        : activeTab === 'refine' 
                                                            ? selectedRefineChapterId === c.id 
                                                            : reviewSelectionType === 'single' 
                                                                ? selectedReviewChapterId === c.id 
                                                                : reviewSelectionType === 'start' 
                                                                    ? reviewStartId === c.id 
                                                                    : reviewEndId === c.id;

                                                    const isFinalized = (activeTab === 'refine' || activeTab === 'review') && c.status === 'Finalizado';
                                                    const isDisabled = activeTab === 'refine' && isFinalized;
                                                    
                                                    const accentColor = activeTab === 'refine' ? 'blue-500' : activeTab === 'review' ? 'orange-500' : '[var(--accent-main)]';
                                                    const softBg = activeTab === 'refine' ? 'bg-blue-500/10' : activeTab === 'review' ? 'bg-orange-500/10' : 'bg-[var(--accent-soft)]';

                                                    return (
                                                        <button
                                                            key={c.id}
                                                            disabled={isDisabled}
                                                            onClick={() => {
                                                                if (activeTab === 'generation') setSelectedChapterId(c.id);
                                                                else if (activeTab === 'refine') setSelectedRefineChapterId(c.id);
                                                                else {
                                                                    if (reviewSelectionType === 'single') {
                                                                        setSelectedReviewChapterId(c.id);
                                                                        setReviewStartId('');
                                                                        setReviewEndId('');
                                                                    } else if (reviewSelectionType === 'start') {
                                                                        setReviewStartId(c.id);
                                                                        setSelectedReviewChapterId('');
                                                                    } else {
                                                                        setReviewEndId(c.id);
                                                                        setSelectedReviewChapterId('');
                                                                    }
                                                                }
                                                                setIsChapterModalOpen(false);
                                                            }}
                                                            className={`group relative p-5 rounded-2xl border transition-all text-left flex flex-col justify-between h-32 ${isSelected ? `bg-${accentColor.replace('[', '').replace(']', '')} border-${accentColor.replace('[', '').replace(']', '')} shadow-xl` : `bg-[var(--bg-app)] border-[var(--border-main)] hover:border-${accentColor.replace('[', '').replace(']', '')}/50`} ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                                                            style={isSelected && (accentColor === '[var(--accent-main)]') ? { backgroundColor: 'var(--accent-main)', borderColor: 'var(--accent-main)' } : {}}
                                                        >
                                                            <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 flex justify-between items-center ${isSelected ? 'text-white/70' : `text-${accentColor.replace('[', '').replace(']', '')}`}`} style={!isSelected && (accentColor === '[var(--accent-main)]') ? { color: 'var(--accent-main)' } : {}}>
                                                                <span>{sourceLabels[c.id]?.replace(': ', '') || 'Capítulo'}</span>
                                                                {isFinalized && <ShieldCheck size={12} />}
                                                            </div>
                                                            <div className={`font-bold text-sm font-serif line-clamp-2 leading-tight ${isSelected ? 'text-white' : 'text-[var(--text-main)]'}`}>
                                                                {c.title}
                                                            </div>
                                                            <div className="mt-auto flex justify-end">
                                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-white/20 text-white' : `${softBg} text-${accentColor.replace('[', '').replace(']', '')}`}`} style={!isSelected && (accentColor === '[var(--accent-main)]') ? { color: 'var(--accent-main)' } : {}}>
                                                                    {activeTab === 'refine' ? <Edit3 size={14} /> : activeTab === 'review' ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="p-6 bg-[var(--bg-editor)] border-t border-[var(--border-main)] flex justify-end">
                            <button onClick={() => setIsChapterModalOpen(false)} className="px-8 py-3 bg-[var(--accent-main)] text-white font-bold rounded-2xl shadow-lg hover:scale-[1.02] transition-transform">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromptStudioView;
