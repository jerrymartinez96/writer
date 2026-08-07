/**
 * GeminiLiveService — Conexión WebSocket a Gemini Live 3.1 para narración de texto.
 *
 * - Recibe audio PCM 16-bit @ 24kHz y lo reproduce con AudioContext.
 * - Soporta cola de prefetch con máximo 3 segmentos pendientes.
 * - Pausa = suspende AudioContext + congela envío de nuevos segmentos.
 * - Resume = reanuda AudioContext + reactiva prefetch.
 * - Stop = cierra todo.
 * - Preview de voz: conecta, reproduce texto de muestra, desconecta.
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

// ============================================
// AUDITORÍA — Logs detallados para diagnóstico
// ============================================
const AUDIT = '🖥️ [Narrador] ';

const auditLog = (...args) => {
    try {
        console.log(AUDIT, ...args);
    } catch (e) { /* ignore */ }
};

const auditWarn = (...args) => {
    try {
        console.warn(AUDIT + '⚠️', ...args);
    } catch (e) { /* ignore */ }
};

const auditError = (...args) => {
    try {
        console.error(AUDIT + '❌', ...args);
    } catch (e) { /* ignore */ }
};
// ============================================

class GeminiLiveService {
    constructor() {
        this.ws = null;
        this.audioCtx = null;
        this.connected = false;
        this._onAudioChunk = null;
        this._onError = null;
        this._onConnected = null;
        this._onDisconnected = null;
        this._onTurnComplete = null;
        this._setupSent = false;

        // Cola de audio pendiente de reproducción
        this.pendingBuffers = [];
        this.isPlaying = false;
        this.currentSource = null;
        this.currentBufferOffset = 0;
        this._actualPlaybackRate = 1.0;
        // Scheduling para reproducción sin cortes
        this._nextStartTime = null;
        this._scheduledSources = [];

        // Profundidad de cola para prefetch (máx 3)
        this.prefetchDeep = 3;
        this.currentPrefetchCount = 0;
        this.isPaused = false;

        // Almacenamiento de audio del segmento actual (para cache)
        this.accumulatedAudio = [];
        this.segmentCallbacks = []; // Cola FIFO de callbacks por segmento enviado

        // Turno único estricto (Opción A)
        this.isTurnInProgress = false;
        this.pendingTexts = []; // Cola de textos esperando turno
        this.turnTimeout = null;

        // Cooldown de reconexión (Solución 4)
        this._cooldownUntil = 0;
        this.quotaExhausted = false;

        // Estadísticas de auditoría
        this.stats = {
            bytesRecibidos: 0,
            chunksRecibidos: 0,
            buffersReproducidos: 0,
            mensajesParseados: 0,
            turnosCompletados: 0,
            errores: 0
        };

        auditLog('📦 Constructor inicializado');
    }

    // ============ CONEXIÓN ============

    /**
     * Conecta al WebSocket de Gemini Live.
     * @param {string} apiKey
     * @param {Object} opts { model, voice, systemInstruction }
     */
    async connect(apiKey, opts = {}) {
        auditLog('🔌 connect() llamado, connected =', this.connected);

        // Solución 4: Si hay cooldown por cuota agotada, bloquear reconexión
        if (this._cooldownUntil > Date.now()) {
            const waitSec = Math.ceil((this._cooldownUntil - Date.now()) / 1000);
            const err = new Error(`Cuota de Gemini Live agotada. Espera ${waitSec}s antes de reconectar.`);
            auditError('🔌 🔒 Reconexión bloqueada por cooldown:', waitSec, 's restantes');
            if (this._onError) this._onError(err);
            throw err;
        }

        // Si ya hay una conexión activa o setup pendiente, primero limpiar todo
        // para permitir reconexión con nuevo modelo/voz
        if (this.connected || this.ws) {
            auditLog('🔌 Conexión previa detectada. Limpiando antes de reconectar...');
            this.stop();
        }

        // Solución 3: Reiniciar stats por sesión para logs limpios
        this.stats = {
            bytesRecibidos: 0,
            chunksRecibidos: 0,
            buffersReproducidos: 0,
            mensajesParseados: 0,
            turnosCompletados: 0,
            errores: 0
        };
        this.isTurnInProgress = false;
        this.pendingTexts = [];
        this.quotaExhausted = false;

        if (!apiKey) throw new Error('API Key de Gemini no configurada.');

        const model = opts.model || 'gemini-3.1-flash-live-preview';
        const voice = opts.voice || 'Puck';
        const systemInstruction = opts.systemInstruction || '';

        const url = `${WS_BASE}?key=${encodeURIComponent(apiKey)}`;
        auditLog('🔌 Creando WebSocket... modelo =', model, '| voz =', voice);

        // Crear AudioContext AHORA (dentro del gesto del usuario) para permitir autoplay
        this._ensureAudioContext();
        auditLog('🔊 AudioContext creado, estado =', this.audioCtx?.state);

        await new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url);
                auditLog('🔌 WebSocket instanciado correctamente');
            } catch (err) {
                auditError('🔌 Error creando WebSocket:', err);
                reject(err);
                return;
            }

            this.ws.onopen = () => {
                auditLog('🔌 WebSocket CONECTADO. Enviando setup...');
                this.connected = true;
                this._sendSetup(model, voice, systemInstruction);
                resolve();
            };

            this.ws.onerror = (err) => {
                auditError('🔌 WebSocket error:', err);
                this.connected = false;
                if (this._onError) this._onError(new Error('Error de conexión WebSocket con Gemini Live.'));
                reject(new Error('Error de conexión WebSocket con Gemini Live.'));
            };

            this.ws.onclose = (ev) => {
                auditWarn('🔌 WebSocket cerrado. code =', ev?.code, '| reason =', ev?.reason);
                this.connected = false;
                this.cleanupAudio();

                // Solución 1 + 4: Detectar cuota agotada y activar cooldown
                if (ev?.code === 1011 || (ev?.reason && ev.reason.includes('quota'))) {
                    this.quotaExhausted = true;
                    this._cooldownUntil = Date.now() + 60000; // 60 segundos
                    const quotaErr = new Error('Cuota de Gemini Live agotada. Espera 60 segundos antes de reintentar.');
                    auditError('🔒 Cuota de Gemini Live AGOTADA. Cooldown 60s activado.');
                    if (this._onError) this._onError(quotaErr);
                }

                if (this._onDisconnected) this._onDisconnected();
            };

            this.ws.onmessage = (event) => {
                this._handleMessage(event).catch(err => {
                    auditError('🔌 Error manejando mensaje:', err);
                });
            };
        });
    }

    _sendSetup(model, voice, systemInstruction) {
        if (this._setupSent || !this.connected) return;

        const payload = {
            setup: {
                model: `models/${model}`,
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: voice
                            }
                        }
                    }
                }
            }
        };

        if (systemInstruction) {
            payload.setup.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        auditLog('📤 Enviando setup al servidor:', JSON.stringify(payload).substring(0, 200));
        this.ws.send(JSON.stringify(payload));
        this._setupSent = true;
        if (this._onConnected) this._onConnected();
    }

    _ensureAudioContext() {
        if (!this.audioCtx) {
            try {
                auditLog('🔊 Creando AudioContext con sampleRate =', SAMPLE_RATE);
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
                auditLog('🔊 AudioContext creado. Estado inicial =', this.audioCtx.state);
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume().then(() => {
                        auditLog('🔊 AudioContext RESUMIDO. Estado =', this.audioCtx.state);
                    }).catch(err => {
                        auditError('🔊 Error al reanudar AudioContext:', err);
                    });
                }
            } catch (err) {
                auditError('🔊 Error creando AudioContext:', err);
            }
        }
        return this.audioCtx;
    }

    async _handleMessage(event) {
        try {
            // Normalizar event.data: puede ser string, Blob o ArrayBuffer
            let dataStr;
            if (typeof event.data === 'string') {
                dataStr = event.data;
            } else if (event.data instanceof Blob) {
                auditLog('📩 Mensaje recibido como Blob, decodificando...');
                dataStr = await event.data.text();
            } else if (event.data instanceof ArrayBuffer) {
                auditLog('📩 Mensaje recibido como ArrayBuffer, decodificando...');
                dataStr = new TextDecoder().decode(event.data);
            } else {
                auditWarn('📩 Tipo de mensaje desconocido:', typeof event.data, event.data);
                return;
            }

            const data = JSON.parse(dataStr);
            this.stats.mensajesParseados++;
            auditLog('📩 Mensaje parsed. keys =', Object.keys(data).join(', '));

            // Error del servidor
            if (data.error) {
                const msg = data.error.message || 'Error de Gemini Live API';
                auditError('📩 Error de la API:', msg);
                if (this._onError) this._onError(new Error(msg));
                return;
            }

            // Setup confirmado
            if (data.setupComplete) {
                auditLog('✅ Setup CONFIRMADO por el servidor');
                return;
            }

            // Turn completo (el servidor terminó de generar audio)
            if (data.serverContent?.turnComplete) {
                this.stats.turnosCompletados++;
                auditLog('✅ Turn COMPLETO recibido. Turnos completados =', this.stats.turnosCompletados);
                this._finalizeCurrentSegmentAudio();

                // Limpiar timer de fallback
                if (this.turnTimeout) {
                    clearTimeout(this.turnTimeout);
                    this.turnTimeout = null;
                }

                // Opción A: Liberar turno y enviar el siguiente en cola si existe
                this.isTurnInProgress = false;
                this._sendNextPending();

                if (this._onTurnComplete) this._onTurnComplete();
                return;
            }

            // Interrupciones del servidor
            if (data.serverContent?.interrupted) {
                auditWarn('⛔ Servidor interrumpió la generación. Tratando como fin de turno...');

                // IMPORTANTE: `interrupted` NO significa que debamos cerrar la conexión.
                // Significa que el turno actual fue interrumpido (por ejemplo, el
                // servidor liberó el turno). Debes finalizar el audio acumulado,
                // liberar el turno y continuar con el siguiente segmento.
                this._finalizeCurrentSegmentAudio();

                // Limpiar timer de fallback
                if (this.turnTimeout) {
                    clearTimeout(this.turnTimeout);
                    this.turnTimeout = null;
                }

                // Liberar turno y enviar siguiente pendiente (si existe)
                this.isTurnInProgress = false;
                this._sendNextPending();

                // Notificar handler para que useNarrador avance de segmento
                if (this._onTurnComplete) this._onTurnComplete();
                return;
            }

            // Chunk de audio
            if (data.serverContent?.modelTurn) {
                auditLog('🎵 modelTurn recibido. parts =', data.serverContent.modelTurn.parts?.length);
                const parts = data.serverContent.modelTurn.parts || [];
                for (const part of parts) {
                    if (part.inlineData && (part.inlineData.mimeType === 'audio/pcm' || part.inlineData.mimeType?.includes('pcm'))) {
                        const base64Audio = part.inlineData.data;
                        if (base64Audio) {
                            this._accumulateAudioChunk(base64Audio);
                        } else {
                            auditWarn('🎵 inlineData sin data (audio vacío)');
                        }
                    } else if (part.text) {
                        auditLog('💬 Texto recibido del modelo:', part.text.substring(0, 100));
                    }
                }
            }
        } catch (err) {
            this.stats.errores++;
            auditError('📩 Error parseando mensaje:', err);
        }
    }

    // ============ AUDIO PCM / REPRODUCCIÓN ============

    _accumulateAudioChunk(base64Audio) {
        try {
            const binary = atob(base64Audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const pcmBuffer = bytes.buffer;

            this.stats.bytesRecibidos += binary.length;
            this.stats.chunksRecibidos++;
            auditLog('🎵 Chunk PCM recibido. Src bytes =', binary.length, '| Total acumulado =', this.stats.bytesRecibidos, '| Chunks totales =', this.stats.chunksRecibidos);

            // Acumular para el caché del segmento actual
            this.accumulatedAudio.push(new Uint8Array(pcmBuffer.slice(0)));

            // Encolar para reproducción
            this.pendingBuffers.push(pcmBuffer);
            this.currentPrefetchCount++;

            // Asegurar AudioContext activo y reproducir el siguiente buffer
            // (uso scheduling para que no haya gaps/clics entre chunks)
            this._ensureAudioContext();
            if (!this.isPaused) {
                auditLog('▶️ Programando buffer inmediatamente. Cola =', this.pendingBuffers.length);
                this._playNext();
            }

            if (this._onAudioChunk) this._onAudioChunk(pcmBuffer);
        } catch (err) {
            this.stats.errores++;
            auditError('🎵 Error decodificando audio:', err);
        }
    }

    _finalizeCurrentSegmentAudio() {
        // Unir todos los chunks PCM del segmento en un solo ArrayBuffer
        if (this.accumulatedAudio.length > 0) {
            const totalLength = this.accumulatedAudio.reduce((sum, chunk) => sum + chunk.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of this.accumulatedAudio) {
                combined.set(chunk, offset);
                offset += chunk.length;
            }
            auditLog('📦 Segmento completado. Bytes combinados =', totalLength);
            this.accumulatedAudio = [];

            // Evitar guardar caché de audio vacío o demasiado corto (<1s @24kHz ≈ 48000 bytes)
            // que indique un segmento interrumpido antes de generar audio real
            if (totalLength < 48000) {
                auditWarn('💾 Audio demasiado corto para caché. Bytes =', totalLength, '— se descarta caché.');
                // Aun así, liberar el callback para mantener FIFO
                this.segmentCallbacks.shift();
            } else {
                // Tomar el callback FIFO del segmento que acaba de completarse
                const callback = this.segmentCallbacks.shift();
                if (callback) {
                    try {
                        auditLog('💾 Guardando segmento en caché... Bytes =', totalLength);
                        callback(combined.buffer);
                    } catch (err) {
                        auditError('💾 Error en callback de caché:', err);
                    }
                }
            }
        } else {
            auditWarn('⚠️ turnComplete sin audio acumulado');
            // Mantener FIFO: descartar el callback pendiente para no perder sincronía
            this.segmentCallbacks.shift();
        }
        // Limpiar prefetch count para el siguiente segmento
        this.currentPrefetchCount = this.pendingBuffers.length;
    }

    _playNext() {
        if (this.isPaused || !this.audioCtx || this.pendingBuffers.length === 0) {
            auditLog('⏸️ _playNext bloqueado. isPaused =', this.isPaused, '| ctx =', !!this.audioCtx, '| cola =', this.pendingBuffers.length);
            return;
        }

        // NOTA: NO se bloquea por isPlaying — cada chunk se programa
        // inmediatamente con su tiempo exacto acumulado (scheduling),
        // lo que permite encadenar buffers sin gaps ni cortes.
        // isPlaying solo se usa como indicador de estado para la UI.
        // Resto del código...

        const pcmBuffer = this.pendingBuffers.shift();
        this.currentPrefetchCount--;
        auditLog('▶️ _playNext: desencolando buffer. Cola restante =', this.pendingBuffers.length);

        try {
            const audioBuffer = this._decodePcmToAudioBuffer(pcmBuffer);
            auditLog('🔊 Buffer decodificado. longitud =', audioBuffer.length, 'samples | duración =', audioBuffer.duration, 's');

            // PROGRAMACIÓN (scheduling) para evitar cortes/clics entre chunks:
            // - Primer buffer: empieza ahora + 0.05s (pequeño margen)
            // - Buffers siguientes: empiezan exactamente cuando termina el anterior
            const now = this.audioCtx.currentTime;
            if (this._nextStartTime === null || this._nextStartTime < now) {
                this._nextStartTime = now + 0.05;
            }

            const startTime = this._nextStartTime;
            // Actualizar próximo inicio sumando la duración del buffer actual (ajustada por velocidad)
            this._nextStartTime = startTime + (audioBuffer.duration / this._actualPlaybackRate);

            const source = this.audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = this._actualPlaybackRate;
            source.connect(this.audioCtx.destination);
            this._scheduledSources.push(source);

            // Limpiar referencias cuando termine
            source.onended = () => {
                this.stats.buffersReproducidos++;
                const idx = this._scheduledSources.indexOf(source);
                if (idx !== -1) this._scheduledSources.splice(idx, 1);
            };

            // Iniciar en el tiempo programado (sin interrupciones)
            source.start(startTime);

            // Reprogramar el siguiente buffer si quedan pendientes
            if (this.pendingBuffers.length > 0 && !this.isPaused) {
                this._playNext();
            }

            this.isPlaying = true;
            auditLog('🎶 Buffer programado en t =', startTime.toFixed(3), 's | dura =', audioBuffer.duration.toFixed(2), 's | #', this.stats.buffersReproducidos + 1);
        } catch (err) {
            this.stats.errores++;
            auditError('🎶 Error reproduciendo buffer:', err);
            this.currentSource = null;
            this.isPlaying = false;
        }
    }

    _decodePcmToAudioBuffer(pcmBuffer) {
        this._ensureAudioContext();

        const pcm16 = new Int16Array(pcmBuffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 32768.0;
        }

        const audioBuffer = this.audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
        audioBuffer.copyToChannel(float32, 0);
        return audioBuffer;
    }

    // ============ API PÚBLICA ============

    /**
     * Envía un texto para que sea narrado por Gemini Live.
     * @param {string} text
     * @param {Function} onSegmentAudio - callback con el ArrayBuffer PCM completo del segmento
     */
    sendText(text, onSegmentAudio) {
        if (!this.connected || !this.ws) {
            throw new Error('No conectado a Gemini Live.');
        }

        auditLog('📤 sendText(): texto =', (text || '').substring(0, 80));
        this.isPaused = false;

        // Si es el primer envío de una tanda nueva, limpiar acumulados
        if (this.segmentCallbacks.length === 0 && this.pendingTexts.length === 0) {
            this.accumulatedAudio = [];
        }

        // Registrar callback FIFO para este segmento
        this.segmentCallbacks.push(onSegmentAudio || null);

        // OPCIÓN A — Turno único estricto:
        // Encolar el texto y enviarlo SOLO cuando no haya un turno en curso.
        // Gemini Live procesa un turno a la vez; enviar múltiples turns
        // en ráfaga causa que el servidor nunca confirme turnComplete.
        this.pendingTexts.push({ text, onSegmentAudio });

        if (!this.isTurnInProgress) {
            this._sendNextPending();
        } else {
            auditLog('⏳ Turno en curso. Texto encolado. Cola =', this.pendingTexts.length);
        }
    }

    /**
     * Envía el siguiente texto pendiente si no hay un turno activo.
     * (Opción A — Turno único estricto)
     */
    _sendNextPending() {
        if (this.isTurnInProgress || this.pendingTexts.length === 0) return;
        if (!this.connected || !this.ws) return;

        // Campeón: si hay cuota agotada, no enviar
        if (this.quotaExhausted) {
            auditWarn('🚫 Quota agotada. No se enviará el texto pendiente.');
            return;
        }

        const { text, onSegmentAudio } = this.pendingTexts.shift();
        this.isTurnInProgress = true;
        this.accumulatedAudio = [];

        auditLog('📤 Enviando turno único. Cola pendiente =', this.pendingTexts.length);

        // IMPORTANTE: 'turnComplete: true' es OBLIGATORIO para que el servidor
        // procese el turno y genere audio. Sin este campo, el servidor espera
        // indefinidamente a que el turno del usuario se complete.
        const payload = {
            clientContent: {
                turns: [{
                    role: 'user',
                    parts: [{ text }]
                }],
                turnComplete: true
            }
        };
        this.ws.send(JSON.stringify(payload));

        // Fallback: Si el servidor no confirma turnComplete en 30s,
        // liberar el turno para no quedar atascados (protección contra cola congelada)
        if (this.turnTimeout) clearTimeout(this.turnTimeout);
        this.turnTimeout = setTimeout(() => {
            auditWarn('⏰ Fallback: No se recibió turnComplete en 30s. Liberando turno...');
            this.isTurnInProgress = false;
            this._sendNextPending();
        }, 30000);
    }

    /**
     * Pausa la reproducción y congela el envío de nuevos chunks.
     */
    pause() {
        auditLog('⏸️ pause() llamado');
        this.isPaused = true;
        if (this.audioCtx && this.audioCtx.state === 'running') {
            this.audioCtx.suspend().then(() => {
                auditLog('⏸️ AudioContext suspendido');
            });
        }
    }

    /**
     * Reanuda la reproducción.
     */
    resume() {
        auditLog('▶️ resume() llamado');
        this.isPaused = false;
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().then(() => {
                auditLog('▶️ AudioContext reanudado');
                if (!this.isPlaying && this.pendingBuffers.length > 0) {
                    this._playNext();
                }
            }).catch(err => auditError('▶️ Error reanudando AudioContext:', err));
        } else if (!this.isPlaying && this.pendingBuffers.length > 0) {
            this._playNext();
        }
    }

    /**
     * Establece la velocidad de reproducción en tiempo real.
     */
    setPlaybackRate(rate) {
        auditLog('⏩ setPlaybackRate =', rate);
        this._actualPlaybackRate = rate;
        if (this.currentSource) {
            this.currentSource.playbackRate.value = rate;
        }
    }

    /**
     * Detiene toda la reproducción y cierra la conexión.
     */
    stop() {
        auditLog('⏹️ stop() llamado');
        try {
            if (this.ws) {
                this.ws.close();
                this.ws = null;
            }
        } catch { /* ignore */ }
        this.connected = false;
        this._setupSent = false;
        this.cleanupAudio();
        if (this._onDisconnected) this._onDisconnected();
    }

    cleanupAudio() {
        auditLog('🧹 cleanupAudio() — stats finales:', JSON.stringify(this.stats));
        try {
            if (this.currentSource) {
                this.currentSource.stop();
                this.currentSource = null;
            }
        } catch { /* ignore */ }

        // Detener todos los sources programados
        for (const src of this._scheduledSources) {
            try { src.stop(); } catch { /* ignore */ }
        }
        this._scheduledSources = [];
        this._nextStartTime = null;

        // Limpiar turnos pendientes y timer de fallback
        if (this.turnTimeout) {
            clearTimeout(this.turnTimeout);
            this.turnTimeout = null;
        }
        this.pendingTexts = [];
        this.isTurnInProgress = false;

        this.pendingBuffers = [];
        this.accumulatedAudio = [];
        this.segmentCallbacks = [];
        this.isPlaying = false;
        this.isPaused = false;
        this.currentPrefetchCount = 0;

        if (this.audioCtx) {
            try { this.audioCtx.close(); } catch { /* ignore */ }
            this.audioCtx = null;
        }
    }

    /**
     * Conecta, reproduce una muestra de voz y desconecta.
     * @param {string} apiKey
     * @param {string} voice
     * @param {string} model
     * @returns {Promise<{stop: Function}>}
     */
    async previewVoice(apiKey, voice, model = 'gemini-3.1-flash-live-preview') {
        auditLog('🎤 previewVoice() con voz =', voice, '| modelo =', model);
        await this.connect(apiKey, { model, voice, systemInstruction: 'Habla con claridad y naturalidad. Lee las dos oraciones de muestra.' });
        this.sendText('Hola, soy un narrador de audiolibros. Esta es una prueba de voz para tu proyecto de escritura.');
        return {
            stop: () => this.stop()
        };
    }

    // ============ EVENTOS ============

    on(event, callback) {
        switch (event) {
            case 'audioChunk': this._onAudioChunk = callback; break;
            case 'error': this._onError = callback; break;
            case 'connected': this._onConnected = callback; break;
            case 'disconnected': this._onDisconnected = callback; break;
            case 'turnComplete': this._onTurnComplete = callback; break;
            default: break;
        }
    }
}

export default new GeminiLiveService();