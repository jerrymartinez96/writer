import React, { useState, useEffect } from 'react';
import { 
    X, 
    AudioLines, // Simula el generador
    Headphones, // Simula el reproductor
    Sparkles,
    PlayCircle,
    FileAudio,
    ArrowRight
} from 'lucide-react';
import { getChapterChunks } from '../services/db';
import { getStoredFolderHandle, checkFileExists } from '../services/FileSystemService';

const NarratorSelector = ({ isOpen, onClose, chapter, bookId, onOpenGenerator, onOpenPlayer }) => {
    const [canPlay, setCanPlay] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkStatus = async () => {
            if (!isOpen || !chapter?.id) return;
            setLoading(true);
            try {
                const chunks = await getChapterChunks(bookId, chapter.id);
                if (chunks.length > 0) {
                    // Ordenamos para encontrar el primero
                    const sorted = [...chunks].sort((a,b) => a.orden - b.orden);
                    const firstChunk = sorted[0];
                    
                    const handle = await getStoredFolderHandle();
                    if (handle && firstChunk.audioId) {
                        const exists = await checkFileExists(handle, `${firstChunk.audioId}.wav`) || 
                                       await checkFileExists(handle, `${firstChunk.audioId}.mp3`);
                        setCanPlay(exists);
                    }
                }
            } catch (error) {
                console.error("Error comprobando estado del narrador:", error);
            } finally {
                setLoading(false);
            }
        };

        checkStatus();
    }, [isOpen, chapter?.id, bookId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>
            <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[32px] shadow-[0_30px_100px_rgba(0,0,0,0.5)] w-full max-w-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                
                {/* Header */}
                <div className="p-8 border-b border-[var(--border-main)] flex items-center justify-between bg-indigo-500/[0.03]">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-600/20">
                            <FileAudio size={28} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-[var(--text-main)] font-serif italic tracking-tight">Narrativa Vocal</h2>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] mt-1 opacity-60">Motor Gemini Flash TTS</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-muted)] hover:text-indigo-500 hover:border-indigo-500/30 transition-all active:scale-95"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 grid grid-cols-1 gap-6">
                    <div className="grid grid-cols-2 gap-6">
                        {/* Opción Generador */}
                        <button 
                            onClick={onOpenGenerator}
                            className="group flex flex-col items-center text-center p-8 rounded-[32px] border-2 border-[var(--border-main)] bg-[var(--bg-editor)]/50 hover:border-indigo-500 hover:bg-indigo-500/[0.02] hover:shadow-2xl hover:shadow-indigo-500/10 transition-all active:scale-[0.96] relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Sparkles size={40} className="text-indigo-500" />
                            </div>
                            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-all transform group-hover:scale-110 group-hover:rotate-6">
                                <Sparkles size={32} />
                            </div>
                            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-[var(--text-main)] mb-3">Estudio VOS</h3>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] leading-relaxed mb-6 opacity-60">Genera fragmentos de audio de alta fidelidad.</p>
                            <div className="mt-auto w-full flex items-center justify-center gap-2 text-indigo-600 font-black text-[9px] uppercase tracking-[0.2em] bg-indigo-500/10 px-4 py-2.5 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                GESTIONAR <ArrowRight size={14} />
                            </div>
                        </button>

                        {/* Opción Reproductor */}
                        <button 
                            onClick={() => canPlay && onOpenPlayer()}
                            disabled={loading || !canPlay}
                            className={`group flex flex-col items-center text-center p-8 rounded-[32px] border-2 transition-all relative overflow-hidden ${
                                canPlay 
                                    ? 'bg-[var(--bg-editor)]/50 border-[var(--border-main)] hover:border-emerald-500 hover:bg-emerald-500/[0.02] hover:shadow-2xl hover:shadow-emerald-500/10 active:scale-[0.96]' 
                                    : 'bg-[var(--bg-app)] border-dashed border-[var(--border-main)] opacity-40 cursor-not-allowed grayscale'
                            }`}
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <PlayCircle size={40} className="text-emerald-500" />
                            </div>
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-inner transition-all transform ${
                                canPlay 
                                    ? 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white group-hover:scale-110 group-hover:-rotate-6' 
                                    : 'bg-gray-200 text-gray-400'
                            }`}>
                                <PlayCircle size={32} />
                            </div>
                            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-[var(--text-main)] mb-3">Flujo Auditivo</h3>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] leading-relaxed mb-6 opacity-60">
                                {canPlay 
                                    ? "Escucha la obra completa con transición fluida." 
                                    : "Requiere generación previa de fragmentos."}
                            </p>
                            {loading ? (
                                <div className="mt-auto text-[9px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Analizando...</div>
                            ) : (
                                <div className={`mt-auto w-full flex items-center justify-center gap-2 font-black text-[9px] uppercase tracking-[0.2em] px-4 py-2.5 rounded-xl transition-all shadow-sm ${
                                    canPlay 
                                        ? 'bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white' 
                                        : 'bg-gray-100 text-gray-400'
                                }`}>
                                    {canPlay ? "REPRODUCIR" : "BLOQUEADO"} <Headphones size={14} />
                                </div>
                            )}
                        </button>
                    </div>

                    <div className="mt-4 p-5 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl flex items-center gap-4 shadow-inner">
                        <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                            <AudioLines size={20} />
                        </div>
                        <p className="text-[10px] font-black text-[var(--text-muted)] leading-normal uppercase tracking-widest opacity-60">
                            La inteligencia artificial interpreta el tono y la emoción de tu prosa en tiempo real.
                        </p>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="p-6 bg-indigo-500/5 border-t border-[var(--border-main)] text-center">
                    <button 
                        onClick={onClose}
                        className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.3em] hover:text-indigo-800 transition-colors"
                    >
                        Cerrar Panel de Control
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NarratorSelector;
