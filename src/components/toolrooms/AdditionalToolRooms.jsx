import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, FilePlus2, Headphones, Play, Sparkles, UsersRound } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToolRooms } from '../../context/ToolRoomContext';
import { getToolRoom } from './toolRoomCatalog';
import ToolRoomShell from './ToolRoomShell';
import ChapterDesigner from './ChapterDesigner';
import ChapterWriter from './ChapterWriter';
import CharacterToolRoom from './CharacterToolRoom';
import useToolRoomLaunch from './useToolRoomLaunch';
import { useNarrador } from '../narrador/useNarrador';
import NarradorPanel from '../narrador/NarradorPanel';
import NarradorCloudBackupPanel from '../narrador/NarradorCloudBackupPanel';
import NarradorExportPanel from '../narrador/NarradorExportPanel';
import { useToast } from '../Toast';

const RoomContextBanner = ({ children, status = 'ready' }) => <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-4"><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Contexto activo</p><p className="mt-1 truncate text-sm font-bold">{children}</p></div><span className={`shrink-0 text-[10px] font-black uppercase tracking-wider ${status === 'pending' ? 'text-amber-500' : 'text-emerald-500'}`}>{status === 'pending' ? 'Requiere selección' : 'Controlado'}</span></div>;

const EmptyRoomState = ({ icon: Icon, title, text }) => <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border-main)] p-8 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-main)]">{React.createElement(Icon, { size: 25 })}</div><h2 className="mt-5 text-2xl font-serif font-black">{title}</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">{text}</p></div>;

const CoWriterRoom = () => {
    const room = getToolRoom('creative-studio');
    const { chapters = [], characters = [], worldItems = [], activeChapter, selectChapter, createChapter, setActiveView, lazyLoadChapters, updateWorldItem, saveDocumentSnapshot } = useData();
    const { getRoomState, updateRoomState } = useToolRooms();
    const launch = useToolRoomLaunch('creative-studio');
    const state = getRoomState('creative-studio');
    const initialFlow = ['character', 'writer', 'designer'].includes(launch?.workflow) ? launch.workflow : null;
    const [flow, setFlow] = useState(initialFlow);
    const launchedState = useMemo(() => ({
        ...state,
        selectedCharacterId: launch?.context?.characterIds?.[0] || state.selectedCharacterId,
        designer: launch?.prompt && launch.workflow === 'designer'
            ? { launchObjective: launch.prompt, idea: launch.prompt }
            : { ...(state.designer || {}), ...(launch?.prompt ? { launchObjective: launch.prompt } : {}) },
    }), [launch, state]);
    const selectedChapter = chapters.find((chapter) => chapter.id === launchedState.chapterId) || activeChapter || null;

    const startChapterWriting = ({ structure, plan }) => {
        updateRoomState('creative-studio', { designer: { ...(state.designer || {}), writingStructure: structure, writingPlan: plan } });
        setFlow('writer');
    };
    if (flow === 'character') return <ToolRoomShell room={room} status="ready" context={<RoomContextBanner>Diseñar personaje</RoomContextBanner>}><button type="button" onClick={() => setFlow(null)} className="mb-4 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-black text-[var(--text-muted)] hover:bg-[var(--accent-soft)]"><ArrowLeft size={15} /> Cambiar de flujo</button><CharacterToolRoom launchOverride={launch} /></ToolRoomShell>;
    if (flow === 'writer') return <ToolRoomShell room={room} status="ready" context={<RoomContextBanner>Redactar desde estructura</RoomContextBanner>}><button type="button" onClick={() => setFlow(null)} className="mb-4 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-black text-[var(--text-muted)] hover:bg-[var(--accent-soft)]"><ArrowLeft size={15} /> Cambiar de flujo</button><ChapterWriter state={launchedState} updateRoomState={updateRoomState} worldItems={worldItems} chapters={chapters} characters={characters} activeChapter={activeChapter} lazyLoadChapters={lazyLoadChapters} createChapter={createChapter} selectChapter={selectChapter} setActiveView={setActiveView} onGoDesigner={() => setFlow('designer')} /></ToolRoomShell>;
    if (flow === 'designer') return <ToolRoomShell room={room} status="ready" context={<RoomContextBanner>Diseñar capítulo y escenas</RoomContextBanner>}><button type="button" onClick={() => setFlow(null)} className="mb-4 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-black text-[var(--text-muted)] hover:bg-[var(--accent-soft)]"><ArrowLeft size={15} /> Cambiar de flujo</button><ChapterDesigner state={launchedState} updateRoomState={updateRoomState} worldItems={worldItems} chapters={chapters} characters={characters} activeChapter={activeChapter} lazyLoadChapters={lazyLoadChapters} updateWorldItem={updateWorldItem} saveDocumentSnapshot={saveDocumentSnapshot} onWriteChapter={startChapterWriting} /></ToolRoomShell>;
    return <ToolRoomShell room={room} status="ready" context={<RoomContextBanner>Elige un submodo creativo</RoomContextBanner>}><main className="mx-auto max-w-5xl rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-6 lg:p-10"><div className="mx-auto max-w-2xl text-center"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-500">Estudio creativo</p><h2 className="mt-3 text-3xl font-serif font-black sm:text-4xl">Construye antes de escribir</h2><p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">Cada submodo produce una propuesta revisable y mantiene el canon separado de la creación.</p></div><div className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-3"><button type="button" onClick={() => setFlow('writer')} className="group rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-left transition-all hover:-translate-y-1 hover:border-emerald-500"><FilePlus2 className="text-emerald-500" size={24} /><h3 className="mt-6 text-xl font-serif font-black">Redactar capítulo</h3><p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">Convierte una estructura aprobada en un borrador revisable.</p></button><button type="button" onClick={() => setFlow('designer')} className="group rounded-3xl border border-violet-500/30 bg-violet-500/5 p-6 text-left transition-all hover:-translate-y-1 hover:border-violet-500"><Sparkles className="text-violet-500" size={24} /><h3 className="mt-6 text-xl font-serif font-black">Diseñar capítulo</h3><p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">Define escenas, conflicto, ritmo y consecuencias antes de redactar.</p></button><button type="button" onClick={() => setFlow('character')} className="group rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6 text-left transition-all hover:-translate-y-1 hover:border-amber-500"><UsersRound className="text-amber-500" size={24} /><h3 className="mt-6 text-xl font-serif font-black">Diseñar personaje</h3><p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">Trabaja identidad, psicología, relaciones y trayectoria.</p></button></div>{selectedChapter && <div className="mt-6 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 text-xs text-[var(--text-muted)]">Capítulo activo: <strong className="text-[var(--text-main)]">{selectedChapter.title}</strong></div>}</main></ToolRoomShell>;
};

const NarratorRoom = () => {
    const room = getToolRoom('narrator');
    const { activeBook, profile, chapters = [], activeChapter, setActiveView, lazyLoadChapters } = useData();
    const { getRoomState, updateRoomState } = useToolRooms();
    const state = getRoomState('narrator');
    const launch = useToolRoomLaunch('narrator');
    const toast = useToast();
    const [isPlayerOpen, setIsPlayerOpen] = useState(true);
    const [isChapterPickerOpen, setIsChapterPickerOpen] = useState(false);
    const [isCloudSyncing, setIsCloudSyncing] = useState(false);
    const playableChapters = useMemo(() => chapters.filter((chapter) => !chapter.isVolume), [chapters]);
    const selectedChapterId = state.chapterId || launch?.context?.chapterIds?.[0] || activeChapter?.id || null;
    const listedSelectedChapter = playableChapters.find((chapter) => chapter.id === selectedChapterId);
    const selectedChapter = listedSelectedChapter || (activeChapter?.id === selectedChapterId || !selectedChapterId ? activeChapter : null);
    const chapterReady = Boolean(selectedChapter?.isLoaded || selectedChapter?.content !== undefined);
    const selectedChapterIndex = selectedChapter ? playableChapters.findIndex((chapter) => chapter.id === selectedChapter.id) : -1;
    const nextChapter = selectedChapter ? playableChapters[playableChapters.findIndex((chapter) => chapter.id === selectedChapter.id) + 1] || null : null;
    useEffect(() => {
        if (!activeBook?.id || !selectedChapterId || chapterReady) return undefined;
        lazyLoadChapters([selectedChapterId])
            .catch((error) => {
                console.error('[Narrador] No se pudo precargar el capítulo seleccionado', error);
            })
        return undefined;
    }, [activeBook?.id, chapterReady, lazyLoadChapters, selectedChapterId]);

    const handleSelectChapter = useCallback((chapter) => {
        if (isCloudSyncing) return;
        const chapterId = typeof chapter === 'string' ? chapter : chapter?.id;
        if (!chapterId) return;
        const chapterReference = playableChapters.find((item) => item.id === chapterId);
        if (!chapterReference) return;

        // El Narrador tiene su propia selección. No debemos usar selectChapter,
        // porque esa acción global cambia la vista al editor. La precarga se
        // dispara al cambiar el ID y dejamos la vista del Narrador intacta.
        updateRoomState('narrator', { chapterId });
    }, [isCloudSyncing, playableChapters, updateRoomState]);
    const handleChapterPickerChange = (event) => {
        const chapter = playableChapters.find((item) => item.id === event.target.value);
        if (!chapter) return;
        setIsPlayerOpen(true);
        setIsChapterPickerOpen(false);
        handleSelectChapter(chapter);
    };
    const narrador = useNarrador({ editor: null, isFocusMode: false, activeBook, activeChapter: selectedChapter, nextChapter, onSelectChapter: handleSelectChapter, profileData: profile, toast });
    const currentSegments = narrador.segments || [];
    const variantKey = [
        profile?.aiConfig?.geminiLiveModel || 'gemini-3.1-flash-live-preview',
        profile?.aiConfig?.narradorVoice || 'Puck',
        profile?.aiConfig?.narradorTone || 'auto',
        'prompt-v2'
    ].join('|');
    const closePlayer = useCallback(() => {
        narrador.stopNarration();
        if (narrador.isNarratorMode) narrador.toggleNarratorMode();
        setIsPlayerOpen(false);
    }, [narrador, setIsPlayerOpen]);
    const openPreparation = () => {
        setIsPlayerOpen(true);
        narrador.prepareAudio('chapter');
    };

    return (
        <ToolRoomShell
            room={room}
            status={selectedChapter && chapterReady ? 'ready' : 'pending'}
        >
            <main className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 lg:p-7">
                    {!selectedChapter ? (
                        <EmptyRoomState icon={Headphones} title="Prepara una narración" text="Selecciona un capítulo para preparar su audio sin modificar el manuscrito." />
                    ) : !chapterReady ? (
                        <EmptyRoomState icon={Headphones} title="Cargando capítulo" text="Estamos cargando el contenido del capítulo seleccionado para preparar su narración." />
                    ) : (
                        <>
                            <div className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Fuente de audio</p>
                                    <p className="mt-1 text-xs text-[var(--text-muted)]">Selecciona el capítulo que quieres preparar</p>
                                </div>
                                {playableChapters.length > 0 && <div className="relative w-full sm:w-auto sm:min-w-[280px]">
                                    <button
                                        type="button"
                                        aria-haspopup="listbox"
                                        aria-expanded={isChapterPickerOpen}
                                        disabled={isCloudSyncing}
                                        onClick={() => setIsChapterPickerOpen((value) => !value)}
                                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] px-3 py-3 text-left text-sm font-bold outline-none transition-colors hover:border-violet-500 focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <span className="min-w-0 truncate">{selectedChapterIndex + 1}. {selectedChapter.title}</span>
                                        <ChevronDown size={15} className={`shrink-0 text-[var(--text-muted)] transition-transform ${isChapterPickerOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isChapterPickerOpen && <>
                                        <button type="button" aria-label="Cerrar selector de capítulos" className="fixed inset-0 z-40 cursor-default" onClick={() => setIsChapterPickerOpen(false)} />
                                        <div role="listbox" aria-label="Seleccionar capítulo" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-1.5 shadow-2xl">
                                            {playableChapters.map((chapter, index) => <button key={chapter.id} type="button" role="option" aria-selected={selectedChapter.id === chapter.id} onClick={() => handleChapterPickerChange({ target: { value: chapter.id } })} className={`w-full rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${selectedChapter.id === chapter.id ? 'bg-violet-500/10 text-violet-600' : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'}`}><span className="block truncate">{index + 1}. {chapter.title}</span></button>)}
                                        </div>
                                    </>}
                                </div>}
                            </div>
                            <section className="space-y-5" aria-label="Reproductor de narración">
                                {isPlayerOpen ? <NarradorPanel narrador={narrador} activeChapter={selectedChapter} onClose={closePlayer} embedded /> : <button type="button" onClick={() => setIsPlayerOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 px-4 py-3 text-sm font-black text-violet-600 hover:bg-violet-500/10"><Headphones size={16} /> Abrir reproductor</button>}
                                <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 text-xs leading-relaxed text-[var(--text-muted)]"><strong className="text-[var(--text-main)]">Modo automático: </strong>reproduce el capítulo con la segmentación normal. Usa “Preparar” dentro del reproductor si quieres generar el audio en caché antes de escucharlo.</div>
                            </section>

                            <section className="mt-8" aria-label="Respaldo de narración">
                                <NarradorCloudBackupPanel
                                    profile={profile}
                                    bookId={activeBook?.id}
                                    chapterId={selectedChapter.id}
                                    chapterTitle={selectedChapter.title}
                                    segments={currentSegments}
                                    onCacheChanged={narrador.refreshCacheStats}
                                    onSegmentCached={narrador.markSegmentCached}
                                    onSyncStateChange={setIsCloudSyncing}
                                />
                            </section>

                            <section className="mt-5" aria-label="Exportación de narración">
                                <NarradorExportPanel
                                    bookId={activeBook?.id}
                                    chapterId={selectedChapter.id}
                                    chapterTitle={selectedChapter.title}
                                    segments={currentSegments}
                                    variantKey={variantKey}
                                    onPrepare={openPreparation}
                                    onOpenPlayer={() => setIsPlayerOpen(true)}
                                />
                            </section>

                            <div className="mt-5 flex flex-wrap gap-3">
                                <button type="button" onClick={() => setActiveView('editor')} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-4 py-3 text-sm font-black hover:border-violet-500"><Play size={16} /> Abrir capítulo</button>
                            </div>
                        </>
                    )}
            </main>
        </ToolRoomShell>
    );
};

export { CoWriterRoom, NarratorRoom };
