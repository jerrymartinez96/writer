import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { Sparkles, Copy, CheckCircle2, ChevronDown, CheckSquare, Square, Edit3, ShieldCheck } from 'lucide-react';

const PromptStudioView = () => {
    const { activeBook, chapters, characters, worldItems, updateBookData, promptStudioPreload, setPromptStudioPreload } = useData();
    const [selectedChapterId, setSelectedChapterId] = useState('');
    const [selectedRefineChapterId, setSelectedRefineChapterId] = useState('');
    const [promptNotes, setPromptNotes] = useState('');
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState('generation'); // 'generation' or 'review'
    const [isPostCopyView, setIsPostCopyView] = useState(false);
    const [copiedTitleId, setCopiedTitleId] = useState(null);

    // Filter states
    const [includeCharacters, setIncludeCharacters] = useState(true);
    const [includeNotasGenerales, setIncludeNotasGenerales] = useState(true);
    const [includeEstructura, setIncludeEstructura] = useState(true);
    const [includeAutorNotes, setIncludeAutorNotes] = useState(true);
    const [includedSections, setIncludedSections] = useState({});

    // Dynamic Master Doc roots
    const rootMasterDocSections = worldItems.filter(i => i.parentId === null);

    // Initialize included sections for dynamic cards
    useEffect(() => {
        setIncludedSections(prev => {
            const newState = { ...prev };
            rootMasterDocSections.forEach(i => {
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
        setPromptNotes('');
    };

    const handleCopyTitle = (id, text) => {
        navigator.clipboard.writeText(text);
        setCopiedTitleId(id);
        setTimeout(() => setCopiedTitleId(null), 2000);
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
        const charactersXml = (includeCharacters && characters.length > 0) ? characters.map(c => `
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

        // Function to recursively get content of sections
        const getSectionContent = (parentId) => {
            const children = worldItems.filter(i => i.parentId === parentId);
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

        return `Actúa como un escritor veterano y experto en ritmos narrativos. Debe ser detallado, extenso y fluido.
A continuación, te entrego la biblia de mi obra. Este será tu núcleo de verdad absoluto y nunca lo debes romper.
Escribe por lo menos de 2000 a 3000 palabras.

<master_document>
${fullMasterDocumentXml || 'Documento vacío.'}
</master_document>

<notas_exclusivas_para_esta_respuesta>
${notesXml}
</notas_exclusivas_para_esta_respuesta>

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
</instrucciones_de_escritura>

Escribe tu respuesta a continuación:
`;
    };
    const generateReviewPrompt = () => {
        const charactersXml = (includeCharacters && characters.length > 0) ? characters.map(c => `
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

        const chaptersText = (chapters && chapters.length > 0) ? chapters.filter(c => !c.isVolume && c.status !== 'Finalizado').map(c => `
--- [CAPÍTULO: ${c.title}] ---
${c.content ? c.content.replace(/<[^>]*>?/gm, '') : 'Sin contenido'}
        `).join('\n') : "Sin capítulos escritos.";

        return `Actúa como un editor literario y de continuidad, especializado en novelas de autores nuevos o amateurs. 
Tu objetivo es leer el documento maestro (que contiene la biblia y reglas de este mundo) y compararlo con los capítulos que ya he escrito, para detectar de manera amable y constructiva:
1. Huecos argumentales (Plot holes).
2. Errores de trama o de lógica interna.
3. Errores de continuidad.
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
        const charactersXml = (includeCharacters && characters.length > 0) ? characters.map(c => `
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

        const notesXml = (includeAutorNotes && promptNotes.trim()) ? promptNotes.trim() : "Sin instrucciones de refinamiento detalladas.";

        const targetChapter = chapters?.find(c => c.id === selectedRefineChapterId);
        const chapterText = targetChapter ? (targetChapter.content ? targetChapter.content.replace(/<[^>]*>?/gm, '') : 'Sin contenido') : 'Capítulo no seleccionado o sin contenido.';
        const chapterTitle = targetChapter ? targetChapter.title : '';

        return `Actúa como un editor y co-escritor experto. Tu objetivo es refinar y mejorar un capítulo específico que ya he escrito, siguiendo mis instrucciones al pie de la letra. No lo reescribas desde cero perdiendo su esencia original, simplemente refínalo para que cumpla con las indicaciones dadas.

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

Instrucciones:
1. Lee el <master_document> para recordar el contexto del mundo y las reglas.
2. Lee el <texto_del_capitulo_original> para entender el tono y el ritmo.
3. Aplica las modificaciones solicitadas en <instrucciones_de_refinamiento> sobre el capítulo original.
4. Entrega el capítulo pulido y refinado de forma completa, devolviendo solo el texto del capítulo.
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
                            {/* Checkboxes para filtros */}
                            <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-6 shadow-sm">
                                <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent-main)] shrink-0">1</span>
                                    <span>¿Qué partes del ecosistema enviamos a la IA?</span>
                                </h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 md:ml-8">
                                    {/* Personajes */}
                                    <button
                                        onClick={() => setIncludeCharacters(!includeCharacters)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all shadow-sm ${includeCharacters ? 'bg-blue-500/10 border-blue-500 text-[var(--text-main)]' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-blue-500/50'}`}
                                    >
                                        {includeCharacters ? <CheckSquare size={18} className="text-blue-500 shrink-0" /> : <Square size={18} className="shrink-0" />}
                                        <span className="text-sm font-bold truncate">Personajes</span>
                                    </button>

                                    {/* Notas Generales */}
                                    <button
                                        onClick={() => setIncludeNotasGenerales(!includeNotasGenerales)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all shadow-sm ${includeNotasGenerales ? 'bg-orange-500/10 border-orange-500 text-[var(--text-main)]' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-orange-500/50'}`}
                                    >
                                        {includeNotasGenerales ? <CheckSquare size={18} className="text-orange-500 shrink-0" /> : <Square size={18} className="shrink-0" />}
                                        <span className="text-sm font-bold truncate">Notas Adicionales</span>
                                    </button>

                                    {/* Estructura Master Doc */}
                                    <button
                                        onClick={() => setIncludeEstructura(!includeEstructura)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all shadow-sm ${includeEstructura ? 'bg-indigo-500/10 border-indigo-500 text-[var(--text-main)]' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-indigo-500/50'}`}
                                    >
                                        {includeEstructura ? <CheckSquare size={18} className="text-indigo-500 shrink-0" /> : <Square size={18} className="shrink-0" />}
                                        <span className="text-sm font-bold truncate">Estructura y Resúmenes</span>
                                    </button>

                                    {/* Secciones Dinámicas del Master Doc */}
                                    {rootMasterDocSections.map((section) => (
                                        <button
                                            key={section.id}
                                            onClick={() => toggleSection(section.id)}
                                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all shadow-sm ${includedSections[section.id] ? 'bg-[var(--accent-soft)] border-[var(--accent-main)] text-[var(--text-main)]' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-[var(--accent-main)]/50'}`}
                                        >
                                            {includedSections[section.id] ? <CheckSquare size={18} className="text-[var(--accent-main)] shrink-0" /> : <Square size={18} className="shrink-0" />}
                                            <span className="text-sm font-bold truncate">{section.title}</span>
                                        </button>
                                    ))}

                                    {rootMasterDocSections.length === 0 && (
                                        <div className="text-xs text-[var(--text-muted)] flex items-center col-span-1 border border-dashed border-[var(--border-main)] rounded-xl p-3">
                                            No tienes categorías en el Master Doc Central.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Target selection (For Generation and Refine Mode) */}
                                {(activeTab === 'generation' || activeTab === 'refine') && (
                                    <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-6 shadow-sm animate-in fade-in duration-300">
                                        <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <span className="w-6 h-6 rounded bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent-main)] shrink-0">2</span>
                                            <span>¿Qué Capítulo vamos a {activeTab === 'refine' ? 'refinar' : 'escribir'}?</span>
                                        </h2>
                                        <div className="relative md:ml-8">
                                            {activeTab === 'generation' ? (
                                                <select
                                                    value={selectedChapterId}
                                                    onChange={(e) => setSelectedChapterId(e.target.value)}
                                                    className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-4 focus:outline-none focus:border-[var(--accent-main)] focus:ring-1 focus:ring-[var(--accent-main)] transition-all text-[var(--text-main)] appearance-none font-medium shadow-sm font-[Arial,sans-serif]"
                                                >
                                                    <option value="">-- Autogeneración libre --</option>
                                                    {worldItems.filter(w => w.parentId === 'system_estructura' && w.isCategory).map(vol => (
                                                        <optgroup key={vol.id} label={`${estLabels[vol.id] || ''}${vol.title}`}>
                                                            {worldItems.filter(w => w.parentId === vol.id).map(c => (
                                                                <option key={c.id} value={c.id}>{estLabels[c.id] || ''}{c.title}</option>
                                                            ))}
                                                        </optgroup>
                                                    ))}
                                                    {worldItems.filter(w => w.parentId === 'system_estructura' && !w.isCategory).length > 0 && (
                                                        <optgroup label="Capítulos Sueltos">
                                                            {worldItems.filter(w => w.parentId === 'system_estructura' && !w.isCategory).map(c => (
                                                                <option key={c.id} value={c.id}>{estLabels[c.id] || ''}{c.title}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}
                                                </select>
                                            ) : (
                                                <select
                                                    value={selectedRefineChapterId}
                                                    onChange={(e) => setSelectedRefineChapterId(e.target.value)}
                                                    className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-4 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-[var(--text-main)] appearance-none font-medium shadow-sm font-[Arial,sans-serif]"
                                                >
                                                    <option value="">-- Selecciona un capítulo para refinar --</option>
                                                    {chapters && chapters.filter(c => c.isVolume).map(vol => (
                                                        <optgroup key={vol.id} label={`${chapLabels[vol.id] || ''}${vol.title}`}>
                                                            {chapters.filter(c => c.parentId === vol.id && !c.isVolume).map(c => (
                                                                <option key={c.id} value={c.id} disabled={c.status === 'Finalizado'}>{c.status === 'Finalizado' ? '🛡️ ' : ''}{chapLabels[c.id] || ''}{c.title}{c.status === 'Finalizado' ? ' (Finalizado)' : ''}</option>
                                                            ))}
                                                        </optgroup>
                                                    ))}
                                                    {chapters && chapters.filter(c => !c.parentId && !c.isVolume).length > 0 && (
                                                        <optgroup label="Capítulos Sueltos">
                                                            {chapters.filter(c => !c.parentId && !c.isVolume).map(c => (
                                                                <option key={c.id} value={c.id} disabled={c.status === 'Finalizado'}>{c.status === 'Finalizado' ? '🛡️ ' : ''}{chapLabels[c.id] || ''}{c.title}{c.status === 'Finalizado' ? ' (Finalizado)' : ''}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}
                                                </select>
                                            )}
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" size={20} />
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] mt-4 md:ml-8 font-[Arial,sans-serif]">
                                            {activeTab === 'generation'
                                                ? "* Se le pasará el nombre y el Volumen al cual pertenece este capítulo a Gemini. Su sinopsis o temporalidad debes agregarla abajo."
                                                : "* El texto íntegro del capítulo seleccionado se incluirá en el prompt para que la IA lo utilice como base de la reescritura."}
                                        </p>
                                    </div>
                                )}

                                {/* Extra Notes */}
                                <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-4 md:p-6 shadow-sm relative transition-all focus-within:ring-2 focus-within:ring-[var(--accent-main)]/50 focus-within:border-[var(--accent-main)]">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                                        <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-start sm:items-center gap-2">
                                            <span className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${activeTab === 'generation' ? 'bg-[var(--accent-soft)] text-[var(--accent-main)]' : 'bg-orange-500/10 text-orange-500'}`}>
                                                {activeTab === 'generation' ? '3' : '2'}
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
                                        <p className="text-xs text-[var(--text-muted)] mt-3 text-center sm:text-left">Estas instrucciones se borrarán automáticamente una vez que copies el prompt.</p>
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
                                </div>

                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PromptStudioView;
