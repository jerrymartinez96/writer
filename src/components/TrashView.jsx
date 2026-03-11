import React from 'react';
import { useData } from '../context/DataContext';
import { Trash2, RotateCcw, FileText, User, Globe } from 'lucide-react';
import { useToast } from './Toast';

const TrashView = () => {
    const { trashItems, restoreTrashItem } = useData();
    const toast = useToast();

    const handleRestore = async (item) => {
        try {
            await restoreTrashItem(item);
            toast.success("¡Elemento restaurado con éxito!");
        } catch (error) {
            toast.error("Hubo un error al restaurar el elemento.");
        }
    };

    const getIconInfo = (type) => {
        switch (type) {
            case 'chapters': return { icon: FileText, label: 'Capítulo', color: 'text-blue-500', bg: 'bg-blue-500/10' };
            case 'characters': return { icon: User, label: 'Personaje', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
            case 'world': return { icon: Globe, label: 'World Lore', color: 'text-indigo-500', bg: 'bg-indigo-500/10' };
            default: return { icon: FileText, label: 'Elemento', color: 'text-gray-500', bg: 'bg-gray-500/10' };
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'Desconocida';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="max-w-4xl mx-auto p-6 md:p-10 animate-in fade-in duration-500 h-full flex flex-col">
            <header className="mb-8 flex items-center gap-4 shrink-0">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 shadow-inner">
                    <Trash2 size={24} />
                </div>
                <div>
                    <h1 className="text-3xl md:text-4xl font-serif font-black text-[var(--text-main)]">Papelera</h1>
                    <p className="text-[var(--text-muted)] text-sm md:text-base mt-1">Los elementos eliminados se guardan aquí durante 30 días.</p>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {trashItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-10 border border-dashed border-[var(--border-main)] rounded-3xl bg-[var(--bg-app)]">
                        <Trash2 size={48} className="text-[var(--border-main)] mb-4" />
                        <h3 className="text-xl font-bold text-[var(--text-main)] mb-2">Papelera Vacía</h3>
                        <p className="text-[var(--text-muted)] max-w-sm">
                            Cuando elimines capítulos, personajes o entradas del lore, aparecerán aquí para que puedas recuperarlos si cambias de opinión.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {trashItems.sort((a, b) => b.deletedAt - a.deletedAt).map(item => {
                            const { icon: Icon, label, color, bg } = getIconInfo(item.collectionType);
                            return (
                                <div key={item.id} className="group relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-4 flex items-center gap-4 hover:border-[var(--accent-main)] hover:shadow-md transition-all">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg} ${color}`}>
                                        <Icon size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-[var(--text-main)] truncate text-base mb-0.5">
                                            {item.title || item.name || 'Sin nombre'}
                                        </h4>
                                        <div className="flex items-center gap-3 text-xs font-bold text-[var(--text-muted)]">
                                            <span className="uppercase tracking-widest">{label}</span>
                                            <span className="w-1 h-1 rounded-full bg-[var(--border-main)]"></span>
                                            <span>Eliminado el {formatDate(item.deletedAt)}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRestore(item)}
                                        className="shrink-0 p-3 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-main)] hover:bg-[var(--accent-main)] hover:text-white transition-all shadow-sm hidden md:flex items-center gap-2 group-hover:scale-105"
                                        title="Restaurar elemento"
                                    >
                                        <RotateCcw size={18} />
                                        <span className="font-bold text-sm">Restaurar</span>
                                    </button>
                                    <button
                                        onClick={() => handleRestore(item)}
                                        className="shrink-0 p-3 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-main)] hover:bg-[var(--accent-main)] hover:text-white transition-all shadow-sm md:hidden flex items-center justify-center"
                                        title="Restaurar elemento"
                                    >
                                        <RotateCcw size={18} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TrashView;
