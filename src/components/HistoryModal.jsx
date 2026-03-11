import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import Modal from './Modal';
import { History, Save, RotateCcw, Clock, AlertTriangle } from 'lucide-react';

const HistoryModal = ({ isOpen, onClose, editor }) => {
    const { activeChapter, getChapterSnapshots, saveChapterSnapshot } = useData();
    const toast = useToast();
    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [previewContent, setPreviewContent] = useState(null);

    useEffect(() => {
        if (isOpen && activeChapter) {
            loadSnapshots();
        } else {
            setPreviewContent(null);
        }
    }, [isOpen, activeChapter]);

    const loadSnapshots = async () => {
        setLoading(true);
        try {
            const data = await getChapterSnapshots(activeChapter.id);
            setSnapshots(data);
        } catch (error) {
            toast.error("Error al cargar el historial.");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSnapshot = async () => {
        if (!editor || !activeChapter) return;
        const currentContent = editor.getHTML();
        if (!currentContent || currentContent === '<p></p>') {
            toast.warning("El capítulo está vacío, no hay nada que guardar.");
            return;
        }

        setLoading(true);
        try {
            await saveChapterSnapshot(activeChapter.id, currentContent);
            toast.success("¡Punto de restauración guardado!");
            await loadSnapshots(); // Reload the list
        } catch (error) {
            toast.error("Error al guardar una nueva versión.");
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = (content) => {
        if (!editor) return;
        if (confirm("¿Estás seguro de restaurar esta versión? Se perderán los cambios no guardados en un snapshot.")) {
            editor.commands.setContent(content);
            toast.success("¡Versión restaurada con éxito!");
            setPreviewContent(null);
            onClose();
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'Reciente';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('es-ES', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Historial de Versiones" size="lg">
            <div className="flex flex-col h-[60vh] md:h-[70vh]">
                {/* Header Action */}
                <div className="flex items-center justify-between bg-[var(--accent-soft)]/20 p-4 rounded-xl border border-[var(--border-main)] mb-6">
                    <div>
                        <h4 className="font-bold text-[var(--accent-main)] flex items-center gap-2">
                            <History size={18} />
                            Copias de Seguridad
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm">
                            Puedes guardar hasta 3 versiones de este capítulo. Si creas una cuarta, se borrará la más antigua automáticamente.
                        </p>
                    </div>
                    <button
                        onClick={handleCreateSnapshot}
                        disabled={loading}
                        className="flex items-center gap-2 bg-[var(--accent-main)] text-white px-4 py-2.5 rounded-xl font-bold hover:scale-105 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                        <Save size={16} />
                        Crear Backup
                    </button>
                </div>

                <div className="flex flex-1 min-h-0 gap-6">
                    {/* List of snapshots */}
                    <div className="w-1/3 flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
                        {loading && snapshots.length === 0 ? (
                            <div className="text-center p-4 text-[var(--text-muted)] text-sm animate-pulse">Cargando versiones...</div>
                        ) : snapshots.length === 0 ? (
                            <div className="text-center p-6 bg-[var(--bg-editor)] rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] text-sm">
                                No hay backups guardados aún. Haz clic en "Crear Backup" para guardar el progreso actual.
                            </div>
                        ) : (
                            snapshots.map((snap, index) => (
                                <button
                                    key={snap.id}
                                    onClick={() => setPreviewContent(snap.content)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all ${previewContent === snap.content ? 'border-[var(--accent-main)] bg-[var(--accent-soft)]/30 shadow-sm' : 'border-[var(--border-main)] bg-[var(--bg-app)] hover:border-[var(--accent-main)] hover:shadow-sm'}`}
                                >
                                    <div className="flex items-center gap-2 font-bold text-sm text-[var(--text-main)] mb-1">
                                        <Clock size={14} className="text-[var(--text-muted)]" />
                                        Versión {snapshots.length - index}
                                        {index === 0 && <span className="ml-auto text-[10px] bg-[var(--accent-main)] text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">Última</span>}
                                    </div>
                                    <div className="text-xs text-[var(--text-muted)] pl-5">
                                        {formatDate(snap.createdAt)}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Preview Area */}
                    <div className="w-2/3 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl flex flex-col overflow-hidden relative">
                        {previewContent === null ? (
                            <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm italic p-6 text-center">
                                Selecciona una versión a la izquierda para previsualizar el texto.
                            </div>
                        ) : (
                            <>
                                <div className="p-2 border-b border-[var(--border-main)] bg-[var(--bg-editor)] flex justify-end">
                                    <button
                                        onClick={() => handleRestore(previewContent)}
                                        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
                                    >
                                        <RotateCcw size={14} />
                                        Restaurar esta versión
                                    </button>
                                </div>
                                <div
                                    className="flex-1 overflow-y-auto p-6 font-serif prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: previewContent }}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default HistoryModal;
