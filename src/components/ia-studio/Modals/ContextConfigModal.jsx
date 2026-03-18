import { Edit3, Sparkles, CheckSquare, Square, ShieldCheck, CheckCircle2, ChevronDown } from 'lucide-react';

const ContextConfigModal = ({ 
    isOpen, 
    onClose, 
    activeTab,
    includeCharacters, 
    setIncludeCharacters, 
    characters, 
    selectedCharacters, 
    toggleCharacter, 
    setSelectedCharacters,
    includeNotasGenerales, 
    setIncludeNotasGenerales,
    includeEstructura, 
    setIncludeEstructura,
    includeContinuityCheck, 
    setIncludeContinuityCheck,
    worldItems,
    includedSections,
    toggleSection
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>
            <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] shadow-[0_30px_100px_rgba(0,0,0,0.5)] w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between p-8 border-b border-[var(--border-main)] bg-[var(--bg-editor)]/50">
                    <div>
                        <h3 className="text-2xl font-black text-[var(--text-main)] font-serif italic tracking-tight">Configuración de Contexto</h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] mt-2 opacity-60">Controla la información enviada al motor de IA</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-muted)] hover:text-indigo-500 hover:border-indigo-500/30 transition-all hover:shadow-lg active:scale-95"
                    >
                        <Edit3 size={22} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 scrollbar-hide bg-indigo-500/[0.01]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {/* Left Column: Core Items */}
                        <div className="space-y-10">
                            <div className="space-y-6">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-main)] flex items-center gap-3">
                                    <Sparkles size={14} />
                                    Elementos del Sistema
                                </h4>
                                <div className="grid grid-cols-1 gap-4">
                                    <button onClick={() => setIncludeCharacters(!includeCharacters)} className={`flex items-center justify-between p-5 rounded-[24px] border-2 transition-all ${includeCharacters ? 'bg-indigo-600/5 border-indigo-500/30 shadow-inner' : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-indigo-500/30'}`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-xl transition-colors ${includeCharacters ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-[var(--bg-editor)] text-[var(--text-muted)]'}`}><Sparkles size={18} /></div>
                                            <div className="text-left">
                                                <span className={`block text-sm font-black italic font-serif ${includeCharacters ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Incluir Personajes</span>
                                                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] opacity-60">Fichas de descripción y rol</span>
                                            </div>
                                        </div>
                                        {includeCharacters ? <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center"><CheckSquare size={16} className="text-white" /></div> : <Square size={20} className="text-[var(--text-muted)] opacity-30" />}
                                    </button>

                                    {includeCharacters && (
                                        <div className="ml-6 p-6 bg-indigo-500/[0.03] border-l-2 border-indigo-500/30 rounded-r-2xl space-y-4 animate-in slide-in-from-left-2 duration-300">
                                            <div className="flex flex-wrap gap-2">
                                                {characters.map(c => {
                                                    const isSel = selectedCharacters.includes(c.id);
                                                    return (
                                                        <button key={c.id} onClick={() => toggleCharacter(c.id)} className={`px-4 py-2 rounded-xl text-[10px] font-black border uppercase tracking-widest transition-all ${isSel ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-indigo-500/30'}`}>
                                                            {c.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {selectedCharacters.length > 0 && (
                                                <button onClick={() => setSelectedCharacters([])} className="text-[10px] font-black italic text-red-500/70 hover:text-red-500 transition-colors flex items-center gap-2">
                                                    <div className="w-1 h-1 bg-current rounded-full"></div>
                                                    LIMPIAR CASTING
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    <button onClick={() => setIncludeNotasGenerales(!includeNotasGenerales)} className={`flex items-center justify-between p-5 rounded-[24px] border-2 transition-all ${includeNotasGenerales ? 'bg-orange-600/5 border-orange-500/30 shadow-inner' : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-orange-500/30'}`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-xl transition-colors ${includeNotasGenerales ? 'bg-orange-500 text-white shadow-lg shadow-orange-600/20' : 'bg-[var(--bg-editor)] text-[var(--text-muted)]'}`}><Edit3 size={18} /></div>
                                            <div className="text-left">
                                                <span className={`block text-sm font-black italic font-serif ${includeNotasGenerales ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Notas Globales</span>
                                                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] opacity-60">Contexto general del mundo</span>
                                            </div>
                                        </div>
                                        {includeNotasGenerales ? <div className="w-6 h-6 bg-orange-500 rounded-lg flex items-center justify-center"><CheckSquare size={16} className="text-white" /></div> : <Square size={20} className="text-[var(--text-muted)] opacity-30" />}
                                    </button>

                                    <button onClick={() => setIncludeEstructura(!includeEstructura)} className={`flex items-center justify-between p-5 rounded-[24px] border-2 transition-all ${includeEstructura ? 'bg-blue-600/5 border-blue-500/30 shadow-inner' : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-blue-500/30'}`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-xl transition-colors ${includeEstructura ? 'bg-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-[var(--bg-editor)] text-[var(--text-muted)]'}`}><ShieldCheck size={18} /></div>
                                            <div className="text-left">
                                                <span className={`block text-sm font-black italic font-serif ${includeEstructura ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Línea de Vida (Estructura)</span>
                                                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] opacity-60">Sucesión de capítulos y resúmenes</span>
                                            </div>
                                        </div>
                                        {includeEstructura ? <div className="w-6 h-6 bg-blue-500 rounded-lg flex items-center justify-center"><CheckSquare size={16} className="text-white" /></div> : <Square size={20} className="text-[var(--text-muted)] opacity-30" />}
                                    </button>

                                    {activeTab === 'review' && (
                                        <button onClick={() => setIncludeContinuityCheck(!includeContinuityCheck)} className={`flex items-center justify-between p-5 rounded-[24px] border-2 transition-all ${includeContinuityCheck ? 'bg-emerald-600/5 border-emerald-500/30 shadow-inner' : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-emerald-500/30'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`p-3 rounded-xl transition-colors ${includeContinuityCheck ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-600/20' : 'bg-[var(--bg-editor)] text-[var(--text-muted)]'}`}><CheckCircle2 size={18} /></div>
                                                <div className="text-left">
                                                    <span className={`block text-sm font-black italic font-serif ${includeContinuityCheck ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Motor de Continuidad</span>
                                                    <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] opacity-60">Detección proactiva de incoherencias</span>
                                                </div>
                                            </div>
                                            {includeContinuityCheck ? <div className="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center"><CheckSquare size={16} className="text-white" /></div> : <Square size={20} className="text-[var(--text-muted)] opacity-30" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Master Doc Hierarchy */}
                        <div className="space-y-6">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-main)] flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-main)]"></div>
                                Biblia del Mundo (Jerarquía)
                            </h4>
                            <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-[32px] p-8 overflow-hidden text-left shadow-inner">
                                {(() => {
                                    const renderTree = (parentId, depth = 0) => {
                                        const items = worldItems.filter(i => i.parentId === parentId);
                                        if (items.length === 0) return null;

                                        return (
                                            <div className={`space-y-2 ${depth > 0 ? 'ml-6 mt-2 border-l-2 border-indigo-500/10 pl-5' : ''}`}>
                                                {items.map(item => {
                                                    const isInc = includedSections[item.id];
                                                    return (
                                                        <div key={item.id}>
                                                            <button
                                                                onClick={() => toggleSection(item.id)}
                                                                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${isInc ? 'bg-indigo-600/10 text-indigo-600 shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-app)]'}`}
                                                            >
                                                                <div className="flex items-center gap-3 overflow-hidden">
                                                                    {item.isCategory ? <ChevronDown size={14} className={`transition-transform duration-300 ${isInc ? '' : '-rotate-90'}`} /> : <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isInc ? 'bg-indigo-500' : 'bg-[var(--text-muted)]/30'}`}></div>}
                                                                    <span className={`text-xs font-black truncate ${isInc ? 'text-indigo-700' : ''}`}>{item.title}</span>
                                                                </div>
                                                                {isInc ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} className="opacity-20" />}
                                                            </button>
                                                            {isInc && renderTree(item.id, depth + 1)}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    };
                                    const roots = worldItems.filter(i => i.parentId === null);
                                    return roots.length > 0 ? renderTree(null) : <p className="text-[10px] font-black italic text-[var(--text-muted)] opacity-50 text-center py-10">No hay categorías personalizadas definidas.</p>;
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8 bg-[var(--bg-editor)]/90 backdrop-blur-md border-t border-[var(--border-main)] flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-50">Los cambios se inyectan en tiempo real al prompt</p>
                    <button 
                        onClick={onClose} 
                        className="px-12 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-indigo-600/20 transition-all hover:scale-[1.05] active:scale-95 flex items-center gap-3"
                    >
                        Guardar Configuración
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContextConfigModal;
