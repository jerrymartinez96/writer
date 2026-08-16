import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, FileText, Loader2, Plus, RefreshCw, Save, Sparkles, Wand2, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { getStructureSourceHash, requestChapterDirections, requestChapterScene, requestChapterStructureAnalysis } from '../../services/ai-next/ToolRoomAIService';

const SIZE_OPTIONS = [
    { id: 'brief', label: 'Breve', detail: '500–900 palabras' },
    { id: 'standard', label: 'Estándar', detail: '1,200–2,000 palabras' },
    { id: 'large', label: 'Amplio', detail: '2,500–4,000 palabras' },
    { id: 'custom', label: 'Personalizado', detail: 'Define un rango' },
];

const text = (value) => String(value || '').trim();

const formatStructureBlock = ({ plan, direction, scenes, size, customMin, customMax }) => {
    const sizeLabel = SIZE_OPTIONS.find((option) => option.id === size)?.detail || `${customMin || 500}–${customMax || 2000} palabras`;
    return [
        `CAPÍTULO ${plan.position || 'SIGUIENTE'} — ${plan.title}`,
        'Estado: Listo para redactar',
        `Tamaño objetivo: ${sizeLabel}`,
        '',
        `Propósito: ${plan.purpose || direction?.purpose || 'Desarrollar el siguiente movimiento narrativo.'}`,
        `Resumen: ${plan.summary || direction?.premise || ''}`,
        `Conflicto: ${plan.conflict || direction?.conflict || ''}`,
        `Personajes: ${(plan.characters || []).join(', ') || (direction?.characters || []).join(', ') || 'Por definir'}`,
        `Revelaciones: ${(direction?.revelations || []).join(' · ') || 'Por definir'}`,
        `Consecuencias: ${(direction?.consequences || []).join(' · ') || 'Por definir'}`,
        '',
        'ESCENAS:',
        ...scenes.map((scene, index) => [
            `${index + 1}. ${scene.title}`,
            `Objetivo: ${scene.objective}`,
            `Lugar y momento: ${scene.setting}`,
            `Personajes: ${scene.characters.join(', ') || 'Por definir'}`,
            `Conflicto: ${scene.conflict}`,
            `Acción: ${scene.action}`,
            `Revelación: ${scene.revelation}`,
            `Cambio emocional: ${scene.emotionalChange}`,
            `Transición: ${scene.transition}`,
            '',
        ].join('\n')),
    ].join('\n');
};

const Panel = ({ children, className = '' }) => <section className={`rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 lg:p-7 ${className}`}>{children}</section>;

const ChapterDesigner = ({ state, updateRoomState, worldItems, chapters, characters, activeChapter, lazyLoadChapters, updateWorldItem, saveDocumentSnapshot, onWriteChapter }) => {
    const { profile } = useData();
    const stored = state.designer || {};
    const [designer, setDesigner] = useState(stored);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');

    const structureItem = worldItems.find((item) => item.id === 'system_estructura');
    const worldItem = worldItems.find((item) => item.id === 'system_core');
    const lastChapter = activeChapter || [...chapters].filter((chapter) => !chapter.isVolume).sort((a, b) => (b.orderIndex ?? 0) - (a.orderIndex ?? 0))[0] || null;
    const stage = designer.stage || 'analysis';
    const selectedPlan = designer.selectedPlan || null;
    const size = designer.size || 'standard';
    const sizeLabel = SIZE_OPTIONS.find((option) => option.id === size)?.detail || 'Rango personalizado';
    const pendingPlans = designer.analysis?.pendingChapters || [];
    const matches = designer.analysis?.matches || [];

    const patchDesigner = (patch) => {
        setDesigner((previous) => {
            const next = { ...previous, ...patch };
            updateRoomState('cowriter', { designer: next });
            return next;
        });
    };

    const runAnalysis = async () => {
        setStatus('loading');
        setError('');
        try {
            const loaded = await lazyLoadChapters(chapters.filter((chapter) => !chapter.isVolume).map((chapter) => chapter.id));
            const loadedById = new Map((loaded || []).map((chapter) => [chapter.id, chapter]));
            const chapterDocuments = chapters.filter((chapter) => !chapter.isVolume).map((chapter) => ({ ...chapter, ...(loadedById.get(chapter.id) || {}) }));
            const sourceHash = getStructureSourceHash({ structureContent: structureItem?.content || '' });
            const result = await requestChapterStructureAnalysis({
                profile,
                structureContent: structureItem?.content || '',
                chapters: chapterDocuments,
                lastChapter,
                worldContent: worldItem?.content || '',
                characters,
            });
            patchDesigner({ analysis: result, analysisSourceHash: sourceHash, analysisAnalyzedAt: new Date().toISOString(), stage: 'analysis', confirmedMatches: {} });
            setStatus('ready');
        } catch (requestError) {
            setError(requestError?.message || 'No se pudo analizar la estructura.');
            setStatus('error');
        }
    };

    const confirmMatch = (match, value) => patchDesigner({ confirmedMatches: { ...(designer.confirmedMatches || {}), [match.structureChapterId]: value ? match.manuscriptChapterId : null } });
    const assignManualMatch = (structureChapterId, manuscriptChapterId) => patchDesigner({ confirmedMatches: { ...(designer.confirmedMatches || {}), [structureChapterId]: manuscriptChapterId || null } });

    const choosePlan = (plan) => patchDesigner({ selectedPlan: plan, stage: 'directions', directions: null, direction: null, scenes: [], draftScene: null });

    const startFreeDesign = () => choosePlan({ id: `new-${Date.now()}`, title: 'Nuevo capítulo', position: (chapters.length || 0) + 1, summary: '', purpose: '', conflict: '', characters: [] });

    const generateDirections = async () => {
        setStatus('loading');
        setError('');
        try {
            const result = await requestChapterDirections({
                profile,
                idea: designer.idea || '',
                chapterPlan: selectedPlan,
                lastChapter,
                openThreads: designer.analysis?.openThreads || [],
                contextContent: `${worldItem?.content || ''}\n${characters.map((character) => `${character.name}: ${character.description || ''}`).join('\n')}`,
            });
            patchDesigner({ directions: result.directions, stage: 'directions' });
            setStatus('ready');
        } catch (requestError) {
            setError(requestError?.message || 'No se pudieron generar direcciones narrativas.');
            setStatus('error');
        }
    };

    const generateScene = async (instruction = '') => {
        setStatus('loading');
        setError('');
        try {
            const scene = await requestChapterScene({
                profile,
                chapterPlan: selectedPlan,
                direction: designer.direction,
                scenes: designer.scenes || [],
                size: sizeLabel,
                lastChapter,
                contextContent: worldItem?.content || '',
                instruction,
            });
            patchDesigner({ draftScene: scene, stage: 'scenes' });
            setStatus('ready');
        } catch (requestError) {
            setError(requestError?.message || 'No se pudo proponer la escena.');
            setStatus('error');
        }
    };

    const approveScene = () => {
        if (!designer.draftScene) return;
        patchDesigner({ scenes: [...(designer.scenes || []), designer.draftScene], draftScene: null, stage: 'scenes' });
    };

    const finishScenes = () => patchDesigner({ stage: 'preview' });

    const saveStructure = async () => {
        const structureBlock = designer.previewText || formatStructureBlock({ plan: selectedPlan, direction: designer.direction, scenes: designer.scenes || [], size, customMin: designer.customMin, customMax: designer.customMax });
        const current = text(structureItem?.content);
        const separator = current ? '\n\n---\n\n' : '';
        setStatus('saving');
        setError('');
        try {
            await updateWorldItem('system_estructura', { content: `${current}${separator}${structureBlock}` }, { immediate: true });
            await saveDocumentSnapshot('system_estructura', `${current}${separator}${structureBlock}`, 'toolroom-cowriter-structure');
            patchDesigner({ savedStructure: structureBlock, stage: 'saved', savedAt: new Date().toISOString() });
            setStatus('ready');
        } catch (saveError) {
            setError(saveError?.message || 'No se pudo guardar la estructura.');
            setStatus('error');
        }
    };

    const updateDraftScene = (field, value) => patchDesigner({ draftScene: { ...designer.draftScene, [field]: value } });
    const busy = status === 'loading' || status === 'saving';

    const analysisSummary = useMemo(() => designer.analysis?.summary || 'Analiza Estructura para descubrir qué capítulos están definidos y cuáles faltan.', [designer.analysis]);

    if (stage === 'analysis') return <Panel className="mx-auto max-w-5xl"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-500">Diseño narrativo</p><h2 className="mt-2 text-3xl font-serif font-black">Descubre qué sigue</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">Analiza Estructura junto con tu manuscrito para encontrar capítulos pendientes o construir el siguiente desde una idea nueva.</p></div><button type="button" onClick={runAnalysis} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60">{busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />} {busy ? 'Analizando…' : 'Analizar estructura'}</button></div>{designer.analysis && <div className="mt-7 space-y-5"><div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 text-sm leading-relaxed">{analysisSummary}</div><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><div className="rounded-2xl bg-[var(--bg-app)] p-4"><p className="text-2xl font-black">{designer.analysis.chapters?.length || 0}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Capítulos detectados</p></div><div className="rounded-2xl bg-[var(--bg-app)] p-4"><p className="text-2xl font-black">{pendingPlans.length}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Pendientes sugeridos</p></div><div className="rounded-2xl bg-[var(--bg-app)] p-4"><p className="text-2xl font-black">{designer.analysis.openThreads?.length || 0}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Cabos abiertos</p></div></div><div><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-serif font-black">Capítulos detectados</h3><span className="text-xs text-[var(--text-muted)]">Confirma las coincidencias antes de continuar</span></div><div className="mt-3 space-y-2">{(designer.analysis.chapters || []).map((chapter) => { const match = matches.find((item) => item.structureChapterId === chapter.id); const confirmed = designer.confirmedMatches?.[chapter.id]; return <div key={chapter.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-black">{chapter.position}. {chapter.title}</p><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{chapter.summary || 'Sin resumen detectado.'}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${confirmed ? 'bg-emerald-500/10 text-emerald-600' : pendingPlans.some((item) => item.id === chapter.id) ? 'bg-amber-500/10 text-amber-600' : 'bg-[var(--accent-soft)] text-[var(--text-muted)]'}`}>{confirmed ? 'Confirmado' : pendingPlans.some((item) => item.id === chapter.id) ? 'Pendiente' : 'Revisar'}</span></div>{match && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]"><span>Posible coincidencia: <strong>{chapters.find((item) => item.id === match.manuscriptChapterId)?.title || match.manuscriptChapterId}</strong> ({Math.round(match.confidence * 100)}%)</span><button type="button" onClick={() => confirmMatch(match, true)} className="rounded-lg border border-emerald-500/30 px-2 py-1 font-black text-emerald-600">Confirmar</button><button type="button" onClick={() => confirmMatch(match, false)} className="rounded-lg border border-[var(--border-main)] px-2 py-1 font-black">Marcar pendiente</button><select aria-label={`Asignar ${chapter.title}`} value={confirmed || ''} onChange={(event) => assignManualMatch(chapter.id, event.target.value)} className="max-w-full rounded-lg border border-[var(--border-main)] bg-[var(--bg-editor)] px-2 py-1 text-xs"><option value="">Asignar manualmente…</option>{chapters.filter((item) => !item.isVolume).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>}</div>; })}</div></div><div className="flex flex-wrap gap-3"><button type="button" onClick={() => choosePlan(pendingPlans[0])} disabled={!pendingPlans[0]} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><ChevronRight size={17} /> Trabajar en el siguiente</button><button type="button" onClick={startFreeDesign} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-4 py-3 text-sm font-black"><Plus size={17} /> Diseñar desde una idea</button></div></div>}{error && <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}</Panel>;

    if (stage === 'directions') return <Panel className="mx-auto max-w-5xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-500">Paso 1 · Dirección</p><h2 className="mt-2 text-3xl font-serif font-black">Define el capítulo</h2><p className="mt-2 text-sm text-[var(--text-muted)]">{selectedPlan?.title || 'Nuevo capítulo'}</p></div><button type="button" onClick={() => patchDesigner({ stage: 'analysis' })} className="rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black">Volver al análisis</button></div><label className="mt-7 block"><span className="text-sm font-black">Idea o intención del usuario</span><textarea value={designer.idea || ''} onChange={(event) => patchDesigner({ idea: event.target.value })} rows={3} placeholder="Ej. Quiero que encuentre una pista sobre su hermano, pero sin resolver todavía la traición…" className="mt-2 w-full resize-none rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 text-sm outline-none focus:border-violet-500" /></label><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--text-muted)]">La IA propondrá tres caminos y sus consecuencias.</p><button type="button" onClick={generateDirections} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{busy ? <Loader2 size={17} className="animate-spin" /> : <Wand2 size={17} />} {busy ? 'Pensando…' : 'Proponer direcciones'}</button></div>{designer.directions?.length > 0 && <div className="mt-7 grid grid-cols-1 gap-3 lg:grid-cols-3">{designer.directions.map((direction) => <button type="button" key={direction.id} onClick={() => patchDesigner({ direction, stage: 'size' })} className={`rounded-2xl border p-4 text-left transition-colors ${designer.direction?.id === direction.id ? 'border-violet-500 bg-violet-500/5' : 'border-[var(--border-main)] hover:border-violet-500/50'}`}><p className="text-sm font-black">{direction.title}</p><p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{direction.premise}</p><div className="mt-4 space-y-1 text-[10px] text-[var(--text-muted)]"><p><strong>Conflicto:</strong> {direction.conflict}</p><p><strong>Riesgo:</strong> {direction.risk}</p></div></button>)}</div>}{error && <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}</Panel>;

    if (stage === 'size') return <Panel className="mx-auto max-w-4xl"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-500">Paso 2 · Alcance</p><h2 className="mt-2 text-3xl font-serif font-black">¿Qué tamaño tendrá?</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Esto orientará el número y profundidad de las escenas.</p><div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{SIZE_OPTIONS.map((option) => <button type="button" key={option.id} onClick={() => patchDesigner({ size: option.id })} className={`rounded-2xl border p-4 text-left ${size === option.id ? 'border-violet-500 bg-violet-500/5' : 'border-[var(--border-main)]'}`}><p className="text-sm font-black">{option.label}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{option.detail}</p></button>)}</div>{size === 'custom' && <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-black">Mínimo<input type="number" min="100" value={designer.customMin || 500} onChange={(event) => patchDesigner({ customMin: event.target.value })} className="mt-2 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 font-normal outline-none" /></label><label className="text-xs font-black">Máximo<input type="number" min="200" value={designer.customMax || 2000} onChange={(event) => patchDesigner({ customMax: event.target.value })} className="mt-2 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 font-normal outline-none" /></label></div>}<div className="mt-7 flex justify-between gap-3"><button type="button" onClick={() => patchDesigner({ stage: 'directions' })} className="rounded-xl border border-[var(--border-main)] px-4 py-3 text-sm font-black">Atrás</button><button type="button" onClick={() => patchDesigner({ stage: 'scenes' })} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white">Diseñar escenas <ChevronRight size={17} /></button></div></Panel>;

    if (stage === 'scenes') return <Panel className="mx-auto max-w-5xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-500">Paso 3 · Escenas</p><h2 className="mt-2 text-3xl font-serif font-black">Construye el capítulo escena a escena</h2><p className="mt-2 text-sm text-[var(--text-muted)]">{(designer.scenes || []).length} escena(s) aprobada(s) · {sizeLabel}</p></div><button type="button" onClick={finishScenes} disabled={!designer.scenes?.length} className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 px-3 py-2 text-xs font-black text-violet-600 disabled:opacity-50"><Check size={15} /> Terminar estructura</button></div>{designer.draftScene ? <div className="mt-7 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-violet-500">Borrador de escena</p><input value={designer.draftScene.title} onChange={(event) => updateDraftScene('title', event.target.value)} className="mt-2 w-full bg-transparent text-xl font-serif font-black outline-none" /></div><button type="button" onClick={() => patchDesigner({ draftScene: null })} className="rounded-lg p-1 text-[var(--text-muted)]"><X size={17} /></button></div><div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">{[['objective','Objetivo'],['setting','Lugar y momento'],['conflict','Conflicto'],['action','Acción principal'],['revelation','Información revelada'],['emotionalChange','Cambio emocional'],['transition','Transición']].map(([field, label]) => <label key={field} className="text-xs font-black">{label}<textarea value={designer.draftScene[field] || ''} onChange={(event) => updateDraftScene(field, event.target.value)} rows={field === 'action' ? 4 : 2} className="mt-1 w-full resize-none rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-xs font-normal outline-none focus:border-violet-500" /></label>)}</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={approveScene} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"><Check size={14} /> Aprobar escena</button><button type="button" onClick={() => generateScene('Propón una alternativa distinta manteniendo el mismo objetivo.')} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><RefreshCw size={14} /> Regenerar</button></div></div> : <div className="mt-7 rounded-2xl border border-dashed border-[var(--border-main)] p-6 text-center"><p className="text-sm text-[var(--text-muted)]">Aprueba cada propuesta para construir una estructura sólida y revisable.</p><button type="button" onClick={() => generateScene()} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />} {busy ? 'Diseñando…' : 'Proponer siguiente escena'}</button></div>}{designer.scenes?.length > 0 && <div className="mt-6 space-y-2">{designer.scenes.map((scene, index) => <div key={scene.id || index} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4"><div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-black text-emerald-600">{index + 1}</span><div><p className="text-sm font-black">{scene.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{scene.objective}</p></div></div></div>)}</div>}{error && <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}</Panel>;

    if (stage === 'preview') { const block = designer.previewText || formatStructureBlock({ plan: selectedPlan, direction: designer.direction, scenes: designer.scenes || [], size, customMin: designer.customMin, customMax: designer.customMax }); return <Panel className="mx-auto max-w-5xl"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-500">Paso 4 · Revisión</p><h2 className="mt-2 text-3xl font-serif font-black">Revisa antes de guardar</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Esta estructura se añadirá al documento Estructura solo cuando la confirmes.</p><textarea value={block} onChange={(event) => patchDesigner({ previewText: event.target.value })} rows={24} className="mt-6 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 font-mono text-xs leading-relaxed outline-none focus:border-violet-500" /> <div className="mt-5 flex flex-wrap justify-between gap-3"><button type="button" onClick={() => patchDesigner({ stage: 'scenes', previewText: null })} className="rounded-xl border border-[var(--border-main)] px-4 py-3 text-sm font-black">Volver a escenas</button><button type="button" onClick={saveStructure} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{busy ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Guardar en Estructura</button></div>{error && <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}</Panel>; }

    return <Panel className="mx-auto max-w-4xl"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600"><Check size={24} /></div><p className="mt-6 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-600">Estructura guardada</p><h2 className="mt-2 text-3xl font-serif font-black">{selectedPlan?.title}</h2><p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">El capítulo ya está disponible en Estructura con sus escenas y objetivos aprobados.</p><div className="mt-7 flex flex-wrap gap-3"><button type="button" onClick={() => onWriteChapter({ title: selectedPlan?.title, structure: designer.savedStructure, plan: selectedPlan })} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white"><FileText size={17} /> Redactar este capítulo</button><button type="button" onClick={() => patchDesigner({ stage: 'analysis', selectedPlan: null, direction: null, scenes: [], draftScene: null })} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-4 py-3 text-sm font-black"><Plus size={17} /> Diseñar otro</button></div></Panel>;
};

export default ChapterDesigner;
