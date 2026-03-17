import { ChevronDown, Sparkles, Edit3, CheckCircle2, ShieldCheck } from 'lucide-react';

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
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-[var(--border-main)]">
                    <div>
                        <h3 className="text-xl font-bold text-[var(--text-main)] font-serif italic">Mosaico de Capítulos</h3>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Selecciona el capítulo sobre el cual quieres que Gemini trabaje.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-editor)] text-[var(--text-muted)] transition-colors"><ChevronDown size={20} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-hide bg-[var(--bg-editor)]/30">
                    <div className="space-y-10">
                        {/* Option: Autogeneration / All Chapters (Only for Generation/Review) */}
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
                                    className={`group relative overflow-hidden px-8 py-5 rounded-2xl border transition-all flex items-center gap-4 ${(activeTab === 'generation' ? !selectedChapterId : !selectedReviewChapterId) ? `bg-[var(--accent-main)] border-[var(--accent-main)] text-white shadow-xl shadow-[var(--accent-main)]/20` : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-[var(--accent-main)] text-[var(--text-main)]'}`}
                                >
                                    <Sparkles size={24} className={(activeTab === 'generation' ? !selectedChapterId : !selectedReviewChapterId) ? 'text-white' : 'text-[var(--accent-main)]'} />
                                    <div className="text-left">
                                        <div className="text-[10px] uppercase font-bold tracking-widest opacity-70">Modo Directo</div>
                                        <div className="font-bold text-lg font-serif">
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
                                    <div key={vol.id} className="space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--border-main)]"></div>
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] flex items-center gap-2">
                                                {sourceLabels[vol.id] || ''}{vol.title}
                                            </h4>
                                            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--border-main)]"></div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

                                                const accentColor = activeTab === 'refine' ? 'blue-500' : activeTab === 'review' ? 'orange-500' : '[var(--accent-main)]';
                                                const softBg = activeTab === 'refine' ? 'bg-blue-500/10' : activeTab === 'review' ? 'bg-orange-500/10' : 'bg-[var(--accent-soft)]';

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
                                                        className={`group relative p-5 rounded-2xl border transition-all text-left flex flex-col justify-between h-32 ${isSelected ? `bg-${accentColor.replace('[', '').replace(']', '')} border-${accentColor.replace('[', '').replace(']', '')} shadow-xl` : `bg-[var(--bg-app)] border-[var(--border-main)] hover:border-${accentColor.replace('[', '').replace(']', '')}/50 hover:translate-y--1`} ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                                                        style={isSelected && (accentColor === '[var(--accent-main)]') ? { backgroundColor: 'var(--accent-main)', borderColor: 'var(--accent-main)' } : {}}
                                                    >
                                                        <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 flex justify-between items-center ${isSelected ? 'text-white/70' : `text-${accentColor.replace('[', '').replace(']', '')}`}`} style={!isSelected && (accentColor === '[var(--accent-main)]') ? { color: 'var(--accent-main)' } : {}}>
                                                            <span>{sourceLabels[c.id]?.replace(': ', '') || 'Capítulo'}</span>
                                                            {isFinalized && <ShieldCheck size={12} />}
                                                        </div>
                                                        <div className={`font-bold text-sm font-serif line-clamp-2 leading-tight ${isSelected ? 'text-white' : 'text-[var(--text-main)]'}`}>
                                                            {c.title}
                                                        </div>
                                                        <div className="mt-auto flex justify-end">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isSelected ? 'bg-white/20 text-white' : `${softBg} text-${accentColor.replace('[', '').replace(']', '')}`}`} style={!isSelected && (accentColor === '[var(--accent-main)]') ? { color: 'var(--accent-main)' } : {}}>
                                                                {activeTab === 'refine' ? <Edit3 size={14} /> : activeTab === 'review' ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
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
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--border-main)]"></div>
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Capítulos Sueltos</h4>
                                        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--border-main)]"></div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

                                            const accentColor = activeTab === 'refine' ? 'blue-500' : activeTab === 'review' ? 'orange-500' : '[var(--accent-main)]';
                                            const softBg = activeTab === 'refine' ? 'bg-blue-500/10' : activeTab === 'review' ? 'bg-orange-500/10' : 'bg-[var(--accent-soft)]';

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
                                                    className={`group relative p-5 rounded-2xl border transition-all text-left flex flex-col justify-between h-32 ${isSelected ? `bg-${accentColor.replace('[', '').replace(']', '')} border-${accentColor.replace('[', '').replace(']', '')} shadow-xl` : `bg-[var(--bg-app)] border-[var(--border-main)] hover:border-${accentColor.replace('[', '').replace(']', '')}/50`} ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                                                    style={isSelected && (accentColor === '[var(--accent-main)]') ? { backgroundColor: 'var(--accent-main)', borderColor: 'var(--accent-main)' } : {}}
                                                >
                                                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 flex justify-between items-center ${isSelected ? 'text-white/70' : `text-${accentColor.replace('[', '').replace(']', '')}`}`} style={!isSelected && (accentColor === '[var(--accent-main)]') ? { color: 'var(--accent-main)' } : {}}>
                                                        <span>{sourceLabels[c.id]?.replace(': ', '') || 'Capítulo'}</span>
                                                        {isFinalized && <ShieldCheck size={12} />}
                                                    </div>
                                                    <div className={`font-bold text-sm font-serif line-clamp-2 leading-tight ${isSelected ? 'text-white' : 'text-[var(--text-main)]'}`}>
                                                        {c.title}
                                                    </div>
                                                    <div className="mt-auto flex justify-end">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-white/20 text-white' : `${softBg} text-${accentColor.replace('[', '').replace(']', '')}`}`} style={!isSelected && (accentColor === '[var(--accent-main)]') ? { color: 'var(--accent-main)' } : {}}>
                                                            {activeTab === 'refine' ? <Edit3 size={14} /> : activeTab === 'review' ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
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
                <div className="p-6 bg-[var(--bg-editor)] border-t border-[var(--border-main)] flex justify-end">
                    <button onClick={onClose} className="px-8 py-3 bg-[var(--accent-main)] text-white font-bold rounded-2xl shadow-lg hover:scale-[1.02] transition-transform">Cerrar</button>
                </div>
            </div>
        </div>
    );
};

export default ChapterSelectionModal;
