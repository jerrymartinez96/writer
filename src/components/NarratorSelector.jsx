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
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[var(--bg-app)] w-full max-w-lg rounded-3xl border border-[var(--border-main)] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="p-6 border-b border-[var(--border-main)] flex items-center justify-between bg-indigo-500/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-500 rounded-xl text-white shadow-lg shadow-indigo-500/20">
                            <FileAudio size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-[var(--text-main)]">Narrador Premium</h2>
                            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Gemini 2.5 Flash TTS</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[var(--accent-soft)] rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Opción Generador */}
                    <button 
                        onClick={onOpenGenerator}
                        className="group flex flex-col items-center text-center p-6 rounded-3xl border border-[var(--border-main)] bg-white hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/10 transition-all active:scale-[0.98]"
                    >
                        <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-all transform group-hover:rotate-6">
                            <Sparkles size={32} />
                        </div>
                        <h3 className="font-bold text-lg mb-2">Generador</h3>
                        <p className="text-xs text-[var(--text-muted)] mb-4">Crea o actualiza los fragmentos de audio para este capítulo.</p>
                        <div className="mt-auto flex items-center gap-2 text-indigo-500 font-bold text-xs uppercase tracking-widest bg-indigo-50 px-4 py-2 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            Gestionar <ArrowRight size={14} />
                        </div>
                    </button>

                    {/* Opción Reproductor */}
                    <button 
                        onClick={() => canPlay && onOpenPlayer()}
                        disabled={loading || !canPlay}
                        className={`group flex flex-col items-center text-center p-6 rounded-3xl border transition-all ${
                            canPlay 
                                ? 'bg-white border-[var(--border-main)] hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/10 active:scale-[0.98]' 
                                : 'bg-gray-50 border-dashed border-gray-200 opacity-60 cursor-not-allowed'
                        }`}
                    >
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all transform ${
                            canPlay 
                                ? 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white group-hover:-rotate-6' 
                                : 'bg-gray-200 text-gray-400'
                        }`}>
                            <PlayCircle size={32} />
                        </div>
                        <h3 className="font-bold text-lg mb-2">Reproductor</h3>
                        <p className="text-xs text-[var(--text-muted)] mb-4">
                            {canPlay 
                                ? "Escucha la narración completa del capítulo de forma fluida." 
                                : "Primero debes generar el audio del primer fragmento."}
                        </p>
                        {loading ? (
                            <div className="text-[10px] font-bold text-gray-400 uppercase">Comprobando...</div>
                        ) : (
                            <div className={`mt-auto flex items-center gap-2 font-bold text-xs uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${
                                canPlay 
                                    ? 'bg-emerald-50 text-emerald-500 group-hover:bg-emerald-600 group-hover:text-white' 
                                    : 'bg-gray-100 text-gray-400'
                            }`}>
                                {canPlay ? "Escuchar Ahora" : "Bloqueado"} <Headphones size={14} />
                            </div>
                        )}
                    </button>
                </div>

                {/* Footer Info */}
                <div className="p-4 bg-[var(--bg-editor)]/50 border-t border-[var(--border-main)] text-center">
                    <p className="text-[10px] text-[var(--text-muted)] font-medium italic">
                        La narración premium utiliza Gemini 2.5 Flash para una calidad superior y natural.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default NarratorSelector;
