import React, { useState, useMemo } from 'react';
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
}) => {
    const { contextSelections, destinationDoc, onContextChange, onDestinationChange } = useIAStudioContext();
    const [activeTab, setActiveTab] = useState('context'); // 'context' | 'destination'
    const [expandedVolumes, setExpandedVolumes] = useState({});
    const [chapterSearch, setChapterSearch] = useState('');
    const [worldItemSearch, setWorldItemSearch] = useState('');
    const [destSearch, setDestSearch] = useState('');

    const selectedChapterIds = contextSelections?.chapterIds || [];
    const selectedWorldItemIds = contextSelections?.worldItemIds || [];

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
        const systemIds = SYSTEM_WORLD_ITEM_IDS;
        const customIds = customWorldItems.map(w => w.id);
        onContextChange({ ...contextSelections, worldItemIds: [...systemIds, ...customIds] });
    };
    const clearWorldItems = () => {
        onContextChange({ ...contextSelections, worldItemIds: [] });
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
            ...SYSTEM_WORLD_ITEM_IDS.map(wid => ({ id: wid, title: SYSTEM_WORLD_ITEM_LABELS[wid] || wid, isSystem: true })),
            ...customWorldItems.map(w => ({ id: w.id, title: w.title || 'Sin título', isSystem: false }))
        ];
        return allItems.filter(item => item.title.toLowerCase().includes(query));
    }, [worldItems, worldItemSearch, customWorldItems]);

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
            ...SYSTEM_WORLD_ITEM_IDS.map(wid => ({ id: wid, title: SYSTEM_WORLD_ITEM_LABELS[wid] || wid })),
            ...customWorldItems.map(w => ({ id: w.id, title: w.title || 'Sin título' }))
        ];
        if (!query) return list;
        return list.filter(item => item.title.toLowerCase().includes(query));
    }, [worldItems, customWorldItems, destSearch]);

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
        <Modal isOpen={isOpen} onClose={onClose} title="Contexto y Destino" size="2xl">
            {/* Tabs at the top */}
            <div className="flex gap-2 p-1 bg-[var(--bg-editor)] rounded-2xl border border-[var(--border-main)]/50 shrink-0 mx-4 md:mx-6 mt-4">
                <button
                    onClick={() => setActiveTab('context')}
                    className={`flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        activeTab === 'context'
                            ? 'bg-[var(--bg-app)] text-indigo-600 shadow-sm border border-[var(--border-main)]/35'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/20'
                    }`}
                >
                    <BookOpen size={13} /> 
                    <span className="hidden xs:inline">1.</span> Referencias 
                    <span className="bg-indigo-500/10 text-indigo-600 px-1.5 py-0.2 rounded font-black text-[9px] shrink-0">
                        {selectedChapterIds.length + selectedWorldItemIds.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('destination')}
                    className={`flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        activeTab === 'destination'
                            ? 'bg-[var(--bg-app)] text-indigo-600 shadow-sm border border-[var(--border-main)]/35'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/20'
                    }`}
                >
                    <Target size={13} /> 
                    <span className="hidden xs:inline">2.</span> Destino 
                    <span className="bg-emerald-500/10 text-emerald-600 px-1.5 py-0.2 rounded font-black text-[9px] shrink-0 truncate max-w-[80px] xs:max-w-[120px]">
                        {destinationDoc?.mode === 'auto' ? 'Auto' : destinationDoc?.mode === 'new' ? 'Nuevo' : 'Manual'}
                    </span>
                </button>
            </div>

            {/* Tab Contents */}
            <div className="p-4 md:p-6 space-y-6">
                {activeTab === 'context' ? (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] flex items-center gap-2">
                                <BookOpen size={12} className="text-indigo-500" /> Documentos que la IA leerá como contexto
                            </span>
                            <span className="self-start sm:self-auto text-[9px] font-bold text-indigo-500 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/10">
                                {selectedChapterIds.length + selectedWorldItemIds.length} elementos de referencia activos
                            </span>
                        </div>

                        {/* Stacks vertically on mobile (grid-cols-1), two columns on tablet+ (md:grid-cols-2) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left: Manuscrito */}
                            <div className="bg-[var(--bg-editor)] rounded-2xl p-4 border border-[var(--border-main)]/50 flex flex-col h-[320px] md:h-[380px] shadow-sm">
                                <div className="flex items-center justify-between mb-3 sticky top-0 bg-[var(--bg-editor)] py-0.5 z-10 shrink-0">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                                        <BookOpen size={12} /> Manuscrito
                                    </p>
                                    
                                    {/* Premium Pill Actions */}
                                    <div className="flex gap-1">
                                        <button
                                            onClick={selectAllChapters}
                                            className="flex items-center gap-1 px-2 py-1 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-indigo-500/10 hover:border-indigo-500/20 cursor-pointer"
                                            title="Seleccionar todos los capítulos"
                                        >
                                            <CheckSquare size={10} /> Todos
                                        </button>
                                        <button
                                            onClick={clearChapters}
                                            className="flex items-center gap-1 px-2 py-1 bg-[var(--accent-soft)] hover:bg-[var(--border-main)]/30 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-[var(--border-main)]/40 hover:border-[var(--border-main)] cursor-pointer"
                                            title="Limpiar selección"
                                        >
                                            <Square size={10} /> Ninguno
                                        </button>
                                    </div>
                                </div>

                                {/* Search Bar Chapters */}
                                <div className="relative mb-3 shrink-0">
                                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                    <input
                                        type="text"
                                        placeholder="Buscar capítulo..."
                                        value={chapterSearch}
                                        onChange={(e) => setChapterSearch(e.target.value)}
                                        className="w-full bg-[var(--bg-app)] border border-[var(--border-main)]/60 rounded-xl pl-8 pr-8 py-1.8 text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-50 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all shadow-inner"
                                    />
                                    {chapterSearch && (
                                        <button
                                            onClick={() => setChapterSearch('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] p-0.5 rounded-full hover:bg-[var(--accent-soft)] transition-all cursor-pointer"
                                        >
                                            <X size={11} />
                                        </button>
                                    )}
                                </div>

                                {/* Scrollable list - custom scrollbar */}
                                <div className="flex-1 overflow-y-auto pr-1">
                                    {filteredChapters ? (
                                        /* Flattened search list */
                                        filteredChapters.length === 0 ? (
                                            <p className="text-xs text-[var(--text-muted)] opacity-50 px-2 py-6 italic text-center">No hay coincidencias</p>
                                        ) : (
                                            <div className="space-y-0.5">
                                                {filteredChapters.map(ch => (
                                                    <label key={ch.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-all">
                                                        <input type="checkbox" checked={selectedChapterIds.includes(ch.id)} onChange={() => toggleChapter(ch.id)} className="hidden" />
                                                        <div className={`w-5 h-5 rounded-lg border-2 transition-all flex items-center justify-center shrink-0 ${
                                                            selectedChapterIds.includes(ch.id) 
                                                                ? 'bg-indigo-600 border-indigo-600 text-white scale-105 shadow-md shadow-indigo-600/10' 
                                                                : 'border-[var(--border-main)] bg-[var(--bg-app)] hover:border-indigo-500/50'
                                                        }`}>
                                                            {selectedChapterIds.includes(ch.id) && <Check size={12} strokeWidth={4} />}
                                                        </div>
                                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(ch.status)}`} />
                                                        <span className="text-xs text-[var(--text-main)] truncate flex-1">{ch.title || 'Sin título'}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )
                                    ) : (
                                        /* Normal hierarchical list */
                                        <>
                                            {volumes.map(vol => {
                                                const volChapters = getChaptersByParent(vol.id);
                                                const volSelectedCount = volChapters.filter(ch => selectedChapterIds.includes(ch.id)).length;
                                                const isExpanded = expandedVolumes[vol.id] ?? true;
                                                return (
                                                    <div key={vol.id} className="mb-2 bg-[var(--bg-app)]/30 rounded-xl p-1.5 border border-[var(--border-main)]/20">
                                                        <div className="flex items-center gap-2 w-full px-2 py-1.5 rounded-xl hover:bg-[var(--accent-soft)]/40 transition-all">
                                                            {/* Master Checkbox for Volume level selection */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleVolumeChapters(vol.id);
                                                                }}
                                                                className="p-1 rounded-lg hover:bg-[var(--bg-editor)] text-[var(--text-muted)] hover:text-indigo-500 transition-all shrink-0 cursor-pointer"
                                                                title="Seleccionar todo el volumen"
                                                            >
                                                                <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${
                                                                    volSelectedCount === volChapters.length && volChapters.length > 0
                                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                                                        : volSelectedCount > 0
                                                                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-500'
                                                                        : 'border-[var(--border-main)] bg-[var(--bg-editor)]'
                                                                }`}>
                                                                    {volSelectedCount === volChapters.length && volChapters.length > 0 && <Check size={9} strokeWidth={4} />}
                                                                    {volSelectedCount > 0 && volSelectedCount < volChapters.length && (
                                                                        <div className="w-1.5 h-0.5 bg-indigo-500 rounded-full" />
                                                                    )}
                                                                </div>
                                                            </button>

                                                            {/* Volume title, counter & expand chevron */}
                                                            <button
                                                                onClick={() => setExpandedVolumes(prev => ({ ...prev, [vol.id]: !isExpanded }))}
                                                                className="flex-1 flex items-center gap-2 text-left min-w-0 cursor-pointer"
                                                            >
                                                                <Layers size={10} className="text-indigo-500/60 shrink-0" />
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] truncate flex-1">{vol.title}</span>
                                                                <span className="text-[9px] bg-indigo-500/10 text-indigo-600 px-1.5 py-0.2 rounded font-black shrink-0">
                                                                    {volSelectedCount}/{volChapters.length}
                                                                </span>
                                                                <ChevronRight size={10} className={`text-[var(--text-muted)] transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                                                            </button>
                                                        </div>

                                                        {isExpanded && (
                                                            <div className="mt-1 space-y-0.5 border-l border-indigo-500/10 ml-4 pl-1">
                                                                {volChapters.map(ch => (
                                                                    <label key={ch.id} className="flex items-center gap-2.5 px-3 py-1.8 rounded-xl hover:bg-[var(--accent-soft)]/40 cursor-pointer transition-all">
                                                                        <input type="checkbox" checked={selectedChapterIds.includes(ch.id)} onChange={() => toggleChapter(ch.id)} className="hidden" />
                                                                        <div className={`w-4.5 h-4.5 rounded-lg border-2 transition-all flex items-center justify-center shrink-0 ${
                                                                            selectedChapterIds.includes(ch.id) 
                                                                                ? 'bg-indigo-600 border-indigo-600 text-white scale-105 shadow-md shadow-indigo-600/10' 
                                                                                : 'border-[var(--border-main)] bg-[var(--bg-editor)] hover:border-indigo-500/50'
                                                                        }`}>
                                                                            {selectedChapterIds.includes(ch.id) && <Check size={11} strokeWidth={4} />}
                                                                        </div>
                                                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(ch.status)}`} />
                                                                        <span className="text-xs text-[var(--text-main)] truncate flex-1">{ch.title || 'Sin título'}</span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {standaloneChapters.map(ch => (
                                                <label key={ch.id} className="flex items-center gap-2.5 px-3 py-1.8 rounded-xl hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-all">
                                                    <input type="checkbox" checked={selectedChapterIds.includes(ch.id)} onChange={() => toggleChapter(ch.id)} className="hidden" />
                                                    <div className={`w-5 h-5 rounded-lg border-2 transition-all flex items-center justify-center shrink-0 ${
                                                        selectedChapterIds.includes(ch.id) 
                                                            ? 'bg-indigo-600 border-indigo-600 text-white scale-105 shadow-md shadow-indigo-600/10' 
                                                            : 'border-[var(--border-main)] bg-[var(--bg-app)] hover:border-indigo-500/50'
                                                    }`}>
                                                        {selectedChapterIds.includes(ch.id) && <Check size={12} strokeWidth={4} />}
                                                    </div>
                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(ch.status)}`} />
                                                    <span className="text-xs text-[var(--text-main)] truncate flex-1">{ch.title || 'Sin título'}</span>
                                                </label>
                                            ))}
                                            {chapters.filter(c => !c.isVolume).length === 0 && (
                                                <p className="text-xs text-[var(--text-muted)] opacity-50 px-2 py-6 italic text-center">No hay capítulos</p>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Right: Master Doc */}
                            <div className="bg-[var(--bg-editor)] rounded-2xl p-4 border border-[var(--border-main)]/50 flex flex-col h-[320px] md:h-[380px] shadow-sm">
                                <div className="flex items-center justify-between mb-3 sticky top-0 bg-[var(--bg-editor)] py-0.5 z-10 shrink-0">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                                        <Globe size={12} /> Master Doc
                                    </p>

                                    {/* Premium Pill Actions */}
                                    <div className="flex gap-1">
                                        <button
                                            onClick={selectAllWorldItems}
                                            className="flex items-center gap-1 px-2 py-1 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-indigo-500/10 hover:border-indigo-500/20 cursor-pointer"
                                            title="Seleccionar toda la documentación"
                                        >
                                            <CheckSquare size={10} /> Todos
                                        </button>
                                        <button
                                            onClick={clearWorldItems}
                                            className="flex items-center gap-1 px-2 py-1 bg-[var(--accent-soft)] hover:bg-[var(--border-main)]/30 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-[var(--border-main)]/40 hover:border-[var(--border-main)] cursor-pointer"
                                            title="Limpiar selección"
                                        >
                                            <Square size={10} /> Ninguno
                                        </button>
                                    </div>
                                </div>

                                {/* Search Bar World Items */}
                                <div className="relative mb-3 shrink-0">
                                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                    <input
                                        type="text"
                                        placeholder="Buscar documentación..."
                                        value={worldItemSearch}
                                        onChange={(e) => setWorldItemSearch(e.target.value)}
                                        className="w-full bg-[var(--bg-app)] border border-[var(--border-main)]/60 rounded-xl pl-8 pr-8 py-1.8 text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-50 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all shadow-inner"
                                    />
                                    {worldItemSearch && (
                                        <button
                                            onClick={() => setWorldItemSearch('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] p-0.5 rounded-full hover:bg-[var(--accent-soft)] transition-all cursor-pointer"
                                        >
                                            <X size={11} />
                                        </button>
                                    )}
                                </div>

                                {/* Scrollable list - custom scrollbar */}
                                <div className="flex-1 overflow-y-auto pr-1">
                                    {filteredWorldItemsList ? (
                                        /* Search view */
                                        filteredWorldItemsList.length === 0 ? (
                                            <p className="text-xs text-[var(--text-muted)] opacity-50 px-2 py-6 italic text-center">No hay coincidencias</p>
                                        ) : (
                                            <div className="space-y-0.5">
                                                {filteredWorldItemsList.map(item => {
                                                    const Icon = item.id === 'system_personajes' ? Users : item.id === 'system_estructura' ? Layers : item.id === 'system_core' ? Bookmark : FileText;
                                                    return (
                                                        <label key={item.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-all">
                                                            <input type="checkbox" checked={selectedWorldItemIds.includes(item.id)} onChange={() => toggleWorldItem(item.id)} className="hidden" />
                                                            <div className={`w-5 h-5 rounded-lg border-2 transition-all flex items-center justify-center shrink-0 ${
                                                                selectedWorldItemIds.includes(item.id) 
                                                                    ? 'bg-indigo-600 border-indigo-600 text-white scale-105 shadow-md shadow-indigo-600/10' 
                                                                    : 'border-[var(--border-main)] bg-[var(--bg-app)] hover:border-indigo-500/50'
                                                            }`}>
                                                                {selectedWorldItemIds.includes(item.id) && <Check size={12} strokeWidth={4} />}
                                                            </div>
                                                            <Icon size={11} className="text-indigo-500/60 shrink-0" />
                                                            <span className="text-xs text-[var(--text-main)] truncate flex-1">{item.title}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )
                                    ) : (
                                        /* Normal hierarchical list */
                                        <>
                                            {SYSTEM_WORLD_ITEM_IDS.map(wid => {
                                                const item = worldItems.find(w => w.id === wid);
                                                const label = SYSTEM_WORLD_ITEM_LABELS[wid] || wid;
                                                const iconMap = { system_personajes: Users, system_estructura: Layers, system_core: Bookmark };
                                                const Icon = iconMap[wid] || FileText;
                                                return (
                                                    <label key={wid} className={`flex items-center gap-2.5 px-3 py-1.8 rounded-xl hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-all ${!item?.content ? 'opacity-50' : ''}`}>
                                                        <input type="checkbox" checked={selectedWorldItemIds.includes(wid)} onChange={() => toggleWorldItem(wid)} className="hidden" />
                                                        <div className={`w-5 h-5 rounded-lg border-2 transition-all flex items-center justify-center shrink-0 ${
                                                            selectedWorldItemIds.includes(wid) 
                                                                ? 'bg-indigo-600 border-indigo-600 text-white scale-105 shadow-md shadow-indigo-600/10' 
                                                                : 'border-[var(--border-main)] bg-[var(--bg-app)] hover:border-indigo-500/50'
                                                        }`}>
                                                            {selectedWorldItemIds.includes(wid) && <Check size={12} strokeWidth={4} />}
                                                        </div>
                                                        <Icon size={11} className="text-indigo-500/60 shrink-0" />
                                                        <span className="text-xs text-[var(--text-main)] truncate flex-1">{label}</span>
                                                    </label>
                                                );
                                            })}
                                            {customWorldItems.map(w => (
                                                <label key={w.id} className="flex items-center gap-2.5 px-3 py-1.8 rounded-xl hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-all">
                                                    <input type="checkbox" checked={selectedWorldItemIds.includes(w.id)} onChange={() => toggleWorldItem(w.id)} className="hidden" />
                                                    <div className={`w-5 h-5 rounded-lg border-2 transition-all flex items-center justify-center shrink-0 ${
                                                        selectedWorldItemIds.includes(w.id) 
                                                            ? 'bg-indigo-600 border-indigo-600 text-white scale-105 shadow-md shadow-indigo-600/10' 
                                                            : 'border-[var(--border-main)] bg-[var(--bg-app)] hover:border-indigo-500/50'
                                                    }`}>
                                                        {selectedWorldItemIds.includes(w.id) && <Check size={12} strokeWidth={4} />}
                                                    </div>
                                                    <FileText size={11} className="text-[var(--text-muted)] shrink-0" />
                                                    <span className="text-xs text-[var(--text-main)] truncate flex-1">{w.title || 'Sin título'}</span>
                                                </label>
                                            ))}
                                            {worldItems.length === 0 && (
                                                <p className="text-xs text-[var(--text-muted)] opacity-50 px-2 py-6 italic text-center">No hay elementos</p>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] flex items-center gap-2">
                                <Target size={12} className="text-emerald-500" /> ¿Dónde deseas aplicar los cambios generados por la IA?
                            </span>
                            <span className="self-start sm:self-auto text-[9px] font-bold text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/15 flex items-center gap-1">
                                <Check size={10} /> Destino: {currentDestLabel()}
                            </span>
                        </div>

                        {/* Interactive Destination Cards - Stacks on mobile, 3 columns on tablet+ */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Card: Auto */}
                            <button
                                onClick={() => onDestinationChange({ mode: 'auto', docId: null, docType: 'chapter', docTitle: '' })}
                                className={`group flex flex-col items-center text-center p-5 rounded-2xl border transition-all cursor-pointer relative ${
                                    destinationDoc?.mode === 'auto'
                                        ? 'bg-indigo-500/[0.03] border-indigo-500 shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/20'
                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)]/50 hover:bg-[var(--accent-soft)]/30 hover:border-[var(--border-main)] hover:scale-[1.01]'
                                }`}
                            >
                                {destinationDoc?.mode === 'auto' && (
                                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-md animate-in zoom-in duration-200">
                                        <Check size={12} strokeWidth={4} />
                                    </div>
                                )}
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                                    destinationDoc?.mode === 'auto' ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20 scale-105' : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border border-[var(--border-main)]/60'
                                }`}>
                                    <Sparkles size={20} />
                                </div>
                                <span className="text-xs font-black uppercase tracking-wider text-[var(--text-main)]">1. Automático</span>
                                <span className="text-[9px] text-[var(--text-muted)] opacity-60 mt-2 leading-relaxed max-w-xs">
                                    La IA decide de forma inteligente qué capítulo modificar basándose en tu manuscrito activo.
                                </span>
                            </button>

                            {/* Card: New */}
                            <button
                                onClick={() => onDestinationChange({ mode: 'new', docId: null, docType: 'chapter', docTitle: '' })}
                                className={`group flex flex-col items-center text-center p-5 rounded-2xl border transition-all cursor-pointer relative ${
                                    destinationDoc?.mode === 'new'
                                        ? 'bg-purple-500/[0.03] border-purple-500 shadow-lg shadow-purple-500/5 ring-1 ring-purple-500/20'
                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)]/50 hover:bg-[var(--accent-soft)]/30 hover:border-[var(--border-main)] hover:scale-[1.01]'
                                }`}
                            >
                                {destinationDoc?.mode === 'new' && (
                                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-md animate-in zoom-in duration-200">
                                        <Check size={12} strokeWidth={4} />
                                    </div>
                                )}
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                                    destinationDoc?.mode === 'new' ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20 scale-105' : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border border-[var(--border-main)]/60'
                                }`}>
                                    <Plus size={20} />
                                </div>
                                <span className="text-xs font-black uppercase tracking-wider text-[var(--text-main)]">2. Crear Nuevo</span>
                                <span className="text-[9px] text-[var(--text-muted)] opacity-60 mt-2 leading-relaxed max-w-xs">
                                    Inserta un capítulo completamente nuevo en tu manuscrito con el contenido resultante.
                                </span>
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
                                className={`group flex flex-col items-center text-center p-5 rounded-2xl border transition-all cursor-pointer relative ${
                                    destinationDoc?.mode === 'manual'
                                        ? 'bg-emerald-500/[0.03] border-emerald-500 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)]/50 hover:bg-[var(--accent-soft)]/30 hover:border-[var(--border-main)] hover:scale-[1.01]'
                                }`}
                            >
                                {destinationDoc?.mode === 'manual' && (
                                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md animate-in zoom-in duration-200">
                                        <Check size={12} strokeWidth={4} />
                                    </div>
                                )}
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                                    destinationDoc?.mode === 'manual' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 scale-105' : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border border-[var(--border-main)]/60'
                                }`}>
                                    <Target size={20} />
                                </div>
                                <span className="text-xs font-black uppercase tracking-wider text-[var(--text-main)]">3. Específico</span>
                                <span className="text-[9px] text-[var(--text-muted)] opacity-60 mt-2 leading-relaxed max-w-xs">
                                    El escritor selecciona de manera exacta qué documento (capítulo o Master Doc) sobreescribir.
                                </span>
                            </button>
                        </div>

                        {/* Interactive Target Selector when "Manual" mode is selected */}
                        {destinationDoc?.mode === 'manual' && (
                            <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--border-main)]/30 pb-3 gap-2">
                                    <div>
                                        <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-main)]">Selecciona el documento destino</h4>
                                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 opacity-60">Los cambios generados se compararán y aplicarán a esta referencia.</p>
                                    </div>
                                    <div className="relative w-full sm:w-64 shrink-0">
                                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                        <input
                                            type="text"
                                            placeholder="Filtrar destinos..."
                                            value={destSearch}
                                            onChange={(e) => setDestSearch(e.target.value)}
                                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl pl-8 pr-8 py-1.8 text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-50 focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                                        />
                                        {destSearch && (
                                            <button
                                                onClick={() => setDestSearch('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] p-0.5 rounded-full hover:bg-[var(--accent-soft)] transition-all cursor-pointer"
                                            >
                                                <X size={11} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Stack list side-by-side or stacked on mobile */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--bg-editor)]/30 border border-[var(--border-main)]/50 rounded-2xl p-4 h-[300px] md:h-[220px] overflow-y-auto shadow-sm">
                                    {/* Chapters Target List */}
                                    <div className="space-y-1 pr-1">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 block px-2 mb-2 sticky top-0 bg-[var(--bg-app)]/90 backdrop-blur-[2px] py-1 rounded border border-emerald-500/10 z-10">
                                            📄 Capítulos del Manuscrito
                                        </span>
                                        {filteredDestChapters.length === 0 ? (
                                            <p className="text-[10px] text-[var(--text-muted)] opacity-50 px-2 py-2 italic">Sin coincidencias</p>
                                        ) : (
                                            filteredDestChapters.map(ch => {
                                                const isActive = destinationDoc?.docId === ch.id && destinationDoc?.docType === 'chapter';
                                                return (
                                                    <button
                                                        key={ch.id}
                                                        onClick={() => onDestinationChange({ mode: 'manual', docId: ch.id, docType: 'chapter', docTitle: ch.title })}
                                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                                                            isActive
                                                                ? 'bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/25 shadow-sm shadow-emerald-500/5'
                                                                : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]/40 border border-transparent'
                                                        }`}
                                                    >
                                                        <FileText size={12} className={isActive ? 'text-emerald-500 shrink-0' : 'text-[var(--text-muted)] shrink-0'} />
                                                        <span className="truncate flex-1 text-left">{ch.title || 'Sin título'}</span>
                                                        {isActive && <Check size={12} className="text-emerald-500 shrink-0 animate-pulse" />}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* World Items Target List */}
                                    <div className="space-y-1 border-t md:border-t-0 md:border-l border-[var(--border-main)]/30 pt-3 md:pt-0 md:pl-3">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 block px-2 mb-2 sticky top-0 bg-[var(--bg-app)]/90 backdrop-blur-[2px] py-1 rounded border border-emerald-500/10 z-10">
                                            🌍 Fichas del Master Doc
                                        </span>
                                        {filteredDestWorldItems.length === 0 ? (
                                            <p className="text-[10px] text-[var(--text-muted)] opacity-50 px-2 py-2 italic">Sin coincidencias</p>
                                        ) : (
                                            filteredDestWorldItems.map(w => {
                                                const isActive = destinationDoc?.docId === w.id && destinationDoc?.docType === 'worldItem';
                                                const label = SYSTEM_WORLD_ITEM_LABELS[w.id] || w.title || 'Sin título';
                                                return (
                                                    <button
                                                        key={w.id}
                                                        onClick={() => onDestinationChange({ mode: 'manual', docId: w.id, docType: 'worldItem', docTitle: label })}
                                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                                                            isActive
                                                                ? 'bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/25 shadow-sm shadow-emerald-500/5'
                                                                : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]/40 border border-transparent'
                                                        }`}
                                                    >
                                                        <Globe size={12} className={isActive ? 'text-emerald-500 shrink-0' : 'text-[var(--text-muted)] shrink-0'} />
                                                        <span className="truncate flex-1 text-left">{label}</span>
                                                        {isActive && <Check size={12} className="text-emerald-500 shrink-0 animate-pulse" />}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer with actions - responsive wrapping */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-t border-[var(--border-main)]/60 px-4 md:px-6 py-4.5 bg-[var(--bg-editor)]/40 shrink-0 mt-6 rounded-b-3xl gap-4">
                {/* Visual Color Pill Badges for Summary */}
                <div className="text-[10px] text-[var(--text-muted)] font-medium flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="flex items-center gap-1">
                        <BookOpen size={11} className="text-indigo-500" /> 
                        Contexto: 
                        <strong className="text-indigo-600 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/15">
                            {selectedChapterIds.length + selectedWorldItemIds.length} elem
                        </strong>
                    </span>
                    <span className="opacity-30 hidden xs:inline">·</span>
                    <span className="flex items-center gap-1">
                        <Target size={11} className="text-emerald-500" /> 
                        Destino: 
                        <strong className="text-emerald-600 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/15 truncate max-w-[150px]" title={currentDestLabel()}>
                            {destinationDoc?.mode === 'auto' ? 'Automático' : destinationDoc?.mode === 'new' ? 'Crear Nuevo' : destinationDoc?.docTitle || 'Manual'}
                        </strong>
                    </span>
                </div>

                <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
                    {activeTab === 'context' ? (
                        <button
                            onClick={() => setActiveTab('destination')}
                            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all cursor-pointer shadow-lg shadow-indigo-600/15 active:scale-95"
                        >
                            Siguiente: Destino <ChevronRight size={12} />
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => setActiveTab('context')}
                                className="flex-1 sm:flex-initial px-5 py-2.5 border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95"
                            >
                                Atrás
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all cursor-pointer shadow-lg shadow-emerald-600/15 active:scale-95"
                            >
                                Guardar y Cerrar
                            </button>
                        </>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default IAStudioContextConfigModal;
