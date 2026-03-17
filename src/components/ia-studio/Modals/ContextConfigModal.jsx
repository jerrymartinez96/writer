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
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-[var(--border-main)]">
                    <div>
                        <h3 className="text-xl font-bold text-[var(--text-main)] font-serif italic">Configuración de Contexto</h3>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Activa o desactiva qué información del Master Doc y personajes se enviará a la IA.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-editor)] text-[var(--text-muted)] transition-colors"><Edit3 size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* Left Column: Core Items */}
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)] flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-main)]"></div>
                                    Elementos Base
                                </h4>
                                <div className="grid grid-cols-1 gap-3">
                                    <button onClick={() => setIncludeCharacters(!includeCharacters)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${includeCharacters ? 'bg-blue-500/5 border-blue-500/30' : 'bg-[var(--bg-editor)] border-[var(--border-main)]'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${includeCharacters ? 'bg-blue-500 text-white' : 'bg-[var(--accent-soft)] text-[var(--text-muted)]'}`}><Sparkles size={16} /></div>
                                            <span className={`text-sm font-bold ${includeCharacters ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Incluir Personajes</span>
                                        </div>
                                        {includeCharacters ? <CheckSquare size={20} className="text-blue-500" /> : <Square size={20} className="text-[var(--text-muted)]" />}
                                    </button>

                                    {includeCharacters && (
                                        <div className="ml-4 p-4 border-l-2 border-blue-500/20 space-y-3">
                                            <div className="flex flex-wrap gap-2">
                                                {characters.map(c => (
                                                    <button key={c.id} onClick={() => toggleCharacter(c.id)} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${selectedCharacters.includes(c.id) ? 'bg-blue-500 border-blue-600 text-white shadow-md' : 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-blue-500/30'}`}>
                                                        {c.name}
                                                    </button>
                                                ))}
                                            </div>
                                            {selectedCharacters.length > 0 && (
                                                <button onClick={() => setSelectedCharacters([])} className="text-[10px] font-bold text-red-500/70 hover:text-red-500 transition-colors">LIMPIAR CASTING</button>
                                            )}
                                        </div>
                                    )}

                                    <button onClick={() => setIncludeNotasGenerales(!includeNotasGenerales)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${includeNotasGenerales ? 'bg-orange-500/5 border-orange-500/30' : 'bg-[var(--bg-editor)] border-[var(--border-main)]'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${includeNotasGenerales ? 'bg-orange-500 text-white' : 'bg-[var(--accent-soft)] text-[var(--text-muted)]'}`}><Edit3 size={16} /></div>
                                            <span className={`text-sm font-bold ${includeNotasGenerales ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Notas Adicionales del Mundo</span>
                                        </div>
                                        {includeNotasGenerales ? <CheckSquare size={20} className="text-orange-500" /> : <Square size={20} className="text-[var(--text-muted)]" />}
                                    </button>

                                    <button onClick={() => setIncludeEstructura(!includeEstructura)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${includeEstructura ? 'bg-indigo-500/5 border-indigo-500/30' : 'bg-[var(--bg-editor)] border-[var(--border-main)]'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${includeEstructura ? 'bg-indigo-500 text-white' : 'bg-[var(--accent-soft)] text-[var(--text-muted)]'}`}><ShieldCheck size={16} /></div>
                                            <span className={`text-sm font-bold ${includeEstructura ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Estructura (Timeline)</span>
                                        </div>
                                        {includeEstructura ? <CheckSquare size={20} className="text-indigo-500" /> : <Square size={20} className="text-[var(--text-muted)]" />}
                                    </button>

                                    {activeTab === 'review' && (
                                        <button onClick={() => setIncludeContinuityCheck(!includeContinuityCheck)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${includeContinuityCheck ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-[var(--bg-editor)] border-[var(--border-main)]'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${includeContinuityCheck ? 'bg-emerald-500 text-white' : 'bg-[var(--accent-soft)] text-[var(--text-muted)]'}`}><CheckCircle2 size={16} /></div>
                                                <span className={`text-sm font-bold ${includeContinuityCheck ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Check de Continuidad</span>
                                            </div>
                                            {includeContinuityCheck ? <CheckSquare size={20} className="text-emerald-500" /> : <Square size={20} className="text-[var(--text-muted)]" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Master Doc Hierarchy */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)] flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-main)]"></div>
                                Biblia del Mundo (Jerarquía)
                            </h4>
                            <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl p-6 overflow-hidden text-left">
                                {(() => {
                                    const renderTree = (parentId, depth = 0) => {
                                        const items = worldItems.filter(i => i.parentId === parentId);
                                        if (items.length === 0) return null;

                                        return (
                                            <div className={`space-y-1 ${depth > 0 ? 'ml-6 mt-1 border-l border-[var(--border-main)]/50 pl-4' : ''}`}>
                                                {items.map(item => (
                                                    <div key={item.id}>
                                                        <button
                                                            onClick={() => toggleSection(item.id)}
                                                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${includedSections[item.id] ? 'bg-[var(--accent-soft)] text-[var(--accent-main)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-app)]'}`}
                                                        >
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                {item.isCategory ? <ChevronDown size={14} className={includedSections[item.id] ? '' : '-rotate-90'} /> : <div className="w-3.5 h-3.5 bg-current opacity-10 rounded-sm shrink-0"></div>}
                                                                <span className="text-xs font-bold truncate">{item.title}</span>
                                                            </div>
                                                            {includedSections[item.id] ? <CheckSquare size={14} /> : <Square size={14} />}
                                                        </button>
                                                        {includedSections[item.id] && renderTree(item.id, depth + 1)}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    };
                                    const roots = worldItems.filter(i => i.parentId === null);
                                    return roots.length > 0 ? renderTree(null) : <p className="text-[10px] text-[var(--text-muted)] italic">No hay categorías personalizadas.</p>;
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-[var(--bg-editor)] border-t border-[var(--border-main)] flex justify-between items-center">
                    <p className="text-[10px] font-medium text-[var(--text-muted)]">Los cambios se aplican inmediatamente al prompt.</p>
                    <button onClick={onClose} className="px-10 py-3 bg-[var(--accent-main)] text-white font-bold rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all">Guardar Configuración</button>
                </div>
            </div>
        </div>
    );
};

export default ContextConfigModal;
