import { ShieldCheck, CheckCircle2 } from 'lucide-react';

const AIPersonalityModal = ({ isOpen, onClose, aiRoles, setAiRoles, AI_ROLES }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>
            <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] shadow-[0_30px_100px_rgba(0,0,0,0.5)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between p-8 border-b border-[var(--border-main)] bg-[var(--bg-editor)]/50">
                    <div>
                        <h3 className="text-2xl font-black text-[var(--text-main)] font-serif italic tracking-tight">Personalidad de la IA</h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] mt-2 opacity-60">Selecciona el perfil de ejecución para este prompt</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-muted)] hover:text-indigo-500 hover:border-indigo-500/30 transition-all hover:shadow-lg active:scale-95"
                    >
                        <ShieldCheck size={22} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 scrollbar-hide bg-indigo-500/[0.02]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {AI_ROLES.map((role) => {
                            const isSelected = aiRoles.includes(role.id);
                            return (
                                <button
                                    key={role.id}
                                    onClick={() => {
                                        setAiRoles(prev =>
                                            prev.includes(role.id)
                                                ? (prev.length > 1 ? prev.filter(id => id !== role.id) : prev)
                                                : [...prev, role.id]
                                        );
                                    }}
                                    className={`flex flex-col p-6 rounded-[24px] border-2 text-left transition-all relative group h-full ${isSelected ? 'bg-indigo-600 border-indigo-500 shadow-xl shadow-indigo-600/20 scale-[1.02] z-10' : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-indigo-500/50 hover:bg-indigo-500/[0.03] hover:-translate-y-1'}`}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <span className={`text-xs font-black uppercase tracking-[0.1em] ${isSelected ? 'text-white' : 'text-[var(--text-main)] group-hover:text-indigo-500'}`}>{role.name}</span>
                                        {isSelected ? (
                                            <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                                                <CheckCircle2 size={14} className="text-white" />
                                            </div>
                                        ) : (
                                            <div className="w-6 h-6 rounded-full border border-[var(--border-main)] group-hover:border-indigo-500/30"></div>
                                        )}
                                    </div>
                                    <p className={`text-xs leading-relaxed font-medium transition-colors ${isSelected ? 'text-white/80' : 'text-[var(--text-muted)] opacity-80'}`}>{role.desc}</p>
                                    
                                    {isSelected && (
                                        <div className="absolute inset-0 rounded-[22px] border border-white/10 pointer-events-none"></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
                
                <div className="p-8 bg-[var(--bg-editor)]/80 backdrop-blur-md border-t border-[var(--border-main)] flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-50">Configura múltiples roles para una IA híbrida</p>
                    <button 
                        onClick={onClose} 
                        className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-indigo-600/20 transition-all hover:shadow-indigo-600/30 active:scale-95 flex items-center gap-3"
                    >
                        Confirmar Selección
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AIPersonalityModal;
