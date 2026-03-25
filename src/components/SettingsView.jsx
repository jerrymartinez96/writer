import React, { useState, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import { Save, Trash2, Settings, Book, Upload, Image as ImageIcon, Loader2, Download, FileText, File as FilePdf, Globe, Users, BookOpen, AlignLeft, Check, CheckSquare, Square, Eye, EyeOff, Zap, ArrowLeftRight, X, Copy } from 'lucide-react';
import ExportService from '../services/ExportService';
import AIService from '../services/AIService';
import ConfirmModal from './ConfirmModal';
import { getChapters } from '../services/db';

const SettingsView = () => {
    const { activeBook, updateBook, updateBookData: handleUpdateBookData, deleteBook, uploadCover, chapters, characters, worldItems, profile, updateProfile } = useData();
    const toast = useToast();
    const [title, setTitle] = useState(activeBook?.title || '');
    const [description, setDescription] = useState(activeBook?.description || '');
    const [coverUrl, setCoverUrl] = useState(activeBook?.coverUrl || '');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    
    // AI States
    const [openRouterKey, setOpenRouterKey] = useState(activeBook?.aiSettings?.openRouterKey || '');
    const [selectedModel, setSelectedModel] = useState(activeBook?.aiSettings?.selectedAiModel || 'google/gemini-2.0-flash-exp:free');
    const [googleApiKey, setGoogleApiKey] = useState(activeBook?.aiSettings?.googleApiKey || '');
    const [showApiKey, setShowApiKey] = useState(false);
    const [isModelsModalOpen, setIsModelsModalOpen] = useState(false);
    const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
    const [isSavingAI, setIsSavingAI] = useState(false);
    const [availableModels, setAvailableModels] = useState(AIService.MODELS);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [modalProviderTab, setModalProviderTab] = useState('google');
    const hasLoadedProfile = useRef(false);

    // Sync state with activeBook and fetch models
    useEffect(() => {
        if (activeBook?.aiSettings && !hasLoadedProfile.current) {
            setOpenRouterKey(activeBook.aiSettings.openRouterKey || '');
            setGoogleApiKey(activeBook.aiSettings.googleApiKey || '');
            setSelectedModel(activeBook.aiSettings.selectedAiModel || 'google/gemini-2.0-flash-exp:free');
            hasLoadedProfile.current = true;
        }
        
        const fetchModels = async () => {
            setIsLoadingModels(true);
            const models = await AIService.getFreeModels();
            setAvailableModels(models);
            setIsLoadingModels(false);
        };
        
        fetchModels();
    }, [profile]);
    
    
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
            if (includeManuscript && activeBook) {
                // CRITICAL FIX: Always load full chapter content from DB before exporting.
                // The in-memory `chapters` state uses lazy loading — chapters only have content
                // if the user has opened them individually. For export we need ALL content.
                const allFullChapters = await getChapters(activeBook.id);
                const activeChapters = allFullChapters.filter(c => !c.deletedAt);

                if (isGranular) {
                    chaptersToExport = activeChapters.filter(c => selectedChapters.includes(c.id));
                } else {
                    chaptersToExport = activeChapters;
                }

                // Sort by orderIndex to preserve the correct chapter order
                chaptersToExport = [...chaptersToExport].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            }

            // Filter out character folders (isCategory) — only export real character entries
            const charactersToExport = characters.filter(c => !c.isCategory && !c.deletedAt);

            if (exportFormat === 'pdf') {
                await ExportService.exportAsPDF(activeBook, chaptersToExport, includeMaster, charactersToExport, worldItems);
            } else if (exportFormat === 'docx') {
                await ExportService.exportAsDOCX(activeBook, chaptersToExport, includeMaster, charactersToExport, worldItems);
            } else {
                await ExportService.exportAsTXT(activeBook, chaptersToExport, includeMaster, charactersToExport, worldItems);
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
        if (e) e.preventDefault();
        updateBook({ title, description, coverUrl });
        toast.success("¡Identidad de la obra actualizada!");
        setIsIdentityModalOpen(false);
    };

    const handleCopyMasterDoc = () => {
        try {
            const text = ExportService.getMasterDocText(activeBook, characters, worldItems);
            navigator.clipboard.writeText(text);
            toast.success("¡Biblia copiada al portapapeles!");
        } catch (error) {
            console.error("Copy failed:", error);
            toast.error("Error al copiar al portapapeles.");
        }
    };

    const handleSaveAISettings = async () => {
        setIsSavingAI(true);
        try {
            const aiSettings = { 
                openRouterKey, 
                googleApiKey,
                selectedAiModel: selectedModel 
            };
            
            // Save to active book (per-book)
            await handleUpdateBookData({ aiSettings });
            
            // Also keep as global fallback if desired, but user asked for per-book
            // updateProfile(aiSettings); 
            
            toast.success("¡Configuración de IA guardada para este libro!");
        } catch (error) {
            toast.error("Error al guardar ajustes de IA.");
        } finally {
            setIsSavingAI(false);
        }
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                {/* Project Identity Card */}
                <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-[32px] p-8 shadow-sm group relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full"></div>
                    
                    <div className="flex gap-6 items-start mb-8 relative z-10">
                        <div className="w-24 aspect-[2/3] rounded-lg overflow-hidden shadow-lg border border-white/10 shrink-0 bg-[var(--bg-app)]">
                            {coverUrl ? <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[var(--accent-main)] opacity-20"><ImageIcon size={32} /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-2xl font-serif font-black text-[var(--text-main)] truncate mb-1">{title || "Sin Título"}</h2>
                            <p className="text-xs text-[var(--text-muted)] font-medium line-clamp-3 leading-relaxed mb-4">
                                {description || "Comienza a definir la esencia de tu historia editando los detalles del proyecto."}
                            </p>
                            <div className="flex items-center gap-3">
                                <span className="px-2 py-1 rounded-md bg-[var(--accent-soft)] text-[var(--accent-main)] text-[9px] font-black uppercase tracking-wider">{chapters.length} Capítulos</span>
                                <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase tracking-wider">Activo</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto flex gap-3 relative z-10">
                        <button 
                            onClick={() => setIsIdentityModalOpen(true)}
                            className="flex-1 px-6 py-4 bg-[var(--text-main)] text-[var(--bg-app)] dark:bg-white dark:text-black rounded-2xl font-black text-xs hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <Book size={16} /> Editar Identidad
                        </button>
                    </div>
                </div>

                {/* AI Configuration Section - Independent */}
                <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border border-indigo-500/20 p-8 rounded-[32px] shadow-sm relative overflow-hidden group">
                    <div className="absolute -top-20 -right-20 w-48 h-48 bg-indigo-500/10 blur-[80px] rounded-full group-hover:bg-indigo-500/20 transition-all duration-1000"></div>
                    
                    <div className="relative z-10 h-full flex flex-col">
                        <div className="flex-1">
                            <h3 className="text-xl font-serif font-black text-[var(--text-main)] mb-2 flex items-center gap-3">
                                <Zap size={24} className="text-indigo-500" />
                                Inteligencia (Este Libro)
                            </h3>
                            <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed">
                                Configura las llaves de API específicas para este proyecto. Estos datos no afectarán a otros libros.
                            </p>
                        </div>
     

                        <div className="space-y-4 mb-8">
                            <div className="flex items-center justify-between p-4 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl">
                                <div className="overflow-hidden">
                                    <p className="text-[9px] font-black tracking-widest text-indigo-500 uppercase mb-1">Modelo Activo</p>
                                    <p className="text-xs font-bold text-[var(--text-main)] truncate">
                                        {availableModels.find(m => m.id === selectedModel)?.name || "Gemini 2.0 Flash"}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setIsModelsModalOpen(true)}
                                    className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all shadow-sm"
                                >
                                    <ArrowLeftRight size={16} />
                                </button>
                            </div>
                            
                            <div className="p-4 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl flex items-center justify-between">
                                <div className="flex-1 min-w-0 mr-4">
                                    <p className="text-[9px] font-black tracking-widest text-indigo-500 uppercase mb-1">Cero Costo API</p>
                                    <p className="text-xs font-mono text-[var(--text-muted)] truncate italic">
                                        {openRouterKey ? "••••••••••••••••" : "No configurada"}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)]"
                                    >
                                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            
                            {showApiKey && (
                                <div className="animate-in slide-in-from-top-2 duration-300 space-y-4">
                                    <div>
                                        <p className="text-[9px] font-black tracking-widest text-[var(--accent-main)] uppercase mb-1">OpenRouter Key</p>
                                        <input
                                            type="text"
                                            value={openRouterKey}
                                            onChange={(e) => setOpenRouterKey(e.target.value)}
                                            className="w-full bg-[var(--bg-app)] border border-indigo-500/30 rounded-xl px-4 py-3 text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                            placeholder="sk-or-v1-..."
                                        />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black tracking-widest text-emerald-500 uppercase mb-1">Google AI Studio Key</p>
                                        <input
                                            type="text"
                                            value={googleApiKey}
                                            onChange={(e) => setGoogleApiKey(e.target.value)}
                                            className="w-full bg-[var(--bg-app)] border border-emerald-500/30 rounded-xl px-4 py-3 text-xs font-mono focus:ring-2 focus:ring-emerald-500/20 outline-none"
                                            placeholder="AIzaSy..."
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-auto">
                            <button
                                onClick={handleSaveAISettings}
                                disabled={isSavingAI}
                                className="w-full px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {isSavingAI ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Guardar Inteligencia
                            </button>
                        </div>
                    </div>
                </div>
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

                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                        <button
                            onClick={handleCopyMasterDoc}
                            className="w-full sm:w-auto px-8 py-5 rounded-[24px] font-black bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all shadow-sm flex items-center justify-center gap-3 text-sm"
                            title="Copia el contenido de la Biblia (Personajes y Notas) para usarlo en otros sitios"
                        >
                            <Copy size={18} />
                            Copiar Biblia (Clip)
                        </button>

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

            {/* Project Identity Modal */}
            {isIdentityModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsIdentityModalOpen(false)}></div>
                    <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-[var(--border-main)]">
                            <div>
                                <h3 className="text-xl font-bold text-[var(--text-main)] font-serif italic">Identidad del Proyecto</h3>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Define la estética y esencia de tu obra.</p>
                            </div>
                            <button onClick={() => setIsIdentityModalOpen(false)} className="p-2 rounded-xl hover:bg-[var(--bg-editor)] text-[var(--text-muted)] transition-colors"><X size={20} /></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-8 scrollbar-hide grid grid-cols-1 md:grid-cols-12 gap-8">
                            {/* Cover Edit */}
                            <div className="md:col-span-4 space-y-6">
                                <label className="text-[10px] font-black uppercase tracking-widest text-indigo-500 block">Portada de la Obra</label>
                                <div className="relative group aspect-[2/3] rounded-xl overflow-hidden shadow-2xl bg-[var(--bg-editor)] border border-[var(--border-main)]">
                                    {coverUrl ? <img src={coverUrl} alt="Preview" className="w-full h-full object-cover" /> : <div className="w-full h-full flex flex-col items-center justify-center opacity-30 text-indigo-500"><ImageIcon size={48} className="mb-2" /><span className="text-[10px] font-black uppercase">Sin Imagen</span></div>}
                                    {isUploading && <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center"><Loader2 size={24} className="animate-spin text-white" /></div>}
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="absolute inset-x-0 bottom-0 py-4 bg-black/70 text-white text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        Subir Archivo
                                    </button>
                                </div>
                                <div className="space-y-4">
                                    <div className="relative">
                                        <input 
                                            type="url"
                                            placeholder="Pegar URL de imagen..."
                                            value={coverUrl}
                                            onChange={(e) => setCoverUrl(e.target.value)}
                                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl pl-9 pr-4 py-3 text-[11px] font-serif focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                        />
                                        <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                    </div>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                                </div>
                            </div>

                            {/* Text Metadata */}
                            <div className="md:col-span-8 space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-indigo-500 block">Título de la Obra</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500/20 outline-none text-xl font-serif font-black"
                                        placeholder="Escribe el nombre de tu obra..."
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-indigo-500 block">Sinopsis Narrativa</label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={10}
                                        className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl px-6 py-5 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm leading-relaxed scrollbar-hide font-medium"
                                        placeholder="Escribe un resumen que capture la esencia de tu historia..."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-[var(--bg-editor)] border-t border-[var(--border-main)] flex justify-between items-center">
                            <button
                                onClick={() => {
                                    if (window.confirm("¿Seguro que quieres eliminar la obra definitivamente?")) {
                                        deleteBook(activeBook.id);
                                    }
                                }}
                                className="px-6 py-3 text-red-500 hover:bg-red-500/10 rounded-xl font-black text-xs transition-all flex items-center gap-2"
                            >
                                <Trash2 size={16} /> Eliminar Libro
                            </button>
                            <div className="flex gap-4">
                                <button onClick={() => setIsIdentityModalOpen(false)} className="px-6 py-3 text-[var(--text-muted)] font-black text-xs hover:text-[var(--text-main)]">Cancelar</button>
                                <button onClick={handleSave} className="px-10 py-3 bg-[var(--accent-main)] text-white font-black rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all">Sellar Cambios</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Models Modal */}
            {isModelsModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModelsModalOpen(false)}></div>
                    <div className="relative bg-[var(--bg-app)] border border-[var(--border-main)] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-[var(--border-main)]">
                            <div>
                                <h3 className="text-xl font-bold text-[var(--text-main)] font-serif italic">Catálogo de Modelos Gratuitos</h3>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Sincronizados en tiempo real desde OpenRouter.</p>
                            </div>
                            <button onClick={() => setIsModelsModalOpen(false)} className="p-2 rounded-xl hover:bg-[var(--bg-editor)] text-[var(--text-muted)] transition-colors"><X size={20} /></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-hide bg-[var(--bg-editor)]/30">
                            {/* Tabs Switcher */}
                            <div className="flex gap-2 p-1.5 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl mb-8">
                                <button 
                                    onClick={() => setModalProviderTab('google')}
                                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modalProviderTab === 'google' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-[var(--text-muted)] hover:bg-[var(--bg-editor)]'}`}
                                >
                                    Google AI Studio
                                </button>
                                <button 
                                    onClick={() => setModalProviderTab('openrouter')}
                                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modalProviderTab === 'openrouter' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-[var(--text-muted)] hover:bg-[var(--bg-editor)]'}`}
                                >
                                    OpenRouter (Gratis)
                                </button>
                            </div>

                            {isLoadingModels ? (
                                <div className="py-20 flex flex-col items-center justify-center text-[var(--text-muted)]">
                                    <Loader2 size={32} className="animate-spin mb-4 text-indigo-500" />
                                    <span className="text-xs uppercase font-black tracking-widest">Obteniendo lista oficial...</span>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {availableModels
                                        .filter(m => modalProviderTab === 'google' ? m.provider === 'Google' : m.provider === 'OpenRouter')
                                        .map(model => (
                                        <button
                                            key={model.id}
                                            onClick={() => {
                                                setSelectedModel(model.id);
                                                setIsModelsModalOpen(false);
                                            }}
                                            className={`flex items-start gap-4 p-5 rounded-2xl border transition-all text-left group ${selectedModel === model.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'bg-[var(--bg-app)] border-[var(--border-main)] hover:border-indigo-500/50'}`}
                                        >
                                            <div className="flex-1 overflow-hidden">
                                                <div className={`text-sm font-black truncate mb-1 ${selectedModel === model.id ? 'text-white' : 'text-[var(--text-main)]'}`}>{model.name}</div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <div className={`text-[10px] uppercase font-bold tracking-[0.2em] ${selectedModel === model.id ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
                                                        {model.provider}
                                                    </div>
                                                    {model.context_length && (
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${selectedModel === model.id ? 'bg-white/20 text-white' : 'bg-indigo-500/10 text-indigo-500'}`}>
                                                            {Math.round(model.context_length / 1000)}k
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {selectedModel === model.id ? (
                                                <CheckSquare size={18} className="text-white shrink-0" />
                                            ) : (
                                                <Square size={18} className="text-[var(--text-muted)] opacity-30 group-hover:opacity-100 transition-opacity shrink-0" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-[var(--bg-editor)] border-t border-[var(--border-main)] flex justify-between items-center">
                            <p className="text-[10px] font-bold text-[var(--text-muted)] italic">* Solo se muestran modelos con costo 0.</p>
                            <button onClick={() => setIsModelsModalOpen(false)} className="px-8 py-3 bg-[var(--accent-main)] text-white font-bold rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsView;
