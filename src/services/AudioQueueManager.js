/**
 * AudioQueueManager.js
 * Gestor de cola avanzado para la generación de audio con múltiples API Keys.
 * Implementa paralelismo por llave, gestión de cooldowns y reintentos.
 */

import { generateGeminiAudio } from './GeminiTTSService';
import { saveAudioFile } from './FileSystemService';
import { updateChunk } from './db';

class AudioQueueManager {
    constructor() {
        this.queue = [];
        this.activeWorkers = 0;
        this.isPaused = false;
        this.keys = []; // { key: string, status: 'idle'|'working'|'cooldown', lastError: null, cooldownUntil: 0 }
        this.options = {
            bookId: null,
            chapterId: null,
            folderHandle: null,
            onProgress: () => {},
            onKeyStatusChange: () => {},
            onFinished: () => {},
            onError: () => {}
        };
        this.processedInSession = 0;
        this.totalToProcess = 0;
    }

    /**
     * Inicializa la cola con fragmentos y llaves disponibles.
     */
    setup(chunks, apiKeys, options) {
        this.queue = [...chunks];
        this.totalToProcess = chunks.length;
        this.processedInSession = 0;
        this.isPaused = false;
        this.options = { ...this.options, ...options };
        
        // Inicializar estado de las llaves
        this.keys = apiKeys
            .filter(k => k && k.trim().length > 0)
            .map(key => ({
                value: key,
                status: 'idle',
                cooldownUntil: 0,
                errorCount: 0
            }));

        if (this.keys.length === 0) {
            throw new Error("No hay API Keys válidas configuradas.");
        }
    }

    /**
     * Inicia el procesamiento de la cola usando las llaves disponibles.
     */
    async start() {
        if (this.isPaused) return;
        
        // Lanzamos un worker por cada llave
        this.keys.forEach((keyEntry, index) => {
            if (keyEntry.status === 'idle') {
                this.processWithKey(index);
            }
        });
    }

    async processWithKey(keyIndex) {
        if (this.isPaused || this.queue.length === 0) {
            this.checkFinished();
            return;
        }

        const keyEntry = this.keys[keyIndex];
        
        // Si está en cooldown, esperar y reintentar
        const now = Date.now();
        if (keyEntry.cooldownUntil > now) {
            keyEntry.status = 'cooldown';
            this.options.onKeyStatusChange(this.keys);
            const waitTime = keyEntry.cooldownUntil - now;
            setTimeout(() => this.processWithKey(keyIndex), waitTime + 100);
            return;
        }

        // Obtener el siguiente chunk
        const chunk = this.queue.shift();
        if (!chunk) {
            keyEntry.status = 'idle';
            this.options.onKeyStatusChange(this.keys);
            this.checkFinished();
            return;
        }

        keyEntry.status = 'working';
        keyEntry.currentChunkId = chunk.id;
        this.options.onKeyStatusChange(this.keys);

        try {
            // Generar Audio
            const audioBlob = await generateGeminiAudio(chunk.textoActual, keyEntry.value);
            
            // ... (resto del try) ...
            const isWav = audioBlob.type.includes('wav');
            const fileName = `${chunk.audioId}.${isWav ? 'wav' : 'mp3'}`;
            await saveAudioFile(this.options.folderHandle, fileName, audioBlob);

            const updateData = {
                textoGenerado: chunk.textoActual,
                estado: 'Sincronizado'
            };
            await updateChunk(this.options.bookId, this.options.chapterId, chunk.id, updateData);

            this.processedInSession++;
            keyEntry.errorCount = 0;
            keyEntry.status = 'idle';
            keyEntry.currentChunkId = null;
            this.options.onProgress(this.processedInSession, this.totalToProcess, chunk.id);
            this.options.onKeyStatusChange(this.keys);

            this.processWithKey(keyIndex);

        } catch (error) {
            // ... (en el catch) ...
            keyEntry.currentChunkId = null;
            // (resto del manejo de errores actual)
            const isQuotaError = error.message.toLowerCase().includes('cuota') || 
                                error.message.toLowerCase().includes('wait') ||
                                error.message.toLowerCase().includes('espera') ||
                                error.message.toLowerCase().includes('limit');
            
            this.queue.unshift(chunk);
            // ... (etc)

            if (isQuotaError) {
                // Aplicar Cooldown de 30 segundos según lo solicitado
                keyEntry.status = 'cooldown';
                keyEntry.cooldownUntil = Date.now() + 30000;
                keyEntry.errorCount++;
                
                this.options.onError(`Llave ${keyIndex + 1} llegó al límite. Pausa de 30s.`, true);
                this.options.onKeyStatusChange(this.keys);
                
                // Programar reintento para esta llave
                setTimeout(() => this.processWithKey(keyIndex), 30500);
            } else {
                // Error crítico o de red, esperar un poco antes de reintentar
                keyEntry.status = 'cooldown';
                keyEntry.cooldownUntil = Date.now() + 5000;
                this.options.onError(`Error en llave ${keyIndex + 1}: ${error.message}`, false);
                this.options.onKeyStatusChange(this.keys);
                setTimeout(() => this.processWithKey(keyIndex), 5100);
            }
        }
    }

    checkFinished() {
        const allIdle = this.keys.every(k => k.status === 'idle' || (k.status === 'cooldown' && this.queue.length === 0));
        if (allIdle && this.queue.length === 0) {
            this.options.onFinished();
        }
    }

    stop() {
        this.isPaused = true;
        this.keys.forEach(k => {
            k.status = 'idle';
            k.cooldownUntil = 0;
        });
    }
}

export const audioQueueManager = new AudioQueueManager();
