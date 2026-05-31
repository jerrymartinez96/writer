import React, { useState, useMemo, useEffect } from 'react';
import Modal from '../Modal';
import { SYSTEM_WORLD_ITEM_IDS, SYSTEM_WORLD_ITEM_LABELS } from './IAStudioUtils';
import { useIAStudioContext } from '../../context/IAStudioContext';
import {
    BookOpen, Globe, Layers, Users, Bookmark, FileText, ChevronRight, Target, Check, Search, Plus, Sparkles, X, CheckSquare, Square
} from 'lucide-react';

const IAStudioContextConfigModal = ({
    isOpen,
    onClose,
    chapters = [],
    worldItems = [],
    characters = [],
    mode = 'context', // 'context' | 'destination'
}) => {
    const { contextSelections, destinationDoc, onContextChange, onDestinationChange } = useIAStudioContext();
    const [activeTab, setActiveTab] = useState(mode === 'destination' ? 'destination' : 'masterdoc');
    
    useEffect(() => {
        if (isOpen) {
            if (mode === 'destination') {
                setActiveTab('destination');
            } else {
                setActiveTab(prev => prev === 'destination' ? 'masterdoc' : prev);
            }
        }
    }, [isOpen, mode]);

    const [expandedVolumes, setExpandedVolumes] = useState({});
    const [chapterSearch, setChapterSearch] = useState('');
    const [worldItemSearch, setWorldItemSearch] = useState('');
    const [characterSearch, setCharacterSearch] = useState('');
    const [destSearch, setDestSearch] = useState('');
    const [destInnerTab, setDestInnerTab] = useState('chapters'); // 'chapters' | 'masterdoc' | 'characters'

    const selectedChapterIds = contextSelections?.chapterIds || [];
    const selectedWorldItemIds = contextSelections?.worldItemIds || [];
    const selectedCharacterIds = contextSelections?.characterIds || [];

    const volumes = useMemo(() =>
        chapters.filter(c => c.isVolume).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
        [chapters]
    );
    const getChaptersByParent = (parentId) =>
        chapters.filter(c => c.parentId === parentId).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    const standaloneChapters = useMemo(() =>
        chapters.filter(c => !c.parentId && !c.isVolume).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
        [chapters]
    );
    const customWorldItems = useMemo(() =>
        worldItems.filter(w => !SYSTEM_WORLD_ITEM_IDS.includes(w.id)),
        [worldItems]
    );

    // Toggle Selections
    const toggleChapter = (id) => {
        const newIds = selectedChapterIds.includes(id)
            ? selectedChapterIds.filter(cid => cid !== id)
            : [...selectedChapterIds, id];
        onContextChange({ ...contextSelections, chapterIds: newIds });
    };
    const toggleWorldItem = (id) => {
        const newIds = selectedWorldItemIds.includes(id)
            ? selectedWorldItemIds.filter(wid => wid !== id)
            : [...selectedWorldItemIds, id];
        onContextChange({ ...contextSelections, worldItemIds: newIds });
    };
    const toggleCharacter = (id) => {
        const newIds = selectedCharacterIds.includes(id)
            ? selectedCharacterIds.filter(cid => cid !== id)
            : [...selectedCharacterIds, id];
        onContextChange({ ...contextSelections, characterIds: newIds });
    };

    // Volume level chapter selection toggling
    const toggleVolumeChapters = (volId) => {
        const volChapters = getChaptersByParent(volId).map(ch => ch.id);
        const allSelected = volChapters.every(id => selectedChapterIds.includes(id));
        
        let newIds;
        if (allSelected) {
            // Deselect all chapters under this volume
            newIds = selectedChapterIds.filter(id => !volChapters.includes(id));
        } else {
            // Select all chapters under this volume (avoiding duplicates)
            newIds = [...new Set([...selectedChapterIds, ...volChapters])];
        }
        onContextChange({ ...contextSelections, chapterIds: newIds });
    };

    // Bulk Selections
    const selectAllChapters = () => {
        const allIds = chapters.filter(c => !c.isVolume).map(c => c.id);
        onContextChange({ ...contextSelections, chapterIds: allIds });
    };
    const clearChapters = () => {
        onContextChange({ ...contextSelections, chapterIds: [] });
    };
    const selectAllWorldItems = () => {
        const systemIds = SYSTEM_WORLD_ITEM_IDS.filter(id => id !== 'system_personajes');
        const customIds = customWorldItems.map(w => w.id);
        onContextChange({ ...contextSelections, worldItemIds: [...systemIds, ...customIds] });
    };
    const clearWorldItems = () => {
        onContextChange({ ...contextSelections, worldItemIds: [] });
    };
    const selectAllCharacters = () => {
        const allIds = characters.filter(c => !c.isCategory && c.name).map(c => c.id);
        onContextChange({ ...contextSelections, characterIds: allIds });
    };
    const clearCharacters = () => {
        onContextChange({ ...contextSelections, characterIds: [] });
    };

    // Search and Filter logic for reference lists
    const filteredChapters = useMemo(() => {
        const query = chapterSearch.trim().toLowerCase();
        if (!query) return null;
        return chapters.filter(c => !c.isVolume && (c.title || '').toLowerCase().includes(query));
    }, [chapters, chapterSearch]);

    const filteredWorldItemsList = useMemo(() => {
        const query = worldItemSearch.trim().toLowerCase();
        if (!query) return null;
        const allItems = [
            ...SYSTEM_WORLD_ITEM_IDS.filter(wid => wid !== 'system_personajes').map(wid => ({ id: wid, title: SYSTEM_WORLD_ITEM_LABELS[wid] || wid, isSystem: true })),
            ...customWorldItems.map(w => ({ id: w.id, title: w.title || 'Sin título', isSystem: false }))
        ];
        return allItems.filter(item => item.title.toLowerCase().includes(query));
    }, [worldItems, worldItemSearch, customWorldItems]);

    const filteredCharactersList = useMemo(() => {
        const query = characterSearch.trim().toLowerCase();
        const list = characters.filter(c => !c.isCategory && c.name);
        if (!query) return null;
        return list.filter(c => (c.name || '').toLowerCase().includes(query));
    }, [characters, characterSearch]);

    // Search logic for destination list
    const filteredDestChapters = useMemo(() => {
        const query = destSearch.trim().toLowerCase();
        const list = chapters.filter(c => !c.isVolume);
        if (!query) return list;
        return list.filter(c => (c.title || '').toLowerCase().includes(query));
    }, [chapters, destSearch]);

    const filteredDestWorldItems = useMemo(() => {
        const query = destSearch.trim().toLowerCase();
        const list = [
            ...SYSTEM_WORLD_ITEM_IDS.filter(wid => wid !== 'system_personajes').map(wid => ({ id: wid, title: SYSTEM_WORLD_ITEM_LABELS[wid] || wid })),
            ...customWorldItems.map(w => ({ id: w.id, title: w.title || 'Sin título' }))
        ];
        if (!query) return list;
        return list.filter(item => item.title.toLowerCase().includes(query));
    }, [worldItems, customWorldItems, destSearch]);

    const filteredDestCharacters = useMemo(() => {
        const query = destSearch.trim().toLowerCase();
        const list = characters.filter(c => !c.isCategory);
        if (!query) return list;
        return list.filter(c => (c.name || '').toLowerCase().includes(query));
    }, [characters, destSearch]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'Finalizado': return 'bg-indigo-500';
            case 'Completado': return 'bg-emerald-500';
            case 'Revisión': return 'bg-amber-500';
            case 'Borrador': return 'bg-blue-500';
            default: return 'bg-gray-400';
        }
    };

    const currentDestLabel = () => {
        if (destinationDoc?.mode === 'auto') return 'Automático (La IA decide)';
        if (destinationDoc?.mode === 'new') return 'Crear nuevo capítulo';
        return destinationDoc?.docTitle || 'Documento específico';
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={mode === 'destination' ? "Destino de Escritura" : "Contexto de Referencia"} size="xl">
            {/* Tabs at the top */}
            {mode !== 'destination' && (
                <div className="flex gap-1 sm:gap-2 p-1 bg-[var(--bg-editor)] rounded-[20px] border border-[var(--border-main)]/60 shrink-0 mx-3 sm:mx-4 md:mx-6 mt-4.5 shadow-inner">
                    <button
                        onClick={() => setActiveTab('masterdoc')}
                        className={`flex-1 flex items-center justify-center gap-1 sm:gap-1.5 md:gap-2 py-2 sm:py-2.5 px-1 sm:px-2 rounded-lg sm:rounded-xl text-[9px] xs:text-[10px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer ${
                            activeTab === 'masterdoc'
                                ? 'bg-[var(--bg-app)] text-indigo-500 shadow-[0_4px_12px_rgba(99,102,241,0.08)] border border-[var(--border-main)]/80 scale-[1.01] font-bold'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/30'
                        }`}
                    >
                        <Globe size={12} className="shrink-0" /> 
                        <span className="hidden sm:inline">1. </span>
                        <span className="hidden xs:inline">Master Doc</span>
                        <span className="xs:hidden">Master</span>
                        <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-black text-[8px] sm:text-[9px] shrink-0 ml-0.5 sm:ml-1">
                            {selectedWorldItemIds.length + selectedCharacterIds.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('manuscript')}
                        className={`flex-1 flex items-center justify-center gap-1 sm:gap-1.5 md:gap-2 py-2 sm:py-2.5 px-1 sm:px-2 rounded-lg sm:rounded-xl text-[9px] xs:text-[10px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer ${
                            activeTab === 'manuscript'
                                ? 'bg-[var(--bg-app)] text-indigo-500 shadow-[0_4px_12px_rgba(99,102,241,0.08)] border border-[var(--border-main)]/80 scale-[1.01] font-bold'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/30'
                        }`}
                    >
                        <BookOpen size={12} className="shrink-0" /> 
                        <span className="hidden sm:inline">2. </span>
                        <span className="hidden xs:inline">Manuscrito</span>
                        <span className="xs:hidden">MS</span>
                        <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-black text-[8px] sm:text-[9px] shrink-0 ml-0.5 sm:ml-1">
                            {selectedChapterIds.length}
                        </span>
                    </button>
                </div>
            )}

            {/* Tab Contents */}
            <div className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-5">
                {activeTab === 'masterdoc' ? (
                    <div className="space-y-3 sm:space-y-4 animate-in fade-in duration-300">
                        {/* 1. Master Doc Cards Section */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                                    <Globe size={12} className="text-indigo-500/80" /> Fichas del Master Doc
                                </p>
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={selectAllWorldItems}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-indigo-500/10 hover:border-indigo-500/25 cursor-pointer active:scale-95"
                                        title="Seleccionar todas las fichas"
                                    >
                                        Todos
                                    </button>
                                    <button
                                        onClick={clearWorldItems}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-[var(--border-main)]/40 hover:border-[var(--border-main)]/80 cursor-pointer active:scale-95"
                                        title="Limpiar selección de fichas"
                                    >
                                        Ninguno
                                    </button>
                                </div>
                            </div>

                            {/* Responsive grid of small, ultra-compact selectable cards (adaptable columns) */}
                            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                                {SYSTEM_WORLD_ITEM_IDS.filter(wid => wid !== 'system_personajes').map(wid => {
                                    const label = SYSTEM_WORLD_ITEM_LABELS[wid] || wid;
                                    const iconMap = { system_personajes: Users, system_estructura: Layers, system_core: Bookmark };
                                    const Icon = iconMap[wid] || FileText;
                                    const isChecked = selectedWorldItemIds.includes(wid);
                                    return (
                                        <button
                                            key={wid}
                                            onClick={() => toggleWorldItem(wid)}
                                            className={`group flex flex-col items-center justify-center p-2.5 sm:p-3.5 rounded-2xl border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer text-center relative ${
                                                isChecked
                                                    ? 'bg-indigo-500/[0.04] border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-inner'
                                                    : 'bg-[var(--bg-editor)] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]'
                                            }`}
                                        >
                                            {isChecked && (
                                                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                                    <Check size={9} strokeWidth={4} />
                                                </div>
                                            )}
                                            <div className={`w-8 h-8 sm:w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 transition-all duration-300 shrink-0 ${
                                                isChecked
                                                    ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/10'
                                                    : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)]/40 group-hover:text-indigo-500'
                                            }`}>
                                                <Icon size={14} />
                                            </div>
                                            <div className="min-w-0 w-full">
                                                <span className="text-[10px] sm:text-[11px] font-bold text-[var(--text-main)] block truncate">{label}</span>
                                                <span className="text-[8px] text-[var(--text-muted)] opacity-60 block mt-0.5 truncate hidden xs:block">Master Doc</span>
                                            </div>
                                        </button>
                                    );
                                })}

                                {customWorldItems.map(w => {
                                    const isChecked = selectedWorldItemIds.includes(w.id);
                                    return (
                                        <button
                                            key={w.id}
                                            onClick={() => toggleWorldItem(w.id)}
                                            className={`group flex flex-col items-center justify-center p-2.5 sm:p-3.5 rounded-2xl border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer text-center relative ${
                                                isChecked
                                                    ? 'bg-indigo-500/[0.04] border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-inner'
                                                    : 'bg-[var(--bg-editor)] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]'
                                            }`}
                                        >
                                            {isChecked && (
                                                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                                    <Check size={9} strokeWidth={4} />
                                                </div>
                                            )}
                                            <div className={`w-8 h-8 sm:w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 transition-all duration-300 shrink-0 ${
                                                isChecked
                                                    ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/10'
                                                    : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)]/40 group-hover:text-indigo-500'
                                            }`}>
                                                <FileText size={14} />
                                            </div>
                                            <div className="min-w-0 w-full">
                                                <span className="text-[10px] sm:text-[11px] font-bold text-[var(--text-main)] block truncate">{w.title || 'Sin título'}</span>
                                                <span className="text-[8px] text-[var(--text-muted)] opacity-60 block mt-0.5 truncate hidden xs:block">Ficha Custom</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 1.5. Characters Cards Section */}
                        {characters && characters.filter(c => !c.isCategory && c.name).length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                                        <Users size={12} className="text-indigo-500/80" /> Fichas de Personajes
                                    </p>
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={selectAllCharacters}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-indigo-500/10 hover:border-indigo-500/25 cursor-pointer active:scale-95"
                                            title="Seleccionar todos los personajes"
                                        >
                                            Todos
                                        </button>
                                        <button
                                            onClick={clearCharacters}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-[var(--border-main)]/40 hover:border-[var(--border-main)]/80 cursor-pointer active:scale-95"
                                            title="Limpiar selección de personajes"
                                        >
                                            Ninguno
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2">
                                    {characters.filter(c => !c.isCategory && c.name).map(c => {
                                        const isChecked = selectedCharacterIds.includes(c.id);
                                        return (
                                            <button
                                                key={c.id}
                                                onClick={() => toggleCharacter(c.id)}
                                                className={`group flex items-center gap-2 p-2 rounded-xl border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer relative text-left min-w-0 ${
                                                    isChecked
                                                        ? 'bg-indigo-500/[0.04] border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-inner'
                                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]'
                                                }`}
                                            >
                                                {isChecked && (
                                                    <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                                        <Check size={7} strokeWidth={5} />
                                                    </div>
                                                )}
                                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 ${
                                                    isChecked
                                                        ? 'bg-indigo-500/10 text-indigo-500'
                                                        : 'bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-indigo-500'
                                                }`}>
                                                    <Users size={11} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-[10.5px] font-bold text-[var(--text-main)] block truncate leading-tight">{c.name}</span>
                                                    <span className="text-[8.5px] text-[var(--text-muted)] opacity-60 block truncate leading-none mt-0.5">{c.role || 'Personaje'}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ) : activeTab === 'manuscript' ? (
                    <div className="space-y-3 sm:space-y-4 animate-in fade-in duration-300">
                        {/* 2. Chapters Section */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                                    <BookOpen size={12} className="text-indigo-500/80" /> Capítulos del Manuscrito
                                </p>
                                
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={selectAllChapters}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-indigo-500/10 hover:border-indigo-500/25 cursor-pointer active:scale-95"
                                        title="Seleccionar todos los capítulos"
                                    >
                                        Todos
                                    </button>
                                    <button
                                        onClick={clearChapters}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-[var(--border-main)]/40 hover:border-[var(--border-main)]/80 cursor-pointer active:scale-95"
                                        title="Limpiar selección de capítulos"
                                    >
                                        Ninguno
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3 pt-1">
                                {volumes.map(vol => {
                                    const volChapters = getChaptersByParent(vol.id);
                                    const volSelectedCount = volChapters.filter(ch => selectedChapterIds.includes(ch.id)).length;
                                    const isExpanded = expandedVolumes[vol.id] ?? true;
                                    return (
                                        <div key={vol.id} className="mb-3 bg-[var(--bg-app)]/20 rounded-2xl p-2.5 border border-[var(--border-main)]/30">
                                            <div className="flex items-center gap-2 w-full px-2 py-1.5 rounded-xl hover:bg-[var(--accent-soft)]/30 transition-all mb-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleVolumeChapters(vol.id);
                                                    }}
                                                    className="p-1 rounded-lg hover:bg-[var(--bg-editor)] text-[var(--text-muted)] hover:text-indigo-500 transition-all shrink-0 cursor-pointer active:scale-90"
                                                    title="Seleccionar todo el volumen"
                                                >
                                                    <div className={`w-4.5 h-4.5 rounded border transition-all flex items-center justify-center ${
                                                        volSelectedCount === volChapters.length && volChapters.length > 0
                                                            ? 'bg-indigo-500 border-indigo-500 text-white shadow-sm'
                                                            : volSelectedCount > 0
                                                            ? 'bg-indigo-500/15 border-indigo-500 text-indigo-500'
                                                            : 'border-[var(--border-main)] bg-[var(--bg-editor)]'
                                                    }`}>
                                                        {volSelectedCount === volChapters.length && volChapters.length > 0 && <Check size={9} strokeWidth={4} />}
                                                        {volSelectedCount > 0 && volSelectedCount < volChapters.length && (
                                                            <div className="w-1.5 h-0.5 bg-indigo-500 rounded-full animate-pulse" />
                                                        )}
                                                    </div>
                                                </button>

                                                <button
                                                    onClick={() => setExpandedVolumes(prev => ({ ...prev, [vol.id]: !isExpanded }))}
                                                    className="flex-1 flex items-center gap-2 text-left min-w-0 cursor-pointer"
                                                >
                                                    <Layers size={10} className="text-indigo-500/60 shrink-0" />
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] truncate flex-1">{vol.title}</span>
                                                    <span className="text-[9px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded font-black shrink-0">
                                                        {volSelectedCount}/{volChapters.length}
                                                    </span>
                                                    <ChevronRight size={10} className={`text-[var(--text-muted)] transition-transform duration-300 shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                                                </button>
                                            </div>

                                            {isExpanded && (
                                                volChapters.length === 0 ? (
                                                    <div className="text-[9px] text-[var(--text-muted)] opacity-55 italic ml-8 py-1">Volumen vacío</div>
                                                ) : (
                                                    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2 mt-1 ml-1 pl-1">
                                                        {volChapters.map(ch => {
                                                            const isChecked = selectedChapterIds.includes(ch.id);
                                                            return (
                                                                <button
                                                                    key={ch.id}
                                                                    onClick={() => toggleChapter(ch.id)}
                                                                    className={`group flex items-center gap-2 p-2 rounded-xl border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer relative text-left min-w-0 ${
                                                                        isChecked
                                                                            ? 'bg-indigo-500/[0.04] border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-inner'
                                                                            : 'bg-[var(--bg-editor)] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]'
                                                                    }`}
                                                                >
                                                                    {isChecked && (
                                                                        <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                                                            <Check size={7} strokeWidth={5} />
                                                                        </div>
                                                                    )}
                                                                    <div className={`w-5.5 h-5.5 rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 ${
                                                                        isChecked
                                                                            ? 'bg-indigo-500/10 text-indigo-500'
                                                                            : 'bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-indigo-500'
                                                                    }`}>
                                                                        <BookOpen size={10.5} />
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <span className="text-[10px] font-bold text-[var(--text-main)] block truncate leading-tight">{ch.title || 'Sin título'}</span>
                                                                        <div className="flex items-center gap-1 mt-0.5">
                                                                            <div className={`w-1 h-1 rounded-full shrink-0 ${getStatusColor(ch.status)}`} />
                                                                            <span className="text-[8px] text-[var(--text-muted)] opacity-60 block truncate leading-none">{ch.status || 'Idea'}</span>
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    );
                                })}
                                {standaloneChapters.length > 0 && (
                                    <div className="mt-3">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-65 block px-1 mb-1.5">📍 Capítulos Libres</span>
                                        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2">
                                            {standaloneChapters.map(ch => {
                                                const isChecked = selectedChapterIds.includes(ch.id);
                                                return (
                                                    <button
                                                        key={ch.id}
                                                        onClick={() => toggleChapter(ch.id)}
                                                        className={`group flex items-center gap-2 p-2 rounded-xl border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer relative text-left min-w-0 ${
                                                            isChecked
                                                                ? 'bg-indigo-500/[0.04] border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-inner'
                                                                : 'bg-[var(--bg-editor)] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]'
                                                        }`}
                                                    >
                                                        {isChecked && (
                                                            <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                                                <Check size={7} strokeWidth={5} />
                                                            </div>
                                                        )}
                                                        <div className={`w-5.5 h-5.5 rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 ${
                                                            isChecked
                                                                ? 'bg-indigo-500/10 text-indigo-500'
                                                                : 'bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-indigo-500'
                                                        }`}>
                                                            <BookOpen size={10.5} />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <span className="text-[10px] font-bold text-[var(--text-main)] block truncate leading-tight">{ch.title || 'Sin título'}</span>
                                                            <div className="flex items-center gap-1 mt-0.5">
                                                                <div className={`w-1 h-1 rounded-full shrink-0 ${getStatusColor(ch.status)}`} />
                                                                <span className="text-[8px] text-[var(--text-muted)] opacity-60 block truncate leading-none">{ch.status || 'Idea'}</span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {chapters.filter(c => !c.isVolume).length === 0 && (
                                    <p className="text-xs text-[var(--text-muted)] opacity-50 px-2 py-6 italic text-center animate-pulse">No hay capítulos</p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
                        {/* Interactive Destination Grid - 3 columns side by side */}
                        <div className="grid grid-cols-3 gap-3">
                            {/* Card: Auto */}
                            <button
                                onClick={() => onDestinationChange({ mode: 'auto', docId: null, docType: 'chapter', docTitle: '' })}
                                className={`group flex flex-col items-center justify-center p-3 sm:p-4 rounded-[20px] border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer relative text-center min-w-0 ${
                                    destinationDoc?.mode === 'auto'
                                        ? 'bg-indigo-500/[0.04] border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-inner'
                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]'
                                }`}
                            >
                                {destinationDoc?.mode === 'auto' && (
                                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                        <Check size={9} strokeWidth={4} />
                                    </div>
                                )}
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 transition-all duration-300 shrink-0 ${
                                    destinationDoc?.mode === 'auto'
                                        ? 'bg-indigo-500 text-white'
                                        : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)]/45 group-hover:text-indigo-500'
                                }`}>
                                    <Sparkles size={14} />
                                </div>
                                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-[var(--text-main)] block truncate">1. Auto</span>
                            </button>

                            {/* Card: New */}
                            <button
                                onClick={() => onDestinationChange({ mode: 'new', docId: null, docType: 'chapter', docTitle: '' })}
                                className={`group flex flex-col items-center justify-center p-3 sm:p-4 rounded-[20px] border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer relative text-center min-w-0 ${
                                    destinationDoc?.mode === 'new'
                                        ? 'bg-purple-500/[0.04] border-purple-500 text-purple-600 dark:text-purple-400 font-bold shadow-inner'
                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]'
                                }`}
                            >
                                {destinationDoc?.mode === 'new' && (
                                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                        <Check size={9} strokeWidth={4} />
                                    </div>
                                )}
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 transition-all duration-300 shrink-0 ${
                                    destinationDoc?.mode === 'new'
                                        ? 'bg-purple-500 text-white'
                                        : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)]/45 group-hover:text-purple-500'
                                }`}>
                                    <Plus size={14} />
                                </div>
                                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-[var(--text-main)] block truncate">2. Nuevo</span>
                            </button>

                            {/* Card: Specific */}
                            <button
                                onClick={() => {
                                    if (destinationDoc?.mode !== 'manual') {
                                        const firstCh = chapters.find(c => !c.isVolume);
                                        if (firstCh) {
                                            onDestinationChange({ mode: 'manual', docId: firstCh.id, docType: 'chapter', docTitle: firstCh.title });
                                        } else {
                                            onDestinationChange({ mode: 'manual', docId: 'system_personajes', docType: 'worldItem', docTitle: 'Personajes' });
                                        }
                                    }
                                }}
                                className={`group flex flex-col items-center justify-center p-3 sm:p-4 rounded-[20px] border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer relative text-center min-w-0 ${
                                    destinationDoc?.mode === 'manual'
                                        ? 'bg-emerald-500/[0.04] border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-inner'
                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]'
                                }`}
                            >
                                {destinationDoc?.mode === 'manual' && (
                                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                        <Check size={9} strokeWidth={4} />
                                    </div>
                                )}
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 transition-all duration-300 shrink-0 ${
                                    destinationDoc?.mode === 'manual'
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)]/45 group-hover:text-emerald-500'
                                }`}>
                                    <Target size={14} />
                                </div>
                                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-[var(--text-main)] block truncate">3. Específico</span>
                            </button>
                        </div>

                        {/* Informative description box or input box below the cards */}
                        {destinationDoc?.mode === 'auto' && (
                            <div className="p-4 bg-indigo-500/[0.02] border border-indigo-500/10 rounded-2xl shadow-sm animate-in fade-in duration-300">
                                <p className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-indigo-500 animate-pulse shrink-0" /> 
                                    Destino Inteligente y Automático
                                </p>
                                <p className="text-[9.5px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
                                    La IA decidirá de forma inteligente qué capítulo modificar basándose en el contenido de tu manuscrito activo y tus instrucciones.
                                </p>
                            </div>
                        )}

                        {destinationDoc?.mode === 'new' && (
                            <div className="p-4 bg-purple-500/[0.02] border border-purple-500/10 rounded-2xl shadow-sm animate-in fade-in duration-300 space-y-2">
                                <p className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1.5">
                                    <Plus size={13} className="text-purple-500 shrink-0" /> 
                                    Crear Nuevo Capítulo
                                </p>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Escribe el nombre del nuevo capítulo (opcional)..."
                                        value={destinationDoc?.docTitle || ''}
                                        onChange={(e) => onDestinationChange({ ...destinationDoc, docTitle: e.target.value })}
                                        className="w-full bg-[var(--bg-editor)] border border-purple-500/20 hover:border-purple-500/40 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 rounded-xl px-3 py-2 text-[11px] text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-50 focus:outline-none transition-all shadow-inner"
                                    />
                                </div>
                                <p className="text-[8.5px] text-[var(--text-muted)] opacity-70 leading-none">
                                    Si se deja en blanco, la IA asignará un título automáticamente basado en su contenido.
                                </p>
                            </div>
                        )}

                        {/* Interactive Target Selector when "Manual" mode is selected */}
                        {destinationDoc?.mode === 'manual' && (
                            <div className="mt-4 sm:mt-5 space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                {/* Inner sub-tabs inside Destino Tab */}
                                 <div className="grid grid-cols-3 gap-1 p-1 bg-[var(--bg-editor)]/90 rounded-2xl border border-[var(--border-main)]/50 shadow-inner">
                                     <button
                                         onClick={() => setDestInnerTab('chapters')}
                                         className={`flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 px-1 rounded-xl text-[9px] xs:text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                                             destInnerTab === 'chapters'
                                                 ? 'bg-[var(--bg-app)] text-emerald-600 dark:text-emerald-400 shadow-sm border border-[var(--border-main)]/70 font-bold'
                                                 : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/20'
                                         }`}
                                     >
                                         <FileText size={11} className={destInnerTab === 'chapters' ? 'text-emerald-500 shrink-0' : 'text-[var(--text-muted)] shrink-0'} />
                                         <span className="truncate">Capítulos</span>
                                     </button>
                                     <button
                                         onClick={() => setDestInnerTab('masterdoc')}
                                         className={`flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 px-1 rounded-xl text-[9px] xs:text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                                             destInnerTab === 'masterdoc'
                                                 ? 'bg-[var(--bg-app)] text-emerald-600 dark:text-emerald-400 shadow-sm border border-[var(--border-main)]/70 font-bold'
                                                 : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/20'
                                         }`}
                                     >
                                         <Globe size={11} className={destInnerTab === 'masterdoc' ? 'text-emerald-500 shrink-0' : 'text-[var(--text-muted)] shrink-0'} />
                                         <span className="truncate">Master Doc</span>
                                     </button>
                                     <button
                                         onClick={() => setDestInnerTab('characters')}
                                         className={`flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 px-1 rounded-xl text-[9px] xs:text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                                             destInnerTab === 'characters'
                                                 ? 'bg-[var(--bg-app)] text-emerald-600 dark:text-emerald-400 shadow-sm border border-[var(--border-main)]/70 font-bold'
                                                 : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/20'
                                         }`}
                                     >
                                         <Users size={11} className={destInnerTab === 'characters' ? 'text-emerald-500 shrink-0' : 'text-[var(--text-muted)] shrink-0'} />
                                         <span className="truncate">Personajes</span>
                                     </button>
                                 </div>

                                 {/* Glassmorphic grid container of mini cards */}
                                 <div className="bg-[var(--bg-editor)]/30 border border-[var(--border-main)]/40 rounded-[24px] p-3 shadow-inner">
                                     <div className="h-[200px] overflow-y-auto pr-1 pb-1 scrollbar-thin">
                                         {destInnerTab === 'chapters' && (
                                             filteredDestChapters.length === 0 ? (
                                                 <div className="h-full flex items-center justify-center">
                                                     <p className="text-[10px] text-[var(--text-muted)] opacity-55 italic">Sin coincidencias en capítulos</p>
                                                 </div>
                                             ) : (
                                                 <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 sm:grid-cols-4 gap-2 animate-in fade-in duration-200">
                                                     {filteredDestChapters.map(ch => {
                                                         const isActive = destinationDoc?.docId === ch.id && destinationDoc?.docType === 'chapter';
                                                         return (
                                                             <button
                                                                 key={ch.id}
                                                                 onClick={() => onDestinationChange({ mode: 'manual', docId: ch.id, docType: 'chapter', docTitle: ch.title })}
                                                                 className={`group flex items-center gap-2 p-2.5 rounded-xl border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer relative text-left min-w-0 ${
                                                                     isActive
                                                                         ? 'bg-emerald-500/[0.04] border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-inner'
                                                                         : 'bg-[var(--bg-editor)]/50 backdrop-blur-[1px] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]/80'
                                                                 }`}
                                                             >
                                                                 {isActive && (
                                                                     <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                                                         <Check size={7} strokeWidth={5} />
                                                                     </div>
                                                                 )}
                                                                 <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 ${
                                                                     isActive
                                                                         ? 'bg-emerald-500/10 text-emerald-500'
                                                                         : 'bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-emerald-500'
                                                                 }`}>
                                                                     <FileText size={11} className={isActive ? 'animate-pulse' : ''} />
                                                                 </div>
                                                                 <div className="min-w-0 flex-1">
                                                                     <span className="text-[10px] font-bold text-[var(--text-main)] block truncate leading-tight">{ch.title || 'Sin título'}</span>
                                                                     <span className="text-[8px] text-[var(--text-muted)] opacity-60 block truncate leading-none mt-0.5">Capítulo</span>
                                                                 </div>
                                                             </button>
                                                         );
                                                     })}
                                                 </div>
                                             )
                                         )}

                                         {destInnerTab === 'masterdoc' && (
                                             filteredDestWorldItems.length === 0 ? (
                                                 <div className="h-full flex items-center justify-center">
                                                     <p className="text-[10px] text-[var(--text-muted)] opacity-55 italic">Sin coincidencias en Master Doc</p>
                                                 </div>
                                             ) : (
                                                 <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2 animate-in fade-in duration-200">
                                                     {filteredDestWorldItems.map(w => {
                                                         const isActive = destinationDoc?.docId === w.id && destinationDoc?.docType === 'worldItem';
                                                         const label = SYSTEM_WORLD_ITEM_LABELS[w.id] || w.title || 'Sin título';
                                                         return (
                                                             <button
                                                                 key={w.id}
                                                                 onClick={() => onDestinationChange({ mode: 'manual', docId: w.id, docType: 'worldItem', docTitle: label })}
                                                                 className={`group flex items-center gap-2 p-2.5 rounded-xl border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer relative text-left min-w-0 ${
                                                                     isActive
                                                                         ? 'bg-emerald-500/[0.04] border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-inner'
                                                                         : 'bg-[var(--bg-editor)]/50 backdrop-blur-[1px] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]/80'
                                                                 }`}
                                                             >
                                                                 {isActive && (
                                                                     <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                                                         <Check size={7} strokeWidth={5} />
                                                                     </div>
                                                                 )}
                                                                 <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 ${
                                                                     isActive
                                                                         ? 'bg-emerald-500/10 text-emerald-500'
                                                                         : 'bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-emerald-500'
                                                                 }`}>
                                                                     <Globe size={11} className={isActive ? 'animate-pulse' : ''} />
                                                                 </div>
                                                                 <div className="min-w-0 flex-1">
                                                                     <span className="text-[10px] font-bold text-[var(--text-main)] block truncate leading-tight">{label}</span>
                                                                     <span className="text-[8px] text-[var(--text-muted)] opacity-60 block truncate leading-none mt-0.5">Master Doc</span>
                                                                 </div>
                                                             </button>
                                                         );
                                                     })}
                                                 </div>
                                             )
                                         )}

                                         {destInnerTab === 'characters' && (
                                             filteredDestCharacters.length === 0 ? (
                                                 <div className="h-full flex items-center justify-center">
                                                     <p className="text-[10px] text-[var(--text-muted)] opacity-55 italic">Sin personajes</p>
                                                 </div>
                                             ) : (
                                                 <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2 animate-in fade-in duration-200">
                                                     {filteredDestCharacters.map(c => {
                                                         const isActive = destinationDoc?.docId === c.id && destinationDoc?.docType === 'character';
                                                         return (
                                                             <button
                                                                 key={c.id}
                                                                 onClick={() => onDestinationChange({ mode: 'manual', docId: c.id, docType: 'character', docTitle: c.name })}
                                                                 className={`group flex items-center gap-2 p-2.5 rounded-xl border transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-sm cursor-pointer relative text-left min-w-0 ${
                                                                     isActive
                                                                         ? 'bg-emerald-500/[0.04] border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-inner'
                                                                         : 'bg-[var(--bg-editor)]/50 backdrop-blur-[1px] border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/45 hover:border-[var(--border-main)]/80'
                                                                 }`}
                                                             >
                                                                 {isActive && (
                                                                     <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                                                                         <Check size={7} strokeWidth={5} />
                                                                     </div>
                                                                 )}
                                                                 <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 ${
                                                                     isActive
                                                                         ? 'bg-emerald-500/10 text-emerald-500'
                                                                         : 'bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-emerald-500'
                                                                 }`}>
                                                                     <Users size={11} className={isActive ? 'animate-pulse' : ''} />
                                                                 </div>
                                                                 <div className="min-w-0 flex-1">
                                                                     <span className="text-[10px] font-bold text-[var(--text-main)] block truncate leading-tight">{c.name}</span>
                                                                     <span className="text-[8px] text-[var(--text-muted)] opacity-60 block truncate leading-none mt-0.5">{c.role || 'Personaje'}</span>
                                                                 </div>
                                                             </button>
                                                         );
                                                     })}
                                                 </div>
                                             )
                                         )}
                                     </div>
                                 </div>
                             </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer with actions - responsive wrapping */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-t border-[var(--border-main)]/60 px-4.5 sm:px-6 py-4 bg-[var(--bg-editor)]/45 backdrop-blur-md shrink-0 mt-3 rounded-b-3xl gap-3">
                {/* Visual Color Pill Badges for Summary - Perfect Grid on Mobile */}
                <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-row sm:items-center sm:w-auto text-[10px] text-[var(--text-muted)] font-medium">
                    <span className="flex items-center justify-center gap-1.5 bg-indigo-500/[0.04] border border-indigo-500/10 px-2.5 py-2.5 sm:py-1 rounded-xl text-center min-w-0">
                        <BookOpen size={11} className="text-indigo-500 shrink-0" /> 
                        <span className="truncate">Contexto:</span>
                        <strong className="text-indigo-500 dark:text-indigo-400 font-black truncate">
                            {selectedChapterIds.length + selectedWorldItemIds.length + selectedCharacterIds.length}
                        </strong>
                    </span>
                    <span className="flex items-center justify-center gap-1.5 bg-emerald-500/[0.04] border border-emerald-500/10 px-2.5 py-2.5 sm:py-1 rounded-xl text-center min-w-0">
                        <Target size={11} className="text-emerald-500 shrink-0" /> 
                        <span className="truncate">Destino:</span>
                        <strong className="text-emerald-500 dark:text-emerald-400 font-black truncate max-w-[80px] sm:max-w-[140px]" title={currentDestLabel()}>
                            {destinationDoc?.mode === 'auto' ? 'Auto' : destinationDoc?.mode === 'new' ? 'Nuevo' : destinationDoc?.docTitle || 'Manual'}
                        </strong>
                    </span>
                </div>

                <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
                    {mode === 'context' || mode === 'destination' ? (
                        <>
                            <button
                                onClick={onClose}
                                className="flex-1 sm:flex-initial px-6 py-3 border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/35 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-emerald-500/10 active:scale-95"
                            >
                                Guardar
                            </button>
                        </>
                    ) : (
                        activeTab === 'masterdoc' ? (
                            <>
                                <button
                                    onClick={onClose}
                                    className="flex-1 sm:flex-initial px-6 py-3 border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/35 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95"
                                >
                                    Cerrar
                                </button>
                                <button
                                    onClick={() => setActiveTab('manuscript')}
                                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-indigo-500/10 active:scale-95"
                                >
                                    Siguiente: Manuscrito <ChevronRight size={12} />
                                </button>
                            </>
                        ) : activeTab === 'manuscript' ? (
                            <>
                                <button
                                    onClick={() => setActiveTab('masterdoc')}
                                    className="flex-1 sm:flex-initial px-6 py-3 border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/35 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95"
                                >
                                    Atrás
                                </button>
                                <button
                                    onClick={() => setActiveTab('destination')}
                                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-indigo-500/10 active:scale-95"
                                >
                                    Siguiente: Destino <ChevronRight size={12} />
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => setActiveTab('manuscript')}
                                    className="flex-1 sm:flex-initial px-6 py-3 border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/35 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95"
                                >
                                    Atrás
                                </button>
                                <button
                                    onClick={onClose}
                                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-emerald-500/10 active:scale-95"
                                >
                                    Guardar
                                </button>
                            </>
                        )
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default IAStudioContextConfigModal;
