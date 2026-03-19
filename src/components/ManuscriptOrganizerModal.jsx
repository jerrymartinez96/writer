import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    DndContext, 
    closestCenter, 
    PointerSensor, 
    useSensor, 
    useSensors, 
    DragOverlay,
    defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { 
    SortableContext, 
    verticalListSortingStrategy, 
    useSortable, 
    arrayMove,
    rectSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
    X, 
    GripVertical, 
    Move, 
    Save, 
    RotateCcw, 
    LayoutGrid, 
    List, 
    RefreshCw, 
    Check, 
    AlertCircle,
    Layers,
    FileText,
    ArrowRight
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';

// --- Sub-components for DnD ---

const SortableItem = ({ id, item, type, viewMode, onMoveToEmptyVolume }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 100 : 'auto',
    };

    if (viewMode === 'cards') {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className={`bg-[var(--bg-app)] border border-[var(--border-main)] p-4 rounded-xl shadow-sm transition-all relative group h-32 flex flex-col justify-between ${isDragging ? 'ring-2 ring-indigo-500' : 'hover:border-indigo-500/50'}`}
            >
                <div {...attributes} {...listeners} className="absolute top-2 right-2 p-1 text-[var(--text-muted)] cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical size={14} />
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-60">
                        {type === 'volume' ? 'Volumen' : 'Capítulo'}
                    </span>
                    <h4 className="font-bold text-sm text-[var(--text-main)] line-clamp-2 leading-tight pr-4">{item.title}</h4>
                </div>
                {type === 'volume' && (
                    <div className="text-[10px] font-bold text-indigo-500 bg-indigo-500/10 w-fit px-2 py-0.5 rounded-full">
                         Estructura
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-3 p-3 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl mb-2 transition-all group ${isDragging ? 'ring-2 ring-indigo-500 shadow-xl' : 'hover:border-indigo-500/30'}`}
        >
            <div {...attributes} {...listeners} className="p-1 text-[var(--text-muted)] cursor-grab active:cursor-grabbing">
                <GripVertical size={16} />
            </div>
            <div className="flex items-center gap-3 flex-1 min-w-0">
                {type === 'volume' ? <Layers size={16} className="text-indigo-500 shrink-0" /> : <FileText size={16} className="text-emerald-500 shrink-0" />}
                <span className={`text-sm tracking-tight truncate ${type === 'volume' ? 'font-black font-serif italic' : 'font-medium'}`}>
                    {item.title}
                </span>
            </div>
        </div>
    );
};

const ManuscriptOrganizerModal = ({ isOpen, onClose }) => {
    const { chapters, updateChapter } = useData();
    const toast = useToast();

    // Local state for reordering (allows undo and preview)
    const [localChapters, setLocalChapters] = useState([]);
    const [history, setHistory] = useState([]);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'cards'
    const [isSaving, setIsSaving] = useState(false);
    const [activeId, setActiveId] = useState(null);

    // Initialize local state
    useEffect(() => {
        if (isOpen) {
            setLocalChapters(JSON.parse(JSON.stringify(chapters)));
            setHistory([]);
        }
    }, [isOpen, chapters]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const volumes = useMemo(() => 
        localChapters.filter(c => c.isVolume).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    [localChapters]);

    const standaloneChapters = useMemo(() => 
        localChapters.filter(c => !c.isVolume && !c.parentId).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    [localChapters]);

    const getVolumeChapters = useCallback((volId) => 
        localChapters.filter(c => c.parentId === volId).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    [localChapters]);

    const addToHistory = (newState) => {
        setHistory(prev => [...prev, localChapters]);
        setLocalChapters(newState);
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const previousState = history[history.length - 1];
        setLocalChapters(previousState);
        setHistory(prev => prev.slice(0, -1));
    };

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over || active.id === over.id) return;

        const activeItem = localChapters.find(c => c.id === active.id);
        const overItem = localChapters.find(c => c.id === over.id);

        if (!activeItem || !overItem) return;

        let newItems = [...localChapters];

        // 1. Logic for Volume Reordering (only if both are volumes)
        if (activeItem.isVolume && overItem.isVolume) {
            const volItems = newItems.filter(c => c.isVolume).sort((a,b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            const oldIndexIdx = volItems.findIndex(v => v.id === active.id);
            const newIndexIdx = volItems.findIndex(v => v.id === over.id);
            const reorderedVols = arrayMove(volItems, oldIndexIdx, newIndexIdx);
            
            reorderedVols.forEach((v, index) => {
                const item = newItems.find(it => it.id === v.id);
                if (item) item.orderIndex = index;
            });
            addToHistory(newItems);
            return;
        }

        // 2. Logic for Chapter Reordering / Moving
        if (!activeItem.isVolume) {
            // Target can be a chapter or a volume
            let targetParentId = overItem.isVolume ? overItem.id : overItem.parentId;
            
            // If target is a chapter, we move it to that parent and that position
            // If target is a volume, we move it to the end of that volume
            const siblings = newItems.filter(c => c.parentId === targetParentId && !c.isVolume).sort((a,b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            
            const oldIdx = newItems.findIndex(c => c.id === active.id);
            const activeClone = { ...newItems[oldIdx], parentId: targetParentId };
            
            // Remove from old position
            newItems.splice(oldIdx, 1);
            
            // Re-find target parent items after removal
            const targetSiblings = newItems.filter(c => c.parentId === targetParentId && !c.isVolume).sort((a,b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            
            let finalIdxInSiblings = overItem.isVolume ? targetSiblings.length : targetSiblings.findIndex(c => c.id === over.id);
            if (finalIdxInSiblings === -1) finalIdxInSiblings = targetSiblings.length;

            // Insert at new position
            targetSiblings.splice(finalIdxInSiblings, 0, activeClone);
            
            // Recalculate orderIndex for all siblings in that parent
            targetSiblings.forEach((c, index) => {
                const item = newItems.find(it => it.id === c.id);
                if (item) {
                    item.orderIndex = index;
                    item.parentId = targetParentId;
                } else {
                    // It was the active clone
                    newItems.push({ ...c, orderIndex: index, parentId: targetParentId });
                }
            });

            addToHistory(newItems);
        }
    };


    const handleSave = async () => {
        setIsSaving(true);
        try {
            // 1. Group by parent to use batch logic if possible (simulated here)
            const updates = localChapters.map(c => ({
                id: c.id,
                parentId: c.parentId || null,
                orderIndex: c.orderIndex ?? 0,
                title: c.title,
                masterDocId: c.masterDocId || null
            }));


            // Persist each change to Firebase
            for (const update of updates) {
                await updateChapter(update.id, {
                    parentId: update.parentId,
                    orderIndex: update.orderIndex,
                    title: update.title,
                    masterDocId: update.masterDocId || null
                });
            }

            toast.success("Estructura guardada con éxito.");
            onClose();
        } catch (error) {
            console.error("Save error:", error);
            toast.error("Error al guardar la estructura.");
        } finally {
            setIsSaving(false);
        }
    };

    const activeItem = activeId ? localChapters.find(c => c.id === activeId) : null;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-[var(--bg-app)] w-full max-w-6xl h-[90vh] rounded-[40px] flex flex-col overflow-hidden border border-[var(--border-main)] shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-8 border-b border-[var(--border-main)] shrink-0">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="bg-indigo-500/10 p-2 rounded-xl">
                                <Move size={20} className="text-indigo-500" />
                            </div>
                            <h2 className="text-3xl font-black font-serif text-[var(--text-main)] italic">Organizador de Manuscrito</h2>
                        </div>
                        <p className="text-sm text-[var(--text-muted)] font-medium">Reordena capítulos y volúmenes con libertad creativa.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="p-3 hover:bg-[var(--accent-soft)] rounded-2xl transition-all text-[var(--text-muted)] hover:text-[var(--text-main)]">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between px-8 py-4 bg-[var(--bg-editor)]/30 border-b border-[var(--border-main)] shrink-0 gap-6">
                    <div className="flex items-center gap-2">
                        <div className="flex bg-[var(--bg-app)] p-1 rounded-xl border border-[var(--border-main)] shadow-sm">
                            <button 
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-indigo-500 text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)]'}`}
                                title="Vista de Lista"
                            >
                                <List size={18} />
                            </button>
                            <button 
                                onClick={() => setViewMode('cards')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-indigo-500 text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)]'}`}
                                title="Modo Storyboard"
                            >
                                <LayoutGrid size={18} />
                            </button>
                        </div>

                        <div className="h-4 w-px bg-[var(--border-main)] mx-2"></div>

                        <button 
                            onClick={handleUndo}
                            disabled={history.length === 0}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-indigo-500 disabled:opacity-30 transition-all hover:bg-indigo-500/5 rounded-xl"
                        >
                            <RotateCcw size={14} /> Deshacer ({history.length})
                        </button>
                    </div>

                    <div className="flex items-center gap-6">
                        <button 
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 overflow-y-auto p-10 scrollbar-hide bg-indigo-500/[0.01]">
                    <div className="max-w-5xl mx-auto">
                        <DndContext 
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <div className={viewMode === 'cards' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8' : 'space-y-8'}>
                                {/* Render Volumes */}
                                <SortableContext items={volumes.map(v => v.id)} strategy={viewMode === 'cards' ? rectSortingStrategy : verticalListSortingStrategy}>
                                    {volumes.map(vol => (
                                        <div key={vol.id} className={viewMode === 'cards' ? 'space-y-4' : ''}>
                                            <SortableItem id={vol.id} item={vol} type="volume" viewMode={viewMode} />
                                            
                                            <div className={`${viewMode === 'cards' ? 'bg-[var(--bg-app)]/40 p-1 rounded-2xl border-2 border-dashed border-[var(--border-main)] min-h-[100px] flex flex-col gap-2' : 'ml-10 pl-4 border-l-2 border-indigo-500/20 py-2 space-y-1'}`}>
                                                <SortableContext 
                                                    items={getVolumeChapters(vol.id).map(c => c.id)} 
                                                    strategy={viewMode === 'cards' ? rectSortingStrategy : verticalListSortingStrategy}
                                                >
                                                    {getVolumeChapters(vol.id).map(chap => (
                                                        <SortableItem key={chap.id} id={chap.id} item={chap} type="chapter" viewMode={viewMode} />
                                                    ))}
                                                    {getVolumeChapters(vol.id).length === 0 && (
                                                        <div className="h-full flex flex-col items-center justify-center p-6 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest opacity-40 italic">
                                                            Suelta aquí para añadir a "{vol.title}"
                                                        </div>
                                                    )}
                                                </SortableContext>
                                            </div>
                                        </div>
                                    ))}
                                </SortableContext>

                                {/* Render Standalone Chapters */}
                                {standaloneChapters.length > 0 && (
                                    <div className={viewMode === 'cards' ? 'col-span-full mt-10' : 'mt-10'}>
                                        <h3 className="text-xs font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            <FileText size={14} /> Capítulos Sueltos
                                        </h3>
                                        <div className={viewMode === 'cards' ? 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-1'}>
                                            <SortableContext items={standaloneChapters.map(c => c.id)} strategy={viewMode === 'cards' ? rectSortingStrategy : verticalListSortingStrategy}>
                                                {standaloneChapters.map(chap => (
                                                    <SortableItem key={chap.id} id={chap.id} item={chap} type="chapter" viewMode={viewMode} />
                                                ))}
                                            </SortableContext>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <DragOverlay dropAnimation={{
                                sideEffects: defaultDropAnimationSideEffects({
                                    styles: {
                                        active: {
                                            opacity: '0.5',
                                        },
                                    },
                                }),
                            }}>
                                {activeId ? (
                                    <div className="opacity-80 scale-105">
                                        <SortableItem 
                                            id={activeId} 
                                            item={activeItem} 
                                            type={activeItem.isVolume ? 'volume' : 'chapter'} 
                                            viewMode={viewMode} 
                                        />
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="px-8 py-4 border-t border-[var(--border-main)] shrink-0 flex justify-between items-center text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest bg-[var(--bg-app)]">
                    <div className="flex items-center gap-6">
                        <span className="flex items-center gap-1.5"><Layers size={14} /> {volumes.length} Volúmenes</span>
                        <span className="flex items-center gap-1.5"><FileText size={14} /> {localChapters.filter(c => !c.isVolume).length} Capítulos</span>
                    </div>
                    {history.length > 0 && (
                        <div className="flex items-center gap-2 text-amber-500 animate-pulse">
                            <AlertCircle size={14} /> Tienes cambios sin guardar
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManuscriptOrganizerModal;
