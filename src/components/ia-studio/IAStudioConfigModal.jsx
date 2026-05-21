import React, { useState } from 'react';
import Modal from '../Modal';
import { Sparkles, Plus, Edit2, Trash2, Check, X } from 'lucide-react';

const IAStudioConfigModal = ({
    isOpen,
    onClose,
    session,
    allSessions,
    onSwitchSession,
    onNewSession,
    onDeleteSession,
    onRenameSession,
    selectedModel,
}) => {
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(session?.name || '');

    const handleRenameConfirm = () => {
        if (renameValue.trim() && session?.id) {
            onRenameSession(session.id, renameValue.trim());
        }
        setRenaming(false);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="⚙️ Sesiones" size="lg">
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] flex items-center gap-2">
                        <Sparkles size={12} /> Tus sesiones
                    </span>
                    <button
                        onClick={onNewSession}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500/10 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-indigo-500/20 transition-all"
                    >
                        <Plus size={12} /> Nueva
                    </button>
                </div>

                <div className="bg-[var(--bg-editor)] rounded-2xl border border-[var(--border-main)]/50 p-2 max-h-64 overflow-y-auto scrollbar-hide">
                    {(!allSessions || allSessions.length === 0) ? (
                        <div className="text-sm text-[var(--text-muted)] italic py-6 text-center">No hay sesiones aún</div>
                    ) : (
                        <div className="space-y-1">
                            {allSessions.map(s => {
                                const isActive = s.id === session?.id;
                                const isRenaming = renaming && isActive;

                                return (
                                    <div key={s.id} className={`group rounded-xl transition-all ${isActive ? 'bg-[var(--bg-app)] border border-indigo-500/10' : 'hover:bg-[var(--accent-soft)]/30 border border-transparent'}`}>
                                        {isRenaming ? (
                                            <div className="px-4 py-2.5 flex items-center gap-2">
                                                <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenameConfirm(); if (e.key === 'Escape') setRenaming(false); }}
                                                    className="flex-1 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-indigo-500" />
                                                <button onClick={handleRenameConfirm} className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10"><Check size={14} /></button>
                                                <button onClick={() => setRenaming(false)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--accent-soft)]"><X size={14} /></button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3 px-4 py-2.5">
                                                <button onClick={() => { onSwitchSession(s.id); onClose(); }} className="flex-1 flex items-center gap-3 text-left min-w-0">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? 'bg-indigo-500 text-white' : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)]'}`}>
                                                        <Sparkles size={12} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-sm truncate ${isActive ? 'font-bold text-indigo-600' : 'font-medium text-[var(--text-main)]'}`}>{s.name}</p>
                                                        <p className="text-[9px] text-[var(--text-muted)] opacity-60">{s.messages?.length || 0} mensajes</p>
                                                    </div>
                                                </button>
                                                {isActive && (
                                                    <button onClick={() => { setRenaming(true); setRenameValue(s.name); }}
                                                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all"><Edit2 size={12} /></button>
                                                )}
                                                <button onClick={() => { if (window.confirm(`¿Borrar "${s.name}"?`)) onDeleteSession(s.id); }}
                                                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Model info */}
                <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-editor)] rounded-xl border border-[var(--border-main)]/50">
                    <span className="text-[9px] font-black uppercase tracking-wider text-purple-500">Modelo</span>
                    <span className="text-xs font-bold text-[var(--text-main)] truncate" title={selectedModel}>
                        {selectedModel?.split('/').pop() || selectedModel}
                    </span>
                </div>
            </div>
        </Modal>
    );
};

export default IAStudioConfigModal;
