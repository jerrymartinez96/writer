import { useState } from 'react';
import { useData } from '../context/DataContext';
import { Book, BookOpen, ChevronRight, Layers, FileText, ArrowLeft, Plus, Edit2, Pencil, ChevronDown, Check, Type, Maximize2, MoveHorizontal, ListFilter } from 'lucide-react';
import Modal from './Modal';
import ManuscriptOrganizerModal from './ManuscriptOrganizerModal';

const ManuscriptView = () => {
    const { chapters, selectChapter, setActiveView, createChapter, updateChapter } = useData();
    const [currentStep, setCurrentStep] = useState({ type: 'root', data: null });
    const [focusMode, setFocusMode] = useState(false);
    const [readingFont, setReadingFont] = useState('font-[Arial,sans-serif]');
    const [readingWidth, setReadingWidth] = useState('md');
    const [readingTextSize, setReadingTextSize] = useState('base');

    // Modal states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createMode, setCreateMode] = useState('chapter'); // 'chapter' or 'volume'
    const [newItemTitle, setNewItemTitle] = useState('');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [editTitle, setEditTitle] = useState('');

    // Reading settings dropdowns
    const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
    const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
    const [isWidthDropdownOpen, setIsWidthDropdownOpen] = useState(false);
    const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);

    // Filter data
    const volumes = chapters.filter(c => c.isVolume);
    // Standalone chapters
    const standaloneChapters = chapters.filter(c => !c.parentId && !c.isVolume);

    const getStatusBorderColor = (status) => {
        switch (status) {
            case 'Finalizado': return 'border-l-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.15)]';
            case 'Completado': return 'border-l-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.15)]';
            case 'Revisión': return 'border-l-amber-500';
            case 'Borrador': return 'border-l-blue-500';
            case 'Idea': default: return 'border-l-gray-300 dark:border-l-gray-700';
        }
    };

    const getVolumeLabels = () => {
        const labels = {};
        volumes.forEach((v, index) => {
            labels[v.id] = index + 1;
        });
        return labels;
    };
    const volLabels = getVolumeLabels();

    const getChapterLabels = (parentId) => {
        const labels = {};
        const chaps = chapters.filter(c => c.parentId === parentId);
        chaps.forEach((c, index) => {
            labels[c.id] = index + 1;
        });
        return labels;
    };
    const standaloneLabels = getChapterLabels(null);

    const handleReadFocus = () => {
        setFocusMode(true);
    };

    const handleBack = () => {
        if (focusMode) {
            setFocusMode(false);
        } else {
            setCurrentStep({ type: 'root', data: null });
        }
    };

    let content = null;

    if (focusMode && currentStep.type === 'volume_detail') {
        const volId = currentStep.data.id;
        const volChapters = chapters.filter(c => c.parentId === volId);
        const chapLabels = getChapterLabels(volId);

        content = (
            <div className="w-full h-full flex flex-col bg-[var(--bg-editor)]">
                <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 border-b border-[var(--border-main)] bg-[var(--bg-app)] shrink-0 gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={handleBack} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] rounded-lg transition-all">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)]">Modo Enfoque</div>
                            <h2 className="text-lg md:text-xl font-serif font-black text-[var(--text-main)]">Volumen {volLabels[volId]}: {currentStep.data.title}</h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3 bg-[var(--bg-editor)] rounded-full border border-[var(--border-main)] p-1.5 shadow-sm shrink-0">
                        {/* Font Dropdown */}
                        <div className="relative">
                            <button 
                                onClick={() => { setIsFontDropdownOpen(!isFontDropdownOpen); setIsSizeDropdownOpen(false); setIsWidthDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all text-xs font-black uppercase tracking-widest ${isFontDropdownOpen ? 'bg-indigo-600 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-indigo-600'}`}
                            >
                                <Type size={14} />
                                <span className="hidden sm:inline">Fuente</span>
                                <ChevronDown size={12} className={`transition-transform duration-300 ${isFontDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isFontDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsFontDropdownOpen(false)}></div>
                                    <div className="absolute left-0 mt-3 w-48 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <div className="p-1.5 space-y-1">
                                            {[
                                                { id: 'font-serif', label: 'Serif (Libro)' },
                                                { id: 'font-sans', label: 'Sans (Moderna)' },
                                                { id: 'font-[Arial,sans-serif]', label: 'Arial Classic' },
                                                { id: "font-['Roboto',sans-serif]", label: 'Google Roboto' }
                                            ].map(opt => (
                                                <button 
                                                    key={opt.id}
                                                    onClick={() => { setReadingFont(opt.id); setIsFontDropdownOpen(false); }}
                                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${readingFont === opt.id ? 'bg-indigo-600/5 text-indigo-600' : 'text-[var(--text-muted)] hover:bg-[var(--bg-editor)] hover:text-[var(--text-main)]'}`}
                                                >
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${opt.id}`}>{opt.label}</span>
                                                    {readingFont === opt.id && <Check size={12} />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Size Dropdown */}
                        <div className="relative">
                            <button 
                                onClick={() => { setIsSizeDropdownOpen(!isSizeDropdownOpen); setIsFontDropdownOpen(false); setIsWidthDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all text-xs font-black uppercase tracking-widest ${isSizeDropdownOpen ? 'bg-indigo-600 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-indigo-600'}`}
                            >
                                <Maximize2 size={14} />
                                <span className="hidden sm:inline">Tamaño</span>
                                <ChevronDown size={12} className={`transition-transform duration-300 ${isSizeDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isSizeDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsSizeDropdownOpen(false)}></div>
                                    <div className="absolute left-1/2 -translate-x-1/2 mt-3 w-44 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <div className="p-1.5 space-y-1">
                                            {[
                                                { id: 'sm', label: 'Chico' },
                                                { id: 'base', label: 'Normal' },
                                                { id: 'lg', label: 'Grande' },
                                                { id: 'xl', label: 'Gigante' }
                                            ].map(opt => (
                                                <button 
                                                    key={opt.id}
                                                    onClick={() => { setReadingTextSize(opt.id); setIsSizeDropdownOpen(false); }}
                                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${readingTextSize === opt.id ? 'bg-indigo-600/5 text-indigo-600' : 'text-[var(--text-muted)] hover:bg-[var(--bg-editor)] hover:text-[var(--text-main)]'}`}
                                                >
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{opt.label}</span>
                                                    {readingTextSize === opt.id && <Check size={12} />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Width Dropdown */}
                        <div className="relative">
                            <button 
                                onClick={() => { setIsWidthDropdownOpen(!isWidthDropdownOpen); setIsFontDropdownOpen(false); setIsSizeDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all text-xs font-black uppercase tracking-widest ${isWidthDropdownOpen ? 'bg-indigo-600 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-indigo-600'}`}
                            >
                                <MoveHorizontal size={14} />
                                <span className="hidden sm:inline">Ancho</span>
                                <ChevronDown size={12} className={`transition-transform duration-300 ${isWidthDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isWidthDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsWidthDropdownOpen(false)}></div>
                                    <div className="absolute right-0 mt-3 w-48 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <div className="p-1.5 space-y-1">
                                            {[
                                                { id: 'sm', label: 'Angosto' },
                                                { id: 'md', label: 'Ideal' },
                                                { id: 'lg', label: 'Ancho' },
                                                { id: 'xl', label: 'Súper Ancho' },
                                                { id: 'full', label: 'Completo' }
                                            ].map(opt => (
                                                <button 
                                                    key={opt.id}
                                                    onClick={() => { setReadingWidth(opt.id); setIsWidthDropdownOpen(false); }}
                                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${readingWidth === opt.id ? 'bg-indigo-600/5 text-indigo-600' : 'text-[var(--text-muted)] hover:bg-[var(--bg-editor)] hover:text-[var(--text-main)]'}`}
                                                >
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{opt.label}</span>
                                                    {readingWidth === opt.id && <Check size={12} />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className={`flex-1 overflow-y-auto p-6 md:p-10 lg:p-16 scrollbar-hide ${readingFont} transition-all duration-300`}>
                    <div className={`${readingWidth === 'full' ? 'w-full px-2' : readingWidth === 'xl' ? 'max-w-7xl' : readingWidth === 'lg' ? 'max-w-5xl' : readingWidth === 'sm' ? 'max-w-xl' : 'max-w-3xl'} mx-auto space-y-16 pb-32 transition-all duration-500`}>
                        <div className="text-center mb-16">
                            <h1 className={`text-5xl font-black text-[var(--text-main)] mb-6 ${readingFont}`}>{currentStep.data.title}</h1>
                            <div className="w-16 h-1 bg-[var(--accent-main)] mx-auto opacity-50 rounded-full"></div>
                        </div>
                        {volChapters.length === 0 ? (
                            <p className="text-center text-[var(--text-muted)] italic">Este volumen no tiene capítulos aún.</p>
                        ) : (
                            volChapters.map(chap => (
                                <div key={chap.id} className={`prose max-w-none mx-auto transition-all duration-500 ${readingTextSize === 'sm' ? 'prose-sm' :
                                    readingTextSize === 'lg' ? 'prose-lg' :
                                        readingTextSize === 'xl' ? 'prose-xl' :
                                            'prose-base'
                                    }`}>
                                    <h2 className={`font-black text-center mb-8 ${readingFont}`}>Capítulo {chapLabels[chap.id]}: {chap.title}</h2>
                                    <div dangerouslySetInnerHTML={{ __html: chap.content || '<p class="text-center italic opacity-50">Capítulo vacío</p>' }} />
                                    <div className="flex items-center justify-center my-12 opacity-30">
                                        <div className="w-2 h-2 rounded-full bg-[var(--text-main)] mx-1"></div>
                                        <div className="w-2 h-2 rounded-full bg-[var(--text-main)] mx-1"></div>
                                        <div className="w-2 h-2 rounded-full bg-[var(--text-main)] mx-1"></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    } else if (currentStep.type === 'volume_detail') {
        const vol = currentStep.data;
        const volChapters = chapters.filter(c => c.parentId === vol.id);
        const chapLabels = getChapterLabels(vol.id);

        content = (
            <div className="w-full h-full flex flex-col p-6 md:p-10 scrollbar-hide">
                <div className="max-w-6xl mx-auto w-full animate-in fade-in duration-300">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 py-4 border-b border-[var(--border-main)] mb-10">
                        <div className="flex items-center gap-3">
                            <button onClick={handleBack} className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] hover:text-indigo-500 hover:bg-indigo-500/5 px-3 py-1.5 rounded-lg transition-all">
                                <ArrowLeft size={14} /> Volver
                            </button>
                            <div className="h-4 w-px bg-[var(--border-main)] mx-1"></div>
                            <div className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">
                                Volumen {volLabels[vol.id]}
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={handleReadFocus}
                                className="px-4 py-2 text-xs font-bold bg-[var(--bg-app)] border border-indigo-500/30 text-indigo-500 rounded-lg hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-2 shadow-sm"
                            >
                                <BookOpen size={14} /> Leer Volumen
                            </button>
                            <button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="px-4 py-2 text-xs font-bold bg-[var(--accent-main)] text-white rounded-lg hover:bg-indigo-600 transition-all flex items-center gap-2 shadow-sm"
                            >
                                <Plus size={14} /> Añadir Capítulo
                            </button>
                        </div>
                    </div>

                    <div className="mb-12">
                        <h1 className="text-3xl md:text-5xl font-serif font-black text-[var(--text-main)] leading-tight tracking-tight break-words" style={{ textWrap: 'balance' }}>
                            {vol.title}
                        </h1>
                        <p className="text-sm text-[var(--text-muted)] mt-4 font-medium flex items-center gap-2 uppercase tracking-widest">
                            <Layers size={14} className="opacity-50" /> {volChapters.length} {volChapters.length === 1 ? 'Capítulo' : 'Capítulos'} en total
                        </p>
                    </div>


                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {volChapters.map(chap => {
                            const isEmpty = !chap.content || chap.content.trim() === '';
                            return (
                                <div
                                    key={chap.id}
                                    onClick={() => {
                                        selectChapter(chap);
                                        setActiveView('editor');
                                    }}
                                    className={`group bg-[var(--bg-app)] border border-[var(--border-main)] p-5 rounded-xl hover:border-[var(--accent-main)] cursor-pointer transition-all flex flex-col shadow-sm border-l-4 ${getStatusBorderColor(chap.status)} h-32 ${isEmpty ? 'opacity-50 hover:opacity-100' : ''}`}
                                >
                                    <div className="flex justify-between items-center mb-3 shrink-0">
                                        <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                                            Capítulo {chapLabels[chap.id]}
                                        </span>
                                        <div className="text-[var(--text-muted)] flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingItem(chap);
                                                    setEditTitle(chap.title);
                                                    setIsEditModalOpen(true);
                                                }}
                                                className="p-1 hover:text-[var(--accent-main)] transition-colors"
                                                title="Renombrar capítulo"
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] uppercase font-bold hidden sm:inline">Editar</span>
                                                <ChevronRight size={12} className="shrink-0" />
                                            </div>
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-base leading-snug text-[var(--text-main)] line-clamp-2" title={chap.title}>{chap.title}</h3>
                                </div>
                            );
                        })}
                        {volChapters.length === 0 && (
                            <div className="col-span-full py-16 text-center border-2 border-dashed border-[var(--border-main)] rounded-2xl text-[var(--text-muted)] opacity-60">
                                Este volumen no tiene capítulos. Añádelos desde la barra lateral.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    } else {
        // Root View
        content = (
            <div className="w-full h-full flex flex-col p-6 md:p-10 scrollbar-hide">
                <div className="max-w-6xl mx-auto w-full animate-in fade-in duration-300">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 py-4 border-b border-[var(--border-main)] mb-10">
                        <div className="flex items-center gap-2 text-[var(--text-muted)]">
                            <Book size={14} className="text-indigo-500" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Biblioteca del Autor</span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsOrganizerOpen(true)}
                                className="px-4 py-2 text-xs font-bold bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-main)] rounded-lg hover:border-indigo-500 transition-all flex items-center gap-2 shadow-sm"
                            >
                                <ListFilter size={14} className="text-indigo-500" /> Organizar
                            </button>
                            <button
                                onClick={() => { setCreateMode('chapter'); setIsCreateModalOpen(true); }}
                                className="px-4 py-2 text-xs font-bold bg-[var(--accent-main)] text-white rounded-lg hover:bg-indigo-600 transition-all flex items-center gap-2 shadow-sm"
                            >
                                <Plus size={14} /> Nuevo Documento
                            </button>
                        </div>
                    </div>

                    <div className="mb-12">
                        <h1 className="text-3xl md:text-5xl font-serif font-black text-[var(--text-main)] leading-tight tracking-tight">
                            Vista General
                        </h1>
                        <p className="text-sm text-[var(--text-muted)] mt-3 font-medium max-w-2xl">
                            Visualiza tu obra en forma de tarjetas y accede al modo de lectura inmersivo.
                        </p>
                    </div>

                    {volumes.length > 0 && (
                        <div className="mb-12">
                            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Layers size={14} className="text-indigo-500" /> Volúmenes
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {volumes.map(vol => {
                                    const volChapters = chapters.filter(c => c.parentId === vol.id);
                                    const isEmpty = volChapters.length === 0;
                                    return (
                                        <div
                                            key={vol.id}
                                            onClick={() => setCurrentStep({ type: 'volume_detail', data: vol })}
                                            className={`group bg-[var(--bg-app)] border border-[var(--border-main)] p-5 rounded-xl hover:border-indigo-500 cursor-pointer transition-all flex flex-col shadow-sm border-l-4 border-l-indigo-500 h-36 ${isEmpty ? 'opacity-50 hover:opacity-100' : ''}`}
                                        >
                                            <div className="flex justify-between items-center mb-3 shrink-0">
                                                <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                                                    Volumen {volLabels[vol.id]}
                                                </span>
                                                <div className="text-[var(--text-muted)] flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingItem(vol);
                                                            setEditTitle(vol.title);
                                                            setIsEditModalOpen(true);
                                                        }}
                                                        className="p-1 hover:text-indigo-500 transition-colors"
                                                        title="Renombrar volumen"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] uppercase font-bold hidden sm:inline">Explorar</span>
                                                        <ChevronRight size={12} className="shrink-0" />
                                                    </div>
                                                </div>
                                            </div>
                                            <h3 className="font-bold text-xl font-serif leading-snug text-[var(--text-main)] line-clamp-2 mb-auto" title={vol.title}>{vol.title}</h3>
                                            <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold mt-2">
                                                {volChapters.length} {volChapters.length === 1 ? 'Capítulo' : 'Capítulos'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {standaloneChapters.length > 0 && (
                        <div>
                            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4 flex items-center gap-2">
                                <FileText size={14} className="text-emerald-500" /> Capítulos Sueltos
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {standaloneChapters.map(chap => {
                                    const isEmpty = !chap.content || chap.content.trim() === '';
                                    return (
                                        <div
                                            key={chap.id}
                                            onClick={() => {
                                                selectChapter(chap);
                                                setActiveView('editor');
                                            }}
                                            className={`group bg-[var(--bg-app)] border border-[var(--border-main)] p-5 rounded-xl hover:border-[var(--accent-main)] cursor-pointer transition-all flex flex-col shadow-sm border-l-4 ${getStatusBorderColor(chap.status)} h-32 ${isEmpty ? 'opacity-50 hover:opacity-100' : ''}`}
                                        >
                                            <div className="flex justify-between items-center mb-3 shrink-0">
                                                <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                                                    Capítulo {standaloneLabels[chap.id]}
                                                </span>
                                                <div className="text-[var(--text-muted)] flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingItem(chap);
                                                            setEditTitle(chap.title);
                                                            setIsEditModalOpen(true);
                                                        }}
                                                        className="p-1 hover:text-[var(--accent-main)] transition-colors"
                                                        title="Renombrar capítulo"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] uppercase font-bold hidden sm:inline">Editar</span>
                                                        <ChevronRight size={12} className="shrink-0" />
                                                    </div>
                                                </div>
                                            </div>
                                            <h3 className="font-bold text-base leading-snug text-[var(--text-main)] line-clamp-2" title={chap.title}>{chap.title}</h3>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {volumes.length === 0 && standaloneChapters.length === 0 && (
                        <div className="py-20 text-center border-2 border-dashed border-[var(--border-main)] rounded-2xl text-[var(--text-muted)] opacity-60">
                            Tu manuscrito está vacío. Crea volúmenes o capítulos en la barra lateral para empezar.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full relative">
            {content}

            <ManuscriptOrganizerModal 
                isOpen={isOrganizerOpen}
                onClose={() => setIsOrganizerOpen(false)}
            />

            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Renombrar ${editingItem?.isVolume ? 'Volumen' : 'Capítulo'}`}>
                <div className="p-8 space-y-8 text-left font-sans">
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] flex items-center gap-2">
                            <Pencil size={14} />
                            Edición de Título
                        </label>
                        <input
                            type="text"
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && editTitle.trim()) {
                                    updateChapter(editingItem.id, { title: editTitle.trim() });
                                    setIsEditModalOpen(false);
                                }
                            }}
                            placeholder="Nuevo título..."
                            className="w-full bg-[var(--bg-editor)] border-2 border-[var(--border-main)] rounded-[24px] px-6 py-5 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-[var(--text-main)] text-xl font-serif italic placeholder:opacity-30 placeholder:italic"
                        />
                    </div>
                    
                    <div className="flex items-center gap-4 pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => setIsEditModalOpen(false)}
                            className="flex-1 px-8 py-5 rounded-[22px] font-black text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
                        >
                            No, Cancelar
                        </button>
                        <button
                            onClick={() => {
                                if (editTitle.trim()) {
                                    updateChapter(editingItem.id, { title: editTitle.trim() });
                                    setIsEditModalOpen(false);
                                }
                            }}
                            disabled={!editTitle.trim() || editTitle.trim() === editingItem?.title}
                            className="flex-1 px-8 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[22px] font-black text-[10px] uppercase tracking-[0.3em] shadow-xl shadow-indigo-600/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-30"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Agregar al Manuscrito">
                <div className="p-8 space-y-8 text-left font-sans bg-indigo-500/[0.01]">
                    {currentStep.type !== 'volume_detail' && (
                        <div className="flex bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl overflow-hidden p-1.5 shadow-inner">
                            <button
                                onClick={() => setCreateMode('chapter')}
                                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 rounded-xl transition-all ${createMode === 'chapter' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-[var(--text-muted)] hover:bg-[var(--bg-app)] hover:text-indigo-500'}`}
                            >
                                <FileText size={16} /> Capítulo
                            </button>
                            <button
                                onClick={() => setCreateMode('volume')}
                                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 rounded-xl transition-all ${createMode === 'volume' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-[var(--text-muted)] hover:bg-[var(--bg-app)] hover:text-indigo-500'}`}
                            >
                                <Layers size={16} /> Volumen
                            </button>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                <Plus size={14} />
                                Detalles del {createMode === 'volume' && currentStep.type !== 'volume_detail' ? 'Volumen' : 'Capítulo'}
                            </label>
                            <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-editor)] rounded-xl border border-[var(--border-main)]">
                                <button onClick={() => setNewItemTitle(newItemTitle.toUpperCase())} className="px-2 py-1 rounded-lg hover:bg-white/10 text-[9px] font-black text-[var(--text-muted)] hover:text-indigo-500 transition-all uppercase">AA</button>
                                <button onClick={() => setNewItemTitle(newItemTitle.toLowerCase())} className="px-2 py-1 rounded-lg hover:bg-white/10 text-[9px] font-black text-[var(--text-muted)] hover:text-indigo-500 transition-all uppercase">aa</button>
                                <button onClick={() => setNewItemTitle(newItemTitle ? newItemTitle.charAt(0).toUpperCase() + newItemTitle.slice(1).toLowerCase() : '')} className="px-2 py-1 rounded-lg hover:bg-white/10 text-[9px] font-black text-[var(--text-muted)] hover:text-indigo-500 transition-all uppercase">Aa</button>
                            </div>
                        </div>
                        <input
                            type="text"
                            autoFocus
                            value={newItemTitle}
                            onChange={(e) => setNewItemTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newItemTitle.trim()) {
                                    createChapter({
                                        title: newItemTitle.trim(),
                                        isVolume: currentStep.type !== 'volume_detail' && createMode === 'volume',
                                        parentId: currentStep.type === 'volume_detail' ? currentStep.data.id : null
                                    }, { preventRedirect: true });
                                    setIsCreateModalOpen(false);
                                    setNewItemTitle('');
                                }
                            }}
                            placeholder={createMode === 'volume' && currentStep.type !== 'volume_detail' ? "Ej. Volumen III: El Renacimiento" : "Ej. Capítulo 4: Sombras en el bosque"}
                            className="w-full bg-[var(--bg-editor)] border-2 border-[var(--border-main)] rounded-[24px] px-6 py-5 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-[var(--text-main)] text-xl font-serif italic placeholder:opacity-30 placeholder:italic"
                        />
                    </div>

                    <div className="flex items-center gap-4 pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => setIsCreateModalOpen(false)}
                            className="flex-1 px-8 py-5 rounded-[22px] font-black text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => {
                                if (newItemTitle.trim()) {
                                    createChapter({
                                        title: newItemTitle.trim(),
                                        isVolume: currentStep.type !== 'volume_detail' && createMode === 'volume',
                                        parentId: currentStep.type === 'volume_detail' ? currentStep.data.id : null
                                    }, { preventRedirect: true });
                                    setIsCreateModalOpen(false);
                                    setNewItemTitle('');
                                }
                            }}
                            disabled={!newItemTitle.trim()}
                            className="flex-1 px-8 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[22px] font-black text-[10px] uppercase tracking-[0.3em] shadow-xl shadow-indigo-600/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-30"
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ManuscriptView;
