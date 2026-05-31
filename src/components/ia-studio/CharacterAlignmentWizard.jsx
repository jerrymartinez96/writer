import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import { useData } from '../../context/DataContext';
import { AIService } from '../../services/AIService';
import { applyPatch, computeWordDiff } from './IAStudioUtils';
import { 
    Sparkles, Users, Bookmark, FileText, Check, AlertTriangle, Loader2, ArrowRight, ArrowLeft, CheckCircle2, XCircle
} from 'lucide-react';

const CharacterAlignmentWizard = ({ isOpen, onClose }) => {
    const { 
        characters, worldItems, updateCharacter, updateWorldItem, profile, flushAllSaves
    } = useData();

    // Wizard Steps: 1 (Context Selection), 2 (User Instruction), 3 (Diff Preview), 4 (Saving Progress Screen)
    const [step, setStep] = useState(1);
    
    // Step 1 State: Selections
    const [selectedCharIds, setSelectedCharIds] = useState([]);
    const [includeGeneralInfo, setIncludeGeneralInfo] = useState(true);

    // Step 2 State: Prompt / Instruction
    const [instruction, setInstruction] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Step 3 State: Proposed Patches
    const [proposedPatches, setProposedPatches] = useState([]); // Array of { id, docId, docTitle, type: 'character'|'world', original, replacement, approved: true }

    // Step 4 State: Saving Progress Tracker
    const [savingPatches, setSavingPatches] = useState([]); // Array of { id, docTitle, status: 'pending'|'saving'|'success'|'error', error?: string }
    const [isSaveFinished, setIsSaveFinished] = useState(false);

    // Sync selections when characters open
    useEffect(() => {
        if (isOpen) {
            setSelectedCharIds(characters.filter(c => !c.isCategory).map(c => c.id));
            setIncludeGeneralInfo(true);
            setStep(1);
            setInstruction('');
            setErrorMessage('');
            setProposedPatches([]);
            setSavingPatches([]);
            setIsSaveFinished(false);
        }
    }, [isOpen, characters]);

    // Handle toggling character selections
    const toggleCharacter = (id) => {
        setSelectedCharIds(prev => 
            prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
        );
    };

    // Quick selections
    const selectAll = () => setSelectedCharIds(characters.filter(c => !c.isCategory).map(c => c.id));
    const selectNone = () => setSelectedCharIds([]);

    // Call AI to generate patches
    const handleGeneratePatches = async () => {
        if (!instruction.trim()) {
            setErrorMessage('Por favor, ingresa una instrucción o detalle a afinar.');
            return;
        }

        setLoading(true);
        setErrorMessage('');
        
        try {
            const aiConfig = profile?.aiConfig || {};
            const apiKey = aiConfig.deepseekApiKey || profile?.deepseekApiKey || localStorage.getItem('deepseekApiKey') || '';
            
            if (!apiKey) {
                throw new Error('API Key de DeepSeek no configurada. Por favor ve a Configuración.');
            }

            const selectedCharactersData = characters.filter(c => selectedCharIds.includes(c.id));
            const generalInfoDoc = worldItems.find(w => w.id === 'system_core');

            let contextPayload = "DOCUMENTOS A ANALIZAR Y EDITAR:\n\n";
            
            selectedCharactersData.forEach(char => {
                contextPayload += `--- PERSONAJE (ID: ${char.id}, NOMBRE: ${char.name}) ---\n`;
                contextPayload += `Rol: ${char.role || 'Sin rol especificado'}\n`;
                contextPayload += `Descripción:\n${char.description || 'Sin descripción'}\n\n`;
            });

            if (includeGeneralInfo && generalInfoDoc) {
                contextPayload += `--- INFORMACIÓN GENERAL DEL LIBRO (ID: system_core, TÍTULO: ${generalInfoDoc.title}) ---\n`;
                contextPayload += `Contenido:\n${generalInfoDoc.content || 'Sin contenido'}\n\n`;
            }

            const prompt = [
                {
                    role: "system",
                    content: `Eres un asistente de escritura de nivel profesional y un experto en consistencia de lore de novelas.
Tu objetivo es analizar los documentos de personajes e información general del libro provistos por el usuario, y realizar modificaciones quirúrgicas a los textos basadas en la instrucción del usuario.

Debes utilizar la herramienta 'aplicar_parches_resolucion' para proponer los parches a aplicar.
Cada parche debe contener:
- 'documento_id': El ID exacto del documento (ej: el ID del personaje o 'system_core' para información general).
- 'texto_original': Un fragmento exacto que se encuentre textualmente en el documento que vas a modificar. DEBE ser un fragmento idéntico para que el reemplazo funcione.
- 'texto_reemplazo': El nuevo texto con los ajustes o afinamientos realizados.

Reglas muy importantes:
1. Solo propón parches para los documentos que realmente necesiten ser actualizados para cumplir con la instrucción del usuario.
2. Si la instrucción del usuario genera consecuencias indirectas en la Información General o en otros personajes, propón parches para ellos también.
3. Asegúrate de que el 'texto_original' sea una copia exacta de caracteres y palabras que existen en los documentos provistos, o de lo contrario el parche fallará.`
                },
                {
                    role: "user",
                    content: `${contextPayload}
INSTRUCCIÓN DEL ESCRITOR:
"${instruction}"

Analiza todos los documentos, detecta los impactos lógicos de esta instrucción y propón los parches correspondientes utilizando la herramienta 'aplicar_parches_resolucion'.`
                }
            ];

            const modelId = aiConfig.defaultModel || 'deepseek-v4-flash';
            
            const responseText = await AIService.sendMessage(prompt, apiKey, {
                model: modelId,
                enableTools: true,
                temperature: 0.2
            });

            let parsedResult = null;
            try {
                parsedResult = JSON.parse(responseText);
            } catch (e) {
                if (typeof responseText === 'object') {
                    parsedResult = responseText;
                }
            }

            let parchesRaw = [];
            if (parsedResult && parsedResult.parches) {
                parchesRaw = parsedResult.parches;
            } else if (Array.isArray(parsedResult)) {
                parchesRaw = parsedResult;
            } else {
                const match = responseText.match(/\{[\s\S]*\}/);
                if (match) {
                    try {
                        const parsedMatch = JSON.parse(match[0]);
                        parchesRaw = parsedMatch.parches || parsedMatch;
                    } catch (err) {}
                }
            }

            if (!Array.isArray(parchesRaw) || parchesRaw.length === 0) {
                throw new Error("La IA no detectó cambios necesarios o no pudo formatear los parches correctamente para esta instrucción.");
            }

            const mappedPatches = parchesRaw.map((p, idx) => {
                let docTitle = p.documento_id;
                let type = 'character';

                if (p.documento_id === 'system_core') {
                    docTitle = 'Información General';
                    type = 'world';
                } else {
                    const charObj = characters.find(c => c.id === p.documento_id);
                    if (charObj) {
                        docTitle = charObj.name;
                    } else {
                        const worldObj = worldItems.find(w => w.id === p.documento_id);
                        if (worldObj) {
                            docTitle = worldObj.title;
                            type = 'world';
                        }
                    }
                }

                return {
                    id: `patch_${idx}_${Date.now()}`,
                    docId: p.documento_id,
                    docTitle,
                    type,
                    original: p.texto_original,
                    replacement: p.texto_reemplazo,
                    approved: true
                };
            });

            setProposedPatches(mappedPatches);
            setStep(3);

        } catch (error) {
            console.error("Error generating patches:", error);
            setErrorMessage(error.message || "Ocurrió un error inesperado al procesar con la IA.");
        } finally {
            setLoading(false);
        }
    };

    // Apply the approved patches with visual step-by-step progress tracking
    const handleApplyPatches = async () => {
        const approvedOnly = proposedPatches.filter(p => p.approved);
        
        if (approvedOnly.length === 0) {
            setErrorMessage('No hay parches aprobados para aplicar.');
            return;
        }

        // Switch to step 4 (Saving Progress Screen)
        setStep(4);
        setLoading(true);
        setIsSaveFinished(false);

        // Initialize progress status array
        const initialProgress = approvedOnly.map(p => ({
            id: p.id,
            docTitle: p.docTitle,
            status: 'pending'
        }));
        setSavingPatches(initialProgress);

        let overallSuccess = true;
        let successCount = 0;
        
        try {
            for (let i = 0; i < approvedOnly.length; i++) {
                const patch = approvedOnly[i];
                
                // Update status of current patch to 'saving'
                setSavingPatches(prev => prev.map(p => p.id === patch.id ? { ...p, status: 'saving' } : p));
                
                // Mimic small artificial delay so the user can easily see the progress
                await new Promise(r => setTimeout(r, 600));

                try {
                    if (patch.type === 'character') {
                        const char = characters.find(c => c.id === patch.docId);
                        if (char) {
                            const currentText = char.description || '';
                            const { success, html: patchedHtml } = applyPatch(currentText, patch.original, patch.replacement);
                            
                            const htmlToSave = success
                                ? patchedHtml
                                : currentText + `<p><em>Actualización:</em> ${patch.replacement}</p>`;

                            // Update local state (debounced internally)
                            await updateCharacter(patch.docId, { description: htmlToSave });
                            // Immediately flush the debounce to write to Firebase RIGHT NOW
                            await flushAllSaves();

                            successCount++;
                            setSavingPatches(prev => prev.map(p => p.id === patch.id ? { ...p, status: 'success' } : p));
                        } else {
                            throw new Error("No se encontró el personaje especificado en la base de datos.");
                        }
                    } else {
                        const item = worldItems.find(w => w.id === patch.docId);
                        if (item) {
                            const currentText = item.content || '';
                            const { success, html: patchedHtml } = applyPatch(currentText, patch.original, patch.replacement);
                            
                            const htmlToSave = success
                                ? patchedHtml
                                : currentText + `<p><em>Actualización:</em> ${patch.replacement}</p>`;

                            // Update local state (debounced internally)
                            await updateWorldItem(patch.docId, { content: htmlToSave });
                            // Immediately flush the debounce to write to Firebase RIGHT NOW
                            await flushAllSaves();

                            successCount++;
                            setSavingPatches(prev => prev.map(p => p.id === patch.id ? { ...p, status: 'success' } : p));
                        } else {
                            throw new Error("No se encontró el documento especificado en la base de datos.");
                        }
                    }
                } catch (patchErr) {
                    console.error(`Error saving patch ${patch.id}:`, patchErr);
                    overallSuccess = false;
                    setSavingPatches(prev => prev.map(p => p.id === patch.id ? { ...p, status: 'error', error: patchErr.message } : p));
                }
            }

            // Dispatch global success toast
            if (overallSuccess) {
                window.dispatchEvent(new CustomEvent('ia-toast', {
                    detail: { message: `🎉 ¡Lore alineado! Se aplicaron ${successCount} parches correctamente en tu manuscrito.`, type: 'success' }
                }));
            } else {
                window.dispatchEvent(new CustomEvent('ia-toast', {
                    detail: { message: `⚠️ Se aplicaron algunos parches pero otros fallaron. Revisa los detalles.`, type: 'warning' }
                }));
            }

        } catch (err) {
            console.error("Fatal error during alignment execution:", err);
            setErrorMessage(`Error fatal al aplicar la alineación: ${err.message}`);
        } finally {
            setLoading(false);
            setIsSaveFinished(true);
        }
    };

    const togglePatchApproval = (id) => {
        setProposedPatches(prev => 
            prev.map(p => p.id === id ? { ...p, approved: !p.approved } : p)
        );
    };

    const renderSemanticDiff = (originalText, replacementText) => {
        const cleanOrig = originalText.replace(/<[^>]*>/g, '').trim();
        const cleanRep = replacementText.replace(/<[^>]*>/g, '').trim();
        const diffs = computeWordDiff(cleanOrig, cleanRep);

        return (
            <div className="p-4 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl leading-relaxed text-xs text-[var(--text-main)] break-words font-sans">
                {diffs.map(([op, text], idx) => {
                    if (op === -1) {
                        return (
                            <span key={idx} className="bg-red-500/10 text-red-600 line-through px-1 mx-0.5 rounded" title="Eliminado">
                                {text}
                            </span>
                        );
                    }
                    if (op === 1) {
                        return (
                            <span key={idx} className="bg-emerald-500/10 text-emerald-600 font-bold px-1 mx-0.5 rounded" title="Añadido">
                                {text}
                            </span>
                        );
                    }
                    return <span key={idx}>{text}</span>;
                })}
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Alineador de Elenco & Lore" size="xl">
            <div className="flex flex-col h-[70vh] font-sans">
                
                {/* Header Progress Indicators */}
                <div className="flex justify-between items-center px-8 py-4 border-b border-[var(--border-main)]/60 bg-[var(--bg-editor)]/40 shrink-0">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${step === 1 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)]'}`}>1</div>
                            <span className={`text-[10px] font-black uppercase tracking-wider ${step === 1 ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Elenco</span>
                        </div>
                        <ArrowRight size={12} className="text-[var(--text-muted)]/50" />
                        <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${step === 2 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)]'}`}>2</div>
                            <span className={`text-[10px] font-black uppercase tracking-wider ${step === 2 ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Instrucción</span>
                        </div>
                        <ArrowRight size={12} className="text-[var(--text-muted)]/50" />
                        <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${step === 3 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)]'}`}>3</div>
                            <span className={`text-[10px] font-black uppercase tracking-wider ${step === 3 ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>Previsualizar</span>
                        </div>
                        {step === 4 && (
                            <>
                                <ArrowRight size={12} className="text-[var(--text-muted)]/50" />
                                <div className="flex items-center gap-2 animate-pulse">
                                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black shadow-md">4</div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Guardando</span>
                                </div>
                            </>
                        )}
                    </div>

                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent-main)] bg-[var(--accent-soft)] px-3 py-1 rounded-full border border-[var(--accent-main)]/10 flex items-center gap-1.5 shadow-sm">
                        <Sparkles size={10} className="text-[var(--accent-main)] animate-pulse" /> Inteligencia Artificial
                    </span>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-8 min-h-0 bg-[var(--bg-editor)]/10">
                    
                    {/* Error Alerts */}
                    {errorMessage && (
                        <div className="mb-6 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-500 text-sm animate-in slide-in-from-top-4 duration-300">
                            <AlertTriangle size={20} className="shrink-0" />
                            <p className="font-semibold">{errorMessage}</p>
                        </div>
                    )}

                    {/* STEP 1: SELECT CONTEXT */}
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {/* Banner Tip */}
                            <div className="p-6 bg-gradient-to-r from-indigo-500/5 to-blue-500/5 border border-indigo-500/15 rounded-2xl flex items-start gap-4.5 shadow-sm">
                                <div className="p-3 bg-indigo-500/10 rounded-xl">
                                    <Sparkles size={20} className="text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-bold text-indigo-600 dark:text-indigo-400 text-xs uppercase tracking-widest leading-none">Recomendación de alineación</h4>
                                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                        Recomendamos enviar a todo el elenco de personajes e Información General para que la IA pueda auditar el impacto multidimensional y prevenir inconsistencias narrativas en tu lore.
                                    </p>
                                </div>
                            </div>

                            {/* Options header */}
                            <div className="flex items-center justify-between pt-2 border-b border-[var(--border-main)]/50 pb-3">
                                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Elige el Elenco a sincronizar</span>
                                <div className="flex gap-2">
                                    <button onClick={selectAll} className="px-3 py-1 text-[9px] font-black uppercase bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 rounded-lg border border-indigo-500/10 cursor-pointer active:scale-95 transition-all">Todos</button>
                                    <button onClick={selectNone} className="px-3 py-1 text-[9px] font-black uppercase bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]/80 text-[var(--text-muted)] rounded-lg border border-[var(--border-main)]/40 cursor-pointer active:scale-95 transition-all">Ninguno</button>
                                </div>
                            </div>

                            {/* Characters Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {/* Special Item: system_core */}
                                <button
                                    onClick={() => setIncludeGeneralInfo(!includeGeneralInfo)}
                                    className={`group flex items-center gap-3 p-3 rounded-2xl border text-left cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-95 ${
                                        includeGeneralInfo 
                                            ? 'bg-indigo-500/[0.04] border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-inner' 
                                            : 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/50'
                                    }`}
                                >
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                                        includeGeneralInfo ? 'bg-indigo-500/10 text-indigo-500' : 'bg-[var(--bg-editor)] text-[var(--text-muted)]'
                                    }`}>
                                        <Bookmark size={15} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="text-[10.5px] font-bold text-[var(--text-main)] block truncate leading-tight">Información General</span>
                                        <span className="text-[8px] text-[var(--text-muted)] opacity-60 block truncate uppercase mt-0.5 font-bold tracking-wider">system_core</span>
                                    </div>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                                        includeGeneralInfo ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-[var(--border-main)]'
                                    }`}>
                                        {includeGeneralInfo && <Check size={10} strokeWidth={4} />}
                                    </div>
                                </button>

                                {/* Character Items */}
                                {characters.filter(c => !c.isCategory).map(char => {
                                    const isChecked = selectedCharIds.includes(char.id);
                                    return (
                                        <button
                                            key={char.id}
                                            onClick={() => toggleCharacter(char.id)}
                                            className={`group flex items-center gap-3 p-3 rounded-2xl border text-left cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-95 ${
                                                isChecked 
                                                    ? 'bg-indigo-500/[0.04] border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-inner' 
                                                    : 'bg-[var(--bg-app)] border-[var(--border-main)] text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/50'
                                            }`}
                                        >
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                                                isChecked ? 'bg-indigo-500/10 text-indigo-500' : 'bg-[var(--bg-editor)] text-[var(--text-muted)]'
                                            }`}>
                                                <Users size={15} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[10.5px] font-bold text-[var(--text-main)] block truncate leading-tight">{char.name}</span>
                                                <span className="text-[8px] text-[var(--text-muted)] opacity-60 block truncate uppercase mt-0.5 tracking-wider font-bold">{char.role || 'Elenco'}</span>
                                            </div>
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                                                isChecked ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-[var(--border-main)]'
                                            }`}>
                                                {isChecked && <Check size={10} strokeWidth={4} />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* STEP 2: USER INSTRUCTION */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in duration-300 h-full flex flex-col">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider ml-1">¿Qué cambios o afinaciones quieres realizar en el Elenco y Lore?</label>
                                <textarea
                                    autoFocus
                                    value={instruction}
                                    onChange={(e) => setInstruction(e.target.value)}
                                    placeholder="Ej: Envejece a todos los personajes 5 años, haz que la sinopsis general y sus orígenes reflejen este salto de tiempo."
                                    className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl px-6 py-5 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all text-[var(--text-main)] text-base min-h-[160px] resize-none font-sans"
                                />
                            </div>

                            {/* Showcase selections */}
                            <div className="p-4 bg-[var(--bg-editor)]/30 rounded-2xl border border-[var(--border-main)]/60 text-xs text-[var(--text-muted)] flex items-center gap-2">
                                <span className="font-bold">Contexto Enviado:</span> 
                                <span>{selectedCharIds.length} personajes</span>
                                {includeGeneralInfo && <span>+ Información General (system_core)</span>}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: PREVIEW DIFFS */}
                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="flex items-center justify-between border-b border-[var(--border-main)]/50 pb-3">
                                <div>
                                    <h4 className="font-bold text-sm text-[var(--text-main)]">Parches e Inconsistencias Detectadas</h4>
                                    <p className="text-xs text-[var(--text-muted)]">Revisa y selecciona cuáles modificaciones deseas aplicar quirúrgicamente a tus documentos.</p>
                                </div>
                                <span className="bg-indigo-500/10 text-indigo-600 px-3 py-1 rounded-full text-xs font-black shrink-0">
                                    {proposedPatches.filter(p => p.approved).length} / {proposedPatches.length} Aprobados
                                </span>
                            </div>

                            {/* Proposed Patches List */}
                            <div className="space-y-4">
                                {proposedPatches.map((patch) => {
                                    return (
                                        <div 
                                            key={patch.id} 
                                            onClick={() => togglePatchApproval(patch.id)}
                                            className={`p-6 border rounded-2xl transition-all duration-300 cursor-pointer flex gap-4 ${
                                                patch.approved 
                                                    ? 'bg-[var(--bg-app)] border-indigo-500 shadow-md shadow-indigo-600/[0.02]' 
                                                    : 'bg-[var(--bg-app)]/50 border-[var(--border-main)] opacity-60 hover:opacity-85'
                                            }`}
                                        >
                                            {/* Checkbox */}
                                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                                                patch.approved ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-[var(--border-main)]'
                                            }`}>
                                                {patch.approved && <Check size={12} strokeWidth={4} />}
                                            </div>

                                            {/* Content */}
                                            <div className="space-y-3 flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                                                        {patch.type === 'character' ? <Users size={12} /> : <Bookmark size={12} />}
                                                        {patch.docTitle}
                                                    </span>
                                                    <span className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--accent-soft)]">
                                                        {patch.type === 'character' ? 'Ficha de Personaje' : 'Documento General'}
                                                    </span>
                                                </div>

                                                {/* Semantic Word-level Diff View */}
                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest block mb-1">Diferencia Semántica Propuesta</span>
                                                    {renderSemanticDiff(patch.original, patch.replacement)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* STEP 4: SAVING PROGRESS SCREEN */}
                    {step === 4 && (
                        <div className="flex flex-col items-center justify-center py-10 space-y-8 animate-in fade-in duration-300 font-sans max-w-lg mx-auto">
                            {!isSaveFinished ? (
                                <div className="text-center space-y-4">
                                    <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto border border-indigo-500/10">
                                        <Loader2 size={32} className="text-indigo-600 animate-spin" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-[var(--text-main)]">Guardando cambios de lore...</h3>
                                        <p className="text-xs text-[var(--text-muted)] mt-1">Guardando secuencialmente cada ficha y actualizando la base de datos de Firestore.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center space-y-4">
                                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/15">
                                        <CheckCircle2 size={32} className="text-emerald-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-[var(--text-main)]">¡Alineación Completada!</h3>
                                        <p className="text-xs text-[var(--text-muted)] mt-1">Los cambios se guardaron con éxito. Las fichas de personajes y el documento central están sincronizados reactivamente.</p>
                                    </div>
                                </div>
                            )}

                            {/* Active Patches Progress Grid */}
                            <div className="w-full bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-5 shadow-sm space-y-3">
                                <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block border-b border-[var(--border-main)]/60 pb-2">Estado de Escritura en Firestore</span>
                                
                                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                    {savingPatches.map((patchProgress) => (
                                        <div key={patchProgress.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-editor)]/30 border border-[var(--border-main)]/40 text-xs">
                                            <span className="font-semibold text-[var(--text-main)] truncate max-w-[70%]">{patchProgress.docTitle}</span>
                                            
                                            <div className="flex items-center gap-2">
                                                {patchProgress.status === 'pending' && (
                                                    <span className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-wider bg-[var(--accent-soft)] px-2 py-0.5 rounded">Pendiente</span>
                                                )}
                                                {patchProgress.status === 'saving' && (
                                                    <span className="text-[10px] text-indigo-500 font-black uppercase tracking-wider bg-indigo-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                        <Loader2 size={10} className="animate-spin" /> Escribiendo
                                                    </span>
                                                )}
                                                {patchProgress.status === 'success' && (
                                                    <span className="text-[10px] text-emerald-600 font-black uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                        <Check size={10} /> Sincronizado
                                                    </span>
                                                )}
                                                {patchProgress.status === 'error' && (
                                                    <span className="text-[10px] text-red-500 font-black uppercase tracking-wider bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1" title={patchProgress.error}>
                                                        <XCircle size={10} /> Error
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Buttons Section */}
                <div className="px-8 py-5 border-t border-[var(--border-main)]/60 bg-[var(--bg-editor)]/40 flex justify-between shrink-0">
                    <div>
                        {step > 1 && step < 4 && (
                            <button
                                onClick={() => setStep(step - 1)}
                                disabled={loading}
                                className="px-6 py-3 border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]/50 rounded-xl transition-all text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                                <ArrowLeft size={14} /> Atrás
                            </button>
                        )}
                    </div>

                    <div className="flex gap-3">
                        {step < 4 ? (
                            <button
                                onClick={onClose}
                                disabled={loading}
                                className="px-6 py-3 border border-[var(--border-main)]/60 text-[var(--text-muted)] hover:bg-[var(--bg-editor)] rounded-xl transition-all text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                        ) : null}

                        {step === 1 && (
                            <button
                                onClick={() => setStep(2)}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 shadow-md shadow-indigo-600/10 flex items-center gap-2"
                            >
                                Continuar <ArrowRight size={14} />
                            </button>
                        )}

                        {step === 2 && (
                            <button
                                onClick={handleGeneratePatches}
                                disabled={loading || !instruction.trim()}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 shadow-md shadow-indigo-600/15 flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
                            >
                                {loading ? (
                                    <><Loader2 size={14} className="animate-spin" /> Analizando Lore...</>
                                ) : (
                                    <><Sparkles size={14} /> Analizar & Corregir</>
                                )}
                            </button>
                        )}

                        {step === 3 && (
                            <button
                                onClick={handleApplyPatches}
                                disabled={loading || proposedPatches.filter(p => p.approved).length === 0}
                                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 shadow-lg shadow-emerald-600/15 flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
                            >
                                {loading ? (
                                    <><Loader2 size={14} className="animate-spin" /> Guardando...</>
                                ) : (
                                    <><Check size={14} /> Aplicar Parches</>
                                )}
                            </button>
                        )}

                        {step === 4 && isSaveFinished && (
                            <button
                                onClick={onClose}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 shadow-lg"
                            >
                                Entendido
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default CharacterAlignmentWizard;
