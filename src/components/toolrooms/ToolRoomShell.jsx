import React from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Loader2, Save } from 'lucide-react';

const accentClasses = {
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    indigo: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
    emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    violet: 'text-violet-500 bg-violet-500/10 border-violet-500/20',
    cyan: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
};

const statusLabels = {
    ready: 'Listo',
    processing: 'Procesando',
    pending: 'Cambios pendientes',
    saved: 'Guardado',
};

const ToolRoomShell = ({ room, status = 'ready', children, context, title, headerAction }) => {
    const Icon = room.icon;
    const statusText = statusLabels[status] || statusLabels.ready;

    return (
        <section className="h-full min-h-0 flex flex-col bg-[var(--bg-app)] text-[var(--text-main)]">
            <header className="shrink-0 border-b border-[var(--border-main)] bg-[var(--bg-app)]/90 backdrop-blur-xl px-4 py-3 lg:px-8">
                <div className="max-w-[1500px] mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                       
                        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${accentClasses[room.accent] || accentClasses.indigo}`}>
                            <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] truncate">{room.eyebrow}</p>
                            <h1 className="font-serif font-black text-base sm:text-lg truncate">{title || room.title}</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {headerAction || <div className="hidden md:flex items-center gap-2 rounded-full border border-[var(--border-main)] px-3 py-1.5 text-[10px] font-bold text-[var(--text-muted)]">
                            {status === 'processing' ? <Loader2 size={13} className="animate-spin text-indigo-500" /> : status === 'saved' ? <CheckCircle2 size={13} className="text-emerald-500" /> : status === 'pending' ? <Clock3 size={13} className="text-amber-500" /> : <Save size={13} className="text-[var(--text-muted)]" />}
                            {statusText}
                        </div>}
                    </div>
                </div>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="max-w-[1500px] mx-auto p-4 lg:p-8">
                    {context && <div className="mb-5">{context}</div>}
                    {children}
                </div>
            </div>
        </section>
    );
};

export default ToolRoomShell;
