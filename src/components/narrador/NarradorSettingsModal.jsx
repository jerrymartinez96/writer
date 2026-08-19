/**
 * NarradorSettingsModal — Configuración avanzada del Narrador.
 * Incluye: API key, voz por defecto con preview, velocidad, tono, auto-continuar y limpieza de caché.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown, X, Play, Square, Sparkles, Globe, Trash2, Volume2, Loader2, Cloud, AlertTriangle } from 'lucide-react';
import Modal from '../Modal';
import ConfirmModal from '../ConfirmModal';
import GeminiLiveService, { GEMINI_LIVE_VOICES, GEMINI_LIVE_MODELS } from '../../services/GeminiLiveService';
import { useData } from '../../context/DataContext';
import { useToast } from '../Toast';
import { clearNarradorCache, getNarradorCacheSize, getNarradorStorageSettings, saveNarradorStorageSettings, chooseNarradorDirectory } from '../../services/NarradorCache';
import { isNarradorCloudConfigured } from '../../services/NarradorCloudService';

const TONES = [
    { id: 'auto', label: 'Auto' },
    { id: 'neutro', label: 'Neutro' },
    { id: 'dramatico', label: 'Dramático' },
    { id: 'epico', label: 'Épico' },
    { id: 'suspenso', label: 'Suspenso' },
    { id: 'calido', label: 'Cálido' },
    { id: 'misterioso', label: 'Misterioso' }
];

const NarradorSettingsModal = ({ isOpen, onClose, onCacheCleared, activeChapter }) => {
    const { profile, updateProfile, activeBook } = useData();
    const toast = useToast();
    const aiConfig = profile?.aiConfig || {};

    // Local state for form
    const [apiKey, setApiKey] = useState(aiConfig.geminiApiKey || '');
    const [voice, setVoice] = useState(aiConfig.narradorVoice || 'Puck');
    const [speed, setSpeed] = useState(aiConfig.narradorSpeed || 1.0);
    const [tone, setTone] = useState(aiConfig.narradorTone || 'auto');
    const [model, setModel] = useState(aiConfig.geminiLiveModel || 'gemini-3.1-flash-live-preview');
    const [autoContinue, setAutoContinue] = useState(aiConfig.narradorAutoContinue || false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [previewVoiceId, setPreviewVoiceId] = useState(null);
    const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
    const [cacheInfo, setCacheInfo] = useState(null);
    const [isClearingCache, setIsClearingCache] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [cloudinaryCloudName, setCloudinaryCloudName] = useState(aiConfig.cloudinaryCloudName || '');
    const [cloudinaryApiKey, setCloudinaryApiKey] = useState(aiConfig.cloudinaryApiKey || '');
    const [cloudinaryUploadPreset, setCloudinaryUploadPreset] = useState(aiConfig.cloudinaryUploadPreset || '');
    const [showCloudinaryApiKey, setShowCloudinaryApiKey] = useState(false);
    const [keepPermanent, setKeepPermanent] = useState(false);
    const [folderName, setFolderName] = useState('');
    const [isClearCacheConfirmOpen, setIsClearCacheConfirmOpen] = useState(false);
    const profileRef = useRef(profile);
    const updateProfileRef = useRef(updateProfile);
    const lastSavedConfigRef = useRef('');

    useEffect(() => { profileRef.current = profile; }, [profile]);
    useEffect(() => { updateProfileRef.current = updateProfile; }, [updateProfile]);

    // Sync with profile when opened
    useEffect(() => {
        if (isOpen && profile) {
            const cfg = profile.aiConfig || {};
            setApiKey(cfg.geminiApiKey || '');
            setVoice(cfg.narradorVoice || 'Puck');
            setSpeed(cfg.narradorSpeed || 1.0);
            setTone(cfg.narradorTone || 'auto');
            setModel(cfg.geminiLiveModel || 'gemini-3.1-flash-live-preview');
            setAutoContinue(cfg.narradorAutoContinue || false);
            setIsVoiceMenuOpen(false);
            setCloudinaryCloudName(cfg.cloudinaryCloudName || '');
            setCloudinaryApiKey(cfg.cloudinaryApiKey || '');
            setCloudinaryUploadPreset(cfg.cloudinaryUploadPreset || '');
            lastSavedConfigRef.current = JSON.stringify({
                geminiApiKey: cfg.geminiApiKey || '',
                narradorVoice: cfg.narradorVoice || 'Puck',
                narradorSpeed: cfg.narradorSpeed || 1.0,
                narradorTone: cfg.narradorTone || 'auto',
                geminiLiveModel: cfg.geminiLiveModel || 'gemini-3.1-flash-live-preview',
                narradorAutoContinue: cfg.narradorAutoContinue || false,
                cloudinaryCloudName: cfg.cloudinaryCloudName || '',
                cloudinaryApiKey: cfg.cloudinaryApiKey || '',
                cloudinaryUploadPreset: cfg.cloudinaryUploadPreset || '',
            });
            getNarradorStorageSettings().then(storage => {
                setKeepPermanent(!!storage.keepPermanent);
                setFolderName(storage.folderName || '');
            });
        }
    }, [isOpen, profile]);

    // Auto-save when any field changes
    useEffect(() => {
        if (!isOpen || !profile) return;
        const nextConfig = {
            geminiApiKey: apiKey,
            narradorVoice: voice,
            narradorSpeed: speed,
            narradorTone: tone,
            geminiLiveModel: model,
            narradorAutoContinue: autoContinue,
            cloudinaryCloudName: cloudinaryCloudName.trim(),
            cloudinaryApiKey: cloudinaryApiKey.trim(),
            cloudinaryUploadPreset: cloudinaryUploadPreset.trim(),
        };
        const serializedConfig = JSON.stringify(nextConfig);
        if (serializedConfig === lastSavedConfigRef.current) return;
        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                await updateProfileRef.current({
                    aiConfig: {
                        ...(profileRef.current?.aiConfig || {}),
                        ...nextConfig,
                    }
                });
                lastSavedConfigRef.current = serializedConfig;
            } catch (err) {
                console.error('Error saving narrador settings:', err);
            } finally {
                setIsSaving(false);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [apiKey, voice, speed, tone, model, autoContinue, cloudinaryCloudName, cloudinaryApiKey, cloudinaryUploadPreset, isOpen, profile]);

    // Load cache stats
    useEffect(() => {
        if (!isOpen) return;
        const load = async () => {
            const stats = await getNarradorCacheSize(activeBook?.id, activeChapter?.id);
            setCacheInfo(stats);
        };
        load();
    }, [isOpen, activeBook?.id, activeChapter?.id]);

    const formatBytes = (bytes) => {
        if (!bytes) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getProfileWithCloudConfig = () => ({
        ...profileRef.current,
        aiConfig: {
            ...(profileRef.current?.aiConfig || {}),
            cloudinaryCloudName: cloudinaryCloudName.trim(),
            cloudinaryApiKey: cloudinaryApiKey.trim(),
            cloudinaryUploadPreset: cloudinaryUploadPreset.trim()
        }
    });

    const handlePreviewVoice = async (voiceId) => {
        if (isPreviewing) {
            GeminiLiveService.stop();
            setIsPreviewing(false);
            setPreviewVoiceId(null);
            return;
        }

        if (!apiKey) {
            toast.warning('Configura primero tu API key de Gemini.');
            return;
        }

        if (GeminiLiveService.connected || GeminiLiveService.isAudioActuallyActive()) {
            toast.warning('Detén la narración actual antes de probar otra voz.');
            return;
        }

        setPreviewVoiceId(voiceId);
        setIsPreviewing(true);

        try {
            await GeminiLiveService.connect(apiKey, {
                model,
                voice: voiceId,
                systemInstruction: 'Habla con claridad y naturalidad. Lee las dos oraciones de muestra.'
            });

            GeminiLiveService.sendText('Hola, soy un narrador de audiolibros. Esta es una prueba de voz para tu proyecto de escritura.');

            // Stop after ~5 seconds
            setTimeout(() => {
                GeminiLiveService.stop();
                setIsPreviewing(false);
                setPreviewVoiceId(null);
            }, 6000);
        } catch (error) {
            toast.error(error.message || 'No se pudo probar la voz.');
            setIsPreviewing(false);
            setPreviewVoiceId(null);
        }
    };

    const handleClearCache = async () => {
        setIsClearingCache(true);
        try {
            if (!activeBook?.id || !activeChapter?.id) {
                toast.warning('Selecciona un capítulo antes de limpiar su caché.');
                return;
            }
            const success = await clearNarradorCache(activeBook.id, activeChapter.id);
            if (success) {
                toast.success('Caché del capítulo eliminada. El respaldo en la nube permanece disponible.');
                const stats = await getNarradorCacheSize(activeBook.id, activeChapter.id);
                setCacheInfo(stats);
                onCacheCleared?.();
            } else {
                toast.error('No se pudo limpiar la caché.');
            }
        } catch {
            toast.error('Error al limpiar la caché.');
        } finally {
            setIsClearingCache(false);
        }
    };

    const handlePermanentStorageToggle = async () => {
        const next = !keepPermanent;
        setKeepPermanent(next);
        await saveNarradorStorageSettings({ keepPermanent: next });
    };

    const handleChooseFolder = async () => {
        try {
            const name = await chooseNarradorDirectory();
            setFolderName(name);
            setKeepPermanent(true);
        } catch (err) {
            if (err?.name !== 'AbortError') toast.error(err.message || 'No se pudo seleccionar la carpeta.');
        }
    };

    const cloudConfigured = isNarradorCloudConfigured(getProfileWithCloudConfig());

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="Configuración del Narrador" size="lg">
            <div className="p-6 space-y-6 font-sans max-h-[70vh] overflow-y-auto scrollbar-hide">
                {/* Header info */}
                <p className="text-[11px] text-[var(--text-muted)] font-medium leading-relaxed">
                    Configura el Narrador con Gemini Live 3.1 para una narración natural y expresiva de tus capítulos en modo lectura.
                </p>

                {/* API Key */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                        <Sparkles size={12} className="text-purple-500" />
                        Gemini Live API Key
                    </label>
                    <div className="relative">
                        <input
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 pr-12 text-xs font-mono focus:ring-2 focus:ring-purple-500/20 outline-none text-[var(--text-main)]"
                            placeholder="AIza..."
                        />
                        <button
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                        >
                            {showApiKey ? <X size={14} /> : <span className="text-[9px] font-black uppercase tracking-widest">Ver</span>}
                        </button>
                    </div>
                    <p className="text-[9px] text-[var(--text-muted)] font-medium italic">
                        Obtén tu key en <span className="text-purple-500 font-bold">Google AI Studio</span>. Se guarda en tu cuenta automáticamente.
                    </p>
                </div>

                {/* Model */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                        Modelo Gemini Live
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {GEMINI_LIVE_MODELS.map(m => (
                            <button
                                key={m.id}
                                onClick={() => setModel(m.id)}
                                className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border ${model === m.id
                                    ? 'bg-purple-500 text-white border-purple-500 shadow-md shadow-purple-500/20'
                                    : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-purple-500/50'
                                }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Voice selection with preview */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                        <Volume2 size={12} className="text-purple-500" />
                        Voz por defecto
                    </label>
                    <div className="relative">
                        <button
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded={isVoiceMenuOpen}
                            onClick={() => setIsVoiceMenuOpen((previous) => !previous)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] px-3 py-3 text-left text-xs font-black text-[var(--text-main)] transition-all hover:border-purple-500/50 focus:border-purple-500 focus:outline-none"
                        >
                            <span>{GEMINI_LIVE_VOICES.find((item) => item.id === voice)?.label || voice}</span>
                            <ChevronDown className={`shrink-0 text-[var(--text-muted)] transition-transform ${isVoiceMenuOpen ? 'rotate-180' : ''}`} size={15} />
                        </button>

                        {isVoiceMenuOpen && (
                            <>
                                <button
                                    type="button"
                                    aria-label="Cerrar selector de voz"
                                    className="fixed inset-0 z-40 cursor-default"
                                    onClick={() => setIsVoiceMenuOpen(false)}
                                />
                                <div role="listbox" aria-label="Seleccionar voz" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] p-1.5 shadow-2xl">
                                    {GEMINI_LIVE_VOICES.map((item) => (
                                        <div key={item.id} className={`flex items-center gap-2 rounded-xl transition-colors ${voice === item.id ? 'bg-purple-500/10 text-purple-600' : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'}`}>
                                            <button
                                                type="button"
                                                role="option"
                                                aria-selected={voice === item.id}
                                                onClick={() => { setVoice(item.id); setIsVoiceMenuOpen(false); }}
                                                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider"
                                            >
                                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                                {voice === item.id && <Check className="shrink-0" size={14} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handlePreviewVoice(item.id)}
                                                disabled={!apiKey}
                                                className={`mr-1.5 rounded-lg p-1.5 transition-all ${!apiKey ? 'cursor-not-allowed opacity-30' : isPreviewing && previewVoiceId === item.id ? 'bg-red-500 text-white' : 'text-purple-500 hover:bg-purple-500/10'}`}
                                                title={isPreviewing && previewVoiceId === item.id ? 'Detener preview' : 'Probar voz'}
                                            >
                                                {isPreviewing && previewVoiceId === item.id ? <Square size={12} /> : <Play size={12} />}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    {!apiKey && (
                        <p className="text-[9px] text-[var(--text-muted)] font-medium italic">
                            Configura la API key para poder probar las voces.
                        </p>
                    )}
                </div>

                {/* Speed */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                        Velocidad por defecto
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                        {[0.5, 0.75, 1.0, 1.25, 1.5].map(s => (
                            <button
                                key={s}
                                onClick={() => setSpeed(s)}
                                className={`px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border ${speed === s
                                    ? 'bg-[var(--accent-main)] text-white border-[var(--accent-main)] shadow-md'
                                    : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-[var(--accent-main)]'
                                }`}
                            >
                                {s}x
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tone */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                        <Sparkles size={12} className="text-purple-500" />
                        Tono narrativo
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {TONES.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTone(t.id)}
                                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border ${tone === t.id
                                    ? 'bg-purple-500 text-white border-purple-500 shadow-md'
                                    : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-muted)] hover:border-purple-500/50'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-[9px] text-[var(--text-muted)] font-medium italic">
                        El tono se envía al prompt del narrador para ajustar la entonación. "Auto" infiere el tono de la sinopsis del libro.
                    </p>
                </div>

                {/* Auto-continue toggle */}
                <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Auto-continuar capítulos</p>
                        <p className="text-[9px] text-[var(--text-muted)] font-medium mt-0.5">
                            Al terminar un capítulo, narrar el siguiente automáticamente.
                        </p>
                    </div>
                    <button
                        onClick={() => setAutoContinue(!autoContinue)}
                        className={`relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 ${autoContinue ? 'bg-purple-500' : 'bg-[var(--border-main)]'}`}
                    >
                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${autoContinue ? 'left-[22px]' : 'left-0.5'}`}></div>
                    </button>
                </div>

                {/* Save indicator */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isSaving ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                            {isSaving ? 'Guardando...' : 'Auto-guardado ✓'}
                        </span>
                    </div>
                </div>

                {/* Cache section */}
                <div className="pt-4 border-t border-[var(--border-main)] space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                                <Trash2 size={12} className="text-orange-500" />
                                Caché de narración
                            </p>
                            <p className="text-[9px] text-[var(--text-muted)] font-medium mt-0.5">
                                {cacheInfo ? `${cacheInfo.entries} segmentos · ${formatBytes(cacheInfo.bytes)}` : 'Calculando...'}
                            </p>
                        </div>
                        <button
                            onClick={() => setIsClearCacheConfirmOpen(true)}
                            disabled={isClearingCache || !activeBook?.id || !activeChapter?.id || !cacheInfo?.entries}
                            className="px-4 py-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/30 text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                        >
                            {isClearingCache ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            Limpiar
                        </button>
                    </div>
                    <p className="text-[9px] text-[var(--text-muted)] font-medium italic">
                        Limpiar elimina solo la copia local. El respaldo en la nube permanece disponible para descargarlo después.
                    </p>
                </div>

                {/* Cloudinary configuration */}
                <div className="pt-4 border-t border-[var(--border-main)] space-y-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                            <Cloud size={12} className="text-sky-500" />
                            Configuración de Cloudinary
                        </p>
                        <p className="text-[9px] text-[var(--text-muted)] font-medium mt-0.5">
                            Estos datos se guardan junto con la configuración de IA. Las acciones de subir y descargar están en el panel del capítulo.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                            value={cloudinaryCloudName}
                            onChange={(event) => setCloudinaryCloudName(event.target.value)}
                            placeholder="Cloud name"
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-3 py-2.5 text-xs font-mono focus:ring-2 focus:ring-sky-500/20 outline-none text-[var(--text-main)]"
                        />
                        <input
                            value={cloudinaryUploadPreset}
                            onChange={(event) => setCloudinaryUploadPreset(event.target.value)}
                            placeholder="Upload preset unsigned"
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-3 py-2.5 text-xs font-mono focus:ring-2 focus:ring-sky-500/20 outline-none text-[var(--text-main)]"
                        />
                    </div>
                    <div className="relative">
                        <input
                            type={showCloudinaryApiKey ? 'text' : 'password'}
                            value={cloudinaryApiKey}
                            onChange={(event) => setCloudinaryApiKey(event.target.value)}
                            placeholder="Cloudinary API key (opcional)"
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-3 py-2.5 pr-14 text-xs font-mono focus:ring-2 focus:ring-sky-500/20 outline-none text-[var(--text-main)]"
                        />
                        <button
                            onClick={() => setShowCloudinaryApiKey((previous) => !previous)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)]"
                        >
                            {showCloudinaryApiKey ? 'Ocultar' : 'Ver'}
                        </button>
                    </div>
                    <p className="text-[9px] text-[var(--text-muted)] font-medium italic">
                        Usa un Upload preset unsigned. La limpieza remota no forma parte de esta versión.
                    </p>
                    {!cloudConfigured && (
                        <p className="text-[9px] text-amber-600 font-medium flex items-start gap-1.5">
                            <AlertTriangle size={12} className="shrink-0" />
                            Completa Cloud name y Upload preset para activar la sincronización.
                        </p>
                    )}
                </div>

                {/* Permanent storage */}
                <div className="pt-4 border-t border-[var(--border-main)] space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Conservar audios permanentemente</p>
                            <p className="text-[9px] text-[var(--text-muted)] font-medium mt-0.5">
                                Evita que los fragmentos guardados se eliminen con el caché temporal de 7 días.
                            </p>
                        </div>
                        <button
                            onClick={handlePermanentStorageToggle}
                            className={`relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 ${keepPermanent ? 'bg-emerald-500' : 'bg-[var(--border-main)]'}`}
                            title="Activar almacenamiento permanente"
                        >
                            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all ${keepPermanent ? 'left-[22px]' : 'left-0.5'}`}></div>
                        </button>
                    </div>
                    <button
                        onClick={handleChooseFolder}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-[var(--bg-editor)] border border-[var(--border-main)] hover:border-emerald-500/50 text-left transition-all cursor-pointer"
                    >
                        <span className="min-w-0">
                            <span className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]">Guardar también en carpeta</span>
                            <span className="block truncate text-[9px] text-[var(--text-muted)] mt-0.5">{folderName || 'Seleccionar carpeta del dispositivo'}</span>
                        </span>
                        <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-emerald-500">Elegir</span>
                    </button>
                    <p className="text-[9px] text-[var(--text-muted)] font-medium italic">
                        La carpeta requiere permiso del navegador y permanece vinculada a este dispositivo.
                    </p>
                </div>
            </div>
            </Modal>
            <ConfirmModal
                isOpen={isClearCacheConfirmOpen}
                onClose={() => setIsClearCacheConfirmOpen(false)}
                onConfirm={handleClearCache}
                title="¿Limpiar la caché de narración?"
                message={`Se eliminarán únicamente los audios guardados localmente para el capítulo «${activeChapter?.title || 'activo'}». Esta acción no modifica ningún manuscrito ni el respaldo en la nube.`}
                confirmText="Limpiar caché"
            />
        </>
    );
};

export default NarradorSettingsModal;
