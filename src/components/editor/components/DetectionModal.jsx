import React from 'react'
import Modal from '../../Modal'

const DetectionModal = ({
    isDetectionModeModalOpen,
    onDetectionModeClose,
    onRunDetection,

    isDetectionModalOpen,
    onDetectionClose,
    detectedCharacters,
    highlightedCharId,
    setHighlightedCharId,
    newPreviewHtml,
    onApplyToDocument
}) => {
    return (
        <>
            {/* Modal de confirmación de detección de personajes */}
            <Modal 
                isOpen={isDetectionModalOpen} 
                onClose={onDetectionClose} 
                title="Personajes Detectados"
            >
                <div className="p-8 space-y-6 font-sans">
                    <div className="space-y-4">
                        <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">Se han identificado menciones de personajes en tu texto. Selecciona uno para previsualizar los cambios:</p>
                        <div className="flex flex-wrap gap-2 py-1">
                            {detectedCharacters.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => setHighlightedCharId(highlightedCharId === char.id ? null : char.id)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border ${highlightedCharId === char.id
                                        ? 'bg-[var(--accent-main)] text-white border-[var(--accent-main)] shadow-lg scale-105'
                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)]'
                                        }`}
                                >
                                    {char.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Vista Previa de Anotaciones</label>
                        <div
                            className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl p-6 max-h-48 overflow-y-auto text-sm prose prose-sm shadow-inner"
                            dangerouslySetInnerHTML={{
                                __html: (() => {
                                    let html = newPreviewHtml;
                                    if (highlightedCharId) {
                                        const regex = new RegExp(`<span data-char-id="${highlightedCharId}">(.*?)</span>`, 'gi');
                                        html = html.replace(regex, '<mark style="background:linear-gradient(135deg,#6366f1 0%,#a855f7 100%);color:white;padding:1px 4px;border-radius:4px;font-weight:700;">$1</mark>');
                                        html = html.replace(/<span data-char-id/g, '<span style="color:var(--accent-main);font-weight:600;border-bottom:1px dashed var(--accent-main);" data-char-id');
                                    } else {
                                        html = html.replace(/<span data-char-id/g, '<span style="color:var(--accent-main);font-weight:600;border-bottom:1px dashed var(--accent-main);" data-char-id');
                                    }
                                    return html;
                                })()
                            }}
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={onDetectionClose}
                            className="px-6 py-3 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors text-sm cursor-pointer"
                        >
                            Descartar
                        </button>
                        <button
                            onClick={onApplyToDocument}
                            className="px-8 py-3 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 cursor-pointer"
                        >
                            Aplicar al Documento
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal de selección de modo de detección */}
            <Modal 
                isOpen={isDetectionModeModalOpen} 
                onClose={onDetectionModeClose} 
                title="Modo de Detección"
            >
                <div className="p-8 space-y-6 font-sans">
                    <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">Personaliza el motor de búsqueda para encontrar los nombres de tus personajes en el manuscrito:</p>
                    <div className="grid grid-cols-1 gap-4">
                        <button
                            onClick={() => onRunDetection('full')}
                            className="p-6 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left group shadow-sm cursor-pointer"
                        >
                            <div className="font-black text-xs uppercase tracking-widest text-[var(--text-main)] mb-2 group-hover:text-indigo-600 transition-colors">Solo nombres completos</div>
                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Busca coincidencias exactas. Ej: "Claire Wilson" solo detectará el nombre completo.</p>
                        </button>
                        <button
                            onClick={() => onRunDetection('simple')}
                            className="p-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500 hover:bg-indigo-500/10 transition-all text-left group shadow-md cursor-pointer"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="font-black text-xs uppercase tracking-widest text-indigo-600 transition-colors">Completos + Simples</div>
                                <span className="text-[9px] bg-indigo-600 text-white rounded-full px-2.5 py-1 font-black uppercase tracking-tighter shadow-sm">Recomendado</span>
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Detecta nombres completos y también por separado. Ej: "Claire Wilson" y también "Claire".</p>
                        </button>
                    </div>
                    <div className="flex justify-end pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={onDetectionModeClose}
                            className="px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-all cursor-pointer"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    )
}

export default DetectionModal
