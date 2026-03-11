import React, { useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import { Save, Trash2, Settings, Book, Upload, Image as ImageIcon, Loader2, Download, FileText, File as FilePdf, Globe, Users, BookOpen, AlignLeft, Check, CheckSquare, Square } from 'lucide-react';
import ExportService from '../services/ExportService';
import ConfirmModal from './ConfirmModal';

const SettingsView = () => {
    const { activeBook, updateBook, deleteBook, uploadCover, chapters, characters, worldItems } = useData();
    const toast = useToast();
    const [title, setTitle] = useState(activeBook?.title || '');
    const [description, setDescription] = useState(activeBook?.description || '');
    const [coverUrl, setCoverUrl] = useState(activeBook?.coverUrl || '');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    
    // Export States
    const [exportFormat, setExportFormat] = useState('pdf'); // 'pdf' or 'txt'
    const [exportScope, setExportScope] = useState('manuscript'); // 'manuscript', 'master', 'master_only'
    const [isExporting, setIsExporting] = useState(false);
    const [isGranular, setIsGranular] = useState(false);
    const [selectedChapters, setSelectedChapters] = useState(chapters.map(c => c.id));

    const toggleChapter = (id) => {
        if (selectedChapters.includes(id)) {
            setSelectedChapters(selectedChapters.filter(cid => cid !== id));
        } else {
            setSelectedChapters([...selectedChapters, id]);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const includeMaster = exportScope === 'master' || exportScope === 'master_only';
            const includeManuscript = exportScope !== 'master_only';
            
            let chaptersToExport = [];
            if (includeManuscript) {
                chaptersToExport = isGranular 
                    ? chapters.filter(c => selectedChapters.includes(c.id))
                    : chapters;
            }

            if (exportFormat === 'pdf') {
                await ExportService.exportAsPDF(activeBook, chaptersToExport, includeMaster, characters, worldItems);
            } else if (exportFormat === 'docx') {
                await ExportService.exportAsDOCX(activeBook, chaptersToExport, includeMaster, characters, worldItems);
            } else if (exportFormat === 'epub') {
                await ExportService.exportAsEPUB(activeBook, chaptersToExport, includeMaster, characters, worldItems);
            } else {
                await ExportService.exportAsTXT(activeBook, chaptersToExport, includeMaster, characters, worldItems);
            }
            toast.success(`¡Libro exportado como ${exportFormat.toUpperCase()}!`);
        } catch (error) {
            console.error("Export failed:", error);
            toast.error("Error al exportar el libro.");
        } finally {
            setIsExporting(false);
        }
    };

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

            {/* Export Section */}
            <div className="mt-12 bg-white dark:bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-[40px] p-10 shadow-xl overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Download size={120} className="text-indigo-600" />
                </div>
                
                <header className="mb-8">
                    <h2 className="text-3xl font-serif font-black text-[var(--text-main)]">Centro de Exportación</h2>
                    <p className="text-[var(--text-muted)] font-medium mt-1">Maqueta y descarga tu obra para compartirla o publicarla.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                    {/* Format Selection */}
                    <div className="space-y-4">
                        <label className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent-main)] block ml-1">
                            Formato de Salida
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <button 
                                onClick={() => setExportFormat('pdf')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-3xl border-2 transition-all ${exportFormat === 'pdf' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-[var(--border-main)] hover:border-indigo-200'}`}
                            >
                                <FilePdf size={24} className={exportFormat === 'pdf' ? 'text-indigo-600' : 'text-gray-400'} />
                                <span className={`font-black text-[10px] uppercase tracking-wider ${exportFormat === 'pdf' ? 'text-indigo-600' : 'text-[var(--text-muted)]'}`}>PDF</span>
                            </button>
                            <button 
                                onClick={() => setExportFormat('docx')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-3xl border-2 transition-all ${exportFormat === 'docx' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-[var(--border-main)] hover:border-indigo-200'}`}
                            >
                                <FileText size={24} className={exportFormat === 'docx' ? 'text-blue-600' : 'text-gray-400'} />
                                <span className={`font-black text-[10px] uppercase tracking-wider ${exportFormat === 'docx' ? 'text-blue-600' : 'text-[var(--text-muted)]'}`}>DOCX</span>
                            </button>
                            <button 
                                onClick={() => setExportFormat('epub')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-3xl border-2 transition-all ${exportFormat === 'epub' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-[var(--border-main)] hover:border-indigo-200'}`}
                            >
                                <BookOpen size={24} className={exportFormat === 'epub' ? 'text-emerald-600' : 'text-gray-400'} />
                                <span className={`font-black text-[10px] uppercase tracking-wider ${exportFormat === 'epub' ? 'text-emerald-600' : 'text-[var(--text-muted)]'}`}>EPUB</span>
                            </button>
                            <button 
                                onClick={() => setExportFormat('txt')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-3xl border-2 transition-all ${exportFormat === 'txt' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-[var(--border-main)] hover:border-indigo-200'}`}
                            >
                                <AlignLeft size={24} className={exportFormat === 'txt' ? 'text-indigo-600' : 'text-gray-400'} />
                                <span className={`font-black text-[10px] uppercase tracking-wider ${exportFormat === 'txt' ? 'text-indigo-600' : 'text-[var(--text-muted)]'}`}>TXT</span>
                            </button>
                        </div>
                    </div>

                    {/* Scope Selection */}
                    <div className="space-y-4">
                        <label className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent-main)] block ml-1">
                            Alcance de la Obra
                        </label>
                        <div className="space-y-3">
                            <button 
                                onClick={() => setExportScope('manuscript')}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${exportScope === 'manuscript' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-[var(--border-main)] hover:border-indigo-200'}`}
                            >
                                <div className={`p-2 rounded-lg ${exportScope === 'manuscript' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                                    <Book size={20} />
                                </div>
                                <div>
                                    <div className={`font-black text-sm ${exportScope === 'manuscript' ? 'text-indigo-600' : 'text-[var(--text-main)]'}`}>Solo Manuscrito</div>
                                    <div className="text-[10px] text-[var(--text-muted)] font-medium">Capítulos en orden cronológico.</div>
                                </div>
                            </button>

                            <button 
                                onClick={() => setExportScope('master')}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${exportScope === 'master' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-[var(--border-main)] hover:border-indigo-200'}`}
                            >
                                <div className={`p-2 rounded-lg ${exportScope === 'master' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                                    <Globe size={20} />
                                </div>
                                <div>
                                    <div className={`font-black text-sm ${exportScope === 'master' ? 'text-indigo-600' : 'text-[var(--text-main)]'}`}>Proyecto Maestro (Completo)</div>
                                    <div className="text-[10px] text-[var(--text-muted)] font-medium">Manuscrito + Biblia de Personajes + Notas del Mundo.</div>
                                </div>
                            </button>

                            <button 
                                onClick={() => setExportScope('master_only')}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${exportScope === 'master_only' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-[var(--border-main)] hover:border-indigo-200'}`}
                            >
                                <div className={`p-2 rounded-lg ${exportScope === 'master_only' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                                    <Users size={20} />
                                </div>
                                <div>
                                    <div className={`font-black text-sm ${exportScope === 'master_only' ? 'text-indigo-600' : 'text-[var(--text-main)]'}`}>Solo Biblia del Proyecto</div>
                                    <div className="text-[10px] text-[var(--text-muted)] font-medium">Solo personajes y elementos del mundo, sin capítulos.</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Granular Selection */}
                {exportScope !== 'master_only' && (
                    <div className="mt-8 border-t border-[var(--border-main)]/50 pt-8 animate-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-serif font-black text-[var(--text-main)]">Configuración Avanzada</h3>
                                <p className="text-sm text-[var(--text-muted)] font-medium">Selecciona partes específicas para exportar.</p>
                            </div>
                            <button 
                                onClick={() => setIsGranular(!isGranular)}
                                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm transition-all ${isGranular ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-muted)]'}`}
                            >
                                {isGranular ? <CheckSquare size={18} /> : <Square size={18} />}
                                Exportación Granular
                            </button>
                        </div>

                        {isGranular && (
                            <div className="bg-[var(--bg-app)] rounded-3xl p-6 border border-[var(--border-main)] max-h-60 overflow-y-auto scrollbar-hide grid grid-cols-1 md:grid-cols-2 gap-3">
                                {chapters.map((chapter) => (
                                    <button
                                        key={chapter.id}
                                        onClick={() => toggleChapter(chapter.id)}
                                        className={`flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${selectedChapters.includes(chapter.id) ? 'bg-white dark:bg-indigo-500/10 border-indigo-200 shadow-sm' : 'border-transparent opacity-50 grayscale hover:grayscale-0 hover:opacity-100'}`}
                                    >
                                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 ${selectedChapters.includes(chapter.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'}`}>
                                            {selectedChapters.includes(chapter.id) && <Check size={12} strokeWidth={4} />}
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <div className="font-black text-xs truncate">{chapter.title}</div>
                                            <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{chapter.isVolume ? 'Volumen' : 'Capítulo'}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-10 pt-8 border-t border-[var(--border-main)]/50 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3 text-[var(--text-muted)]">
                        <div className="flex -space-x-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 border-2 border-white dark:border-[var(--bg-editor)] flex items-center justify-center"><Book size={14} className="text-indigo-600" /></div>
                            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 border-2 border-white dark:border-[var(--bg-editor)] flex items-center justify-center"><Users size={14} className="text-purple-600" /></div>
                        </div>
                        <span className="text-xs font-bold uppercase tracking-widest">Listo para compilar</span>
                    </div>

                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="w-full sm:w-auto bg-[var(--text-main)] text-[var(--bg-app)] dark:bg-white dark:text-black px-12 py-5 rounded-[24px] font-black hover:scale-[1.05] active:scale-[0.95] transition-all shadow-xl flex items-center justify-center gap-3 text-lg disabled:opacity-50 disabled:grayscale"
                    >
                        {isExporting ? (
                            <Loader2 className="animate-spin" size={24} />
                        ) : (
                            <Download size={24} />
                        )}
                        {isExporting ? 'Maquetando...' : `Exportar en ${exportFormat.toUpperCase()}`}
                    </button>
                </div>
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
