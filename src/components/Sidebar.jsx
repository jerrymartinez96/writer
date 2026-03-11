import { Plus, Settings, ChevronRight, Book, Folder, FileText, Trash2, Users, Search, MoreVertical, Edit2, LogOut, Check, AlignLeft, Sparkles, BookOpen, Globe, User, Layers, X, GripVertical } from 'lucide-react';
import { useData } from '../context/DataContext'
import { useState, useEffect, useMemo } from 'react'
import Modal from './Modal'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const SortableChapterItem = ({ chapter, isActive, label, statusColor, onSelect, onDelete, isNested }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chapter.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} className={`group relative ${isNested ? 'flex items-center' : 'animate-in fade-in duration-300'}`}>
            {isNested && <div className="absolute -left-2 top-4 w-2 border-t border-indigo-500/30"></div>}
            <button
                onClick={onSelect}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition-all ${isActive
                    ? `bg-[var(--accent-soft)] text-[var(--accent-main)] font-semibold shadow-sm ${isNested ? 'ml-1' : ''}`
                    : `hover:bg-[var(--accent-soft)] text-[var(--text-main)] transition-colors ${isNested ? 'ml-1' : ''}`
                    }`}
            >
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0 touch-none" title="Arrastrar para reordenar">
                    <GripVertical size={12} />
                </div>
                <FileText size={isNested ? 14 : 16} className={isActive ? "text-[var(--accent-main)] shrink-0" : "text-[var(--text-muted)] shrink-0"} />
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} title={`Estado: ${chapter.status || 'Idea'}`}></div>
                <span className="truncate pr-6">{label}{chapter.title}</span>
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className={`absolute ${isNested ? 'right-1' : 'right-2'} top-1.5 p-1 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-50 ${isNested ? 'bg-[var(--bg-editor)]' : ''}`}
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
};

const Sidebar = ({ isMobileOpen, setIsMobileOpen }) => {
    const {
        books, activeBook, selectBook, createBook,
        chapters, activeChapter, selectChapter, createChapter, deleteChapter,
        activeView, setActiveView, reorderChapters
    } = useData();
    const [isBooksOpen, setIsBooksOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [expandedVolumes, setExpandedVolumes] = useState({});

    const toggleVolume = (id) => {
        setExpandedVolumes(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleSelectMobile = (action) => {
        action();
        if (setIsMobileOpen) setIsMobileOpen(false);
    };

    // Modal states
    const [isBookModalOpen, setIsBookModalOpen] = useState(false);
    const [newBookTitle, setNewBookTitle] = useState('');
    const [isChapterModalOpen, setIsChapterModalOpen] = useState(false);
    const [newChapterTitle, setNewChapterTitle] = useState('');
    const [createMode, setCreateMode] = useState('chapter'); // 'chapter' or 'volume'
    const [selectedVolumeId, setSelectedVolumeId] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [chapterToDelete, setChapterToDelete] = useState(null);

    const getStatusColor = (status) => {
        switch (status) {
            case 'Finalizado': return 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]';
            case 'Revisión': return 'bg-amber-500';
            case 'Borrador': return 'bg-blue-500';
            case 'Idea': default: return 'bg-gray-400 opacity-50';
        }
    };

    const itemLabels = {};
    let volCount = 1;
    let standaloneChapCount = 1;

    chapters.filter(c => c.isVolume).forEach(vol => {
        itemLabels[vol.id] = `Volumen ${volCount}: `;
        volCount++;
        let volChapCount = 1;
        chapters.filter(c => c.parentId === vol.id).forEach(chap => {
            itemLabels[chap.id] = `Capítulo ${volChapCount}: `;
            volChapCount++;
        });
    });

    chapters.filter(c => !c.parentId && !c.isVolume).forEach(chap => {
        itemLabels[chap.id] = `Capítulo ${standaloneChapCount}: `;
        standaloneChapCount++;
    });

    const itemToDelete = chapterToDelete ? chapters.find(c => c.id === chapterToDelete) : null;

    // DnD sensors with activation constraint to avoid triggering on clicks
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    // Sorted chapters helpers
    const standaloneChapters = useMemo(() =>
        chapters.filter(c => !c.parentId && !c.isVolume)
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
        [chapters]
    );

    const volumeChapters = useMemo(() => (volId) =>
        chapters.filter(c => c.parentId === volId)
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
        [chapters]
    );

    const handleDragEnd = (event, parentId) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const items = parentId
            ? chapters.filter(c => c.parentId === parentId).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
            : standaloneChapters;

        const oldIndex = items.findIndex(c => c.id === active.id);
        const newIndex = items.findIndex(c => c.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(items, oldIndex, newIndex);
        reorderChapters(reordered.map(c => c.id), parentId);
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            <div className={`
                ${isSidebarCollapsed ? 'w-20' : 'w-72'} 
                bg-[var(--bg-sidebar)] border-r border-[var(--border-main)] 
                h-full flex flex-col pointer-events-auto transition-transform duration-300 shrink-0 z-50
                fixed md:relative inset-y-0 left-0 transform 
                ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                {/* Header / Book Selector / Collapse Toggle */}
                <div className={`p-2 ${isSidebarCollapsed ? 'px-2 justify-center' : 'px-4 justify-between'} border-b border-[var(--border-main)] h-16 flex items-center shrink-0`}>
                    {!isSidebarCollapsed && (
                        <button
                            onClick={() => setIsBooksOpen(!isBooksOpen)}
                            className="flex-1 h-10 flex items-center justify-between font-bold text-base text-[var(--accent-main)] hover:bg-[var(--accent-soft)] px-3 rounded-lg transition-all overflow-hidden"
                        >
                            <div className="flex items-center gap-2 truncate pr-2">
                                <div className="w-6 h-6 shrink-0 rounded bg-[var(--accent-main)] flex items-center justify-center text-white">
                                    <Book size={14} />
                                </div>
                                <span className="truncate font-sans tracking-tight">{activeBook?.title || "Biblioteca"}</span>
                            </div>
                            <ChevronRight size={16} className={`shrink-0 transition-transform duration-300 ${isBooksOpen ? "rotate-90" : "rotate-0 text-[var(--text-muted)]"}`} />
                        </button>
                    )}

                    {/* Only show collapse button on desktop */}
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="hidden md:flex p-2 ml-1 text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:bg-[var(--accent-soft)] rounded-lg transition-all shrink-0"
                        title={isSidebarCollapsed ? "Expandir" : "Minimizar"}
                    >
                        <Book size={isSidebarCollapsed ? 22 : 18} />
                    </button>

                    {/* Mobile close button */}
                    <button
                        onClick={() => setIsMobileOpen(false)}
                        className="md:hidden p-2 ml-1 text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:bg-[var(--accent-soft)] rounded-lg transition-all shrink-0"
                        title="Cerrar menú"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Generic Dropdown for Books */}
                {isBooksOpen && (
                    <div className="absolute top-14 left-4 right-4 bg-[var(--bg-app)] border border-[var(--border-main)] shadow-xl rounded-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-2 max-h-60 overflow-y-auto">
                            <div className="px-3 py-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Tus Proyectos</div>
                            {books.map(b => (
                                <button
                                    key={b.id}
                                    onClick={() => { handleSelectMobile(() => selectBook(b)); setIsBooksOpen(false); }}
                                    className={`w-full text-left px-3 py-2.5 text-sm rounded-lg transition-all ${activeBook?.id === b.id ? 'font-bold bg-[var(--accent-soft)] text-[var(--accent-main)]' : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'}`}
                                >
                                    {b.title}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                setIsBooksOpen(false);
                                if (setIsMobileOpen) setIsMobileOpen(false);
                                setIsBookModalOpen(true);
                            }}
                            className="w-full text-left px-5 py-3 border-t border-[var(--border-main)] text-sm font-semibold text-[var(--accent-main)] hover:bg-[var(--accent-soft)] flex items-center gap-2 transition-colors"
                        >
                            <Plus size={16} /> Crear nuevo manuscrito
                        </button>
                    </div>
                )}
                {/* Main Navigation Options (Always Visible) */}
                <div className={`p-4 border-b border-[var(--border-main)] flex flex-col gap-2 ${isSidebarCollapsed ? 'items-center' : ''}`}>
                    <button
                        onClick={() => handleSelectMobile(() => setActiveView('manuscript'))}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all group ${activeView === 'manuscript' || activeView === 'editor' ? 'bg-[var(--accent-soft)] text-[var(--accent-main)] font-semibold shadow-sm' : 'hover:bg-[var(--accent-soft)] text-[var(--text-main)] transition-colors'} ${isSidebarCollapsed ? 'justify-center w-12 h-12' : 'w-full text-left'}`}
                        title="Manuscrito"
                    >
                        <div className={`shrink-0 p-1.5 rounded-md transition-transform group-hover:scale-110 ${activeView === 'manuscript' || activeView === 'editor' ? 'bg-[var(--accent-main)] text-white shadow-md' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            <BookOpen size={isSidebarCollapsed ? 18 : 14} />
                        </div>
                        {!isSidebarCollapsed && <span>Manuscrito</span>}
                    </button>

                    <button
                        onClick={() => handleSelectMobile(() => {
                            if (activeView === 'world') {
                                window.dispatchEvent(new CustomEvent('resetWorldView'));
                            } else {
                                setActiveView('world');
                            }
                        })}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all group ${activeView === 'world' ? 'bg-[var(--accent-soft)] text-[var(--accent-main)] font-semibold shadow-sm' : 'hover:bg-[var(--accent-soft)] text-[var(--text-main)] transition-colors'} ${isSidebarCollapsed ? 'justify-center w-12 h-12' : 'w-full text-left'}`}
                        title="Master Doc"
                    >
                        <div className={`shrink-0 p-1.5 rounded-md transition-transform group-hover:scale-110 ${activeView === 'world' ? 'bg-[var(--accent-main)] text-white shadow-md' : 'bg-indigo-500/10 text-indigo-500'}`}>
                            <Globe size={isSidebarCollapsed ? 18 : 14} />
                        </div>
                        {!isSidebarCollapsed && <span>Master Doc</span>}
                    </button>

                    <button
                        onClick={() => handleSelectMobile(() => setActiveView('promptStudio'))}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all group ${activeView === 'promptStudio' ? 'bg-[var(--accent-soft)] text-[var(--accent-main)] font-semibold shadow-sm' : 'hover:bg-[var(--accent-soft)] text-[var(--text-main)] transition-colors'} ${isSidebarCollapsed ? 'justify-center w-12 h-12' : 'w-full text-left'}`}
                        title="Exportador a IA"
                    >
                        <div className={`shrink-0 p-1.5 rounded-md transition-transform group-hover:scale-110 ${activeView === 'promptStudio' ? 'bg-[var(--accent-main)] text-white shadow-md' : 'bg-purple-500/10 text-purple-500'}`}>
                            <Sparkles size={isSidebarCollapsed ? 18 : 14} />
                        </div>
                        {!isSidebarCollapsed && <span>Exportador a IA</span>}
                    </button>

                    <button
                        onClick={() => handleSelectMobile(() => setActiveView('trash'))}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all group ${activeView === 'trash' ? 'bg-[var(--accent-soft)] text-[var(--accent-main)] font-semibold shadow-sm' : 'hover:bg-[var(--accent-soft)] text-[var(--text-main)] transition-colors'} ${isSidebarCollapsed ? 'justify-center w-12 h-12' : 'w-full text-left'}`}
                        title="Papelera"
                    >
                        <div className={`shrink-0 p-1.5 rounded-md transition-transform group-hover:scale-110 ${activeView === 'trash' ? 'bg-[var(--accent-main)] text-white shadow-md' : 'bg-red-500/10 text-red-500'}`}>
                            <Trash2 size={isSidebarCollapsed ? 18 : 14} />
                        </div>
                        {!isSidebarCollapsed && <span>Papelera</span>}
                    </button>

                    <button
                        onClick={() => handleSelectMobile(() => setActiveView('settings'))}
                        className={`flex md:hidden items-center gap-3 py-2 px-3 rounded-lg transition-all group ${activeView === 'settings' ? 'bg-[var(--accent-soft)] text-[var(--accent-main)] font-semibold shadow-sm' : 'hover:bg-[var(--accent-soft)] text-[var(--text-main)] transition-colors'} ${isSidebarCollapsed ? 'justify-center w-12 h-12' : 'w-full text-left'}`}
                        title="Ajustes del libro"
                    >
                        <div className={`shrink-0 p-1.5 rounded-md transition-transform group-hover:scale-110 ${activeView === 'settings' ? 'bg-[var(--accent-main)] text-white shadow-md' : 'bg-gray-500/10 text-gray-500'}`}>
                            <Settings size={isSidebarCollapsed ? 18 : 14} />
                        </div>
                        {!isSidebarCollapsed && <span>Ajustes</span>}
                    </button>
                </div>

                {/* Chapters List (Only shown in Manuscript/Editor modes and not collapsed) */}
                <div className="flex-1 overflow-y-auto scrollbar-hide py-4 relative">
                    {(activeView === 'manuscript' || activeView === 'editor') && !isSidebarCollapsed ? (
                        <div className="px-4 space-y-6 animate-in fade-in duration-300">
                            <div>
                                <div className="flex items-center justify-between mb-4 px-2">
                                    <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">
                                        Índice
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (setIsMobileOpen) setIsMobileOpen(false);
                                            setIsChapterModalOpen(true);
                                        }}
                                        className="w-6 h-6 flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent-main)] hover:bg-[var(--accent-main)] hover:text-white rounded transition-all shadow-sm"
                                        title="Nuevo Elemento"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {/* Render Volumes & Their Chapters */}
                                    {chapters.filter(c => c.isVolume).map(vol => {
                                        const isCollapsed = !expandedVolumes[vol.id];
                                        return (
                                            <div key={vol.id} className="mb-2 animate-in fade-in zoom-in-95 duration-300">
                                                <div className="group relative mb-1">
                                                    <div
                                                        onClick={() => toggleVolume(vol.id)}
                                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg text-left text-[var(--accent-main)] font-black bg-indigo-500/10 border border-indigo-500/20 shadow-sm cursor-pointer hover:bg-indigo-500/20 transition-colors"
                                                    >
                                                        <ChevronRight size={14} className={`transition-transform shrink-0 ${isCollapsed ? 'rotate-0' : 'rotate-90'}`} />
                                                        <span className="truncate pr-6 font-serif tracking-tight">{itemLabels[vol.id]}{vol.title}</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setChapterToDelete(vol.id); setIsDeleteModalOpen(true); }}
                                                        className="absolute right-2 top-2 p-1 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-50 bg-[var(--bg-app)]/80 backdrop-blur-sm"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                                {!isCollapsed && (
                                                    <div className="pl-2 mt-1 space-y-1 border-l border-indigo-500/30 ml-4 relative animate-in slide-in-from-top-2 duration-200">
                                                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, vol.id)}>
                                                            <SortableContext items={volumeChapters(vol.id).map(c => c.id)} strategy={verticalListSortingStrategy}>
                                                                {volumeChapters(vol.id).map(chapter => (
                                                                    <SortableChapterItem
                                                                        key={chapter.id}
                                                                        chapter={chapter}
                                                                        isActive={activeChapter?.id === chapter.id && activeView === 'editor'}
                                                                        label={itemLabels[chapter.id]}
                                                                        statusColor={getStatusColor(chapter.status)}
                                                                        onSelect={() => handleSelectMobile(() => selectChapter(chapter))}
                                                                        onDelete={() => { setChapterToDelete(chapter.id); setIsDeleteModalOpen(true); }}
                                                                        isNested
                                                                    />
                                                                ))}
                                                            </SortableContext>
                                                        </DndContext>
                                                        {chapters.filter(c => c.parentId === vol.id).length === 0 && (
                                                            <div className="text-[10px] text-indigo-500/60 font-bold uppercase tracking-widest px-4 py-2 opacity-50 ml-1">
                                                                Volumen vacío
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}

                                    {/* Render Floating Chapters with DnD */}
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, null)}>
                                        <SortableContext items={standaloneChapters.map(c => c.id)} strategy={verticalListSortingStrategy}>
                                            {standaloneChapters.map((chapter) => (
                                                <SortableChapterItem
                                                    key={chapter.id}
                                                    chapter={chapter}
                                                    isActive={activeChapter?.id === chapter.id && activeView === 'editor'}
                                                    label={itemLabels[chapter.id]}
                                                    statusColor={getStatusColor(chapter.status)}
                                                    onSelect={() => handleSelectMobile(() => selectChapter(chapter))}
                                                    onDelete={() => { setChapterToDelete(chapter.id); setIsDeleteModalOpen(true); }}
                                                />
                                            ))}
                                        </SortableContext>
                                    </DndContext>

                                    {chapters.length === 0 && (
                                        <div className="text-xs text-[var(--text-muted)] px-3 py-4 bg-[var(--accent-soft)]/50 rounded-lg italic text-center animate-pulse">
                                            Empieza tu manuscrito.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="px-4 py-8 flex flex-col items-center justify-center h-full text-[var(--text-muted)] opacity-50 text-center">
                            {!isSidebarCollapsed && (
                                <p className="text-xs font-bold uppercase tracking-widest mt-4">
                                    Selecciona "Manuscrito" arriba para ver el índice
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!isSidebarCollapsed && (
                    <div className="p-4 px-6 border-t border-[var(--border-main)] flex flex-col gap-2 bg-[var(--bg-app)]/50 shrink-0">
                        <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                            <span className="w-full text-center">{activeView === 'editor' ? (activeChapter?.content?.replace(/<[^>]*>?/gm, '').split(/\s+/).filter(word => word.length > 0).length || 0) : '—'} palabras</span>
                        </div>
                    </div>
                )}

            </div>

            {/* Modals - rendered outside sidebar container for proper z-index */}
            <Modal isOpen={isBookModalOpen} onClose={() => setIsBookModalOpen(false)} title="Nuevo Manuscrito">
                <div className="space-y-4 text-left font-sans">
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Título del libro</label>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setNewBookTitle(newBookTitle.toUpperCase())} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Mayúsculas">AA</button>
                                <button onClick={() => setNewBookTitle(newBookTitle.toLowerCase())} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Minúsculas">aa</button>
                                <button onClick={() => setNewBookTitle(newBookTitle ? newBookTitle.charAt(0).toUpperCase() + newBookTitle.slice(1).toLowerCase() : '')} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Capitalizar Letra Inicial">Aa</button>
                            </div>
                        </div>
                        <input
                            type="text"
                            autoFocus
                            value={newBookTitle}
                            onChange={(e) => setNewBookTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newBookTitle.trim()) {
                                    createBook(newBookTitle.trim());
                                    setIsBookModalOpen(false);
                                    setNewBookTitle('');
                                }
                            }}
                            placeholder="Ej. El viento en los sauces..."
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--accent-main)] focus:ring-1 focus:ring-[var(--accent-main)] transition-all text-[var(--text-main)] max-w-full"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={() => setIsBookModalOpen(false)}
                            className="px-5 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => {
                                if (newBookTitle.trim()) {
                                    createBook(newBookTitle.trim());
                                    setIsBookModalOpen(false);
                                    setNewBookTitle('');
                                }
                            }}
                            disabled={!newBookTitle.trim()}
                            className="px-5 py-2.5 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                        >
                            Crear
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isChapterModalOpen} onClose={() => setIsChapterModalOpen(false)} title="Agregar al Manuscrito">
                <div className="space-y-5 text-left font-sans">
                    {/* Select Type */}
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

                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Título del {createMode === 'volume' ? 'volumen' : 'capítulo'}</label>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setNewChapterTitle(newChapterTitle.toUpperCase())} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Mayúsculas">AA</button>
                                <button onClick={() => setNewChapterTitle(newChapterTitle.toLowerCase())} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Minúsculas">aa</button>
                                <button onClick={() => setNewChapterTitle(newChapterTitle ? newChapterTitle.charAt(0).toUpperCase() + newChapterTitle.slice(1).toLowerCase() : '')} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Capitalizar Letra Inicial">Aa</button>
                            </div>
                        </div>
                        <input
                            type="text"
                            autoFocus
                            value={newChapterTitle}
                            onChange={(e) => setNewChapterTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newChapterTitle.trim()) {
                                    createChapter({
                                        title: newChapterTitle.trim(),
                                        isVolume: createMode === 'volume',
                                        parentId: createMode === 'chapter' ? (selectedVolumeId || null) : null
                                    });
                                    setIsChapterModalOpen(false);
                                    setNewChapterTitle('');
                                }
                            }}
                            placeholder={createMode === 'volume' ? "Ej. El Despertar" : "Ej. El primer encuentro"}
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--accent-main)] focus:ring-1 focus:ring-[var(--accent-main)] transition-all text-[var(--text-main)] max-w-full"
                        />
                    </div>

                    {createMode === 'chapter' && chapters.filter(c => c.isVolume).length > 0 && (
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Perteneciente al Volumen (Opcional)</label>
                            <select
                                value={selectedVolumeId}
                                onChange={(e) => setSelectedVolumeId(e.target.value)}
                                className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--accent-main)] focus:ring-1 focus:ring-[var(--accent-main)] transition-all text-[var(--text-main)] max-w-full appearance-none"
                            >
                                <option value="">-- Ninguno (Capítulo Suelto) --</option>
                                {chapters.filter(c => c.isVolume).map(v => (
                                    <option key={v.id} value={v.id}>{itemLabels[v.id]}{v.title}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => setIsChapterModalOpen(false)}
                            className="px-5 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => {
                                if (newChapterTitle.trim()) {
                                    createChapter({
                                        title: newChapterTitle.trim(),
                                        isVolume: createMode === 'volume',
                                        parentId: createMode === 'chapter' ? (selectedVolumeId || null) : null
                                    });
                                    setIsChapterModalOpen(false);
                                    setNewChapterTitle('');
                                }
                            }}
                            disabled={!newChapterTitle.trim()}
                            className={`px-5 py-2.5 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${createMode === 'volume' ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-[var(--accent-main)] hover:bg-indigo-500'}`}
                        >
                            Crear {createMode === 'volume' ? 'Volumen' : 'Capítulo'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-[#020617]/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20 shadow-inner">
                                <Trash2 size={24} className="text-red-500" />
                            </div>
                            <h3 className="text-xl font-black text-[var(--text-main)] mb-2 tracking-tight">
                                {itemToDelete?.isVolume ? '¿Eliminar Volumen?' : '¿Eliminar Capítulo?'}
                            </h3>
                            <p className="text-[var(--text-muted)] text-sm px-4">
                                {itemToDelete?.isVolume ? 'Los capítulos internos NO se borrarán de la app, pasarán a ser capítulos sueltos. Sin embargo, el volumen desaparecerá para siempre.' : 'Estás a punto de borrar definitivamente este capítulo. Esta acción no se puede deshacer.'}
                            </p>
                            <div className="mt-5 p-3 bg-red-500/5 rounded-xl border border-red-500/10">
                                <p className="font-bold text-red-500 text-sm font-serif italic truncate">
                                    "{itemToDelete ? (itemLabels[itemToDelete.id] || '') + itemToDelete.title : ''}"
                                </p>
                            </div>
                        </div>
                        <div className="flex border-t border-[var(--border-main)] mt-2">
                            <button
                                onClick={() => {
                                    setIsDeleteModalOpen(false);
                                    setChapterToDelete(null);
                                }}
                                className="flex-1 py-4 font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-app)] transition-colors text-sm uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    deleteChapter(chapterToDelete);
                                    setIsDeleteModalOpen(false);
                                    setChapterToDelete(null);
                                }}
                                className="flex-1 py-4 font-black text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors text-sm uppercase tracking-widest bg-red-500/5"
                            >
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default Sidebar;
