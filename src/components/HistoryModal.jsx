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
                <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-indigo-500/5 p-6 rounded-[32px] border border-indigo-500/10 shadow-inner ${mobileView === 'preview' ? 'hidden md:flex' : ''}`}>
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/20">
                            <History size={28} />
                        </div>
                        <div>
                            <h3 className="font-serif font-black text-2xl text-[var(--text-main)] italic leading-none">Cápsulas de Tiempo</h3>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mt-2">
                                {snapshots.length} de 5 espacios de memoria activos
                            </p>
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
                                        className={`group relative flex items-start gap-4 p-5 rounded-[32px] border transition-all duration-500 text-left ${isActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xl shadow-indigo-600/30' : 'bg-[var(--bg-editor)] border-[var(--border-main)] hover:border-indigo-500/50 hover:bg-[var(--bg-app)]'}`}
                                    >
                                        <div className={`p-3 rounded-2xl transition-all ${isActive ? 'bg-white/20 text-white scale-110' : 'bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-indigo-500 shadow-inner'}`}>
                                            <Clock size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`text-[9px] font-black uppercase tracking-[0.2em] truncate ${isActive ? 'text-white/80' : 'text-indigo-500'}`}>
                                                    {index === 0 ? 'Punto Reciente' : `Cápsula ${snapshots.length - index}`}
                                                </span>
                                            </div>
                                            <div className="text-xl font-serif font-black leading-tight mb-3">{time}</div>
                                            <div className={`flex items-center gap-4 text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-white/70' : 'text-[var(--text-muted)] opacity-60'}`}>
                                                <span className="flex items-center gap-2"><FileText size={12} /> {words.toLocaleString()}</span>
                                                <span className="flex items-center gap-2"><Calendar size={12} /> {date}</span>
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className={`shrink-0 self-center transition-all ${isActive ? 'translate-x-1 opacity-100' : 'opacity-10 opacity-100 group-hover:translate-x-1 group-hover:opacity-40'}`} />
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
                                <div className="p-5 md:p-8 border-b border-[var(--border-main)] bg-[var(--bg-app)]/90 backdrop-blur-2xl flex flex-col gap-5 z-10 rounded-t-[40px]">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <button 
                                                onClick={() => setMobileView('list')}
                                                className="p-2 -ml-2 rounded-xl hover:bg-[var(--bg-editor)] md:hidden text-[var(--text-main)] transition-all"
                                            >
                                                <ChevronLeft size={20} />
                                            </button>
                                            <div className="flex items-center gap-3 px-4 py-2 bg-indigo-500/5 rounded-full border border-indigo-500/10 text-indigo-500">
                                                <RotateCcw size={14} className="animate-pulse shadow-glow" />
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap">Modo Inspección</span>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setShowDiff(!showDiff)}
                                                className={`flex items-center gap-3 px-5 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-[0.2em] transition-all ${showDiff ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-600/30' : 'bg-transparent border-[var(--border-main)] text-[var(--text-muted)] hover:border-indigo-500 hover:text-indigo-600'}`}
                                            >
                                                <Diff size={16} />
                                                <span className="hidden sm:inline">{showDiff ? 'Ocultar Cambios' : 'Ver Cambios'}</span>
                                            </button>

                                            <button
                                                onClick={handleRestoreAction}
                                                className="bg-emerald-500 text-white px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/30 active:scale-95 whitespace-nowrap"
                                            >
                                                Restaurar Capítulo
                                            </button>
                                        </div>
                                    </div>
                                    {showDiff && (
                                        <div className="flex gap-6 items-center animate-in fade-in slide-in-from-top-2 duration-300 bg-white/5 p-3 rounded-2xl border border-white/5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></div>
                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Eliminado</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Añadido</span>
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
