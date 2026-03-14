import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import { History, Save, RotateCcw, Clock, Cloud, Info, FileText, ChevronRight, Calendar, ChevronLeft, Diff } from 'lucide-react';
import { diff_match_patch } from 'diff-match-patch';

const HistoryModal = ({ isOpen, onClose, editor }) => {
    const { activeChapter, getChapterSnapshots, saveChapterSnapshot } = useData();
    const toast = useToast();
    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [previewContent, setPreviewContent] = useState(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [mobileView, setMobileView] = useState('list'); // 'list' or 'preview'
    const [showDiff, setShowDiff] = useState(false);

    useEffect(() => {
        if (isOpen && activeChapter) {
            loadSnapshots();
        } else {
            setPreviewContent(null);
            setMobileView('list');
            setShowDiff(false);
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
            toast.warning("El capítulo está vacío.");
            return;
        }

        setLoading(true);
        try {
            await saveChapterSnapshot(activeChapter.id, currentContent);
            toast.success("Respaldo creado con éxito");
            await loadSnapshots();
        } catch (error) {
            toast.error("Error al guardar la versión.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSnapshot = (content) => {
        setPreviewContent(content);
        setMobileView('preview');
        // Reset diff when changing snapshot
        setShowDiff(false);
    };

    const handleRestoreAction = () => {
        if (!editor || !previewContent) return;
        setIsConfirmOpen(true);
    };

    const confirmRestore = () => {
        editor.commands.setContent(previewContent || '');
        toast.success("¡Versión restaurada!");
        setPreviewContent(null);
        setMobileView('list');
        onClose();
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

    // Calculate diff between backup (previewContent) and current (activeChapter.content)
    const diffHtml = useMemo(() => {
        if (!showDiff || !previewContent || !activeChapter?.content) return null;

        const dmp = new diff_match_patch();
        // We strip tags for a cleaner comparison and then rebuild a simple representation
        // Comparing raw HTML often breaks tags. For a better UX, we compare text.
        const stripTags = (html) => html.replace(/<p>/g, '\n').replace(/<\/p>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, '').trim();
        
        const textOld = stripTags(previewContent);
        const textNew = stripTags(activeChapter.content);

        const diffs = dmp.diff_main(textOld, textNew);
        dmp.diff_cleanupSemantic(diffs);

        // Convert the diff array to HTML with custom coloring
        return diffs.map(([type, text], i) => {
            const cleanText = text.replace(/\n/g, '<br/>');
            if (type === 0) return `<span class="opacity-100">${cleanText}</span>`;
            if (type === 1) return `<span class="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-0.5 rounded border-b border-emerald-500/50" title="Nuevo en la versión actual">${cleanText}</span>`;
            if (type === -1) return `<span class="bg-rose-500/20 text-rose-600 dark:text-rose-400 line-through px-0.5 rounded border-b border-rose-500/50" title="Eliminado en la versión actual">${cleanText}</span>`;
            return cleanText;
        }).join('');
    }, [showDiff, previewContent, activeChapter?.content]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Historial del Capítulo" size="xl">
            <div className="flex flex-col h-[80vh] min-h-[500px] p-4 md:p-8">
                
                {/* Header Section - Hide on mobile preview */}
                <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-[var(--bg-editor)] p-5 md:p-6 rounded-3xl border border-[var(--border-main)] border-dashed ${mobileView === 'preview' ? 'hidden md:flex' : ''}`}>
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                            <History size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <h3 className="font-serif font-black text-lg md:text-xl text-[var(--text-main)] italic leading-none md:leading-normal">Control de Versiones</h3>
                            <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] opacity-60 mt-1">
                                {snapshots.length} de 5 espacios utilizados
                            </p>
                        </div>
                    </div>
                    
                    <button
                        onClick={handleCreateSnapshot}
                        disabled={loading}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                    >
                        <Save size={16} />
                        Fijar Punto de Control
                    </button>
                </div>

                <div className="flex flex-1 min-h-0 gap-8 relative overflow-hidden">
                    {/* Left Sidebar: Timeline - Responsive visibility */}
                    <div className={`w-full md:w-[320px] flex flex-col gap-3 overflow-y-auto pr-2 scrollbar-hide shrink-0 ${mobileView === 'preview' ? 'hidden md:flex' : 'flex'}`}>
                        {loading && snapshots.length === 0 ? (
                            <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
                        ) : snapshots.length === 0 ? (
                            <div className="p-8 text-center text-[10px] font-black uppercase text-[var(--text-muted)] opacity-40 border border-dashed border-[var(--border-main)] rounded-2xl">
                                Sin registros
                            </div>
                        ) : (
                            snapshots.map((snap, index) => {
                                const isActive = previewContent === snap.content;
                                const { date, time } = formatDate(snap.createdAt);
                                const words = getWordCount(snap.content);
                                
                                return (
                                    <button
                                        key={snap.id}
                                        onClick={() => handleSelectSnapshot(snap.content)}
                                        className={`group relative flex items-start gap-4 p-4 rounded-3xl border transition-all duration-300 text-left ${isActive ? 'bg-indigo-500 border-indigo-500 text-white shadow-xl shadow-indigo-500/20' : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-indigo-500/50'}`}
                                    >
                                        <div className={`p-2.5 rounded-xl transition-colors ${isActive ? 'bg-white/20 text-white' : 'bg-[var(--bg-editor)] text-[var(--text-muted)]'}`}>
                                            <Clock size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className={`text-[9px] font-black uppercase tracking-widest truncate ${isActive ? 'text-white/80' : 'text-indigo-500'}`}>
                                                    {index === 0 ? 'Reciente' : `Versión ${snapshots.length - index}`}
                                                </span>
                                                <span className={`text-[8px] md:text-[9px] font-mono ${isActive ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>{date}</span>
                                            </div>
                                            <div className="text-base md:text-lg font-serif font-black leading-none mb-2">{time}</div>
                                            <div className={`flex items-center gap-3 text-[10px] font-bold ${isActive ? 'text-white/80' : 'text-[var(--text-muted)] opacity-60'}`}>
                                                <span className="flex items-center gap-1"><FileText size={10} /> {words.toLocaleString()}</span>
                                                <span className="flex items-center gap-1 md:hidden lg:inline-flex"><Calendar size={10} /> {date}</span>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className={`shrink-0 self-center transition-transform ${isActive ? 'translate-x-1' : 'opacity-20'}`} />
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Main Area: Content Preview - Responsive visibility */}
                    <div className={`flex-1 bg-[var(--bg-editor)]/40 border border-[var(--border-main)] rounded-[32px] md:rounded-[40px] flex flex-col overflow-hidden relative min-w-0 ${mobileView === 'preview' ? 'flex' : 'hidden md:flex'}`}>
                        {previewContent === null ? (
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
                                <div className="p-4 md:p-6 border-b border-[var(--border-main)] bg-[var(--bg-app)]/80 backdrop-blur-xl flex flex-col gap-4 z-10 rounded-t-[32px] md:rounded-t-[40px]">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1 md:gap-3">
                                            <button 
                                                onClick={() => setMobileView('list')}
                                                className="p-1.5 -ml-1 rounded-full hover:bg-[var(--bg-editor)] md:hidden text-[var(--text-main)] transition-colors"
                                            >
                                                <ChevronLeft size={18} />
                                            </button>
                                            <div className="flex items-center gap-2 text-emerald-500">
                                                <RotateCcw size={14} className="hidden sm:block" />
                                                <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest hidden xs:block">Inspección</span>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-1.5 md:gap-3">
                                            {/* Diff Toggle Toggle - Balanced for mobile */}
                                            <button
                                                onClick={() => setShowDiff(!showDiff)}
                                                className={`flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2 rounded-xl border text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${showDiff ? 'bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-transparent border-[var(--border-main)] text-[var(--text-muted)] hover:border-indigo-500/50 hover:text-indigo-500'}`}
                                            >
                                                <span className="whitespace-nowrap">{showDiff ? (window.innerWidth < 400 ? 'Comparar' : 'Comparando') : (window.innerWidth < 400 ? 'Diff' : 'Diferencias')}</span>
                                            </button>

                                            <button
                                                onClick={handleRestoreAction}
                                                className="bg-emerald-500 text-white px-3 py-1.5 md:px-6 md:py-2.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
                                            >
                                                Restaurar
                                            </button>
                                        </div>
                                    </div>
                                    {showDiff && (
                                        <div className="flex gap-4 items-center animate-in fade-in slide-in-from-top-1 duration-200">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                                                <span className="text-[8px] font-black uppercase opacity-60">Eliminado en actual</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                <span className="text-[8px] font-black uppercase opacity-60">Añadido en actual</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 md:p-12 scrollbar-hide bg-white/5">
                                    <div 
                                        className="font-serif prose prose-base md:prose-lg dark:prose-invert max-w-none prose-p:leading-[1.8] prose-p:text-[var(--text-main)] selection:bg-indigo-500 selection:text-white"
                                        dangerouslySetInnerHTML={{ __html: showDiff ? diffHtml : previewContent }}
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
                message={`Se reemplazará el contenido actual del capítulo por esta versión histórica. Es recomendable crear un backup manual antes si tienes cambios importantes.`}
                confirmText="Sobreescribir y Restaurar"
                type="info"
            />
        </Modal>
    );
};

export default HistoryModal;
