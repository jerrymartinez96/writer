import React, { useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import { Save, Trash2, Settings, Book, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

const SettingsView = () => {
    const { activeBook, updateBook, deleteBook, uploadCover } = useData();
    const toast = useToast();
    const [title, setTitle] = useState(activeBook?.title || '');
    const [description, setDescription] = useState(activeBook?.description || '');
    const [coverUrl, setCoverUrl] = useState(activeBook?.coverUrl || '');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const url = await uploadCover(file);
            setCoverUrl(url);
            toast.success("¡Imagen subida correctamente!");
        } catch (error) {
            console.error("Upload failed:", error);
            toast.error("Error al subir la imagen.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = (e) => {
        e.preventDefault();
        updateBook({ title, description, coverUrl });
        toast.success("¡Ajustes del libro guardados!");
    };

    return (
        <div className="max-w-5xl mx-auto p-10 animate-in fade-in duration-500 pb-20">
            <header className="mb-12 flex items-center justify-between">
                <div>
                    <h1 className="text-5xl font-serif font-black text-[var(--text-main)] tracking-tight">Ajustes de la Obra</h1>
                    <p className="text-[var(--text-muted)] mt-2 text-lg font-medium opacity-80">Personaliza la identidad visual y descriptiva de tu libro.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                {/* Left Side: Book Identity */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="relative group">
                        <label className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent-main)] mb-3 block">
                            Identidad Visual
                        </label>
                        
                        {/* Book Preview */}
                        <div className="aspect-[2/3] w-full relative rounded-r-xl overflow-hidden shadow-2xl bg-[var(--bg-app)] border border-[var(--border-main)] group-hover:shadow-indigo-500/20 transition-all duration-500 transform-gpu hover:scale-[1.02]">
                            <div className="absolute top-0 bottom-0 left-0 w-8 bg-gradient-to-r from-black/20 to-transparent z-10 pointer-events-none"></div>
                            {coverUrl ? (
                                <img src={coverUrl} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-indigo-50/50 to-purple-50/50">
                                    <ImageIcon size={48} className="text-indigo-200 mb-4" />
                                    <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Sin Portada</p>
                                </div>
                            )}

                            {isUploading && (
                                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-white">
                                    <Loader2 className="animate-spin mb-3" size={32} />
                                    <span className="text-xs font-black uppercase tracking-widest">Subiendo...</span>
                                </div>
                            )}
                        </div>

                        {/* Upload Controls */}
                        <div className="mt-6 space-y-3">
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-white border border-[var(--border-main)] rounded-2xl font-black text-sm text-[var(--text-main)] hover:bg-gray-50 transition-all shadow-sm active:scale-95"
                            >
                                <Upload size={18} className="text-indigo-500" />
                                Sustituir Portada
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                className="hidden" 
                                accept="image/*"
                                onChange={handleFileUpload}
                            />
                            
                            <div className="relative">
                                <input 
                                    type="url"
                                    placeholder="O pega una URL..."
                                    value={coverUrl}
                                    onChange={(e) => setCoverUrl(e.target.value)}
                                    className="w-full bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl pl-10 pr-4 py-3 text-[10px] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner"
                                />
                                <ImageIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            </div>
                        </div>
                        
                        <p className="mt-4 text-[10px] text-center font-bold text-indigo-500/60 uppercase tracking-widest leading-relaxed">
                            Relación 2:3 recomendada<br/>(Ej: 600x900px)
                        </p>
                    </div>
                </div>

                {/* Right Side: Primary Info */}
                <form onSubmit={handleSave} className="lg:col-span-8 space-y-8 bg-[var(--bg-editor)] border border-[var(--border-main)] p-10 rounded-[40px] shadow-2xl relative">
                    <div className="space-y-4">
                        <label className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text-muted)] block ml-2">
                            Título de la obra
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl px-8 py-5 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all text-2xl font-serif font-black shadow-inner"
                        />
                    </div>

                    <div className="space-y-4">
                        <label className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text-muted)] block ml-2">
                            Sinopsis Narrativa
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={8}
                            className="w-full bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl px-8 py-6 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all text-lg leading-relaxed shadow-inner scrollbar-hide font-medium"
                            placeholder="Describe el núcleo de tu historia, sus conflictos y su atmósfera..."
                        />
                    </div>

                    <div className="pt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-t border-[var(--border-main)]/50 mt-4">
                        <button
                            type="submit"
                            disabled={isUploading}
                            className="w-full sm:flex-1 bg-indigo-600 text-white px-10 py-5 rounded-[24px] font-black hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 text-lg group disabled:grayscale"
                        >
                            <Save size={24} className="group-hover:rotate-12 transition-transform" />
                            Guardar Cambios
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsConfirmOpen(true)}
                            className="w-full sm:w-auto p-5 text-red-500 hover:bg-red-500/10 rounded-[24px] transition-all border-2 border-red-500/10 flex items-center justify-center gap-2 group"
                            title="Descartar obra definitivamente"
                        >
                            <Trash2 size={24} className="group-hover:scale-110 transition-transform" />
                            <span className="font-bold sm:hidden">Cerrar Proyecto</span>
                        </button>
                    </div>
                </form>
            </div>

            {/* Bottom Tip */}
            <div className="mt-16 p-10 border-2 border-dashed border-indigo-500/20 rounded-[40px] bg-indigo-50/20 dark:bg-indigo-500/5 animate-in slide-in-from-bottom-4 duration-1000">
                <div className="flex flex-col sm:flex-row items-center gap-8 text-center sm:text-left">
                    <div className="p-5 bg-indigo-600 rounded-[20px] shadow-2xl shadow-indigo-600/30 transform -rotate-12">
                        <Book size={32} className="text-white" />
                    </div>
                    <div>
                        <h4 className="font-serif font-black text-2xl text-indigo-950 dark:text-indigo-200">Consejo de Autor</h4>
                        <p className="text-lg text-indigo-900/60 dark:text-indigo-400 font-medium leading-relaxed mt-2 max-w-2xl">
                            "Tu título es la carta de presentación, pero tu sinopsis es la promesa que le haces al lector. Mantenla enfocada en el conflicto principal."
                        </p>
                    </div>
                </div>
            </div>

            <ConfirmModal 
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={() => deleteBook(activeBook.id)}
                title="¿Eliminar proyecto?"
                message="Esta acción borrará todos los capítulos, personajes y notas de esta obra de forma permanente. ¿Estás seguro de que quieres continuar?"
                confirmText="Sí, borrar libro"
                type="danger"
            />
        </div>
    );
};

export default SettingsView;
