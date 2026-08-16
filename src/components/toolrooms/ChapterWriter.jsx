import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToolRooms } from '../../context/ToolRoomContext';
import ToolRoomAIProposal from './ToolRoomAIProposal';
import { getStructureSourceHash, requestChapterStructureAnalysis } from '../../services/ai-next/ToolRoomAIService';
import { saveEntitySnapshot, updateChapterContent } from '../../services/db';
import { saveLocalSnapshot } from '../../services/localDb';
import { toEditorHtml } from '../../services/ai-next/plainText';

const SIZE_OPTIONS = [
    { id: 'brief', label: 'Breve', detail: '500–900 palabras' },
    { id: 'standard', label: 'Estándar', detail: '1,200–2,000 palabras' },
    { id: 'large', label: 'Amplio', detail: '2,500–4,000 palabras' },
    { id: 'custom', label: 'Personalizado', detail: 'Define un rango' },
];

const plain = (value) => String(value || '').trim();

const ChapterWriter = ({ state, updateRoomState, worldItems, chapters, characters, activeChapter, lazyLoadChapters, createChapter, selectChapter, setActiveView, onGoDesigner }) => {
    const { activeBook, profile } = useData();
    const { completeMission } = useToolRooms();
    const structureItem = worldItems.find((item) => item.id === 'system_estructura');
    const worldItem = worldItems.find((item) => item.id === 'system_core');
    const structureContent = plain(structureItem?.content);
    const sourceHash = getStructureSourceHash({ structureContent });
    const storedDesigner = state.designer || {};
    const cachedAnalysis = storedDesigner.analysisSourceHash === sourceHash ? storedDesigner.analysis : null;
    const [analysis, setAnalysis] = useState(cachedAnalysis);
    const [selectedPlan, setSelectedPlan] = useState(storedDesigner.writingPlan || null);
    const [planDraft, setPlanDraft] = useState(storedDesigner.writingPlan || null);
    const [size, setSize] = useState(storedDesigner.size || 'standard');
    const [customMin, setCustomMin] = useState(storedDesigner.customMin || 500);
    const [customMax, setCustomMax] = useState(storedDesigner.customMax || 2000);
    const [status, setStatus] = useState(cachedAnalysis ? 'ready' : 'idle');
    const [error, setError] = useState('');

    const lastChapter = activeChapter || [...chapters].filter((chapter) => !chapter.isVolume).sort((a, b) => (b.orderIndex ?? 0) - (a.orderIndex ?? 0))[0] || null;
    const hasStructure = structureContent.length > 0;
    const pendingChapters = analysis?.pendingChapters || [];
    const matchedChapter = selectedPlan && chapters.find((chapter) => !chapter.isVolume && chapter.title.trim().toLowerCase() === selectedPlan.title.trim().toLowerCase());
    const selectedExistingChapter = matchedChapter?.content?.trim() ? matchedChapter : null;
    const selectedEmptyChapter = matchedChapter && !selectedExistingChapter ? matchedChapter : null;
    const busy = status === 'loading' || status === 'saving';
    const sizeLabel = size === 'custom' ? `${customMin}–${customMax} palabras` : SIZE_OPTIONS.find((option) => option.id === size)?.detail || `${customMin}–${customMax} palabras`;
    const approvedScenes = useMemo(() => storedDesigner.scenes || planDraft?.scenes || selectedPlan?.scenes || [], [planDraft?.scenes, selectedPlan?.scenes, storedDesigner.scenes]);

    const runAnalysis = async () => {
        if (!hasStructure) return;
        setStatus('loading');
        setError('');
        try {
            const loaded = await lazyLoadChapters(chapters.filter((chapter) => !chapter.isVolume).map((chapter) => chapter.id));
            const loadedById = new Map((loaded || []).map((chapter) => [chapter.id, chapter]));
            const chapterDocuments = chapters.filter((chapter) => !chapter.isVolume).map((chapter) => ({ ...chapter, ...(loadedById.get(chapter.id) || {}) }));
            const result = await requestChapterStructureAnalysis({
                profile,
                structureContent,
                chapters: chapterDocuments,
                lastChapter,
                worldContent: worldItem?.content || '',
                characters,
            });
            setAnalysis(result);
            updateRoomState('cowriter', { designer: { ...(state.designer || {}), analysis: result, analysisSourceHash: sourceHash, analysisAnalyzedAt: new Date().toISOString() } });
            setStatus('ready');
        } catch (requestError) {
            setError(requestError?.message || 'No se pudo analizar la estructura.');
            setStatus('error');
        }
    };

    useEffect(() => {
        if (hasStructure && !cachedAnalysis && status === 'idle') void runAnalysis();
        // El análisis se invalida únicamente cuando cambia el documento de Estructura.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceHash, hasStructure, Boolean(cachedAnalysis)]);

    const choosePlan = (plan) => {
        setSelectedPlan(plan);
        setPlanDraft({ ...plan });
    };

    const contextContent = useMemo(() => [
        `Documento Estructura:\n${structureContent}`,
        `Estructura aprobada desde el diseñador:\n${storedDesigner.writingStructure || '(usar la ficha seleccionada)'}`,
        `Estructura aprobada del capítulo:\n${JSON.stringify(planDraft || selectedPlan || {})}`,
        `Escenas aprobadas:\n${JSON.stringify(approvedScenes)}`,
        `Último capítulo:\n${lastChapter?.content || ''}`,
        `Información general:\n${worldItem?.content || ''}`,
        `Personajes:\n${characters.map((character) => `${character.name}: ${character.description || ''}`).join('\n')}`,
    ].join('\n\n'), [approvedScenes, characters, lastChapter, planDraft, selectedPlan, structureContent, storedDesigner.writingStructure, worldItem]);

    const applyDraft = async (replacement, proposal) => {
        if (!planDraft || selectedExistingChapter) return;
        setStatus('saving');
        try {
            const editorContent = toEditorHtml(replacement);
            const target = selectedEmptyChapter || await createChapter({ title: planDraft.title, content: editorContent, parentId: null, isVolume: false }, { preventRedirect: true });
            if (!target?.id) throw new Error('No se pudo crear el capítulo.');
            if (selectedEmptyChapter) await updateChapterContent(activeBook.id, target.id, editorContent);
            await saveEntitySnapshot(activeBook.id, 'chapters', target.id, editorContent, 'toolroom-cowriter-structure');
            await saveLocalSnapshot(target.id, editorContent, 'toolroom-cowriter-structure');
            await selectChapter(target);
            completeMission('cowriter');
            updateRoomState('cowriter', { chapterId: target.id, missionStatus: 'completed', lastProposalSummary: proposal.summary, designer: { ...(state.designer || {}), writingStructure: JSON.stringify(planDraft) } });
            setActiveView('editor');
        } catch (createError) {
            setError(createError?.message || 'No se pudo crear el capítulo.');
            setStatus('error');
            throw createError;
        }
    };

    if (!hasStructure) return <section className="mx-auto max-w-3xl rounded-3xl border border-amber-500/25 bg-[var(--bg-editor)] p-6 text-center lg:p-9"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600"><AlertTriangle size={26} /></div><p className="mt-6 text-[9px] font-black uppercase tracking-[0.18em] text-amber-600">Estructura necesaria</p><h2 className="mt-2 text-3xl font-serif font-black">No hay un capítulo listo para redactar</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">Primero debes diseñar el próximo capítulo. Este flujo solo redacta capítulos definidos en el documento Estructura.</p><button type="button" onClick={onGoDesigner} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white"><Sparkles size={17} /> Diseñar próximo capítulo</button></section>;

    if (status === 'loading' && !analysis) return <section className="mx-auto flex min-h-[360px] max-w-3xl flex-col items-center justify-center rounded-3xl border border-violet-500/20 bg-[var(--bg-editor)] p-8 text-center"><Loader2 size={30} className="animate-spin text-violet-500" /><h2 className="mt-5 text-2xl font-serif font-black">Analizando Estructura…</h2><p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">Estoy comparando los capítulos planeados con tu manuscrito.</p></section>;

    if (!analysis) return <section className="mx-auto max-w-3xl rounded-3xl border border-red-500/25 bg-[var(--bg-editor)] p-6 text-center"><p className="text-sm text-red-600">{error || 'No se pudo recuperar el análisis.'}</p><button type="button" onClick={runAnalysis} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><RefreshCw size={14} /> Reintentar análisis</button></section>;

    if (!selectedPlan) return <section className="mx-auto max-w-5xl rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-6 lg:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-600">Redacción guiada</p><h2 className="mt-2 text-3xl font-serif font-black">Elige un capítulo pendiente</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Análisis guardado: {storedDesigner.analysisAnalyzedAt ? new Date(storedDesigner.analysisAnalyzedAt).toLocaleString('es-MX') : 'reciente'}.</p></div><button type="button" onClick={runAnalysis} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black disabled:cursor-wait disabled:opacity-60">{status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {status === 'loading' ? 'Actualizando análisis…' : 'Actualizar análisis'}</button></div>{status === 'loading' && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm"><Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-emerald-600" /><div><p className="font-black text-emerald-700">Actualizando análisis…</p><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">Estoy recargando el manuscrito y comparándolo nuevamente con Estructura. El análisis anterior se conservará hasta terminar.</p></div></div>}<div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-relaxed">{analysis.summary || analysis.recommendation || 'Selecciona un capítulo definido en Estructura para comenzar.'}</div><div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">{pendingChapters.map((chapter) => <button type="button" key={chapter.id} onClick={() => choosePlan(chapter)} disabled={busy} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 text-left transition-colors hover:border-emerald-500 disabled:cursor-wait disabled:opacity-60"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black">{chapter.position}. {chapter.title}</p><span className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase text-amber-600">{chapter.status === 'empty' ? 'Vacío' : 'Pendiente'}</span></div><p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{chapter.summary || chapter.purpose || 'Revisar estructura del capítulo.'}</p></button>)}</div>{pendingChapters.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-[var(--border-main)] p-6 text-center text-sm text-[var(--text-muted)]">No se detectaron capítulos pendientes. Ve a “Diseñar próximo capítulo” para crear el siguiente.</div>}{error && <p className="mt-4 text-xs text-red-600">{error}</p>}</section>;

    return <section className="mx-auto max-w-5xl rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-6 lg:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-600">Revisión del capítulo</p><h2 className="mt-2 text-3xl font-serif font-black">{planDraft.title}</h2><p className="mt-2 text-sm text-[var(--text-muted)]">La IA redactará únicamente a partir de esta estructura aprobada.</p></div><button type="button" onClick={() => setSelectedPlan(null)} className="rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black">Elegir otro</button></div><div className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-2"><label className="text-xs font-black">Título<input value={planDraft.title} onChange={(event) => setPlanDraft({ ...planDraft, title: event.target.value })} className="mt-2 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-emerald-500" /></label><label className="text-xs font-black">Propósito<textarea value={planDraft.purpose || ''} onChange={(event) => setPlanDraft({ ...planDraft, purpose: event.target.value })} rows={2} className="mt-2 w-full resize-none rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-emerald-500" /></label><label className="text-xs font-black md:col-span-2">Resumen<textarea value={planDraft.summary || ''} onChange={(event) => setPlanDraft({ ...planDraft, summary: event.target.value })} rows={3} className="mt-2 w-full resize-none rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-emerald-500" /></label><label className="text-xs font-black md:col-span-2">Conflicto<textarea value={planDraft.conflict || ''} onChange={(event) => setPlanDraft({ ...planDraft, conflict: event.target.value })} rows={3} className="mt-2 w-full resize-none rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-emerald-500" /></label></div><div className="mt-7"><p className="text-sm font-black">Tamaño objetivo</p><div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">{SIZE_OPTIONS.map((option) => <button type="button" key={option.id} onClick={() => setSize(option.id)} className={`rounded-2xl border p-3 text-left ${size === option.id ? 'border-emerald-500 bg-emerald-500/5' : 'border-[var(--border-main)]'}`}><p className="text-xs font-black">{option.label}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{option.detail}</p></button>)}</div>{size === 'custom' && <div className="mt-3 grid grid-cols-2 gap-3"><input type="number" min="100" value={customMin} onChange={(event) => setCustomMin(event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-xs" placeholder="Mínimo" /><input type="number" min="200" value={customMax} onChange={(event) => setCustomMax(event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-xs" placeholder="Máximo" /></div>}</div>{selectedExistingChapter && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" /><p>Ya existe un capítulo con este título. Usa una misión de escritura para trabajarlo y evitar duplicados.</p></div>}<div className="mt-7 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-relaxed"><strong>Contexto bloqueado:</strong> la propuesta usará Estructura, continuidad, personajes y el capítulo anterior. El documento original permanecerá intacto hasta que apruebes el borrador.</div>{!selectedExistingChapter && <ToolRoomAIProposal roomName="Redactor desde Estructura" instruction={`Redacta el capítulo ${planDraft.title} respetando estrictamente su propósito, resumen, conflicto, escenas y consecuencias. Mantén el tono de la obra. Extensión orientativa: ${sizeLabel}. No resuelvas conflictos fuera de lo indicado.`} sourceContent="" contextContent={contextContent} onApply={applyDraft} applyLabel="Aprobar y crear capítulo" />}{error && <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}<div className="mt-6 flex items-center gap-2 text-xs text-[var(--text-muted)]"><CheckCircle2 size={15} className="text-emerald-500" /> El análisis se actualizará solo cuando cambie el documento Estructura.</div></section>;
};

export default ChapterWriter;
