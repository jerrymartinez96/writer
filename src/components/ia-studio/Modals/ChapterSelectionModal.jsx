import { ChevronDown, Sparkles, Edit3, CheckCircle2, ShieldCheck, Layers } from 'lucide-react';

const ChapterSelectionModal = ({ 
    isOpen, 
    onClose, 
    activeTab, 
    reviewSelectionType, 
    chapters, 
    worldItems, 
    chapLabels, 
    estLabels, 
    selectedChapterId, 
    setSelectedChapterId,
    selectedRefineChapterId, 
    setSelectedRefineChapterId,
    selectedReviewChapterId, 
    setSelectedReviewChapterId,
    reviewStartId, 
    setReviewStartId,
    reviewEndId, 
    setReviewEndId,
    mainTab,
    setLiveSelectedChapterId
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>
            <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] shadow-[0_30px_100px_rgba(0,0,0,0.5)] w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between p-8 border-b border-[var(--border-main)] bg-[var(--bg-editor)]/50">
                    <div>
                        <h3 className="text-2xl font-black text-[var(--text-main)] font-serif italic tracking-tight">Mosaico de Capítulos</h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] mt-2 opacity-60">Selecciona el objetivo de ejecución para la IA</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-muted)] hover:text-indigo-500 hover:border-indigo-500/30 transition-all hover:shadow-lg active:scale-95"
                    >
                        <ChevronDown size={22} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 scrollbar-hide bg-indigo-500/[0.01]">
                    <div className="space-y-12">
                        {/* Option: Autogeneration / All Chapters */}
                        {(activeTab === 'generation' || activeTab === 'review') && reviewSelectionType === 'single' && (
                            <div className="flex justify-center">
                                <button
                                    onClick={() => {
                                        if (activeTab === 'generation') setSelectedChapterId('');
                                        else {
                                            setSelectedReviewChapterId('');
                                            setReviewStartId('');
                                            setReviewEndId('');
                                        }
                                        onClose();
                                    }}
                                    className={`group relative overflow-hidden px-10 py-6 rounded-3xl border-2 transition-all flex items-center gap-6 ${(activeTab === 'generation' ? !selectedChapterId : !selectedReviewChapterId) ? `bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-600/20 scale-105` : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-indigo-500/50 text-[var(--text-main)] hover:-translate-y-1'}`}
                                >
                                    <div className={`p-4 rounded-2xl transition-all ${(activeTab === 'generation' ? !selectedChapterId : !selectedReviewChapterId) ? 'bg-white/20' : 'bg-indigo-500/10'}`}>
                                        <Sparkles size={28} className={(activeTab === 'generation' ? !selectedChapterId : !selectedReviewChapterId) ? 'text-white' : 'text-indigo-500'} />
                                    </div>
                                    <div className="text-left">
                                        <div className={`text-[10px] uppercase font-black tracking-[0.2em] mb-1 ${(activeTab === 'generation' ? !selectedChapterId : !selectedReviewChapterId) ? 'text-white/60' : 'text-indigo-500'}`}>Modo Global</div>
                                        <div className="font-black text-xl font-serif italic">
                                            {activeTab === 'generation' ? "Autogeneración Libre" : "Todos los borradores"}
                                        </div>
                                    </div>
                                </button>
                            </div>
                        )}

                        {/* Volumes and Chapters Mosaic */}
                        {(() => {
                            const sourceChapters = (activeTab === 'refine' || activeTab === 'review') ? chapters : worldItems;
                            const sourceLabels = (activeTab === 'refine' || activeTab === 'review') ? chapLabels : estLabels;

                            const volumes = sourceChapters.filter(w => (activeTab === 'refine' || activeTab === 'review') ? w.isVolume : (w.parentId === 'system_estructura' && w.isCategory));

                            return volumes.map(vol => {
                                const children = sourceChapters.filter(w => w.parentId === vol.id && ((activeTab === 'refine' || activeTab === 'review') ? !w.isVolume : true));
                                if (children.length === 0) return null;

                                return (
                                    <div key={vol.id} className="space-y-6">
                                        <div className="flex items-center gap-6 px-4">
                                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border-main)] to-transparent"></div>
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-3 bg-[var(--bg-app)] px-4 py-1.5 rounded-full border border-[var(--border-main)]/50 shadow-sm">
                                                <Layers size={14} className="text-indigo-500" />
                                                {sourceLabels[vol.id] || ''}{vol.title}
                                            </h4>
                                            <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[var(--border-main)] to-transparent"></div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                            {children.map(c => {
                                                const isSelected = activeTab === 'generation'
                                                    ? selectedChapterId === c.id
                                                    : activeTab === 'refine'
                                                        ? selectedRefineChapterId === c.id
                                                        : reviewSelectionType === 'single'
                                                            ? selectedReviewChapterId === c.id
                                                            : reviewSelectionType === 'start'
                                                                ? reviewStartId === c.id
                                                                : reviewEndId === c.id;

                                                const isFinalized = (activeTab === 'refine' || activeTab === 'review') && c.status === 'Finalizado';
                                                const isDisabled = activeTab === 'refine' && isFinalized;

                                                const colorClass = activeTab === 'refine' ? 'blue' : activeTab === 'review' ? 'orange' : 'indigo';
                                                
                                                return (
                                                    <button
                                                        key={c.id}
                                                        disabled={isDisabled}
                                                        onClick={() => {
                                                            if (mainTab === 'live') {
                                                                setLiveSelectedChapterId(c.id);
                                                            } else if (activeTab === 'generation') {
                                                                setSelectedChapterId(c.id);
                                                            } else if (activeTab === 'refine') {
                                                                setSelectedRefineChapterId(c.id);
                                                            } else {
                                                                if (reviewSelectionType === 'single') {
                                                                    setSelectedReviewChapterId(c.id);
                                                                    setReviewStartId('');
                                                                    setReviewEndId('');
                                                                } else if (reviewSelectionType === 'start') {
                                                                    setReviewStartId(c.id);
                                                                    setSelectedReviewChapterId('');
                                                                } else {
                                                                    setReviewEndId(c.id);
                                                                    setSelectedReviewChapterId('');
                                                                }
                                                            }
                                                            onClose();
                                                        }}
                                                        className={`group relative p-6 rounded-[24px] border-2 transition-all text-left flex flex-col justify-between h-40 ${isSelected ? `bg-${colorClass}-600 border-${colorClass}-500 shadow-xl shadow-${colorClass}-600/20 scale-[1.02] z-10` : `bg-[var(--bg-app)] border-[var(--border-main)] hover:border-${colorClass}-500/50 hover:bg-${colorClass}-500/[0.03] hover:-translate-y-1`} ${isDisabled ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
                                                    >
                                                        <div>
                                                            <div className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 flex justify-between items-center ${isSelected ? 'text-white/70' : `text-${colorClass}-500`}`}>
                                                                <span>{sourceLabels[c.id]?.replace(': ', '') || 'Capítulo'}</span>
                                                                {isFinalized && <ShieldCheck size={14} />}
                                                            </div>
                                                            <div className={`font-black text-sm font-serif line-clamp-2 leading-snug tracking-tight ${isSelected ? 'text-white' : 'text-[var(--text-main)] group-hover:text-${colorClass}-600'}`}>
                                                                {c.title}
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end">
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-white/20 text-white' : `bg-${colorClass}-500/10 text-${colorClass}-500 group-hover:scale-110 shadow-sm`}`}>
                                                                {activeTab === 'refine' ? <Edit3 size={18} /> : activeTab === 'review' ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            });
                        })()}

                        {/* Standalone Chapters Mosaic */}
                        {(() => {
                            const sourceChapters = (activeTab === 'refine' || activeTab === 'review') ? chapters : worldItems;
                            const sourceLabels = (activeTab === 'refine' || activeTab === 'review') ? chapLabels : estLabels;

                            const standalone = sourceChapters.filter(w => (activeTab === 'refine' || activeTab === 'review') ? (!w.parentId && !w.isVolume) : (w.parentId === 'system_estructura' && !w.isCategory));
                            if (standalone.length === 0) return null;

                            return (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-6 px-4">
                                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border-main)] to-transparent"></div>
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-3 bg-[var(--bg-app)] px-4 py-1.5 rounded-full border border-[var(--border-main)]/50 shadow-sm">Capítulos Sueltos</h4>
                                        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[var(--border-main)] to-transparent"></div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                        {standalone.map(c => {
                                            const isSelected = activeTab === 'generation'
                                                ? selectedChapterId === c.id
                                                : activeTab === 'refine'
                                                    ? selectedRefineChapterId === c.id
                                                    : reviewSelectionType === 'single'
                                                        ? selectedReviewChapterId === c.id
                                                        : reviewSelectionType === 'start'
                                                            ? reviewStartId === c.id
                                                            : reviewEndId === c.id;

                                            const isFinalized = (activeTab === 'refine' || activeTab === 'review') && c.status === 'Finalizado';
                                            const isDisabled = activeTab === 'refine' && isFinalized;

                                            const colorClass = activeTab === 'refine' ? 'blue' : activeTab === 'review' ? 'orange' : 'indigo';
                                            
                                            return (
                                                <button
                                                    key={c.id}
                                                    disabled={isDisabled}
                                                    onClick={() => {
                                                        if (mainTab === 'live') {
                                                            setLiveSelectedChapterId(c.id);
                                                        } else if (activeTab === 'generation') {
                                                            setSelectedChapterId(c.id);
                                                        } else if (activeTab === 'refine') {
                                                            setSelectedRefineChapterId(c.id);
                                                        } else {
                                                            if (reviewSelectionType === 'single') {
                                                                setSelectedReviewChapterId(c.id);
                                                                setReviewStartId('');
                                                                setReviewEndId('');
                                                            } else if (reviewSelectionType === 'start') {
                                                                setReviewStartId(c.id);
                                                                setSelectedReviewChapterId('');
                                                            } else {
                                                                setReviewEndId(c.id);
                                                                setSelectedReviewChapterId('');
                                                            }
                                                        }
                                                        onClose();
                                                    }}
                                                    className={`group relative p-6 rounded-[24px] border-2 transition-all text-left flex flex-col justify-between h-40 ${isSelected ? `bg-${colorClass}-600 border-${colorClass}-500 shadow-xl shadow-${colorClass}-600/20 scale-[1.02] z-10` : `bg-[var(--bg-app)] border-[var(--border-main)] hover:border-${colorClass}-500/50 hover:bg-${colorClass}-500/[0.03] hover:-translate-y-1`} ${isDisabled ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
                                                >
                                                    <div>
                                                        <div className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 flex justify-between items-center ${isSelected ? 'text-white/70' : `text-${colorClass}-500`}`}>
                                                            <span>{sourceLabels[c.id]?.replace(': ', '') || 'Capítulo'}</span>
                                                            {isFinalized && <ShieldCheck size={14} />}
                                                        </div>
                                                        <div className={`font-black text-sm font-serif line-clamp-2 leading-snug tracking-tight ${isSelected ? 'text-white' : 'text-[var(--text-main)] group-hover:text-${colorClass}-600'}`}>
                                                            {c.title}
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-end">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-white/20 text-white' : `bg-${colorClass}-500/10 text-${colorClass}-500 group-hover:scale-110 shadow-sm`}`}>
                                                            {activeTab === 'refine' ? <Edit3 size={18} /> : activeTab === 'review' ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
                <div className="p-8 bg-[var(--bg-editor)]/80 backdrop-blur-md border-t border-[var(--border-main)] flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-50">Explora la jerarquía de tu manuscrito</p>
                    <button 
                        onClick={onClose} 
                        className="px-12 py-4 bg-[var(--text-main)] text-[var(--bg-app)] font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl shadow-xl transition-all hover:scale-[1.05] active:scale-95"
                    >
                        Cerrar Mosaico
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChapterSelectionModal;
