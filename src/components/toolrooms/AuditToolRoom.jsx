import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ExternalLink, FileSearch, Filter, Loader2, RefreshCw, Search, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToolRooms } from '../../context/ToolRoomContext';
import { getToolRoom } from './toolRoomCatalog';
import ToolRoomShell from './ToolRoomShell';
import ConfirmModal from '../ConfirmModal';
import { requestGlobalConsistencyAnalysis } from '../../services/ai-next/ToolRoomAIService';
import { applyPlainTextPatch } from '../../services/ai-next/plainText';
import { saveEntitySnapshot } from '../../services/db';
import { saveLocalSnapshot } from '../../services/localDb';

const AUDIT_FOCUSES = [
    ['full', 'Auditoría integral'],
    ['continuity', 'Continuidad y canon'],
    ['style', 'Estilo y muletillas'],
    ['character', 'Personajes'],
    ['world', 'Mundo y reglas'],
    ['terminology', 'Terminología'],
    ['timeline', 'Fechas y cronología'],
    ['custom', 'Revisión personalizada'],
];

const SCOPES = [
    ['all', 'Toda la obra'],
    ['chapters', 'Solo capítulos'],
    ['world', 'Mundo y estructura'],
    ['characters', 'Fichas de personajes'],
];

const STATUS_FILTERS = [
    ['all', 'Todos'],
    ['detected', 'Sin confirmar'],
    ['confirmed', 'Confirmados'],
    ['needs_evidence', 'Sin evidencia suficiente'],
    ['applied', 'Resueltos'],
    ['dismissed', 'Descartados'],
];

const severityClass = {
    high: 'bg-red-500/10 text-red-600',
    medium: 'bg-amber-500/10 text-amber-600',
    low: 'bg-blue-500/10 text-blue-600',
};

const statusClass = {
    detected: 'bg-slate-500/10 text-slate-600',
    confirmed: 'bg-indigo-500/10 text-indigo-600',
    needs_evidence: 'bg-amber-500/10 text-amber-700',
    applied: 'bg-emerald-500/10 text-emerald-600',
    dismissed: 'bg-gray-500/10 text-gray-500',
};

const statusLabel = {
    detected: 'Sin confirmar',
    confirmed: 'Confirmado',
    needs_evidence: 'Falta evidencia',
    applied: 'Resuelto',
    dismissed: 'Descartado',
};

const CANON_CATEGORIES = new Set(['continuity', 'character', 'world', 'terminology', 'timeline', 'fact', 'rule', 'reference', 'canon', 'relationship', 'arc']);
const STRUCTURAL_CATEGORIES = new Set(['plot', 'plot_hole', 'causality', 'structure', 'open_thread', 'consequence']);
const DIRECT_CATEGORIES = new Set(['style', 'mulettilla', 'detail', 'grammar', 'format']);

const requiresGlobalReview = (finding) => finding.severity === 'high'
    || (Array.isArray(finding.documentIds) && finding.documentIds.length > 1)
    || CANON_CATEGORIES.has(finding.category)
    || STRUCTURAL_CATEGORIES.has(finding.category)
    || !DIRECT_CATEGORIES.has(finding.category);

const canApplyDirectly = (finding) => !requiresGlobalReview(finding)
    && finding.severity === 'low'
    && Array.isArray(finding.documentIds)
    && finding.documentIds.length <= 1
    && DIRECT_CATEGORIES.has(finding.category);

const StyledSelect = ({ label, value, options, onChange }) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);
    const selectedLabel = options.find(([optionValue]) => optionValue === value)?.[1] || 'Seleccionar';

    useEffect(() => {
        const close = (event) => {
            if (!containerRef.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    return <div ref={containerRef} className="relative">
        <span className="text-xs font-black">{label}</span>
        <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-left text-sm outline-none transition-colors hover:border-orange-500 focus:border-orange-500">
            <span className="truncate">{selectedLabel}</span><ChevronDown size={15} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <div role="listbox" aria-label={label} className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-1.5 shadow-2xl">
            {options.map(([optionValue, optionLabel]) => <button type="button" role="option" aria-selected={value === optionValue} key={optionValue} onClick={() => { onChange(optionValue); setOpen(false); }} className={`w-full rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${value === optionValue ? 'bg-orange-500/10 text-orange-600' : 'hover:bg-[var(--accent-soft)]'}`}>{optionLabel}</button>)}
        </div>}
    </div>;
};

const AuditFinding = ({ finding, documents, applying, error, onConfirm, onDismiss, onDelete, onApply, onOpenConstructor, onOpenEditor, onChangeReplacement }) => {
    const target = documents.find((document) => document.id === finding.documentId);
    const globalReview = requiresGlobalReview(finding);
    const direct = canApplyDirectly(finding);
    const evidenceComplete = finding.status !== 'needs_evidence';
    const involvedDocuments = (finding.documentIds || []).map((id) => documents.find((document) => document.id === id)?.title || id);

    return <article className={`rounded-2xl border p-4 ${finding.status === 'applied' ? 'border-emerald-500/30 bg-emerald-500/5' : finding.status === 'dismissed' ? 'border-gray-500/20 bg-gray-500/5 opacity-70' : 'border-[var(--border-main)] bg-[var(--bg-app)]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-sm font-black">{finding.title}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{involvedDocuments.join(' · ') || target?.title || finding.documentId} · {finding.category}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${severityClass[finding.severity] || severityClass.medium}`}>{finding.severity}</span>
                <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${statusClass[finding.status] || statusClass.detected}`}>{statusLabel[finding.status] || finding.status}</span>
            </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--text-muted)]"><span>Confianza: {Math.round(finding.confidence * 100)}%</span><span>Documento principal: {target?.title || finding.documentId}</span></div>
        {finding.excerpt && <p className="mt-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-3 text-xs leading-relaxed">{finding.excerpt}</p>}
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{finding.reason || 'La auditoría no proporcionó una explicación adicional.'}</p>

        {finding.evidence?.length > 0 && <details className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-cyan-700">Ver evidencia textual ({finding.evidence.length})</summary>
            <div className="mt-3 space-y-2">{finding.evidence.map((item, index) => <div key={`${item.documentId}-${index}`} className="rounded-lg border border-cyan-500/15 bg-[var(--bg-editor)] p-2.5"><p className="text-[9px] font-black uppercase text-cyan-700">{documents.find((document) => document.id === item.documentId)?.title || item.documentId}</p><p className="mt-1 text-xs italic leading-relaxed">“{item.quote}”</p></div>)}</div>
        </details>}

        {finding.status === 'needs_evidence' && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Este hallazgo involucra varios documentos, pero no tiene una cita exacta de cada uno. No se puede confirmar ni enviar al Constructor todavía.</div>}
        {globalReview && finding.status === 'confirmed' && <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs leading-relaxed text-indigo-700">Afecta continuidad o canon. La resolución debe pasar por análisis de impacto y aprobación en Constructor Global.</div>}

        {direct && finding.status === 'confirmed' && <div className="mt-4 grid items-stretch grid-cols-1 gap-3 md:grid-cols-2"><div className="flex h-full flex-col"><p className="text-[9px] font-black uppercase tracking-wider text-red-500">Encontrado</p><p className="mt-1 min-h-[92px] flex-1 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs">{finding.originalText}</p></div><label className="flex h-full flex-col text-[9px] font-black uppercase tracking-wider text-emerald-600">Reemplazo<textarea value={finding.replacementText} onChange={(event) => onChangeReplacement(finding.id, event.target.value)} rows={2} className="mt-1 min-h-[92px] h-full w-full flex-1 resize-none rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs font-normal normal-case outline-none focus:border-emerald-500" /></label></div>}
        {error && <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs leading-relaxed text-red-600"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
            {finding.status === 'detected' && <><button type="button" onClick={() => onConfirm(finding.id)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-500"><Check size={14} /> Confirmar hallazgo</button><button type="button" onClick={() => onDismiss(finding.id)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><XCircle size={14} /> No es un problema</button></>}
            {finding.status === 'confirmed' && globalReview && evidenceComplete && <button type="button" onClick={() => onOpenConstructor(finding)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-500"><ExternalLink size={14} /> Enviar al Constructor Global</button>}
            {finding.status === 'confirmed' && direct && <button type="button" onClick={() => onApply(finding)} disabled={Boolean(applying)} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white hover:bg-orange-500 disabled:cursor-wait disabled:opacity-60">{applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {applying ? 'Guardando…' : 'Aplicar corrección menor'}</button>}
            {finding.status === 'confirmed' && target?.type === 'chapter' && <button type="button" onClick={() => onOpenEditor(finding)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black">Abrir en editor</button>}
            {finding.status === 'confirmed' && <button type="button" onClick={() => onDismiss(finding.id)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black text-[var(--text-muted)]"><XCircle size={14} /> Descartar</button>}
            {finding.status === 'applied' && <span className="inline-flex items-center gap-2 text-xs font-black text-emerald-600"><CheckCircle2 size={15} /> Cambio guardado con snapshot</span>}
            {finding.status === 'dismissed' && <span className="text-xs font-bold text-[var(--text-muted)]">Marcado como no problemático.</span>}
            <button type="button" onClick={() => onDelete(finding.id)} className="inline-flex items-center gap-2 rounded-xl border border-red-500/25 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-500/10" title="Eliminar del historial"><Trash2 size={14} /> Eliminar del historial</button>
        </div>
    </article>;
};

const AuditToolRoom = () => {
    const room = getToolRoom('audit');
    const { activeBook, profile, chapters = [], worldItems = [], characters = [], lazyLoadChapters, updateChapter, updateWorldItem, updateCharacter, selectChapter, setActiveView } = useData();
    const { getRoomState, updateProcess, openToolRoom } = useToolRooms();
    const storedProcess = getRoomState('audit').process || {};
    const savedAuditType = storedProcess.auditType;
    const [auditType, setAuditType] = useState(savedAuditType && !['continuity', 'custom'].includes(savedAuditType) ? savedAuditType : 'full');
    const [scope, setScope] = useState(storedProcess.scope || 'all');
    const [query, setQuery] = useState(storedProcess.query || '');
    const [canonical, setCanonical] = useState(storedProcess.canonical || '');
    const [instruction, setInstruction] = useState(storedProcess.instruction || '');
    const [documents, setDocuments] = useState(storedProcess.documents || []);
    const [result, setResult] = useState(storedProcess.result || null);
    const [status, setStatus] = useState(storedProcess.status === 'analyzing' ? 'loading' : storedProcess.status === 'failed' ? 'error' : storedProcess.result ? 'ready' : 'idle');
    const [error, setError] = useState('');
    const [applyingFindingId, setApplyingFindingId] = useState(null);
    const [findingErrors, setFindingErrors] = useState({});
    const [findingToDelete, setFindingToDelete] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');

    const persistAudit = (patch = {}) => updateProcess('audit', { auditType, scope, query, canonical, instruction, documents, result, ...patch });

    const visibleCounts = useMemo(() => ({
        chapters: chapters.filter((chapter) => !chapter.isVolume).length,
        world: worldItems.length,
        characters: characters.length,
    }), [chapters, worldItems, characters]);

    const categories = useMemo(() => [['all', 'Todas las categorías'], ...Array.from(new Set((result?.findings || []).map((finding) => finding.category).filter(Boolean))).sort().map((category) => [category, category])], [result]);
    const filteredFindings = useMemo(() => (result?.findings || []).filter((finding) => (statusFilter === 'all' || finding.status === statusFilter) && (categoryFilter === 'all' || finding.category === categoryFilter)), [categoryFilter, result, statusFilter]);
    const findingCounts = useMemo(() => (result?.findings || []).reduce((counts, finding) => ({ ...counts, [finding.status]: (counts[finding.status] || 0) + 1 }), {}), [result]);

    const buildDocuments = async () => {
        const includeChapters = scope === 'all' || scope === 'chapters';
        const includeWorld = scope === 'all' || scope === 'world';
        const includeCharacters = scope === 'all' || scope === 'characters';
        const selectedChapters = includeChapters ? chapters.filter((chapter) => !chapter.isVolume) : [];
        const loaded = includeChapters ? await lazyLoadChapters(selectedChapters.map((chapter) => chapter.id)) : [];
        const loadedById = new Map((loaded || []).map((chapter) => [chapter.id, chapter]));
        return [
            ...selectedChapters.map((chapter) => ({ ...chapter, ...(loadedById.get(chapter.id) || {}), type: 'chapter', title: chapter.title })),
            ...(includeWorld ? worldItems.map((item) => ({ ...item, type: 'worldItem', title: item.title, content: item.content || item.description || '' })) : []),
            ...(includeCharacters ? characters.map((character) => ({ ...character, type: 'character', title: character.name, content: character.description || '' })) : []),
        ].filter((document) => String(document.content || '').trim());
    };

    const runAudit = async () => {
        if (status === 'loading') return;
        setStatus('loading'); setError(''); setResult(null); setStatusFilter('all'); setCategoryFilter('all');
        persistAudit({ status: 'analyzing', error: null, result: null });
        try {
            const completeDocuments = await buildDocuments();
            setDocuments(completeDocuments);
            const nextResult = await requestGlobalConsistencyAnalysis({ profile, auditType, query, canonical, instruction, documents: completeDocuments });
            setResult(nextResult); setStatus('ready');
            persistAudit({ status: 'completed', documents: completeDocuments, result: nextResult, error: null });
        } catch (requestError) {
            const message = requestError?.message || 'No se pudo completar la auditoría.';
            setError(message); setStatus('error'); persistAudit({ status: 'failed', error: message });
        }
    };

    const updateFinding = (findingId, patch) => {
        const nextResult = result ? { ...result, findings: result.findings.map((finding) => finding.id === findingId ? { ...finding, ...patch } : finding) } : result;
        setResult(nextResult); persistAudit({ result: nextResult });
    };

    const deleteFinding = (findingId) => {
        if (!result?.findings?.some((item) => item.id === findingId)) return;
        const nextResult = { ...result, findings: result.findings.filter((item) => item.id !== findingId) };
        setResult(nextResult);
        setFindingErrors((previous) => { const nextErrors = { ...previous }; delete nextErrors[findingId]; return nextErrors; });
        persistAudit({ result: nextResult });
        setFindingToDelete(null);
    };

    const applyFinding = async (finding) => {
        if (!canApplyDirectly(finding) || finding.status !== 'confirmed' || applyingFindingId) return;
        if (!finding.originalText || (!finding.replacementText.trim() && !finding.replacementEdited)) {
            setFindingErrors((previous) => ({ ...previous, [finding.id]: 'Edita el reemplazo antes de aplicar la corrección menor.' }));
            return;
        }
        const target = documents.find((document) => document.id === finding.documentId);
        if (!target) return;
        const nextContent = applyPlainTextPatch(target.content, finding.originalText, finding.replacementText);
        if (nextContent === null) {
            setFindingErrors((previous) => ({ ...previous, [finding.id]: 'El texto original ya no coincide. Ejecuta de nuevo la auditoría.' }));
            return;
        }
        setApplyingFindingId(finding.id); setFindingErrors((previous) => ({ ...previous, [finding.id]: '' }));
        try {
            const collection = target.type === 'chapter' ? 'chapters' : target.type === 'worldItem' ? 'world' : 'characters';
            await saveEntitySnapshot(activeBook.id, collection, target.id, target.content, 'before-audit-resolution');
            if (target.type === 'chapter') { await updateChapter(target.id, { content: nextContent }, { immediate: true }); await saveLocalSnapshot(target.id, nextContent, 'audit-resolution'); }
            else if (target.type === 'worldItem') await updateWorldItem(target.id, { content: nextContent }, { immediate: true });
            else await updateCharacter(target.id, { description: nextContent }, { immediate: true });
            setDocuments((previous) => previous.map((document) => document.id === target.id ? { ...document, content: nextContent } : document));
            updateFinding(finding.id, { status: 'applied' });
        } catch (applyError) {
            setFindingErrors((previous) => ({ ...previous, [finding.id]: applyError?.message || 'No se pudo aplicar la corrección.' }));
        } finally { setApplyingFindingId(null); }
    };

    const openFindingInConstructor = (finding) => {
        if (finding.status !== 'confirmed') return;
        const affectedIds = Array.isArray(finding.documentIds) && finding.documentIds.length ? finding.documentIds : [finding.documentId];
        const affectedDocuments = documents.filter((document) => affectedIds.includes(document.id));
        const context = {
            chapterIds: affectedDocuments.filter((document) => document.type === 'chapter').map((document) => document.id),
            worldItemIds: affectedDocuments.filter((document) => document.type === 'worldItem' || document.type === 'world').map((document) => document.id),
            characterIds: affectedDocuments.filter((document) => document.type === 'character').map((document) => document.id),
        };
        const evidence = (finding.evidence || []).map((item) => `${documents.find((document) => document.id === item.documentId)?.title || item.documentId}: “${item.quote}”`).join('\n');
        const prompt = `Resuelve este hallazgo confirmado de Auditoría de obra. Analiza su impacto, genera alternativas y prepara un plan aprobado. No apliques nada sin mi aprobación.\n\nTítulo: ${finding.title}\nCategoría: ${finding.category}\nSeveridad: ${finding.severity}\nConfianza: ${finding.confidence}\nMotivo: ${finding.reason}\nEvidencia:\n${evidence || '(sin evidencia adicional)'}\nTexto original señalado: ${finding.originalText || '(solo informativo)'}\nReemplazo sugerido: ${finding.replacementText || '(ninguno)'}`;
        try {
            window.sessionStorage.setItem('verne-ia-studio-launch', JSON.stringify({ roomId: 'global-constructor', prompt, context, contextLabel: affectedDocuments.map((document) => document.title).join(', '), createdAt: new Date().toISOString() }));
        } catch { setError('No se pudo preparar el hallazgo para el Constructor Global.'); return; }
        updateFinding(finding.id, { status: 'confirmed' });
        openToolRoom('toolroom:global-constructor');
    };

    const openFindingInEditor = async (finding) => {
        const target = documents.find((document) => document.id === finding.documentId);
        if (!target || target.type !== 'chapter') return;
        await selectChapter(target.id); setActiveView('editor');
    };

    const isLoading = status === 'loading';
    return <ToolRoomShell room={room} status={isLoading ? 'processing' : result ? 'saved' : 'ready'} context={<div className="flex items-center gap-3"><ShieldCheck size={17} className="text-emerald-500" /><span>{isLoading ? 'Analizando obra…' : `${documents.length || 'Sin'} documentos en la última revisión`}</span></div>}>
        <div className="mx-auto max-w-6xl space-y-5">
            <section className="rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-[var(--bg-editor)] to-[var(--bg-editor)] p-6 lg:p-8">
                <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-500">Diagnóstico y control de calidad</p><h2 className="mt-2 text-3xl font-serif font-black">Auditoría de obra</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">Encuentra problemas, demuestra la evidencia y decide qué merece una corrección menor o un análisis de canon.</p></div><div className="rounded-2xl bg-orange-500/10 p-3 text-orange-500"><FileSearch size={24} /></div></div>
                <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[10px] text-[var(--text-muted)]"><div className="rounded-xl bg-[var(--bg-app)] p-2"><strong className="block text-lg text-[var(--text-main)]">{visibleCounts.chapters}</strong>capítulos</div><div className="rounded-xl bg-[var(--bg-app)] p-2"><strong className="block text-lg text-[var(--text-main)]">{visibleCounts.world}</strong>documentos de mundo</div><div className="rounded-xl bg-[var(--bg-app)] p-2"><strong className="block text-lg text-[var(--text-main)]">{visibleCounts.characters}</strong>personajes</div></div>
            </section>

            <section className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-6 lg:p-8">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-black text-white">1</div>
                    <div><h3 className="text-lg font-black">Configura la auditoría</h3><p className="text-xs text-[var(--text-muted)]">La auditoría integral revisa la obra completa por defecto.</p></div>
                </div>
                <div className="mt-5 rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4">
                    <div className="flex items-start gap-3"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-orange-600" /><div><p className="text-sm font-black">Auditoría integral</p><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">Busca continuidad y canon, huecos de trama, contradicciones, causalidad, consecuencias, personajes, relaciones, mundo, cronología, terminología y referencias obsoletas. La IA no espera que le indiques qué problema buscar.</p></div></div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"><StyledSelect label="Alcance" value={scope} options={SCOPES} onChange={setScope} /><div className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-xs leading-relaxed text-[var(--text-muted)]"><span className="font-black text-[var(--text-main)]">Modo activo: </span>auditoría completa, de solo lectura y con evidencia por hallazgo.</div></div>
                <details className="mt-4 rounded-xl border border-[var(--border-main)] p-3">
                    <summary className="cursor-pointer text-xs font-black">Personalizar auditoría (opcional)</summary>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">Usa estas opciones solo si quieres priorizar un área concreta. No son necesarias para auditar la obra completa.</p>
                    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2"><StyledSelect label="Área a priorizar" value={auditType} options={AUDIT_FOCUSES} onChange={setAuditType} /><label className="text-xs font-black">Buscar personaje, frase o detalle<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. Kai, ‘ya sabes’, cicatriz…" className="mt-2 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-orange-500" /></label><label className="text-xs font-black md:col-span-2">Fuente de verdad opcional<input value={canonical} onChange={(event) => setCanonical(event.target.value)} placeholder="Qué versión debe considerarse correcta" className="mt-2 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-orange-500" /></label></div>
                    <label className="mt-4 block text-xs font-black">Instrucción adicional (opcional)<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={3} placeholder="Ej. Conserva los usos intencionales en escenas de tensión." className="mt-2 w-full resize-none rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-orange-500" /></label>
                </details>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--text-muted)]">La auditoría no modifica documentos. Los cambios de canon se derivan al Constructor Global.</p><button type="button" onClick={runAudit} disabled={isLoading} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-black text-white hover:bg-orange-500 disabled:cursor-wait disabled:opacity-60">{isLoading ? <Loader2 size={17} className="animate-spin" /> : result ? <RefreshCw size={17} /> : <Search size={17} />} {isLoading ? 'Analizando…' : result ? 'Actualizar auditoría completa' : 'Iniciar auditoría completa'}</button></div>{error && <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}
            </section>

            {result && <section className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-6 lg:p-8"><div className="flex items-start gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-black text-white">2</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-black">Revisa los hallazgos</h3><p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{result.summary || 'La auditoría terminó sin un resumen adicional.'}</p></div><span className="rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase text-orange-700">{filteredFindings.length} de {result.findings.length}</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5"><div className="rounded-xl bg-[var(--bg-app)] p-2 text-center text-[10px] text-[var(--text-muted)]"><strong className="block text-base text-[var(--text-main)]">{findingCounts.detected || 0}</strong>por confirmar</div><div className="rounded-xl bg-indigo-500/5 p-2 text-center text-[10px] text-indigo-700"><strong className="block text-base">{findingCounts.confirmed || 0}</strong>confirmados</div><div className="rounded-xl bg-amber-500/5 p-2 text-center text-[10px] text-amber-700"><strong className="block text-base">{findingCounts.needs_evidence || 0}</strong>sin evidencia</div><div className="rounded-xl bg-emerald-500/5 p-2 text-center text-[10px] text-emerald-700"><strong className="block text-base">{findingCounts.applied || 0}</strong>resueltos</div><div className="rounded-xl bg-gray-500/5 p-2 text-center text-[10px] text-gray-600"><strong className="block text-base">{findingCounts.dismissed || 0}</strong>descartados</div></div><div className="mt-4 flex flex-wrap items-center gap-2"><Filter size={14} className="text-[var(--text-muted)]" /><StyledSelect label="Estado" value={statusFilter} options={STATUS_FILTERS} onChange={setStatusFilter} /><StyledSelect label="Categoría" value={categoryFilter} options={categories} onChange={setCategoryFilter} /></div><div className="mt-5 space-y-3">{filteredFindings.length ? filteredFindings.map((finding) => <AuditFinding key={finding.id} finding={finding} documents={documents} applying={applyingFindingId === finding.id} error={findingErrors[finding.id]} onConfirm={(id) => updateFinding(id, { status: 'confirmed' })} onDismiss={(id) => updateFinding(id, { status: 'dismissed' })} onDelete={(item) => setFindingToDelete(item)} onApply={applyFinding} onOpenConstructor={openFindingInConstructor} onOpenEditor={openFindingInEditor} onChangeReplacement={(id, replacementText) => updateFinding(id, { replacementText, replacementEdited: true })} />) : <div className="rounded-2xl border border-dashed border-[var(--border-main)] p-8 text-center text-sm text-[var(--text-muted)]">No hay hallazgos con estos filtros.</div>}</div></div></div></section>}
        </div>
        <ConfirmModal isOpen={Boolean(findingToDelete)} onClose={() => setFindingToDelete(null)} onConfirm={() => deleteFinding(findingToDelete?.id)} title="¿Eliminar este hallazgo?" message="Se quitará del historial de Auditoría. Esta acción no modifica documentos ni deshace cambios aplicados." confirmText="Eliminar hallazgo" />
    </ToolRoomShell>;
};

export default AuditToolRoom;
