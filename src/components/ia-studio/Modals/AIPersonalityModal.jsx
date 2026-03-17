import { ShieldCheck, CheckCircle2 } from 'lucide-react';

const AIPersonalityModal = ({ isOpen, onClose, aiRoles, setAiRoles, AI_ROLES }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-[var(--border-main)]">
                    <div>
                        <h3 className="text-xl font-bold text-[var(--text-main)] font-serif italic">Personalidad de la IA</h3>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Selecciona cómo quieres que actúe Gemini para este prompt.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-editor)] text-[var(--text-muted)] transition-colors"><ShieldCheck size={20} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {AI_ROLES.map((role) => (
                            <button
                                key={role.id}
                                onClick={() => {
                                    setAiRoles(prev =>
                                        prev.includes(role.id)
                                            ? (prev.length > 1 ? prev.filter(id => id !== role.id) : prev)
                                            : [...prev, role.id]
                                    );
                                }}
                                className={`flex flex-col p-5 rounded-2xl border text-left transition-all group ${aiRoles.includes(role.id) ? 'bg-[var(--accent-main)] border-[var(--accent-main)] shadow-xl shadow-[var(--accent-main)]/20' : 'bg-[var(--bg-editor)] border-[var(--border-main)] hover:border-[var(--accent-main)]/50 focus:ring-2 ring-[var(--accent-main)]'}`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`text-sm font-black uppercase tracking-tight ${aiRoles.includes(role.id) ? 'text-white' : 'text-[var(--text-main)]'}`}>{role.name}</span>
                                    {aiRoles.includes(role.id) && <CheckCircle2 size={16} className="text-white" />}
                                </div>
                                <p className={`text-xs leading-relaxed font-medium ${aiRoles.includes(role.id) ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>{role.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-6 bg-[var(--bg-editor)] border-t border-[var(--border-main)] flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-[var(--accent-main)] text-white font-bold rounded-xl shadow-lg">Listo</button>
                </div>
            </div>
        </div>
    );
};

export default AIPersonalityModal;
