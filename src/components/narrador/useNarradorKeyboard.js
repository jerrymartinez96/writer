/**
 * useNarradorKeyboard — Atajos de teclado para el Narrador.
 * Espacio: play/pause | ← : anterior | → : siguiente | Esc: cerrar/detener
 * Solo activo en modo lectura y sin un input enfocado.
 */
import { useEffect } from 'react';

const useNarradorKeyboard = ({
    enabled,
    isPanelOpen,
    status,
    narrador,
    onClosePanel
}) => {
    useEffect(() => {
        if (!enabled) return;

        const isTypingInField = () => {
            const el = document.activeElement;
            if (!el) return false;
            const tag = el.tagName?.toLowerCase();
            return tag === 'input' || tag === 'textarea' || el.isContentEditable;
        };

        const handleKeyDown = (e) => {
            if (isTypingInField()) return;

            const { startNarration, pauseNarration, resumeNarration, skipToSegment, currentSegmentIndex, totalSegments, stopNarration } = narrador;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    if (status === 'speaking' || status === 'connecting') {
                        pauseNarration();
                    } else if (status === 'paused') {
                        resumeNarration();
                    } else if (status === 'idle' || status === 'stopped') {
                        startNarration();
                    }
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    if (currentSegmentIndex > 0) {
                        skipToSegment(currentSegmentIndex - 1);
                    }
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    if (currentSegmentIndex < totalSegments - 1) {
                        skipToSegment(currentSegmentIndex + 1);
                    }
                    break;

                case 'Escape':
                    if (isPanelOpen) {
                        onClosePanel();
                    } else if (status !== 'idle' && status !== 'stopped') {
                        stopNarration();
                    }
                    break;

                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enabled, isPanelOpen, status, narrador, onClosePanel]);
};

export default useNarradorKeyboard;