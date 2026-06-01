import React from 'react'
import Modal from '../../Modal'
import { Trash2, Pencil, Check, X } from 'lucide-react'

const InlineNoteModal = ({
    isNoteModalOpen,
    onNoteModalClose,
    noteText,
    setNoteText,
    onSaveNote,

    isViewNoteModalOpen,
    onViewNoteModalClose,
    viewingNote,
    isEditingNote,
    setIsEditingNote,
    editNoteText,
    setEditNoteText,
    onUpdateNote,
    onDeleteNote
}) => {
    return (
        <>
            {/* Modal: Crear Nota Inline */}
            <Modal isOpen={isNoteModalOpen} onClose={onNoteModalClose} title="Añadir Nota al Manuscrito">
                <div className="p-8 space-y-6 font-sans">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Contenido de la Nota</label>
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Escribe comentarios, recordatorios o ideas de edición sobre el fragmento seleccionado..."
                            className="w-full h-32 p-4 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl focus:outline-none focus:border-amber-500 text-sm leading-relaxed text-[var(--text-main)] resize-none"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={onNoteModalClose}
                            className="px-6 py-3 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors text-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={onSaveNote}
                            disabled={!noteText.trim()}
                            className="px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            Guardar Nota
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal: Ver/Editar Nota Inline */}
            <Modal isOpen={isViewNoteModalOpen} onClose={onViewNoteModalClose} title="Nota al Pie">
                <div className="p-8 space-y-6 font-sans">
                    {viewingNote && (
                        <>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Texto Resaltado</label>
                                <div className="p-4 bg-[var(--bg-editor)]/40 border border-[var(--border-main)]/50 rounded-2xl text-xs italic text-[var(--text-muted)] leading-relaxed">
                                    "{viewingNote.highlightedText}"
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Anotación</label>
                                    {!isEditingNote && (
                                        <button
                                            onClick={() => setIsEditingNote(true)}
                                            className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-600 tracking-wider flex items-center gap-1 cursor-pointer"
                                        >
                                            <Pencil size={10} /> Editar
                                        </button>
                                    )}
                                </div>

                                {isEditingNote ? (
                                    <textarea
                                        value={editNoteText}
                                        onChange={(e) => setEditNoteText(e.target.value)}
                                        className="w-full h-32 p-4 bg-[var(--bg-editor)] border border-indigo-500 rounded-2xl focus:outline-none text-sm leading-relaxed text-[var(--text-main)] resize-none"
                                    />
                                ) : (
                                    <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-sm leading-relaxed text-[var(--text-main)] whitespace-pre-wrap">
                                        {viewingNote.noteText}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row justify-between gap-3 pt-6 border-t border-[var(--border-main)]">
                                <button
                                    onClick={() => onDeleteNote(viewingNote.noteId)}
                                    className="px-5 py-3 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/5 transition-all text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Trash2 size={14} /> Eliminar Nota
                                </button>

                                <div className="flex justify-end gap-3">
                                    {isEditingNote ? (
                                        <>
                                            <button
                                                onClick={() => setIsEditingNote(false)}
                                                className="px-5 py-3 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors text-xs uppercase tracking-widest cursor-pointer"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={onUpdateNote}
                                                disabled={!editNoteText.trim()}
                                                className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                            >
                                                <Check size={14} /> Guardar
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={onViewNoteModalClose}
                                            className="px-8 py-3 bg-[var(--bg-editor)] border border-[var(--border-main)] hover:border-[var(--accent-main)] text-[var(--text-main)] rounded-xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer"
                                        >
                                            Cerrar
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </>
    )
}

export default InlineNoteModal
