import React from 'react'
import Modal from '../../Modal'
import { Sliders } from 'lucide-react'

const ReadingSettingsModal = ({
    isOpen,
    onClose,
    readingFont,
    setReadingFont,
    readingWidth,
    setReadingWidth,
    readingTextSize,
    setReadingTextSize
}) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Configuración de Lectura">
            <div className="p-8 space-y-6 font-sans">
                <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">Personaliza el aspecto visual del editor en modo lectura para una máxima comodidad de escritura:</p>
                
                {/* Font Selection */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest flex items-center gap-1.5"><Sliders size={12} /> Tipo de Letra</label>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { label: 'Sans Serif (Arial)', value: 'font-[Arial,sans-serif]' },
                            { label: 'Serif (Georgia)', value: 'font-[Georgia,serif]' },
                            { label: 'Monospace', value: 'font-mono' },
                            { label: 'System UI', value: 'font-sans' }
                        ].map(font => (
                            <button
                                key={font.value}
                                onClick={() => setReadingFont(font.value)}
                                className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border ${readingFont === font.value
                                    ? 'bg-[var(--accent-main)] text-white border-[var(--accent-main)] shadow-md'
                                    : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)]'
                                    }`}
                            >
                                {font.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Text Width Selection */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Ancho del Párrafo</label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { label: 'Slim', value: 'sm' },
                            { label: 'Medium', value: 'md' },
                            { label: 'Large', value: 'lg' },
                            { label: 'Full', value: 'full' }
                        ].map(width => (
                            <button
                                key={width.value}
                                onClick={() => setReadingWidth(width.value)}
                                className={`px-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border ${readingWidth === width.value
                                    ? 'bg-[var(--accent-main)] text-white border-[var(--accent-main)] shadow-md'
                                    : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)]'
                                    }`}
                            >
                                {width.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Text Size Selection */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Tamaño del Texto</label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { label: 'Pequeño', value: 'sm' },
                            { label: 'Normal', value: 'base' },
                            { label: 'Grande', value: 'lg' },
                            { label: 'Extra G.', value: 'xl' }
                        ].map(size => (
                            <button
                                key={size.value}
                                onClick={() => setReadingTextSize(size.value)}
                                className={`px-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border ${readingTextSize === size.value
                                    ? 'bg-[var(--accent-main)] text-white border-[var(--accent-main)] shadow-md'
                                    : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)]'
                                    }`}
                            >
                                {size.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-[var(--border-main)]">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md cursor-pointer"
                    >
                        Listo
                    </button>
                </div>
            </div>
        </Modal>
    )
}

export default ReadingSettingsModal
