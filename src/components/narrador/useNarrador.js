/**
 * useNarrador — Hook principal del módulo Narrador.
 *
 * Arquitectura basada en eventos del audio (sin estimación de progreso):
 * - GeminiLiveService emite `segmentStarted` cuando el audio real de un
 *   segmento comienza a sonar, y `segmentEnded` cuando termina.
 * - El resaltado del editor es un efecto secundario de esos eventos:
 *     segmentStarted → resaltar el párrafo actual del segmento
 *     segmentEnded   → avanzar al siguiente
 * - Un loop de sincronización (rAF/interval) distribuye el progreso del audio
 *   párrafo a párrafo dentro del segmento, resaltando UNO solo a la vez.
 * - Al pausar se deja el párrafo en curso titilando.
 * - El párrafo activo siempre se mantiene enfocado (scroll automático).
 *
 * Orquesta además: motor dual Gemini Live / Web Speech, segmentación,
 * caché con hash, turno único estricto, progreso guardado y narración
 * continua a siguiente capítulo.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import GeminiLiveService from '../../services/GeminiLiveService';
import { prepareSegments, normalizeForMatching, firstWords, countWords } from '../../services/NarradorSegmenter';
import { getCachedSegment, saveCachedSegment, getNarradorCacheSize } from '../../services/NarradorCache';

const PROGRESS_PREFIX = 'narrador_progress_';
const TTS_TRACKING_INTERVAL_MS = 120;

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
    const renderParagraphHighlightsRef = useRef(null);
    const startRealTimeTrackingRef = useRef(null);
    const stopRealTimeTrackingRef = useRef(null);
    const clearActiveParaTrackingRef = useRef(null);
    const cacheAudioCtxRef = useRef(null);
    const cacheSourceRef = useRef(null);

    // Seguimiento de resaltado párrafo a párrafo
    const progressLoopRef = useRef(null);
    const activeParaIndexRef = useRef(null);
    const segmentParaInfoRef = useRef(null);

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

    const getParagraphElements = useCallback(() => {
        const editorEl = editorRef.current?.view?.dom;
        if (!editorEl) return [];
        const container = editorEl.closest('.editor-focus-mode') || editorEl.parentElement?.parentElement;
        if (!container) return [];
        return Array.from(container.querySelectorAll('.prose p, .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6, .prose li'));
    }, []);

    const clearActiveParaTracking = useCallback(() => {
        activeParaIndexRef.current = null;
        segmentParaInfoRef.current = null;
    }, []);

    const stopRealTimeTracking = useCallback(() => {
        if (progressLoopRef.current) {
            clearInterval(progressLoopRef.current);
            progressLoopRef.current = null;
        }
    }, []);

    const estimateSpeechDurationMs = useCallback((text) => {
        const wpm = 156 * (speedRef.current || 1);
        return (countWords(text) / (wpm / 60)) * 1000;
    }, []);

    const ensureParagraphVisible = useCallback((el) => {
        if (!el) return;
        try {
            const rect = el.getBoundingClientRect();
            const vh = window.innerHeight || document.documentElement.clientHeight;
            if (rect.top < 60 || rect.bottom > vh - 60) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } catch (err) { /* ignore */ }
    }, []);

    /**
     * Calcula qué párrafo dentro del segmento corresponde a un progreso [0,1].
     * Los `starts` son los offsets en palabras de cada párrafo del segmento.
     */
    const getActiveParagraphForProgress = useCallback((progress, info) => {
        if (!info || !info.starts?.length) return null;
        const clamped = Math.max(0, Math.min(0.999, progress || 0));
        const wordPos = Math.floor(clamped * info.totalWords);
        let idx = 0;
        for (let i = 0; i < info.starts.length; i++) {
            if (wordPos >= info.starts[i]) idx = i;
            else break;
        }
        return idx;
    }, []);

    /**
     * Construye la información de mapeo entre un segmento y los párrafos reales
     * del editor (DOM). Busca el párrafo de inicio por coincidencia de texto
     * normalizado (sin mezclar unidades), con un fallback proporcional seguro.
     */
    const buildSegmentParaInfo = useCallback((segmentIndex, paraEls) => {
        const segment = segmentsRef.current[segmentIndex];
        if (!segment) return null;

        const paraTexts = segment.paragraphTexts?.length ? segment.paragraphTexts : [segment.text];
        let acc = 0;
        const starts = paraTexts.map(t => {
            const s = acc;
            acc += countWords(t);
            return s;
        });
        const totalWords = Math.max(1, acc);

        let startParaIdx = -1;
        const needle = firstWords(normalizeForMatching(paraTexts[0] || ''), 15);
        if (needle) {
            for (let i = 0; i < paraEls.length; i++) {
                const pText = normalizeForMatching(paraEls[i].innerText || paraEls[i].textContent || '');
                if (pText.includes(needle)) {
                    startParaIdx = i;
                    break;
                }
            }
        }
        if (startParaIdx === -1) {
            const totalSegments = segmentsRef.current.length || 1;
            startParaIdx = Math.min(
                paraEls.length - 1,
                Math.floor(((segment.paragraphOffset?.start ?? segmentIndex) / totalSegments) * paraEls.length)
            );
        }
        startParaIdx = Math.max(0, startParaIdx);

        return {
            segmentIndex,
            paraEls,
            startParaIdx,
            starts,
            totalWords,
            paraTexts,
            startTime: null,
            expectedSec: null,
            startedAt: null,
            expectedMs: null
        };
    }, []);

    /**
     * Resalta SOLO el párrafo activo del segmento actual y atenúa el resto.
     * `forcedParaIdx` permite fijar un párrafo específico (usado por el loop).
     */
    const renderParagraphHighlights = useCallback((segmentIndex, forcedParaIdx = null) => {
        try {
            const paraEls = getParagraphElements();
            if (paraEls.length === 0) return;

            const cached = segmentParaInfoRef.current;
            const useCached = cached?.segmentIndex === segmentIndex && cached?.paraEls.length === paraEls.length;
            const info = useCached ? cached : buildSegmentParaInfo(segmentIndex, paraEls);
            if (!info) return;
            segmentParaInfoRef.current = info;

            let activeIdx = info.startParaIdx;
            if (typeof forcedParaIdx === 'number') {
                activeIdx = forcedParaIdx;
            } else if (motorRef.current === 'gemini') {
                let progress = 0;
                if (cacheAudioCtxRef.current && info.startTime != null && info.expectedSec) {
                    progress = Math.min(0.999, Math.max(0, (cacheAudioCtxRef.current.currentTime - info.startTime) / info.expectedSec));
                } else {
                    progress = GeminiLiveService.getSegmentProgress?.() || 0;
                }
                if (progress > 0) {
                    const pIdx = getActiveParagraphForProgress(progress, info);
                    if (pIdx !== null) activeIdx = pIdx;
                }
            }
            activeIdx = Math.max(info.startParaIdx, Math.min(info.startParaIdx + info.paraTexts.length - 1, activeIdx));
            activeParaIndexRef.current = activeIdx;

            const startActive = info.startParaIdx;
            const endActive = Math.min(info.startParaIdx + info.paraTexts.length - 1, paraEls.length - 1);

            paraEls.forEach((p, i) => {
                p.classList.remove('tts-paused', 'tts-generating');
                const inRange = i >= startActive && i <= endActive;
                p.classList.toggle('tts-dimmed', !inRange);
                p.classList.toggle('tts-reading-highlight', i === activeIdx);
            });

            ensureParagraphVisible(paraEls[activeIdx]);
        } catch (err) { /* ignore */ }
    }, [buildSegmentParaInfo, ensureParagraphVisible, getActiveParagraphForProgress, getParagraphElements]);

    useEffect(() => {
        renderParagraphHighlightsRef.current = renderParagraphHighlights;
    }, [renderParagraphHighlights]);

    /**
     * Sincroniza el párrafo activo con el progreso real del audio.
     * Se ejecuta en un intervalo corto mientras se narra.
     */
    const syncHighlightWithProgress = useCallback(() => {
        if (statusRef.current !== 'speaking') return;

        const info = segmentParaInfoRef.current;
        if (!info) {
            renderParagraphHighlights(currentIndexRef.current);
            return;
        }

        let progress = 0;
        if (motorRef.current === 'gemini') {
            if (cacheAudioCtxRef.current && info.startTime != null && info.expectedSec) {
                progress = Math.min(0.999, Math.max(0, (cacheAudioCtxRef.current.currentTime - info.startTime) / info.expectedSec));
            } else {
                progress = GeminiLiveService.getSegmentProgress?.() || 0;
            }
        } else if (info.startedAt && info.expectedMs) {
            progress = Math.min(0.999, Math.max(0, (Date.now() - info.startedAt) / info.expectedMs));
        }

        const pIdx = getActiveParagraphForProgress(progress, info);
        if (pIdx !== null && pIdx !== activeParaIndexRef.current) {
            activeParaIndexRef.current = pIdx;
            renderParagraphHighlights(currentIndexRef.current, pIdx);
        } else {
            ensureParagraphVisible(info.paraEls[activeParaIndexRef.current ?? info.startParaIdx]);
        }
    }, [ensureParagraphVisible, getActiveParagraphForProgress, renderParagraphHighlights]);

    const startRealTimeTracking = useCallback(() => {
        stopRealTimeTracking();
        progressLoopRef.current = setInterval(syncHighlightWithProgress, TTS_TRACKING_INTERVAL_MS);
    }, [stopRealTimeTracking, syncHighlightWithProgress]);

    useEffect(() => {
        startRealTimeTrackingRef.current = startRealTimeTracking;
    }, [startRealTimeTracking]);

    useEffect(() => {
        stopRealTimeTrackingRef.current = stopRealTimeTracking;
    }, [stopRealTimeTracking]);

    useEffect(() => {
        clearActiveParaTrackingRef.current = clearActiveParaTracking;
    }, [clearActiveParaTracking]);

    const applyHighlight = useCallback((segmentIndex) => {
        renderParagraphHighlights(segmentIndex);
    }, [renderParagraphHighlights]);

    const clearHighlight = useCallback(() => {
        stopRealTimeTracking();
        clearActiveParaTracking();
        try {
            const editorEl = editorRef.current?.view?.dom;
            const container = editorEl?.closest('.editor-focus-mode');
            if (!container) return;
            const paragraphs = container.querySelectorAll('.prose p, .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6, .prose li');
            paragraphs.forEach(p => {
                p.classList.remove('tts-reading-highlight');
                p.classList.remove('tts-dimmed');
                p.classList.remove('tts-generating');
                p.classList.remove('tts-paused');
            });
        } catch (err) { /* ignore */ }
    }, [clearActiveParaTracking, stopRealTimeTracking]);

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
                stopRealTimeTrackingRef.current?.();
                clearActiveParaTrackingRef.current?.();
                clearHighlight();
                if (handleSegmentCompleteRef.current) {
                    handleSegmentCompleteRef.current(segmentIndex);
                }
            };

            renderParagraphHighlightsRef.current?.(segmentIndex);
            const info = segmentParaInfoRef.current;
            if (info) {
                info.startTime = audioCtx.currentTime;
                info.expectedSec = audioBuffer.duration / (speedRef.current || 1);
            }
            source.start();
            startRealTimeTrackingRef.current?.();
            return true;
        } catch (err) {
            return false;
        }
    }, [clearHighlight]);

    const handleSegmentComplete = useCallback((completedIndex) => {
        if (statusRef.current === 'stopped' || statusRef.current === 'paused') return;

        stopRealTimeTrackingRef.current?.();
        clearActiveParaTrackingRef.current?.();

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
                                clearHighlight();
                                if (toastRef.current) toastRef.current.error('Error de narración: ' + (reconnectErr.message || 'no se pudo reconectar'));
                            }
                        }
                    }
                }
            });
        } else {
            setStatus('stopped');
            clearHighlight();
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
    }, [buildGeminiContext, clearHighlight, clearProgress, playCachedSegment, saveProgress]);

    useEffect(() => {
        handleSegmentCompleteRef.current = handleSegmentComplete;
    }, [handleSegmentComplete]);

    useEffect(() => {
        const handleSegmentStarted = () => {
            if (statusRef.current === 'stopped' || statusRef.current === 'paused') return;
            if (motorRef.current !== 'gemini') return;
            clearActiveParaTrackingRef.current?.();
            renderParagraphHighlightsRef.current?.(currentIndexRef.current);
            const info = segmentParaInfoRef.current;
            if (info) {
                info.startTime = null;
                info.expectedSec = null;
            }
            startRealTimeTrackingRef.current?.();
        };

        const handleSegmentEnded = () => {
            if (statusRef.current === 'stopped' || statusRef.current === 'paused') return;
            if (motorRef.current !== 'gemini') return;
            stopRealTimeTrackingRef.current?.();
            clearActiveParaTrackingRef.current?.();
            handleSegmentComplete(currentIndexRef.current);
        };

        GeminiLiveService.on('segmentStarted', handleSegmentStarted);
        GeminiLiveService.on('segmentEnded', handleSegmentEnded);
        return () => {
            GeminiLiveService.on('segmentStarted', null);
            GeminiLiveService.on('segmentEnded', null);
        };
    }, [handleSegmentComplete]);

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
        stopRealTimeTracking();
        clearActiveParaTracking();

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
                applyHighlight(startIndex);

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
                    clearActiveParaTracking();
                    applyHighlight(idx);
                    const info = segmentParaInfoRef.current;
                    if (info) {
                        info.startedAt = Date.now();
                        info.expectedMs = estimateSpeechDurationMs(segment.text);
                    }
                    startRealTimeTracking();
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
            clearHighlight();
            if (toastRef.current) toastRef.current.error(err.message || 'No se pudo iniciar la narración.');
        }
    }, [applyHighlight, buildGeminiContext, clearActiveParaTracking, clearHighlight, estimateSpeechDurationMs, handleSegmentComplete, playCachedSegment, prepareChapterSegments, saveProgress, speakWithWebSpeech, startRealTimeTracking, stopRealTimeTracking]);

    const pauseNarration = useCallback(() => {
        if (statusRef.current === 'speaking') {
            stopRealTimeTracking();
            if (motorRef.current === 'gemini') {
                if (cacheAudioCtxRef.current) {
                    cacheAudioCtxRef.current.suspend().catch(() => {});
                } else {
                    GeminiLiveService.pause();
                }
            } else {
                stopWebSpeech();
            }

            // Dejar titilando el párrafo que se estaba leyendo
            try {
                const info = segmentParaInfoRef.current;
                const paraEls = info?.paraEls || getParagraphElements();
                const activeIdx = activeParaIndexRef.current ?? info?.startParaIdx ?? 0;
                paraEls.forEach(p => {
                    p.classList.remove('tts-reading-highlight', 'tts-dimmed', 'tts-paused');
                });
                if (paraEls[activeIdx]) paraEls[activeIdx].classList.add('tts-paused');
            } catch (err) { /* ignore */ }

            setStatus('paused');
            saveProgress(currentIndexRef.current);
        }
    }, [getParagraphElements, saveProgress, stopRealTimeTracking, stopWebSpeech]);

    const resumeNarration = useCallback(() => {
        if (statusRef.current !== 'paused') return;

        if (motorRef.current === 'gemini') {
            if (cacheAudioCtxRef.current) {
                cacheAudioCtxRef.current.resume().catch(() => {});
            } else {
                GeminiLiveService.resume();
            }
            applyHighlight(currentIndexRef.current);
            startRealTimeTracking();
            setStatus('speaking');
        } else {
            setStatus('speaking');
            const idx = currentIndexRef.current;
            const speakSegment = (segmentIdx) => {
                const segment = segmentsRef.current[segmentIdx];
                if (!segment) {
                    setStatus('stopped');
                    return;
                }
                clearActiveParaTracking();
                applyHighlight(segmentIdx);
                const info = segmentParaInfoRef.current;
                if (info) {
                    info.startedAt = Date.now();
                    info.expectedMs = estimateSpeechDurationMs(segment.text);
                }
                startRealTimeTracking();
                saveProgress(segmentIdx);
                speakWithWebSpeech(segment.text, () => {
                    if (statusRef.current !== 'paused' && statusRef.current !== 'stopped') {
                        handleSegmentComplete(segmentIdx);
                    }
                });
            };
            speakSegment(idx);
        }
    }, [applyHighlight, clearActiveParaTracking, estimateSpeechDurationMs, handleSegmentComplete, saveProgress, speakWithWebSpeech, startRealTimeTracking]);

    const stopNarration = useCallback(() => {
        stopAllAudio();
        clearHighlight();
        setStatus('stopped');
        saveProgress(currentIndexRef.current);
    }, [clearHighlight, saveProgress, stopAllAudio]);

    const skipToSegment = useCallback((index) => {
        const clamped = Math.max(0, Math.min(segmentsRef.current.length - 1, index));
        stopAllAudio();

        statusRef.current = 'idle';
        setStatus('idle');

        sentSegmentsRef.current.clear();
        startNarration(clamped);
    }, [startNarration, stopAllAudio]);

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
        stopRealTimeTracking();
        clearActiveParaTracking();
        sentSegmentsRef.current.clear();
        segmentsRef.current = [];
        setSegments([]);
        currentIndexRef.current = 0;
        setCurrentSegmentIndex(0);
        setStatus('idle');
        setShowResumePrompt(false);
        setResumeInfo(null);
        clearHighlight();

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
            stopRealTimeTracking();
            stopAllAudio();
        };
    }, [stopAllAudio, stopRealTimeTracking]);

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

        setSpeed,
        setIsPanelOpen,
        setShowResumePrompt,
        setIsContinuousMode,

        startNarration,
        pauseNarration,
        resumeNarration,
        stopNarration,
        skipToSegment,
        checkSavedProgress,
        refreshCacheStats,
        prepareChapterSegments,
        applyHighlight,
        clearHighlight,
        saveProgress,
        hasGeminiKey: !!profileData?.aiConfig?.geminiApiKey,
        hasWebSpeech: webVoicesAvailable
    };
};

export default useNarrador;