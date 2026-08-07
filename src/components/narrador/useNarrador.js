/**
 * useNarrador — Hook principal del módulo Narrador.
 *
 * - Reproducción limpia: motor Gemini Live / Web Speech, segmentación,
 *   caché con hash, turno único estricto, progreso guardado y narración
 *   continua a siguiente capítulo.
 * - SIN resaltado en el editor: la narración ya no marca párrafos en el
 *   documento. La vista queda intacta.
 * - Modo narrador: cuando se activa, se muestra la transcripción completa
 *   del texto que se está leyendo (el propio texto del segmento).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import GeminiLiveService from '../../services/GeminiLiveService';
import { prepareSegments } from '../../services/NarradorSegmenter';
import { getCachedSegment, saveCachedSegment, getNarradorCacheSize } from '../../services/NarradorCache';

const PROGRESS_PREFIX = 'narrador_progress_';

const buildSystemInstruction = (bookTitle, synopsis, tone) => {
    const toneMap = {
        auto: 'Infiere el tono de la sinopsis de la obra automáticamente.',
        neutro: 'Usa un tono neutro y profesional, como un narrador de audiolibro clásico.',
        dramatico: 'Usa un tono dramático, con énfasis en momentos de tensión y emoción.',
        epico: 'Usa un tono épico y grandioso, ideal para aventuras y fantasía.',
        suspenso: 'Usa un tono de suspenso, generando intriga con pausas y cadencia lenta.',
        calido: 'Usa un tono cálido y cercano, como contando una historia a un amigo.',
        misterioso: 'Usa un tono misterioso y enigmático, susurrando detalles importantes.'
    };

    const toneInstruction = toneMap[tone] || toneMap.auto;

    return `Eres un narrador de audiolibro profesional. Estás narrando "${bookTitle || 'una obra literaria'}".
${synopsis ? `Sinopsis de la obra: "${synopsis}"\n` : ''}
Tono requerido: ${toneInstruction}

Directrices:
- Lee con naturalidad, ritmo pausado y entonación expresiva.
- IMPORTANTE: Usa acento de español LATINOAMERICANO (es-LA), NO español de España. Pronuncia la 'c' y la 'z' como 's' (seseo), y usa vocabulario y entonación latinoamericanos.
- Pronuncia correctamente los nombres propios y términos específicos.
- Realiza pausas dramáticas en puntos, comas y finales de párrafo.
- NO inventes ni modifiques el texto. Lee exactamente lo que se te envía.
- Mantén un estilo consistente durante toda la narración.`;
};

export const useNarrador = ({
    editor,
    isFocusMode,
    activeBook,
    activeChapter,
    nextChapter,
    onSelectChapter,
    profileData,
    toast
}) => {
    const [status, setStatus] = useState('idle'); // idle | connecting | speaking | paused | stopped
    const [segments, setSegments] = useState([]);
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const [motorUsado, setMotorUsado] = useState('none'); // none | gemini | web-speech
    const [speed, setSpeed] = useState(1.0);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [showResumePrompt, setShowResumePrompt] = useState(false);
    const [resumeInfo, setResumeInfo] = useState(null);
    const [isContinuousMode, setIsContinuousMode] = useState(false);
    const [cacheStats, setCacheStats] = useState(null);
    const [isNarratorMode, setIsNarratorMode] = useState(false);
    const [currentTranscript, setCurrentTranscript] = useState('');

    const segmentsRef = useRef([]);
    const currentIndexRef = useRef(0);
    const statusRef = useRef('idle');
    const speedRef = useRef(1.0);
    const activeChapterRef = useRef(activeChapter);
    const activeBookRef = useRef(activeBook);
    const editorRef = useRef(editor);
    const nextChapterRef = useRef(nextChapter);
    const profileRef = useRef(profileData);
    const onSelectChapterRef = useRef(onSelectChapter);
    const isFocusModeRef = useRef(isFocusMode);
    const motorRef = useRef('none');
    const sentSegmentsRef = useRef(new Set());
    const utteranceRef = useRef(null);
    const toastRef = useRef(toast);
    const handleSegmentCompleteRef = useRef(null);
    const cacheAudioCtxRef = useRef(null);
    const cacheSourceRef = useRef(null);

    useEffect(() => { statusRef.current = status; }, [status]);
    useEffect(() => { speedRef.current = speed; }, [speed]);
    useEffect(() => { activeChapterRef.current = activeChapter; }, [activeChapter]);
    useEffect(() => { activeBookRef.current = activeBook; }, [activeBook]);
    useEffect(() => { editorRef.current = editor; }, [editor]);
    useEffect(() => { nextChapterRef.current = nextChapter; }, [nextChapter]);
    useEffect(() => { profileRef.current = profileData; }, [profileData]);
    useEffect(() => { onSelectChapterRef.current = onSelectChapter; }, [onSelectChapter]);
    useEffect(() => { isFocusModeRef.current = isFocusMode; }, [isFocusMode]);
    useEffect(() => { motorRef.current = motorUsado; }, [motorUsado]);
    useEffect(() => { toastRef.current = toast; }, [toast]);

    const saveProgress = useCallback((index) => {
        if (!activeBookRef.current || !activeChapterRef.current) return;
        const key = `${PROGRESS_PREFIX}${activeBookRef.current.id}_${activeChapterRef.current.id}`;
        const segment = segmentsRef.current[index];
        const payload = {
            segmentIndex: index,
            motor: motorRef.current,
            textHash: segment?.hash || null,
            updatedAt: new Date().toISOString()
        };
        try {
            localStorage.setItem(key, JSON.stringify(payload));
        } catch (err) { /* ignore */ }
    }, []);

    const getSavedProgress = useCallback(() => {
        if (!activeBookRef.current || !activeChapterRef.current) return null;
        const key = `${PROGRESS_PREFIX}${activeBookRef.current.id}_${activeChapterRef.current.id}`;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed;
        } catch (err) {
            return null;
        }
    }, []);

    const clearProgress = useCallback(() => {
        if (!activeBookRef.current || !activeChapterRef.current) return;
        const key = `${PROGRESS_PREFIX}${activeBookRef.current.id}_${activeChapterRef.current.id}`;
        try {
            localStorage.removeItem(key);
        } catch (err) { /* ignore */ }
    }, []);

    const setCurrentTranscriptForSegment = useCallback((segmentIndex) => {
        const segment = segmentsRef.current[segmentIndex];
        setCurrentTranscript(segment?.text || '');
    }, []);

    const clearTranscript = useCallback(() => {
        setCurrentTranscript('');
    }, []);

    const buildGeminiContext = useCallback(() => {
        const book = activeBookRef.current || {};
        const cfg = profileRef.current?.aiConfig || {};
        return {
            apiKey: cfg.geminiApiKey || '',
            model: cfg.geminiLiveModel || 'gemini-3.1-flash-live-preview',
            voice: cfg.narradorVoice || 'Puck',
            systemInstruction: buildSystemInstruction(book.title, book.description, cfg.narradorTone || 'auto')
        };
    }, []);

    const prepareChapterSegments = useCallback(() => {
        if (!activeChapterRef.current) return [];
        const content = activeChapterRef.current.content || '';
        const prepared = prepareSegments(content);
        segmentsRef.current = prepared;
        setSegments(prepared);
        return prepared;
    }, []);

    const getWebVoices = useCallback(() => {
        if (!('speechSynthesis' in window)) return [];
        return window.speechSynthesis.getVoices();
    }, []);

    const getSpanishVoice = useCallback(() => {
        const voices = getWebVoices();
        if (voices.length === 0) return null;
        const preferred = voices.find(v => v.lang === 'es-MX') || voices.find(v => v.lang === 'es-ES') || voices.find(v => v.lang?.startsWith('es'));
        return preferred || voices[0];
    }, [getWebVoices]);

    const speakWithWebSpeech = useCallback((text, onEnd) => {
        if (!('speechSynthesis' in window)) {
            if (toastRef.current) toastRef.current.error('Tu navegador no soporta narración por voz.');
            onEnd?.();
            return;
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        const voice = getSpanishVoice();
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || 'es-ES';
        utterance.rate = speedRef.current;
        utterance.pitch = 1;
        utterance.onend = onEnd;
        utterance.onerror = onEnd;
        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    }, [getSpanishVoice]);

    const stopWebSpeech = useCallback(() => {
        try {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        } catch (err) { /* ignore */ }
    }, []);

    const stopAllAudio = useCallback(() => {
        try {
            if (motorRef.current === 'web-speech') {
                stopWebSpeech();
            } else if (motorRef.current === 'gemini') {
                GeminiLiveService.stop();
            }

            if (cacheSourceRef.current) {
                try { cacheSourceRef.current.stop(); } catch { /* ignore */ }
                cacheSourceRef.current = null;
            }
            if (cacheAudioCtxRef.current) {
                try { cacheAudioCtxRef.current.close(); } catch { /* ignore */ }
                cacheAudioCtxRef.current = null;
            }
        } catch (err) { /* ignore */ }
    }, [stopWebSpeech]);

    const playCachedSegment = useCallback(async (segmentIndex) => {
        const segment = segmentsRef.current[segmentIndex];
        if (!segment) return false;

        const bookId = activeBookRef.current?.id;
        const chapterId = activeChapterRef.current?.id;
        if (!bookId || !chapterId) return false;

        const cached = await getCachedSegment(bookId, chapterId, segmentIndex, segment.hash);
        if (!cached?.pcmData) return false;

        try {
            if (cacheAudioCtxRef.current) {
                try { cacheAudioCtxRef.current.close(); } catch { /* ignore */ }
                cacheAudioCtxRef.current = null;
                cacheSourceRef.current = null;
            }

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            cacheAudioCtxRef.current = audioCtx;

            const pcm16 = new Int16Array(cached.pcmData);
            const float32 = new Float32Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768.0;
            const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
            audioBuffer.copyToChannel(float32, 0);
            const source = audioCtx.createBufferSource();
            cacheSourceRef.current = source;
            source.buffer = audioBuffer;
            source.playbackRate.value = speedRef.current;
            source.connect(audioCtx.destination);

            source.onended = () => {
                cacheSourceRef.current = null;
                try { audioCtx.close(); } catch { /* ignore */ }
                cacheAudioCtxRef.current = null;
                if (handleSegmentCompleteRef.current) {
                    handleSegmentCompleteRef.current(segmentIndex);
                }
            };

            setCurrentTranscriptForSegment(segmentIndex);
            source.start();
            return true;
        } catch (err) {
            return false;
        }
    }, [setCurrentTranscriptForSegment]);

    const handleSegmentComplete = useCallback((completedIndex) => {
        if (statusRef.current === 'stopped' || statusRef.current === 'paused') return;

        const next = completedIndex + 1;
        if (next < segmentsRef.current.length) {
            currentIndexRef.current = next;
            setCurrentSegmentIndex(next);
            saveProgress(next);

            playCachedSegment(next).then(async (played) => {
                if (!played && motorRef.current === 'gemini') {
                    try {
                        const segment = segmentsRef.current[next];
                        if (segment) {
                            sentSegmentsRef.current.add(next);
                            GeminiLiveService.sendText(segment.text, next, async (pcmData) => {
                                const bookId = activeBookRef.current?.id;
                                const chapterId = activeChapterRef.current?.id;
                                if (bookId && chapterId) {
                                    try {
                                        await saveCachedSegment(bookId, chapterId, next, segment.hash, pcmData);
                                    } catch (err) { /* ignore */ }
                                }
                            });
                        }
                    } catch (err) {
                        if (err.message?.includes('No conectado')) {
                            try {
                                const ctx = buildGeminiContext();
                                await GeminiLiveService.connect(ctx.apiKey, {
                                    model: ctx.model,
                                    voice: ctx.voice,
                                    systemInstruction: ctx.systemInstruction
                                });
                                const segment = segmentsRef.current[next];
                                if (segment) {
                                    GeminiLiveService.sendText(segment.text, next, async (pcmData) => {
                                        const bookId = activeBookRef.current?.id;
                                        const chapterId = activeChapterRef.current?.id;
                                        if (bookId && chapterId) {
                                            try {
                                                await saveCachedSegment(bookId, chapterId, next, segment.hash, pcmData);
                                            } catch (err2) { /* ignore */ }
                                        }
                                    });
                                }
                            } catch (reconnectErr) {
                                setStatus('stopped');
                                clearTranscript();
                                if (toastRef.current) toastRef.current.error('Error de narración: ' + (reconnectErr.message || 'no se pudo reconectar'));
                            }
                        }
                    }
                }
            });
        } else {
            setStatus('stopped');
            clearTranscript();
            clearProgress();

            const hasNext = !!nextChapterRef.current;
            if (hasNext) {
                const chap = nextChapterRef.current;
                const autoContinue = profileRef.current?.aiConfig?.narradorAutoContinue;
                if (autoContinue && onSelectChapterRef.current) {
                    onSelectChapterRef.current(chap);
                    setTimeout(() => {
                        segmentsRef.current = [];
                        setSegments([]);
                        currentIndexRef.current = 0;
                        setCurrentSegmentIndex(0);
                        setStatus('connecting');
                    }, 300);
                } else {
                    if (toastRef.current) toastRef.current.info(`Capítulo narrado. Siguiente: "${chap?.title || ''}"`);
                }
            } else {
                if (toastRef.current) toastRef.current.success('¡Capítulo narrado completamente! 🎉');
            }
        }
    }, [buildGeminiContext, clearProgress, clearTranscript, playCachedSegment, saveProgress]);

    useEffect(() => {
        handleSegmentCompleteRef.current = handleSegmentComplete;
    }, [handleSegmentComplete]);

    useEffect(() => {
        const handleSegmentStarted = () => {
            if (statusRef.current === 'stopped' || statusRef.current === 'paused') return;
            if (motorRef.current !== 'gemini') return;
            setCurrentTranscriptForSegment(currentIndexRef.current);
        };

        const handleSegmentEnded = () => {
            if (statusRef.current === 'stopped' || statusRef.current === 'paused') return;
            if (motorRef.current !== 'gemini') return;
            handleSegmentComplete(currentIndexRef.current);
        };

        GeminiLiveService.on('segmentStarted', handleSegmentStarted);
        GeminiLiveService.on('segmentEnded', handleSegmentEnded);
        return () => {
            GeminiLiveService.on('segmentStarted', null);
            GeminiLiveService.on('segmentEnded', null);
        };
    }, [handleSegmentComplete, setCurrentTranscriptForSegment]);

    const startNarration = useCallback(async (startIndex = 0, forceMotor = null) => {
        if (!activeChapterRef.current) return;
        if (statusRef.current === 'speaking' || statusRef.current === 'connecting') return;

        const cfg = profileRef.current?.aiConfig || {};
        const useGemini = !!cfg.geminiApiKey;
        const motor = forceMotor || (useGemini ? 'gemini' : 'web-speech');

        setMotorUsado(motor);
        motorRef.current = motor;

        if (segmentsRef.current.length === 0) {
            prepareChapterSegments();
        }

        if (segmentsRef.current.length === 0) {
            if (toastRef.current) toastRef.current.warning('Este capítulo no tiene contenido para narrar.');
            return;
        }

        currentIndexRef.current = startIndex;
        setCurrentSegmentIndex(startIndex);
        sentSegmentsRef.current.clear();
        clearTranscript();

        if (motor === 'web-speech') {
            if (toastRef.current) toastRef.current.info('Usando voz del navegador. Configura tu API key de Gemini en Ajustes → Mi Cuenta para una narración más natural.', 5000);
        }

        setStatus('connecting');

        try {
            if (motor === 'gemini') {
                const played = await playCachedSegment(startIndex);
                if (played) {
                    setStatus('speaking');
                    saveProgress(startIndex);
                    return;
                }

                const ctx = buildGeminiContext();
                await GeminiLiveService.connect(ctx.apiKey, {
                    model: ctx.model,
                    voice: ctx.voice,
                    systemInstruction: ctx.systemInstruction
                });
                GeminiLiveService.setPlaybackRate(speedRef.current);

                const segment = segmentsRef.current[startIndex];
                sentSegmentsRef.current.add(startIndex);
                setCurrentTranscriptForSegment(startIndex);

                GeminiLiveService.sendText(segment.text, startIndex, async (pcmData) => {
                    const bookId = activeBookRef.current?.id;
                    const chapterId = activeChapterRef.current?.id;
                    if (bookId && chapterId) {
                        try {
                            await saveCachedSegment(bookId, chapterId, startIndex, segment.hash, pcmData);
                        } catch (err) { /* ignore */ }
                    }
                });

                setStatus('speaking');
                saveProgress(startIndex);
            } else {
                setStatus('speaking');
                const speakSegment = (idx) => {
                    const segment = segmentsRef.current[idx];
                    if (!segment) {
                        handleSegmentComplete(idx - 1);
                        return;
                    }
                    setCurrentTranscriptForSegment(idx);
                    saveProgress(idx);
                    speakWithWebSpeech(segment.text, () => {
                        if (statusRef.current !== 'paused' && statusRef.current !== 'stopped') {
                            handleSegmentComplete(idx);
                        }
                    });
                };
                speakSegment(startIndex);
            }
        } catch (err) {
            setStatus('stopped');
            clearTranscript();
            if (toastRef.current) toastRef.current.error(err.message || 'No se pudo iniciar la narración.');
        }
    }, [buildGeminiContext, clearTranscript, handleSegmentComplete, playCachedSegment, prepareChapterSegments, saveProgress, setCurrentTranscriptForSegment, speakWithWebSpeech]);

    const pauseNarration = useCallback(() => {
        if (statusRef.current === 'speaking') {
            if (motorRef.current === 'gemini') {
                if (cacheAudioCtxRef.current) {
                    cacheAudioCtxRef.current.suspend().catch(() => {});
                } else {
                    GeminiLiveService.pause();
                }
            } else {
                stopWebSpeech();
            }
            setStatus('paused');
            saveProgress(currentIndexRef.current);
        }
    }, [saveProgress, stopWebSpeech]);

    const resumeNarration = useCallback(() => {
        if (statusRef.current !== 'paused') return;

        if (motorRef.current === 'gemini') {
            if (cacheAudioCtxRef.current) {
                cacheAudioCtxRef.current.resume().catch(() => {});
            } else {
                GeminiLiveService.resume();
            }
            setStatus('speaking');
        } else {
            setStatus('speaking');
            const idx = currentIndexRef.current;
            const segment = segmentsRef.current[idx];
            if (!segment) {
                setStatus('stopped');
                return;
            }
            setCurrentTranscriptForSegment(idx);
            saveProgress(idx);
            speakWithWebSpeech(segment.text, () => {
                if (statusRef.current !== 'paused' && statusRef.current !== 'stopped') {
                    handleSegmentComplete(idx);
                }
            });
        }
    }, [handleSegmentComplete, saveProgress, setCurrentTranscriptForSegment, speakWithWebSpeech]);

    const stopNarration = useCallback(() => {
        stopAllAudio();
        clearTranscript();
        setStatus('stopped');
        saveProgress(currentIndexRef.current);
    }, [clearTranscript, saveProgress, stopAllAudio]);

    const skipToSegment = useCallback((index) => {
        const clamped = Math.max(0, Math.min(segmentsRef.current.length - 1, index));
        stopAllAudio();

        statusRef.current = 'idle';
        setStatus('idle');

        sentSegmentsRef.current.clear();
        startNarration(clamped);
    }, [startNarration, stopAllAudio]);

    const toggleNarratorMode = useCallback(() => {
        setIsNarratorMode(prev => !prev);
    }, []);

    const checkSavedProgress = useCallback(() => {
        if (!activeChapterRef.current) return;
        if (statusRef.current !== 'idle' && statusRef.current !== 'stopped') return;

        const saved = getSavedProgress();
        if (!saved) return;

        const prepared = prepareChapterSegments();
        if (prepared.length === 0) return;

        const savedSegment = prepared[saved.segmentIndex];
        if (!savedSegment || savedSegment.hash !== saved.textHash) {
            clearProgress();
            return;
        }

        if (saved.segmentIndex > 0 && saved.segmentIndex < prepared.length - 1) {
            setResumeInfo({
                segmentIndex: saved.segmentIndex,
                motor: saved.motor || 'none',
                totalSegments: prepared.length
            });
            setShowResumePrompt(true);
        }
    }, [clearProgress, getSavedProgress, prepareChapterSegments]);

    useEffect(() => {
        if (!activeChapterRef.current) return;
        if (!isFocusModeRef.current) return;

        stopAllAudio();
        sentSegmentsRef.current.clear();
        segmentsRef.current = [];
        setSegments([]);
        currentIndexRef.current = 0;
        setCurrentSegmentIndex(0);
        setStatus('idle');
        setShowResumePrompt(false);
        setResumeInfo(null);
        clearTranscript();

        const prepared = prepareChapterSegments();
        if (prepared.length === 0) return;

        checkSavedProgress();
    }, [activeChapter?.id]);

    useEffect(() => {
        if (!isFocusMode && statusRef.current !== 'idle' && statusRef.current !== 'stopped') {
            stopNarration();
            setStatus('idle');
        }
    }, [isFocusMode, stopNarration]);

    const refreshCacheStats = useCallback(async () => {
        try {
            const stats = await getNarradorCacheSize();
            setCacheStats(stats);
        } catch (err) {
            setCacheStats(null);
        }
    }, []);

    useEffect(() => {
        return () => {
            stopAllAudio();
        };
    }, [stopAllAudio]);

    const [webVoicesAvailable, setWebVoicesAvailable] = useState(false);
    useEffect(() => {
        if ('speechSynthesis' in window) {
            const checkVoices = () => {
                setWebVoicesAvailable(window.speechSynthesis.getVoices().length > 0);
            };
            checkVoices();
            window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener('voiceschanged', checkVoices);
            return () => {
                window.speechSynthesis.removeEventListener && window.speechSynthesis.removeEventListener('voiceschanged', checkVoices);
            };
        }
    }, []);

    return {
        status,
        segments,
        currentSegmentIndex,
        totalSegments: segments.length,
        motorUsado,
        speed,
        isPanelOpen,
        showResumePrompt,
        resumeInfo,
        isContinuousMode,
        cacheStats,
        isNarratorMode,
        currentTranscript,

        setSpeed,
        setIsPanelOpen,
        setShowResumePrompt,
        setIsContinuousMode,
        toggleNarratorMode,

        startNarration,
        pauseNarration,
        resumeNarration,
        stopNarration,
        skipToSegment,
        checkSavedProgress,
        refreshCacheStats,
        prepareChapterSegments,
        saveProgress,
        hasGeminiKey: !!profileData?.aiConfig?.geminiApiKey,
        hasWebSpeech: webVoicesAvailable
    };
};

export default useNarrador;