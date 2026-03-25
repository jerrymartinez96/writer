import React from 'react';

/**
 * ForgeVoiceIndicator — Visual animation when the microphone is active
 * Shows animated bars + pulsing ring to indicate live recording
 */
const ForgeVoiceIndicator = ({ isRecording, isModelSpeaking }) => {
    if (!isRecording && !isModelSpeaking) return null;

    return (
        <div className="flex items-center gap-3 px-4 py-2">
            {/* Animated bars */}
            <div className="flex items-end gap-0.5 h-5">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className={`w-[3px] rounded-full transition-all ${
                            isRecording 
                                ? 'bg-orange-500' 
                                : 'bg-blue-500'
                        }`}
                        style={{
                            height: isRecording || isModelSpeaking ? `${6 + Math.random() * 14}px` : '3px',
                            animation: (isRecording || isModelSpeaking) 
                                ? `forgeBar ${0.3 + i * 0.1}s ease-in-out infinite alternate` 
                                : 'none',
                        }}
                    />
                ))}
            </div>

            {/* Label */}
            <span className={`text-[9px] font-black uppercase tracking-widest animate-pulse ${
                isRecording ? 'text-orange-500' : 'text-blue-500'
            }`}>
                {isRecording ? 'Escuchando...' : 'Hablando...'}
            </span>

            {/* Pulsing ring */}
            <div className={`w-3 h-3 rounded-full border-2 ${
                isRecording ? 'border-orange-500' : 'border-blue-500'
            } animate-ping opacity-50`} />

            {/* Keyframe animation via inline style tag */}
            <style>{`
                @keyframes forgeBar {
                    0% { height: 4px; }
                    100% { height: 18px; }
                }
            `}</style>
        </div>
    );
};

export default ForgeVoiceIndicator;
