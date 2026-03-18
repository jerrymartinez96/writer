import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Trash2, RotateCcw, FileText, User, Globe, AlertTriangle, XCircle } from 'lucide-react';
import { useToast } from './Toast';
import ConfirmModal from './ConfirmModal';

const TrashView = () => {
    const { trashItems, restoreTrashItem, permanentlyDeleteTrashItem } = useData();
    const toast = useToast();
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isEmptyTrashConfirmOpen, setIsEmptyTrashConfirmOpen] = useState(false);

    const handleRestore = async (item) => {
        try {
            await restoreTrashItem(item);
            toast.success("¡Elemento restaurado con éxito!");
        } catch (error) {
            toast.error("Hubo un error al restaurar el elemento.");
        }
    };

    const handlePermanentDelete = (item) => {
        setItemToDelete(item);
        setIsConfirmOpen(true);
    };

    const confirmPermanentDelete = async () => {
        if (!itemToDelete) return;
        try {
            await permanentlyDeleteTrashItem(itemToDelete);
            toast.success("Elemento eliminado permanentemente.");
            setItemToDelete(null);
        } catch (error) {
            toast.error("Error al eliminar el elemento.");
        }
    };

    const handleEmptyTrash = async () => {
        try {
            // Delete all items one by one or expose a bulk delete in API
            // For now, simple loop for consistency with the hook
            for (const item of trashItems) {
                await permanentlyDeleteTrashItem(item);
            }
            toast.success("Papelera vaciada correctamente.");
        } catch (error) {
            toast.error("Error al vaciar la papelera.");
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
        <div className="max-w-5xl mx-auto p-6 md:p-10 animate-in fade-in duration-500 h-full flex flex-col">
            <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 shrink-0">
                <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-red-500/10 rounded-[28px] flex items-center justify-center text-red-500 shadow-xl border border-red-500/10 ring-4 ring-red-500/5 transition-transform hover:rotate-3">
                        <Trash2 size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl md:text-5xl font-serif font-black text-[var(--text-main)] italic tracking-tight">Papelera</h1>
                        <p className="text-[var(--text-muted)] text-sm md:text-base mt-2 font-medium opacity-80 uppercase tracking-widest text-[10px]">Los elementos eliminados se guardan aquí para seguridad.</p>
                    </div>
                </div>

                {trashItems.length > 0 && (
                    <button 
                        onClick={() => setIsEmptyTrashConfirmOpen(true)}
                        className="group flex items-center gap-3 px-6 py-3.5 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-red-600/20 border border-red-100"
                    >
                        <XCircle size={18} className="group-hover:rotate-90 transition-transform duration-500" />
                        <span className="font-black text-[10px] uppercase tracking-[0.2em]">Vaciar Papelera</span>
                    </button>
                )}
            </header>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-20">
                {trashItems.length === 0 ? (
                    <div className="h-[50vh] flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-[var(--border-main)] rounded-[40px] bg-[var(--bg-editor)]/30 backdrop-blur-sm">
                        <div className="w-24 h-24 bg-[var(--bg-app)] rounded-full flex items-center justify-center mb-6 shadow-inner border border-[var(--border-main)]">
                            <Trash2 size={40} className="text-[var(--text-muted)] opacity-20" />
                        </div>
                        <h3 className="text-2xl font-serif font-black text-[var(--text-main)] mb-3">Tu papelera está limpia</h3>
                        <p className="text-[var(--text-muted)] max-w-sm text-sm font-medium leading-relaxed italic">
                            No tienes elementos eliminados. Los capítulos, personajes o entradas del lore aparecerán aquí si decides borrarlos.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {trashItems.sort((a, b) => b.deletedAt - a.deletedAt).map(item => {
                            const { icon: Icon, label, color, bg } = getIconInfo(item.collectionType);
                            return (
                                <div key={item.id} className="group overflow-hidden relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center gap-6 hover:border-[var(--accent-main)] hover:shadow-2xl hover:shadow-[var(--accent-main)]/5 hover:-translate-y-1 transition-all duration-300">
                                    <div className="flex items-center gap-5 flex-1 min-w-0">
                                        <div className={`w-14 h-14 rounded-[22px] flex items-center justify-center shrink-0 ${bg} ${color} shadow-inner border border-current/10 transition-transform group-hover:scale-110 duration-500 shadow-lg`}>
                                            <Icon size={24} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-serif font-black text-[var(--text-main)] truncate text-xl mb-1 italic">
                                                {item.title || item.name || 'Sin nombre'}
                                            </h4>
                                            <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                                <span className={`${color} px-2 py-0.5 rounded-md ${bg}`}>{label}</span>
                                                <span className="opacity-30">•</span>
                                                <span className="italic">Eliminado el {formatDate(item.deletedAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3 group-hover:translate-x-0 transition-transform duration-500">
                                        <button
                                            onClick={() => handleRestore(item)}
                                            className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-[var(--accent-soft)] text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all duration-300 font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-lg hover:shadow-indigo-600/20 active:scale-95 border border-indigo-500/10"
                                            title="Restaurar elemento"
                                        >
                                            <RotateCcw size={16} />
                                            <span>Restaurar</span>
                                        </button>
                                        
                                        <button
                                            onClick={() => handlePermanentDelete(item)}
                                            className="w-14 h-14 sm:w-14 sm:h-14 flex items-center justify-center rounded-2xl bg-red-50 text-red-400 hover:bg-red-600 hover:text-white transition-all duration-300 active:scale-95 border border-red-100 shadow-sm"
                                            title="Eliminar permanentemente"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <ConfirmModal 
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={confirmPermanentDelete}
                title="¿Eliminar permanentemente?"
                message={`Estás a punto de borrar definitivamente "${itemToDelete?.title || itemToDelete?.name}". Esta acción no se puede deshacer.`}
                confirmText="Eliminar para siempre"
                cancelText="Mantener en papelera"
                type="danger"
            />

            <ConfirmModal 
                isOpen={isEmptyTrashConfirmOpen}
                onClose={() => setIsEmptyTrashConfirmOpen(false)}
                onConfirm={handleEmptyTrash}
                title="¿Vaciar toda la papelera?"
                message="Se eliminarán permanentemente todos los elementos de la papelera. Esta acción es irreversible."
                confirmText="Sí, vaciar todo"
                cancelText="Cancelar"
                type="danger"
            />
        </div>
    );
};

export default TrashView;
