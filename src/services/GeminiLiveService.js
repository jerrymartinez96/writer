/**
 * GeminiLiveService — WebSocket client for Gemini Live API (Native Audio Dialog)
 * Supports: text input, audio input, text output, audio output, function calling (tool use)
 * 
 * Model: gemini-2.5-flash-native-audio-preview-12-2025
 * Endpoint: wss://generativelanguage.googleapis.com/ws/...BidiGenerateContent
 */

const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

/**
 * Event emitter pattern for decoupled communication
 */
class EventBus {
    constructor() {
        this._handlers = {};
    }
    on(event, handler) {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(handler);
        return () => this.off(event, handler);
    }
    off(event, handler) {
        if (!this._handlers[event]) return;
        this._handlers[event] = this._handlers[event].filter(h => h !== handler);
    }
    emit(event, data) {
        if (this._handlers[event]) {
            this._handlers[event].forEach(h => {
                try { h(data); } catch (e) { console.error(`[GeminiLive] Event handler error (${event}):`, e); }
            });
        }
    }
}

/**
 * Connection states
 */
export const LiveState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    CONFIGURING: 'configuring',
    READY: 'ready',
    ERROR: 'error',
};

/**
 * The main service class
 */
export class GeminiLiveService {
    constructor() {
        this.ws = null;
        this.state = LiveState.DISCONNECTED;
        this.events = new EventBus();
        this._audioContext = null;
        this._mediaStream = null;
        this._audioWorklet = null;
        this._scriptProcessor = null;
        this._playbackQueue = [];
        this._isPlaying = false;
        this._inputMode = 'text';    // 'text' | 'voice'
        this._outputMode = 'text';   // 'text' | 'voice' | 'both'
        this._suppressAudio = false; // true = receive audio but don't play it (text-only display via transcription)
        this._toolDeclarations = [];
        this._systemInstruction = '';
        this._pendingToolResponses = {};
    }

    // ────────────────────── Connection ──────────────────────

    /**
     * Connect to Gemini Live API and send initial configuration
     * @param {Object} options
     * @param {string} options.apiKey - Google API key
     * @param {string} options.systemInstruction - System prompt
     * @param {Array} options.tools - Function declarations for tool use
     * @param {string} options.outputMode - 'text' | 'voice' | 'both'
     */
    async connect({ apiKey, systemInstruction = '', tools = [], outputMode = 'both' }) {
        if (this.state !== LiveState.DISCONNECTED && this.state !== LiveState.ERROR) {
            console.warn('[GeminiLive] Already connected or connecting');
            return;
        }

        this._outputMode = outputMode;
        // Native audio model ALWAYS requires AUDIO modality.
        // 'text' mode = send AUDIO but suppress playback, show only transcription.
        this._suppressAudio = (outputMode === 'text');
        this._toolDeclarations = tools;
        this._systemInstruction = systemInstruction;
        this._setState(LiveState.CONNECTING);

        const wsUrl = `${WS_BASE}?key=${apiKey}`;

        return new Promise((resolve, reject) => {
            let setupTimeout;

            const onSetupComplete = () => {
                clearTimeout(setupTimeout);
                this._setState(LiveState.READY);
                resolve();
            };

            // Register one-time handler for setupComplete
            const unsub = this.events.on('setupComplete', () => {
                unsub();
                onSetupComplete();
            });

            try {
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    console.log('[GeminiLive] WebSocket connected');
                    this._setState(LiveState.CONFIGURING);
                    this._sendConfig();

                    // Timeout if server doesn't confirm setup within 8s
                    setupTimeout = setTimeout(() => {
                        console.warn('[GeminiLive] setupComplete timeout — assuming ready');
                        unsub();
                        onSetupComplete();
                    }, 8000);
                };

                this.ws.onmessage = (event) => {
                    this._handleMessage(event);
                };

                this.ws.onerror = (error) => {
                    clearTimeout(setupTimeout);
                    unsub();
                    console.error('[GeminiLive] WebSocket error:', error);
                    this._setState(LiveState.ERROR);
                    this.events.emit('error', { message: 'WebSocket connection error' });
                    reject(error);
                };

                this.ws.onclose = (event) => {
                    clearTimeout(setupTimeout);
                    console.log('[GeminiLive] WebSocket closed:', event.code, event.reason);
                    this._cleanup();
                    this._setState(LiveState.DISCONNECTED);
                    this.events.emit('disconnected', { code: event.code, reason: event.reason });
                    // If we didn't resolve yet, reject
                    if (this.state !== LiveState.READY) {
                        reject(new Error(`Closed before ready: ${event.reason}`));
                    }
                };

            } catch (err) {
                clearTimeout(setupTimeout);
                unsub();
                console.error('[GeminiLive] Connection failed:', err);
                this._setState(LiveState.ERROR);
                reject(err);
            }
        });
    }

    /**
     * Send initial setup message with model, modalities, system prompt, and tools.
     * NOTE: gemini-native-audio models ONLY support AUDIO response modality.
     * When outputMode='text', we still send AUDIO but suppress playback (_suppressAudio=true)
     * and rely solely on outputAudioTranscription for the text shown in chat.
     */
    _sendConfig() {
        const setup = {
            model: `models/${MODEL_NAME}`,
            generationConfig: {
                responseModalities: ['AUDIO'],   // always AUDIO — native audio model requirement
            },
            systemInstruction: {
                parts: [{ text: this._systemInstruction }]
            },
            // Always enable transcriptions so we can show text in both modes
            outputAudioTranscription: {},
            inputAudioTranscription: {},
        };

        // Add tool declarations if present
        if (this._toolDeclarations.length > 0) {
            setup.tools = [{
                functionDeclarations: this._toolDeclarations
            }];
        }

        this._send({ setup });
        console.log('[GeminiLive] Setup sent:', {
            model: MODEL_NAME,
            modalities: ['AUDIO'],
            suppressPlayback: this._suppressAudio,
            tools: this._toolDeclarations.length
        });
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        this._stopAudioCapture();
        this._stopAudioPlayback();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this._cleanup();
        this._setState(LiveState.DISCONNECTED);
    }

    _cleanup() {
        this._playbackQueue = [];
        this._isPlaying = false;
        this._pendingToolResponses = {};
    }

    // ────────────────────── Sending ──────────────────────

    /**
     * Send text message to the model.
     * Uses clientContent with turnComplete:true so the model generates a response.
     * @param {string} text 
     */
    sendText(text) {
        if (!this._isReady()) return;
        // clientContent is the correct way to send a user text turn to the Live API
        this._send({
            clientContent: {
                turns: [{ role: 'user', parts: [{ text }] }],
                turnComplete: true
            }
        });
        this.events.emit('userText', { text });
        console.log('[GeminiLive] Text turn sent:', text.substring(0, 50));
    }

    /**
     * Send text as structured client content (for multi-turn context)
     * @param {Array} turns - Array of { role, parts: [{ text }] }
     * @param {boolean} turnComplete 
     */
    sendClientContent(turns, turnComplete = true) {
        if (!this._isReady()) return;
        this._send({
            clientContent: { turns, turnComplete }
        });
    }

    /**
     * Update audio suppression in real-time without reconnecting.
     * Call this when the user toggles output mode.
     * @param {boolean} suppress 
     */
    setSuppressAudio(suppress) {
        this._suppressAudio = suppress;
        if (suppress) {
            this._stopAudioPlayback();
        }
        console.log('[GeminiLive] Audio suppression:', suppress);
    }

    /**
     * Send raw PCM audio chunk (base64 encoded)
     * @param {string} base64Data 
     */
    sendAudioChunk(base64Data) {
        if (!this._isReady()) return;
        this._send({
            realtimeInput: {
                audio: {
                    data: base64Data,
                    mimeType: 'audio/pcm;rate=16000'
                }
            }
        });
    }

    /**
     * Send tool response back to the model after executing a function call
     * @param {Array} functionResponses - [{ name, id, response: { result } }]
     */
    sendToolResponse(functionResponses) {
        if (!this._isReady()) return;
        this._send({
            toolResponse: { functionResponses }
        });
        console.log('[GeminiLive] Tool response sent:', functionResponses.map(r => r.name));
    }

    _send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('[GeminiLive] Cannot send — WebSocket not open');
        }
    }

    _isReady() {
        if (this.state !== LiveState.READY) {
            console.warn('[GeminiLive] Not ready, current state:', this.state);
            return false;
        }
        return true;
    }

    // ────────────────────── Receiving ──────────────────────

    _handleMessage(event) {
        // Gemini Live API sends messages as Blob — must read as text first
        if (event.data instanceof Blob) {
            event.data.text().then(text => {
                this._parseAndDispatch(text);
            }).catch(e => {
                console.warn('[GeminiLive] Failed to read Blob message:', e);
            });
            return;
        }
        // Fallback for string messages
        this._parseAndDispatch(event.data);
    }

    _parseAndDispatch(rawText) {
        let response;
        try {
            response = JSON.parse(rawText);
        } catch (e) {
            console.warn('[GeminiLive] Failed to parse message:', e, rawText?.substring?.(0, 100));
            return;
        }

        // Setup complete acknowledgement
        if (response.setupComplete) {
            console.log('[GeminiLive] Setup complete');
            this._setState(LiveState.READY);
            this.events.emit('setupComplete', {});
            return;
        }

        // Server content (audio, text, transcriptions)
        if (response.serverContent) {
            const sc = response.serverContent;

            // Model turn — audio or text parts
            if (sc.modelTurn?.parts) {
                for (const part of sc.modelTurn.parts) {
                    // Skip internal thinking parts (chain-of-thought)
                    if (part.thought === true) continue;

                    // Audio data
                    if (part.inlineData) {
                        const audioB64 = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType || 'audio/pcm;rate=24000';
                        this.events.emit('audioChunk', { data: audioB64, mimeType });
                        this._enqueueAudioPlayback(audioB64);
                    }
                    // Text part (non-thinking)
                    if (part.text) {
                        this.events.emit('textChunk', { text: part.text });
                    }
                }
            }

            // Input transcription (what the user said)
            if (sc.inputTranscription?.text) {
                this.events.emit('inputTranscription', { text: sc.inputTranscription.text });
            }

            // Output transcription (model's audio → text)
            // Filter out English thinking fragments — only show final Spanish response
            if (sc.outputTranscription?.text) {
                const text = sc.outputTranscription.text;
                // Thinking fragments are in English and often start with patterns like:
                // "I'm", "**", "let me", "now I", leading asterisks, etc.
                // The real answer is in Spanish. We emit it as 'thinking' or 'finalTranscription'
                const isThinking = this._looksLikeThinking(text);
                if (isThinking) {
                    // Optional: emit for debugging but don't show in UI
                    this.events.emit('thinkingChunk', { text });
                } else {
                    this.events.emit('outputTranscription', { text });
                }
            }

            // Turn complete
            if (sc.turnComplete) {
                this.events.emit('turnComplete', {});
            }

            // Interrupted (barge-in)
            if (sc.interrupted) {
                this.events.emit('interrupted', {});
                this._stopAudioPlayback();
            }
        }

        // Tool calls from the model
        if (response.toolCall) {
            this.events.emit('toolCall', {
                functionCalls: response.toolCall.functionCalls || []
            });
        }
    }

    /**
     * Detect if a transcription fragment looks like internal English thinking
     * rather than the final Spanish answer the user should see.
     */
    _looksLikeThinking(text) {
        const t = text.trim();
        // Common patterns of English thinking fragments from Gemini 2.5
        const englishThinkingPatterns = [
            /^\*\*/,                       // starts with **
            /^I'm (now|currently|going)/i, // "I'm now...", "I'm currently..."
            /^(Now|Next|Let me|I need|I will|I'll|First|Then|Finally|Here)/i,
            /^(Thinking|Analyzing|Planning|Structuring|Refining|Formalizing|Defining|Building)/i,
        ];
        // If it obviously contains Spanish, it's the real answer
        const spanishIndicators = /[áéíóúüñ¿¡]|\b(el|la|los|las|un|una|de|que|es|en|y|para|con|como|se|al|del)\b/i;
        if (spanishIndicators.test(t)) return false;
        return englishThinkingPatterns.some(pattern => pattern.test(t));
    }

    // ────────────────────── Audio Capture (Microphone) ──────────────────────

    /**
     * Start capturing audio from the user's microphone
     * Sends PCM 16kHz mono chunks to the model
     */
    async startAudioCapture() {
        if (this._mediaStream) {
            console.warn('[GeminiLive] Audio capture already active');
            return;
        }

        try {
            this._mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });

            this._audioContext = new AudioContext({ sampleRate: 16000 });
            const source = this._audioContext.createMediaStreamSource(this._mediaStream);

            // Use ScriptProcessorNode for wide compatibility (AudioWorklet is better but more complex)
            const bufferSize = 4096;
            this._scriptProcessor = this._audioContext.createScriptProcessor(bufferSize, 1, 1);

            this._scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32 to Int16 PCM
                const pcmData = this._float32ToInt16(inputData);
                // Base64 encode
                const base64 = this._arrayBufferToBase64(pcmData.buffer);
                this.sendAudioChunk(base64);
            };

            source.connect(this._scriptProcessor);
            this._scriptProcessor.connect(this._audioContext.destination);

            this._inputMode = 'voice';
            this.events.emit('audioCapture', { active: true });
            console.log('[GeminiLive] Audio capture started');

        } catch (err) {
            console.error('[GeminiLive] Failed to start audio capture:', err);
            this.events.emit('error', { message: 'No se pudo acceder al micrófono: ' + err.message });
            throw err;
        }
    }

    /**
     * Stop capturing audio
     */
    _stopAudioCapture() {
        if (this._scriptProcessor) {
            this._scriptProcessor.disconnect();
            this._scriptProcessor = null;
        }
        if (this._mediaStream) {
            this._mediaStream.getTracks().forEach(t => t.stop());
            this._mediaStream = null;
        }
        if (this._audioContext && this._audioContext.state !== 'closed') {
            this._audioContext.close().catch(() => {});
            this._audioContext = null;
        }
        this._inputMode = 'text';
        this.events.emit('audioCapture', { active: false });
    }

    stopAudioCapture() {
        this._stopAudioCapture();
        console.log('[GeminiLive] Audio capture stopped');
    }

    // ────────────────────── Audio Playback ──────────────────────

    /**
     * Enqueue a base64-encoded PCM chunk for playback and schedule it
     */
    _enqueueAudioPlayback(base64Data) {
        // If outputMode is 'text', suppress audio — we only show the transcription
        if (this._suppressAudio) return;
        this._playbackQueue.push(base64Data);
        this._schedulePlayback();
    }

    _schedulePlayback() {
        if (this._playbackQueue.length === 0) return;

        if (!this._playbackContext || this._playbackContext.state === 'closed') {
            // Let the OS choose its preferred hardware sample rate (often 48kHz on Mac) to prevent resampling distortion
            this._playbackContext = new AudioContext(); 
            this._nextPlaybackTime = this._playbackContext.currentTime;
            this._isPlaying = true;
            this.events.emit('playbackState', { playing: true });
        }

        // Browsers require resuming the context if it was suspended
        if (this._playbackContext.state === 'suspended') {
            this._playbackContext.resume();
        }

        while (this._playbackQueue.length > 0) {
            const base64 = this._playbackQueue.shift();
            try {
                // Gemini outputs PCM 24kHz 16-bit mono
                const pcmBytes = this._base64ToArrayBuffer(base64);
                // ArrayBuffer to Int16
                const int16 = new Int16Array(pcmBytes);
                // Int16 to Float32 (required by Web Audio API)
                const float32 = this._int16ToFloat32(int16);

                // Buffer sample rate MUST match incoming data (24000). The browser will automatically resample it to hardware rate.
                const buffer = this._playbackContext.createBuffer(1, float32.length, 24000);
                buffer.getChannelData(0).set(float32);

                const sourceNode = this._playbackContext.createBufferSource();
                sourceNode.buffer = buffer;
                sourceNode.connect(this._playbackContext.destination);

                const currentTime = this._playbackContext.currentTime;
                // If we fell behind schedule (buffer underrun), jump ahead slightly to prevent stacking glitches
                if (this._nextPlaybackTime < currentTime) {
                    this._nextPlaybackTime = currentTime + 0.05; 
                }

                // Schedule exactly at the end of the previous chunk (gapless playback)
                sourceNode.start(this._nextPlaybackTime);
                this._nextPlaybackTime += buffer.duration;

                // Watch the last chunk to see when playback actually stops
                sourceNode.onended = () => {
                    // If queue is empty and the hardware clock passed our last scheduled time
                    if (this._playbackQueue.length === 0 && this._playbackContext && this._playbackContext.currentTime >= (this._nextPlaybackTime - 0.1)) {
                        this._isPlaying = false;
                        this.events.emit('playbackState', { playing: false });
                    }
                };

            } catch (err) {
                console.error('[GeminiLive] Playback error:', err);
            }
        }
    }

    _stopAudioPlayback() {
        this._playbackQueue = [];
        this._isPlaying = false;
        this._nextPlaybackTime = 0;
        if (this._playbackContext && this._playbackContext.state !== 'closed') {
            this._playbackContext.close().catch(() => {});
            this._playbackContext = null;
        }
        this.events.emit('playbackState', { playing: false });
    }

    // ────────────────────── Helpers ──────────────────────

    _float32ToInt16(float32Array) {
        const int16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16;
    }

    _int16ToFloat32(int16Array) {
        const float32 = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
        }
        return float32;
    }

    _arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    _base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    _setState(newState) {
        const prev = this.state;
        this.state = newState;
        if (prev !== newState) {
            this.events.emit('stateChange', { state: newState, previous: prev });
        }
    }

    // ────────────────────── Static ──────────────────────

    static get MODEL_NAME() { return MODEL_NAME; }
}

// Singleton instance for the app
export const geminiLive = new GeminiLiveService();
export default geminiLive;
