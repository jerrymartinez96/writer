import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import {
    Hammer, Sparkles, MessageSquare, Database, Plus, ChevronRight,
    Layers, Zap, Search, AlertTriangle, FileText, Bookmark, Users,
    Package, HelpCircle, FolderPlus, Folder, ChevronDown, Mic, MicOff, PhoneOff
} from 'lucide-react';
import AIService from '../services/AIService';
import { generateComprehensiveWorldContext } from './ia-studio/IAStudioUtils';
import { geminiLive, LiveState } from '../services/GeminiLiveService';
import { FORGE_TOOL_DECLARATIONS, executeForgeActions } from '../services/ForgeActionExecutor';
import ForgeAudioControls from './forge/ForgeAudioControls';
import ForgeVoiceIndicator from './forge/ForgeVoiceIndicator';

// ─── Smart Tag Parser ───────────────────────────────────────────────
// Parses AI responses with semantic markers into structured blocks
const parseSmartResponse = (rawContent) => {
    if (!rawContent) return [{ type: 'text', content: '' }];

    const blocks = [];
    // Regex to find [ASSET title="..." type="..."] ... [/ASSET]
    const assetRegex = /\[ASSET\s+title="([^"]*)"\s+type="([^"]*)"\]([\s\S]*?)\[\/ASSET\]/g;
    let lastIndex = 0;
    let match;

    while ((match = assetRegex.exec(rawContent)) !== null) {
        // Text before this asset block
        if (match.index > lastIndex) {
            const textBefore = rawContent.substring(lastIndex, match.index).trim();
            if (textBefore) {
                blocks.push({ type: 'text', content: textBefore });
            }
        }
        // The asset block itself
        blocks.push({
            type: 'asset',
            title: match[1],
            assetType: match[2].toLowerCase(), // 'personaje', 'lugar', 'objeto', 'lore', 'sistema', etc.
            content: match[3].trim()
        });
        lastIndex = match.index + match[0].length;
    }

    // Remaining text after last asset
    if (lastIndex < rawContent.length) {
        const remaining = rawContent.substring(lastIndex).trim();
        if (remaining) {
            blocks.push({ type: 'text', content: remaining });
        }
    }

    // If no blocks were found (no markers), return raw content as single text block
    if (blocks.length === 0) {
        blocks.push({ type: 'text', content: rawContent });
    }

    return blocks;
};

// ─── Markdown → Plain Text Cleaner ───────────────────────────────
const cleanMarkdownToPlain = (text) => {
    if (!text) return '';
    return text
        .replace(/^#{1,6}\s+/gm, '')        // # Headings
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // ***bold italic***
        .replace(/\*\*(.+?)\*\*/g, '$1')      // **bold**
        .replace(/\*(.+?)\*/g, '$1')          // *italic*
        .replace(/__(.+?)__/g, '$1')          // __underline__
        .replace(/_(.+?)_/g, '$1')            // _italic_
        .replace(/~~(.+?)~~/g, '$1')          // ~~strikethrough~~
        .replace(/`(.+?)`/g, '$1')            // `code`
        .replace(/^\s*[-*+]\s+/gm, '• ')     // - list items → •
        .replace(/^\s*\d+\.\s+/gm, (m) => m.replace(/^\s*/, ''))  // keep numbered lists clean
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [link](url) → link
        .replace(/^>\s?/gm, '')               // > blockquotes
        .replace(/---+/g, '')                 // --- horizontal rules
        .replace(/\n{3,}/g, '\n\n')           // collapse excessive newlines
        .trim();
};

// ─── Asset Type → Folder Name Mapping ───────────────────────────────
const ASSET_TYPE_FOLDER_MAP = {
    'personaje': null, // Characters go to the characters system, not worldItems
    'lugar': 'Lugares',
    'objeto': 'Objetos',
    'lore': 'Lore',
    'sistema': 'Sistemas y Magia',
    'faccion': 'Facciones',
    'regla': 'Reglas del Mundo',
    'evento': 'Eventos',
    'criatura': 'Criaturas',
};

// ─── Component ──────────────────────────────────────────────────────
const ForgeView = () => {
    const {
        activeBook, characters, worldItems, chapters, updateBookData,
        createCharacter, createWorldItem, updateWorldItem, updateCharacter,
        deleteWorldItem, deleteCharacter, createChapter
    } = useData();
    const toast = useToast();

    // The Forge State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [chatHistory, setChatHistory] = useState([
        { role: 'system', content: 'Bienvenido a La Forja. Selecciona un activo del Master Doc o empieza a idear desde cero.' }
    ]);
    const [currentInput, setCurrentInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    // Anvil (Solidification) State
    const [showSolidify, setShowSolidify] = useState(false);
    const [solidifyData, setSolidifyData] = useState({ title: '', content: '', type: 'master_card', role: '', parentId: null, newFolderName: '' });
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);

    // ─── Gemini Live Audio State ─────────────────────────────────────
    const [forgeMode, setForgeMode] = useState('classic'); // 'classic' | 'live'
    const [inputMode, setInputMode] = useState('text');   // 'text' | 'voice'
    const [outputMode, setOutputMode] = useState('text');  // 'text' | 'voice'
    const [liveState, setLiveState] = useState(LiveState.DISCONNECTED);
    const [isRecording, setIsRecording] = useState(false);
    const [isModelSpeaking, setIsModelSpeaking] = useState(false);
    const liveSessionRef = useRef(false); // tracks if live session is active
    const actionContextRef = useRef(null); // holds latest context for action execution

    // Get all existing category folders
    const existingFolders = useMemo(() => {
        return worldItems.filter(item => item.isCategory).map(f => ({ id: f.id, title: f.title }));
    }, [worldItems]);

    const chatScrollRef = useRef(null);

    // Auto-scroll chat
    useEffect(() => {
        if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
    }, [chatHistory]);

    // ─── Keep action context ref updated ─────────────────────────────
    useEffect(() => {
        actionContextRef.current = {
            worldItems, characters, chapters,
            createWorldItem, updateWorldItem, deleteWorldItem,
            createCharacter, updateCharacter, deleteCharacter,
            createChapter,
        };
    }, [worldItems, characters, chapters, createWorldItem, updateWorldItem, deleteWorldItem, createCharacter, updateCharacter, deleteCharacter, createChapter]);

    // Fast Filter
    const filteredItems = [...worldItems, ...characters].filter(item => {
        if (item.isCategory) return false;
        const searchTerms = searchQuery.toLowerCase();
        return (item.title || item.name || '').toLowerCase().includes(searchTerms);
    }).slice(0, 10);

    // ─── The Core System Prompt with Smart Tags ─────────────────────
    const buildSystemPrompt = useCallback(() => {
        const masterContext = generateComprehensiveWorldContext(worldItems, {}, { includeEstructura: true, includeNotasGenerales: true, includeCharacters: true }, characters, []);

        let prompt = `Eres el 'Arquitecto de Mundos', una IA de élite residente en 'La Forja'. Ayudas al autor a refinar, expandir y crear activos para el Master Doc.

REGLAS DE COMUNICACIÓN:
1. Sé directo y preciso. No uses saludos repetitivos, rellenos ni frases como "Entendido", "¡Claro!", "Perfecto". Ve al grano.
2. Cuando generes contenido que sea un ACTIVO CONCRETO (un personaje, lugar, objeto, sistema de magia, facción, regla del mundo, etc.) que se pueda guardar en el Master Doc, DEBES envolverlo con marcadores especiales.
3. Los marcadores son: [ASSET title="Nombre del Activo" type="tipo"] contenido [/ASSET]
4. Los tipos válidos son: personaje, lugar, objeto, lore, sistema, faccion, regla, evento, criatura
5. IMPORTANTISIMO: El contenido dentro de un [ASSET] debe ser TEXTO PLANO. NO uses formato Markdown. Nada de **negritas**, *cursivas*, # títulos, ni - listas con guión. Usa texto limpio, oraciones claras y saltos de línea para separar secciones.
6. Todo lo que NO sea un activo (explicaciones, análisis, preguntas al autor, sugerencias) va FUERA de los marcadores, como texto normal. Ahí SÍ puedes usar formato.
7. Puedes incluir MÚLTIPLES [ASSET] en una sola respuesta si el autor pide varios elementos.
8. Si el autor pide una opinión, análisis o tiene dudas, responde de forma conversacional SIN marcadores.

EJEMPLO DE RESPUESTA CORRECTA:
"He analizado tu idea del sistema de magia. Aquí tienes las fichas:

[ASSET title="Runas Primordiales" type="sistema"]
Las Runas Primordiales son el sistema de magia central del mundo. Se dividen en tres categorías:

Runas de Creación: Permiten manifestar materia a partir de energía pura.
Runas de Enlace: Conectan dos entidades, permitiendo transferencia de propiedades.
Runas de Vacío: Destruyen enlaces existentes entre entidades.

Limitación: Cada runa consume energía vital proporcional a su potencia. Un uso excesivo puede causar daño permanente al portador.
[/ASSET]

[ASSET title="Kael el Destejedor" type="personaje"]
Nombre: Kael
Rol: Antagonista secundario / Aliado eventual
Descripción: Un ex-académico que descubrió cómo invertir las Runas de Enlace. Fue exiliado por la Academia. Busca redención.
[/ASSET]

¿Quieres que desarrolle las reglas de limitación de las runas o prefieres definir la Academia primero?"

<master_doc_context>
${masterContext}
</master_doc_context>`;

        if (selectedAsset) {
            const isChar = !!selectedAsset.name;
            const assetData = isChar
                ? `Personaje: ${selectedAsset.name}\nRol: ${selectedAsset.role}\nDesc: ${selectedAsset.description}`
                : `Tarjeta: ${selectedAsset.title}\nContenido: ${selectedAsset.content}`;
            prompt += `\n\n<enfoque_actual>\n${assetData}\n</enfoque_actual>`;
        }

        return prompt;
    }, [worldItems, characters, selectedAsset]);

    // ─── Gemini Live Event Handlers ──────────────────────────────────
    useEffect(() => {
        const unsubs = [];

        // State changes
        unsubs.push(geminiLive.events.on('stateChange', ({ state }) => {
            setLiveState(state);
            if (state === LiveState.DISCONNECTED || state === LiveState.ERROR) {
                liveSessionRef.current = false;
            }
        }));

        unsubs.push(geminiLive.events.on('disconnected', () => {
            liveSessionRef.current = false;
        }));

        // Input transcription (user's voice → text)
        unsubs.push(geminiLive.events.on('inputTranscription', ({ text }) => {
            if (text) {
                setChatHistory(prev => {
                    const last = prev[prev.length - 1];
                    // Accumulate to the last user message if it's still the current turn
                    if (last && last.role === 'user' && last._isLiveTranscription) {
                        const updated = [...prev];
                        updated[updated.length - 1] = { ...last, content: last.content + text };
                        return updated;
                    }
                    return [...prev, { role: 'user', content: text, _isLiveTranscription: true }];
                });
            }
        }));

        // Output transcription (model's voice → text in chat)
        unsubs.push(geminiLive.events.on('outputTranscription', ({ text }) => {
            if (text) {
                setChatHistory(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === 'assistant') {
                        const updated = [...prev];
                        updated[updated.length - 1] = { ...last, content: last.content + text };
                        return updated;
                    }
                    return [...prev, { role: 'assistant', content: text }];
                });
            }
        }));

        // Text chunks (when output mode is text)
        unsubs.push(geminiLive.events.on('textChunk', ({ text }) => {
            if (text) {
                setChatHistory(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === 'assistant') {
                        const updated = [...prev];
                        updated[updated.length - 1] = { ...last, content: last.content + text };
                        return updated;
                    }
                    return [...prev, { role: 'assistant', content: text }];
                });
            }
        }));

        // Turn complete
        unsubs.push(geminiLive.events.on('turnComplete', () => {
            setIsGenerating(false);
            setIsModelSpeaking(false);
        }));

        // Audio playback state
        unsubs.push(geminiLive.events.on('playbackState', ({ playing }) => {
            setIsModelSpeaking(playing);
        }));

        // Audio capture state
        unsubs.push(geminiLive.events.on('audioCapture', ({ active }) => {
            setIsRecording(active);
        }));

        // Tool calls from the model → execute actions
        unsubs.push(geminiLive.events.on('toolCall', async ({ functionCalls }) => {
            if (!functionCalls.length) return;
            const ctx = actionContextRef.current;
            if (!ctx) return;

            // Add action log to chat
            const actionNames = functionCalls.map(fc => fc.name).join(', ');
            setChatHistory(prev => [...prev, {
                role: 'system',
                content: `⚡ Ejecutando: ${actionNames}`
            }]);

            const responses = await executeForgeActions(functionCalls, ctx, (action) => {
                // Toast per executed action
                const label = action.title || action.name || action.type;
                toast.success(`✅ ${action.type}: ${label}`);
            });

            // Send tool responses back to the model
            geminiLive.sendToolResponse(responses);

            // Log results
            const successCount = responses.filter(r => r.response.result.status === 'success').length;
            setChatHistory(prev => [...prev, {
                role: 'system',
                content: `🔨 ${successCount}/${responses.length} acciones completadas`
            }]);
        }));

        // Errors
        unsubs.push(geminiLive.events.on('error', ({ message }) => {
            toast.error('Gemini Live: ' + message);
        }));

        // Interruption (barge-in)
        unsubs.push(geminiLive.events.on('interrupted', () => {
            setIsModelSpeaking(false);
        }));

        return () => unsubs.forEach(unsub => unsub && unsub());
    }, [toast]);

    // ─── Connect / Disconnect Gemini Live ─────────────────────────────
    const connectLive = useCallback(async (targetOutputMode) => {
        const apiKey = activeBook?.aiSettings?.googleApiKey;
        if (!apiKey) {
            toast.error('Configura tu Google API Key en settings primero.');
            return false;
        }

        try {
            const systemPrompt = buildSystemPrompt();
            await geminiLive.connect({
                apiKey,
                systemInstruction: systemPrompt,
                tools: FORGE_TOOL_DECLARATIONS,
                outputMode: targetOutputMode === 'voice' ? 'both' : 'text',
            });
            liveSessionRef.current = true;
            toast.success('🔗 Gemini Live conectado');
            return true;
        } catch (err) {
            toast.error('Error conectando a Gemini Live: ' + err.message);
            return false;
        }
    }, [activeBook?.aiSettings?.googleApiKey, buildSystemPrompt, toast]);

    const disconnectLive = useCallback(() => {
        geminiLive.disconnect();
        liveSessionRef.current = false;
        setIsRecording(false);
        setIsModelSpeaking(false);
    }, []);

    // ─── Mode Switching ──────────────────────────────────────────────
    const handleForgeModeChange = useCallback(async (newMode) => {
        if (newMode === forgeMode) return;
        
        if (newMode === 'classic') {
            disconnectLive();
            setForgeMode('classic');
            setInputMode('text');
            setOutputMode('text');
        } else {
            // Switch to Live
            setForgeMode('live');
            // We'll connect when actually needed or just connect now
            await connectLive(outputMode);
        }
    }, [forgeMode, outputMode, connectLive, disconnectLive]);

    // Cleanup on unmount & page reload
    useEffect(() => {
        const handleUnload = () => {
            if (liveSessionRef.current) {
                geminiLive.disconnect();
            }
        };

        window.addEventListener('beforeunload', handleUnload);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            handleUnload();
        };
    }, []);

    // ─── Mode Change Handlers ────────────────────────────────────────
    const handleInputModeChange = useCallback(async (mode) => {
        if (mode === inputMode) return;

        if (mode === 'voice') {
            // Need live connection for voice input
            if (liveState !== LiveState.READY) {
                const ok = await connectLive(outputMode);
                if (!ok) return;
            }
            try {
                await geminiLive.startAudioCapture();
                setInputMode('voice');
            } catch (e) {
                toast.error('No se pudo acceder al micrófono');
            }
        } else {
            // Switch back to text
            geminiLive.stopAudioCapture();
            setInputMode('text');
        }
    }, [inputMode, outputMode, liveState, connectLive, toast]);

    const handleOutputModeChange = useCallback(async (mode) => {
        if (mode === outputMode) return;
        setOutputMode(mode);

        if (liveState === LiveState.READY) {
            // Already connected — just flip the suppress flag live, no reconnect needed
            geminiLive.setSuppressAudio(mode === 'text');
        } else if (mode === 'voice') {
            // Not connected yet, connect now with voice output
            await connectLive('voice');
        }
    }, [outputMode, liveState, connectLive]);

    // ─── Send message (supports both text REST and Live modes) ───────
    const handleSendLiveText = useCallback((text) => {
        if (!text.trim()) return;
        // Add user message to chat
        setChatHistory(prev => [...prev, { role: 'user', content: text }]);
        setIsGenerating(true);
        // Send through Live WebSocket
        geminiLive.sendText(text);
    }, []);

    // Load selected asset context
    useEffect(() => {
        if (selectedAsset) {
            const contextMsg = {
                role: 'system',
                content: `🔶 Enfoque: ${selectedAsset.name || selectedAsset.title}`
            };
            setChatHistory(prev => [...prev.filter(m => m.role !== 'system'), contextMsg]);
        } else {
            setChatHistory([{ role: 'system', content: 'Bienvenido a La Forja. Selecciona un activo del Master Doc o empieza a idear desde cero.' }]);
        }
    }, [selectedAsset]);

    const handleSendMessage = async () => {
        if (!currentInput.trim() || isGenerating) return;
        const text = currentInput;
        setCurrentInput('');

        // ─── Multimodal / Live Mode ───
        if (forgeMode === 'live' && liveState === LiveState.READY) {
            handleSendLiveText(text);
            return;
        }

        // If in live mode but not ready, attempt connecting
        if (forgeMode === 'live') {
            const ok = await connectLive(outputMode);
            if (ok) {
                handleSendLiveText(text);
                return;
            }
        }

        // ─── Classic REST Mode (Fallback) ───
        const userMsg = { role: 'user', content: text };
        setChatHistory(prev => [...prev, userMsg]);
        setIsGenerating(true);

        try {
            const systemPrompt = buildSystemPrompt();

            const apiMessages = [
                { role: 'user', content: systemPrompt },
                { role: 'assistant', content: 'Entendido. Usaré marcadores [ASSET] para todo contenido solidificable y seré directo.' },
                ...chatHistory.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
                userMsg
            ];

            let forgeModel = activeBook?.aiSettings?.selectedAiModel;
            // Ensure we use a compatible REST model in classic mode
            if (!forgeModel || forgeModel.includes('native-audio')) {
                forgeModel = AIService.MODELS.find(m => m.id.startsWith('google_direct/') && !m.id.includes('native-audio'))?.id || "google_direct/gemini-2.0-flash";
            }

            await AIService.generateStream(apiMessages, {
                selectedAiModel: forgeModel,
                googleApiKey: activeBook?.aiSettings?.googleApiKey,
                openRouterKey: activeBook?.aiSettings?.openRouterKey
            }, (chunk) => {
                setChatHistory(prev => {
                    const newHistory = [...prev];
                    const lastMsgIndex = newHistory.length - 1;
                    const lastMsg = newHistory[lastMsgIndex];
                    if (lastMsg && lastMsg.role === 'assistant') {
                        newHistory[lastMsgIndex] = {
                            ...lastMsg,
                            content: lastMsg.content + chunk
                        };
                    } else {
                        newHistory.push({ role: 'assistant', content: chunk });
                    }
                    return newHistory;
                });
            });

        } catch (error) {
            console.error("Forge Error:", error);
            toast.error("Error al forjar: " + error.message);
            setChatHistory(prev => [...prev, { role: 'assistant', content: '⚠️ Error de conexión en La Forja.' }]);
        } finally {
            setIsGenerating(false);
        }
    };

    // ─── Solidification ─────────────────────────────────────────────
    const findOrSuggestFolder = (assetType) => {
        const suggestedName = ASSET_TYPE_FOLDER_MAP[assetType];
        if (!suggestedName) return null;

        const existing = worldItems.find(item => 
            item.isCategory && item.title?.toLowerCase() === suggestedName.toLowerCase()
        );

        return existing ? existing.id : `__create__${suggestedName}`;
    };

    // Detect if a card or character with the same title already exists
    const findExistingAsset = (title, type) => {
        if (!title) return null;
        const normalizedTitle = title.trim().toLowerCase();

        if (type === 'character') {
            return characters.find(c => !c.isCategory && (c.name || '').trim().toLowerCase() === normalizedTitle) || null;
        } else {
            return worldItems.find(item => !item.isCategory && (item.title || '').trim().toLowerCase() === normalizedTitle) || null;
        }
    };

    const prepareToSolidify = (title = '', content = '', assetType = '') => {
        const isMaybeChar = assetType === 'personaje';
        const detectedParentId = !isMaybeChar ? findOrSuggestFolder(assetType) : null;
        const type = isMaybeChar ? 'character' : 'master_card';

        // Check if an asset with this title already exists
        const existingMatch = findExistingAsset(title, type);

        setSolidifyData({
            title: title || 'Nueva Idea',
            content: cleanMarkdownToPlain(content),
            type,
            role: existingMatch?.role || '',
            parentId: detectedParentId,
            newFolderName: '',
            existingMatch: existingMatch || null // { id, title/name, ... } or null
        });
        setShowNewFolderInput(false);
        setShowSolidify(true);
    };

    const resolveParentId = async () => {
        let { parentId, newFolderName } = solidifyData;

        // Case 1: User wants a brand new folder
        if (showNewFolderInput && newFolderName.trim()) {
            const newFolder = await createWorldItem({ title: newFolderName.trim(), isCategory: true, parentId: null });
            if (newFolder?.id) {
                toast.success(`Carpeta "${newFolderName.trim()}" creada.`);
                return newFolder.id;
            }
            console.warn('createWorldItem for folder returned no id:', newFolder);
            return null;
        }

        // Case 2: Auto-detected "__create__FolderName" → create it now
        if (parentId && typeof parentId === 'string' && parentId.startsWith('__create__')) {
            const folderName = parentId.replace('__create__', '');
            const newFolder = await createWorldItem({ title: folderName, isCategory: true, parentId: null });
            if (newFolder?.id) {
                toast.success(`Carpeta "${folderName}" creada.`);
                return newFolder.id;
            }
            console.warn('createWorldItem for auto-folder returned no id:', newFolder);
            return null;
        }

        // Case 3: Existing folder selected, or null (root)
        return parentId || null;
    };

    const handleSolidify = async () => {
        try {
            const { existingMatch } = solidifyData;

            if (solidifyData.type === 'character') {
                if (existingMatch) {
                    // Update existing character
                    await updateCharacter(existingMatch.id, { 
                        name: solidifyData.title, 
                        role: solidifyData.role, 
                        description: solidifyData.content 
                    });
                    toast.success(`Personaje "${solidifyData.title}" actualizado.`);
                } else {
                    await createCharacter({ 
                        name: solidifyData.title, 
                        role: solidifyData.role, 
                        description: solidifyData.content, 
                        parentId: null, 
                        isCategory: false, 
                        images: [] 
                    });
                    toast.success(`Personaje "${solidifyData.title}" creado.`);
                }
            } else {
                // Master card
                if (existingMatch) {
                    // Update existing world item
                    await updateWorldItem(existingMatch.id, { 
                        title: solidifyData.title, 
                        content: solidifyData.content 
                    });
                    toast.success(`Tarjeta "${solidifyData.title}" actualizada.`);
                } else {
                    // Create new — resolve folder first
                    const resolvedParentId = await resolveParentId();
                    await createWorldItem({ 
                        title: solidifyData.title, 
                        content: solidifyData.content, 
                        parentId: resolvedParentId, 
                        isCategory: false, 
                        images: [] 
                    });
                    // Build friendly label
                    let folderLabel = 'raíz';
                    if (resolvedParentId) {
                        const knownFolder = existingFolders.find(f => f.id === resolvedParentId);
                        folderLabel = knownFolder?.title || solidifyData.newFolderName?.trim() || 
                            (solidifyData.parentId?.startsWith?.('__create__') ? solidifyData.parentId.replace('__create__','') : 'nueva carpeta');
                    }
                    toast.success(`Tarjeta creada en: ${folderLabel}`);
                }
            }
            setShowSolidify(false);
            setShowNewFolderInput(false);
        } catch (e) {
            toast.error("Error al solidificar: " + e.message);
        }
    };

    // ─── Chat Bubble Renderer ───────────────────────────────────────
    const renderAssistantMessage = (msg, msgIndex) => {
        const blocks = parseSmartResponse(msg.content);
        const hasAssets = blocks.some(b => b.type === 'asset');

        return (
            <div className="max-w-[90%] md:max-w-[85%] space-y-3">
                {/* Header */}
                <div className="flex items-center gap-2 text-orange-500 px-1">
                    <Hammer size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Arquitecto</span>
                </div>

                {blocks.map((block, i) => {
                    if (block.type === 'asset') {
                        // ── Solidifiable Asset Card ──
                        const typeIcon = block.assetType === 'personaje' ? <Users size={13} /> : <Package size={13} />;
                        const typeLabel = block.assetType.charAt(0).toUpperCase() + block.assetType.slice(1);

                        return (
                            <div key={`${msgIndex}-${i}`} className="bg-[var(--bg-app)] border-2 border-orange-500/30 rounded-2xl overflow-hidden shadow-md hover:border-orange-500/60 transition-colors group">
                                {/* Asset Header */}
                                <div className="flex items-center justify-between px-4 py-2.5 bg-orange-500/5 border-b border-orange-500/10">
                                    <div className="flex items-center gap-2">
                                        <span className="text-orange-500">{typeIcon}</span>
                                        <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">{typeLabel}</span>
                                        <span className="text-[10px] text-[var(--text-muted)]">·</span>
                                        <span className="text-xs font-bold text-[var(--text-main)]">{block.title}</span>
                                    </div>
                                    <button
                                        onClick={() => prepareToSolidify(block.title, block.content, block.assetType)}
                                        className="px-3 py-1 bg-orange-500 text-white hover:bg-orange-600 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider shadow-sm hover:shadow-md active:scale-95"
                                    >
                                        <Sparkles size={12} /> Solidificar
                                    </button>
                                </div>
                                {/* Asset Content */}
                                <div className="px-4 py-3 text-sm text-[var(--text-main)] leading-relaxed font-serif" style={{ whiteSpace: 'pre-wrap' }}>
                                    {block.content}
                                </div>
                            </div>
                        );
                    } else {
                        // ── Conversational Text ──
                        if (!block.content) return null;
                        return (
                            <div key={`${msgIndex}-${i}`} className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl px-5 py-4 shadow-sm">
                                <div className="text-sm text-[var(--text-main)] leading-relaxed font-serif" style={{ whiteSpace: 'pre-wrap' }}>
                                    {block.content}
                                </div>
                            </div>
                        );
                    }
                })}

                {/* Fallback solidify for the whole message if no assets detected */}
                {!hasAssets && !isGenerating && (
                    <div className="px-1">
                        <button
                            onClick={() => prepareToSolidify('', msg.content, '')}
                            className="px-3 py-1.5 bg-orange-500/10 text-orange-600 hover:bg-orange-500 hover:text-white rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-wider"
                        >
                            <Sparkles size={12} /> Solidificar Respuesta Completa
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full h-full flex flex-col bg-[var(--bg-editor)] overflow-hidden font-sans">
            {/* Minimal Compact Header */}
            <div className="flex-none px-6 py-3 border-b border-[var(--border-main)] bg-[var(--bg-app)]/50 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-orange-500/10 text-orange-500 rounded-lg">
                             <AlertTriangle size={14} />
                        </div>
                        <h1 className="text-sm font-black font-serif text-[var(--accent-main)] tracking-widest uppercase italic">La Forja</h1>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Mode Selector */}
                        <div className="flex bg-[var(--bg-editor)] rounded-lg border border-[var(--border-main)] p-0.5 mr-2">
                            <button
                                onClick={() => handleForgeModeChange('classic')}
                                className={`px-2 py-1 text-[9px] font-black uppercase rounded-md transition-all ${forgeMode === 'classic' ? 'bg-[var(--accent-main)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                            >
                                Clásico
                            </button>
                            <button
                                onClick={() => handleForgeModeChange('live')}
                                className={`px-2 py-1 text-[9px] font-black uppercase rounded-md transition-all flex items-center gap-1.5 ${forgeMode === 'live' ? 'bg-orange-500 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                            >
                                <Sparkles size={8} /> Multimodal
                            </button>
                        </div>

                        {/* Audio Controls (Only in Live mode) */}
                        {forgeMode === 'live' && (
                            <div className="flex items-center gap-2">
                                <ForgeAudioControls
                                    inputMode={inputMode}
                                    outputMode={outputMode}
                                    onInputModeChange={handleInputModeChange}
                                    onOutputModeChange={handleOutputModeChange}
                                    isConnected={liveState === LiveState.READY}
                                    isRecording={isRecording}
                                    isPlaying={isModelSpeaking}
                                    disabled={isGenerating}
                                />

                                {liveState === LiveState.READY && (
                                    <button
                                        onClick={disconnectLive}
                                        title="Desconectar Gemini Live"
                                        className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                        <PhoneOff size={13} />
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="w-px h-4 bg-[var(--border-main)]" />

                        <Zap size={12} className="text-orange-500" />
                        <select 
                            value={activeBook?.aiSettings?.selectedAiModel?.startsWith('google_direct/') ? activeBook?.aiSettings?.selectedAiModel : (AIService.MODELS.find(m => m.id.startsWith('google_direct/'))?.id || "google_direct/gemini-2.0-flash")}
                            onChange={(e) => updateBookData({ 
                                aiSettings: { ...activeBook?.aiSettings, selectedAiModel: e.target.value } 
                            })}
                            className="bg-transparent text-[10px] font-black text-[var(--text-main)] uppercase tracking-wider outline-none cursor-pointer hover:text-orange-500 transition-colors"
                        >
                            {AIService.MODELS.filter(m => m.id.startsWith('google_direct/') && (forgeMode === 'live' ? m.id.includes('native-audio') : !m.id.includes('native-audio'))).map(model => (
                                <option key={model.id} value={model.id} className="bg-[var(--bg-app)] text-[var(--text-main)] text-xs">
                                    {model.name.replace('(Google Directo)', '').trim()}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Armory (Left Sidebar) */}
                <div className="w-72 bg-[var(--bg-app)] border-r border-[var(--border-main)] flex flex-col shrink-0">
                    <div className="p-3 border-b border-[var(--border-main)]">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                placeholder="Buscar activo..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-orange-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                        <div className="text-[9px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-2 px-2">
                            {selectedAsset ? 'Enfoque' : 'Armería'}
                        </div>

                        {selectedAsset ? (
                            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl relative">
                                <button
                                    className="absolute top-2 right-2 p-1 text-orange-500/50 hover:text-orange-500 rounded text-xs"
                                    onClick={() => setSelectedAsset(null)}
                                >✕</button>
                                <div className="flex items-center gap-2 mb-1">
                                    {selectedAsset.name ? <Users size={12} className="text-orange-500" /> : <FileText size={12} className="text-orange-500" />}
                                    <span className="text-[9px] font-black text-orange-600 uppercase tracking-wider">{selectedAsset.name ? 'Personaje' : 'Tarjeta'}</span>
                                </div>
                                <div className="font-bold text-xs text-[var(--text-main)] truncate">{selectedAsset.title || selectedAsset.name}</div>
                            </div>
                        ) : (
                            filteredItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => setSelectedAsset(item)}
                                    className="w-full text-left p-2.5 rounded-lg border border-[var(--border-main)] hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group flex items-center gap-2.5"
                                >
                                    <div className="text-[var(--text-muted)] group-hover:text-orange-500">
                                        {item.name ? <Users size={12} /> : <FileText size={12} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold text-xs truncate">{item.title || item.name}</div>
                                    </div>
                                </button>
                            ))
                        )}

                        {filteredItems.length === 0 && !selectedAsset && searchQuery && (
                            <div className="text-xs text-center text-[var(--text-muted)] py-4">Sin resultados.</div>
                        )}
                    </div>
                </div>

                {/* Chat & Anvil */}
                <div className="flex-1 flex flex-col bg-[var(--bg-editor)] relative">
                    {/* Chat Area */}
                    <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 md:p-8 hide-scrollbar space-y-5">
                        <div className="max-w-4xl mx-auto space-y-5">
                            {chatHistory.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'user' ? (
                                        <div className="max-w-[75%] rounded-2xl px-5 py-3 bg-[var(--accent-main)] text-white shadow-lg text-sm leading-relaxed">
                                            {msg.content}
                                        </div>
                                    ) : msg.role === 'system' ? (
                                        <div className="w-full text-center py-2">
                                            <span className="text-[10px] text-orange-500/60 font-mono uppercase tracking-widest">{msg.content}</span>
                                        </div>
                                    ) : (
                                        renderAssistantMessage(msg, i)
                                    )}
                                </div>
                            ))}
                            {isGenerating && chatHistory[chatHistory.length - 1]?.role !== 'assistant' && (
                                <div className="flex justify-start">
                                    <div className="bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl px-4 py-3 flex items-center gap-3">
                                        <div className="w-3.5 h-3.5 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></div>
                                        <span className="text-xs font-bold text-[var(--text-muted)] animate-pulse">Forjando...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Input Area */}
                    <div className="p-4 md:p-6 border-t border-[var(--border-main)] bg-[var(--bg-app)]/50 backdrop-blur-md z-20">
                        {/* Voice indicator (Live mode only) */}
                        {forgeMode === 'live' && <ForgeVoiceIndicator isRecording={isRecording} isModelSpeaking={isModelSpeaking} />}

                        {forgeMode === 'live' && inputMode === 'voice' ? (
                            /* ─── Live Voice Input Mode ─── */
                            <div className="max-w-4xl mx-auto flex flex-col items-center gap-3 py-2">
                                <button
                                    onClick={() => {
                                        if (isRecording) {
                                            geminiLive.stopAudioCapture();
                                        } else {
                                            geminiLive.startAudioCapture().catch(() => {
                                                toast.error('No se pudo acceder al micrófono');
                                                setInputMode('text');
                                            });
                                        }
                                    }}
                                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 ${
                                        isRecording
                                            ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30 animate-pulse'
                                            : 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/30'
                                    }`}
                                >
                                    {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                                </button>
                                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                    {isRecording ? 'Toca para silenciar' : 'Toca para hablar'}
                                </span>
                                {/* Also allow typing in voice mode */}
                                <div className="w-full max-w-xl relative">
                                    <input
                                        type="text"
                                        value={currentInput}
                                        onChange={(e) => setCurrentInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { e.preventDefault(); handleSendMessage(); }
                                        }}
                                        placeholder="También puedes escribir aquí..."
                                        className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl py-2 px-4 pr-10 text-xs focus:outline-none focus:border-orange-500 transition-colors"
                                    />
                                    {currentInput.trim() && (
                                        <button
                                            onClick={handleSendMessage}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center justify-center text-xs"
                                        >
                                            <Hammer size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* ─── Classic or Live Text Input Mode ─── */
                            <div className="max-w-4xl mx-auto relative">
                                <div className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl p-4 focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-500/10 transition-all shadow-sm">
                                    <textarea
                                        value={currentInput}
                                        onChange={(e) => setCurrentInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                                        }}
                                        placeholder={selectedAsset ? `Refinar "${selectedAsset.name || selectedAsset.title}"...` : "Describe una idea, pide un personaje, un sistema de magia..."}
                                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm leading-relaxed resize-none custom-scrollbar outline-none min-h-[50px] pr-14"
                                        rows={2}
                                    />
                                </div>
                                <button
                                    onClick={handleSendMessage}
                                    disabled={isGenerating || !currentInput.trim()}
                                    className={`absolute right-3 bottom-3 w-9 h-9 ${forgeMode === 'live' ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20' : 'bg-[var(--accent-main)] hover:bg-[var(--accent-dark)] shadow-[var(--accent-main)]/20'} disabled:bg-[var(--border-main)] text-white rounded-xl flex items-center justify-center transition-all shadow-md active:scale-95 disabled:shadow-none z-10`}
                                >
                                    <Hammer size={16} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* The Anvil (Solidification Panel) */}
                    {showSolidify && (
                        <div className="absolute inset-y-0 right-0 w-full md:w-[480px] bg-[var(--bg-app)] border-l border-[var(--border-main)] shadow-2xl flex flex-col z-30 animate-in slide-in-from-right duration-300">
                            <div className="p-4 border-b border-[var(--border-main)] flex justify-between items-center bg-orange-500/5">
                                <div>
                                    <h3 className="text-base font-black font-serif text-[var(--text-main)] flex items-center gap-2">
                                        <Layers size={16} className="text-orange-500" /> El Yunque
                                    </h3>
                                    <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mt-0.5">Moldear y guardar en Master Doc</p>
                                </div>
                                <button onClick={() => setShowSolidify(false)} className="p-2 hover:bg-[var(--bg-editor)] rounded-lg text-[var(--text-muted)]">✕</button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                {/* Existing match detection banner */}
                                {solidifyData.existingMatch && (
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5">
                                        <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-xs font-bold text-amber-600">Activo existente detectado</p>
                                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                                Ya existe "{solidifyData.existingMatch.name || solidifyData.existingMatch.title}" en tu Master Doc. Al solidificar se actualizará su contenido.
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-1 block">Tipo</label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setSolidifyData({ ...solidifyData, type: 'character' })}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-2 ${solidifyData.type === 'character' ? 'bg-orange-500 text-white border-orange-500' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-muted)]'}`}
                                        >
                                            <Users size={13} /> Personaje
                                        </button>
                                        <button
                                            onClick={() => setSolidifyData({ ...solidifyData, type: 'master_card' })}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-2 ${solidifyData.type === 'master_card' ? 'bg-orange-500 text-white border-orange-500' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-muted)]'}`}
                                        >
                                            <FileText size={13} /> Tarjeta
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1 block">Título</label>
                                    <input
                                        type="text"
                                        value={solidifyData.title}
                                        onChange={e => setSolidifyData({ ...solidifyData, title: e.target.value })}
                                        className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 font-bold"
                                    />
                                </div>

                                {/* Folder Selector (only for master_card) */}
                                {solidifyData.type === 'master_card' && (
                                    <div>
                                        <label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                            <Folder size={11} /> Carpeta Destino
                                        </label>
                                        
                                        {!showNewFolderInput ? (
                                            <div className="flex gap-2">
                                                <select
                                                    value={solidifyData.parentId || ''}
                                                    onChange={e => setSolidifyData({ ...solidifyData, parentId: e.target.value || null })}
                                                    className="flex-1 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 cursor-pointer"
                                                >
                                                    <option value="">📁 Raíz (sin carpeta)</option>
                                                    {existingFolders.map(folder => (
                                                        <option key={folder.id} value={folder.id}>📂 {folder.title}</option>
                                                    ))}
                                                    {/* Show auto-detected create options */}
                                                    {solidifyData.parentId?.startsWith?.('__create__') && (
                                                        <option value={solidifyData.parentId}>
                                                            ✨ Crear: "{solidifyData.parentId.replace('__create__', '')}"
                                                        </option>
                                                    )}
                                                </select>
                                                <button
                                                    onClick={() => setShowNewFolderInput(true)}
                                                    title="Crear nueva carpeta"
                                                    className="px-3 bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white rounded-xl transition-all flex items-center gap-1 text-[10px] font-black"
                                                >
                                                    <FolderPlus size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={solidifyData.newFolderName}
                                                    onChange={e => setSolidifyData({ ...solidifyData, newFolderName: e.target.value })}
                                                    placeholder="Nombre de la nueva carpeta..."
                                                    className="flex-1 bg-[var(--bg-editor)] border border-orange-500/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => { setShowNewFolderInput(false); setSolidifyData({ ...solidifyData, newFolderName: '' }); }}
                                                    className="px-3 bg-[var(--bg-editor)] border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-xl transition-all text-xs font-bold"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        )}

                                        {/* Smart detection hint */}
                                        {solidifyData.parentId?.startsWith?.('__create__') && !showNewFolderInput && (
                                            <p className="text-[9px] text-orange-500 mt-1.5 flex items-center gap-1">
                                                <Sparkles size={10} /> Se creará automáticamente al solidificar
                                            </p>
                                        )}
                                    </div>
                                )}

                                {solidifyData.type === 'character' && (
                                    <div>
                                        <label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1 block">Rol</label>
                                        <input
                                            type="text"
                                            value={solidifyData.role}
                                            onChange={e => setSolidifyData({ ...solidifyData, role: e.target.value })}
                                            placeholder="Ej. Guardián de la Puerta..."
                                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                                        />
                                    </div>
                                )}

                                <div className="flex-1 flex flex-col min-h-[250px]">
                                    <label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1 flex items-center justify-between">
                                        <span>Contenido</span>
                                        {solidifyData.existingMatch && <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded text-[8px]">Sobreescribirá el actual</span>}
                                    </label>
                                    <textarea
                                        value={solidifyData.content}
                                        onChange={e => setSolidifyData({ ...solidifyData, content: e.target.value })}
                                        className="w-full flex-1 min-h-[250px] bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl p-4 text-[13px] leading-relaxed focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 custom-scrollbar resize-none font-serif"
                                    />
                                </div>
                            </div>

                            <div className="p-4 border-t border-[var(--border-main)] bg-[var(--bg-editor)]/80 backdrop-blur-sm">
                                <button
                                    onClick={handleSolidify}
                                    className={`w-full py-3.5 ${solidifyData.existingMatch ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20'} text-white font-black rounded-xl uppercase tracking-[0.2em] text-xs shadow-lg transition-all flex items-center justify-center gap-2`}
                                >
                                    {solidifyData.existingMatch ? `Actualizar "${solidifyData.existingMatch.name || solidifyData.existingMatch.title}"` : 'Forjar y Guardar'} <Bookmark size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForgeView;
