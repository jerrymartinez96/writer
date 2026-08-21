import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import { History, Save, RotateCcw, Clock, Info, FileText, ChevronRight, Calendar, ChevronLeft, ChevronUp, ChevronDown, Diff, Trash2 } from 'lucide-react';
import { diff_match_patch } from 'diff-match-patch';

const HistoryModal = ({ isOpen, onClose, editor }) => {
    const { 
        activeChapter, 
        activeWorldDoc, 
        getDocumentSnapshots, 
        saveDocumentSnapshot,
        deleteDocumentSnapshot
    } = useData();
    const activeDoc = activeChapter || activeWorldDoc;
    const toast = useToast();
    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedSnapshot, setSelectedSnapshot] = useState(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [snapToDelete, setSnapToDelete] = useState(null);
    const [mobileView, setMobileView] = useState('list'); // 'list' or 'preview'
    const [showDiff, setShowDiff] = useState(true);
    const [showOnlyChanged, setShowOnlyChanged] = useState(false);
    const [selectedChangeIndex, setSelectedChangeIndex] = useState(0);
    const diffContainerRef = useRef(null);
    const snapshotDependenciesRef = useRef({ getDocumentSnapshots, toast });
    snapshotDependenciesRef.current = { getDocumentSnapshots, toast };

    const loadSnapshots = useCallback(async () => {
        setLoading(true);
        try {
            const data = await snapshotDependenciesRef.current.getDocumentSnapshots(activeDoc.id);
            setSnapshots(data);
        } catch {
            snapshotDependenciesRef.current.toast.error("Error al cargar el historial.");
        } finally {
            setLoading(false);
        }
    }, [activeDoc]);

    useEffect(() => {
        if (isOpen && activeDoc) {
            loadSnapshots();
        } else {
            setSelectedSnapshot(null);
            setMobileView('list');
            setShowDiff(true);
            setShowOnlyChanged(false);
            setSelectedChangeIndex(0);
        }
    }, [isOpen, activeDoc, loadSnapshots]);

    const handleCreateSnapshot = async () => {
        if (!editor || !activeDoc) return;
        const currentContent = editor.getHTML();
        if (!currentContent || currentContent === '<p></p>') {
            toast.warning(activeChapter ? "El capítulo está vacío." : "El documento está vacío.");
            return;
        }

        setLoading(true);
        try {
            await saveDocumentSnapshot(activeDoc.id, currentContent, 'manual');
            toast.success("Respaldo creado con éxito");
            await loadSnapshots();
        } catch {
            toast.error("Error al guardar la versión.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSnapshot = (snapshot) => {
        setSelectedSnapshot(snapshot);
        setMobileView('preview');
    };

    const handleRestoreAction = () => {
        if (!editor || !selectedSnapshot) return;
        setIsConfirmOpen(true);
    };

    const confirmRestore = () => {
        editor.commands.setContent(selectedSnapshot?.content || '');
        toast.success("¡Versión restaurada!");
        setSelectedSnapshot(null);
        setMobileView('list');
        onClose();
    };

    const handleDeleteAction = (snapId) => {
        setSnapToDelete(snapId);
        setIsDeleteConfirmOpen(true);
    };

    const confirmDelete = async () => {
        if (!snapToDelete) return;
        try {
            await deleteDocumentSnapshot(snapToDelete);
            toast.success("Punto de control eliminado");
            
            // If the deleted snapshot is the currently selected one, clear preview
            if (selectedSnapshot && selectedSnapshot.id === snapToDelete) {
                setSelectedSnapshot(null);
                setShowDiff(false);
                setSelectedChangeIndex(0);
                setMobileView('list');
            }
            
            await loadSnapshots();
        } catch {
            toast.error("Error al eliminar el punto de control.");
        } finally {
            setIsDeleteConfirmOpen(false);
            setSnapToDelete(null);
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return { date: 'Reciente', time: '' };
        const dateObj = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return {
            date: dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            time: dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        };
    };

    const getWordCount = (html) => {
        if (!html) return 0;
        const text = html.replace(/<[^>]*>/g, ' ');
        return text.trim() ? text.trim().split(/\s+/).length : 0;
    };

    const getTriggerBadge = (triggerType, isActive) => {
        switch (triggerType) {
            case 'ia':
                return (
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${isActive ? 'bg-purple-500/30 text-purple-200 border border-purple-400/30' : 'bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900/50'}`}>
                        🤖 IA
                    </span>
                );
            case 'manual':
                return (
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${isActive ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30' : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'}`}>
                        📌 Manual
                    </span>
                );
            case 'auto':
            default:
                return (
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${isActive ? 'bg-white/10 text-white/80 border border-white/20' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'}`}>
                        🔄 Auto
                    </span>
                );
        }
    };

    const normalizeSnapshotContent = (content) => String(content || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const snapshotEntries = useMemo(() => snapshots.map((snapshot, index) => ({
        snapshot,
        index,
        hasChanges: index === snapshots.length - 1
            || normalizeSnapshotContent(snapshot.content) !== normalizeSnapshotContent(snapshots[index + 1]?.content)
    })), [snapshots]);

    const visibleSnapshotEntries = showOnlyChanged
        ? snapshotEntries.filter(({ hasChanges }) => hasChanges)
        : snapshotEntries;

    // Calculate diff blocks between selectedSnapshot and its predecessor in the timeline.
    const diffData = useMemo(() => {
        if (!showDiff || !selectedSnapshot || !snapshots.length) return { html: null, changes: [] };

        const currentIndex = snapshots.findIndex(s => s.id === selectedSnapshot.id);
        if (currentIndex === -1) return { html: null, changes: [] };

        const predecessor = snapshots[currentIndex + 1];
        const stripTags = (html) => html.replace(/<p>/g, '\n').replace(/<\/p>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, '').trim();
        
        const textOld = predecessor ? stripTags(predecessor.content) : '';
        const textNew = stripTags(selectedSnapshot.content);

        const dmp = new diff_match_patch();
        const diffs = dmp.diff_main(textOld, textNew);
        dmp.diff_cleanupSemantic(diffs);

        const escapeHtml = (value) => value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        const changes = [];
        const output = [];
        let activeChange = null;

        diffs.forEach(([type, text]) => {
            const cleanText = escapeHtml(text).replace(/\n/g, '<br/>');
            if (type === 0) {
                output.push(`<span class="opacity-100">${cleanText}</span>`);
                activeChange = null;
                return;
            }

            if (!activeChange) {
                activeChange = { id: `diff-change-${changes.length}`, types: [], text: '' };
                changes.push(activeChange);
            }
            activeChange.types.push(type);
            activeChange.text += text;
            const isAddition = type === 1;
            const classes = isAddition
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-0.5 rounded border-b border-emerald-500/50'
                : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 line-through px-0.5 rounded border-b border-rose-500/50';
            output.push(`<span data-diff-change="${activeChange.id}" class="diff-change ${classes}" title="${isAddition ? 'Añadido' : 'Eliminado'} en esta versión">${cleanText}</span>`);
        });

        return { html: output.join(''), changes };
    }, [showDiff, selectedSnapshot, snapshots]);

    useEffect(() => {
        if (!showDiff || !diffData.changes.length || !diffContainerRef.current) return;
        const change = diffData.changes[selectedChangeIndex];
        const element = change && diffContainerRef.current.querySelector(`[data-diff-change="${change.id}"]`);
        diffContainerRef.current.querySelectorAll('.diff-change-selected').forEach((node) => {
            node.classList.remove('diff-change-selected', 'ring-2', 'ring-indigo-500', 'ring-offset-1', 'ring-offset-[var(--bg-editor)]');
        });
        if (element) element.classList.add('diff-change-selected', 'ring-2', 'ring-indigo-500', 'ring-offset-1', 'ring-offset-[var(--bg-editor)]');
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [diffData, selectedChangeIndex, showDiff]);

    useEffect(() => {
        setSelectedChangeIndex(0);
    }, [selectedSnapshot?.id]);

    const goToChange = useCallback((direction) => {
        if (!diffData.changes.length) return;
        setSelectedChangeIndex((current) => (current + direction + diffData.changes.length) % diffData.changes.length);
    }, [diffData.changes.length]);

    useEffect(() => {
        if (!isOpen || !showDiff || !diffData.changes.length) return undefined;
        const handleKeyDown = (event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
            if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') {
                event.preventDefault();
                goToChange(1);
            }
            if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') {
                event.preventDefault();
                goToChange(-1);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, showDiff, diffData.changes.length, goToChange]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={activeChapter ? "Historial del Capítulo" : "Historial del Documento"} size="xl">
            <div className="flex flex-col h-[80vh] min-h-[500px] p-4 md:p-8">
                
                {/* Header Section - Hide on mobile preview */}
                <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-indigo-500/5 p-6 rounded-[32px] border border-indigo-500/10 shadow-inner ${mobileView === 'preview' ? 'hidden md:flex' : ''}`}>
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/20">
                            <History size={28} />
                        </div>
                        <div>
                            <h3 className="font-serif font-black text-2xl text-[var(--text-main)] italic leading-none">Cápsulas de Tiempo</h3>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mt-2">
                                {visibleSnapshotEntries.length}{showOnlyChanged ? ` de ${snapshots.length}` : ''} de 120 puntos de control activos
                            </p>
                            <button
                                type="button"
                                onClick={() => setShowOnlyChanged((current) => !current)}
                                className={`mt-3 rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] transition-colors ${showOnlyChanged ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500' : 'border-[var(--border-main)] text-[var(--text-muted)] hover:border-indigo-500/50 hover:text-indigo-500'}`}
                            >
                                {showOnlyChanged ? 'Mostrar todas' : 'Solo con cambios'}
                            </button>
                        </div>
                    </div>
                    
                    <button
                        onClick={handleCreateSnapshot}
                        disabled={loading}
                        className="w-full sm:w-auto flex items-center justify-center gap-3 bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 disabled:opacity-50 active:scale-95"
                    >
                        <Save size={18} />
                        Fijar Punto de Control
                    </button>
                </div>

                <div className="flex flex-1 min-h-0 gap-8 relative overflow-hidden">
                    {/* Left Sidebar: Timeline - Responsive visibility */}
                    <div className={`w-full md:w-[340px] flex flex-col gap-3 overflow-y-auto pr-2 scrollbar-hide shrink-0 ${mobileView === 'preview' ? 'hidden md:flex' : 'flex'}`}>
                        {loading && snapshots.length === 0 ? (
                            <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
                        ) : snapshots.length === 0 ? (
                            <div className="p-8 text-center text-[10px] font-black uppercase text-[var(--text-muted)] opacity-40 border border-dashed border-[var(--border-main)] rounded-2xl">
                                Sin registros
                            </div>
                        ) : (
                            visibleSnapshotEntries.map(({ snapshot: snap, index }) => {
                                const isActive = selectedSnapshot?.id === snap.id;
                                const { date, time } = formatDate(snap.createdAt);
                                const words = getWordCount(snap.content);
                                
                                return (
                                    <div
                                        key={snap.id}
                                        className={`group relative flex items-start gap-4 p-5 rounded-[32px] border transition-all duration-500 ${isActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xl shadow-indigo-600/30' : 'bg-[var(--bg-editor)] border-[var(--border-main)] hover:border-indigo-500/50 hover:bg-[var(--bg-app)]'}`}
                                    >
                                        {/* Clickable Area to select snapshot */}
                                        <div 
                                            onClick={() => handleSelectSnapshot(snap)}
                                            className="flex-1 flex items-start gap-4 cursor-pointer min-w-0"
                                        >
                                            <div className={`p-3 rounded-2xl transition-all ${isActive ? 'bg-white/20 text-white scale-110' : 'bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-indigo-500 shadow-inner'}`}>
                                                <Clock size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className={`text-[9px] font-black uppercase tracking-[0.2em] truncate ${isActive ? 'text-white/80' : 'text-indigo-500'}`}>
                                                        {index === 0 ? 'Punto Reciente' : `Cápsula ${snapshots.length - index}`}
                                                    </span>
                                                    {getTriggerBadge(snap.triggerType, isActive)}
                                                </div>
                                                <div className="text-xl font-serif font-black leading-tight mb-3">{time}</div>
                                                <div className={`flex items-center gap-4 text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-white/70' : 'text-[var(--text-muted)] opacity-60'}`}>
                                                    <span className="flex items-center gap-2"><FileText size={12} /> {words.toLocaleString()}</span>
                                                    <span className="flex items-center gap-2"><Calendar size={12} /> {date}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Delete Button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteAction(snap.id);
                                            }}
                                            className={`p-2 rounded-xl border transition-all ${isActive ? 'border-white/25 hover:bg-white/10 text-white/70 hover:text-white' : 'border-transparent hover:border-red-500/30 hover:bg-red-500/10 text-gray-400 dark:text-gray-500 hover:text-red-500'} self-center shrink-0`}
                                            title="Eliminar punto de control"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        
                                        <ChevronRight 
                                            size={18} 
                                            onClick={() => handleSelectSnapshot(snap)}
                                            className={`shrink-0 self-center cursor-pointer transition-all ${isActive ? 'translate-x-1 opacity-100' : 'opacity-10 group-hover:translate-x-1 group-hover:opacity-40'}`} 
                                        />
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Main Area: Content Preview - Responsive visibility */}
                    <div className={`flex-1 bg-[var(--bg-editor)]/40 border border-[var(--border-main)] rounded-[32px] md:rounded-[40px] flex flex-col overflow-hidden relative min-w-0 ${mobileView === 'preview' ? 'flex' : 'hidden md:flex'}`}>
                        {selectedSnapshot === null ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                <div className="w-16 h-16 rounded-full bg-indigo-500/5 flex items-center justify-center mb-6">
                                    <Info size={32} className="text-indigo-500 opacity-20" />
                                </div>
                                <h3 className="font-serif font-black text-2xl text-[var(--text-main)] mb-2 italic">Inspección</h3>
                                <p className="text-sm text-[var(--text-muted)] max-w-[280px]">Elige un punto para revisar su contenido.</p>
                            </div>
                        ) : (
                            <>
                                {/* Preview Header */}
                                <div className="p-4 md:p-6 border-b border-[var(--border-main)] bg-[var(--bg-app)]/90 backdrop-blur-2xl flex flex-col gap-4 z-10 rounded-t-[40px]">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => setMobileView('list')}
                                                className="p-2 -ml-2 rounded-xl hover:bg-[var(--bg-editor)] md:hidden text-[var(--text-main)] transition-all"
                                            >
                                                <ChevronLeft size={20} />
                                            </button>
                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/5 rounded-full border border-indigo-500/10 text-indigo-500 shrink-0">
                                                <RotateCcw size={12} className="animate-pulse shadow-glow" />
                                                <span className="text-[9px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Modo Inspección</span>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <button
                                                onClick={handleRestoreAction}
                                                className="bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/30 active:scale-95 whitespace-nowrap shrink-0"
                                            >
                                                {activeChapter ? 'Restaurar Capítulo' : 'Restaurar Documento'}
                                            </button>
                                        </div>
                                    </div>
                                    {showDiff && (
                                        <div className="flex flex-wrap gap-3 items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300 bg-white/5 p-3 rounded-2xl border border-white/5">
                                            <div className="flex flex-wrap gap-6 items-center">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></div>
                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Eliminado</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Añadido</span>
                                            </div>
                                            </div>
                                            {diffData.changes.length > 0 && <div className="flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-2 py-1.5">
                                                <span className="px-1 text-[10px] font-black uppercase tracking-wider text-indigo-500">Cambio {selectedChangeIndex + 1} de {diffData.changes.length}</span>
                                                <button type="button" onClick={() => goToChange(-1)} className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-indigo-500/10 hover:text-indigo-500" title="Cambio anterior" aria-label="Ir al cambio anterior"><ChevronUp size={15} /></button>
                                                <button type="button" onClick={() => goToChange(1)} className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-indigo-500/10 hover:text-indigo-500" title="Siguiente cambio" aria-label="Ir al siguiente cambio"><ChevronDown size={15} /></button>
                                            </div>}
                                        </div>
                                    )}
                                </div>
                                <div ref={diffContainerRef} className="flex-1 overflow-y-auto p-6 md:p-12 scrollbar-hide bg-white/5">
                                    <div 
                                        className="font-serif prose prose-base md:prose-lg dark:prose-invert max-w-none prose-p:leading-[1.8] prose-p:text-[var(--text-main)] selection:bg-indigo-500 selection:text-white"
                                        dangerouslySetInnerHTML={{ __html: showDiff ? diffData.html : selectedSnapshot.content }}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmModal 
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={confirmRestore}
                title="¿Confirmar Restauración?"
                message={`Se reemplazará el contenido actual de ${activeChapter ? 'este capítulo' : 'este documento'} por esta versión histórica. Es recomendable crear un backup manual antes si tienes cambios importantes.`}
                confirmText="Sobreescribir y Restaurar"
                type="info"
            />

            <ConfirmModal 
                isOpen={isDeleteConfirmOpen}
                onClose={() => {
                    setIsDeleteConfirmOpen(false);
                    setSnapToDelete(null);
                }}
                onConfirm={confirmDelete}
                title="¿Eliminar Punto de Control?"
                message="Esta acción no se puede deshacer. Se eliminará permanentemente este punto de control local de tu historial."
                confirmText="Eliminar permanentemente"
                type="danger"
                isDanger={true}
            />
        </Modal>
    );
};

export default HistoryModal;
