import React, { useState, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import { Save, Trash2, Settings, Book, Upload, Image as ImageIcon, Loader2, Download, FileText, File as FilePdf, Globe, Users, BookOpen, AlignLeft, Check, CheckSquare, Square, Eye, EyeOff, Zap, X, Copy, ChevronDown } from 'lucide-react';
import ExportService from '../services/ExportService';
import AIService from '../services/AIService';
import ConfirmModal from './ConfirmModal';
import { getChapters } from '../services/db';
import GeminiLiveService, { GEMINI_LIVE_VOICES, GEMINI_LIVE_MODELS } from '../services/GeminiLiveService';
import { Volume2 } from 'lucide-react';

const API_LABELS = {
    deepseek: 'DeepSeek Direct'
};

const GEMINI_VOICES = GEMINI_LIVE_VOICES;

const NARRADOR_TONES = [
    { id: 'auto', label: 'Auto' },
    { id: 'neutro', label: 'Neutro' },
    { id: 'dramatico', label: 'Dramático' },
    { id: 'epico', label: 'Épico' },
    { id: 'suspenso', label: 'Suspenso' },
    { id: 'calido', label: 'Cálido' },
    { id: 'misterioso', label: 'Misterioso' }
];

const SettingsView = () => {
    const { activeBook, updateBook, updateBookData: handleUpdateBookData, deleteBook, uploadCover, chapters, characters, worldItems, profile, updateProfile } = useData();
    const toast = useToast();
    const [title, setTitle] = useState(activeBook?.title || '');
    const [description, setDescription] = useState(activeBook?.description || '');
    const [coverUrl, setCoverUrl] = useState(activeBook?.coverUrl || '');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    
    // Modern Tab Selection state
    const [activeTab, setActiveTab] = useState('book'); // 'book' or 'user'
    
    // AI States (from profile.aiConfig or legacy profile fallbacks)
    const aiConfig = profile?.aiConfig || {};
    const [deepseekApiKey, setDeepseekApiKey] = useState(aiConfig.deepseekApiKey || profile?.deepseekApiKey || '');
    const [selectedModel, setSelectedModel] = useState(aiConfig.defaultModel || 'deepseek-v4-flash');
    const [reasoningMode, setReasoningMode] = useState(aiConfig.reasoningMode ?? false);
    const [reasoningEffort, setReasoningEffort] = useState(aiConfig.reasoningEffort || 'high');
    const [inputTokenCost, setInputTokenCost] = useState(aiConfig.inputTokenCost ?? 0.14);
    const [outputTokenCost, setOutputTokenCost] = useState(aiConfig.outputTokenCost ?? 0.28);
    const [showApiKey, setShowApiKey] = useState(false);

    // Narrador (Gemini Live) states
    const [geminiApiKey, setGeminiApiKey] = useState(aiConfig.geminiApiKey || '');
    const [narradorVoice, setNarradorVoice] = useState(aiConfig.narradorVoice || 'Puck');
    const [geminiLiveModel, setGeminiLiveModel] = useState(aiConfig.geminiLiveModel || 'gemini-3.1-flash-live-preview');
    const [narradorSpeed, setNarradorSpeed] = useState(aiConfig.narradorSpeed || 1.0);
    const [narradorTone, setNarradorTone] = useState(aiConfig.narradorTone || 'auto');
    const [narradorAutoContinue, setNarradorAutoContinue] = useState(aiConfig.narradorAutoContinue || false);
    const [showGeminiApiKey, setShowGeminiApiKey] = useState(false);
    const [isGeminiVoiceMenuOpen, setIsGeminiVoiceMenuOpen] = useState(false);
    const [isGeminiSpeedMenuOpen, setIsGeminiSpeedMenuOpen] = useState(false);
    const [isGeminiToneMenuOpen, setIsGeminiToneMenuOpen] = useState(false);
    const [isGeminiPreviewing, setIsGeminiPreviewing] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
    const [isSavingAI, setIsSavingAI] = useState(false);
    const hasLoadedProfile = useRef(false);
    const [isModelOpen, setIsModelOpen] = useState(false);

    // Derive filtered models (DeepSeek only)
    const filteredModels = availableModels;

    // Auto-set first model if none selected
    useEffect(() => {
        if (!selectedModel || selectedModel === '' || !filteredModels.find(m => m.id === selectedModel)) {
            if (filteredModels.length > 0) {
                setSelectedModel(filteredModels[0].id);
            }
        }
    }, [availableModels]);

    // Sync state with user profile and fetch models
    useEffect(() => {
        if (profile) {
            const cfg = profile.aiConfig || {};
            setDeepseekApiKey(cfg.deepseekApiKey || profile.deepseekApiKey || '');
            setSelectedModel(cfg.defaultModel || 'deepseek-v4-flash');
            setReasoningMode(cfg.reasoningMode ?? false);
            setReasoningEffort(cfg.reasoningEffort || 'high');
            setInputTokenCost(cfg.inputTokenCost ?? 0.14);
            setOutputTokenCost(cfg.outputTokenCost ?? 0.28);

            // Narrador (Gemini Live) states
            setGeminiApiKey(cfg.geminiApiKey || '');
            setNarradorVoice(cfg.narradorVoice || 'Puck');
            setGeminiLiveModel(cfg.geminiLiveModel || 'gemini-3.1-flash-live-preview');
            setNarradorSpeed(cfg.narradorSpeed || 1.0);
            setNarradorTone(cfg.narradorTone || 'auto');
            setNarradorAutoContinue(cfg.narradorAutoContinue || false);

            hasLoadedProfile.current = true;
        }
        
        const fetchModels = async () => {
            const models = await AIService.getFreeModels();
            setAvailableModels(models);
        };
        
        fetchModels();
    }, [profile]);
    
    // Auto-save whenever any AI setting changes (to profile.aiConfig)
    const autoSaveRef = useRef(null);
    useEffect(() => {
        if (!hasLoadedProfile.current) return; // skip initial load
        
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        autoSaveRef.current = setTimeout(async () => {
            setIsSavingAI(true);
            try {
                await updateProfile({
                    aiConfig: {
                        ...(profile?.aiConfig || {}),
                        deepseekApiKey,
                        defaultModel: selectedModel,
                        reasoningMode,
                        reasoningEffort,
                        inputTokenCost,
                        outputTokenCost,
                        geminiApiKey,
                        narradorVoice,
                        narradorSpeed,
                        narradorTone,
                        geminiLiveModel,
                        narradorAutoContinue
                    }
                });
            } catch (e) {
                console.error("Auto-save AI settings error:", e);
            } finally {
                setIsSavingAI(false);
            }
        }, 800);
        
        return () => {
            if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        };
    }, [deepseekApiKey, reasoningMode, reasoningEffort, selectedModel, inputTokenCost, outputTokenCost, geminiApiKey, narradorVoice, narradorSpeed, narradorTone, geminiLiveModel, narradorAutoContinue]);
    
    // Export States
    const [exportFormat, setExportFormat] = useState('pdf');
    const [exportScope, setExportScope] = useState('manuscript');
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
                const allFullChapters = await getChapters(activeBook.id);
                const activeChapters = allFullChapters.filter(c => !c.deletedAt);

                if (isGranular) {
                    chaptersToExport = activeChapters.filter(c => selectedChapters.includes(c.id));
                } else {
                    chaptersToExport = activeChapters;
                }

                chaptersToExport = [...chaptersToExport].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            }

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

    const selectedModelObj = filteredModels.find(m => m.id === selectedModel) || {};

    return (
        <div className="max-w-4xl mx-auto p-8 lg:p-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32">
            <header className="mb-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
                    <Settings size={12} /> CONFIGURACIÓN GLOBAL
                </div>
                <h1 className="text-4xl md:text-5xl font-serif font-black text-[var(--text-main)] tracking-tight mb-4">
                    Ajustes de Sistema
                </h1>
                <p className="text-[15px] text-[var(--text-muted)] max-w-2xl leading-relaxed font-medium">
                    Gestiona la identidad de tu libro, exporta tu manuscrito o configura las claves globales de Inteligencia Artificial.
                </p>

                {/* Option A Tabs Navigation */}
                <div className="flex gap-2 p-1.5 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl max-w-xs sm:max-w-md mt-8 shadow-sm">
                    <button
                        onClick={() => setActiveTab('book')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                            activeTab === 'book'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]'
                        }`}
                    >
                        <Book size={14} />
                        Esta Obra
                    </button>
                    <button
                        onClick={() => setActiveTab('user')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                            activeTab === 'user'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]'
                        }`}
                    >
                        <Users size={14} />
                        Mi Cuenta
                    </button>
                </div>
            </header>

            {/* TAB: BOOK SETTINGS */}
            {activeTab === 'book' && (
                <div className="space-y-16 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
                        {/* Project Identity Card */}
                        <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-[32px] p-8 shadow-sm group relative overflow-hidden flex flex-col justify-between">
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
                                    className="w-full px-6 py-4 bg-[var(--text-main)] text-[var(--bg-app)] dark:bg-white dark:text-black rounded-2xl font-black text-xs hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <Book size={16} /> Editar Identidad
                                </button>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="bg-rose-500/[0.02] border border-rose-500/15 p-8 rounded-[32px] shadow-sm relative overflow-hidden flex flex-col justify-between">
                            <div className="space-y-4">
                                <h3 className="text-xl font-serif font-black text-rose-500 flex items-center gap-3">
                                    <Trash2 size={24} />
                                    Zona de Peligro
                                </h3>
                                <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed">
                                    Si eliminas esta obra, se borrarán todos sus capítulos, fichas de personajes, notas de mundo y backups locales permanentemente. Esta acción no se puede deshacer.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsConfirmOpen(true)}
                                className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 active:scale-95 hover:scale-[1.02]"
                            >
                                <Trash2 size={16} /> Eliminar Libro
                            </button>
                        </div>
                    </div>

                    {/* Export Section */}
                    <div className="space-y-8">
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
                                    className="w-full sm:w-auto px-8 py-5 rounded-[24px] font-black bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all shadow-sm flex items-center justify-center gap-3 text-sm font-sans"
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
                </div>
            )}

            {/* TAB: USER PROFILE AND GLOBAL AI CONFIG */}
            {activeTab === 'user' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                    {/* User Profile Card */}
                    <div className="lg:col-span-1 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-[32px] p-8 shadow-sm flex flex-col relative overflow-hidden h-fit">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full"></div>
                        <div className="flex flex-col items-center text-center mt-4">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-0.5 mb-4 shadow-lg flex items-center justify-center text-white text-3xl font-black font-serif italic">
                                {profile?.displayName?.charAt(0) || 'U'}
                            </div>
                            <h2 className="text-xl font-serif font-black text-[var(--text-main)] truncate max-w-full">{profile?.displayName || "Escritor"}</h2>
                            <p className="text-xs text-[var(--text-muted)] font-medium truncate max-w-full mb-6">{profile?.email || "sin-correo@cuenta.com"}</p>
                            
                            <div className="w-full h-px bg-[var(--border-main)]/50 mb-6"></div>
                            
                            <div className="w-full space-y-4 text-left">
                                <div>
                                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1.5">Rol de Escritor</p>
                                    <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 text-[9px] font-black uppercase tracking-wider">
                                        {profile?.role || "Novato"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Configuration */}
                    <div className="lg:col-span-2 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border border-indigo-500/20 p-8 rounded-[32px] shadow-sm relative overflow-hidden group">
                        <div className="absolute -top-20 -right-20 w-48 h-48 bg-indigo-500/10 blur-[80px] rounded-full group-hover:bg-indigo-500/20 transition-all duration-1000"></div>
                        
                        <div className="relative z-10 h-full flex flex-col">
                            <div className="flex-1">
                                <h3 className="text-xl font-serif font-black text-[var(--text-main)] mb-2 flex items-center gap-3">
                                    <Zap size={24} className="text-indigo-500" />
                                    Ajustes de Inteligencia Artificial
                                </h3>
                                <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed">
                                    Configura tu proveedor, API key y modelo por defecto. Todo se guarda automáticamente en tu cuenta.
                                </p>
                            </div>

                            <div className="space-y-5 my-6">
                                {/* Step 1: API Key de DeepSeek */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-500 text-[9px] font-black flex items-center justify-center">1</span>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                            API Key de DeepSeek
                                        </p>
                                    </div>
                                    <input
                                        type="text"
                                        value={deepseekApiKey}
                                        onChange={(e) => setDeepseekApiKey(e.target.value)}
                                        className="w-full bg-[var(--bg-app)] border border-indigo-500/30 rounded-xl px-4 py-3 text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 outline-none text-[var(--text-main)]"
                                        placeholder="sk-..."
                                    />
                                    <p className="text-[9px] text-[var(--text-muted)] mt-1 font-medium italic">
                                        API key oficial de DeepSeek para acceso directo y procesamiento local ultra rápido.
                                    </p>
                                </div>

                                {/* Step 2: Model Selector */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-500 text-[9px] font-black flex items-center justify-center">2</span>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Modelo Predeterminado</p>
                                    </div>
                                    <div className="relative">
                                        <button
                                            onClick={() => setIsModelOpen(!isModelOpen)}
                                            className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl hover:border-indigo-500/50 transition-all"
                                        >
                                            <div className="text-left">
                                                <p className="text-xs font-bold text-[var(--text-main)]">
                                                    {selectedModelObj?.name || 'Selecciona un modelo'}
                                                </p>
                                                {selectedModelObj?.context_length && (
                                                    <p className="text-[9px] text-[var(--text-muted)] font-medium">
                                                        Contexto: {Math.round(selectedModelObj.context_length / 1000)}k tokens
                                                    </p>
                                                )}
                                            </div>
                                            <ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform ${isModelOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {isModelOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setIsModelOpen(false)}></div>
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-56 overflow-y-auto font-sans">
                                                    {filteredModels.map(model => (
                                                        <button
                                                            key={model.id}
                                                            onClick={() => { setSelectedModel(model.id); setIsModelOpen(false); }}
                                                            className={`w-full text-left px-4 py-3 text-xs font-semibold transition-all hover:bg-[var(--accent-soft)] ${
                                                                selectedModel === model.id
                                                                    ? 'bg-indigo-500/10 text-indigo-500'
                                                                    : 'text-[var(--text-main)]'
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className="truncate">{model.name}</span>
                                                                {model.context_length && (
                                                                    <span className="text-[9px] text-[var(--text-muted)] ml-2 shrink-0">
                                                                        {Math.round(model.context_length / 1000)}k
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Step 3: Token Rates */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-500 text-[9px] font-black flex items-center justify-center">3</span>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Tarifas de Tokens (USD por 1M tkn)</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 bg-[var(--bg-app)] border border-[var(--border-main)] p-3 rounded-xl">
                                        <div>
                                            <label className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-[0.1em] block mb-1">Entrada (Input)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={inputTokenCost}
                                                onChange={(e) => setInputTokenCost(parseFloat(e.target.value) || 0)}
                                                className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none font-semibold text-[var(--text-main)]"
                                                placeholder="0.14"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-[0.1em] block mb-1">Salida (Output)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={outputTokenCost}
                                                onChange={(e) => setOutputTokenCost(parseFloat(e.target.value) || 0)}
                                                className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none font-semibold text-[var(--text-main)]"
                                                placeholder="0.28"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[8px] text-[var(--text-muted)] mt-1 font-medium italic pl-1">
                                        Tarifas oficiales DeepSeek V4: $0.14 entrada / $0.28 salida (por millón de tokens).
                                    </p>
                                </div>

                                {/* Step 4: Reasoning Mode Toggle */}
                                <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-500 text-[9px] font-black flex items-center justify-center">4</span>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Modo Razonamiento</p>
                                        </div>
                                        <p className="text-[9px] text-[var(--text-muted)] font-medium mt-0.5">
                                            {reasoningMode ? 'El modelo pensará detalladamente antes de responder (thinking mode)' : 'Respuestas directas sin razonamiento profundo'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setReasoningMode(!reasoningMode)}
                                        className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
                                            reasoningMode ? 'bg-indigo-500' : 'bg-[var(--border-main)]'
                                        }`}
                                    >
                                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                                            reasoningMode ? 'left-[22px]' : 'left-0.5'
                                        }`}></div>
                                    </button>
                                </div>

                                {/* Step 5: Reasoning Effort Selector (Visible only if Reasoning Mode is active) */}
                                {reasoningMode && (
                                    <div className="px-4 py-3.5 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-500 text-[9px] font-black flex items-center justify-center">5</span>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Esfuerzo de Pensamiento</p>
                                        </div>
                                        <p className="text-[9px] text-[var(--text-muted)] font-medium">
                                            Controla el presupuesto de tokens dedicados a la computación del pensamiento interno.
                                        </p>
                                        <div className="flex gap-2 mt-1">
                                            {[
                                                { id: 'high', label: 'Alto (High)', desc: 'Equilibrio óptimo' },
                                                { id: 'max', label: 'Máximo (Max)', desc: 'Análisis extremo' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => setReasoningEffort(opt.id)}
                                                    className={`flex-1 p-2 rounded-lg border text-left transition-all ${
                                                        reasoningEffort === opt.id
                                                            ? 'bg-indigo-500/15 border-indigo-500 text-indigo-600 font-bold'
                                                            : 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                                                    }`}
                                                >
                                                    <span className="block text-[10px] uppercase font-black tracking-wider leading-none">{opt.label}</span>
                                                    <span className="block text-[8px] opacity-75 mt-0.5 font-medium">{opt.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Auto-save indicator */}
                            <div className="mt-auto flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${isSavingAI ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                        {isSavingAI ? 'Guardando...' : 'Auto-guardado ✓'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* NARRADOR — GEMINI LIVE */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                    {/* Narrador Info Card */}
                    <div className="lg:col-span-1 bg-gradient-to-br from-purple-500/10 to-fuchsia-500/5 border border-purple-500/20 p-8 rounded-[32px] shadow-sm flex flex-col relative overflow-hidden h-fit">
                        <div className="absolute -top-20 -left-20 w-48 h-48 bg-purple-500/10 blur-[80px] rounded-full"></div>
                        <div className="relative z-10 flex flex-col items-center text-center mt-4">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30 mb-4">
                                <Volume2 size={28} className="text-white" />
                            </div>
                            <h3 className="text-lg font-serif font-black text-[var(--text-main)] mb-2">Narrador</h3>
                            <p className="text-[11px] text-[var(--text-muted)] font-medium leading-relaxed">
                                Narra tus capítulos en modo lectura con voces naturales de Gemini Live 3.1.
                                Sin API key, se usa la voz del navegador como respaldo.
                            </p>
                            <div className={`mt-4 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${geminiApiKey ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                {geminiApiKey ? '✓ Gemini Live activo' : 'Fallback navegador activo'}
                            </div>
                        </div>
                    </div>

                    {/* Narrador Config */}
                    <div className="lg:col-span-2 bg-gradient-to-br from-purple-500/10 to-fuchsia-500/5 border border-purple-500/20 p-8 rounded-[32px] shadow-sm relative overflow-hidden group">
                        <div className="absolute -top-20 -right-20 w-48 h-48 bg-purple-500/10 blur-[80px] rounded-full group-hover:bg-purple-500/20 transition-all duration-1000"></div>
                        
                        <div className="relative z-10 h-full flex flex-col">
                            <div className="flex-1">
                                <h3 className="text-xl font-serif font-black text-[var(--text-main)] mb-2 flex items-center gap-3">
                                    <Volume2 size={24} className="text-purple-500" />
                                    Narrador — Gemini Live 3.1
                                </h3>
                                <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed mb-6">
                                    Configura la voz, velocidad y tono para la narración de capítulos en modo lectura.
                                </p>
                            </div>

                            <div className="space-y-5">
                                {/* Gemini API Key */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-500 text-[9px] font-black flex items-center justify-center">1</span>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                            Gemini Live API Key
                                        </p>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showGeminiApiKey ? 'text' : 'password'}
                                            value={geminiApiKey}
                                            onChange={(e) => setGeminiApiKey(e.target.value)}
                                            className="w-full bg-[var(--bg-app)] border border-purple-500/30 rounded-xl px-4 py-3 pr-12 text-xs font-mono focus:ring-2 focus:ring-purple-500/20 outline-none text-[var(--text-main)]"
                                            placeholder="AIza..."
                                        />
                                        <button
                                            onClick={() => setShowGeminiApiKey(!showGeminiApiKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex items-center gap-2"
                                        >
                                            {showGeminiApiKey ? <X size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-[var(--text-muted)] mt-1 font-medium italic">
                                        Obtén tu API key en Google AI Studio. Requiere modelo con soporte Live.
                                    </p>
                                </div>

                                {/* Voice Selector */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-500 text-[9px] font-black flex items-center justify-center">2</span>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Voz Predeterminada</p>
                                    </div>
                                    <div className="relative">
                                        <button
                                            onClick={() => setIsGeminiVoiceMenuOpen(!isGeminiVoiceMenuOpen)}
                                            className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl hover:border-purple-500/50 transition-all"
                                        >
                                            <span className="text-xs font-bold text-[var(--text-main)]">
                                                {narradorVoice} — {GEMINI_VOICES.find(v => v.id === narradorVoice)?.label || 'Selecciona voz'}
                                            </span>
                                            <ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform ${isGeminiVoiceMenuOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {isGeminiVoiceMenuOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setIsGeminiVoiceMenuOpen(false)}></div>
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-56 overflow-y-auto font-sans">
                                                    {GEMINI_VOICES.map(voice => (
                                                        <button
                                                            key={voice.id}
                                                            onClick={() => { setNarradorVoice(voice.id); setIsGeminiVoiceMenuOpen(false); }}
                                                            className={`w-full text-left px-4 py-3 text-xs font-semibold transition-all hover:bg-[var(--accent-soft)] ${
                                                                narradorVoice === voice.id
                                                                    ? 'bg-purple-500/10 text-purple-500'
                                                                    : 'text-[var(--text-main)]'
                                                            }`}
                                                        >
                                                            {voice.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Speed Selector */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-500 text-[9px] font-black flex items-center justify-center">3</span>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Velocidad Predeterminada</p>
                                    </div>
                                    <div className="grid grid-cols-5 gap-2">
                                        {[0.5, 0.75, 1.0, 1.25, 1.5].map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setNarradorSpeed(s)}
                                                className={`px-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border ${
                                                    narradorSpeed === s
                                                        ? 'bg-purple-500 text-white border-purple-500 shadow-md shadow-purple-500/20'
                                                        : 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-purple-500/50'
                                                }`}
                                            >
                                                {s}x
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Tone Selector */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-500 text-[9px] font-black flex items-center justify-center">4</span>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Tono Narrativo</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {NARRADOR_TONES.map(tone => (
                                            <button
                                                key={tone.id}
                                                onClick={() => setNarradorTone(tone.id)}
                                                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border ${
                                                    narradorTone === tone.id
                                                        ? 'bg-purple-500 text-white border-purple-500 shadow-md shadow-purple-500/20'
                                                        : 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-purple-500/50'
                                                }`}
                                            >
                                                {tone.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Auto-continue toggle */}
                                <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Auto-continuar capítulos</p>
                                        <p className="text-[9px] text-[var(--text-muted)] font-medium mt-0.5">
                                            Al terminar un capítulo, narra el siguiente automáticamente.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setNarradorAutoContinue(!narradorAutoContinue)}
                                        className={`relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 ${narradorAutoContinue ? 'bg-purple-500' : 'bg-[var(--border-main)]'}`}
                                    >
                                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${narradorAutoContinue ? 'left-[22px]' : 'left-0.5'}`}></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            )}

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
                                    setIsConfirmOpen(true);
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
        </div>
    );
};

export default SettingsView;
