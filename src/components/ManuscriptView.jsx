import { useState } from 'react';
import { useData } from '../context/DataContext';
import { BookOpen, ChevronRight, Layers, FileText, ArrowLeft, Plus } from 'lucide-react';
import Modal from './Modal';

const ManuscriptView = () => {
    const { chapters, selectChapter, setActiveView, createChapter } = useData();
    const [currentStep, setCurrentStep] = useState({ type: 'root', data: null });
    const [focusMode, setFocusMode] = useState(false);
    const [readingFont, setReadingFont] = useState('font-[Arial,sans-serif]');
    const [readingWidth, setReadingWidth] = useState('md');
    const [readingTextSize, setReadingTextSize] = useState('base');

    // Modal states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createMode, setCreateMode] = useState('chapter'); // 'chapter' or 'volume'
    const [newItemTitle, setNewItemTitle] = useState('');

    // Filter data
    const volumes = chapters.filter(c => c.isVolume);
    const standaloneChapters = chapters.filter(c => !c.parentId && !c.isVolume);

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

                    <div className="flex items-center gap-2 md:gap-3 bg-[var(--bg-editor)] rounded-xl border border-[var(--border-main)] p-1 shadow-sm overflow-x-auto scrollbar-hide shrink-0">
                        <select
                            value={readingFont}
                            onChange={(e) => setReadingFont(e.target.value)}
                            className="bg-transparent text-xs sm:text-sm font-bold text-[var(--text-main)] focus:outline-none cursor-pointer border-r border-[var(--border-main)] pr-2 pl-2"
                        >
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="font-serif">Serif (Libro)</option>
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="font-sans">Sans (Moderna)</option>
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="font-[Arial,sans-serif]">Arial</option>
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="font-['Roboto',sans-serif]">Google (Roboto)</option>
                        </select>

                        <select
                            value={readingTextSize}
                            onChange={(e) => setReadingTextSize(e.target.value)}
                            className="bg-transparent text-xs sm:text-sm font-bold text-[var(--text-main)] focus:outline-none cursor-pointer border-r border-[var(--border-main)] pr-2 pl-2"
                        >
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="sm">Letra Chica</option>
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="base">Letra Normal</option>
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="lg">Letra Grande</option>
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="xl">Letra Gigante</option>
                        </select>

                        <select
                            value={readingWidth}
                            onChange={(e) => setReadingWidth(e.target.value)}
                            className="bg-transparent text-xs sm:text-sm font-bold text-[var(--text-main)] focus:outline-none cursor-pointer pr-2 pl-2"
                        >
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="sm">Centro Angosto</option>
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="md">Centro Ideal</option>
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="lg">Ancho</option>
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="xl">Súper Ancho</option>
                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="full">Pantalla Completa</option>
                        </select>
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
                    <button onClick={handleBack} className="flex items-center gap-2 text-sm font-bold text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:bg-[var(--accent-soft)] px-3 py-1.5 rounded-lg transition-all mb-8 w-fit">
                        <ArrowLeft size={16} /> Volver a Vista General
                    </button>

                    <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-8 md:mb-12 gap-4">
                        <div className="flex-1">
                            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)] mb-2">
                                Volumen {volLabels[vol.id]}
                            </div>
                            <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-black text-[var(--text-main)] leading-tight">{vol.title}</h1>
                        </div>
                        <button
                            onClick={handleReadFocus}
                            className="bg-[var(--accent-main)] text-white hover:bg-indigo-600 px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md mt-2 w-full sm:w-auto shrink-0"
                        >
                            <BookOpen size={18} /> <span className="sm:hidden md:inline">Leer en Modo Enfoque</span><span className="hidden sm:inline md:hidden">Leer</span>
                        </button>
                    </div>

                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <h3 className="text-base md:text-lg font-bold text-[var(--text-main)] uppercase tracking-wider">Capítulos del Volumen</h3>
                            <span className="text-xs md:text-sm text-[var(--text-muted)] font-bold">{volChapters.length} {volChapters.length === 1 ? 'capítulo' : 'capítulos'}</span>
                        </div>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="bg-[var(--accent-soft)] text-[var(--accent-main)] hover:bg-[var(--accent-main)] hover:text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm w-full sm:w-auto"
                        >
                            <Plus size={16} /> Añadir Capítulo
                        </button>
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
                                    className={`group bg-[var(--bg-app)] border border-[var(--border-main)] p-5 rounded-xl hover:border-[var(--accent-main)] cursor-pointer transition-all flex flex-col shadow-sm border-l-4 border-l-emerald-500 h-32 ${isEmpty ? 'opacity-50 hover:opacity-100' : ''}`}
                                >
                                    <div className="flex justify-between items-center mb-3 shrink-0">
                                        <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                                            Capítulo {chapLabels[chap.id]}
                                        </span>
                                        <div className="text-[var(--text-muted)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[10px] uppercase font-bold hidden sm:inline">Editar</span>
                                            <ChevronRight size={12} className="shrink-0" />
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
                    <div className="mb-8 md:mb-12 flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                        <div className="flex-1">
                            <h1 className="text-3xl md:text-5xl font-black font-serif text-[var(--accent-main)] tracking-tight mb-2">Vista General</h1>
                            <p className="text-sm md:text-base text-[var(--text-muted)] mt-2 font-medium">Visualiza tu obra en forma de tarjetas y accede al modo de lectura inmersivo.</p>
                        </div>
                        <button
                            onClick={() => { setCreateMode('chapter'); setIsCreateModalOpen(true); }}
                            className="bg-[var(--accent-main)] text-white hover:bg-indigo-600 px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md w-full sm:w-auto shrink-0"
                        >
                            <Plus size={18} /> Nuevo Documento
                        </button>
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
                                                <div className="text-[var(--text-muted)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-[10px] uppercase font-bold hidden sm:inline">Explorar</span>
                                                    <ChevronRight size={12} className="shrink-0" />
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
                                            className={`group bg-[var(--bg-app)] border border-[var(--border-main)] p-5 rounded-xl hover:border-[var(--accent-main)] cursor-pointer transition-all flex flex-col shadow-sm border-l-4 border-l-emerald-500 h-32 ${isEmpty ? 'opacity-50 hover:opacity-100' : ''}`}
                                        >
                                            <div className="flex justify-between items-center mb-3 shrink-0">
                                                <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                                                    Capítulo {standaloneLabels[chap.id]}
                                                </span>
                                                <div className="text-[var(--text-muted)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-[10px] uppercase font-bold hidden sm:inline">Editar</span>
                                                    <ChevronRight size={12} className="shrink-0" />
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

            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Agregar al Manuscrito">
                <div className="space-y-5 text-left font-sans">
                    {currentStep.type !== 'volume_detail' && (
                        <div className="flex bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl overflow-hidden p-1 shadow-sm">
                            <button
                                onClick={() => setCreateMode('chapter')}
                                className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-2 rounded-lg transition-colors ${createMode === 'chapter' ? 'bg-[var(--bg-editor)] text-[var(--accent-main)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-editor)]/50'}`}
                            >
                                <FileText size={16} /> Capítulo
                            </button>
                            <button
                                onClick={() => setCreateMode('volume')}
                                className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-2 rounded-lg transition-colors ${createMode === 'volume' ? 'bg-[var(--bg-editor)] text-indigo-500 shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-editor)]/50'}`}
                            >
                                <Layers size={16} /> Volumen
                            </button>
                        </div>
                    )}

                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Título del {createMode === 'volume' && currentStep.type !== 'volume_detail' ? 'volumen' : 'capítulo'}</label>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setNewItemTitle(newItemTitle.toUpperCase())} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all">AA</button>
                                <button onClick={() => setNewItemTitle(newItemTitle.toLowerCase())} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all">aa</button>
                                <button onClick={() => setNewItemTitle(newItemTitle ? newItemTitle.charAt(0).toUpperCase() + newItemTitle.slice(1).toLowerCase() : '')} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all">Aa</button>
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
                            placeholder={createMode === 'volume' && currentStep.type !== 'volume_detail' ? "Ej. El Despertar" : "Ej. El primer encuentro"}
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--accent-main)] focus:ring-1 focus:ring-[var(--accent-main)] transition-all text-[var(--text-main)] max-w-full"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => setIsCreateModalOpen(false)}
                            className="px-5 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
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
                            className={`px-5 py-2.5 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${createMode === 'volume' && currentStep.type !== 'volume_detail' ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-[var(--accent-main)] hover:bg-indigo-500'}`}
                        >
                            Crear {createMode === 'volume' && currentStep.type !== 'volume_detail' ? 'Volumen' : 'Capítulo'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ManuscriptView;
