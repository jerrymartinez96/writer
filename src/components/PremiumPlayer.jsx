import React, { useState, useEffect, useRef } from 'react';
import { 
    X, 
    Play, 
    Pause, 
    SkipBack, 
    SkipForward, 
    Volume2, 
    RotateCcw,
    Maximize2,
    ListMusic,
    Headphones
} from 'lucide-react';
import { getChapterChunks } from '../services/db';
import { getStoredFolderHandle, verifyPermission, getLocalFileUrl, checkFileExists } from '../services/FileSystemService';
import { useToast } from './Toast';

const PremiumPlayer = ({ isOpen, onClose, chapter, bookId, onChunkChange }) => {
    const toast = useToast();
    const [chunks, setChunks] = useState([]);
    const [playingChunkId, setPlayingChunkId] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioUrl, setAudioUrl] = useState(null);
    const [folderHandle, setFolderHandle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isMini, setIsMini] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef(new Audio());

    useEffect(() => {
        if (isOpen && chapter?.id) {
            initPlayer();
        }
        return () => {
            audioRef.current.pause();
            if (audioUrl) URL.revokeObjectURL(audioUrl);
        };
    }, [isOpen, chapter?.id]);

    useEffect(() => {
        if (onChunkChange) {
            const current = chunks.find(c => c.id === playingChunkId);
            onChunkChange(current || null);
        }
    }, [playingChunkId, chunks]);

    const initPlayer = async () => {
        setLoading(true);
        try {
            const list = await getChapterChunks(bookId, chapter.id);
            const handle = await getStoredFolderHandle();
            setFolderHandle(handle);

            if (!handle) {
                toast.error("No se encontró la carpeta de audios.");
                setLoading(false);
                return;
            }

            // Filtrar SOLO los que tienen archivo físico
            const available = [];
            for (const chunk of list) {
                const exists = await checkFileExists(handle, `${chunk.audioId}.wav`) || 
                               await checkFileExists(handle, `${chunk.audioId}.mp3`);
                if (exists) available.push(chunk);
            }

            const sorted = available.sort((a,b) => a.orden - b.orden);
            setChunks(sorted);

            if (sorted.length > 0) {
                setPlayingChunkId(sorted[0].id);
            } else {
                toast.info("No se encontraron archivos de audio locales para este capítulo.");
                onClose();
            }
        } catch (error) {
            console.error("Error inicializando reproductor:", error);
            toast.error("Error al cargar los fragmentos de audio.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const audio = audioRef.current;
        const handleEnded = () => {
            playNext();
        };
        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
        };
        const handleLoadedMetadata = () => {
            setDuration(audio.duration);
        };

        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);

        return () => {
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
    }, [chunks, playingChunkId]);

    const formatTime = (time) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const loadAndPlay = async (chunkId) => {
        if (!folderHandle) return;
        const chunk = chunks.find(c => c.id === chunkId);
        if (!chunk) return;

        try {
            const hasPermission = await verifyPermission(folderHandle);
            if (!hasPermission) {
                toast.error("Permiso denegado para la carpeta de audio.");
                setIsPlaying(false);
                return;
            }

            let url = await getLocalFileUrl(folderHandle, `${chunk.audioId}.wav`);
            if (!url) url = await getLocalFileUrl(folderHandle, `${chunk.audioId}.mp3`);

            if (!url) {
                toast.error("Archivo de audio no encontrado localmente.");
                setIsPlaying(false);
                // Si falla, intentar saltar al siguiente automáticamente
                playNext();
                return;
            }

            if (audioUrl) URL.revokeObjectURL(audioUrl);
            setAudioUrl(url);
            setPlayingChunkId(chunkId);
            setCurrentTime(0);
            
            audioRef.current.src = url;
            audioRef.current.load();
            const playPromise = audioRef.current.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => setIsPlaying(true))
                           .catch(err => {
                                if (err.name !== 'AbortError') {
                                    console.error("Playback error:", err);
                                    setIsPlaying(false);
                                }
                           });
            }
        } catch (error) {
            console.error("Error al cargar audio:", error);
            setIsPlaying(false);
        }
    };

    const togglePlay = () => {
        if (!playingChunkId) return;
        
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            if (audioRef.current.src) {
                audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
            } else {
                loadAndPlay(playingChunkId);
            }
        }
    };

    const playNext = () => {
        const currentIndex = chunks.findIndex(c => c.id === playingChunkId);
        if (currentIndex !== -1 && currentIndex < chunks.length - 1) {
            loadAndPlay(chunks[currentIndex + 1].id);
        } else {
            setIsPlaying(false);
            if (chunks.length > 0) setPlayingChunkId(chunks[0].id);
        }
    };

    const playPrev = () => {
        const currentIndex = chunks.findIndex(c => c.id === playingChunkId);
        if (currentIndex > 0) {
            loadAndPlay(chunks[currentIndex - 1].id);
        } else if (audioRef.current.currentTime > 2) {
            audioRef.current.currentTime = 0;
        }
    };

    if (!isOpen || loading) return null;

    const currentChunk = chunks.find(c => c.id === playingChunkId);
    const currentIndex = chunks.findIndex(c => c.id === playingChunkId);

    // MODO MINI PLAYER
    if (isMini) {
        return (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] w-full max-w-xl animate-in slide-in-from-bottom-4 duration-300 pointer-events-none p-4">
                <div className="bg-[#1a1c22]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
                    {/* Mini Progress Bar */}
                    <div className="h-0.5 w-full bg-white/5">
                        <div 
                            className="h-full bg-emerald-500 transition-all duration-100" 
                            style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                        ></div>
                    </div>
                    
                    <div className="p-4 flex items-center gap-4">
                        <button 
                            onClick={() => setIsMini(false)}
                            className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shrink-0 hover:scale-105 transition-transform"
                        >
                            <Maximize2 size={18} />
                        </button>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] font-black text-emerald-400 border border-emerald-500/30 px-1.5 rounded uppercase tracking-tighter">AUDIO ON</span>
                                <h4 className="text-white text-xs font-bold truncate">{chapter?.title}</h4>
                            </div>
                            <p className="text-[10px] text-white/40 italic truncate">
                                {currentChunk ? currentChunk.textoActual : "Finalizado"}
                            </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            <button onClick={playPrev} className="text-white/40 hover:text-white transition-colors">
                                <SkipBack size={18} fill="currentColor" />
                            </button>
                            <button 
                                onClick={togglePlay}
                                className="w-10 h-10 bg-white text-[#1a1c22] rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                            >
                                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                            </button>
                            <button onClick={playNext} className="text-white/40 hover:text-white transition-colors">
                                <SkipForward size={18} fill="currentColor" />
                            </button>
                        </div>

                        <button 
                            onClick={onClose}
                            className="p-2 text-white/20 hover:text-white/50 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // MODO FULL PLAYER
    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-[#1a1c22] w-full max-w-2xl rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
                
                {/* Header Estilo Premium */}
                <div className="p-6 flex items-center justify-between border-b border-white/5 bg-white/2">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                            <Headphones size={24} />
                        </div>
                        <div>
                            <h2 className="text-white font-black tracking-tight text-lg">Reproductor Premium</h2>
                            <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest">Narración Nativa Gemini</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setIsMini(true)}
                            className="p-3 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
                            title="Modo Mini"
                        >
                            <div className="w-5 h-3 border-2 border-current rounded-sm flex items-end justify-end p-0.5">
                                <div className="w-2 h-1 bg-current rounded-sm"></div>
                            </div>
                        </button>
                        <button onClick={onClose} className="p-3 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="p-10 flex flex-col items-center">
                    
                    {/* Vinyl/Cover Art Mockup */}
                    <div className="relative w-48 h-48 mb-8 group">
                        <div className={`absolute inset-0 bg-gradient-to-br from-emerald-500 to-indigo-600 rounded-full shadow-2xl transition-all duration-[2000ms] ${isPlaying ? 'rotate-[360deg]' : ''} flex items-center justify-center p-1`}>
                           <div className="w-full h-full bg-[#1a1c22] rounded-full flex items-center justify-center overflow-hidden border-4 border-white/5">
                               <div className="text-white/10 italic font-serif text-sm px-8 text-center line-clamp-3">
                                   {chapter?.title}
                               </div>
                           </div>
                        </div>
                        {/* Center Point */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#1a1c22] rounded-full border-2 border-white/20 z-10"></div>
                    </div>

                    {/* Title & Info */}
                    <div className="text-center mb-10 w-full px-4">
                        <h3 className="text-2xl font-black text-white mb-2 line-clamp-1">{chapter?.title}</h3>
                        <p className="text-white/40 text-sm font-medium italic line-clamp-2 px-8">
                            {currentChunk ? `"${currentChunk.textoActual}"` : "Cargando audio..."}
                        </p>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-8 mb-10">
                        <button 
                            onClick={playPrev}
                            className="p-3 text-white/60 hover:text-white transition-colors"
                        >
                            <SkipBack size={28} fill="currentColor" />
                        </button>
                        
                        <button 
                            onClick={togglePlay}
                            className="w-20 h-20 bg-white text-[#1a1c22] rounded-full flex items-center justify-center shadow-2xl shadow-white/10 hover:scale-105 active:scale-95 transition-all"
                        >
                            {isPlaying ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1" />}
                        </button>

                        <button 
                            onClick={playNext}
                            className="p-3 text-white/60 hover:text-white transition-colors"
                        >
                            <SkipForward size={28} fill="currentColor" />
                        </button>
                    </div>

                    {/* Progress Slider (Real Audio Progress) */}
                    <div className="w-full mb-4">
                        <div className="flex justify-between text-[10px] text-white/30 font-black tracking-widest uppercase mb-2 px-1">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                        <div className="relative w-full h-1.5 bg-white/5 rounded-full overflow-hidden group cursor-pointer">
                            <div 
                                className="absolute top-0 left-0 h-full bg-emerald-500 transition-all duration-100" 
                                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            ></div>
                            <input 
                                type="range" 
                                min="0" 
                                max={duration || 0} 
                                value={currentTime}
                                onChange={(e) => {
                                    const time = parseFloat(e.target.value);
                                    audioRef.current.currentTime = time;
                                    setCurrentTime(time);
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Chunks Navigation Info */}
                    <div className="w-full flex items-center gap-3 text-[10px] text-white/30 font-black tracking-widest uppercase mb-8">
                        <span>CHUNK {currentIndex + 1}</span>
                        <div className="flex-1 h-0.5 bg-white/5 rounded-full overflow-hidden">
                             <div 
                                className="h-full bg-white/20 transition-all duration-300" 
                                style={{ width: `${((currentIndex + 1) / (chunks.length || 1)) * 100}%` }}
                             ></div>
                        </div>
                        <span>TOTAL {chunks.length}</span>
                    </div>

                    {/* Secondary Controls */}
                    <div className="flex items-center gap-6 text-white/20">
                        <button className="hover:text-emerald-400 transition-colors"><RotateCcw size={20} /></button>
                        <button className="hover:text-emerald-400 transition-colors"><Volume2 size={20} /></button>
                        <button className="hover:text-emerald-400 transition-colors"><ListMusic size={20} /></button>
                        <button className="hover:text-emerald-400 transition-colors" onClick={() => setIsMini(true)}><Maximize2 size={20} /></button>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default PremiumPlayer;
