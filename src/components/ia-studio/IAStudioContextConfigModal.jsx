import React, { useState, useMemo } from 'react';
import Modal from '../Modal';
import { SYSTEM_WORLD_ITEM_IDS, SYSTEM_WORLD_ITEM_LABELS } from './IAStudioUtils';
import { useIAStudioContext } from '../../context/IAStudioContext';
import {
    BookOpen, Globe, Layers, Users, Bookmark, FileText, ChevronRight, Target, Check
} from 'lucide-react';

const IAStudioContextConfigModal = ({
    isOpen,
    onClose,
    chapters = [],
    worldItems = [],
}) => {
    const { contextSelections, destinationDoc, onContextChange, onDestinationChange } = useIAStudioContext();
    const [expandedVolumes, setExpandedVolumes] = useState({});
    const [showDestDropdown, setShowDestDropdown] = useState(false);

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

    const getStatusColor = (status) => {
        switch (status) {
            case 'Finalizado': return 'bg-indigo-500';
            case 'Completado': return 'bg-emerald-500';
            case 'Revisión': return 'bg-amber-500';
            case 'Borrador': return 'bg-blue-500';
            default: return 'bg-gray-400';
        }
    };

    const destinationOptions = useMemo(() => {
        const options = [
            { id: 'auto', label: 'Automático — la IA decide', value: { mode: 'auto', docId: null, docType: 'chapter', docTitle: '' } },
        ];
        chapters.filter(c => !c.isVolume).forEach(ch => {
            options.push({
                id: `chapter_${ch.id}`,
                label: `Cap: ${ch.title || 'Sin título'}`,
                value: { mode: 'manual', docId: ch.id, docType: 'chapter', docTitle: ch.title },
            });
        });
        SYSTEM_WORLD_ITEM_IDS.forEach(wid => {
            const label = SYSTEM_WORLD_ITEM_LABELS[wid] || wid;
            options.push({
                id: `world_${wid}`,
                label: `Master: ${label}`,
                value: { mode: 'manual', docId: wid, docType: 'worldItem', docTitle: label },
            });
        });
        customWorldItems.forEach(w => {
            options.push({
                id: `world_${w.id}`,
                label: `Master: ${w.title || 'Sin título'}`,
                value: { mode: 'manual', docId: w.id, docType: 'worldItem', docTitle: w.title },
            });
        });
        options.push({
            id: 'new',
            label: 'Crear nuevo documento',
            value: { mode: 'new', docId: null, docType: 'chapter', docTitle: '' },
        });
        return options;
    }, [chapters, customWorldItems]);

    const currentDestValue =
        destinationDoc?.mode === 'auto' ? 'auto'
        : destinationDoc?.mode === 'new' ? 'new'
        : `${destinationDoc?.docType}_${destinationDoc?.docId}`;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Contexto y Destino" size="2xl">
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hide">
                {/* Documentos de contexto */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] flex items-center gap-2">
                            <BookOpen size={12} /> Documentos de Contexto
                        </span>
                        <span className="text-[9px] font-bold text-indigo-500">
                            {selectedChapterIds.length + selectedWorldItemIds.length} selec.
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Manuscrito */}
                        <div className="bg-[var(--bg-editor)] rounded-xl p-3 border border-[var(--border-main)]/50">
                            <p className="text-[9px] font-black uppercase tracking-wider text-indigo-500 mb-3 flex items-center gap-1.5">
                                <BookOpen size={10} /> Manuscrito
                            </p>
                            {volumes.map(vol => {
                                const volChapters = getChaptersByParent(vol.id);
                                const isExpanded = expandedVolumes[vol.id] ?? true;
                                return (
                                    <div key={vol.id} className="mb-1">
                                        <button
                                            onClick={() => setExpandedVolumes(prev => ({ ...prev, [vol.id]: !isExpanded }))}
                                            className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--accent-soft)]/50 transition-colors"
                                        >
                                            <Layers size={9} className="text-indigo-500/60 shrink-0" />
                                            <span className="text-[10px] font-bold text-[var(--text-muted)] truncate flex-1">{vol.title}</span>
                                            <ChevronRight size={9} className={`text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                        </button>
                                        {isExpanded && volChapters.map(ch => (
                                            <label key={ch.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-colors ml-1">
                                                <input type="checkbox" checked={selectedChapterIds.includes(ch.id)} onChange={() => toggleChapter(ch.id)}
                                                    className="w-3 h-3 rounded border-[var(--border-main)] text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer" />
                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(ch.status)}`} />
                                                <span className="text-[10px] text-[var(--text-main)] truncate flex-1">{ch.title || 'Sin título'}</span>
                                            </label>
                                        ))}
                                    </div>
                                );
                            })}
                            {standaloneChapters.map(ch => (
                                <label key={ch.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-colors">
                                    <input type="checkbox" checked={selectedChapterIds.includes(ch.id)} onChange={() => toggleChapter(ch.id)}
                                        className="w-3 h-3 rounded border-[var(--border-main)] text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer" />
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(ch.status)}`} />
                                    <span className="text-[10px] text-[var(--text-main)] truncate flex-1">{ch.title || 'Sin título'}</span>
                                </label>
                            ))}
                            {chapters.filter(c => !c.isVolume).length === 0 && (
                                <p className="text-[10px] text-[var(--text-muted)] opacity-50 px-2 py-2 italic">No hay capítulos</p>
                            )}
                        </div>

                        {/* Master Doc */}
                        <div className="bg-[var(--bg-editor)] rounded-xl p-3 border border-[var(--border-main)]/50">
                            <p className="text-[9px] font-black uppercase tracking-wider text-indigo-500 mb-3 flex items-center gap-1.5">
                                <Globe size={10} /> Master Doc
                            </p>
                            {SYSTEM_WORLD_ITEM_IDS.map(wid => {
                                const item = worldItems.find(w => w.id === wid);
                                const label = SYSTEM_WORLD_ITEM_LABELS[wid] || wid;
                                const iconMap = { system_personajes: Users, system_estructura: Layers, system_core: Bookmark };
                                const Icon = iconMap[wid] || FileText;
                                return (
                                    <label key={wid} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-colors ${!item?.content ? 'opacity-50' : ''}`}>
                                        <input type="checkbox" checked={selectedWorldItemIds.includes(wid)} onChange={() => toggleWorldItem(wid)}
                                            className="w-3 h-3 rounded border-[var(--border-main)] text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer" />
                                        <Icon size={10} className="text-indigo-500/60 shrink-0" />
                                        <span className="text-[10px] text-[var(--text-main)] truncate flex-1">{label}</span>
                                    </label>
                                );
                            })}
                            {customWorldItems.map(w => (
                                <label key={w.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-colors">
                                    <input type="checkbox" checked={selectedWorldItemIds.includes(w.id)} onChange={() => toggleWorldItem(w.id)}
                                        className="w-3 h-3 rounded border-[var(--border-main)] text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer" />
                                    <FileText size={10} className="text-[var(--text-muted)] shrink-0" />
                                    <span className="text-[10px] text-[var(--text-main)] truncate flex-1">{w.title || 'Sin título'}</span>
                                </label>
                            ))}
                            {worldItems.length === 0 && (
                                <p className="text-[10px] text-[var(--text-muted)] opacity-50 px-2 py-2 italic">No hay elementos en Master Doc</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Destino */}
                <div className="border-t border-[var(--border-main)] pt-5">
                    <div className="flex items-center gap-1.5 mb-3">
                        <Target size={12} className="text-emerald-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            Destino
                        </span>
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShowDestDropdown(!showDestDropdown)}
                            className="w-full flex items-center gap-2 px-4 py-3 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl text-[12px] text-[var(--text-main)] font-medium hover:bg-[var(--accent-soft)]/30 transition-all"
                        >
                            <Target size={14} className="text-emerald-500 shrink-0" />
                            <span className="flex-1 text-left truncate">
                                {destinationOptions.find(o => o.id === currentDestValue)?.label || 'Automático'}
                            </span>
                            <ChevronRight size={14} className={`text-[var(--text-muted)] transition-transform ${showDestDropdown ? 'rotate-90' : ''}`} />
                        </button>

                        {showDestDropdown && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setShowDestDropdown(false)} />
                                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl shadow-xl z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    <div className="max-h-60 overflow-y-auto scrollbar-hide">
                                        {destinationOptions.map(opt => (
                                            <button
                                                key={opt.id}
                                                onClick={() => {
                                                    if (opt.value) onDestinationChange(opt.value);
                                                    setShowDestDropdown(false);
                                                }}
                                                className={`w-full text-left px-4 py-2.5 text-xs transition-all flex items-center gap-2 ${
                                                    opt.id === currentDestValue
                                                        ? 'bg-emerald-500/10 text-emerald-600 font-bold'
                                                        : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'
                                                }`}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <span className="block truncate">{opt.label}</span>
                                                </div>
                                                {opt.id === currentDestValue && (
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
        </Modal>
    );
};

export default IAStudioContextConfigModal;
