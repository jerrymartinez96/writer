import { Plus, Settings, ChevronRight, Book, Folder, FileText, Trash2, Users, Search, MoreVertical, Edit2, LogOut, Check, AlignLeft, Sparkles, BookOpen, Globe, User, Layers, X, GripVertical, ShieldCheck, PencilLine, AlertTriangle } from 'lucide-react';
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
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} className={`group relative transition-all ${isDragging ? 'scale-105 shadow-xl ring-2 ring-[var(--accent-main)] rounded-lg z-50' : ''} ${isNested ? 'flex items-center' : 'animate-in fade-in duration-300'}`}>
            <button
                onClick={onSelect}
                className={`w-full flex items-center gap-2 px-2 py-1.5 my-0.5 rounded-lg text-left transition-all ${isActive
                    ? `bg-[var(--accent-soft)] text-[var(--accent-main)] shadow-sm border border-[var(--accent-main)]/10`
                    : `hover:bg-[var(--accent-soft)]/50 text-[var(--text-main)] border border-transparent`
                    } ${isNested ? 'ml-1' : ''}`}
            >
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1.5 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity shrink-0 touch-none text-[var(--text-muted)]">
                    <GripVertical size={12} />
                </div>

                <div className="flex flex-col flex-1 truncate">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[8px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)] opacity-60 leading-none">
                            {label.replace(': ', '')}
                        </span>
                        <div className={`w-1 h-1 rounded-full shrink-0 ${statusColor}`} title={`Estado: ${chapter.status || 'Idea'}`}></div>
                    </div>
                    <span className={`text-[13px] tracking-tight truncate ${isActive ? 'font-black' : 'font-medium'}`}>
                        {chapter.title}
                    </span>
                </div>
            </button>

            <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-50"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
};

const SortableVolumeItem = ({ vol, isExpanded, onToggle, isActiveContainer, children, label, onDelete }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: vol.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className={`mb-1 last:mb-0 transition-all ${isDragging ? 'z-50' : ''}`}>
            <div className={`group sticky top-0 py-1.5 px-2 flex items-center gap-2 bg-[var(--bg-app)]/90 backdrop-blur-md z-10 rounded-xl border border-transparent transition-all ${isActiveContainer ? 'bg-indigo-500/5 border-indigo-500/10' : 'hover:bg-[var(--accent-soft)]/20 hover:border-[var(--border-main)]'}`}>
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 opacity-0 group-hover:opacity-30 hover:!opacity-100 transition-opacity text-[var(--text-muted)]" title="Mover Volumen">
                    <GripVertical size={14} />
                </div>

                <button
                    onClick={onToggle}
                    className="flex-1 flex items-center gap-2 overflow-hidden text-left"
                >
                    <ChevronRight size={14} className={`text-indigo-500/60 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''} shrink-0`} />

                    <div className="flex flex-col truncate">
                        <span className="text-[8px] font-black uppercase tracking-[0.1em] text-indigo-500/60 mb-0">
                            {label.replace(': ', '')}
                        </span>
                        <span className="text-[13px] font-black text-[var(--text-main)] truncate leading-tight transition-colors">
                            {vol.title}
                        </span>
                    </div>
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1.5 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 rounded-lg"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {isExpanded && (
                <div className="ml-3 pl-2 border-l border-[var(--border-main)] space-y-0.5 mt-1 pb-1">
                    {children}
                </div>
            )}
        </div>
    );
};

const Sidebar = ({ isMobileOpen, setIsMobileOpen }) => {
    const {
        books, activeBook, selectBook, createBook,
        chapters, activeChapter, selectChapter, createChapter, deleteChapter,
        activeView, setActiveView, reorderChapters, setPromptStudioPreload, promptStudioPreload
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
            case 'Finalizado': return 'bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.5)]';
            case 'Completado': return 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]';
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
    const currentVolumes = useMemo(() =>
        chapters.filter(c => c.isVolume).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
        [chapters]);

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

    const handleDragEnd = (event, type) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        let items;
        let parentId = null;

        if (type === 'volume') {
            items = currentVolumes;
        } else if (type === 'chapter') {
            // Find parentId from active item
            const activeItem = chapters.find(c => c.id === active.id);
            parentId = activeItem?.parentId || null;
            items = parentId
                ? chapters.filter(c => c.parentId === parentId).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                : standaloneChapters;
        } else {
            // If dragging between different groups (parentId), for now we only support within same group
            // but we determine target group by the 'over' item's parentId
            const overItem = chapters.find(c => c.id === over.id);
            parentId = overItem?.parentId || null;
            const activeItem = chapters.find(c => c.id === active.id);
            if (activeItem?.parentId !== parentId) return; // Cross-parent dragging is more complex

            items = parentId
                ? chapters.filter(c => c.parentId === parentId).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                : standaloneChapters;
        }

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
                        onClick={() => handleSelectMobile(() => setActiveView('iaStudio'))}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all group ${activeView === 'iaStudio' ? 'bg-[var(--accent-soft)] text-[var(--accent-main)] font-semibold shadow-sm' : 'hover:bg-[var(--accent-soft)] text-[var(--text-main)] transition-colors'} ${isSidebarCollapsed ? 'justify-center w-12 h-12' : 'w-full text-left'}`}
                        title="IA Studio"
                    >
                        <div className={`shrink-0 p-1.5 rounded-md transition-transform group-hover:scale-110 ${activeView === 'iaStudio' ? 'bg-[var(--accent-main)] text-white shadow-md' : 'bg-purple-500/10 text-purple-500'}`}>
                            <Sparkles size={isSidebarCollapsed ? 18 : 14} />
                        </div>
                        {!isSidebarCollapsed && <span>IA Studio</span>}
                    </button>

                    <button
                        onClick={() => handleSelectMobile(() => setActiveView('forge'))}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all group ${activeView === 'forge' ? 'bg-[var(--accent-soft)] text-[var(--accent-main)] font-semibold shadow-sm' : 'hover:bg-[var(--accent-soft)] text-[var(--text-main)] transition-colors'} ${isSidebarCollapsed ? 'justify-center w-12 h-12' : 'w-full text-left'}`}
                        title="La Forja"
                    >
                        <div className={`shrink-0 p-1.5 rounded-md transition-transform group-hover:scale-110 ${activeView === 'forge' ? 'bg-[var(--accent-main)] text-white shadow-md' : 'bg-orange-500/10 text-orange-500'}`}>
                            <AlertTriangle size={isSidebarCollapsed ? 18 : 14} className={activeView === 'forge' ? 'text-white' : 'text-orange-500'} />
                        </div>
                        {!isSidebarCollapsed && <span>La Forja</span>}
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
                                    {/* Render Volumes with DnD reordering */}
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'volume')}>
                                        <SortableContext items={currentVolumes.map(v => v.id)} strategy={verticalListSortingStrategy}>
                                            {currentVolumes.map(vol => {
                                                const volChaptersList = volumeChapters(vol.id);
                                                return (
                                                    <SortableVolumeItem
                                                        key={vol.id}
                                                        vol={vol}
                                                        isExpanded={expandedVolumes[vol.id]}
                                                        onToggle={() => toggleVolume(vol.id)}
                                                        label={itemLabels[vol.id]}
                                                        onDelete={() => { setChapterToDelete(vol.id); setIsDeleteModalOpen(true); }}
                                                    >
                                                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'chapter')}>
                                                            <SortableContext items={volChaptersList.map(c => c.id)} strategy={verticalListSortingStrategy}>
                                                                {volChaptersList.map((chapter) => (
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
                                                        {volChaptersList.length === 0 && (
                                                            <div className="text-[10px] text-indigo-500/60 font-bold uppercase tracking-widest px-4 py-2 opacity-50 ml-1">
                                                                Volumen vacío
                                                            </div>
                                                        )}
                                                    </SortableVolumeItem>
                                                )
                                            })}
                                        </SortableContext>
                                    </DndContext>

                                    {/* Render Floating Chapters with DnD */}
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'chapter')}>
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
                <div className="p-8 space-y-8 text-left font-sans">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                <Plus size={14} />
                                Identificación del Libro
                            </label>
                            <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-editor)] rounded-xl border border-[var(--border-main)]">
                                <button onClick={() => setNewBookTitle(newBookTitle.toUpperCase())} className="px-2 py-1 rounded-lg hover:bg-white/10 text-[9px] font-black text-[var(--text-muted)] hover:text-indigo-500 transition-all uppercase" title="Mayúsculas">AA</button>
                                <button onClick={() => setNewBookTitle(newBookTitle.toLowerCase())} className="px-2 py-1 rounded-lg hover:bg-white/10 text-[9px] font-black text-[var(--text-muted)] hover:text-indigo-500 transition-all uppercase" title="Minúsculas">aa</button>
                                <button onClick={() => setNewBookTitle(newBookTitle ? newBookTitle.charAt(0).toUpperCase() + newBookTitle.slice(1).toLowerCase() : '')} className="px-2 py-1 rounded-lg hover:bg-white/10 text-[9px] font-black text-[var(--text-muted)] hover:text-indigo-500 transition-all uppercase" title="Capitalizar">Aa</button>
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
                            placeholder="Ej. Crónicas del Alba..."
                            className="w-full bg-[var(--bg-editor)] border-2 border-[var(--border-main)] rounded-[24px] px-6 py-5 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-[var(--text-main)] text-xl font-serif italic placeholder:opacity-30 placeholder:italic"
                        />
                    </div>

                    <div className="pt-4 flex flex-col gap-4">
                        <button
                            onClick={() => {
                                if (newBookTitle.trim()) {
                                    createBook(newBookTitle.trim());
                                    setIsBookModalOpen(false);
                                    setNewBookTitle('');
                                }
                            }}
                            disabled={!newBookTitle.trim()}
                            className="w-full px-8 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[24px] font-black text-[11px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-4 shadow-xl shadow-indigo-600/20 active:scale-95 disabled:opacity-30"
                        >
                            <Plus size={20} /> Crear Nuevo Manuscrito
                        </button>
                        <p className="text-[10px] font-bold text-[var(--text-muted)] text-center opacity-50 italic">Podrás agregar capítulos y volúmenes después</p>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isChapterModalOpen} onClose={() => setIsChapterModalOpen(false)} title="Agregar al Manuscrito">
                <div className="p-8 space-y-8 text-left font-sans bg-indigo-500/[0.01]">
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

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                <Plus size={14} />
                                Detalles del {createMode === 'volume' ? 'Volumen' : 'Capítulo'}
                            </label>
                            <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-editor)] rounded-xl border border-[var(--border-main)]">
                                <button onClick={() => setNewChapterTitle(newChapterTitle.toUpperCase())} className="px-2 py-1 rounded-lg hover:bg-white/10 text-[9px] font-black text-[var(--text-muted)] hover:text-indigo-500 transition-all uppercase">AA</button>
                                <button onClick={() => setNewChapterTitle(newChapterTitle.toLowerCase())} className="px-2 py-1 rounded-lg hover:bg-white/10 text-[9px] font-black text-[var(--text-muted)] hover:text-indigo-500 transition-all uppercase">aa</button>
                                <button onClick={() => setNewChapterTitle(newChapterTitle ? newChapterTitle.charAt(0).toUpperCase() + newChapterTitle.slice(1).toLowerCase() : '')} className="px-2 py-1 rounded-lg hover:bg-white/10 text-[9px] font-black text-[var(--text-muted)] hover:text-indigo-500 transition-all uppercase">Aa</button>
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
                            placeholder={createMode === 'volume' ? "Ej. Volumen II: La Tormenta" : "Ej. Capítulo 1: Un comienzo inesperado"}
                            className="w-full bg-[var(--bg-editor)] border-2 border-[var(--border-main)] rounded-[24px] px-6 py-5 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-[var(--text-main)] text-xl font-serif italic placeholder:opacity-30 placeholder:italic"
                        />
                    </div>

                    {createMode === 'chapter' && chapters.filter(c => c.isVolume).length > 0 && (
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] flex items-center gap-2 opacity-60">
                                <Layers size={14} />
                                Ubicación (Opcional)
                            </label>
                            <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-3 scrollbar-hide py-1">
                                <button
                                    onClick={() => setSelectedVolumeId('')}
                                    className={`p-4 rounded-[20px] border-2 text-[10px] font-black uppercase tracking-[0.1em] transition-all text-left flex flex-col gap-2 relative overflow-hidden ${!selectedVolumeId ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-600/20' : 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-indigo-500/50 hover:bg-indigo-500/[0.03]'}`}
                                >
                                    <span className={`text-[8px] uppercase font-black tracking-widest ${!selectedVolumeId ? 'text-white/60' : 'text-indigo-500'}`}>Desvincular</span>
                                    <span className="truncate font-sans tracking-tight">Capítulo Suelto</span>
                                </button>
                                {chapters.filter(c => c.isVolume).map(v => (
                                    <button
                                        key={v.id}
                                        onClick={() => setSelectedVolumeId(v.id)}
                                        className={`p-4 rounded-[20px] border-2 text-[10px] font-black uppercase tracking-[0.1em] transition-all text-left flex flex-col gap-2 relative overflow-hidden ${selectedVolumeId === v.id ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-600/20' : 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-main)] hover:border-indigo-500/50 hover:bg-indigo-500/[0.03]'}`}
                                    >
                                        <span className={`text-[8px] uppercase font-black tracking-widest ${selectedVolumeId === v.id ? 'text-white/60' : 'text-indigo-500'}`}>{itemLabels[v.id]?.replace(': ', '') || 'Volumen'}</span>
                                        <span className="truncate font-serif italic tracking-tight">{v.title}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-4 pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => setIsChapterModalOpen(false)}
                            className="flex-1 px-8 py-5 rounded-[22px] font-black text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
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
                            className="flex-1 px-8 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[22px] font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 active:scale-95 disabled:opacity-30"
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirmar Eliminación">
                <div className="p-8 text-center bg-red-500/[0.02]">
                    <div className="w-20 h-20 bg-red-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-8 border-2 border-red-500/20 shadow-xl shadow-red-500/10">
                        <Trash2 size={32} className="text-red-500" />
                    </div>

                    <h3 className="text-2xl font-black text-[var(--text-main)] mb-3 tracking-tight font-serif italic">
                        {itemToDelete?.isVolume ? '¿Borrar este Volumen?' : '¿Borrar este Capítulo?'}
                    </h3>

                    <p className="text-[var(--text-muted)] text-sm max-w-sm mx-auto leading-relaxed">
                        {itemToDelete?.isVolume
                            ? 'Los capítulos internos NO se borrarán de la app, pasarán a ser capítulos sueltos. Sin embargo, el volumen desaparecerá para siempre.'
                            : 'Estás a punto de borrar definitivamente este capítulo. Esta acción moverá el elemento a la papelera por 30 días.'}
                    </p>

                    <div className="mt-8 p-5 bg-[var(--bg-app)] rounded-3xl border-2 border-red-500/10 shadow-inner group overflow-hidden relative">
                        <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500/60 mb-2">Elemento Objetivo</p>
                        <p className="font-black text-lg text-red-600 font-serif italic truncate relative z-10">
                            "{itemToDelete ? (itemLabels[itemToDelete.id] || '') + itemToDelete.title : 'Desconocido'}"
                        </p>
                    </div>

                    <div className="mt-10 flex items-center gap-4">
                        <button
                            onClick={() => {
                                setIsDeleteModalOpen(false);
                                setChapterToDelete(null);
                            }}
                            className="flex-1 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-all active:scale-95"
                        >
                            No, Conservar
                        </button>
                        <button
                            onClick={() => {
                                deleteChapter(chapterToDelete);
                                setIsDeleteModalOpen(false);
                                setChapterToDelete(null);
                            }}
                            className="flex-1 py-5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] shadow-xl shadow-red-600/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3"
                        >
                            Sí, Eliminar
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    )
}

export default Sidebar;
