import React from 'react'
import Modal from '../../Modal'
import { Folder, Users, Layers, AlignLeft } from 'lucide-react'

const ChapterInfoModal = ({
    isOpen,
    onClose,
    activeDocInfo,
    activeBook
}) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Estadísticas de Escritura">
            <div className="p-8 space-y-6 font-sans">
                {activeDocInfo ? (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl flex flex-col justify-between h-28 shadow-sm">
                                <span className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest flex items-center gap-1.5"><Layers size={12} className="text-indigo-500" /> Palabras</span>
                                <span className="text-3xl font-black text-[var(--text-main)] font-serif leading-none">{activeDocInfo.wordCount}</span>
                            </div>
                            <div className="p-5 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl flex flex-col justify-between h-28 shadow-sm">
                                <span className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest flex items-center gap-1.5"><AlignLeft size={12} className="text-purple-500" /> Caracteres</span>
                                <span className="text-3xl font-black text-[var(--text-main)] font-serif leading-none">{activeDocInfo.charCount}</span>
                            </div>
                        </div>

                        <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl space-y-4 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-md">
                                    <Folder size={16} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase text-indigo-500/80 tracking-wider">Libro Activo</span>
                                    <span className="text-sm font-bold text-[var(--text-main)] truncate max-w-xs">{activeBook?.title || 'Mi Manuscrito'}</span>
                                </div>
                            </div>

                            <div className="w-full h-px bg-[var(--border-main)] opacity-30"></div>

                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-purple-500 text-white flex items-center justify-center shrink-0 shadow-md">
                                    <Users size={16} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase text-purple-500/80 tracking-wider">Sección / Ubicación</span>
                                    <span className="text-sm font-bold text-[var(--text-main)] truncate max-w-xs">{activeDocInfo.volumeLabel || 'Standalone'}</span>
                                </div>
                            </div>

                            <div className="w-full h-px bg-[var(--border-main)] opacity-30"></div>

                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md">
                                    <AlignLeft size={16} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase text-emerald-500/80 tracking-wider">Documento Seleccionado</span>
                                    <span className="text-sm font-bold text-[var(--text-main)] truncate max-w-xs">{activeDocInfo.chapterLabel}</span>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-[var(--text-muted)] italic text-center py-4">No hay información activa sobre el capítulo.</p>
                )}

                <div className="flex justify-end pt-4 border-t border-[var(--border-main)]">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md cursor-pointer"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </Modal>
    )
}

export default ChapterInfoModal
