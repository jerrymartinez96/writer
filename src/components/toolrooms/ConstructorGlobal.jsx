import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, Globe2, Loader2, Network, RefreshCw, Search, ShieldCheck, Sparkles, UsersRound, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToolRooms } from '../../context/ToolRoomContext';
import { getToolRoom } from './toolRoomCatalog';
import ToolRoomShell from './ToolRoomShell';
import useToolRoomLaunch from './useToolRoomLaunch';
import { buildMissionDocuments, mergeLoadedMissionChapters, MISSION_SCOPES, MISSION_TYPES, requestMissionAlternatives, requestMissionImpact, requestMissionOperations, requestMissionVerification } from '../../services/ai-next/MissionService';
import { executeOperationsWithRollback, prepareOperations, validateOperationAgainstDocument } from '../../services/ai-next/MissionExecutionService';
import { saveMissionHistoryEntry } from '../../services/ai-next/MissionHistoryService';
import { saveEntitySnapshot } from '../../services/db';
import { saveLocalSnapshot } from '../../services/localDb';

const DEFAULT_CONSTRAINTS = { preserveCanon: true, preserveStyle: true, noAutomaticWrites: true, preserveEnding: true };
const TYPES = [
    ['develop_canon', Globe2, 'Modificar canon', 'Elimina, transforma o sustituye hechos, reglas y relaciones importantes.'],
    ['modify_structure', Network, 'Modificar estructura', 'Reorganiza capítulos, escenas, conflictos y consecuencias.'],
    ['update_character', UsersRound, 'Actualizar personaje', 'Cambia la trayectoria de un personaje y revisa sus apariciones.'],
    ['sync_canon', ShieldCheck, 'Sincronizar documentos', 'Coordina cambios entre canon, estructura y manuscrito.'],
    ['analyze', Search, 'Analizar sin modificar', 'Estudia una propuesta y devuelve riesgos sin escribir.'],
];
const typeLabel = (id) => MISSION_TYPES.find((item) => item.id === id)?.label || id;
const statusLabel = { idle: 'Listo para configurar', analyzing: 'Analizando impacto', alternatives: 'Alternativas listas', generating: 'Preparando plan', review: 'Plan listo para aprobar', applying: 'Aplicando plan', verifying: 'Verificando resultado', done: 'Completado', error: 'Requiere atención' };
const PROCESS_STATUS = { idle: 'draft', analyzing: 'analyzing', alternatives: 'alternatives_ready', impact_ready: 'alternatives_ready', alternatives_ready: 'alternatives_ready', generating: 'plan_ready', review: 'awaiting_approval', plan_ready: 'plan_ready', applying: 'applying', verifying: 'verifying', done: 'completed', completed: 'completed', needs_review: 'needs_review', error: 'failed', failed: 'failed' };
const UI_STATUS = { draft: 'idle', analyzing: 'analyzing', alternatives_ready: 'alternatives', plan_ready: 'review', awaiting_approval: 'review', applying: 'applying', verifying: 'verifying', completed: 'done', needs_review: 'error', failed: 'error' };
const INTERRUPTED_STATUSES = new Set(['analyzing', 'generating', 'applying', 'verifying']);
const getInitialStep = (mission) => mission?.verification ? 'result' : mission?.result ? 'plan' : mission?.alternatives?.length ? 'alternatives' : mission?.impact ? 'impact' : 'type';

const StepBar = ({ step }) => {
    const steps = [['type', 'Tipo'], ['objective', 'Objetivo'], ['scope', 'Alcance'], ['impact', 'Impacto'], ['alternatives', 'Alternativas'], ['plan', 'Plan'], ['review', 'Aprobación']];
    const current = steps.findIndex(([id]) => id === step);
    return <div className="mt-7 grid grid-cols-7 gap-1 text-center text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">{steps.map(([id, label], index) => <div key={id} className={`rounded-lg px-1 py-2 ${current >= index ? 'bg-indigo-500/10 text-indigo-600' : 'bg-[var(--bg-app)]'}`}>{index + 1}. {label}</div>)}</div>;
};

const ContextPicker = ({ documents, selectedIds, setSelectedIds }) => <div className="mt-4 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{documents.map((document) => { const selected = selectedIds.includes(document.id); return <button type="button" key={document.id} onClick={() => setSelectedIds((current) => selected ? current.filter((id) => id !== document.id) : [...current, document.id])} className={`rounded-xl border p-3 text-left ${selected ? 'border-indigo-500 bg-indigo-500/10' : 'border-[var(--border-main)] hover:border-indigo-500/50'}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-black">{document.title}</span>{selected && <Check size={14} className="text-indigo-500" />}</div><span className="mt-1 block text-[10px] uppercase text-[var(--text-muted)]">{document.type}</span></button>; })}</div>;

const ImpactPanel = ({ impact, questions = [], onContinue, busy = false }) => <section className="mt-5 rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-600">Análisis de impacto</p><h3 className="mt-1 text-lg font-black">{impact.summary}</h3></div><span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-cyan-700">Riesgo {impact.risk}</span></div><div className="mt-4 space-y-2">{impact.affectedDocuments.map((document) => <div key={document.documentId} className="flex items-start gap-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${document.impact === 'high' ? 'bg-red-500' : document.impact === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} /><div><p className="text-xs font-black">{document.title} <span className="font-normal text-[var(--text-muted)]">· {document.action}</span></p><p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{document.reason}</p>{document.evidence && <p className="mt-2 rounded-lg bg-cyan-500/5 p-2 text-[11px] italic text-[var(--text-muted)]">Cita verificada: «{document.evidence}»</p>}</div></div>)}</div>{(impact.warnings?.length || questions.length) > 0 && <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700">{[...(impact.warnings || []), ...questions].map((item, index) => <p key={`${item}-${index}`}>• {item}</p>)}</div>}<button type="button" onClick={onContinue} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white hover:bg-cyan-500 disabled:cursor-wait disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />} {busy ? 'Generando alternativas…' : 'Generar alternativas'}</button></section>;

const AlternativeCards = ({ alternatives, selectedId, onSelect, onContinue, busy = false }) => <section className="mt-5 rounded-2xl border border-violet-500/25 bg-violet-500/5 p-5"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-violet-600">Tres caminos posibles</p><h3 className="mt-1 text-lg font-black">Elige cómo quieres transformar la obra</h3><div className="mt-4 grid gap-3 lg:grid-cols-3">{alternatives.map((alternative) => <button type="button" key={alternative.id} onClick={() => onSelect(alternative.id)} disabled={busy} className={`rounded-2xl border p-4 text-left disabled:cursor-wait disabled:opacity-60 ${selectedId === alternative.id ? 'border-violet-500 bg-violet-500/10' : 'border-[var(--border-main)] bg-[var(--bg-editor)]'}`}><span className="text-[9px] font-black uppercase tracking-wider text-violet-600">{alternative.type === 'conservative' ? 'Conservadora' : alternative.type === 'transformative' ? 'Transformadora' : 'Compensatoria'}</span><h4 className="mt-2 text-sm font-black">{alternative.title}</h4><p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{alternative.summary}</p><p className="mt-3 text-[10px] font-black uppercase text-[var(--text-muted)]">Cambios: {alternative.changes.length} · Riesgos: {alternative.risks.length}</p></button>)}</div>{selectedId && <button type="button" onClick={onContinue} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />} {busy ? 'Construyendo plan…' : 'Construir plan exacto'}</button>}</section>;

const PlanReview = ({ result, selectedIds, setSelectedIds, onApply, busy }) => {
    const toggle = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    return <section className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600">Plan de cambios</p><h3 className="mt-1 text-lg font-black">{result.summary}</h3></div><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">{selectedIds.length} seleccionadas</span></div><div className="mt-4 space-y-3">{(result.operations || []).map((operation) => { const actionableOperation = ['patch', 'replace', 'delete'].includes(operation.action); const selected = selectedIds.includes(operation.id); return <article key={operation.id} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-4"><div className="flex items-start gap-3"><input type="checkbox" checked={selected} disabled={!actionableOperation || busy} onChange={() => toggle(operation.id)} className="mt-1 accent-emerald-600" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black">{operation.title}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{operation.action} · {operation.documentId} · riesgo {operation.risk}</p></div><span className="rounded-full bg-[var(--bg-app)] px-2 py-1 text-[9px] font-black uppercase text-[var(--text-muted)]">{actionableOperation ? selected ? 'Incluida' : 'Excluida' : 'Revisión'}</span></div><p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{operation.reason}</p>{operation.originalText && <div className="mt-3 grid gap-2 md:grid-cols-2"><div><p className="text-[9px] font-black uppercase text-red-500">Original</p><p className="mt-1 rounded-lg bg-red-500/5 p-2 text-xs">{operation.originalText}</p></div><div><p className="text-[9px] font-black uppercase text-emerald-600">Resultado</p><p className="mt-1 rounded-lg bg-emerald-500/5 p-2 text-xs">{operation.replacementText || 'Eliminar fragmento'}</p></div></div>}</div></div></article>; })}</div><button type="button" onClick={onApply} disabled={busy || selectedIds.length === 0} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Aprobar y aplicar plan</button></section>;
};

const ConstructorGlobal = () => {
    const room = getToolRoom('global-constructor');
    const launch = useToolRoomLaunch('global-constructor');
    const { activeBook, activeChapter, chapters = [], worldItems = [], characters = [], profile, lazyLoadChapters, updateChapter, updateWorldItem, updateCharacter } = useData();
    const { getRoomState, updateProcess } = useToolRooms();
    const stored = getRoomState('global-constructor');
    const storedMission = stored.process || stored.mission || {};
    const wasInterrupted = INTERRUPTED_STATUSES.has(storedMission.status);
    const [step, setStep] = useState(() => getInitialStep(storedMission));
    const [type, setType] = useState(launch?.mission?.type || storedMission.type || 'develop_canon');
    const [objective, setObjective] = useState(launch?.prompt || storedMission.objective || '');
    const [scope, setScope] = useState(storedMission.scope || 'automatic');
    const [selectedIds, setSelectedIds] = useState(storedMission.selectedIds || []);
    const [impact, setImpact] = useState(storedMission.impact || null);
    const [alternatives, setAlternatives] = useState(storedMission.alternatives || []);
    const [alternativeId, setAlternativeId] = useState(storedMission.selectedAlternativeId || storedMission.alternativeId || null);
    const [result, setResult] = useState(storedMission.result || null);
    const [approvedIds, setApprovedIds] = useState(storedMission.approvedOperationIds || storedMission.approvedIds || []);
    const [verification, setVerification] = useState(storedMission.verification || null);
    const [status, setStatus] = useState(() => wasInterrupted ? 'error' : UI_STATUS[storedMission.status] || storedMission.status || 'idle');
    const [error, setError] = useState(() => wasInterrupted ? 'El análisis se interrumpió al recargar la página. Puedes reintentarlo con la misma solicitud o iniciar una nueva.' : '');
    const [missionId, setMissionId] = useState(() => storedMission.id || `global-${Date.now()}`);
    const documents = useMemo(() => buildMissionDocuments({ chapters, worldItems, characters, activeChapter, scope, selectedIds }), [activeChapter, chapters, characters, scope, selectedIds, worldItems]);
    const mission = useMemo(() => ({ id: missionId, roomId: 'global-constructor', type, objective: objective.trim(), scope, selectedIds, constraints: DEFAULT_CONSTRAINTS }), [missionId, objective, scope, selectedIds, type]);
    const loadMissionDocuments = async () => {
        const chapterIds = documents.filter((document) => document.type === 'chapter').map((document) => document.id);
        const loadedChapters = await lazyLoadChapters(chapterIds);
        return mergeLoadedMissionChapters(documents, loadedChapters);
    };
    const persist = (patch = {}) => {
        const {
            status: nextStatus,
            selectedAlternativeId: patchedAlternativeId,
            alternativeId: legacyAlternativeId,
            approvedOperationIds: patchedApprovedIds,
            approvedIds: legacyApprovedIds,
            ...rest
        } = patch;
        const nextResult = rest.result !== undefined ? rest.result : result;
        updateProcess('global-constructor', {
            ...mission,
            request: mission.objective,
            context: { scope, selectedIds },
            impact,
            alternatives,
            selectedAlternativeId: patchedAlternativeId ?? legacyAlternativeId ?? alternativeId,
            operations: nextResult?.operations || [],
            approvedOperationIds: patchedApprovedIds ?? legacyApprovedIds ?? approvedIds,
            verification,
            ...rest,
            result: nextResult,
            status: PROCESS_STATUS[nextStatus || status] || 'draft',
        });
    };
    const remember = (patch = {}) => { if (activeBook?.id) saveMissionHistoryEntry(activeBook.id, { id: mission.id, mission, impact, alternatives, result, verification, ...patch }); };
    const analyze = async () => {
        if (!objective.trim()) return setError('Describe primero qué quieres cambiar.');
        setStatus('analyzing'); setError(''); persist({ status: 'analyzing' });
        try { const loadedDocuments = await loadMissionDocuments(); const nextImpact = await requestMissionImpact({ profile, mission, documents: loadedDocuments }); setImpact(nextImpact); setStep('impact'); setStatus('alternatives'); persist({ impact: nextImpact, status: 'impact_ready' }); remember({ impact: nextImpact, status: 'impact_ready' }); } catch (requestError) { setStatus('error'); setError(requestError?.message || 'No se pudo cargar el contexto o analizar el impacto.'); persist({ status: 'failed' }); }
    };
    const proposeAlternatives = async () => {
        setStatus('analyzing'); setError('');
        try { const loadedDocuments = await loadMissionDocuments(); const next = await requestMissionAlternatives({ profile, mission, documents: loadedDocuments, impact }); setAlternatives(next.alternatives); setAlternativeId(next.alternatives[0]?.id || null); setStep('alternatives'); setStatus('alternatives'); persist({ alternatives: next.alternatives, alternativeId: next.alternatives[0]?.id || null, status: 'alternatives_ready' }); } catch (requestError) { setStatus('error'); setError(requestError?.message || 'No se pudo cargar el contexto o generar alternativas.'); }
    };
    const generatePlan = async () => {
        const alternative = alternatives.find((item) => item.id === alternativeId);
        if (!alternative) return setError('Selecciona una alternativa para continuar.');
        setStatus('generating'); setError('');
        try { const loadedDocuments = await loadMissionDocuments(); const next = await requestMissionOperations({ profile, mission, documents: loadedDocuments, impact, alternative }); const prepared = { ...next, operations: prepareOperations(next.operations, loadedDocuments) }; setResult(prepared); setApprovedIds(prepared.operations.filter((operation) => ['patch', 'replace', 'delete'].includes(operation.action)).map((operation) => operation.id)); setStep('plan'); setStatus('review'); persist({ result: prepared, approvedIds: prepared.operations.filter((operation) => ['patch', 'replace', 'delete'].includes(operation.action)).map((operation) => operation.id), status: 'plan_ready' }); remember({ result: prepared, status: 'plan_ready' }); } catch (requestError) { setStatus('error'); setError(requestError?.message || 'No se pudo cargar el contexto o construir el plan.'); }
    };
    const writeDocument = async (document, content, trigger) => {
        await saveEntitySnapshot(activeBook.id, document.type === 'chapter' ? 'chapters' : document.type === 'character' ? 'characters' : 'world', document.id, document.content, trigger);
        if (document.type === 'chapter') { await updateChapter(document.id, { content }, { immediate: true }); await saveLocalSnapshot(document.id, content, trigger); }
        else if (document.type === 'character') await updateCharacter(document.id, { description: content }, { immediate: true });
        else await updateWorldItem(document.id, { content }, { immediate: true });
    };
    const applyPlan = async () => {
        if (!activeBook || !result) return;
        const selectedOperations = result.operations.filter((operation) => approvedIds.includes(operation.id));
        if (!selectedOperations.length) return setError('Incluye al menos una operación aplicable.');
        setStatus('applying'); setError('');
        try {
            await executeOperationsWithRollback({ operations: selectedOperations, documents, approvedOperationIds: new Set(approvedIds), apply: async (operation, nextContent, document) => writeDocument(document, nextContent, 'before-global-plan'), rollback: async (operation, document) => writeDocument(document, document.content, 'rollback-global-plan') });
            const updated = documents.map((document) => ({ ...document }));
            for (const operation of selectedOperations) { const target = updated.find((document) => document.id === operation.documentId); if (!target) continue; const check = validateOperationAgainstDocument({ ...operation, baseFingerprint: '' }, target); if (check.valid) target.content = check.nextContent; }
            setStatus('verifying'); setStep('result');
            const nextVerification = await requestMissionVerification({ profile, mission, documents: updated, operations: selectedOperations });
            setVerification(nextVerification); setStatus(nextVerification.passed ? 'done' : 'error'); persist({ status: nextVerification.passed ? 'completed' : 'needs_review', verification: nextVerification }); remember({ status: nextVerification.passed ? 'completed' : 'needs_review', verification: nextVerification });
        } catch (applyError) { setStatus('error'); setError(applyError?.message || 'El plan no pudo aplicarse y se revirtió lo avanzado.'); persist({ status: 'failed' }); }
    };
    const clearProcess = ({ keepRequest = false } = {}) => {
        const nextMissionId = keepRequest ? missionId : `global-${Date.now()}`;
        const nextType = keepRequest ? type : 'develop_canon';
        const nextObjective = keepRequest ? objective : '';
        const nextScope = keepRequest ? scope : 'automatic';
        const nextSelectedIds = keepRequest ? selectedIds : [];
        if (!keepRequest) setMissionId(nextMissionId);
        setType(nextType); setObjective(nextObjective); setScope(nextScope); setSelectedIds(nextSelectedIds);
        setStep(keepRequest ? 'scope' : 'type'); setImpact(null); setAlternatives([]); setAlternativeId(null); setResult(null); setVerification(null); setApprovedIds([]); setError(''); setStatus('idle');
        updateProcess('global-constructor', {
            id: nextMissionId, roomId: 'global-constructor', type: nextType, objective: nextObjective.trim(), request: nextObjective.trim(), scope: nextScope,
            selectedIds: nextSelectedIds, context: { scope: nextScope, selectedIds: nextSelectedIds }, constraints: DEFAULT_CONSTRAINTS,
            status: 'draft', impact: null, alternatives: [], selectedAlternativeId: null, operations: [], approvedOperationIds: [], verification: null, result: null, error: null,
        });
    };
    const reset = () => clearProcess();
    const prepareRetry = () => clearProcess({ keepRequest: true });
    const busy = ['analyzing', 'generating', 'applying', 'verifying'].includes(status);
    const hasSavedProcess = Boolean(impact || alternatives.length || result || verification || (storedMission.status && !['draft', 'idle'].includes(storedMission.status))) && Boolean(objective.trim());
    return <ToolRoomShell room={room} status={busy ? 'processing' : verification ? 'saved' : 'ready'} context={<div className="flex items-center gap-3"><ShieldCheck size={17} className="text-indigo-500" /><span>{statusLabel[status] || statusLabel.idle} · {documents.length} documentos de contexto</span></div>}>
        <div className="mx-auto max-w-6xl">{launch?.prompt && <div className="mb-5 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-600">Solicitud recibida desde Core IA Studio</p><p className="mt-1 text-sm font-bold">Se abrió este módulo porque la solicitud puede afectar el canon o más de un documento.</p><p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-muted)]">{launch.prompt}</p><p className="mt-3 text-[10px] font-black uppercase tracking-wider text-amber-700">Todavía no se ha modificado ningún documento.</p></div>}<section className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-[var(--bg-editor)] to-[var(--bg-editor)] p-6 lg:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500">Cambios de alto impacto</p><h2 className="mt-2 text-3xl font-serif font-black">Constructor Global</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">La IA analiza y propone. Tú apruebas un plan antes de modificar el canon.</p></div><div className="flex flex-wrap items-center justify-end gap-2">{hasSavedProcess && <><button type="button" onClick={prepareRetry} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-[var(--bg-editor)] px-3 py-2 text-xs font-black text-indigo-600 hover:bg-indigo-500/10 disabled:opacity-50"><RefreshCw size={14} /> Reanalizar solicitud</button><button type="button" onClick={reset} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] px-3 py-2 text-xs font-black text-[var(--text-muted)] hover:bg-[var(--bg-app)] disabled:opacity-50"><X size={14} /> Limpiar y nueva acción</button></>}<div className="rounded-2xl bg-indigo-500/10 p-3 text-indigo-500"><Sparkles size={24} /></div></div></div><StepBar step={step} /></section>
            {step === 'type' && <section className="mt-5 rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 lg:p-7"><h3 className="text-xl font-serif font-black">¿Qué quieres cambiar?</h3><p className="mt-2 text-sm text-[var(--text-muted)]">Usa este espacio para decisiones que puedan afectar varios documentos o hechos de la obra.</p><div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{TYPES.map(([id, IconComponent, label, description]) => <button key={id} type="button" onClick={() => { setType(id); setStep('objective'); }} className={`rounded-2xl border p-4 text-left transition-all ${type === id ? 'border-indigo-500 bg-indigo-500/10' : 'border-[var(--border-main)] hover:border-indigo-500/50'}`}>{React.createElement(IconComponent, { size: 20, className: 'text-indigo-500' })}<h4 className="mt-4 text-sm font-black">{label}</h4><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{description}</p></button>)}</div></section>}
            {step === 'objective' && <section className="mt-5 rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 lg:p-7"><button type="button" onClick={() => setStep('type')} className="inline-flex items-center gap-2 text-xs font-black text-[var(--text-muted)]"><ArrowLeft size={14} /> Cambiar tipo</button><p className="mt-6 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500">{typeLabel(type)}</p><h3 className="mt-2 text-2xl font-serif font-black">Describe el cambio</h3><textarea autoFocus value={objective} onChange={(event) => setObjective(event.target.value)} rows={6} placeholder="Ej. Elimina la escena del puerto, conserva la información de la deuda y encuentra una forma más fuerte de revelar la traición…" className="mt-5 w-full resize-none rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 text-sm outline-none focus:border-indigo-500" /><div className="mt-6 flex justify-end"><button type="button" disabled={!objective.trim()} onClick={() => setStep('scope')} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Configurar alcance <ChevronRight size={16} /></button></div></section>}
            {step === 'scope' && <section className="mt-5 rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-5 lg:p-7"><button type="button" onClick={() => setStep('objective')} className="inline-flex items-center gap-2 text-xs font-black text-[var(--text-muted)]"><ArrowLeft size={14} /> Volver al objetivo</button><h3 className="mt-6 text-2xl font-serif font-black">¿Qué contexto debe revisar?</h3><div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">{MISSION_SCOPES.map((option) => <button type="button" key={option.id} onClick={() => setScope(option.id)} className={`rounded-2xl border p-4 text-left ${scope === option.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-[var(--border-main)]'}`}><p className="text-sm font-black">{option.label}</p><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{option.description}</p></button>)}</div>{scope === 'selected' && <ContextPicker documents={buildMissionDocuments({ chapters, worldItems, characters, activeChapter, scope: 'all' })} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />}<button type="button" onClick={analyze} disabled={busy || (scope === 'selected' && selectedIds.length === 0)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Analizar impacto</button></section>}
            {step === 'impact' && impact && <ImpactPanel impact={impact} questions={impact.questions} onContinue={proposeAlternatives} busy={busy} />}
            {step === 'alternatives' && <AlternativeCards alternatives={alternatives} selectedId={alternativeId} onSelect={setAlternativeId} onContinue={generatePlan} busy={busy} />}
            {step === 'plan' && result && <PlanReview result={result} selectedIds={approvedIds} setSelectedIds={setApprovedIds} onApply={applyPlan} busy={busy} />}
            {step === 'result' && verification && <section className={`mt-5 rounded-3xl border p-6 ${verification.passed ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}><div className="flex items-start gap-3">{verification.passed ? <CheckCircle2 className="text-emerald-600" /> : <AlertTriangle className="text-amber-600" />}<div><h3 className="text-xl font-serif font-black">{verification.passed ? 'Cambio aplicado y verificado' : 'Cambio aplicado con revisión pendiente'}</h3><p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{verification.summary}</p></div></div>{verification.findings?.length > 0 && <div className="mt-5 space-y-2">{verification.findings.map((finding, index) => <div key={`${finding.title}-${index}`} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-3"><p className="text-xs font-black">{finding.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{finding.detail}</p></div>)}</div>}<button type="button" onClick={reset} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><RefreshCw size={14} /> Nuevo cambio</button></section>}
            {error && <div className="mt-5 flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/5 p-4 text-xs text-red-600"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => setError('')}><X size={14} /></button></div>}
        </div>
    </ToolRoomShell>;
};

export default ConstructorGlobal;
