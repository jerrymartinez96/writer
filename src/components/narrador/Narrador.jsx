/**
 * Narrador — Componente orquestador del módulo de narración.
 * Combina el hook, el launcher, el panel y los atajos de teclado.
 * Se renderiza una sola vez dentro del Editor.
 */
import React, { useState, useEffect } from 'react';
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

    const exitNarratorModeIfOn = () => {
        if (narrador.isNarratorMode) narrador.toggleNarratorMode();
    };

    // Cerrar panel al salir de modo lectura
    useEffect(() => {
        if (!isFocusMode) {
            setIsPanelOpen(false);
            narrador.stopNarration();
        }
    }, [isFocusMode]);

    // Añadir clase de atenuación al editor cuando el modo narrador está activo
    useEffect(() => {
        // Acceso seguro al DOM del editor: `editor.view.dom` lanza una excepción
        // en Tiptap si la vista aún no está montada. `options.element` nunca lanza.
        let editorEl;
        try {
            editorEl = editor?.view?.dom || editor?.options?.element || null;
        } catch {
            editorEl = editor?.options?.element || null;
        }
        if (!editorEl) return;
        const parent = editorEl.closest('.editor-focus-mode') || editorEl.parentElement?.parentElement;
        if (!parent) return;
        parent.classList.toggle('narrador-mode-active', narrador.isNarratorMode && narrador.status !== 'idle');
    }, [narrador.isNarratorMode, narrador.status, editor]);

    // Atajos de teclado (solo activos en modo lectura)
    useNarradorKeyboard({
        enabled: isFocusMode,
        isPanelOpen,
        status: narrador.status,
        narrador,
        onClosePanel: () => {
            exitNarratorModeIfOn();
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
                        exitNarratorModeIfOn();
                        setIsPanelOpen(false);
                        narrador.stopNarration();
                    }}
                />
            )}
        </>
    );
};

export default Narrador;