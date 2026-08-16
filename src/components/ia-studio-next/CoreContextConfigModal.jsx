import React, { useMemo, useState } from 'react';
import { Check, CheckSquare, FileText, Globe, Search, Sparkles, Square, Users, X } from 'lucide-react';
import { useIAStudioContext } from '../../context/IAStudioContext';

const tabs = [
    { id: 'chapters', label: 'Capítulos', icon: FileText, key: 'chapterIds' },
    { id: 'world', label: 'Mundo', icon: Globe, key: 'worldItemIds' },
    { id: 'characters', label: 'Personajes', icon: Users, key: 'characterIds' },
];

const CoreContextConfigModal = ({ isOpen, onClose, chapters = [], worldItems = [], characters = [] }) => {
    const { contextSelections, onContextChange } = useIAStudioContext();
    const [activeTab, setActiveTab] = useState('chapters');
    const [search, setSearch] = useState('');

    const collections = useMemo(() => ({ chapters, world: worldItems, characters }), [chapters, worldItems, characters]);
    const activeConfig = tabs.find((tab) => tab.id === activeTab) || tabs[0];
    const items = (collections[activeTab] || []).filter((item) => {
        const label = item.title || item.name || '';
        return label.toLowerCase().includes(search.trim().toLowerCase());
    });
    const selectedIds = contextSelections?.[activeConfig.key] || [];
    const totalSelected = tabs.reduce((total, tab) => total + (contextSelections?.[tab.key]?.length || 0), 0);

    if (!isOpen) return null;

    const toggle = (id) => {
        const next = selectedIds.includes(id) ? selectedIds.filter((itemId) => itemId !== id) : [...selectedIds, id];
        onContextChange({ ...contextSelections, [activeConfig.key]: next });
    };

    const toggleAll = () => {
        const visibleIds = items.map((item) => item.id);
        const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
        const next = allSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : [...new Set([...selectedIds, ...visibleIds])];
        onContextChange({ ...contextSelections, [activeConfig.key]: next });
    };

    return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label="Configurar contexto" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border-main)] bg-[var(--bg-app)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b border-[var(--border-main)] p-5 sm:p-6">
                <div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500"><Sparkles size={13} /> Core IA Studio</p><h2 className="mt-1 text-xl font-serif font-black">Configurar contexto</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Selecciona los documentos que la IA puede consultar.</p></div>
                <button type="button" onClick={onClose} className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]" aria-label="Cerrar"><X size={18} /></button>
            </header>
            <div className="flex gap-2 overflow-x-auto border-b border-[var(--border-main)] px-4 pt-4 sm:px-6">{tabs.map((tab) => { const Icon = tab.icon; const count = contextSelections?.[tab.key]?.length || 0; return <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setSearch(''); }} className={`inline-flex shrink-0 items-center gap-2 rounded-t-xl px-3 py-2 text-xs font-black ${activeTab === tab.id ? 'border-b-2 border-indigo-500 text-indigo-500' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><Icon size={14} />{tab.label}{count > 0 && <span className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-500">{count}</span>}</button>; })}</div>
            <div className="flex items-center gap-2 p-4 sm:p-6 sm:pb-4"><div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Buscar ${activeConfig.label.toLowerCase()}…`} className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500" /></div><button type="button" onClick={toggleAll} disabled={!items.length} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-main)] px-3 py-2.5 text-xs font-bold text-[var(--text-muted)] hover:border-indigo-500 hover:text-indigo-500 disabled:opacity-40"><CheckSquare size={14} /> Todo</button></div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">{items.length ? <div className="space-y-2">{items.map((item) => { const selected = selectedIds.includes(item.id); const label = item.title || item.name || 'Sin título'; return <button key={item.id} type="button" onClick={() => toggle(item.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${selected ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-[var(--border-main)] hover:border-indigo-500/30'}`}>{selected ? <CheckSquare size={18} className="shrink-0 text-indigo-500" /> : <Square size={18} className="shrink-0 text-[var(--text-muted)]" />}<span className="min-w-0 truncate text-sm font-bold">{label}</span>{selected && <Check size={15} className="ml-auto shrink-0 text-indigo-500" />}</button>; })}</div> : <div className="rounded-2xl border border-dashed border-[var(--border-main)] p-8 text-center text-sm text-[var(--text-muted)]">No hay elementos disponibles.</div>}</div>
            <footer className="flex items-center justify-between gap-3 border-t border-[var(--border-main)] p-4 sm:p-6"><span className="text-xs text-[var(--text-muted)]">{totalSelected} elemento(s) seleccionado(s)</span><button type="button" onClick={onClose} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-500">Listo</button></footer>
        </div>
    </div>;
};

export default CoreContextConfigModal;
