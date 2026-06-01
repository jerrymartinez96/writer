import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, X, Info } from 'lucide-react'

const CharacterCardModal = ({ isOpen, onClose, characterId, characters }) => {
    const [isCardFlipped, setIsCardFlipped] = useState(false)
    const [currentImageIndex, setCurrentImageIndex] = useState(0)

    if (!isOpen || !characterId) return null

    const char = characters.find(c => c.id === characterId)
    if (!char) return null

    const hasImages = char.images && char.images.length > 0
    const images = hasImages ? char.images : ['https://via.placeholder.com/400x600?text=Sin+Imagen']

    return (
        <div 
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" 
            onClick={onClose}
        >
            <div
                className="relative w-[22rem] h-[34rem] perspective-1000 animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${isCardFlipped ? 'rotate-y-180' : ''}`}>
                    {/* Frente: Carrusel de Imágenes */}
                    <div className="absolute inset-0 bg-[var(--bg-app)] rounded-3xl shadow-2xl border border-[var(--border-main)] overflow-hidden backface-hidden flex flex-col ring-1 ring-black/5 dark:ring-white/10">
                        <div className="flex-1 relative group bg-black min-h-0 w-full overflow-hidden">
                            <img
                                src={images[currentImageIndex]}
                                alt={char.name}
                                className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-700 group-hover:scale-105"
                            />
                            {/* Gradiente sutil Superior e Inferior */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-black/60 pointer-events-none"></div>

                            {hasImages && images.length > 1 && (
                                <>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1)); }}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full transition-all opacity-0 group-hover:opacity-100 shadow-lg cursor-pointer"
                                    >
                                        <ChevronLeft size={20} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1)); }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full transition-all opacity-0 group-hover:opacity-100 shadow-lg cursor-pointer"
                                    >
                                        <ChevronRight size={20} />
                                    </button>

                                    {/* Indicadores flotantes iOS style */}
                                    <div className="absolute bottom-[20px] left-0 right-0 flex justify-center gap-2">
                                        {images.map((_, i) => (
                                            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === currentImageIndex ? 'w-5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'w-1.5 bg-white/40 hover:bg-white/60'}`} />
                                        ))}
                                    </div>
                                </>
                            )}

                            <div className="absolute top-4 right-4">
                                <button onClick={onClose} className="p-2 bg-black/30 hover:bg-red-500/80 backdrop-blur-md text-white rounded-full transition-all shadow-md cursor-pointer">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="absolute bottom-[45px] left-6 right-6 pointer-events-none flex flex-col justify-end">
                                {char.role && (
                                    <span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#818cf8] mb-1.5 drop-shadow-md">{char.role}</span>
                                )}
                                <h3 className="text-3xl font-black font-serif text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{char.name}</h3>
                            </div>
                        </div>

                        <div className="p-4 bg-[var(--bg-app)]/95 backdrop-blur-md shrink-0 border-t border-[var(--border-main)]">
                            <button
                                onClick={() => setIsCardFlipped(true)}
                                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-[var(--accent-main)] hover:from-indigo-600 hover:to-indigo-500 text-white text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 hover:scale-[1.02] active:scale-95 cursor-pointer"
                            >
                                <Info size={18} /> Ver Expediente
                            </button>
                        </div>
                    </div>

                    {/* Reverso: Detalles */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-app)] to-[var(--bg-editor)] rounded-3xl shadow-2xl border border-[var(--border-main)] overflow-hidden backface-hidden rotate-y-180 flex flex-col p-2 ring-1 ring-black/5 dark:ring-white/10">
                        <div className="relative flex-1 bg-[var(--bg-app)] rounded-[1.25rem] border border-[var(--border-main)]/50 flex flex-col overflow-hidden">

                            <div className="p-6 pb-4 shrink-0 flex items-start justify-between border-b border-[var(--border-main)]/50 bg-[var(--bg-editor)]/50">
                                <div>
                                    <h3 className="text-2xl font-black font-serif text-[var(--text-main)] leading-tight">{char.name}</h3>
                                    {char.role && <div className="text-xs font-bold uppercase tracking-widest text-[#818cf8] mt-1">{char.role}</div>}
                                </div>
                                <button onClick={onClose} className="p-2 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors shrink-0 -mt-1 -mr-1 cursor-pointer">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-6 flex-1 overflow-y-auto w-full scrollbar-hide">
                                <div className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap font-sans">
                                    {char.description ? char.description : <span className="text-[var(--text-muted)] italic">No hay biografía disponible para este perfil.</span>}
                                </div>
                            </div>

                            <div className="p-4 bg-[var(--bg-editor)]/50 border-t border-[var(--border-main)]/50 shrink-0">
                                <button
                                    onClick={() => setIsCardFlipped(false)}
                                    className="w-full py-3 bg-[var(--bg-app)] hover:bg-[var(--accent-soft)] text-[var(--accent-main)] border border-[var(--accent-main)]/35 text-xs font-black uppercase tracking-widest rounded-2xl transition-all cursor-pointer"
                                >
                                    Volver al Frente
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CharacterCardModal
