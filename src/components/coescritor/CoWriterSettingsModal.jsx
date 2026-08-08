/**
 * CoWriterSettingsModal — Configuración del Coescritor.
 * Ajusta el umbral de condensación de voz (resumen_hablado).
 */
import React, { useState, useEffect } from 'react';
import { Volume2, Sparkles } from 'lucide-react';
import Modal from '../Modal';

const PRESETS = [
    { label: 'Breve', value: 120, desc: '~45 seg · esencial' },
    { label: 'Normal', value: 180, desc: '~1 min · recomendado' },
    { label: 'Detallado', value: 280, desc: '~1.5-2 min · casi todo' },
];

const CoWriterSettingsModal = ({ isOpen, onClose, thresholdWords, setThresholdWords }) => {
    const [localValue, setLocalValue] = useState(thresholdWords || 180);

    useEffect(() => {
        if (isOpen) setLocalValue(thresholdWords || 180);
    }, [isOpen, thresholdWords]);

    const apply = (v) => {
        const num = Number(v) || 180;
        setThresholdWords(num);
        setLocalValue(num);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Configuración del Coescritor" size="md">
            <div className="p-6 space-y-6 font-sans max-h-[70vh] overflow-y-auto scrollbar-hide">
                <p className="text-[11px] text-[var(--text-muted)] font-medium leading-relaxed">
                    Si una respuesta de DeepSeek supera el umbral de palabras, se condensa con la función{' '}
                    <span className="text-purple-500 font-bold">resumen_hablado</span> antes de narrarla en voz alta.
                </p>

                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                        <Volume2 size={12} className="text-purple-500" />
                        Umbral de narración
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                        {PRESETS.map(p => (
                            <button
                                key={p.value}
                                onClick={() => apply(p.value)}
                                className={`px-3 py-3 rounded-xl border text-left transition-all cursor-pointer ${
                                    thresholdWords === p.value
                                        ? 'bg-purple-500/10 border-purple-500/50 text-[var(--text-main)]'
                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-purple-500/30'
                                }`}
                            >
                                <span className="block text-[10px] font-black uppercase tracking-wider">{p.label}</span>
                                <span className="block text-[9px] opacity-70 mt-0.5">{p.value} palabras</span>
                                <span className="block text-[8px] opacity-50 mt-0.5">{p.desc}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={50}
                            max={600}
                            value={localValue}
                            onChange={(e) => setLocalValue(e.target.value)}
                            onBlur={() => apply(localValue)}
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 text-xs font-mono focus:ring-2 focus:ring-purple-500/20 outline-none text-[var(--text-main)]"
                            placeholder="180"
                        />
                        <button
                            onClick={() => apply(localValue)}
                            className="px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-purple-600/20 active:scale-[0.99] cursor-pointer shrink-0"
                        >
                            Aplicar
                        </button>
                    </div>
                    <p className="text-[9px] text-[var(--text-muted)] font-medium italic">
                        Los textos menores al umbral se narran tal cual. Los mayores se condensan a ese número de palabras.
                    </p>
                </div>

                <div className="pt-4 border-t border-[var(--border-main)] space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                        <Sparkles size={12} className="text-purple-500" />
                        Claves usadas
                    </label>
                    <p className="text-[9px] text-[var(--text-muted)] font-medium leading-relaxed">
                        Usa la <span className="text-indigo-500 font-bold">DeepSeek API Key</span> para ejecutar comandos y la{' '}
                        <span className="text-purple-500 font-bold">Gemini Live API Key + voz del Narrador</span> para narrar resultados.
                        Configúralas en <span className="text-[var(--text-main)] font-bold">Ajustes</span>.
                    </p>
                </div>
            </div>
        </Modal>
    );
};

export default CoWriterSettingsModal;