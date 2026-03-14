import React, { useState, useEffect } from 'react';
import { 
    X, 
    Play, 
    RefreshCw, 
    Download, 
    FileAudio, 
    AlertCircle, 
    CheckCircle2, 
    Clock, 
    MoreVertical,
    FolderOpen,
    Trash2,
    Copy,
    FileUp,
    FileText,
    ExternalLink,
    Tag,
    Award,
    Zap,
    History
} from 'lucide-react';
import { prepareChunksFromText } from '../services/ChunkService';
import { createChunk, getChapterChunks, updateChunk, deleteChunk } from '../services/db';
import { 
    requestFolderAccess, 
    getStoredFolderHandle, 
    verifyPermission,
    checkFileExists,
    saveAudioFile,
    getLocalFileUrl
} from '../services/FileSystemService';
import { NARRATION_INSTRUCTIONS } from '../services/GeminiTTSService';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';

const PremiumNarrator = ({ isOpen, onClose, chapter, bookId }) => {
    const { user, profile } = useData();
    const toast = useToast();
    
    const [chunks, setChunks] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [folderHandle, setFolderHandle] = useState(null);
    const [localFiles, setLocalFiles] = useState({}); // { chunkId: boolean }
    const [showRegenConfirm, setShowRegenConfirm] = useState(false);
    const [manualChunkId, setManualChunkId] = useState(null);
    const [qualityFilter, setQualityFilter] = useState('all');

    useEffect(() => {
        if (isOpen && chapter?.id) {
            initSession();
        }
    }, [isOpen, chapter?.id]);

    const initSession = async () => {
        const chunksList = await loadChunks();
        const storedHandle = await getStoredFolderHandle();
        if (storedHandle) {
            setFolderHandle(storedHandle);
            await checkAllLocalFiles(storedHandle, chunksList);
        }
    };

    const loadChunks = async () => {
        try {
            const existingChunks = await getChapterChunks(bookId, chapter.id);
            setChunks(existingChunks);
            return existingChunks;
        } catch (error) {
            console.error("Error cargando chunks:", error);
            return [];
        }
    };

    const checkAllLocalFiles = async (handle, chunksList) => {
        if (!handle) return;
        const listToPaths = chunksList || chunks;
        if (!listToPaths || listToPaths.length === 0) return;


        const status = {};
        for (const chunk of listToPaths) {
            if (chunk.audioId) {
                // Verificar ambas extensiones comunes
                const hasMp3 = await checkFileExists(handle, `${chunk.audioId}.mp3`);
                const hasWav = await checkFileExists(handle, `${chunk.audioId}.wav`);
                status[chunk.id] = hasMp3 || hasWav;
            } else {
                status[chunk.id] = false;
            }
        }
        setLocalFiles(status);
    };

    const handleLinkFolder = async () => {
        try {
            const handle = await requestFolderAccess();
            if (handle) {
                setFolderHandle(handle);
                await checkAllLocalFiles(handle);
            }
        } catch (error) {
            console.error("Error vinculando carpeta:", error);
        }
    };

    const handleInitialImport = async () => {
        if (!chapter?.content) return;
        
        setIsProcessing(true);
        try {
            const newChunksData = prepareChunksFromText(chapter.content);
            
            // Guardar en Firebase
            const savedChunks = [];
            for (const chunk of newChunksData) {
                const saved = await createChunk(bookId, chapter.id, {
                    ...chunk,
                    calidad: 'Temporal'
                });
                savedChunks.push(saved);
            }
            setChunks(savedChunks);
            if (folderHandle) checkAllLocalFiles(folderHandle, savedChunks);
        } catch (error) {
            console.error("Error en importación inicial:", error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRegenerateChunks = async () => {
        setIsProcessing(true);
        setShowRegenConfirm(false);
        try {
            // 1. Clonar para borrar en Firebase mientras limpiamos UI
            const chunksToDelete = [...chunks];
            
            // 2. Limpiar estado local inmediatamente para mostrar el loader
            setChunks([]);
            setLocalFiles({});
            
            // 3. Borrar chunks en Firebase
            for (const chunk of chunksToDelete) {
                await deleteChunk(bookId, chapter.id, chunk.id);
            }
            
            // 4. Ejecutar importación inicial de nuevo
            await handleInitialImport();
            
            toast.success("Fragmentos regenerados con éxito.");
        } catch (error) {
            console.error("Error al regenerar chunks:", error);
            toast.error("Error al regenerar los fragmentos.");
        } finally {
            setIsProcessing(false);
        }
    };

    const isChunkDesynced = (chunk) => {
        if (!chunk.textoGenerado) return false;
        return chunk.textoActual !== chunk.textoGenerado;
    };

    const handleUpdateQuality = async (chunk, quality) => {
        try {
            const updateData = { calidad: quality };
            await updateChunk(bookId, chapter.id, chunk.id, updateData);
            setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, ...updateData } : c));
            toast.success(`Calidad actualizada a: ${quality}`);
        } catch (error) {
            toast.error("Error al actualizar calidad");
        }
    };

    const handleManualUpload = async (chunk, file, quality = 'Alta Calidad') => {
        if (!folderHandle) {
            toast.error("Vincule una carpeta primero.");
            return;
        }

        if (!file) return;

        setIsProcessing(true);
        try {
            // Guardar localmente con el nombre correcto
            const extension = file.name.split('.').pop();
            const fileName = `${chunk.audioId}.${extension}`;
            
            await saveAudioFile(folderHandle, fileName, file);

            // Actualizar Firestore
            const updateData = {
                textoGenerado: chunk.textoActual,
                estado: 'Sincronizado',
                calidad: chunk.calidad || quality
            };
            await updateChunk(bookId, chapter.id, chunk.id, updateData);

            // Actualizar estado local
            setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, ...updateData } : c));
            setLocalFiles(prev => ({ ...prev, [chunk.id]: true }));
            setManualChunkId(null);
            
            toast.success("Audio cargado manualmente con éxito.");
        } catch (error) {
            console.error("Error en carga manual:", error);
            toast.error("Error al guardar el archivo.");
        } finally {
            setIsProcessing(false);
        }
    };

    const copyToClipboard = (text, label) => {
        navigator.clipboard.writeText(text);
        toast.info(`${label} copiado al portapapeles`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[var(--bg-app)] w-full max-w-4xl max-h-[90vh] rounded-3xl border border-[var(--border-main)] shadow-2xl flex flex-col overflow-hidden">
                
                {/* Header */}
                <div className="p-6 border-b border-[var(--border-main)] flex items-center justify-between bg-indigo-500/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-500 rounded-xl text-white shadow-lg shadow-indigo-500/20">
                            <FileAudio size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-[var(--text-main)]">Gestor de Narración Premium</h2>
                            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Flujo Manual • Control de Calidad</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {chunks.length > 0 && (
                            <button 
                                onClick={() => setShowRegenConfirm(true)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-all"
                                title="Reiniciar y regenerar fragmentos"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                        <button 
                            onClick={() => checkAllLocalFiles(folderHandle)}
                            className="p-2 text-[var(--accent-main)] hover:bg-[var(--accent-soft)] rounded-full transition-all"
                            title="Refrescar archivos locales"
                        >
                            <RefreshCw size={18} />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-[var(--accent-soft)] rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {chunks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                            <div className="p-6 bg-indigo-500/10 rounded-full text-indigo-500">
                                <RefreshCw size={48} className={isProcessing ? "animate-spin" : ""} />
                            </div>
                            <div className="max-w-md">
                                <h3 className="text-lg font-bold">Preparar Capítulo para Narración</h3>
                                <p className="text-[var(--text-muted)] text-sm mt-2">
                                    Dividiremos el texto en fragmentos inteligentes (max 2,000 caracteres) para optimizar la generación y permitir ediciones futuras sin perder todo el audio.
                                </p>
                            </div>
                            <button 
                                onClick={handleInitialImport}
                                disabled={isProcessing}
                                className="px-8 py-3 bg-indigo-500 text-white rounded-2xl font-bold shadow-xl shadow-indigo-500/20 hover:bg-indigo-600 transition-all flex items-center gap-2"
                            >
                                {isProcessing ? "Procesando fragmentos..." : "Comenzar Fragmentación"}
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {chunks.sort((a,b) => a.orden - b.orden).map((chunk) => {
                                const desynced = isChunkDesynced(chunk);
                                const hasFile = localFiles[chunk.id];
                                
                                return (
                                    <div key={chunk.id} className={`p-4 rounded-2xl border transition-all ${
                                        desynced ? 'bg-amber-500/5 border-amber-500/30' : 
                                        hasFile ? 'bg-emerald-500/5 border-emerald-500/20' : 
                                        'bg-[var(--bg-editor)] border-[var(--border-main)]'
                                    }`}>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-main)]">
                                                        FRAGMENTO {chunk.orden}
                                                    </span>
                                                    
                                                    {chunk.calidad && (
                                                        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                            chunk.calidad === 'Alta Calidad' ? 'bg-emerald-500/10 text-emerald-600' :
                                                            chunk.calidad === 'Baja Calidad' ? 'bg-red-500/10 text-red-600' :
                                                            'bg-indigo-500/10 text-indigo-600'
                                                        }`}>
                                                            {chunk.calidad === 'Alta Calidad' && <Award size={10} />}
                                                            {chunk.calidad === 'Baja Calidad' && <AlertCircle size={10} />}
                                                            {chunk.calidad === 'Temporal' && <History size={10} />}
                                                            {chunk.calidad.toUpperCase()}
                                                        </span>
                                                    )}

                                                    {desynced ? (
                                                        <span className="flex items-center gap-1 text-[10px] text-amber-500 font-bold uppercase tracking-wider">
                                                            <AlertCircle size={12} /> Desincronizado
                                                        </span>
                                                    ) : hasFile ? (
                                                        <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold uppercase tracking-wider">
                                                            <CheckCircle2 size={12} /> Audio Listo
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                                                            <Clock size={12} /> Sin Audio
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm line-clamp-2 italic text-[var(--text-main)] opacity-80">
                                                    "{chunk.textoActual}"
                                                </p>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                {chunk.calidad && (
                                                    <div className="flex flex-col gap-1">
                                                        <button 
                                                            onClick={() => handleUpdateQuality(chunk, 'Alta Calidad')}
                                                            className={`p-1.5 rounded-lg border transition-all ${chunk.calidad === 'Alta Calidad' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-400 opacity-40 hover:opacity-100'}`}
                                                            title="Marcar como Alta Calidad"
                                                        >
                                                            <Award size={14} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleUpdateQuality(chunk, 'Baja Calidad')}
                                                            className={`p-1.5 rounded-lg border transition-all ${chunk.calidad === 'Baja Calidad' ? 'bg-red-500 text-white' : 'bg-white text-gray-400 opacity-40 hover:opacity-100'}`}
                                                            title="Marcar como Baja Calidad"
                                                        >
                                                            <AlertCircle size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                                
                                                <button 
                                                    onClick={() => setManualChunkId(manualChunkId === chunk.id ? null : chunk.id)}
                                                    className={`p-2 rounded-xl border transition-all ${
                                                        manualChunkId === chunk.id
                                                            ? 'bg-indigo-500 text-white border-indigo-600'
                                                            : 'bg-[var(--bg-editor)] text-[var(--text-muted)] border-[var(--border-main)] hover:border-indigo-500 hover:text-indigo-500'
                                                    }`}
                                                    title="Gestión Manual / Copiar Prompt"
                                                >
                                                    <MoreVertical size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Panel Manual */}
                                        {manualChunkId === chunk.id && (
                                            <div className="mt-4 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/20 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                                                        <ExternalLink size={12} /> Gestión Manual
                                                    </h4>
                                                    <div className="flex gap-2">
                                                        {['Temporal', 'Baja Calidad', 'Alta Calidad'].map(q => (
                                                            <button
                                                                key={q}
                                                                onClick={() => handleUpdateQuality(chunk, q)}
                                                                className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-all ${
                                                                    chunk.calidad === q 
                                                                        ? 'bg-indigo-500 text-white shadow-md' 
                                                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                                }`}
                                                            >
                                                                {q.toUpperCase()}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                
                                                <div className="grid grid-cols-2 gap-3">
                                                    <button 
                                                        onClick={() => copyToClipboard(NARRATION_INSTRUCTIONS, "Indicaciones")}
                                                        className="flex items-center justify-center gap-2 p-3 bg-white border border-[var(--border-main)] rounded-xl text-xs font-bold hover:bg-gray-50 transition-all shadow-sm"
                                                    >
                                                        <FileText size={14} className="text-indigo-500" />
                                                        Copiar Indicaciones
                                                    </button>
                                                    <button 
                                                        onClick={() => copyToClipboard(chunk.textoActual, "Texto")}
                                                        className="flex items-center justify-center gap-2 p-3 bg-white border border-[var(--border-main)] rounded-xl text-xs font-bold hover:bg-gray-50 transition-all shadow-sm"
                                                    >
                                                        <Copy size={14} className="text-indigo-500" />
                                                        Copiar Texto
                                                    </button>
                                                </div>

                                                <div className="relative">
                                                    <input 
                                                        type="file" 
                                                        accept="audio/*"
                                                        onChange={(e) => handleManualUpload(chunk, e.target.files[0])}
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    />
                                                    <div className="p-3 border-2 border-dashed border-indigo-500/30 rounded-xl flex items-center justify-center gap-2 text-indigo-500 text-xs font-bold hover:bg-indigo-500/10 transition-all">
                                                        <FileUp size={16} />
                                                        {isProcessing ? "Procesando..." : "Subir Audio Generado"}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer / Controls */}
                <div className="p-6 border-t border-[var(--border-main)] bg-[var(--bg-editor)]/50 flex items-center justify-between">
                    <button 
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            folderHandle ? 'text-emerald-500 bg-emerald-500/10 border border-emerald-500/20' : 'text-amber-500 bg-amber-500/10 border border-amber-500/20 shadow-sm'
                        }`}
                        onClick={handleLinkFolder}
                    >
                        <FolderOpen size={16} />
                        {folderHandle ? "Carpeta Vinculada" : "Vincular Carpeta Local"}
                    </button>

                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mr-2">
                            {Object.values(localFiles).filter(Boolean).length} / {chunks.length} Audios Listos
                        </span>
                    </div>
                </div>

            </div>

            {/* Modal de Confirmación para Regenerar */}
            {showRegenConfirm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[var(--bg-app)] w-full max-w-sm rounded-3xl border border-[var(--border-main)] shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center space-y-3">
                            <div className="p-3 bg-red-500/10 rounded-full text-red-500">
                                <Trash2 size={32} />
                            </div>
                            <h3 className="text-xl font-bold">¿Regenerar fragmentos?</h3>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                                Esta acción borrará el progreso de sincronización actual de este capítulo. ¿Deseas continuar?
                            </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setShowRegenConfirm(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl font-bold border border-[var(--border-main)] hover:bg-[var(--bg-editor)] transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleRegenerateChunks}
                                className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all"
                            >
                                Sí, regenerar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PremiumNarrator;
