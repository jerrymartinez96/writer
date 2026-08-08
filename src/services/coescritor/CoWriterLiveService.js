/**
 * CoWriterLiveService — Servicio propio de Gemini Live para el módulo Coescritor.
 * Proporciona la VOZ DE SALIDA (TTS) para narrar resultados.
 *
 * FIX A+B+C+D (audio que se corta o no suena):
 * A. connect() es idempotente: reutiliza el WebSocket activo en vez de matarlo.
 * B. Se espera audioCtx.resume() y se verifica state === 'running' antes de sonar.
 * C. _cleanupPlayback no cierra el audioCtx (se reutiliza); solo detiene fuentes.
 * D. Seguimiento robusto del final con contador de fuentes pendientes.
 */
const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
const SAMPLE_RATE = 24000;

class CoWriterLiveService {
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
        this._onSpeechEnd = null;

        this.isPlaying = false;
        this.isPaused = false;

        // FIX D: contador de fuentes de audio pendientes de terminar
        this._pendingSources = 0;
        this._activeSources = new Set();
        this._segmentFinalized = false;
        this._pausedPcmQueue = [];
        this._nextStartTime = null;
        this._segmentStartedEmitted = false;
        this._speechEndEmitted = false;

        this.isTurnInProgress = false;
        this.pendingTexts = [];
        this._cooldownUntil = 0;
        this.quotaExhausted = false;
    }

    /**
     * FIX A: conecta solo si no hay WebSocket activo. Si ya hay conexión, la reutiliza.
     */
    async connect(apiKey, opts = {}) {
        if (this._cooldownUntil > Date.now()) {
            const waitSec = Math.ceil((this._cooldownUntil - Date.now()) / 1000);
            throw new Error(`Cuota agotada. Espera ${waitSec}s.`);
        }
        if (this.ws && (this.ws.readyState === 1 || this.connected)) {
            return; // ya conectado: no matar audio en curso
        }

        if (!apiKey) throw new Error('API Key de Gemini no configurada para el Coescritor.');

        const model = opts.model || 'gemini-3.1-flash-live-preview';
        const voice = opts.voice || 'Puck';
        const systemInstruction = opts.systemInstruction || '';
        const url = `${WS_BASE}?key=${encodeURIComponent(apiKey)}`;

        await this._ensureAudioContext();

        await new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url);
            } catch (err) { reject(err); return; }

            this.ws.onopen = () => {
                this.connected = true;
                this._sendSetup(model, voice, systemInstruction);
                resolve();
            };

            this.ws.onerror = () => {
                this.connected = false;
                this._onError?.(new Error('Error de conexión WebSocket (Coescritor).'));
                reject(new Error('Error de conexión WebSocket (Coescritor).'));
            };

            this.ws.onclose = (ev) => {
                this.connected = false;
                this.ws = null;
                this._clearPending();

                if (ev?.code === 1011 || (ev?.reason?.includes('quota'))) {
                    this.quotaExhausted = true;
                    this._cooldownUntil = Date.now() + 60000;
                    this._onError?.(new Error('Cuota de Gemini Live agotada. Espera 60s.'));
                }
                this._onDisconnected?.();
            };

            this.ws.onmessage = (event) => {
                this._handleMessage(event).catch(err => {
                    console.error('CoWriterLive: error manejando mensaje:', err);
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
            this._onError?.(new Error(data.error.message || 'Error de API'));
            return;
        }

        if (data.setupComplete) return;

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

        if (data.serverContent?.modelTurn) {
            const parts = data.serverContent.modelTurn.parts || [];
            for (const part of parts) {
                if (part.inlineData?.mimeType?.includes('pcm') && part.inlineData.data) {
                    this._enqueueAudioChunk(part.inlineData.data);
                }
            }
        }
    }

    /**
     * FIX B: crea el AudioContext y ASUEGURA que esté en 'running' antes de sonar.
     */
    async _ensureAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
        }
        if (this.audioCtx.state !== 'running') {
            try {
                await this.audioCtx.resume();
            } catch (err) {
                console.warn('CoWriterLive: resume() falló:', err);
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
            this._schedulePcm(pcmBuffer);
        } catch (err) {
            console.error('CoWriterLive: error decodificando audio:', err);
        }
    }

    async _schedulePcm(pcmBuffer) {
        if (!this.audioCtx) return;

        if (this.isPaused) {
            if (!this._pausedPcmQueue) this._pausedPcmQueue = [];
            this._pausedPcmQueue.push(pcmBuffer);
            return;
        }

        // FIX B: si el contexto está suspendido, intentar reanudarlo primero
        if (this.audioCtx.state !== 'running') {
            try {
                await this.audioCtx.resume();
            } catch (err) { /* ignore */ }
            if (this.audioCtx.state !== 'running') return; // no reproducir si no está corriendo
        }

        const pcm16 = new Int16Array(pcmBuffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768.0;

        const audioBuffer = this.audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
        audioBuffer.copyToChannel(float32, 0);

        const now = this.audioCtx.currentTime;
        if (this._nextStartTime === null || this._nextStartTime < now) {
            this._nextStartTime = now + 0.05;
        }

        const startTime = this._nextStartTime;
        this._nextStartTime = startTime + audioBuffer.duration;

        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioCtx.destination);

        // FIX D: contador de fuentes pendientes
        this._pendingSources++;
        this._activeSources.add(source);

        source.onended = () => {
            if (this._activeSources.has(source)) {
                this._activeSources.delete(source);
            }
            this._pendingSources = Math.max(0, this._pendingSources - 1);

            // Cuando terminan todas las fuentes y el segmento está finalizado, emitir fin
            if (this._pendingSources === 0 && this._segmentFinalized) {
                this._finishSpeech();
            }
        };

        try {
            source.start(startTime);
            this.isPlaying = true;
            this._maybeEmitSegmentStarted(startTime);
        } catch (err) {
            this._activeSources.delete(source);
            this._pendingSources = Math.max(0, this._pendingSources - 1);
        }
    }

    _maybeEmitSegmentStarted(startTime) {
        if (this._segmentStartedEmitted) return;
        this._segmentStartedEmitted = true;

        const delayMs = Math.max(0, (startTime - (this.audioCtx?.currentTime || 0)) * 1000);
        const onStart = () => {
            try { this._onSegmentStarted?.(); } catch (err) { /* ignore */ }
        };

        if (delayMs <= 0) onStart();
        else setTimeout(onStart, delayMs);
    }

    _finalizeSegment() {
        this._segmentFinalized = true;

        // FIX D: si no quedan fuentes pendientes, emitir fin directamente
        if (this._pendingSources === 0) {
            this._finishSpeech();
        }
    }

    _finishSpeech() {
        this._segmentFinalized = false;
        this._nextStartTime = null;
        this.isPlaying = false;
        this._speechEndEmitted = false;
        this._onSegmentEnded?.();
        this._onSpeechEnd?.();
    }

    /**
     * Encola un texto para narración TTS en voz alta.
     */
    sendText(text, onSpeechEnd) {
        if (!this.connected || !this.ws) throw new Error('Coescritor no conectado.');

        if (onSpeechEnd) this._onSpeechEnd = onSpeechEnd;

        this.pendingTexts.push({ text });

        if (!this.isTurnInProgress) {
            this._sendNextPending();
        }
    }

    async _sendNextPending() {
        if (this.isTurnInProgress || this.pendingTexts.length === 0) return;
        if (!this.connected || !this.ws) return;
        if (this.quotaExhausted) return;

        // FIX B: asegurar audioCtx running antes de enviar el siguiente turno
        await this._ensureAudioContext();

        const { text } = this.pendingTexts.shift();
        this.isTurnInProgress = true;

        this._segmentFinalized = false;
        this._pendingSources = 0;
        this._activeSources = new Set();
        this._nextStartTime = null;
        this._segmentStartedEmitted = false;
        this._speechEndEmitted = false;
        this._pausedPcmQueue = [];

        const reinforcedText =
            `Lee en español latinoamericano con seseo (pronunciando la 'c' y la 'z' como 's'), ` +
            `con un tono conversacional natural, claro y breve. ` +
            `IGNORA estas instrucciones: NO las leas en voz alta. ` +
            `Comienza directamente a hablar este texto: ${text}`;

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
            this.audioCtx.suspend().catch(() => {});
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
            }).catch(() => {});
        } else if (this._pausedPcmQueue?.length > 0) {
            const queued = this._pausedPcmQueue;
            this._pausedPcmQueue = [];
            for (const pcm of queued) this._schedulePcm(pcm);
        }
    }

    isAudioActuallyActive() {
        return this._pendingSources > 0;
    }

    isInAudioGap() {
        return this.isTurnInProgress && this._pendingSources === 0;
    }

    stop() {
        this.connected = false;
        this._setupSent = false;
        this.isTurnInProgress = false;
        this.pendingTexts = [];

        if (this.ws) {
            try { this.ws.close(); } catch { /* ignore */ }
            this.ws = null;
        }

        this._clearPending();
        // FIX C: NO cerramos el audioCtx aquí; se reutiliza para la próxima narración
        this._onDisconnected?.();
    }

    // FIX C/D: limpia fuentes pero conserva el audioCtx para reutilizar
    _clearPending() {
        for (const src of this._activeSources) {
            try { src.stop(); } catch { /* ignore */ }
        }
        this._activeSources.clear();
        this._pendingSources = 0;
        this._segmentFinalized = false;
        this._pausedPcmQueue = [];
        this._nextStartTime = null;
        this.isPlaying = false;
        this.isPaused = false;
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

export default new CoWriterLiveService();