import React, { useEffect, useMemo } from 'react';
import { Check, ChevronRight, Sparkles, UserRound } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToolRooms } from '../../context/ToolRoomContext';
import ToolRoomProposalCard from './ToolRoomProposalCard';
import ToolRoomAIProposal from './ToolRoomAIProposal';
import ToolRoomHistoryPanel from './ToolRoomHistoryPanel';
import ToolRoomCreateEntity from './ToolRoomCreateEntity';
import useToolRoomLaunch from './useToolRoomLaunch';
import { saveEntitySnapshot } from '../../services/db';

const visualReviewMode = import.meta.env.DEV && import.meta.env.VITE_VISUAL_REVIEW === 'true';

const CharacterToolRoom = () => {
    const { activeBook, chapters = [], characters = [], worldItems = [], createCharacter, updateCharacter } = useData();
    const { getRoomState, updateRoomState, dismissProposal, openToolRoom } = useToolRooms();
    const state = getRoomState('creative-studio');
    const launch = useToolRoomLaunch('creative-studio');
    const selectedCharacterId = state.selectedCharacterId || launch?.context?.characterIds?.[0] || null;
    const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) || null;
    const supportingContext = useMemo(() => {
        if (!launch?.context) return '';
        const chapterIds = launch.context.chapterIds || [];
        const characterIds = launch.context.characterIds || [];
        const worldItemIds = launch.context.worldItemIds || [];
        return [
            ...chapters.filter((chapter) => chapterIds.includes(chapter.id)).map((chapter) => `Capítulo de apoyo: ${chapter.title}\n${chapter.content || ''}`),
            ...characters.filter((character) => characterIds.includes(character.id) && character.id !== selectedCharacterId).map((character) => `Personaje de apoyo: ${character.name}\n${character.description || ''}`),
            ...worldItems.filter((item) => worldItemIds.includes(item.id)).map((item) => `Mundo de apoyo: ${item.title}\n${item.content || ''}`),
        ].join('\n\n');
    }, [chapters, characters, launch, selectedCharacterId, worldItems]);

    useEffect(() => {
        if (!state.lastVisitedAt) updateRoomState('creative-studio', { lastVisitedAt: new Date().toISOString() });
    }, [state.lastVisitedAt, updateRoomState]);

    const selectCharacter = (characterId) => updateRoomState('creative-studio', { selectedCharacterId: characterId });

    const sendCharacterProposalToConstructor = async (replacement, proposal) => {
        try {
            window.sessionStorage.setItem('verne-ia-studio-launch', JSON.stringify({
                roomId: 'global-constructor',
                prompt: `Revisa esta propuesta para la ficha de ${selectedCharacter.name}. Analiza su impacto en el canon y prepara un plan aprobado antes de aplicarla.\n\nResumen de la propuesta:\n${proposal.summary || '(sin resumen)'}\n\nReemplazo propuesto:\n${replacement}`,
                context: { chapterIds: [], characterIds: [selectedCharacter.id], worldItemIds: [] },
                contextLabel: selectedCharacter.name,
                createdAt: new Date().toISOString(),
            }));
        } catch {
            throw new Error('No se pudo preparar la propuesta para el Constructor Global.');
        }
        updateRoomState('creative-studio', { missionStatus: 'proposal_ready', lastProposalSummary: proposal.summary });
        openToolRoom('toolroom:global-constructor');
    };
    const restoreCharacter = async (content) => {
        await saveEntitySnapshot(activeBook.id, 'characters', selectedCharacter.id, selectedCharacter.description || '', 'before-restore');
        await updateCharacter(selectedCharacter.id, { description: content });
        await saveEntitySnapshot(activeBook.id, 'characters', selectedCharacter.id, content, 'restore');
    };
    const createNewCharacter = async ({ name, content }) => {
        const created = await createCharacter({ name, description: content });
        if (!created?.id) throw new Error('No se pudo crear el personaje.');
        await saveEntitySnapshot(activeBook.id, 'characters', created.id, content, 'toolroom-characters-create');
        updateRoomState('creative-studio', { selectedCharacterId: created.id, missionStatus: 'completed' });
    };

    return (
        <div>
            <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5">
                <aside className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Elenco</p>
                            <h2 className="font-serif font-black text-lg">Personajes</h2>
                        </div>
                        <span className="text-[10px] font-black text-[var(--text-muted)]">{characters.length}</span>
                    </div>
                    {characters.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[var(--border-main)] p-5 text-center text-sm text-[var(--text-muted)]">Aún no hay personajes en este libro.</div>
                    ) : (
                        <div className="space-y-1.5">
                            {characters.map((character) => {
                                const active = character.id === state.selectedCharacterId;
                                return <button key={character.id} type="button" onClick={() => selectCharacter(character.id)} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? 'bg-[var(--accent-soft)] text-[var(--accent-main)]' : 'hover:bg-[var(--accent-soft)]/60 text-[var(--text-main)]'}`}>
                                    <span className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${active ? 'bg-[var(--accent-main)] text-white' : 'bg-[var(--accent-soft)] text-[var(--accent-main)]'}`}><UserRound size={15} /></span>
                                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{character.name}</span>
                                    {active ? <Check size={15} /> : <ChevronRight size={14} className="opacity-40" />}
                                </button>;
                            })}
                        </div>
                    )}
                </aside>

                <main className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 lg:p-7 min-h-[360px]">
                    {!selectedCharacter ? (
                        <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center"><Sparkles size={28} /></div>
                            <h2 className="mt-5 text-2xl font-serif font-black">Comienza con un personaje</h2>
                            <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">Elige un personaje del elenco. Esta sala conservará tu selección para que puedas continuar más tarde sin perder el contexto.</p>
                            <ToolRoomCreateEntity roomName="Constructor de personajes" entityLabel="personaje" placeholder="Nombre del nuevo personaje" contextContent={supportingContext} onCreate={createNewCharacter} />
                        </div>
                    ) : (
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-500">Ficha de trabajo</p>
                            <h2 className="mt-2 text-3xl font-serif font-black">{selectedCharacter.name}</h2>
                            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">La sala está lista para construir su identidad, psicología, relaciones y evolución narrativa. Las propuestas sobre una ficha existente pasan por el Constructor Global antes de cambiar el canon.</p>
                            <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {['Identidad', 'Psicología', 'Trayectoria'].map((label) => <div key={label} className="rounded-2xl border border-[var(--border-main)] p-4 text-left"><p className="text-sm font-black">{label}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Se trabaja dentro de la ficha revisable.</p></div>)}
                            </div>
                            <ToolRoomAIProposal roomName="Diseñador de personajes" instruction={`Desarrolla la identidad, psicología, motivaciones y arco narrativo de ${selectedCharacter.name}. Conserva los hechos existentes y mejora la ficha.`} sourceContent={selectedCharacter.description || ''} contextContent={supportingContext} onApply={sendCharacterProposalToConstructor} applyLabel="Enviar al Constructor Global" />
                            {!visualReviewMode && <ToolRoomHistoryPanel bookId={activeBook?.id} collectionName="characters" entityId={selectedCharacter.id} currentContent={selectedCharacter.description || ''} onRestore={restoreCharacter} />}
                            <div className="mt-5"><ToolRoomProposalCard proposal={state.pendingProposal} onDismiss={() => dismissProposal('creative-studio')} /></div>
                            <div className="mt-7 rounded-2xl border border-dashed border-[var(--border-main)] p-4 text-sm text-[var(--text-muted)]"><strong className="text-[var(--text-main)]">Siguiente paso:</strong> define un objetivo para que las acciones de IA trabajen sobre una intención concreta.</div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default CharacterToolRoom;
