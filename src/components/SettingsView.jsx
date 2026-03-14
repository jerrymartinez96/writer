import React, { useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import { Save, Trash2, Settings, Book, Upload, Image as ImageIcon, Loader2, Download, FileText, File as FilePdf, Globe, Users, BookOpen, AlignLeft, Check, CheckSquare, Square } from 'lucide-react';
import ExportService from '../services/ExportService';
import ConfirmModal from './ConfirmModal';

const SettingsView = () => {
    const { activeBook, updateBook, deleteBook, uploadCover, chapters, characters, worldItems, profile, updateProfile } = useData();
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
        <div className="max-w-4xl mx-auto p-8 lg:p-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32">
            <header className="mb-16">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
                    <Settings size={12} /> Configuración Global
                </div>
                <h1 className="text-4xl md:text-5xl font-serif font-black text-[var(--text-main)] tracking-tight mb-4">
                    Ajustes de la Obra
                </h1>
                <p className="text-[17px] text-[var(--text-muted)] max-w-2xl leading-relaxed font-medium">
                    Define la identidad de tu libro, gestiona su estética y prepara el manuscrito para su publicación final.
                </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                {/* Left Side: Book Identity */}
                <div className="lg:col-span-4">
                    <div className="sticky top-8 space-y-8">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-50 mb-4 block ml-1">
                                Portada del Libro
                            </label>
                            
                            <div className="relative group perspective-1000">
                                <div className="aspect-[2/3] w-full relative rounded-r-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-[var(--bg-app)] border border-[var(--border-main)] transition-all duration-700 transform-gpu group-hover:rotate-y-12 group-hover:shadow-indigo-500/30">
                                    <div className="absolute top-0 bottom-0 left-0 w-10 bg-gradient-to-r from-black/30 to-transparent z-10 pointer-events-none"></div>
                                    <div className="absolute top-0 bottom-0 left-1 w-[1px] bg-white/10 z-10"></div>
                                    {coverUrl ? (
                                        <img src={coverUrl} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[var(--accent-soft)]/50 to-transparent">
                                            <ImageIcon size={40} className="text-indigo-500/30 mb-4" />
                                            <p className="text-[10px] font-black text-indigo-500/40 uppercase tracking-widest">Esperando Imagen</p>
                                        </div>
                                    )}

                                    {isUploading && (
                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-20 flex flex-col items-center justify-center text-white">
                                            <Loader2 className="animate-spin mb-3 text-indigo-400" size={32} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Procesando...</span>
                                        </div>
                                    )}
                                </div>

                                <div className="absolute -bottom-4 -right-4 flex gap-2">
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="p-4 bg-indigo-600 text-white rounded-2xl shadow-xl hover:scale-110 active:scale-95 transition-all group/btn"
                                        title="Subir archivo"
                                    >
                                        <Upload size={20} className="group-hover/btn:rotate-12 transition-transform" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-10 space-y-4">
                                <div className="relative group">
                                    <input 
                                        type="url"
                                        placeholder="URL de la imagen..."
                                        value={coverUrl}
                                        onChange={(e) => setCoverUrl(e.target.value)}
                                        className="w-full bg-[var(--bg-app)]/50 border border-[var(--border-main)] rounded-2xl pl-10 pr-4 py-3.5 text-[11px] font-serif focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-[var(--bg-app)] transition-all"
                                    />
                                    <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] opacity-50" />
                                </div>
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    className="hidden" 
                                    accept="image/*"
                                    onChange={handleFileUpload}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSave} className="lg:col-span-8 space-y-10">
                    <div className="space-y-6 bg-[var(--bg-editor)] border border-[var(--border-main)] p-8 md:p-10 rounded-[32px] shadow-sm">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 block ml-1">
                                Título del Proyecto
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-xl font-serif font-black"
                                placeholder="Escribe el nombre de tu obra..."
                            />
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 block ml-1">
                                Sinopsis Narrativa
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={8}
                                className="w-full bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl px-6 py-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-base leading-relaxed scrollbar-hide font-medium"
                                placeholder="Escribe un resumen que capture la esencia de tu historia..."
                            />
                        </div>

                        <div className="pt-6 flex flex-col sm:flex-row items-center gap-4">
                            <button
                                type="submit"
                                disabled={isUploading}
                                className="w-full sm:flex-1 bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
                            >
                                <Save size={20} />
                                Guardar Información
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsConfirmOpen(true)}
                                className="w-full sm:w-auto px-8 py-4 text-red-500 hover:bg-red-500/5 rounded-2xl transition-all border border-red-500/20 font-black text-sm flex items-center justify-center gap-2"
                            >
                                <Trash2 size={20} />
                                Eliminar Obra
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Export Section */}
            <div className="mt-16 space-y-8">
                <header>
                    <h2 className="text-3xl font-serif font-black text-[var(--text-main)]">Exportación y Publicación</h2>
                    <p className="text-[var(--text-muted)] font-medium mt-1">Configura la maqueta de salida para tu manuscrito final.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Format Card */}
                    <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] p-6 rounded-[24px] space-y-6 shadow-sm">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 block">Formato</label>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { id: 'pdf', icon: FilePdf, label: 'PDF' },
                                { id: 'docx', icon: FileText, label: 'DOCX' },
                                { id: 'txt', icon: AlignLeft, label: 'TXT' }
                            ].map(fmt => (
                                <button 
                                    key={fmt.id}
                                    onClick={() => setExportFormat(fmt.id)}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${exportFormat === fmt.id ? 'bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-indigo-500/30'}`}
                                >
                                    <fmt.icon size={20} />
                                    <span className="font-black text-[9px] uppercase tracking-widest">{fmt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scope Card */}
                    <div className="md:col-span-2 bg-[var(--bg-editor)] border border-[var(--border-main)] p-6 rounded-[24px] space-y-6 shadow-sm">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 block">Contenido Incluido</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                                { id: 'manuscript', icon: Book, title: 'Solo Manuscrito', sub: 'Capítulos cronológicos' },
                                { id: 'master', icon: Globe, title: 'Proyecto Completo', sub: 'Manuscrito + Biblia + Notas' },
                                { id: 'master_only', icon: Users, title: 'Solo Biblia', sub: 'Personajes y Elementos' }
                            ].map(scope => (
                                <button 
                                    key={scope.id}
                                    onClick={() => setExportScope(scope.id)}
                                    className={`flex items-start gap-4 p-4 rounded-2xl border transition-all text-left ${exportScope === scope.id ? 'bg-indigo-500/5 border-indigo-500/30 ring-1 ring-indigo-500/20' : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-indigo-500/20'}`}
                                >
                                    <div className={`p-2.5 rounded-xl ${exportScope === scope.id ? 'bg-indigo-500 text-white' : 'bg-[var(--bg-editor)] text-[var(--text-muted)]'}`}>
                                        <scope.icon size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-black text-xs ${exportScope === scope.id ? 'text-indigo-600' : 'text-[var(--text-main)]'}`}>{scope.title}</div>
                                        <div className="text-[10px] text-[var(--text-muted)] font-medium truncate">{scope.sub}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Chapters Selection */}
                {exportScope !== 'master_only' && (
                    <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] p-8 rounded-[24px] space-y-8 animate-in slide-in-from-top-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-serif font-black text-[var(--text-main)]">Selección de Capítulos</h3>
                                <p className="text-[13px] text-[var(--text-muted)] font-medium">Personaliza qué partes del manuscrito quieres exportar.</p>
                            </div>
                            <button 
                                onClick={() => setIsGranular(!isGranular)}
                                className={`flex items-center gap-3 px-6 py-3 rounded-xl font-black text-xs transition-all ${isGranular ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-muted)] hover:bg-[var(--bg-app)]/80'}`}
                            >
                                {isGranular ? <CheckSquare size={16} /> : <Square size={16} />}
                                Selección Manual
                            </button>
                        </div>

                        {isGranular && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-2 scrollbar-hide py-2">
                                {chapters.map((chapter) => (
                                    <button
                                        key={chapter.id}
                                        onClick={() => toggleChapter(chapter.id)}
                                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${selectedChapters.includes(chapter.id) ? 'bg-indigo-500/5 border-indigo-500/30' : 'bg-[var(--bg-app)] border-transparent opacity-60 hover:opacity-100 hover:border-[var(--border-main)]'}`}
                                    >
                                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-all ${selectedChapters.includes(chapter.id) ? 'bg-indigo-600 border-indigo-600 text-white scale-110' : 'border-[var(--border-main)]'}`}>
                                            {selectedChapters.includes(chapter.id) && <Check size={12} strokeWidth={4} />}
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <div className="font-black text-xs truncate">{chapter.title}</div>
                                            <div className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-[0.1em] opacity-60">{chapter.isVolume ? 'Volumen' : 'Capítulo'}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-col md:flex-row items-center justify-between gap-8 pt-4">
                    <div className="flex items-center gap-4 text-[var(--text-muted)] px-4">
                        <div className="flex -space-x-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-500 text-white border-4 border-[var(--bg-editor)] flex items-center justify-center shadow-lg"><Book size={18} /></div>
                            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white border-4 border-[var(--bg-editor)] flex items-center justify-center shadow-lg"><Check size={18} /></div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Estado de Salida</span>
                            <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest">Listo para compilar</span>
                        </div>
                    </div>

                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="w-full md:w-auto min-w-[300px] bg-[var(--text-main)] text-[var(--bg-app)] dark:bg-white dark:text-black px-12 py-5 rounded-[24px] font-black hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-black/10 flex items-center justify-center gap-3 text-lg disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 className="animate-spin" size={24} /> : <Download size={24} />}
                        {isExporting ? 'Maquetando...' : `Generar ${exportFormat.toUpperCase()}`}
                    </button>
                </div>
            </div>


            {/* Bottom Tip */}
            <div className="mt-20 p-8 md:p-12 bg-indigo-500/5 border border-indigo-500/10 rounded-[32px] relative overflow-hidden group">
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/10 blur-[80px] rounded-full group-hover:bg-indigo-500/20 transition-all duration-1000"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
                    <div className="w-20 h-20 bg-indigo-600 rounded-[24px] flex items-center justify-center shadow-2xl shadow-indigo-600/30 transform -rotate-12 group-hover:rotate-0 transition-transform duration-700">
                        <BookOpen size={36} className="text-white" />
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <h4 className="font-serif font-black text-2xl text-[var(--text-main)] mb-2">Reflexión de Escritor</h4>
                        <p className="text-lg text-[var(--text-muted)] font-medium leading-relaxed max-w-2xl opacity-80">
                            "Ajustar los detalles de tu obra no es solo burocracia, es el momento en que tu historia empieza a vestirse para salir al mundo. Cuida la sinopsis tanto como el primer capítulo."
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
