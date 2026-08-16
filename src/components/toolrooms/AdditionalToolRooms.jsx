import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, Clock3, FilePlus2, FileText, Headphones, History, Link2, Loader2, Network, PenLine, Play, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useIAStudioContext } from '../../context/IAStudioContext';
import { useToolRooms } from '../../context/ToolRoomContext';
import { getToolRoom } from './toolRoomCatalog';
import ToolRoomShell from './ToolRoomShell';
import ToolRoomProposalCard from './ToolRoomProposalCard';
import ToolRoomAIProposal from './ToolRoomAIProposal';
import ToolRoomAIInsight from './ToolRoomAIInsight';
import ToolRoomHistoryPanel from './ToolRoomHistoryPanel';
import ChapterDesigner from './ChapterDesigner';
import ChapterWriter from './ChapterWriter';
import CoherenceFindingCard from './CoherenceFindingCard';
import useToolRoomLaunch from './useToolRoomLaunch';
import { buildCoherencePatches, requestCoherenceAnalysis, validateCoherenceFinding } from '../../services/ai-next/ToolRoomAIService';
import { useNarrador } from '../narrador/useNarrador';
import NarradorPanel from '../narrador/NarradorPanel';
import { updateChapterContent } from '../../services/db';
import { saveEntitySnapshot } from '../../services/db';
import { saveLocalSnapshot } from '../../services/localDb';
import { applyPlainTextPatch } from '../../services/ai-next/plainText';

const RoomContextBanner = ({ children, status = 'ready' }) => (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0"><ShieldCheck size={17} className="shrink-0 text-emerald-500" /><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Contexto activo</p><p className="mt-1 text-sm font-bold truncate">{children}</p></div></div>
        <span className={`shrink-0 text-[10px] font-black uppercase tracking-wider ${status === 'pending' ? 'text-amber-500' : 'text-emerald-500'}`}>{status === 'pending' ? 'Requiere selección' : 'Controlado'}</span>
    </div>
);

const EmptyRoomState = ({ icon, title, text }) => <div className="min-h-[300px] flex flex-col items-center justify-center text-center rounded-3xl border border-dashed border-[var(--border-main)] p-8"><div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-main)] flex items-center justify-center">{React.createElement(icon, { size: 25 })}</div><h2 className="mt-5 text-2xl font-serif font-black">{title}</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">{text}</p></div>;

const CoherenceHistoryModal = ({ entries, onClose, onResume, onDelete, isResuming }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="coherence-history-title">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border-main)] p-5">
                <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-500">Auditorías guardadas</p><h2 id="coherence-history-title" className="mt-1 text-xl font-serif font-black">Historial de coherencia</h2></div>
                <button type="button" onClick={onClose} className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]" title="Cerrar historial"><X size={18} /></button>
            </div>
            <div className="max-h-[calc(85vh-90px)] overflow-y-auto p-5">
                {entries.length === 0 ? <p className="rounded-2xl border border-dashed border-[var(--border-main)] p-8 text-center text-sm text-[var(--text-muted)]">Todavía no hay auditorías guardadas para este libro.</p> : <div className="space-y-3">{entries.map((entry) => <div key={entry.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black">{new Date(entry.createdAt).toLocaleString('es-MX')}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{entry.findingCount} inconsistencia(s) · {entry.documentCount} documentos · {entry.optionCount || 0} propuesta(s) generadas</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => onResume(entry)} disabled={isResuming} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white hover:bg-cyan-500 disabled:cursor-wait disabled:opacity-60"><History size={14} /> {isResuming ? 'Cargando…' : 'Volver a trabajar'}</button><button type="button" onClick={() => onDelete(entry.id)} disabled={isResuming} className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500/10 disabled:opacity-50" title="Borrar esta auditoría"><Trash2 size={14} /> Limpiar</button></div></div></div>)}</div>}
            </div>
        </div>
    </div>
);

const CoWriterRoom = () => {
    const room = getToolRoom('cowriter');
    const { activeBook, chapters = [], characters = [], worldItems = [], activeChapter, selectChapter, createChapter, setActiveView, lazyLoadChapters, updateWorldItem, saveDocumentSnapshot } = useData();
    const { onContextChange } = useIAStudioContext();
    const { getRoomState, updateRoomState, startMission, saveProposal, dismissProposal, launchInIAStudio } = useToolRooms();
    const state = getRoomState('cowriter');
    const launch = useToolRoomLaunch('cowriter');
    const selectedChapter = chapters.find((chapter) => chapter.id === (state.chapterId || launch?.context?.chapterIds?.[0])) || activeChapter || null;
    const selectedChapterId = selectedChapter?.id;
    const [flow, setFlow] = useState(null);
    const [newChapterTitle, setNewChapterTitle] = useState('');
    const supportingContext = useMemo(() => {
        if (!launch?.context) return '';
        const chapterIds = launch.context.chapterIds || [];
        const characterIds = launch.context.characterIds || [];
        const worldItemIds = launch.context.worldItemIds || [];
        return [
            ...chapters.filter((chapter) => chapterIds.includes(chapter.id) && chapter.id !== selectedChapterId).map((chapter) => `Capítulo de apoyo: ${chapter.title}\n${chapter.content || ''}`),
            ...characters.filter((character) => characterIds.includes(character.id)).map((character) => `Personaje de apoyo: ${character.name}\n${character.description || ''}`),
            ...worldItems.filter((item) => worldItemIds.includes(item.id)).map((item) => `Mundo de apoyo: ${item.title}\n${item.content || ''}`),
        ].join('\n\n');
    }, [chapters, characters, launch, selectedChapterId, worldItems]);
    const [objective, setObjective] = useState(state.objective || launch?.prompt || '');

    const prepareWorkspace = () => {
        if (!selectedChapter) return;
        onContextChange({ chapterIds: [selectedChapter.id], worldItemIds: [], characterIds: [] });
        updateRoomState('cowriter', { chapterId: selectedChapter.id, objective, lastVisitedAt: new Date().toISOString() });
        launchInIAStudio({
            roomId: 'cowriter',
            action: 'escribir',
            prompt: objective.trim(),
            contextLabel: selectedChapter.title,
        });
    };

    const createProposal = () => {
        if (!selectedChapter || !objective.trim()) return;
        startMission('cowriter', objective, { chapterId: selectedChapter.id });
        saveProposal('cowriter', {
            title: `Trabajar en ${selectedChapter.title}`,
            summary: `Preparar una propuesta para: “${objective.trim()}”. El texto original permanecerá intacto hasta que revises y apruebes los cambios.`,
            contextLabel: selectedChapter.title,
            risk: 'medium',
        });
    };

    const applyCowriterProposal = async (replacement, proposal) => {
        await updateChapterContent(activeBook.id, selectedChapter.id, replacement);
        await saveEntitySnapshot(activeBook.id, 'chapters', selectedChapter.id, replacement, 'toolroom-cowriter');
        await saveLocalSnapshot(selectedChapter.id, replacement, 'toolroom-cowriter');
        await selectChapter(selectedChapter.id);
        updateRoomState('cowriter', { missionStatus: 'completed', lastProposalSummary: proposal.summary });
    };
    const createBlankChapter = async () => {
        const title = newChapterTitle.trim();
        if (!title) return;
        const created = await createChapter({ title, content: '', parentId: null, isVolume: false }, { preventRedirect: true });
        if (!created?.id) throw new Error('No se pudo crear el capítulo.');
        await selectChapter(created.id);
        updateRoomState('cowriter', { chapterId: created.id, missionStatus: 'idle' });
        setActiveView('editor');
    };
    const restoreChapter = async (content) => {
        await saveEntitySnapshot(activeBook.id, 'chapters', selectedChapter.id, selectedChapter.content || '', 'before-restore');
        await updateChapterContent(activeBook.id, selectedChapter.id, content);
        await saveEntitySnapshot(activeBook.id, 'chapters', selectedChapter.id, content, 'restore');
        await saveLocalSnapshot(selectedChapter.id, content, 'toolroom-cowriter-restore');
        await selectChapter(selectedChapter.id);
    };
    const startChapterWriting = ({ structure, plan }) => {
        updateRoomState('cowriter', { designer: { ...(state.designer || {}), writingStructure: structure, writingPlan: plan } });
        setFlow('writer');
    };

    if (flow === 'writer') return <ToolRoomShell room={room} status="ready" context={<RoomContextBanner>Redactar desde Estructura</RoomContextBanner>}><button type="button" onClick={() => setFlow(null)} className="mb-4 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-black text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]"><ArrowLeft size={15} /> Cambiar de flujo</button><ChapterWriter state={state} updateRoomState={updateRoomState} worldItems={worldItems} chapters={chapters} characters={characters} activeChapter={activeChapter} lazyLoadChapters={lazyLoadChapters} createChapter={createChapter} selectChapter={selectChapter} setActiveView={setActiveView} onGoDesigner={() => setFlow('designer')} /></ToolRoomShell>;

    return <ToolRoomShell room={room} status={flow === 'mission' && selectedChapter ? 'ready' : flow === 'designer' || flow === 'writer' ? 'ready' : 'pending'} context={<RoomContextBanner status={flow ? 'ready' : 'pending'}>{flow === 'mission' && selectedChapter ? `Capítulo seleccionado: ${selectedChapter.title}` : flow === 'writer' ? 'Redactar desde Estructura' : flow === 'designer' ? 'Diseñar el próximo capítulo' : 'Elige un flujo para comenzar'}</RoomContextBanner>}>
        {!flow ? <main className="mx-auto max-w-4xl rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-6 lg:p-10">
            <div className="mx-auto max-w-2xl text-center"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500">Punto de partida</p><h2 className="mt-3 text-3xl font-serif font-black sm:text-4xl">¿Qué quieres hacer?</h2><p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">Elige un solo flujo para mantener el espacio despejado y concentrarte en tu siguiente avance.</p></div>
            <div className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-3">
                <button type="button" onClick={() => setFlow('mission')} className="group rounded-3xl border border-indigo-500/30 bg-indigo-500/5 p-6 text-left transition-all hover:-translate-y-1 hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/10"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500"><PenLine size={24} /></div><h3 className="mt-6 text-xl font-serif font-black">Crear misión de escritura</h3><p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">Trabaja sobre un capítulo existente con un objetivo concreto: tensión, diálogo, continuidad o estilo.</p><span className="mt-6 inline-flex items-center gap-2 text-xs font-black text-indigo-500">Elegir este flujo <span aria-hidden="true">→</span></span></button>
                <button type="button" onClick={() => setFlow('writer')} className="group rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-left transition-all hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/10"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500"><FilePlus2 size={24} /></div><h3 className="mt-6 text-xl font-serif font-black">Redactar desde Estructura</h3><p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">Analiza los capítulos planeados, elige el siguiente pendiente y genera un borrador revisable.</p><span className="mt-6 inline-flex items-center gap-2 text-xs font-black text-emerald-600">Analizar estructura <span aria-hidden="true">→</span></span></button>
                <button type="button" onClick={() => setFlow('designer')} className="group rounded-3xl border border-violet-500/30 bg-violet-500/5 p-6 text-left transition-all hover:-translate-y-1 hover:border-violet-500 hover:shadow-xl hover:shadow-violet-500/10"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500"><Sparkles size={24} /></div><h3 className="mt-6 text-xl font-serif font-black">Diseñar próximo capítulo</h3><p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">Analiza Estructura, encuentra lo que falta o convierte una idea en escenas listas para redactar.</p><span className="mt-6 inline-flex items-center gap-2 text-xs font-black text-violet-600">Empezar a diseñar <span aria-hidden="true">→</span></span></button>
            </div>
        </main> : <>
            <button type="button" onClick={() => setFlow(null)} className="mb-4 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-black text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]"><ArrowLeft size={15} /> Cambiar de flujo</button>
            {flow === 'chapter' ? <main className="mx-auto max-w-2xl rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-6 lg:p-9"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500"><FilePlus2 size={24} /></div><p className="mt-6 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-600">Nuevo capítulo</p><h2 className="mt-2 text-3xl font-serif font-black">Empieza con una página en blanco</h2><p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">Crea el capítulo vacío y continúa escribiendo en el editor, sin preparar una misión ni pedir una propuesta a la IA.</p>{state.designer?.writingStructure && <div className="mt-6 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-violet-500">Estructura aprobada</p><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-muted)]">{state.designer.writingStructure}</pre></div>}<label className="mt-8 block"><span className="text-sm font-black">Título del capítulo</span><input autoFocus value={newChapterTitle} onChange={(event) => setNewChapterTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && createBlankChapter()} placeholder="Ej. La última señal" className="mt-2 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] px-4 py-3 text-sm outline-none focus:border-emerald-500" /></label><button type="button" onClick={createBlankChapter} disabled={!newChapterTitle.trim()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"><BookOpen size={17} /> Crear y abrir editor</button></main> : flow === 'designer' ? <ChapterDesigner state={state} updateRoomState={updateRoomState} worldItems={worldItems} chapters={chapters} characters={characters} activeChapter={activeChapter} lazyLoadChapters={lazyLoadChapters} updateWorldItem={updateWorldItem} saveDocumentSnapshot={saveDocumentSnapshot} onWriteChapter={startChapterWriting} /> : <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-4"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Documento de trabajo</p><h2 className="mt-1 text-lg font-serif font-black">Capítulos</h2><div className="mt-4 max-h-[430px] space-y-1.5 overflow-y-auto pr-1">{chapters.filter((chapter) => !chapter.isVolume).map((chapter) => <button key={chapter.id} type="button" onClick={() => { selectChapter(chapter.id); updateRoomState('cowriter', { chapterId: chapter.id }); }} className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${selectedChapter?.id === chapter.id ? 'bg-indigo-500/10 text-indigo-500' : 'hover:bg-[var(--accent-soft)]'}`}><span className="text-[10px] font-black uppercase tracking-wider opacity-60">Capítulo</span><span className="mt-0.5 block truncate text-sm font-bold">{chapter.title}</span></button>)}{chapters.length === 0 && <p className="text-sm text-[var(--text-muted)]">No hay capítulos disponibles.</p>}</div></aside>
                <main className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 lg:p-7">{!selectedChapter ? <EmptyRoomState icon={BookOpen} title="Elige una escena para empezar" text="Selecciona un capítulo existente para definir la misión de escritura." /> : <>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500">Misión de escritura</p><h2 className="mt-2 text-3xl font-serif font-black">Trabajar en {selectedChapter.title}</h2>
                    <label className="block mt-8"><span className="text-sm font-black">¿Qué quieres conseguir?</span><textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Ej. Aumentar la tensión sin cambiar el desenlace…" rows={4} className="mt-2 w-full resize-none rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 text-sm outline-none focus:border-indigo-500" /></label>
                    <div className="mt-5 flex flex-wrap gap-2">{['Aumentar tensión', 'Pulir diálogo', 'Continuar escena', 'Mantener estilo'].map((suggestion) => <button key={suggestion} type="button" onClick={() => setObjective(suggestion)} className="rounded-full border border-[var(--border-main)] px-3 py-1.5 text-xs font-bold hover:border-indigo-500 hover:text-indigo-500">{suggestion}</button>)}</div>
                    <div className="mt-8 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-sm text-[var(--text-muted)]"><strong className="text-[var(--text-main)]">Flujo seguro:</strong> primero se crea una misión y una propuesta pendiente. IA Studio generará el contenido y mostrará la revisión antes de aplicar cualquier cambio.</div>
                    <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={!objective.trim()} onClick={createProposal} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"><Wand2 size={17} /> Crear propuesta</button>{state.pendingProposal && <button type="button" onClick={prepareWorkspace} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-4 py-3 text-sm font-black hover:border-indigo-500 hover:text-indigo-500"><BookOpen size={17} /> Abrir en IA Studio</button>}</div>
                    <ToolRoomAIProposal roomName="Coescritor" instruction={objective || 'Mejora la escena preservando hechos, tono y desenlace.'} sourceContent={selectedChapter.content || ''} contextContent={supportingContext} onApply={applyCowriterProposal} />
                    <ToolRoomHistoryPanel bookId={activeBook?.id} collectionName="chapters" entityId={selectedChapter.id} currentContent={selectedChapter.content || ''} onRestore={restoreChapter} />
                    <div className="mt-6"><ToolRoomProposalCard proposal={state.pendingProposal} onReview={prepareWorkspace} onDismiss={() => dismissProposal('cowriter')} /></div>
                </>}
                </main></div>}
        </>}
    </ToolRoomShell>;
};

const WORLD_TOOL_DOCUMENT_IDS = new Set(['system_core', 'system_estructura']);

const WorldRoom = () => {
    const room = getToolRoom('world');
    const { activeBook, chapters = [], worldItems = [], characters = [], updateWorldItem, saveDocumentSnapshot } = useData();
    const { getRoomState, updateRoomState } = useToolRooms();
    const state = getRoomState('world');
    const launch = useToolRoomLaunch('world');
    const [query, setQuery] = useState('');
    const worldToolItems = useMemo(() => worldItems.filter((item) => WORLD_TOOL_DOCUMENT_IDS.has(item.id)), [worldItems]);
    const filteredItems = useMemo(() => worldToolItems.filter((item) => String(item.title || '').toLowerCase().includes(query.toLowerCase())), [worldToolItems, query]);
    const selectedItem = worldToolItems.find((item) => item.id === (state.selectedWorldItemId || launch?.context?.worldItemIds?.find((id) => WORLD_TOOL_DOCUMENT_IDS.has(id)))) || null;
    const selectedWorldItemId = selectedItem?.id;
    const supportingWorldContext = useMemo(() => {
        if (!launch?.context) return '';
        const chapterIds = launch.context.chapterIds || [];
        const characterIds = launch.context.characterIds || [];
        const worldItemIds = launch.context.worldItemIds || [];
        return [
            ...chapters.filter((chapter) => chapterIds.includes(chapter.id)).map((chapter) => `Capítulo de apoyo: ${chapter.title}\n${chapter.content || ''}`),
            ...characters.filter((character) => characterIds.includes(character.id)).map((character) => `Personaje de apoyo: ${character.name}\n${character.description || ''}`),
            ...worldItems.filter((item) => WORLD_TOOL_DOCUMENT_IDS.has(item.id) && worldItemIds.includes(item.id) && item.id !== selectedWorldItemId).map((item) => `Mundo de apoyo: ${item.title}\n${item.content || ''}`),
        ].join('\n\n');
    }, [chapters, characters, launch, selectedWorldItemId, worldItems]);
    const applyWorldProposal = async (replacement, proposal) => {
        await updateWorldItem(selectedItem.id, { content: replacement });
        await saveEntitySnapshot(activeBook.id, 'world', selectedItem.id, replacement, 'toolroom-world');
        await saveDocumentSnapshot(selectedItem.id, replacement, 'toolroom-world');
        updateRoomState('world', { missionStatus: 'completed', lastProposalSummary: proposal.summary });
    };
    const restoreWorldItem = async (content) => {
        await saveEntitySnapshot(activeBook.id, 'world', selectedItem.id, selectedItem.content || '', 'before-restore');
        await updateWorldItem(selectedItem.id, { content });
        await saveEntitySnapshot(activeBook.id, 'world', selectedItem.id, content, 'restore');
    };
    return <ToolRoomShell room={room} context={<RoomContextBanner>{selectedItem ? `Documento seleccionado: ${selectedItem.title}` : 'Selecciona Información general o Estructura'}</RoomContextBanner>}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
            <main className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 lg:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-500">Mapa del universo</p><h2 className="mt-1 text-2xl font-serif font-black">Relaciones de tu mundo</h2></div><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar documento" className="w-52 rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] py-2 pl-9 pr-3 text-xs outline-none focus:border-emerald-500" /></div></div>
                {filteredItems.length === 0 ? <div className="mt-7"><EmptyRoomState icon={Network} title="Documentos base no disponibles" text="Este room trabaja únicamente con Información general y Estructura. Vuelve a cargar el libro para restaurar alguno que falte." /></div> : <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">{filteredItems.map((item) => <button type="button" key={item.id} onClick={() => updateRoomState('world', { selectedWorldItemId: item.id })} className={`rounded-2xl border p-4 text-left transition-colors ${selectedItem?.id === item.id ? 'border-emerald-500 bg-emerald-500/5' : 'border-[var(--border-main)] hover:border-emerald-500/50'}`}><div className="flex items-center gap-2 text-emerald-500"><FileText size={15} /><span className="text-[9px] font-black uppercase tracking-wider">Documento base</span></div><h3 className="mt-3 font-bold truncate">{item.id === 'system_core' ? 'Información general' : 'Estructura'}</h3><div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><Link2 size={13} /> Agregar, refinar y actualizar</div></button>)}</div>}
                {selectedItem && <><ToolRoomAIProposal roomName="Constructor de mundo" instruction={`Desarrolla ${selectedItem.title} con reglas, facciones, relaciones y detalles de continuidad. Conserva la información existente y evita contradicciones.`} sourceContent={selectedItem.content || ''} contextContent={supportingWorldContext} onApply={applyWorldProposal} /><ToolRoomHistoryPanel bookId={activeBook?.id} collectionName="world" entityId={selectedItem.id} currentContent={selectedItem.content || ''} onRestore={restoreWorldItem} /><div className="mt-4"><ToolRoomProposalCard proposal={state.pendingProposal} /></div></>}
            </main>
            <aside className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-500">Panel de continuidad</p><h2 className="mt-1 text-xl font-serif font-black">Resumen del proyecto</h2><div className="mt-6 space-y-3">{[['Documentos de trabajo', worldToolItems.length], ['Personajes de apoyo', characters.length], ['Conexiones', 'Próximamente']].map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-xl bg-[var(--bg-app)] px-3 py-3"><span className="text-sm text-[var(--text-muted)]">{label}</span><span className="text-sm font-black">{value}</span></div>)}</div><div className="mt-6 rounded-2xl border border-dashed border-[var(--border-main)] p-4 text-sm leading-relaxed text-[var(--text-muted)]"><strong className="text-[var(--text-main)]">Regla del room:</strong> toda la información del mundo se agrega, refina y actualiza dentro de estos dos documentos base.</div></aside>
        </div>
    </ToolRoomShell>;
};

const NarratorRoom = () => {
    const room = getToolRoom('narrator');
    const { activeBook, profile, chapters = [], characters = [], worldItems = [], activeChapter, selectChapter, setActiveView } = useData();
    const { getRoomState, updateRoomState } = useToolRooms();
    const state = getRoomState('narrator');
    const launch = useToolRoomLaunch('narrator');
    const selectedChapter = chapters.find((chapter) => chapter.id === (state.chapterId || launch?.context?.chapterIds?.[0])) || activeChapter || null;
    const nextChapter = selectedChapter ? chapters[chapters.findIndex((chapter) => chapter.id === selectedChapter.id) + 1] || null : null;
    const supportingNarrationContext = useMemo(() => {
        if (!launch?.context) return '';
        const characterIds = launch.context.characterIds || [];
        const worldItemIds = launch.context.worldItemIds || [];
        return [
            ...characters.filter((character) => characterIds.includes(character.id)).map((character) => `Personaje de apoyo: ${character.name}\n${character.description || ''}`),
            ...worldItems.filter((item) => worldItemIds.includes(item.id)).map((item) => `Mundo de apoyo: ${item.title}\n${item.content || ''}`),
        ].join('\n\n');
    }, [characters, launch, worldItems]);
    const narrador = useNarrador({ editor: null, isFocusMode: false, activeBook, activeChapter: selectedChapter, nextChapter, onSelectChapter: selectChapter, profileData: profile, toast: null });
    const narratorInsight = selectedChapter ? <ToolRoomAIInsight roomName="Narrador" instruction="Convierte el capítulo en un guion de narración con voz, pausas dramáticas y segmentos claros." sourceContent={selectedChapter.content || ''} contextContent={supportingNarrationContext} buttonLabel="Generar guion" /> : null;
    return <ToolRoomShell room={room} status={selectedChapter ? 'ready' : 'pending'} context={<RoomContextBanner status={selectedChapter ? 'ready' : 'pending'}>{selectedChapter ? `Audio preparado para: ${selectedChapter.title}` : 'Selecciona un capítulo para preparar la narración'}</RoomContextBanner>}>
        {selectedChapter && <NarradorPanel narrador={narrador} activeChapter={selectedChapter} onClose={narrador.stopNarration} />}
        {narratorInsight}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5"><aside className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-4"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Biblioteca de audio</p><h2 className="mt-1 text-lg font-serif font-black">Capítulos</h2><div className="mt-4 space-y-1.5">{chapters.filter((chapter) => !chapter.isVolume).map((chapter) => <button key={chapter.id} type="button" onClick={() => { selectChapter(chapter.id); updateRoomState('narrator', { chapterId: chapter.id }); }} className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left ${selectedChapter?.id === chapter.id ? 'bg-violet-500/10 text-violet-500' : 'hover:bg-[var(--accent-soft)]'}`}><Headphones size={15} /><span className="text-sm font-bold truncate">{chapter.title}</span></button>)}</div></aside><main className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 lg:p-7">{!selectedChapter ? <EmptyRoomState icon={Headphones} title="Prepara una narración" text="Selecciona un capítulo para revisar sus segmentos y configurar la experiencia de escucha." /> : <><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-500">Estudio de audio</p><h2 className="mt-2 text-3xl font-serif font-black">{selectedChapter.title}</h2></div><div className="rounded-2xl bg-violet-500/10 p-3 text-violet-500"><Headphones size={24} /></div></div><div className="mt-8 rounded-3xl border border-[var(--border-main)] bg-[var(--bg-app)] p-5"><div className="h-20 flex items-center gap-1 overflow-hidden opacity-60">{Array.from({ length: 48 }, (_, index) => <span key={index} className="flex-1 rounded-full bg-violet-500" style={{ height: `${20 + ((index * 17) % 62)}%` }} />)}</div><div className="mt-5 flex items-center justify-between text-xs text-[var(--text-muted)]"><span>0:00</span><span>Vista previa de segmentos</span><span>--:--</span></div></div><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => setActiveView('editor')} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white hover:bg-violet-500"><Play size={16} /> Abrir capítulo</button><button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-4 py-3 text-sm font-black hover:border-violet-500 hover:text-violet-500"><RefreshCw size={16} /> Preparar segmentos</button></div><p className="mt-5 text-xs leading-relaxed text-[var(--text-muted)]">La reproducción y regeneración por segmentos conservarán el texto original hasta que confirmes una acción.</p></>}</main></div>
    </ToolRoomShell>;
};

const CoherenceRoom = () => {
    const room = getToolRoom('coherence');
    const { activeBook, chapters = [], worldItems = [], characters = [], profile, lazyLoadChapters, updateChapter, updateWorldItem, updateCharacter } = useData();
    const { getRoomState, saveProposal, dismissProposal } = useToolRooms();
    const launch = useToolRoomLaunch('coherence');
    const state = getRoomState('coherence');
    const [ran, setRan] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);
    const [aiAudit, setAiAudit] = useState(null);
    const [auditDocuments, setAuditDocuments] = useState([]);
    const [auditHistory, setAuditHistory] = useState([]);
    const [activeHistoryId, setActiveHistoryId] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [isResumingHistory, setIsResumingHistory] = useState(false);
    const [aiAuditError, setAiAuditError] = useState('');
    const historyStorageKey = `verne-coherence-history:${activeBook?.id || 'no-book'}`;
    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(historyStorageKey);
            setAuditHistory(stored ? JSON.parse(stored) : []);
        } catch {
            setAuditHistory([]);
        }
    }, [historyStorageKey]);
    useEffect(() => {
        const handleOptionsGenerated = (event) => {
            const { findingId, options } = event.detail || {};
            if (!findingId || !Array.isArray(options)) return;
            setAiAudit((previous) => previous ? { ...previous, items: previous.items.map((item) => item.id === findingId ? { ...item, options, status: 'options_ready' } : item) } : previous);
            setAuditHistory((previous) => {
                const next = previous.map((entry) => {
                    if (entry.id !== activeHistoryId) return entry;
                    const items = entry.items.map((item) => item.id === findingId ? { ...item, options, status: 'options_ready' } : item);
                    const optionCount = items.reduce((total, item) => total + (item.options?.length || 0), 0);
                    return { ...entry, items, optionCount };
                });
                window.localStorage.setItem(historyStorageKey, JSON.stringify(next));
                return next;
            });
        };
        window.addEventListener('coherence-options-generated', handleOptionsGenerated);
        return () => window.removeEventListener('coherence-options-generated', handleOptionsGenerated);
    }, [activeHistoryId, historyStorageKey]);
    useEffect(() => {
        const handleHistoryCleared = () => {
            setAuditHistory([]);
            setActiveHistoryId(null);
        };
        window.addEventListener('coherence-history-cleared', handleHistoryCleared);
        return () => window.removeEventListener('coherence-history-cleared', handleHistoryCleared);
    }, []);
    const scopedContext = useMemo(() => {
        const context = launch?.context;
        if (!context) return { chapters, worldItems, characters };
        const selectedChapters = context.chapterIds?.length ? chapters.filter((item) => context.chapterIds.includes(item.id)) : chapters;
        const selectedWorldItems = context.worldItemIds?.length ? worldItems.filter((item) => context.worldItemIds.includes(item.id)) : worldItems;
        const selectedCharacters = context.characterIds?.length ? characters.filter((item) => context.characterIds.includes(item.id)) : characters;
        return { chapters: selectedChapters, worldItems: selectedWorldItems, characters: selectedCharacters };
    }, [chapters, characters, launch, worldItems]);
    const duplicateTitles = useMemo(() => { const entries = [...scopedContext.chapters, ...scopedContext.worldItems].map((item) => String(item.title || '').trim().toLowerCase()).filter(Boolean); return entries.filter((title, index) => entries.indexOf(title) !== index); }, [scopedContext]);
    const coherenceDocuments = useMemo(() => [
        ...scopedContext.chapters.map((item) => ({ id: item.id, label: `Capítulo · ${item.title}`, content: item.content || '', type: 'chapter' })),
        ...scopedContext.worldItems.map((item) => ({ id: item.id, label: `Mundo · ${item.title}`, content: item.content || '', type: 'worldItem' })),
        ...scopedContext.characters.map((item) => ({ id: item.id, label: `Personaje · ${item.name}`, content: item.description || '', type: 'character' })),
    ], [scopedContext]);
    const deleteHistoryEntry = (entryId) => {
        const nextHistory = auditHistory.filter((entry) => entry.id !== entryId);
        setAuditHistory(nextHistory);
        if (activeHistoryId === entryId) setActiveHistoryId(null);
        window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
    };
    const resumeHistory = async (entry) => {
        setIsResumingHistory(true);
        try {
            const chapterIds = (entry.documents || []).filter((document) => document.type === 'chapter').map((document) => document.id);
            const loadedChapters = await lazyLoadChapters(chapterIds);
            const loadedById = new Map((loadedChapters || []).map((chapter) => [chapter.id, chapter]));
            const documents = (entry.documents || []).map((storedDocument) => {
                const current = coherenceDocuments.find((document) => document.id === storedDocument.id);
                const loaded = loadedById.get(storedDocument.id);
                return current ? { ...current, content: loaded?.content || current.content || '', version: storedDocument.version || current.version || '' } : null;
            }).filter((document) => document?.content);
            setAuditDocuments(documents);
            setAiAudit({ summary: entry.summary || '', items: entry.items || [] });
            setAiAuditError('');
            setActiveHistoryId(entry.id);
            setRan(true);
            setShowHistory(false);
        } catch (error) {
            setAiAuditError(error?.message || 'No se pudo recuperar esta auditoría.');
        } finally {
            setIsResumingHistory(false);
        }
    };
    const prepareFindingResolution = async (finding, option) => {
        const currentDocuments = auditDocuments.filter((document) => option.documentIds.includes(document.id));
        const patches = await buildCoherencePatches({ profile, finding, option, documents: currentDocuments });
        for (const patch of patches) {
            const target = currentDocuments.find((document) => document.id === patch.documentId);
            if (!target || !applyPlainTextPatch(target.content, patch.originalText, patch.replacementText)) throw new Error(`El texto original ya no coincide en ${target?.label || patch.documentId}. Regenera las soluciones.`);
            if (patch.baseVersion && target.version && patch.baseVersion !== target.version) throw new Error(`El documento ${target.label || patch.documentId} cambió durante el análisis. Regenera las soluciones.`);
        }
        return patches;
    };
    const applyFindingResolution = async (finding, option, preparedPatches = null, action = {}) => {
        const currentDocuments = auditDocuments.filter((document) => option.documentIds.includes(document.id));
        const patches = preparedPatches || await prepareFindingResolution(finding, option);
        if (action.preview) return patches;
        const snapshots = [];
        for (const patch of patches) {
            const target = currentDocuments.find((document) => document.id === patch.documentId);
            if (!target || !applyPlainTextPatch(target.content, patch.originalText, patch.replacementText)) {
                throw new Error(`El texto original ya no coincide en ${target?.label || patch.documentId}. Regenera las soluciones.`);
            }
            if (patch.baseVersion && target.version && patch.baseVersion !== target.version) {
                throw new Error(`El documento ${target.label || patch.documentId} cambió durante el análisis. Regenera las soluciones.`);
            }
            snapshots.push({ target, patch });
        }
        for (const { target, patch } of snapshots) {
            const nextContent = applyPlainTextPatch(target.content, patch.originalText, patch.replacementText);
            await saveEntitySnapshot(activeBook.id, target.type === 'chapter' ? 'chapters' : target.type === 'worldItem' ? 'world' : 'characters', target.id, target.content, 'before-coherence-resolution');
            if (target.type === 'chapter') await updateChapter(target.id, { content: nextContent }, { immediate: true });
            else if (target.type === 'worldItem') await updateWorldItem(target.id, { content: nextContent }, { immediate: true });
            else await updateCharacter(target.id, { description: nextContent }, { immediate: true });
        }
        const verifiedDocuments = currentDocuments.map((document) => {
            const applied = patches.find((patch) => patch.documentId === document.id);
            return applied ? { ...document, content: applyPlainTextPatch(document.content, applied.originalText, applied.replacementText) || document.content } : document;
        });
        const verification = await validateCoherenceFinding({ profile, finding, documents: verifiedDocuments });
        if (verification.status === 'confirmed') throw new Error('La inconsistencia sigue presente después del cambio. Revisa la solución manualmente.');
        setAiAudit((previous) => previous ? {
            ...previous,
            items: previous.items.map((item) => item.id !== finding.id && item.documentIds?.some((id) => finding.documentIds.includes(id)) ? { ...item, status: 'stale' } : item),
        } : previous);
    };
    const findings = ran ? [{ type: duplicateTitles.length ? 'warning' : 'success', title: duplicateTitles.length ? 'Posibles títulos duplicados' : 'No se detectaron títulos duplicados', detail: duplicateTitles.length ? `${duplicateTitles.length} coincidencia(s) para revisar antes de continuar.` : 'La estructura de títulos está limpia.' }, { type: 'info', title: 'Cobertura del análisis', detail: `${scopedContext.chapters.length} capítulos, ${scopedContext.worldItems.length} documentos y ${scopedContext.characters.length} personajes disponibles.` }, ...(aiAudit?.items || []).map((item) => ({ type: item.severity === 'high' ? 'warning' : 'info', title: item.title || 'Hallazgo de IA', detail: item.detail || '' })), ...(aiAuditError ? [{ type: 'warning', title: 'Auditoría IA no completada', detail: aiAuditError }] : [])] : [];
    const runAudit = async () => {
        if (isAuditing) return;
        setIsAuditing(true);
        setRan(false);
        setAiAudit(null);
        setAiAuditError('');
        dismissProposal('coherence');
        try {
            const loadedChapters = await lazyLoadChapters(scopedContext.chapters.map((chapter) => chapter.id));
            const loadedById = new Map((loadedChapters || []).map((chapter) => [chapter.id, chapter]));
            const completeDocuments = coherenceDocuments.map((document) => {
                const loaded = loadedById.get(document.id);
                return loaded ? { ...document, content: loaded.content || '' } : document;
            }).filter((document) => document.content);
            setAuditDocuments(completeDocuments);
            const result = await requestCoherenceAnalysis({ profile, documents: completeDocuments });
            setAiAudit(result);
            const historyEntry = {
                id: `audit-${Date.now()}`,
                createdAt: new Date().toISOString(),
                summary: result.summary,
                findingCount: result.items.length,
                documentCount: completeDocuments.length,
                items: result.items,
                documents: completeDocuments.map((document) => ({ id: document.id, title: document.title || document.label || document.id, type: document.type, version: document.version || '' })),
            };
            setActiveHistoryId(historyEntry.id);
            const nextHistory = [historyEntry, ...auditHistory].slice(0, 15);
            setAuditHistory(nextHistory);
            window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
            saveProposal('coherence', {
                title: 'Reporte de auditoría de coherencia',
                summary: result.items.length ? `Se detectaron ${result.items.length} inconsistencia(s) para revisar individualmente.` : 'No se detectaron contradicciones objetivas con evidencia suficiente.',
                contextLabel: `${completeDocuments.length} documentos`,
                risk: 'low',
            });
        } catch (error) {
            setAiAuditError(error?.message || 'No se pudo completar la auditoría con IA.');
            dismissProposal('coherence');
        }
        setRan(true);
        setIsAuditing(false);
    };
    return <ToolRoomShell room={room} status={isAuditing ? 'processing' : ran ? 'saved' : 'ready'} headerAction={<button type="button" onClick={() => setShowHistory(true)} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 px-3 py-2 text-xs font-bold text-cyan-500 hover:bg-cyan-500/10 transition-colors" title="Abrir historial de análisis"><History size={15} /><span>Historial ({auditHistory.length})</span></button>} context={<RoomContextBanner>{scopedContext.chapters.length + scopedContext.worldItems.length + scopedContext.characters.length} documentos listos para auditar</RoomContextBanner>}><div className="max-w-4xl mx-auto"><div className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-6 lg:p-8"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-500">Control de calidad</p><h2 className="mt-2 text-3xl font-serif font-black">Auditoría de coherencia</h2><p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">Primero detecta y valida. Después cada inconsistencia podrá resolverse de forma independiente.</p></div><button type="button" onClick={runAudit} disabled={isAuditing} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white hover:bg-cyan-500 disabled:cursor-wait disabled:opacity-70">{isAuditing ? <><Loader2 size={17} className="animate-spin" /> Analizando…</> : <><Search size={17} /> Analizar coherencia</>}</button></div>{isAuditing ? <div className="mt-8 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6 text-center"><Loader2 size={26} className="animate-spin text-cyan-500" /><p className="mt-4 text-sm font-black">Analizando la coherencia de tu obra…</p><p className="mt-1 text-xs text-[var(--text-muted)]">La IA está revisando los documentos completos.</p></div> : !ran ? <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">{[['Estructura', scopedContext.chapters.length, FileText], ['Mundo', scopedContext.worldItems.length, Network], ['Personajes', scopedContext.characters.length, Sparkles]].map(([label, count, icon]) => <div key={label} className="rounded-2xl bg-[var(--bg-app)] p-4">{React.createElement(icon, { size: 18, className: 'text-cyan-500' })}<p className="mt-4 text-2xl font-black">{count}</p><p className="text-xs text-[var(--text-muted)]">{label}</p></div>)}</div> : <div className="mt-8 space-y-4"><div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-[var(--text-muted)]">{aiAudit?.items?.length ? `Se detectaron ${aiAudit.items.length} inconsistencia(s). Cada una se puede resolver por separado.` : aiAuditError ? `La auditoría no se completó: ${aiAuditError}` : 'No se detectaron contradicciones objetivas con evidencia suficiente.'}</div>{findings.slice(0, 2).map((finding) => <div key={finding.title} className="flex gap-3 rounded-2xl border border-[var(--border-main)] p-4"><div className={`mt-0.5 ${finding.type === 'warning' ? 'text-amber-500' : finding.type === 'success' ? 'text-emerald-500' : 'text-cyan-500'}`}>{finding.type === 'warning' ? <AlertTriangle size={18} /> : finding.type === 'success' ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}</div><div><p className="text-sm font-black">{finding.title}</p><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{finding.detail}</p></div></div>)}{(aiAudit?.items || []).map((finding, index) => <CoherenceFindingCard key={`${finding.id || finding.title || 'finding'}-${index}`} finding={{ ...finding, type: finding.severity === 'high' ? 'warning' : 'info' }} documents={auditDocuments.filter((document) => finding.documentIds?.includes(document.id))} onApply={applyFindingResolution} />)}<div className="mt-5"><ToolRoomProposalCard proposal={state.pendingProposal} onDismiss={() => dismissProposal('coherence')} /></div><button type="button" onClick={() => setRan(false)} className="mt-3 inline-flex items-center gap-2 text-xs font-black text-[var(--text-muted)] hover:text-cyan-500"><RefreshCw size={14} /> Ejecutar otra revisión</button></div>}{showHistory && <CoherenceHistoryModal entries={auditHistory} onClose={() => setShowHistory(false)} onResume={resumeHistory} onDelete={deleteHistoryEntry} isResuming={isResumingHistory} />}</div></div></ToolRoomShell>;
};

export { CoWriterRoom, WorldRoom, NarratorRoom, CoherenceRoom };
