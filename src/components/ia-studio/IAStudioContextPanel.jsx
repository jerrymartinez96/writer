import React, { useState, useMemo } from 'react';
import { Check, FileText, Globe, BookOpen, Layers, User, Bookmark, Users, X, ChevronRight, Target, AlertTriangle, Zap } from 'lucide-react';
import { SYSTEM_WORLD_ITEM_IDS, SYSTEM_WORLD_ITEM_LABELS, estimateContextWeight } from './IAStudioUtils';
import { useIAStudioContext } from '../../context/IAStudioContext';

const IAStudioContextPanel = ({
    chapters = [],
    worldItems = [],
    characters = [],
}) => {
    const { contextSelections, destinationDoc, onContextChange, onDestinationChange } = useIAStudioContext();
    const [showQuickSelect, setShowQuickSelect] = useState(false);
    const [showDestDropdown, setShowDestDropdown] = useState(false);

    const selectedChapterIds = contextSelections?.chapterIds || [];
    const selectedWorldItemIds = contextSelections?.worldItemIds || [];

    // Volúmenes y capítulos ordenados
    const volumes = useMemo(() =>
        chapters.filter(c => c.isVolume).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
        [chapters]
    );

    const getChaptersByParent = (parentId) =>
        chapters.filter(c => c.parentId === parentId)
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    const standaloneChapters = useMemo(() =>
        chapters.filter(c => !c.parentId && !c.isVolume)
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
        [chapters]
    );

    // World items personalizados (no sistema)
    const customWorldItems = useMemo(() =>
        worldItems.filter(w => !SYSTEM_WORLD_ITEM_IDS.includes(w.id)),
        [worldItems]
    );

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

    const quickSelect = (type) => {
        switch (type) {
            case 'all_chapters':
                onContextChange({
                    chapterIds: chapters.filter(c => !c.isVolume).map(c => c.id),
                    worldItemIds: [],
                });
                break;
            case 'all_world':
                onContextChange({
                    chapterIds: [],
                    worldItemIds: [...SYSTEM_WORLD_ITEM_IDS, ...customWorldItems.map(w => w.id)],
                });
                break;
            case 'all':
                onContextChange({
                    chapterIds: chapters.filter(c => !c.isVolume).map(c => c.id),
                    worldItemIds: [...SYSTEM_WORLD_ITEM_IDS, ...customWorldItems.map(w => w.id)],
                });
                break;
            case 'clear':
                onContextChange({ chapterIds: [], worldItemIds: [] });
                break;
        }
        setShowQuickSelect(false);
    };

    // Opciones de destino
    const destinationOptions = useMemo(() => {
        const options = [
            { id: 'auto', label: '🤖 Automático', description: 'La IA decide dónde aplicar' },
        ];

        // Capítulos
        chapters.filter(c => !c.isVolume).forEach(ch => {
            options.push({
                id: `chapter_${ch.id}`,
                label: `📄 ${ch.title || 'Sin título'}`,
                description: 'Capítulo',
                group: 'Capítulos',
                value: { mode: 'manual', docId: ch.id, docType: 'chapter', docTitle: ch.title },
            });
        });

        // World Items de sistema
        SYSTEM_WORLD_ITEM_IDS.forEach(wid => {
            const label = SYSTEM_WORLD_ITEM_LABELS[wid] || wid;
            options.push({
                id: `world_${wid}`,
                label: `🌍 ${label}`,
                description: 'Master Doc',
                group: 'Master Doc',
                value: { mode: 'manual', docId: wid, docType: 'worldItem', docTitle: label },
            });
        });

        // World items personalizados
        customWorldItems.forEach(w => {
            options.push({
                id: `world_${w.id}`,
                label: `🌍 ${w.title || 'Sin título'}`,
                description: 'Master Doc',
                group: 'Master Doc',
                value: { mode: 'manual', docId: w.id, docType: 'worldItem', docTitle: w.title },
            });
        });

        options.push({
            id: 'new',
            label: '✨ Crear nuevo documento',
            description: 'La IA generará nuevo contenido',
            value: { mode: 'new', docId: null, docType: 'chapter', docTitle: '' },
        });

        return options;
    }, [chapters, customWorldItems]);

    const isSelected = (id) => selectedChapterIds.includes(id);
    const isWorldSelected = (id) => selectedWorldItemIds.includes(id);

    const getStatusColor = (status) => {
        switch (status) {
            case 'Finalizado': return 'bg-indigo-500';
            case 'Completado': return 'bg-emerald-500';
            case 'Revisión': return 'bg-amber-500';
            case 'Borrador': return 'bg-blue-500';
            default: return 'bg-gray-400';
        }
    };

    const [expandedVolumes, setExpandedVolumes] = useState({});

    return (
        <div className="flex-1 overflow-y-auto scrollbar-hide px-2">
                {/* Quick Select */}
                <div className="p-3 border-b border-[var(--border-main)]/50">
                    <div className="relative">
                        <button
                            onClick={() => setShowQuickSelect(!showQuickSelect)}
                            className="w-full text-left px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20 transition-all"
                        >
                            ⚡ Selección rápida
                        </button>
                        {showQuickSelect && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                {[
                                    { id: 'all_chapters', label: 'Todo el manuscrito' },
                                    { id: 'all_world', label: 'Todo el Master Doc' },
                                    { id: 'all', label: 'Ambos (todo)' },
                                    { id: 'clear', label: 'Limpiar selección' },
                                ].map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => quickSelect(opt.id)}
                                        className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-colors"
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Chapters Section */}
                <div className="p-3 border-b border-[var(--border-main)]/50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                            <BookOpen size={12} /> Manuscrito
                        </span>
                        <span className="text-[9px] font-bold text-indigo-500">
                            {selectedChapterIds.length} selec.
                        </span>
                    </div>

                    {/* Heavy context warning */}
                    {(() => {
                        const weight = estimateContextWeight(chapters, selectedChapterIds, worldItems, selectedWorldItemIds);
                        if (!weight.isHeavy) return null;
                        return (
                            <div className="flex items-start gap-2 px-3 py-2 mb-2 rounded-lg bg-amber-500/5 border border-amber-500/20 animate-in fade-in duration-200">
                                <AlertTriangle size={10} className="text-amber-500 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-amber-500 leading-tight">Contexto Pesado</p>
                                    <p className="text-[8px] text-[var(--text-muted)] opacity-70 leading-tight mt-0.5">
                                        ~{(weight.estimatedTokens / 1000).toFixed(1)}k tokens. Usa el botón "Comprimir" en el chat.
                                    </p>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Volumes */}
                    {volumes.map(vol => {
                        const volChapters = getChaptersByParent(vol.id);
                        const isExpanded = expandedVolumes[vol.id] ?? true;
                        return (
                            <div key={vol.id} className="mb-1">
                                <button
                                    onClick={() => setExpandedVolumes(prev => ({ ...prev, [vol.id]: !isExpanded }))}
                                    className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--accent-soft)]/50 transition-colors"
                                >
                                    <Layers size={10} className="text-indigo-500/60" />
                                    <span className="text-[10px] font-bold text-[var(--text-muted)] truncate flex-1">
                                        {vol.title}
                                    </span>
                                    <ChevronRight size={10} className={`text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </button>
                                {isExpanded && volChapters.map(ch => (
                                    <label key={ch.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-colors ml-2">
                                        <input
                                            type="checkbox"
                                            checked={isSelected(ch.id)}
                                            onChange={() => toggleChapter(ch.id)}
                                            className="hidden"
                                        />
                                        <div className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center shrink-0 ${
                                            isSelected(ch.id) 
                                                ? 'bg-indigo-600 border-indigo-600 text-white scale-110 shadow-md shadow-indigo-600/10' 
                                                : 'border-[var(--border-main)] bg-[var(--bg-app)]'
                                        }`}>
                                            {isSelected(ch.id) && <Check size={10} strokeWidth={4} />}
                                        </div>
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(ch.status)}`} />
                                        <span className="text-[11px] text-[var(--text-main)] truncate flex-1">
                                            {ch.title || 'Sin título'}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        );
                    })}

                    {/* Standalone chapters */}
                    {standaloneChapters.map(ch => (
                        <label key={ch.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-colors">
                            <input
                                type="checkbox"
                                checked={isSelected(ch.id)}
                                onChange={() => toggleChapter(ch.id)}
                                className="hidden"
                            />
                            <div className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center shrink-0 ${
                                isSelected(ch.id) 
                                    ? 'bg-indigo-600 border-indigo-600 text-white scale-110 shadow-md shadow-indigo-600/10' 
                                    : 'border-[var(--border-main)] bg-[var(--bg-app)]'
                            }`}>
                                {isSelected(ch.id) && <Check size={10} strokeWidth={4} />}
                            </div>
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(ch.status)}`} />
                            <span className="text-[11px] text-[var(--text-main)] truncate flex-1">
                                {ch.title || 'Sin título'}
                            </span>
                        </label>
                    ))}

                    {chapters.filter(c => !c.isVolume).length === 0 && (
                        <p className="text-[10px] text-[var(--text-muted)] opacity-50 px-3 py-2 italic">
                            No hay capítulos
                        </p>
                    )}
                </div>

                {/* Master Doc Section */}
                <div className="p-3 border-b border-[var(--border-main)]/50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                            <Globe size={12} /> Master Doc
                        </span>
                        <span className="text-[9px] font-bold text-indigo-500">
                            {selectedWorldItemIds.length} selec.
                        </span>
                    </div>

                    {/* System items */}
                    {SYSTEM_WORLD_ITEM_IDS.map(wid => {
                        const item = worldItems.find(w => w.id === wid);
                        const label = SYSTEM_WORLD_ITEM_LABELS[wid] || wid;
                        const iconMap = {
                            system_personajes: Users,
                            system_estructura: Layers,
                            system_core: Bookmark,
                        };
                        const Icon = iconMap[wid] || FileText;
                        const hasContent = item?.content;

                        return (
                            <label key={wid} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-colors ${!hasContent ? 'opacity-50' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={isWorldSelected(wid)}
                                    onChange={() => toggleWorldItem(wid)}
                                    className="hidden"
                                />
                                <div className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center shrink-0 ${
                                    isWorldSelected(wid) 
                                        ? 'bg-indigo-600 border-indigo-600 text-white scale-110 shadow-md shadow-indigo-600/10' 
                                        : 'border-[var(--border-main)] bg-[var(--bg-app)]'
                                }`}>
                                    {isWorldSelected(wid) && <Check size={10} strokeWidth={4} />}
                                </div>
                                <Icon size={11} className="text-indigo-500/60 shrink-0" />
                                <span className="text-[11px] text-[var(--text-main)] truncate flex-1">
                                    {label}
                                </span>
                            </label>
                        );
                    })}

                    {/* Custom world items */}
                    {customWorldItems.map(w => (
                        <label key={w.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-colors">
                            <input
                                type="checkbox"
                                checked={isWorldSelected(w.id)}
                                onChange={() => toggleWorldItem(w.id)}
                                className="hidden"
                            />
                            <div className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center shrink-0 ${
                                isWorldSelected(w.id) 
                                    ? 'bg-indigo-600 border-indigo-600 text-white scale-110 shadow-md shadow-indigo-600/10' 
                                    : 'border-[var(--border-main)] bg-[var(--bg-app)]'
                                }`}>
                                    {isWorldSelected(w.id) && <Check size={10} strokeWidth={4} />}
                                </div>
                            <FileText size={11} className="text-[var(--text-muted)] shrink-0" />
                            <span className="text-[11px] text-[var(--text-main)] truncate flex-1">
                                {w.title || 'Sin título'}
                            </span>
                        </label>
                    ))}

                    {worldItems.length === 0 && (
                        <p className="text-[10px] text-[var(--text-muted)] opacity-50 px-3 py-2 italic">
                            No hay elementos en Master Doc
                        </p>
                    )}
                </div>

                {/* Destination Selector - Custom Dropdown */}
                <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Target size={12} className="text-emerald-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                            Destino
                        </span>
                    </div>

                    <div className="relative">
                        <button
                            onClick={() => setShowDestDropdown(!showDestDropdown)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-lg text-[11px] text-[var(--text-main)] font-medium truncate hover:bg-[var(--accent-soft)]/30 transition-all"
                        >
                            <Target size={12} className="text-emerald-500 shrink-0" />
                            <span className="flex-1 text-left truncate">
                                {destinationOptions.find(o =>
                                    o.id === (destinationDoc?.mode === 'auto' ? 'auto'
                                        : destinationDoc?.mode === 'new' ? 'new'
                                        : `${destinationDoc?.docType}_${destinationDoc?.docId}`)
                                )?.label?.replace(/[🤖📄🌍✨]/g, '').trim() || 'Automático'}
                            </span>
                            <ChevronRight size={12} className={`text-[var(--text-muted)] transition-transform ${showDestDropdown ? 'rotate-90' : ''}`} />
                        </button>

                        {showDestDropdown && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setShowDestDropdown(false)} />
                                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl shadow-xl z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    <div className="max-h-52 overflow-y-auto scrollbar-hide">
                                        {destinationOptions.map(opt => (
                                            <button
                                                key={opt.id}
                                                onClick={() => {
                                                    if (opt.value) onDestinationChange(opt.value);
                                                    setShowDestDropdown(false);
                                                }}
                                                className={`w-full text-left px-3 py-2 text-xs transition-all flex items-center gap-2 ${
                                                    opt.id === (destinationDoc?.mode === 'auto' ? 'auto'
                                                        : destinationDoc?.mode === 'new' ? 'new'
                                                        : `${destinationDoc?.docType}_${destinationDoc?.docId}`)
                                                        ? 'bg-emerald-500/10 text-emerald-600 font-bold'
                                                        : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'
                                                }`}
                                            >
                                                <span className="text-sm">{opt.label.match(/^.{1,2}/)?.[0] || '📄'}</span>
                                                <div className="flex-1 min-w-0">
                                                    <span className="block truncate">{opt.label.replace(/[🤖📄🌍✨]/g, '').trim()}</span>
                                                </div>
                                                {opt.id === (destinationDoc?.mode === 'auto' ? 'auto'
                                                    : destinationDoc?.mode === 'new' ? 'new'
                                                    : `${destinationDoc?.docType}_${destinationDoc?.docId}`) && (
                                                    <Check size={12} className="text-emerald-500 shrink-0" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
    );
};

export default IAStudioContextPanel;
