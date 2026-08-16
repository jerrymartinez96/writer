import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, FileSearch, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { getToolRoom } from './toolRoomCatalog';
import ToolRoomShell from './ToolRoomShell';
import { requestGlobalConsistencyAnalysis } from '../../services/ai-next/ToolRoomAIService';
import { applyPlainTextPatch } from '../../services/ai-next/plainText';
import { saveEntitySnapshot } from '../../services/db';
import { saveLocalSnapshot } from '../../services/localDb';

const AUDIT_TYPES = [
    ['mulettilla', 'Muletillas y estilo'],
    ['character', 'Detalles de personaje'],
    ['world', 'Detalles del mundo'],
    ['terminology', 'Terminología'],
    ['timeline', 'Fechas y cronología'],
    ['custom', 'Auditoría personalizada'],
];

const SCOPES = [
    ['all', 'Toda la obra'],
    ['chapters', 'Solo capítulos'],
    ['world', 'Mundo y estructura'],
    ['characters', 'Fichas de personajes'],
];

const severityClass = { high: 'bg-red-500/10 text-red-600', medium: 'bg-amber-500/10 text-amber-600', low: 'bg-blue-500/10 text-blue-600' };

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

    return <div ref={containerRef} className="relative"><span className="text-xs font-black">{label}</span><button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-left text-sm font-normal outline-none transition-colors hover:border-orange-500 focus:border-orange-500"><span className="truncate">{selectedLabel}</span><ChevronDown size={15} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} /></button>{open && <div role="listbox" aria-label={label} className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-1.5 shadow-2xl">{options.map(([optionValue, optionLabel]) => <button type="button" role="option" aria-selected={value === optionValue} key={optionValue} onClick={() => { onChange(optionValue); setOpen(false); }} className={`w-full rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${value === optionValue ? 'bg-orange-500/10 text-orange-600' : 'hover:bg-[var(--accent-soft)]'}`}>{optionLabel}</button>)}</div>}</div>;
};

const ConsistencyToolRoom = () => {
    const room = getToolRoom('consistency');
    const { activeBook, profile, chapters = [], worldItems = [], characters = [], lazyLoadChapters, updateChapter, updateWorldItem, updateCharacter } = useData();
    const [auditType, setAuditType] = useState('mulettilla');
    const [scope, setScope] = useState('all');
    const [query, setQuery] = useState('');
    const [canonical, setCanonical] = useState('');
    const [instruction, setInstruction] = useState('');
    const [documents, setDocuments] = useState([]);
    const [result, setResult] = useState(null);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const [applyingFindingId, setApplyingFindingId] = useState(null);
    const [findingErrors, setFindingErrors] = useState({});

    const visibleCounts = useMemo(() => ({
        chapters: chapters.filter((chapter) => !chapter.isVolume).length,
        world: worldItems.length,
        characters: characters.length,
    }), [chapters, worldItems, characters]);

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
        setStatus('loading');
        setError('');
        setResult(null);
        try {
            const completeDocuments = await buildDocuments();
            setDocuments(completeDocuments);
            const nextResult = await requestGlobalConsistencyAnalysis({ profile, auditType, query, canonical, instruction, documents: completeDocuments });
            setResult(nextResult);
            setStatus('ready');
        } catch (requestError) {
            setError(requestError?.message || 'No se pudo completar la auditoría.');
            setStatus('error');
        }
    };

    const applyFinding = async (finding) => {
        if (!finding.originalText || applyingFindingId) return;
        setApplyingFindingId(finding.id);
        setFindingErrors((previous) => ({ ...previous, [finding.id]: '' }));
        setError('');
        if (!finding.replacementText.trim() && !finding.replacementEdited) {
            const message = 'La IA no propuso una reescritura segura. Edita el reemplazo o vuelve a ejecutar la auditoría antes de aplicar.';
            setFindingErrors((previous) => ({ ...previous, [finding.id]: message }));
            setApplyingFindingId(null);
            return;
        }
        const target = documents.find((document) => document.id === finding.documentId);
        if (!target) {
            setApplyingFindingId(null);
            return;
        }
        const nextContent = applyPlainTextPatch(target.content, finding.originalText, finding.replacementText);
        if (nextContent === null) {
            const message = 'El texto original ya no coincide con este documento. Vuelve a analizar este documento para actualizar el hallazgo.';
            setFindingErrors((previous) => ({ ...previous, [finding.id]: message }));
            setApplyingFindingId(null);
            return;
        }
        try {
            const collection = target.type === 'chapter' ? 'chapters' : target.type === 'worldItem' ? 'world' : 'characters';
            await saveEntitySnapshot(activeBook.id, collection, target.id, target.content, 'before-consistency-resolution');
            if (target.type === 'chapter') {
                await updateChapter(target.id, { content: nextContent }, { immediate: true });
                await saveLocalSnapshot(target.id, nextContent, 'consistency-resolution');
            } else if (target.type === 'worldItem') {
                await updateWorldItem(target.id, { content: nextContent }, { immediate: true });
            } else {
                await updateCharacter(target.id, { description: nextContent }, { immediate: true });
            }
            setDocuments((previous) => previous.map((document) => document.id === target.id ? { ...document, content: nextContent } : document));
            setResult((previous) => previous ? { ...previous, findings: previous.findings.map((item) => item.id === finding.id ? { ...item, status: 'applied' } : item) } : previous);
        } catch (applyError) {
            const message = applyError?.message || 'No se pudo aplicar el cambio.';
            setFindingErrors((previous) => ({ ...previous, [finding.id]: message }));
        } finally {
            setApplyingFindingId(null);
        }
    };

    const updateReplacement = (findingId, replacementText) => setResult((previous) => previous ? { ...previous, findings: previous.findings.map((finding) => finding.id === findingId ? { ...finding, replacementText, replacementEdited: true } : finding) } : previous);
    const isLoading = status === 'loading';

    return <ToolRoomShell room={room} status={isLoading ? 'processing' : result ? 'saved' : 'ready'} context={<div className="flex items-center gap-3"><ShieldCheck size={17} className="text-emerald-500" /><span>Auditoría global sobre {scope === 'all' ? 'toda la obra' : SCOPES.find((item) => item[0] === scope)?.[1].toLowerCase()}</span></div>}>
        <div className="mx-auto max-w-5xl space-y-5">
            <section className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-6 lg:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-500">Control transversal</p><h2 className="mt-2 text-3xl font-serif font-black">Consistencia global</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">Encuentra muletillas, detalles variables y referencias desactualizadas en varios documentos sin modificar nada automáticamente.</p></div><div className="grid grid-cols-3 gap-2 text-center text-[10px] text-[var(--text-muted)]"><div className="rounded-xl bg-[var(--bg-app)] p-2"><strong className="block text-lg text-[var(--text-main)]">{visibleCounts.chapters}</strong>capítulos</div><div className="rounded-xl bg-[var(--bg-app)] p-2"><strong className="block text-lg text-[var(--text-main)]">{visibleCounts.world}</strong>mundo</div><div className="rounded-xl bg-[var(--bg-app)] p-2"><strong className="block text-lg text-[var(--text-main)]">{visibleCounts.characters}</strong>personajes</div></div></div><div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2"><StyledSelect label="Tipo de auditoría" value={auditType} options={AUDIT_TYPES} onChange={setAuditType} /><StyledSelect label="Alcance" value={scope} options={SCOPES} onChange={setScope} /><label className="text-xs font-black">Personaje, frase o detalle<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. Elena, ‘ya sabes’, cicatriz…" className="mt-2 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-orange-500" /></label><label className="text-xs font-black">Versión correcta opcional<input value={canonical} onChange={(event) => setCanonical(event.target.value)} placeholder="Ej. La cicatriz está en la mejilla izquierda" className="mt-2 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-orange-500" /></label><label className="text-xs font-black md:col-span-2">Instrucción adicional<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={2} placeholder="Ej. Conserva los usos intencionales en escenas de tensión." className="mt-2 w-full resize-none rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] p-3 text-sm font-normal outline-none focus:border-orange-500" /></label></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--text-muted)]">Documentos analizados: {documents.length || 'se calcularán al iniciar'}.</p><button type="button" onClick={runAudit} disabled={isLoading} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-black text-white hover:bg-orange-500 disabled:cursor-wait disabled:opacity-60">{isLoading ? <Loader2 size={17} className="animate-spin" /> : result ? <RefreshCw size={17} /> : <Search size={17} />} {isLoading ? 'Analizando…' : result ? 'Actualizar auditoría' : 'Analizar consistencia'}</button></div>{error && <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}</section>
            {result && <section className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-6 lg:p-8"><div className="flex items-start gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4"><FileSearch size={18} className="mt-0.5 shrink-0 text-orange-500" /><div><p className="text-sm font-black">{result.findings.length ? `${result.findings.length} resultado(s) para revisar` : 'No se encontraron detalles para revisar'}</p><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{result.summary || 'La auditoría terminó sin un resumen adicional.'}</p></div></div><div className="mt-5 space-y-3">{result.findings.map((finding) => { const target = documents.find((document) => document.id === finding.documentId); const isApplying = applyingFindingId === finding.id; const findingError = findingErrors[finding.id]; return <article key={finding.id} className={`rounded-2xl border p-4 ${finding.status === 'applied' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[var(--border-main)] bg-[var(--bg-app)]'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-black">{finding.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{target?.title || finding.documentId} · {finding.category} · confianza {Math.round(finding.confidence * 100)}%</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${finding.status === 'applied' ? 'bg-emerald-500/10 text-emerald-600' : severityClass[finding.severity]}`}>{finding.status === 'applied' ? 'Aplicado' : isApplying ? 'Procesando' : finding.severity}</span></div>{finding.excerpt && <p className="mt-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-3 text-xs leading-relaxed">{finding.excerpt}</p>}<p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{finding.reason}</p>{finding.originalText && finding.status !== 'applied' && <div className="mt-4 grid items-stretch grid-cols-1 gap-3 md:grid-cols-2"><div className="flex h-full flex-col"><p className="text-[9px] font-black uppercase tracking-wider text-red-500">Encontrado</p><p className="mt-1 min-h-[92px] flex-1 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs">{finding.originalText}</p></div><label className="flex h-full flex-col text-[9px] font-black uppercase tracking-wider text-emerald-600">Reemplazo (vacío = eliminar)<textarea value={finding.replacementText} onChange={(event) => updateReplacement(finding.id, event.target.value)} rows={2} className="mt-1 min-h-[92px] h-full w-full flex-1 resize-none rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs font-normal normal-case outline-none focus:border-emerald-500" /></label></div>}{findingError && <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs leading-relaxed text-red-600"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{findingError}</p>}<div className="mt-4">{finding.status === 'applied' ? <span className="inline-flex items-center gap-2 text-xs font-black text-emerald-600"><Check size={14} /> Cambio guardado con snapshot</span> : finding.originalText ? <button type="button" onClick={() => applyFinding(finding)} disabled={Boolean(applyingFindingId)} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white hover:bg-orange-500 disabled:cursor-wait disabled:opacity-60">{isApplying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {isApplying ? 'Aplicando cambio…' : 'Aplicar cambio'}</button> : <span className="text-xs text-[var(--text-muted)]">Resultado informativo; no hay un cambio automático propuesto.</span>}</div></article>; })}</div></section>}
        </div>
    </ToolRoomShell>;
};

export default ConsistencyToolRoom;
