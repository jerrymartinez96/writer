import React from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, Sparkles } from 'lucide-react';
import { TOOL_ROOMS } from './toolRoomCatalog';
import { useToolRooms } from '../../context/ToolRoomContext';
import ToolRoomShell from './ToolRoomShell';

const ToolRoomsView = () => {
    const { openToolRoom } = useToolRooms();

    return (
        <ToolRoomShell
            room={{ id: 'hub', title: 'Tool Rooms', eyebrow: 'Espacios especializados', icon: Sparkles, accent: 'indigo' }}
            title="Tus espacios de trabajo"
            description="Entra a una sala diseñada para resolver una tarea concreta de tu proyecto, con el contexto adecuado y cambios siempre revisables."
        >
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {TOOL_ROOMS.map((room) => {
                    const Icon = room.icon;
                    const isAvailable = room.status === 'available';
                    return (
                        <article key={room.id} className="group rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all">
                            <div className="flex items-start justify-between gap-4">
                                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${room.accent === 'amber' ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' : room.accent === 'emerald' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : room.accent === 'violet' ? 'text-violet-500 bg-violet-500/10 border-violet-500/20' : room.accent === 'cyan' ? 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' : 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20'}`}>
                                    <Icon size={23} />
                                </div>
                                {isAvailable ? <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-500"><CheckCircle2 size={13} /> Disponible</span> : <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]"><LockKeyhole size={13} /> En preparación</span>}
                            </div>
                            <p className="mt-5 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{room.eyebrow}</p>
                            <h2 className="mt-1 text-xl font-serif font-black">{room.title}</h2>
                            <p className="mt-3 min-h-12 text-sm leading-relaxed text-[var(--text-muted)]">{room.description}</p>
                            <button
                                type="button"
                                disabled={!isAvailable}
                                onClick={() => openToolRoom(room.route)}
                                className="mt-6 w-full flex items-center justify-between rounded-xl border border-[var(--border-main)] px-3 py-2.5 text-xs font-black transition-all disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:border-[var(--accent-main)] enabled:hover:text-[var(--accent-main)]"
                            >
                                {isAvailable ? 'Entrar a la sala' : 'Próximamente'}
                                {isAvailable && <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />}
                            </button>
                        </article>
                    );
                })}
            </div>
        </ToolRoomShell>
    );
};

export default ToolRoomsView;

