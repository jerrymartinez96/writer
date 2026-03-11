import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import Modal from './Modal';
import { History, Save, RotateCcw, Clock, Cloud, Info } from 'lucide-react';

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
            toast.success("¡Backup permanente guardado!");
            await loadSnapshots();
        } catch (error) {
            toast.error("Error al guardar la versión.");
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = (content) => {
        if (!editor) return;
        if (confirm("¿Estás seguro de restaurar esta versión? Se perderán los cambios actuales no guardados.")) {
            editor.commands.setContent(content || '');
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
        <Modal isOpen={isOpen} onClose={onClose} title="Historial de Backups" size="lg">
            <div className="flex flex-col h-[60vh] md:h-[70vh]">
                
                {/* Information Header */}
                <div className="bg-[var(--accent-soft)]/20 p-4 rounded-xl border border-[var(--border-main)] mb-6 flex items-center justify-between gap-4">
                    <div className="flex gap-3">
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 shrink-0">
                            <Cloud size={20} />
                        </div>
                        <div>
                            <h4 className="font-bold text-sm text-[var(--text-main)]">Versiones Permanentes</h4>
                            <p className="text-[10px] text-[var(--text-muted)] max-w-sm mt-0.5">
                                Aquí se guardan los hitos importantes. El sistema mantiene un máximo de 5 versiones por capítulo.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleCreateSnapshot}
                        disabled={loading}
                        className="bg-[var(--accent-main)] text-white px-4 py-2 rounded-lg font-bold hover:scale-105 transition-all shadow-md text-xs flex items-center gap-2 shrink-0"
                    >
                        <Save size={14} />
                        Crear Backup
                    </button>
                </div>

                <div className="flex flex-1 min-h-0 gap-6">
                    {/* List of snapshots */}
                    <div className="w-1/3 flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
                        {loading && snapshots.length === 0 ? (
                            <div className="text-center p-4 text-[var(--text-muted)] text-xs animate-pulse">Cargando...</div>
                        ) : snapshots.length === 0 ? (
                            <div className="text-center p-8 bg-[var(--bg-editor)] rounded-2xl border border-[var(--border-main)] text-[var(--text-muted)] text-xs italic">
                                No hay backups guardados aún.
                            </div>
                        ) : (
                            snapshots.map((snap, index) => (
                                <button
                                    key={snap.id}
                                    onClick={() => setPreviewContent(snap.content)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all ${previewContent === snap.content ? 'border-[var(--accent-main)] bg-[var(--accent-soft)]/30 shadow-sm' : 'border-[var(--border-main)] bg-[var(--bg-app)] hover:border-[var(--accent-main)]'}`}
                                >
                                    <div className="flex items-center gap-2 font-bold text-[11px] text-[var(--text-main)] mb-1 uppercase tracking-wider">
                                        <Clock size={12} className="text-[var(--text-muted)]" />
                                        Versión {snapshots.length - index}
                                        {index === 0 && <span className="ml-auto text-[8px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-full">ÚLTIMA</span>}
                                    </div>
                                    <div className="text-[10px] text-[var(--text-muted)] pl-5 font-mono">
                                        {formatDate(snap.createdAt)}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Preview Area */}
                    <div className="w-2/3 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl flex flex-col overflow-hidden shadow-inner relative">
                        {previewContent === null ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                                <Info size={32} className="text-[var(--border-main)]" />
                                <p className="text-[var(--text-muted)] text-xs italic">
                                    Selecciona un backup para previsualizar el texto.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="p-3 border-b border-[var(--border-main)] bg-[var(--bg-editor)] flex justify-end">
                                    <button
                                        onClick={() => handleRestore(previewContent)}
                                        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-500/20"
                                    >
                                        <RotateCcw size={14} />
                                        RESTAURAR ESTA VERSIÓN
                                    </button>
                                </div>
                                <div
                                    className="flex-1 overflow-y-auto p-8 font-serif prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed selection:bg-indigo-100"
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
