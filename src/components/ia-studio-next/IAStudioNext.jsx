import React, { useState } from 'react';
import { ArrowRight, Bot, MessageSquare, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { useToolRooms } from '../../context/ToolRoomContext';
import { TOOL_ROOMS } from '../toolrooms/toolRoomCatalog';
import IAStudioNextChat from './IAStudioNextChat';

const capabilityCards = [
    { id: 'chat', title: 'Conversar', description: 'Preguntas, ideas y análisis generales sin modificar documentos.', icon: MessageSquare, color: 'text-violet-500 bg-violet-500/10' },
    { id: 'patch', title: 'Parche', description: 'Correcciones puntuales con revisión antes de aplicar.', icon: Wrench, color: 'text-amber-500 bg-amber-500/10' },
    { id: 'multi_patch', title: 'Multiparche', description: 'Cambios coordinados en varios documentos de forma atómica.', icon: ShieldCheck, color: 'text-emerald-500 bg-emerald-500/10' },
];

const IAStudioNext = () => {
    const { openToolRoom } = useToolRooms();
    const [showCoreChat, setShowCoreChat] = useState(false);

    const openCore = () => {
        setShowCoreChat(true);
    };

    if (showCoreChat) return <IAStudioNextChat onBack={() => setShowCoreChat(false)} />;

    return (
        <section className="h-full min-h-0 overflow-y-auto bg-[var(--bg-app)] text-[var(--text-main)]">
            <div className="max-w-6xl mx-auto p-5 lg:p-10">
                <div className="mt-8 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-[var(--bg-editor)] to-[var(--bg-editor)] p-6 lg:p-8 shadow-sm">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6"><div className="flex items-start gap-4"><div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20"><Bot size={24} /></div><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500">Core IA Studio</p><h2 className="mt-1 text-2xl font-serif font-black">Tu centro creativo</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">El Core se encargará de conversar, analizar y preparar parches. Los trabajos especializados vivirán en sus propias Tool Rooms.</p></div></div><button type="button" onClick={openCore} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500">Abrir Core Chat <ArrowRight size={16} /></button></div>
                    <div className="mt-7 grid grid-cols-1 md:grid-cols-3 gap-3">{capabilityCards.map((capability) => { const Icon = capability.icon; return <div key={capability.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)]/80 p-4"><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${capability.color}`}><Icon size={17} /></div><h3 className="mt-4 text-sm font-black">{capability.title}</h3><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{capability.description}</p></div>; })}</div>
                </div>

                <div className="mt-8"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Espacios especializados</p><h2 className="mt-1 text-2xl font-serif font-black">Herramientas de IA</h2><p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">Todas las herramientas viven aquí. Elige una para trabajar con su contexto y flujo especializado.</p></div></div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{TOOL_ROOMS.filter((room) => room.status === 'available' && room.visible !== false).map((room) => { const Icon = room.icon; return <button key={room.id} type="button" onClick={() => openToolRoom(room.route)} className="group rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 text-left hover:-translate-y-0.5 hover:border-indigo-500/40 hover:shadow-xl transition-all"><div className="flex items-center justify-between"><div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-main)] flex items-center justify-center"><Icon size={19} /></div><ArrowRight size={16} className="text-[var(--text-muted)] transition-transform group-hover:translate-x-1" /></div><h3 className="mt-5 text-lg font-serif font-black">{room.title}</h3><p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{room.description}</p></button>; })}</div>
            </div>
        </section>
    );
};

export default IAStudioNext;
