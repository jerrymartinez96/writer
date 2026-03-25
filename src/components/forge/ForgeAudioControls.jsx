import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Type, AudioLines, Keyboard, Waves } from 'lucide-react';

/**
 * ForgeAudioControls — Input/Output mode toggles for La Forja voice system
 * 
 * Controls:
 * - Input mode: Keyboard (text) or Microphone (voice)
 * - Output mode: Text-only or Voice (with transcription)
 */
const ForgeAudioControls = ({ 
    inputMode,      // 'text' | 'voice'
    outputMode,     // 'text' | 'voice'
    onInputModeChange, 
    onOutputModeChange,
    isConnected,    // WebSocket state
    isRecording,    // Mic active
    isPlaying,      // Audio playback active
    disabled = false 
}) => {

    return (
        <div className="flex items-center gap-1.5">
            {/* Input Toggle */}
            <div className="flex items-center bg-[var(--bg-editor)] rounded-lg border border-[var(--border-main)] overflow-hidden">
                <button
                    onClick={() => onInputModeChange('text')}
                    disabled={disabled}
                    title="Escribir (texto)"
                    className={`p-1.5 transition-all ${
                        inputMode === 'text' 
                            ? 'bg-orange-500 text-white' 
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Keyboard size={13} />
                </button>
                <button
                    onClick={() => onInputModeChange('voice')}
                    disabled={disabled}
                    title="Hablar (voz)"
                    className={`p-1.5 transition-all ${
                        inputMode === 'voice' 
                            ? 'bg-orange-500 text-white' 
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {isRecording ? <Mic size={13} className="animate-pulse" /> : <Mic size={13} />}
                </button>
            </div>

            {/* Separator */}
            <div className="w-px h-4 bg-[var(--border-main)]" />

            {/* Output Toggle */}
            <div className="flex items-center bg-[var(--bg-editor)] rounded-lg border border-[var(--border-main)] overflow-hidden">
                <button
                    onClick={() => onOutputModeChange('text')}
                    disabled={disabled}
                    title="Respuesta en texto"
                    className={`p-1.5 transition-all ${
                        outputMode === 'text' 
                            ? 'bg-orange-500 text-white' 
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Type size={13} />
                </button>
                <button
                    onClick={() => onOutputModeChange('voice')}
                    disabled={disabled}
                    title="Respuesta con voz"
                    className={`p-1.5 transition-all ${
                        outputMode === 'voice' 
                            ? 'bg-orange-500 text-white' 
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {isPlaying ? <Waves size={13} className="animate-pulse" /> : <AudioLines size={13} />}
                </button>
            </div>

            {/* Connection indicator */}
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                isConnected ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]' : 'bg-[var(--text-muted)]'
            }`} title={isConnected ? 'Conectado a Gemini Live' : 'Desconectado'} />
        </div>
    );
};

export default ForgeAudioControls;
