/**
 * Narrador — Componente orquestador del módulo de narración.
 * Combina el hook, el launcher, el panel y los atajos de teclado.
 * Se renderiza una sola vez dentro del Editor.
 */
import React, { useState } from 'react';
import { useNarrador } from './useNarrador';
import NarradorLauncher from './NarradorLauncher';
import NarradorPanel from './NarradorPanel';
import useNarradorKeyboard from './useNarradorKeyboard';

const Narrador = ({
    editor,
    isFocusMode,
    activeBook,
    activeChapter,
    nextChapter,
    onSelectChapter,
    profile,
    toast
}) => {
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    const narrador = useNarrador({
        editor,
        isFocusMode,
        activeBook,
        activeChapter,
        nextChapter,
        onSelectChapter,
        profileData: profile,
        toast
    });

    // Cerrar panel al salir de modo lectura
    React.useEffect(() => {
        if (!isFocusMode) {
            setIsPanelOpen(false);
            narrador.stopNarration();
        }
    }, [isFocusMode]);

    // Atajos de teclado (solo activos en modo lectura)
    useNarradorKeyboard({
        enabled: isFocusMode,
        isPanelOpen,
        status: narrador.status,
        narrador,
        onClosePanel: () => {
            setIsPanelOpen(false);
            narrador.stopNarration();
        }
    });

    return (
        <>
            <NarradorLauncher
                isFocusMode={isFocusMode}
                narrador={narrador}
                onTogglePanel={() => setIsPanelOpen(prev => !prev)}
            />

            {isPanelOpen && (
                <NarradorPanel
                    narrador={narrador}
                    activeChapter={activeChapter}
                    onClose={() => {
                        setIsPanelOpen(false);
                        narrador.stopNarration();
                    }}
                />
            )}
        </>
    );
};

export default Narrador;