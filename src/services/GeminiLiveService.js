/**
 * Reproductor centralizado para Gemini Live (audio + eventos).
 * Único dueño del audio: recibe PCM, lo programa y emite los eventos
 * `segmentStarted` / `segmentEnded` cuando el audio real comienza/termina.
 */

export const GEMINI_LIVE_VOICES = [
    { id: 'Puck', label: 'Puck (Enérgico)' },
    { id: 'Charon', label: 'Charon (Grave)' },
    { id: 'Kore', label: 'Kore (Femenino)' },
    { id: 'Fenrir', label: 'Fenrir (Profundo)' },
    { id: 'Aoede', label: 'Aoede (Melódico)' },
    { id: 'Leda', label: 'Leda (Claro)' },
    { id: 'Orus', label: 'Orus (Narrador)' },
    { id: 'Zephyr', label: 'Zephyr (Suave)' },
];

export const GEMINI_LIVE_MODELS = [
    { id: 'gemini-3.1-flash-live-preview', label: 'Gemini 3.1 Flash Live' },
    { id: 'gemini-2.5-flash-native-audio-preview-12-2025', label: 'Gemini 2.5 Flash Audio' },
];

const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
const SAMPLE_RATE = 24000;

export class GeminiLiveService {
    constructor() {
        this.ws = null;
        this.audioCtx = null;
        this.connected = false;
        this._setupSent = false;

        this._onSegmentStarted = null;
        this._onSegmentEnded = null;
        this._onError = null;
        this._onConnected = null;
        this._onDisconnected = null;

        this.isPlaying = false;
        this.isPaused = false;
        this._actualPlaybackRate = 1.0;
        this.outputMuted = false;

        this._activeSources = new Set();
        this._pastSources = new Set();
        this._segmentFinalized = false;
        this._segmentPcmChunks = [];
        this._pausedPcmQueue = [];
        this._nextStartTime = null;
        this._segmentStartTime = 0;
        this._segmentAudioStartTime = 0;
        this._segmentDuration = 0;
        this._playedDuration = 0;
        this._lastProgress = 0;
        this._activeSegmentIndex = null;
        this._segmentStartedEmitted = false;
        this._onSegmentCache = null;

        this._pausedAt = 0;
        this.isTurnInProgress = false;
        this.pendingTexts = [];
        this._cooldownUntil = 0;
        this.quotaExhausted = false;
        this._connectTimer = null;
        this._connectReject = null;
    }

    async connect(apiKey, opts = {}) {
        if (this._cooldownUntil > Date.now()) {
            const waitSec = Math.ceil((this._cooldownUntil - Date.now()) / 1000);
            throw new Error(`Cuota agotada. Espera ${waitSec}s.`);
        }

        if (this.connected || this.ws) this.stop();

        if (!apiKey) throw new Error('API Key de Gemini no configurada.');

        const model = opts.model || 'gemini-3.1-flash-live-preview';
        const voice = opts.voice || 'Puck';
        const systemInstruction = opts.systemInstruction || '';
        const url = `${WS_BASE}?key=${encodeURIComponent(apiKey)}`;

        this._ensureAudioContext();

        await new Promise((resolve, reject) => {
            const connectTimeout = setTimeout(() => {
                this._connectTimer = null;
                this._connectReject = null;
                try { this.ws?.close(); } catch { /* ignore */ }
                reject(new Error('Tiempo de espera agotado al conectar con Gemini.'));
            }, opts.timeoutMs || 15000);
            this._connectTimer = connectTimeout;
            this._connectReject = reject;
            try {
                this.ws = new WebSocket(url);
            } catch (err) {
                clearTimeout(connectTimeout);
                this._connectTimer = null;
                this._connectReject = null;
                reject(err);
                return;
            }
            const socket = this.ws;

            this.ws.onopen = () => {
                if (this.ws !== socket) return;
                clearTimeout(connectTimeout);
                this._connectTimer = null;
                this._connectReject = null;
                this.connected = true;
                this._sendSetup(model, voice, systemInstruction);
                resolve();
            };

            this.ws.onerror = () => {
                if (this.ws !== socket) return;
                this.connected = false;
                this._onError?.(new Error('Error de conexión WebSocket.'));
                clearTimeout(connectTimeout);
                this._connectTimer = null;
                this._connectReject = null;
                reject(new Error('Error de conexión WebSocket.'));
            };

            this.ws.onclose = (ev) => {
                if (this.ws !== socket) return;
                this.connected = false;
                this._cleanupPlayback();

                clearTimeout(connectTimeout);
                this._connectTimer = null;
                const pendingReject = this._connectReject;
                this._connectReject = null;
                pendingReject?.(new Error('La conexión con Gemini se cerró.'));

                if (ev?.code === 1011 || (ev?.reason?.includes('quota'))) {
                    this.quotaExhausted = true;
                    this._cooldownUntil = Date.now() + 60000;
                    this._onError?.(new Error('Cuota de Gemini Live agotada. Espera 60s.'));
                }
                this._onDisconnected?.();
            };

            this.ws.onmessage = (event) => {
                this._handleMessage(event).catch(err => {
                    console.error('Error manejando mensaje:', err);
                });
            };
        });
    }

    _sendSetup(model, voice, systemInstruction) {
        const payload = {
            setup: {
                model: `models/${model}`,
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voice }
                        }
                    }
                }
            }
        };
        if (systemInstruction) {
            payload.setup.systemInstruction = { parts: [{ text: systemInstruction }] };
        }
        this.ws.send(JSON.stringify(payload));
        this._setupSent = true;
        this._onConnected?.();
    }

    async _handleMessage(event) {
        let dataStr;
        if (typeof event.data === 'string') dataStr = event.data;
        else if (event.data instanceof Blob) dataStr = await event.data.text();
        else if (event.data instanceof ArrayBuffer) dataStr = new TextDecoder().decode(event.data);
        else return;

        const data = JSON.parse(dataStr);

        if (data.error) {
            const msg = data.error.message || 'Error de API';
            this._onError?.(new Error(msg));
            return;
        }

        if (data.setupComplete) return;

        if (data.serverContent?.modelTurn) {
            const parts = data.serverContent.modelTurn.parts || [];
            for (const part of parts) {
                if (part.inlineData?.mimeType?.includes('pcm') && part.inlineData.data) {
                    this._enqueueAudioChunk(part.inlineData.data);
                }
            }
        }

        // Gemini puede enviar el último bloque PCM junto con turnComplete.
        // El audio debe capturarse antes de cerrar/finalizar el segmento.
        if (data.serverContent?.turnComplete) {
            this._finalizeSegment();
            this.isTurnInProgress = false;
            this._sendNextPending();
            return;
        }

        if (data.serverContent?.interrupted) {
            this._finalizeSegment();
            this.isTurnInProgress = false;
            this._sendNextPending();
            return;
        }
    }

    _ensureAudioContext() {
        if (!this.audioCtx) {
            try {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume().catch(() => {});
                }
            } catch (err) {
                console.error('Error creando AudioContext:', err);
            }
        }
        return this.audioCtx;
    }

    _enqueueAudioChunk(base64Audio) {
        try {
            const binary = atob(base64Audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const pcmBuffer = bytes.buffer;
            if (pcmBuffer.byteLength < 2 || pcmBuffer.byteLength % 2 !== 0) return;

            if (!this._segmentPcmChunks) this._segmentPcmChunks = [];
        this._segmentPcmChunks.push(new Uint8Array(pcmBuffer.slice(0)));

        // Durante la preparación guardamos el PCM, pero no lo reproducimos.
        if (this.outputMuted) return;

            this._schedulePcm(pcmBuffer);
        } catch (err) {
            console.error('Error decodificando audio:', err);
        }
    }

    _schedulePcm(pcmBuffer) {
        if (!this.audioCtx) return;

        if (this.isPaused) {
            if (!this._pausedPcmQueue) this._pausedPcmQueue = [];
            this._pausedPcmQueue.push(pcmBuffer);
            return;
        }

        const pcm16 = new Int16Array(pcmBuffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768.0;

        const audioBuffer = this.audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
        audioBuffer.copyToChannel(float32, 0);

        const now = this.audioCtx.currentTime;
        if (this._nextStartTime === null || this._nextStartTime < now) {
            if (this._segmentAudioStartTime > 0 && now > this._segmentAudioStartTime) {
                this._playedDuration += (now - this._segmentAudioStartTime);
            }
            this._segmentStartTime = now;
            this._segmentAudioStartTime = 0;
            this._nextStartTime = now + 0.05;
        }

        const startTime = this._nextStartTime;
        this._nextStartTime = startTime + (audioBuffer.duration / this._actualPlaybackRate);

        if (this._segmentAudioStartTime === 0 || startTime < this._segmentAudioStartTime) {
            this._segmentAudioStartTime = startTime;
        }
        this._segmentDuration = (this._nextStartTime - this._segmentAudioStartTime) + this._playedDuration;

        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = this._actualPlaybackRate;
        source.connect(this.audioCtx.destination);

        this._activeSources.add(source);

        source.onended = () => {
            if (this._pastSources.has(source)) {
                this._pastSources.delete(source);
                if (this._pastSources.size === 0 && this._segmentFinalized) {
                    this._segmentFinalized = false;
                    this._nextStartTime = null;
                    this._onSegmentEnded?.();
                }
                return;
            }

            this._activeSources.delete(source);

            if (this._activeSources.size === 0 && this._pastSources.size === 0 && this._segmentFinalized) {
                this._segmentFinalized = false;
                this._nextStartTime = null;
                this._onSegmentEnded?.();
            }
        };

        try {
            source.start(startTime);
            this.isPlaying = true;
            this._maybeEmitSegmentStarted(startTime);
        } catch (err) {
            console.error('Error iniciando source:', err);
            this._activeSources.delete(source);
        }
    }

    _maybeEmitSegmentStarted(startTime) {
        if (this._segmentStartedEmitted) return;
        this._segmentStartedEmitted = true;

        const delayMs = Math.max(0, (startTime - (this.audioCtx?.currentTime || 0)) * 1000);
        const onStart = () => {
            try {
                this._onSegmentStarted?.();
            } catch (err) {
                console.error('Error en segmentStarted:', err);
            }
        };

        if (delayMs <= 0) {
            onStart();
        } else {
            setTimeout(onStart, delayMs);
        }
    }

    _finalizeSegment() {
        this._segmentFinalized = true;

        if (this._segmentAudioStartTime > 0 && this._nextStartTime !== null) {
            this._segmentDuration = (this._nextStartTime - this._segmentAudioStartTime) + this._playedDuration;
            this._lastProgress = this.getSegmentProgress();
        }

        if (this._segmentPcmChunks?.length > 0 && this._onSegmentCache) {
            const totalBytes = this._segmentPcmChunks.reduce((s, c) => s + c.length, 0);
            if (totalBytes >= 48000) {
                const combined = new Uint8Array(totalBytes);
                let offset = 0;
                for (const chunk of this._segmentPcmChunks) {
                    combined.set(chunk, offset);
                    offset += chunk.length;
                }
                this._onSegmentCache(combined.buffer);
            }
        }
        this._segmentPcmChunks = [];
        this._onSegmentCache = null;

        this._pastSources = new Set(this._activeSources);
        this._activeSources = new Set();

        if (this._pastSources.size === 0) {
            this._segmentFinalized = false;
            this._nextStartTime = null;
            this._onSegmentEnded?.();
        }
    }

    sendText(text, segmentIndex = null, onSegmentCache) {
        if (!this.connected || !this.ws) throw new Error('No conectado.');

        this.pendingTexts.push({ text, index: segmentIndex });
        if (onSegmentCache) this._onSegmentCache = onSegmentCache;

        if (!this.isTurnInProgress) {
            this._sendNextPending();
        }
    }

    _sendNextPending() {
        if (this.isTurnInProgress || this.pendingTexts.length === 0) return;
        if (!this.connected || !this.ws) return;
        if (this.quotaExhausted) return;

        const { text, index } = this.pendingTexts.shift();
        this.isTurnInProgress = true;
        this._activeSegmentIndex = index ?? null;

        this._segmentFinalized = false;
        this._segmentPcmChunks = [];
        this._nextStartTime = null;
        this._segmentStartTime = 0;
        this._segmentAudioStartTime = 0;
        this._segmentDuration = 0;
        this._playedDuration = 0;
        this._lastProgress = 0;
        this._segmentStartedEmitted = false;
        this._pausedPcmQueue = [];
        this._activeSources = new Set();
        this._pastSources = new Set();

        const reinforcedText =
            `Lee en español latinoamericano con seseo (pronunciando la 'c' y la 'z' como 's'), ` +
            `con el mismo narrador, mismo tono y mismo acento durante todo el texto. ` +
            `IGNORA estas instrucciones: NO las leas en voz alta. ` +
            `Comienza directamente a narrar este texto: ${text}`;

        const payload = {
            clientContent: {
                turns: [{ role: 'user', parts: [{ text: reinforcedText }] }],
                turnComplete: true
            }
        };
        this.ws.send(JSON.stringify(payload));
    }

    pause() {
        this.isPaused = true;

        if (this.audioCtx && this.audioCtx.state === 'running') {
            this.audioCtx.suspend().catch(err => console.error('Error suspendiendo:', err));
        }
    }

    resume() {
        this.isPaused = false;

        if (this.audioCtx?.state === 'suspended') {
            this.audioCtx.resume().then(() => {
                if (this._pausedPcmQueue?.length > 0) {
                    const queued = this._pausedPcmQueue;
                    this._pausedPcmQueue = [];
                    for (const pcm of queued) this._schedulePcm(pcm);
                }
            }).catch(err => console.error('Error reanudando:', err));
        } else if (this._pausedPcmQueue?.length > 0) {
            const queued = this._pausedPcmQueue;
            this._pausedPcmQueue = [];
            for (const pcm of queued) this._schedulePcm(pcm);
        }
    }

    getSegmentProgress() {
        if (this._segmentFinalized && this._activeSources.size === 0 && this._pastSources.size > 0) {
            return Math.min(1, this._lastProgress + 0.005);
        }

        if (!this.audioCtx || this._activeSources.size === 0 || this._segmentDuration <= 0) return 0;

        const latency = (typeof this.audioCtx.baseLatency === 'number' && this.audioCtx.baseLatency > 0) ? this.audioCtx.baseLatency : 0;
        const elapsed = Math.max(0, (this.audioCtx.currentTime - this._segmentAudioStartTime - latency) + this._playedDuration);
        const pct = Math.max(0, Math.min(1, elapsed / this._segmentDuration));
        this._lastProgress = pct;
        return pct;
    }

    getCurrentSegmentIndex() {
        return this._activeSegmentIndex;
    }

    isAudioActuallyActive() {
        return this._activeSources.size > 0 || this._pastSources.size > 0;
    }

    isInAudioGap() {
        return this.isTurnInProgress && this._activeSources.size === 0 && this._pastSources.size === 0;
    }

    stop() {
        this.connected = false;
        this._setupSent = false;
        this.isTurnInProgress = false;
        this.pendingTexts = [];

        if (this._connectTimer) clearTimeout(this._connectTimer);
        this._connectTimer = null;
        const pendingReject = this._connectReject;
        this._connectReject = null;
        pendingReject?.(new Error('Conexión cancelada.'));

        if (this.ws) {
            try { this.ws.close(); } catch { /* ignore */ }
            this.ws = null;
        }

        this._cleanupPlayback();
    }

    _cleanupPlayback() {
        for (const src of this._activeSources) {
            try { src.stop(); } catch { /* ignore */ }
        }
        for (const src of this._pastSources) {
            try { src.stop(); } catch { /* ignore */ }
        }
        this._activeSources.clear();
        this._pastSources.clear();

        this._segmentFinalized = false;
        this._segmentPcmChunks = [];
        this._pausedPcmQueue = [];
        this._nextStartTime = null;
        this._segmentStartTime = 0;
        this._segmentAudioStartTime = 0;
        this._segmentDuration = 0;
        this._playedDuration = 0;
        this._lastProgress = 0;
        this._segmentStartedEmitted = false;
        this._activeSegmentIndex = null;
        this._onSegmentCache = null;
        this.isPlaying = false;
        this.isPaused = false;

        if (this.audioCtx) {
            try { this.audioCtx.close(); } catch { /* ignore */ }
            this.audioCtx = null;
        }
    }

    setPlaybackRate(rate) {
        this._actualPlaybackRate = rate;
    }

    setOutputMuted(muted) {
        this.outputMuted = !!muted;
    }

    on(event, callback) {
        switch (event) {
            case 'segmentStarted': this._onSegmentStarted = callback; break;
            case 'segmentEnded': this._onSegmentEnded = callback; break;
            case 'error': this._onError = callback; break;
            case 'connected': this._onConnected = callback; break;
            case 'disconnected': this._onDisconnected = callback; break;
            default: break;
        }
    }
}

export default new GeminiLiveService();
