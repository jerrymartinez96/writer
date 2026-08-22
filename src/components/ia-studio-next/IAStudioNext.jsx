import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowRight,
    ArrowLeft,
    BookOpen,
    Bot,
    Check,
    ClipboardCheck,
    FileText,
    Globe2,
    Menu,
    MessageSquare,
    Plus,
    ShieldCheck,
    Sparkles,
    Trash2,
    Users,
    Wrench,
    X,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useIAStudioContext } from '../../context/IAStudioContext';
import { useToolRooms } from '../../context/ToolRoomContext';
import AIService from '../../services/AIService';
import ConfirmModal from '../ConfirmModal';
import IAStudioNextChat from './IAStudioNextChat';
import CoreContextConfigModal from './CoreContextConfigModal';

const WORK_MODES = [
    { id: 'chat', label: 'Conversar', eyebrow: 'Ideas y análisis', description: 'Pregunta, explora y analiza sin cambiar la obra.', icon: MessageSquare, accent: 'indigo', steps: ['Contexto', 'Conversación'] },
    { id: 'audit', label: 'Auditar', eyebrow: 'Control de calidad', description: 'Detecta problemas y verifica su evidencia.', icon: ClipboardCheck, accent: 'orange', route: 'toolroom:audit', roomId: 'audit', steps: ['Alcance', 'Análisis', 'Hallazgos', 'Resolución'] },
    { id: 'create', label: 'Crear', eyebrow: 'Desarrollo narrativo', description: 'Diseña personajes, capítulos, escenas y borradores.', icon: BookOpen, accent: 'violet', route: 'toolroom:creative-studio', roomId: 'creative-studio', steps: ['Flujo', 'Dirección', 'Escenas', 'Borrador'] },
    { id: 'change', label: 'Cambiar', eyebrow: 'Canon y continuidad', description: 'Prepara cambios importantes con revisión y aprobación.', icon: Wrench, accent: 'cyan', route: 'toolroom:global-constructor', roomId: 'global-constructor', steps: ['Alcance', 'Impacto', 'Plan', 'Aplicación'] },
];

const CREATIVE_FLOWS = [
    { id: 'designer', label: 'Diseñar capítulo', description: 'Define dirección, escenas, ritmo y consecuencias.', icon: Sparkles },
    { id: 'writer', label: 'Redactar capítulo', description: 'Convierte una estructura aprobada en un borrador.', icon: FileText },
    { id: 'character', label: 'Diseñar personaje', description: 'Trabaja identidad, psicología y trayectoria.', icon: Users },
];

const accentClasses = {
    indigo: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    orange: 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400',
    violet: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
    cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
};

const buildSelectedContext = ({ contextSelections, activeChapter }) => ({
    chapterIds: contextSelections?.chapterIds?.length ? contextSelections.chapterIds : (activeChapter?.id ? [activeChapter.id] : []),
    characterIds: contextSelections?.characterIds || [],
    worldItemIds: contextSelections?.worldItemIds || [],
});

const readWorkspaceDraft = () => {
    try {
        const value = JSON.parse(window.sessionStorage.getItem('verne-ia-studio-workspace') || '{}');
        return value && typeof value === 'object' ? value : {};
    } catch {
        return {};
    }
};

const ConversationList = ({ sessions, activeSession, onSwitch, onNew, onDelete, onClose }) => (
    <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 lg:px-5 lg:pt-5">
            <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Historial</p><h2 className="mt-1 font-serif text-lg font-black">Conversaciones</h2></div>
            {onClose && <button type="button" onClick={onClose} className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]" aria-label="Cerrar conversaciones"><X size={17} /></button>}
        </div>
        <div className="px-4 lg:px-5"><button type="button" onClick={onNew} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-black text-white shadow-sm transition-colors hover:bg-indigo-500"><Plus size={15} /> Nueva conversación</button></div>
        <div className="mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-4 lg:px-4">
            {sessions.length ? sessions.map((session) => {
                const selected = session.id === activeSession?.id;
                return <div key={session.id} className={`group flex items-center gap-1 rounded-2xl border p-1 transition-colors ${selected ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-transparent hover:border-[var(--border-main)] hover:bg-[var(--bg-editor)]'}`}>
                    <button type="button" onClick={() => { onSwitch(session.id); onClose?.(); }} className="min-w-0 flex-1 rounded-xl px-2.5 py-2 text-left"><span className={`block truncate text-xs font-black ${selected ? 'text-indigo-600 dark:text-indigo-400' : 'text-[var(--text-main)]'}`}>{session.name}</span><span className="mt-1 block text-[9px] font-bold text-[var(--text-muted)]">{session.messages?.length || 0} mensajes</span></button>
                    <button type="button" onClick={() => onDelete(session)} className="rounded-lg p-2 text-[var(--text-muted)] opacity-50 transition-colors hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100" aria-label={`Eliminar ${session.name}`}><Trash2 size={13} /></button>
                </div>;
            }) : <div className="rounded-2xl border border-dashed border-[var(--border-main)] p-5 text-center text-xs leading-relaxed text-[var(--text-muted)]">Crea una conversación para comenzar.</div>}
        </div>
    </div>
);

const ContextPanel = ({ activeChapter, chapters, characters, worldItems, contextSelections, onContextChange, onOpenConfig, onClose }) => {
    const selectedSources = useMemo(() => [
        ...chapters.filter((item) => (contextSelections?.chapterIds || []).includes(item.id)).map((item) => ({ id: item.id, type: 'chapterIds', label: item.title, kind: 'Capítulo', icon: FileText, content: item.content || '' })),
        ...characters.filter((item) => (contextSelections?.characterIds || []).includes(item.id)).map((item) => ({ id: item.id, type: 'characterIds', label: item.name, kind: 'Personaje', icon: Users, content: item.description || '' })),
        ...worldItems.filter((item) => (contextSelections?.worldItemIds || []).includes(item.id)).map((item) => ({ id: item.id, type: 'worldItemIds', label: item.title, kind: 'Mundo', icon: Globe2, content: item.content || '' })),
    ], [chapters, characters, contextSelections, worldItems]);
    const effectiveSources = selectedSources.length ? selectedSources : (activeChapter ? [{ id: activeChapter.id, type: null, label: activeChapter.title, kind: 'Capítulo activo', icon: FileText, content: activeChapter.content || '' }] : []);
    const estimatedTokens = effectiveSources.reduce((total, item) => total + AIService.estimateTokens(item.content), 0);
    const removeSource = (source) => {
        if (!source.type) return;
        onContextChange({ ...contextSelections, [source.type]: (contextSelections?.[source.type] || []).filter((id) => id !== source.id) });
    };

    return <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-main)] px-4 py-4 xl:px-5"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Fuentes controladas</p><h2 className="mt-1 font-serif text-lg font-black">Contexto</h2></div>{onClose && <button type="button" onClick={onClose} className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]" aria-label="Cerrar contexto"><X size={17} /></button>}</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 xl:p-5">
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-black">{effectiveSources.length} fuente(s)</span><span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400">≈ {estimatedTokens.toLocaleString('es-MX')} tokens</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-indigo-500/10"><span className="block h-full max-w-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.max(4, estimatedTokens / 200))}%` }} /></div><p className="mt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">Solo estas fuentes se usarán como contexto explícito. Si no eliges ninguna, se usa el capítulo activo.</p></div>
            <div className="mt-4 space-y-2">
                {effectiveSources.map((source) => { const Icon = source.icon; return <div key={`${source.kind}-${source.id}`} className="flex items-center gap-3 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-main)]"><Icon size={15} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{source.label}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{source.kind}</p></div>{source.type ? <button type="button" onClick={() => removeSource(source)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500" aria-label={`Quitar ${source.label}`}><X size={13} /></button> : <Check size={14} className="text-emerald-500" />}</div>; })}
                {!effectiveSources.length && <div className="rounded-2xl border border-dashed border-[var(--border-main)] p-5 text-center text-xs leading-relaxed text-[var(--text-muted)]">No hay fuentes disponibles. Selecciona contexto antes de iniciar.</div>}
            </div>
        </div>
        <div className="border-t border-[var(--border-main)] p-4 xl:p-5"><button type="button" onClick={onOpenConfig} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] px-3 py-2.5 text-xs font-black transition-colors hover:border-indigo-500 hover:text-indigo-500"><ShieldCheck size={14} /> Configurar contexto</button></div>
    </div>;
};

const WorkflowLauncher = ({ mode, objective, setObjective, creativeFlow, setCreativeFlow, onLaunch, launchError }) => {
    const ModeIcon = mode.icon;
    const hasFreeformObjective = !['audit', 'create'].includes(mode.id);
    const actionLabel = mode.id === 'audit' ? 'Iniciar auditoría' : mode.id === 'create' ? 'Abrir flujo creativo' : 'Preparar cambio';
    return <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-3xl">
        <section className={`rounded-3xl border p-5 sm:p-7 ${accentClasses[mode.accent]}`}><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-editor)] shadow-sm"><ModeIcon size={21} /></span><div><p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-80">{mode.eyebrow}</p><p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">{mode.description} {hasFreeformObjective ? 'La instrucción y las fuentes seleccionadas se conservarán al abrir el flujo especializado.' : 'El flujo ya tiene una intención definida; solo necesitas configurar sus opciones.'}</p></div></div></section>
        <section className="mt-5 rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 sm:p-7">
            {hasFreeformObjective ? <><div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-black text-white">1</span><div><h3 className="text-sm font-black">Define el objetivo</h3><p className="mt-0.5 text-xs text-[var(--text-muted)]">Una intención concreta evita regeneraciones innecesarias.</p></div></div><textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={5} placeholder="Ej. Elimina la escena del puerto, conserva la deuda y traslada la revelación al invernadero…" className="mt-5 w-full resize-none rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 text-sm leading-relaxed outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-indigo-500" /></> : <div className="flex items-start gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-black text-white">1</span><div><h3 className="text-sm font-black">Flujo listo para configurar</h3><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{mode.id === 'audit' ? 'La auditoría integral revisará la obra completa y sus evidencias.' : 'Elige qué quieres construir y continúa con la dirección narrativa.'}</p></div></div>}
            {mode.id === 'create' && <div className="mt-5"><p className="text-xs font-black">¿Qué quieres construir?</p><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">{CREATIVE_FLOWS.map((flow) => { const Icon = flow.icon; const selected = creativeFlow === flow.id; return <button key={flow.id} type="button" onClick={() => setCreativeFlow(flow.id)} className={`rounded-2xl border p-4 text-left transition-colors ${selected ? 'border-violet-500 bg-violet-500/10' : 'border-[var(--border-main)] hover:border-violet-500/40'}`}><Icon size={18} className={selected ? 'text-violet-500' : 'text-[var(--text-muted)]'} /><p className="mt-3 text-xs font-black">{flow.label}</p><p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{flow.description}</p></button>; })}</div></div>}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-main)] pt-5"><p className="max-w-md text-[10px] leading-relaxed text-[var(--text-muted)]">{hasFreeformObjective ? 'IA Studio entregará la instrucción y el contexto al siguiente paso.' : 'IA Studio entregará la configuración y el contexto al siguiente paso.'} Ningún documento se modifica al abrirlo.</p><button type="button" onClick={onLaunch} disabled={hasFreeformObjective && !objective.trim()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">{actionLabel} <ArrowRight size={16} /></button></div>
            {launchError && <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{launchError}</p>}
        </section>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{mode.steps.map((step, index) => <div key={step} className={`rounded-xl border p-3 text-center text-[10px] font-black ${index === 0 ? 'border-indigo-500/30 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400' : 'border-[var(--border-main)] text-[var(--text-muted)]'}`}><span className="mr-1 opacity-60">{index + 1}.</span>{step}</div>)}</div>
    </div></div>;
};

const IAStudioNext = () => {
    const { activeChapter, chapters = [], characters = [], worldItems = [], setActiveView } = useData();
    const { openToolRoom } = useToolRooms();
    const { sessions = [], activeSession, switchSession, newSession, deleteSession, contextSelections, onContextChange } = useIAStudioContext();
    const [workspaceDraft] = useState(readWorkspaceDraft);
    const [modeId, setModeId] = useState(WORK_MODES.some((item) => item.id === workspaceDraft.modeId) ? workspaceDraft.modeId : 'chat');
    const [objectives, setObjectives] = useState({ audit: '', create: '', change: '', ...(workspaceDraft.objectives || {}) });
    const [creativeFlow, setCreativeFlow] = useState(CREATIVE_FLOWS.some((item) => item.id === workspaceDraft.creativeFlow) ? workspaceDraft.creativeFlow : 'designer');
    const [showConversations, setShowConversations] = useState(false);
    const [showContext, setShowContext] = useState(false);
    const [showContextConfig, setShowContextConfig] = useState(false);
    const [sessionToDelete, setSessionToDelete] = useState(null);
    const [launchError, setLaunchError] = useState('');
    const mode = WORK_MODES.find((item) => item.id === modeId) || WORK_MODES[0];
    const contextCount = (contextSelections?.chapterIds?.length || 0) + (contextSelections?.characterIds?.length || 0) + (contextSelections?.worldItemIds?.length || 0);

    useEffect(() => {
        try {
            window.sessionStorage.setItem('verne-ia-studio-workspace', JSON.stringify({ modeId, objectives, creativeFlow }));
        } catch { /* El workspace sigue funcionando aunque el almacenamiento esté bloqueado. */ }
    }, [creativeFlow, modeId, objectives]);

    const handleNewSession = () => { newSession(); setModeId('chat'); setShowConversations(false); };
    const handleLaunch = () => {
        const objective = objectives[mode.id]?.trim();
        if ((mode.id === 'change' && !objective) || !mode.route || !mode.roomId) return;
        const context = buildSelectedContext({ contextSelections, activeChapter });
        try {
            window.sessionStorage.setItem('verne-ia-studio-launch', JSON.stringify({ roomId: mode.roomId, prompt: objective || '', context, contextLabel: contextCount ? `${contextCount} fuente(s) seleccionada(s)` : activeChapter?.title || '', workflow: mode.id === 'create' ? creativeFlow : mode.id, createdAt: new Date().toISOString() }));
            setLaunchError('');
            openToolRoom(mode.route);
        } catch (error) {
            setLaunchError(error?.message || 'No se pudo preparar el flujo especializado.');
        }
    };

    const conversationPanel = <ConversationList sessions={sessions} activeSession={activeSession} onSwitch={switchSession} onNew={handleNewSession} onDelete={setSessionToDelete} />;
    const contextPanel = <ContextPanel activeChapter={activeChapter} chapters={chapters} characters={characters} worldItems={worldItems} contextSelections={contextSelections} onContextChange={onContextChange} onOpenConfig={() => setShowContextConfig(true)} />;

    return <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)]">
        <header className="shrink-0 border-b border-[var(--border-main)] bg-[var(--bg-app)]/95 px-3 py-3 backdrop-blur-xl sm:px-5 lg:px-7"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2 sm:gap-3"><button type="button" onClick={() => setActiveView('editor')} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] px-2.5 text-[10px] font-black text-[var(--text-muted)] transition-colors hover:border-indigo-500 hover:text-indigo-500 sm:px-3" aria-label="Volver al menú principal"><ArrowLeft size={15} /><span className="hidden sm:inline">Menú principal</span></button><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"><Bot size={17} /></span><div className="min-w-0"><p className="truncate text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500">Workspace unificado</p><h1 className="truncate font-serif text-base font-black sm:text-lg">IA Studio</h1></div></div><div className="flex items-center gap-1.5"><button type="button" onClick={() => setShowConversations(true)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] px-3 py-2 text-[10px] font-black text-[var(--text-muted)] lg:hidden"><Menu size={14} /><span className="hidden sm:inline">Conversaciones</span></button><button type="button" onClick={() => setShowContext(true)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] px-3 py-2 text-[10px] font-black text-[var(--text-muted)] xl:hidden"><ShieldCheck size={14} /><span className="hidden xs:inline">Contexto</span><span className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-indigo-500">{contextCount}</span></button><span className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[10px] font-black text-emerald-600 sm:inline-flex dark:text-emerald-400"><Check size={13} /> Contexto controlado</span></div></div></header>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
            <aside className="hidden min-h-0 border-r border-[var(--border-main)] bg-[var(--bg-sidebar)] lg:block">{conversationPanel}</aside>
            <main className="flex min-h-0 min-w-0 flex-col bg-[var(--bg-app)]">
                <nav className="shrink-0 overflow-x-auto border-b border-[var(--border-main)] bg-[var(--bg-editor)] px-3 py-2.5 sm:px-5" aria-label="Modos de IA Studio"><div className="mx-auto grid min-w-[520px] max-w-3xl grid-cols-4 gap-1.5 rounded-2xl bg-[var(--bg-app)] p-1.5">{WORK_MODES.map((item) => { const Icon = item.icon; const selected = item.id === modeId; return <button key={item.id} type="button" onClick={() => { setModeId(item.id); setLaunchError(''); }} aria-pressed={selected} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${selected ? 'bg-[var(--bg-editor)] text-indigo-600 shadow-sm dark:text-indigo-400' : 'text-[var(--text-muted)] hover:bg-[var(--bg-editor)]/70 hover:text-[var(--text-main)]'}`}><Icon size={14} /><span>{item.label}</span></button>; })}</div></nav>
                {mode.id === 'chat' ? <div className="min-h-0 flex-1 [&_header]:hidden"><IAStudioNextChat onBack={() => {}} /></div> : <WorkflowLauncher mode={mode} objective={objectives[mode.id] || ''} setObjective={(value) => setObjectives((current) => ({ ...current, [mode.id]: value }))} creativeFlow={creativeFlow} setCreativeFlow={setCreativeFlow} onLaunch={handleLaunch} launchError={launchError} />}
            </main>
            <aside className="hidden min-h-0 border-l border-[var(--border-main)] bg-[var(--bg-sidebar)] xl:block">{contextPanel}</aside>
        </div>
        {showConversations && <div className="fixed inset-0 z-[80] bg-black/50 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowConversations(false); }}><aside className="h-full w-[min(86vw,320px)] border-r border-[var(--border-main)] bg-[var(--bg-sidebar)] shadow-2xl"><ConversationList sessions={sessions} activeSession={activeSession} onSwitch={switchSession} onNew={handleNewSession} onDelete={setSessionToDelete} onClose={() => setShowConversations(false)} /></aside></div>}
        {showContext && <div className="fixed inset-0 z-[80] flex justify-end bg-black/50 xl:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowContext(false); }}><aside className="h-full w-[min(90vw,360px)] border-l border-[var(--border-main)] bg-[var(--bg-sidebar)] shadow-2xl"><ContextPanel activeChapter={activeChapter} chapters={chapters} characters={characters} worldItems={worldItems} contextSelections={contextSelections} onContextChange={onContextChange} onOpenConfig={() => setShowContextConfig(true)} onClose={() => setShowContext(false)} /></aside></div>}
        <CoreContextConfigModal isOpen={showContextConfig} onClose={() => setShowContextConfig(false)} chapters={chapters} worldItems={worldItems} characters={characters} />
        <ConfirmModal isOpen={Boolean(sessionToDelete)} onClose={() => setSessionToDelete(null)} onConfirm={() => { if (sessionToDelete?.id) deleteSession(sessionToDelete.id); setSessionToDelete(null); }} title="¿Eliminar esta conversación?" message={`Se eliminará «${sessionToDelete?.name || 'esta conversación'}» y sus mensajes.`} confirmText="Eliminar conversación" />
    </section>;
};

export default IAStudioNext;
