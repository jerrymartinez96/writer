import React, { useEffect, useState } from 'react';
import { Check, Clock3, Eye, History, Loader2, RotateCcw } from 'lucide-react';
import { getEntitySnapshots } from '../../services/db';

const ToolRoomHistoryPanel = ({ bookId, collectionName, entityId, onRestore }) => {
    const [snapshots, setSnapshots] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        if (!bookId || !entityId) return undefined;
        setLoading(true);
        setError('');
        getEntitySnapshots(bookId, collectionName, entityId)
            .then((items) => { if (!cancelled) setSnapshots(items); })
            .catch((requestError) => { if (!cancelled) setError(requestError?.message || 'No se pudo cargar el historial.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [bookId, collectionName, entityId]);

    const restore = async () => {
        if (!selected || restoring) return;
        if (!window.confirm('¿Restaurar esta versión? Se guardará el contenido actual como un nuevo snapshot antes de aplicar el cambio.')) return;
        setRestoring(true);
        setError('');
        try {
            await onRestore(selected.content);
            setSelected(null);
        } catch (restoreError) {
            setError(restoreError?.message || 'No se pudo restaurar la versión.');
        } finally {
            setRestoring(false);
        }
    };

    return <section className="mt-6 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><History size={16} className="text-[var(--accent-main)]" /><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Historial persistente</p><p className="mt-1 text-sm font-black">Versiones guardadas en Firestore</p></div></div><span className="text-[10px] font-bold text-[var(--text-muted)]">{snapshots.length} versión(es)</span></div>{loading ? <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]"><Loader2 size={14} className="animate-spin" /> Cargando historial…</div> : snapshots.length === 0 ? <p className="mt-4 text-xs text-[var(--text-muted)]">Todavía no hay snapshots persistentes para este documento.</p> : <div className="mt-4 space-y-2">{snapshots.map((snapshot, index) => <button key={snapshot.id} type="button" onClick={() => setSelected(snapshot)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selected?.id === snapshot.id ? 'border-indigo-500 bg-indigo-500/5' : 'border-[var(--border-main)] hover:border-indigo-500/50'}`}><div className="flex items-center gap-2"><Clock3 size={13} className="text-[var(--text-muted)]" /><span className="text-xs font-black">{index === 0 ? 'Versión más reciente' : `Versión ${snapshots.length - index}`}</span><span className="ml-auto text-[10px] text-[var(--text-muted)]">{snapshot.createdAt?.toDate ? snapshot.createdAt.toDate().toLocaleString() : new Date(snapshot.createdAt || Date.now()).toLocaleString()}</span></div><p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{snapshot.triggerType || 'toolroom'} · {String(snapshot.content || '').replace(/<[^>]*>/g, '').slice(0, 140)}</p></button>)}</div>}{selected && <div className="mt-4 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-3"><div className="flex items-center gap-2 text-xs font-black"><Eye size={14} className="text-indigo-500" /> Vista previa de la versión seleccionada</div><pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed">{selected.content}</pre><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={restore} disabled={restoring} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{restoring ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Restaurar versión</button><button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] px-3 py-2 text-xs font-black"><Check size={14} /> Cerrar vista</button></div></div>}{error && <p className="mt-3 text-xs text-red-600">{error}</p>}</section>;
};

export default ToolRoomHistoryPanel;
