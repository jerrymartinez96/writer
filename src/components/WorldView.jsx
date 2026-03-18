import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../context/DataContext';
import { FileText, Image as ImageIcon, Plus, Trash2, Globe, LayoutList, Upload, Loader2, Users, BookOpen, Layers, Folder, ChevronRight, Bookmark, Pencil, ZoomIn, ZoomOut, Link as LinkIcon, Globe2, AlertTriangle, Check } from 'lucide-react';
import Modal from './Modal';
import { useToast } from './Toast';
import { uploadImageToCloudinary } from '../services/cloudinary';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Quote, Heading1, Heading2, Heading3 } from 'lucide-react';

const WorldView = () => {
    const {
        chapters, characters, worldItems,
        createCharacter, updateCharacter, deleteCharacter,
        createWorldItem, updateWorldItem, deleteWorldItem
    } = useData();
    const toast = useToast();

    const [path, setPath] = useState([{ id: 'root', title: 'Master Doc Central', type: 'root' }]);
    const currentStep = path[path.length - 1];

    const pushPath = (step) => setPath([...path, step]);
    const popPath = (index) => setPath(path.slice(0, index + 1));

    useEffect(() => {
        const handleReset = () => {
            setPath([{ id: 'root', title: 'Master Doc Central', type: 'root' }]);
        };
        window.addEventListener('resetWorldView', handleReset);
        return () => window.removeEventListener('resetWorldView', handleReset);
    }, []);

    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createType, setCreateType] = useState('card'); // 'character', 'nota', 'master_category', 'master_card'
    const [newItemTitle, setNewItemTitle] = useState('');

    const [itemToDelete, setItemToDelete] = useState(null);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null); // { id, title, type: 'character' | 'worldItem' }
    const [editTitle, setEditTitle] = useState('');

    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [imageFile, setImageFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [imageTarget, setImageTarget] = useState(null);

    const [isFullImageModalOpen, setIsFullImageModalOpen] = useState(false);
    const [selectedImageUrl, setSelectedImageUrl] = useState('');
    const [zoomLevel, setZoomLevel] = useState(1);

    const [imageSourceType, setImageSourceType] = useState('file'); // 'file' | 'url'
    const [imageUrlInput, setImageUrlInput] = useState('');

    const [isMaximized, setIsMaximized] = useState(false);
    const [localContent, setLocalContent] = useState('');
    const [isUnsaved, setIsUnsaved] = useState(false);

    // Zoom dragging state
    const zoomContainerRef = React.useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const hasDraggedRef = React.useRef(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });

    const handleZoom = (e, direction) => {
        e.stopPropagation();
        setZoomLevel(prev => {
            if (direction === 'in') return Math.min(prev + 0.05, 4);
            if (direction === 'out') return Math.max(prev - 0.05, 1);
            return 1;
        });
    };

    const handleMouseDown = (e) => {
        if (zoomLevel <= 1 || !zoomContainerRef.current) return;
        setIsDragging(true);
        hasDraggedRef.current = false;
        setDragStart({ x: e.pageX, y: e.pageY });
        setScrollStart({ x: zoomContainerRef.current.scrollLeft, y: zoomContainerRef.current.scrollTop });
    };

    const handleMouseMove = (e) => {
        if (!isDragging || zoomLevel <= 1 || !zoomContainerRef.current) return;
        e.preventDefault();
        const dx = e.pageX - dragStart.x;
        const dy = e.pageY - dragStart.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            hasDraggedRef.current = true;
        }
        zoomContainerRef.current.scrollLeft = scrollStart.x - dx;
        zoomContainerRef.current.scrollTop = scrollStart.y - dy;
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setTimeout(() => { hasDraggedRef.current = false; }, 100);
    };

    const handleCreate = () => {
        if (!newItemTitle.trim()) return;
        const title = newItemTitle.trim();

        if (createType === 'character') {
            createCharacter({ name: title, role: '', description: '', images: [], parentId: currentStep.id === 'system_personajes' ? null : currentStep.id, isCategory: false });
        } else if (createType === 'character_category') {
            createCharacter({ name: title, role: '', description: '', images: [], parentId: currentStep.id === 'system_personajes' ? null : currentStep.id, isCategory: true });
        } else if (createType === 'nota') {
            createWorldItem({ title, isCategory: false, parentId: 'system_notas', content: '', images: [] });
        } else if (createType === 'master_category') {
            createWorldItem({ title, isCategory: true, parentId: currentStep.id === 'root' ? null : currentStep.id, content: '', images: [] });
        } else if (createType === 'master_card') {
            createWorldItem({ title, isCategory: false, parentId: currentStep.id === 'root' ? null : currentStep.id, content: '', images: [] });
        }

        setNewItemTitle('');
        setIsCreateModalOpen(false);
    };

    const handleEditSave = () => {
        if (!editTitle.trim() || !editTarget) return;
        const newTitle = editTitle.trim();

        if (editTarget.type === 'character') {
            updateCharacter(editTarget.id, { name: newTitle });
        } else {
            updateWorldItem(editTarget.id, { title: newTitle });
        }

        setPath(current => {
            const newPath = [...current];
            if (newPath[newPath.length - 1].id === editTarget.id) {
                newPath[newPath.length - 1].title = newTitle;
            }
            return newPath;
        });

        setIsEditModalOpen(false);
        setEditTarget(null);
    };


    const handleAddImage = async () => {
        if (imageTarget) {
            if (imageSourceType === 'file' && !imageFile) return;
            if (imageSourceType === 'url' && !imageUrlInput.trim()) return;

            setIsUploading(true);
            try {
                let uploadedUrl = imageUrlInput;
                if (imageSourceType === 'file') {
                    uploadedUrl = await uploadImageToCloudinary(imageFile);
                }
                
                if (imageTarget.type === 'character') {
                    const char = characters.find(c => c.id === imageTarget.id);
                    const newImages = [...(char.images || []), uploadedUrl];
                    updateCharacter(char.id, { images: newImages });
                } else {
                    const item = worldItems.find(i => i.id === imageTarget.id);
                    const newImages = [...(item.images || []), uploadedUrl];
                    updateWorldItem(item.id, { images: newImages });
                }
                setIsImageModalOpen(false);
                setImageFile(null);
                setImageUrlInput('');
                setImageSourceType('file');
            } catch (error) {
                console.error("Error adding image:", error);
                toast.error("Error al añadir la imagen. Por favor, intenta de nuevo.");
            } finally {
                setIsUploading(false);
            }
        }
    };

    // --- Render Parts ---
    const rootMasterCards = worldItems.filter(i => i.parentId === null);

    const renderRoot = () => (
        <div className="animate-in fade-in duration-300 pb-10">
            <header className="mb-8">
                <h1 className="text-4xl font-serif font-black text-[var(--text-main)] mb-2">Master Doc Central</h1>
                <p className="text-[var(--text-muted)]">El tablero neuronal de tu manuscrito. Gestiona personajes, estructuras y notas globales.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                <div
                    onClick={() => pushPath({ id: 'system_personajes', title: 'Personajes', type: 'system_personajes_list' })}
                    className="group bg-[var(--bg-app)] border-l-4 border-l-blue-500 border border-[var(--border-main)] p-6 rounded-2xl hover:border-blue-500 cursor-pointer transition-all hover:shadow-lg shadow-sm"
                >
                    <Users size={24} className="text-blue-500 mb-4" />
                    <h3 className="font-bold text-xl text-[var(--text-main)] mb-2">Personajes</h3>
                    <p className="text-sm text-[var(--text-muted)]">Gestiona a todos los individuos, sus roles e imágenes de referencia.</p>
                </div>

                <div
                    onClick={() => pushPath({ id: 'system_estructura', title: 'Estructura de Capítulos', type: 'system_estructura_list' })}
                    className="group bg-[var(--bg-app)] border-l-4 border-l-indigo-500 border border-[var(--border-main)] p-6 rounded-2xl hover:border-indigo-500 cursor-pointer transition-all hover:shadow-lg shadow-sm"
                >
                    <Layers size={24} className="text-indigo-500 mb-4" />
                    <h3 className="font-bold text-xl text-[var(--text-main)] mb-2">Estructura y Volúmenes</h3>
                    <p className="text-sm text-[var(--text-muted)]">Vista jerárquica de todo el esqueleto de tu manuscrito.</p>
                </div>

                <div
                    onClick={() => pushPath({ id: 'system_notas', title: 'Notas Adicionales', type: 'system_notas_list' })}
                    className="group bg-[var(--bg-app)] border-l-4 border-l-orange-500 border border-[var(--border-main)] p-6 rounded-2xl hover:border-orange-500 cursor-pointer transition-all hover:shadow-lg shadow-sm"
                >
                    <Bookmark size={24} className="text-orange-500 mb-4" />
                    <h3 className="font-bold text-xl text-[var(--text-main)] mb-2">Notas Adicionales</h3>
                    <p className="text-sm text-[var(--text-muted)]">Ideas sueltas, apuntes técnicos o detalles no categorizados.</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 border-b border-[var(--border-main)] pb-4 gap-4">
                <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2">
                    <FileText size={16} className="text-[var(--accent-main)] shrink-0" />
                    Secciones Dinámicas del Master Doc
                </h2>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => { setCreateType('master_card'); setIsCreateModalOpen(true); }}
                        className="px-4 py-2 text-xs font-bold bg-[var(--bg-editor)] border border-[var(--border-main)] text-[var(--text-main)] rounded-lg hover:border-[var(--accent-main)] transition-all flex items-center gap-2"
                    >
                        <Plus size={14} /> Tarjeta
                    </button>
                    <button
                        onClick={() => { setCreateType('master_category'); setIsCreateModalOpen(true); }}
                        className="px-4 py-2 text-xs font-bold bg-[var(--accent-soft)] text-[var(--accent-main)] rounded-lg hover:bg-[var(--accent-main)] hover:text-white transition-all flex items-center gap-2 shadow-sm"
                    >
                        <Folder size={14} /> Carpeta
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {rootMasterCards.map(item => {
                    const isEmpty = item.isCategory ? worldItems.filter(i => i.parentId === item.id).length === 0 : (!item.content || item.content.trim() === '');
                    return (
                        <div
                            key={item.id}
                            onClick={() => pushPath({ id: item.id, title: item.title, type: item.isCategory ? 'dynamic_list' : 'world_item_detail', data: item })}
                            className={`group bg-[var(--bg-app)] border border-[var(--border-main)] p-4 rounded-xl hover:border-[var(--accent-main)] cursor-pointer transition-all flex flex-col shadow-sm h-28 overflow-hidden ${item.isCategory ? 'border-t-4 border-t-[var(--accent-main)]' : 'border-t-4 border-t-emerald-500'} ${isEmpty ? 'opacity-50 hover:opacity-100' : ''}`}
                        >
                            <div className="flex justify-between items-center mb-2 shrink-0">
                                <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">{item.isCategory ? 'Carpeta' : 'Tarjeta'}</span>
                                <div className="text-[var(--text-muted)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-[10px] uppercase font-bold hidden sm:inline">Abrir</span>
                                    <ChevronRight size={12} className="shrink-0" />
                                </div>
                            </div>
                            <h3 className="font-bold text-sm leading-snug text-[var(--text-main)] line-clamp-3" title={item.title}>{item.title}</h3>
                        </div>
                    );
                })}
                {rootMasterCards.length === 0 && (
                    <div className="col-span-full py-16 mt-4 text-center border-2 border-dashed border-[var(--border-main)] rounded-2xl text-[var(--text-muted)] opacity-70">
                        Crea tu primera carpeta (Ej. "Sistema de Magia") o tarjeta aquí.
                    </div>
                )}
            </div>
        </div>
    );

    // Characters List
    const renderCharacters = (parentId = null) => {
        const currentChars = characters.filter(c => c.parentId === parentId || (parentId === null && !c.parentId));
        return (
            <div className="animate-in fade-in duration-300 pb-10">
                <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-4">
                    <div className="flex-1">
                        {parentId === null ? (
                            <h1 className="text-3xl font-serif font-black text-[var(--text-main)]">{currentStep.title}</h1>
                        ) : (() => {
                            const realItem = characters.find(w => w.id === parentId);
                            if (!realItem) return <h1 className="text-3xl font-serif font-black text-[var(--text-main)]">{currentStep.title}</h1>;
                            return (
                                <h1 className="text-2xl md:text-3xl font-serif font-black text-[var(--text-main)] leading-tight">Familia: {realItem.name}</h1>
                            );
                        })()}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0 md:pt-1 md:justify-end">
                        {parentId !== null && (() => {
                            const realItem = characters.find(w => w.id === parentId);
                            if (realItem) {
                                return (
                                    <>
                                        <button
                                            onClick={() => {
                                                setEditTarget({ id: realItem.id, title: realItem.name, type: 'character' });
                                                setEditTitle(realItem.name);
                                                setIsEditModalOpen(true);
                                            }}
                                            className="px-4 py-2 border border-[var(--border-main)] text-[var(--text-main)] hover:bg-[var(--bg-editor)] hover:text-blue-500 rounded-lg transition-all text-sm font-bold flex items-center gap-2 bg-[var(--bg-app)]"
                                        >
                                            <Pencil size={16} /> <span className="hidden sm:inline">Editar Título</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setItemToDelete({ id: realItem.id, title: realItem.name, type: 'character', pop: true });
                                            }}
                                            className="px-4 py-2 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all text-sm font-bold flex items-center gap-2 bg-[var(--bg-app)]"
                                        >
                                            <Trash2 size={16} /> <span className="hidden sm:inline">Eliminar</span>
                                        </button>
                                    </>
                                );
                            }
                            return null;
                        })()}
                        <button
                            onClick={() => { setCreateType('character'); setIsCreateModalOpen(true); }}
                            className="px-4 py-2 text-sm font-bold bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-main)] rounded-lg hover:border-[var(--accent-main)] transition-all flex items-center gap-2"
                        >
                            <Plus size={16} /> Nuevo Personaje
                        </button>
                        <button
                            onClick={() => { setCreateType('character_category'); setIsCreateModalOpen(true); }}
                            className="px-4 py-2 text-sm font-bold bg-[var(--accent-soft)] text-[var(--accent-main)] rounded-lg hover:bg-[var(--accent-main)] hover:text-white transition-all flex items-center gap-2 shadow-sm"
                        >
                            <Folder size={16} /> Nueva Familia
                        </button>
                    </div>
                </div>

                {parentId !== null && (() => {
                    const realItem = characters.find(w => w.id === parentId);
                    if (realItem) {
                        return (
                            <div className="mb-8">
                                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Descripción General de la Familia</label>
                                <textarea
                                    value={realItem.description || ''}
                                    onChange={(e) => updateCharacter(realItem.id, { description: e.target.value })}
                                    placeholder="Describe aquí a la familia o facción (ej: orígenes, características, motivaciones)..."
                                    className="w-full h-32 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-main)] resize-y transition-all text-[var(--text-main)] shadow-sm"
                                />
                            </div>
                        );
                    }
                    return null;
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {currentChars.map(char => {
                        const isEmpty = char.isCategory ? characters.filter(i => i.parentId === char.id).length === 0 : false;
                        return (
                            <div
                                key={char.id}
                                onClick={() => {
                                    if (char.isCategory) {
                                        pushPath({ id: char.id, title: char.name, type: 'character_list', data: char });
                                    } else {
                                        pushPath({ id: char.id, title: char.name, type: 'character_detail', data: char });
                                    }
                                }}
                                className={`group bg-[var(--bg-app)] border border-[var(--border-main)] p-4 rounded-xl hover:border-blue-500 cursor-pointer transition-all flex items-center gap-4 h-28 overflow-hidden shadow-sm ${char.isCategory ? 'border-l-4 border-l-blue-400' : 'border-l-4 border-l-blue-600'} ${isEmpty ? 'opacity-50 hover:opacity-100' : ''}`}
                            >
                                <div className="w-14 h-14 rounded-full bg-[var(--bg-editor)] border border-[var(--border-main)] flex items-center justify-center text-[var(--text-muted)] shrink-0 overflow-hidden">
                                    {char.images && char.images[0] ? (
                                        <img src={char.images[0]} alt={char.name} className="w-full h-full object-cover" />
                                    ) : (
                                        char.isCategory ? <Folder size={20} /> : <Users size={20} />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                                            {char.isCategory ? 'Familia' : 'Personaje'}
                                        </span>
                                        <div className="text-[var(--text-muted)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[10px] uppercase font-bold hidden sm:inline">Abrir</span>
                                            <ChevronRight size={12} className="shrink-0" />
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-base leading-tight text-[var(--text-main)] line-clamp-1" title={char.name}>{char.name}</h3>
                                    {!char.isCategory && (
                                        <p className="text-[10px] text-[#3b82f6] truncate font-bold uppercase tracking-wider mt-1">{char.role || 'Sin rol definido'}</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {currentChars.length === 0 && (
                        <div className="col-span-full py-16 text-center border-2 border-dashed border-[var(--border-main)] rounded-2xl text-[var(--text-muted)] opacity-60">
                            Aún no hay personajes o familias aquí.
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Dynamic Lists & System Notas List
    const renderWorldItemList = (parentId, typeName) => {
        const items = worldItems.filter(i => i.parentId === parentId);
        const isEstructura = currentStep.isEstructura || parentId === 'system_estructura';

        let btn1Label = isEstructura ? "Nuevo Capítulo" : "Nueva Tarjeta";
        let btn2Label = isEstructura ? "Nuevo Volumen" : "Nueva Carpeta";
        let createType1 = parentId === 'system_notas' ? 'nota' : 'master_card';
        let createType2 = 'master_category';

        if (parentId === 'system_notas') {
            btn1Label = "Nueva Nota";
        }

        const computeEstructuraLabels = () => {
            const labels = {};
            let vCount = 1;
            let standaloneCount = 1;
            worldItems.filter(w => w.parentId === 'system_estructura' && w.isCategory).forEach(vol => {
                labels[vol.id] = vCount;
                vCount++;
                let volChapCount = 1;
                worldItems.filter(w => w.parentId === vol.id).forEach(c => {
                    labels[c.id] = volChapCount;
                    volChapCount++;
                });
            });
            worldItems.filter(w => w.parentId === 'system_estructura' && !w.isCategory).forEach(c => {
                labels[c.id] = standaloneCount;
                standaloneCount++;
            });
            return labels;
        };

        const estLabels = isEstructura ? computeEstructuraLabels() : {};

        return (
            <div className="animate-in fade-in duration-300 pb-10">
                <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-4">
                    <div className="flex-1">
                        {parentId.startsWith('system_') ? (
                            <h1 className="text-3xl font-serif font-black text-[var(--text-main)]">{currentStep.title}</h1>
                        ) : (() => {
                            const realItem = worldItems.find(w => w.id === parentId);
                            if (!realItem) return <h1 className="text-3xl font-serif font-black text-[var(--text-main)]">{currentStep.title}</h1>;
                            return (
                                <div>
                                    {isEstructura && estLabels[realItem.id] && (
                                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)] mb-1">
                                            {realItem.isCategory ? `Volumen ${estLabels[realItem.id]}` : `Capítulo ${estLabels[realItem.id]}`}
                                        </div>
                                    )}
                                    <h1 className="text-2xl md:text-3xl font-serif font-black text-[var(--text-main)] leading-tight">{realItem.title}</h1>
                                </div>
                            );
                        })()}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0 md:pt-1 md:justify-end">
                        {!parentId.startsWith('system_') && (() => {
                            const realItem = worldItems.find(w => w.id === parentId);
                            if (realItem) {
                                return (
                                    <>
                                        <button
                                            onClick={() => {
                                                setEditTarget({ id: realItem.id, title: realItem.title, type: 'worldItem' });
                                                setEditTitle(realItem.title);
                                                setIsEditModalOpen(true);
                                            }}
                                            className="px-4 py-2 border border-[var(--border-main)] text-[var(--text-main)] hover:bg-[var(--bg-editor)] hover:text-blue-500 rounded-lg transition-all text-sm font-bold flex items-center gap-2 bg-[var(--bg-app)]"
                                        >
                                            <Pencil size={16} /> <span className="hidden sm:inline">Editar Título</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setItemToDelete({ id: realItem.id, title: realItem.title, type: 'worldItem', pop: true });
                                            }}
                                            className="px-4 py-2 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all text-sm font-bold flex items-center gap-2 bg-[var(--bg-app)]"
                                        >
                                            <Trash2 size={16} /> <span className="hidden sm:inline">Eliminar</span>
                                        </button>
                                    </>
                                );
                            }
                            return null;
                        })()}
                        <button
                            onClick={() => { setCreateType(createType1); setIsCreateModalOpen(true); }}
                            className="px-4 py-2 text-sm font-bold bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-main)] rounded-lg hover:border-[var(--accent-main)] transition-all flex items-center gap-2"
                        >
                            <Plus size={16} /> {btn1Label}
                        </button>
                        {parentId !== 'system_notas' && (
                            <button
                                onClick={() => { setCreateType(createType2); setIsCreateModalOpen(true); }}
                                className="px-4 py-2 text-sm font-bold bg-[var(--accent-soft)] text-[var(--accent-main)] rounded-lg hover:bg-[var(--accent-main)] hover:text-white transition-all flex items-center gap-2 shadow-sm"
                            >
                                <Folder size={16} /> {btn2Label}
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map(item => {
                        const isEmpty = item.isCategory ? worldItems.filter(i => i.parentId === item.id).length === 0 : (!item.content || item.content.trim() === '');
                        return (
                            <div
                                key={item.id}
                                onClick={() => pushPath({ id: item.id, title: item.title, type: item.isCategory ? 'dynamic_list' : 'world_item_detail', data: item, isEstructura: isEstructura })}
                                className={`group bg-[var(--bg-app)] border border-[var(--border-main)] p-4 rounded-xl hover:border-[var(--accent-main)] cursor-pointer transition-all flex flex-col shadow-sm h-28 overflow-hidden ${item.isCategory ? (isEstructura ? 'border-l-4 border-l-indigo-500' : 'border-l-4 border-l-[var(--accent-main)]') : (parentId === 'system_notas' ? 'border-l-4 border-l-orange-500' : (isEstructura ? 'border-l-4 border-l-indigo-400' : 'border-l-4 border-l-emerald-500'))} ${isEmpty ? 'opacity-50 hover:opacity-100' : ''}`}
                            >
                                <div className="flex justify-between items-center mb-2 shrink-0">
                                    <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                                        {item.isCategory ? (isEstructura ? `Volumen ${estLabels[item.id]}` : 'Carpeta') : (parentId === 'system_notas' ? 'Nota' : (isEstructura ? `Capítulo ${estLabels[item.id]}` : 'Tarjeta'))}
                                    </span>
                                    <div className="text-[var(--text-muted)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-[10px] uppercase font-bold hidden sm:inline">Abrir</span>
                                        <ChevronRight size={12} className="shrink-0" />
                                    </div>
                                </div>
                                <h3 className="font-bold text-sm leading-snug text-[var(--text-main)] line-clamp-3" title={item.title}>
                                    {item.title}
                                </h3>
                            </div>
                        );
                    })}
                    {items.length === 0 && (
                        <div className="col-span-full py-16 text-center border-2 border-dashed border-[var(--border-main)] rounded-2xl text-[var(--text-muted)] opacity-60">
                            Esta sección está vacía.
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // We removed renderEstructura because renderWorldItemList handles it now

    // Shared Editor Detail (Character or WorldItem)
    const renderDetail = () => {
        const isCharacter = currentStep.type === 'character_detail';
        const item = currentStep.data;

        const computeEstructuraLabels = () => {
            const labels = {};
            let vCount = 1;
            let standaloneCount = 1;
            worldItems.filter(w => w.parentId === 'system_estructura' && w.isCategory).forEach(vol => {
                labels[vol.id] = vCount;
                vCount++;
                let volChapCount = 1;
                worldItems.filter(w => w.parentId === vol.id).forEach(c => {
                    labels[c.id] = volChapCount;
                    volChapCount++;
                });
            });
            worldItems.filter(w => w.parentId === 'system_estructura' && !w.isCategory).forEach(c => {
                labels[c.id] = standaloneCount;
                standaloneCount++;
            });
            return labels;
        };

        const estLabels = currentStep.isEstructura ? computeEstructuraLabels() : {};

        // Reactive updates via finding real item in state
        const realItem = isCharacter
            ? characters.find(c => c.id === item.id)
            : worldItems.find(w => w.id === item.id);

        if (!realItem) return <div>Elemento no encontrado.</div>;

        // Initialize local content if not set or item changed
        if (localContent === '' && !isUnsaved) {
            const initialVal = isCharacter ? (realItem.description || '') : (realItem.content || '');
            setLocalContent(initialVal);
        }

        const handleManualSave = () => {
            if (isCharacter) updateCharacter(realItem.id, { description: localContent });
            else updateWorldItem(realItem.id, { content: localContent });
            setIsUnsaved(false);
            toast.success("Cambios guardados correctamente.");
        };

        return (
            <div className="animate-in slide-in-from-bottom-4 duration-300 pb-20">
                <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                    <div className="flex-1 w-full md:mr-4">
                        {isCharacter && (
                            <input
                                type="text"
                                value={realItem.role || ''}
                                onChange={(e) => updateCharacter(realItem.id, { role: e.target.value })}
                                placeholder="Rol (Ej. Protagonista, Guardián...)"
                                className="text-xs font-black uppercase tracking-widest text-[#3b82f6] bg-transparent border-none focus:outline-none mb-2 w-full"
                            />
                        )}
                        {!isCharacter && currentStep.isEstructura && estLabels[realItem.id] && (
                            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-main)] mb-2">
                                {realItem.isCategory ? `Volumen ${estLabels[realItem.id]}` : `Capítulo ${estLabels[realItem.id]}`}
                            </div>
                        )}
                        <h1 className="text-3xl md:text-5xl font-serif font-black text-[var(--text-main)] leading-tight break-words">
                            {isCharacter ? realItem.name : realItem.title}
                        </h1>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                            onClick={() => {
                                setEditTarget({ id: realItem.id, title: isCharacter ? realItem.name : realItem.title, type: isCharacter ? 'character' : 'worldItem' });
                                setEditTitle(isCharacter ? realItem.name : realItem.title);
                                setIsEditModalOpen(true);
                            }}
                            className="px-4 py-2 border border-[var(--border-main)] text-[var(--text-main)] hover:bg-[var(--bg-editor)] hover:text-blue-500 rounded-lg transition-all text-sm font-bold flex items-center gap-2 bg-[var(--bg-app)]"
                        >
                            <Pencil size={16} /> <span className="hidden sm:inline">Editar Título</span>
                        </button>
                        <button
                            onClick={() => {
                                setItemToDelete({ id: realItem.id, title: isCharacter ? realItem.name : realItem.title, type: isCharacter ? 'character' : 'worldItem', pop: true });
                            }}
                            className="px-4 py-2 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all text-sm font-bold flex items-center gap-2 bg-[var(--bg-app)]"
                        >
                            <Trash2 size={16} /> <span className="hidden sm:inline">Eliminar</span>
                        </button>
                    </div>
                </div>

                <div className={`relative group/editor border border-[var(--border-main)] rounded-2xl mb-8 shadow-sm overflow-hidden bg-[var(--bg-app)] flex flex-col transition-all duration-300 ${isMaximized ? 'fixed inset-4 z-[150] m-0 max-h-none' : 'h-[500px]'}`}>
                    <textarea
                        value={localContent}
                        onChange={(e) => {
                            setLocalContent(e.target.value);
                            setIsUnsaved(true);
                        }}
                        placeholder={`Describe los detalles, resúmenes profundos o reglas para ${isCharacter ? realItem.name : realItem.title}...`}
                        className={`w-full flex-1 bg-transparent p-8 text-lg focus:outline-none resize-none transition-all leading-relaxed text-[var(--text-main)] scrollbar-hide`}
                    />
                    
                    <div className="p-4 border-t border-[var(--border-main)] bg-[var(--bg-editor)]/80 backdrop-blur-md flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            {isUnsaved && (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse border border-amber-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                                    Cambios sin guardar
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsMaximized(!isMaximized)}
                                className={`px-4 py-2 border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-editor)] rounded-xl transition-all text-xs font-bold flex items-center gap-2 ${isMaximized ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' : ''}`}
                            >
                                {isMaximized ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
                                {isMaximized ? 'Contraer' : 'Maximizar'}
                            </button>
                            <button
                                onClick={handleManualSave}
                                disabled={!isUnsaved}
                                className={`px-6 py-2 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg active:scale-95 disabled:opacity-40 disabled:grayscale disabled:scale-100 disabled:shadow-none`}
                            >
                                <Bookmark size={16} /> Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>

                {/* Imágenes */}
                <div className="bg-[var(--bg-app)] rounded-2xl p-8 border border-[var(--border-main)] shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <label className="text-xs font-black text-[var(--accent-main)] uppercase tracking-widest flex items-center gap-2">
                            <ImageIcon size={16} /> Referencias Visuales
                        </label>
                        <button
                            onClick={() => {
                                setIsImageModalOpen(true);
                                setImageTarget({ type: isCharacter ? 'character' : 'worldItem', id: realItem.id });
                            }}
                            className="text-sm font-bold text-[var(--accent-main)] bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] px-5 py-2.5 rounded-xl transition-all flex items-center gap-2"
                        >
                            <Plus size={16} /> Agregar Imagen
                        </button>
                    </div>

                    {(realItem.images && realItem.images.length > 0) ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {realItem.images.map((img, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => { setSelectedImageUrl(img); setIsFullImageModalOpen(true); }}
                                    className="relative group bg-[var(--bg-editor)] rounded-xl overflow-hidden border border-[var(--border-main)] shadow-sm cursor-pointer flex items-center justify-center p-2"
                                >
                                    <img src={img} alt={`Ref ${idx}`} className="w-full max-h-60 object-contain group-hover:scale-105 transition-transform duration-500" />
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newImages = [...realItem.images];
                                            newImages.splice(idx, 1);
                                            if (isCharacter) updateCharacter(realItem.id, { images: newImages });
                                            else updateWorldItem(realItem.id, { images: newImages });
                                        }}
                                        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-md hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm shadow-md"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 border-2 border-dashed border-[var(--border-main)] rounded-xl text-sm text-[var(--text-muted)] font-medium">
                            No hay referencias visuales para esta tarjeta.
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="w-full h-full flex flex-col bg-[var(--bg-editor)] overflow-hidden">
            {/* Breadcrumb Navigation View */}
            <div className="flex-none p-4 border-b border-[var(--border-main)] bg-[var(--bg-app)]/50 shrink-0">
                <div className="flex items-center gap-2 text-xs md:text-sm font-bold tracking-widest uppercase text-[var(--text-muted)] overflow-x-auto scrollbar-hide">
                    {path.map((step, index) => (
                        <React.Fragment key={index}>
                            <button
                                onClick={() => popPath(index)}
                                className={`flex items-center gap-1.5 transition-colors whitespace-nowrap ${index === path.length - 1 ? 'text-[var(--text-main)] pointer-events-none' : 'hover:text-[var(--text-main)]'}`}
                            >
                                {index === 0 && <Globe size={14} className="text-[var(--accent-main)]" />}
                                {step.title}
                            </button>
                            {index < path.length - 1 && <ChevronRight size={14} className="opacity-50 shrink-0" />}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto w-full scrollbar-hide p-6 md:p-10">
                <div className="max-w-5xl mx-auto h-full">
                    {currentStep.type === 'root' && renderRoot()}
                    {currentStep.type === 'system_personajes_list' && renderCharacters(null)}
                    {currentStep.type === 'character_list' && renderCharacters(currentStep.id)}
                    {currentStep.type === 'system_notas_list' && renderWorldItemList('system_notas', 'Notas')}
                    {currentStep.type === 'system_estructura_list' && renderWorldItemList('system_estructura', 'Estructura')}
                    {currentStep.type === 'dynamic_list' && renderWorldItemList(currentStep.id, 'Carpeta')}
                    {(currentStep.type === 'character_detail' || currentStep.type === 'world_item_detail') && renderDetail()}
                </div>
            </div>

            {/* Create Modal */}
            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Agregar Elemento">
                <div className="p-8 space-y-6 text-left font-sans">
                    <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-6 flex items-center gap-4 mb-2 shadow-inner">
                        <div className="p-3 bg-indigo-500/10 rounded-xl">
                            {createType === 'character' || createType === 'character_category' ? <Users size={24} className="text-indigo-500" /> : createType === 'nota' ? <Bookmark size={24} className="text-orange-500" /> : <Layers size={24} className="text-indigo-500" />}
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em] mb-1">Nuevo Registro</p>
                            <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">Asigna un nombre distintivo para tu nueva entrada en el Master Doc.</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-end px-1">
                            <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">
                                Nombre / Título
                            </label>
                            <div className="flex items-center gap-1.5 translate-y-1">
                                <button onClick={() => setNewItemTitle(newItemTitle.toUpperCase())} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-indigo-500 hover:border-indigo-500/50 transition-all uppercase" title="Mayúsculas">AA</button>
                                <button onClick={() => setNewItemTitle(newItemTitle ? newItemTitle.charAt(0).toUpperCase() + newItemTitle.slice(1).toLowerCase() : '')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-indigo-500 hover:border-indigo-500/50 transition-all uppercase" title="Capitalizar">Aa</button>
                            </div>
                        </div>
                        <input
                            type="text"
                            autoFocus
                            value={newItemTitle}
                            onChange={(e) => setNewItemTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreate();
                            }}
                            placeholder="Ej. Espada de Orion, El Reino del Norte..."
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl px-6 py-5 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all text-[var(--text-main)] text-xl placeholder:opacity-30 font-serif italic"
                        />
                    </div>
                    
                    <div className="flex justify-end pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={handleCreate}
                            disabled={!newItemTitle.trim()}
                            className="w-full px-8 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 active:scale-95 disabled:opacity-30 disabled:grayscale"
                        >
                            <Plus size={20} /> Crear en {currentStep.title}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal 
                isOpen={isImageModalOpen} 
                onClose={() => { setIsImageModalOpen(false); setImageFile(null); setImageUrlInput(''); }} 
                title="🎨 Añadir Referencia Visual"
            >
                <div className="p-8 space-y-6 text-left font-sans">
                    {/* Source Type Selector */}
                    <div className="flex bg-[var(--bg-editor)] p-1.5 rounded-2xl border border-[var(--border-main)] shadow-inner">
                        <button
                            onClick={() => setImageSourceType('file')}
                            className={`flex-1 flex items-center justify-center gap-3 py-3.5 text-[10px] font-black uppercase tracking-[0.1em] rounded-xl transition-all ${imageSourceType === 'file' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-[1.02]' : 'text-[var(--text-muted)] hover:text-indigo-600 hover:bg-indigo-500/5'}`}
                        >
                            <Upload size={16} /> Desde mi PC
                        </button>
                        <button
                            onClick={() => setImageSourceType('url')}
                            className={`flex-1 flex items-center justify-center gap-3 py-3.5 text-[10px] font-black uppercase tracking-[0.1em] rounded-xl transition-all ${imageSourceType === 'url' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-[1.02]' : 'text-[var(--text-muted)] hover:text-indigo-600 hover:bg-indigo-500/5'}`}
                        >
                            <LinkIcon size={16} /> Enlace Externo
                        </button>
                    </div>

                    {imageSourceType === 'file' ? (
                        <div className="border-2 border-dashed border-[var(--border-main)] rounded-[32px] p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all relative group/upload">
                            <input
                                type="file"
                                accept="image/*"
                                disabled={isUploading}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        setImageFile(e.target.files[0]);
                                    }
                                }}
                            />
                            {imageFile ? (
                                <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
                                    <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mb-5 border border-indigo-500/20 shadow-inner">
                                        <ImageIcon size={32} className="text-indigo-600" />
                                    </div>
                                    <h4 className="text-sm font-black text-[var(--text-main)] truncate max-w-[200px] mb-1">{imageFile.name}</h4>
                                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest bg-[var(--bg-editor)] px-3 py-1 rounded-full border border-[var(--border-main)]">
                                        {(imageFile.size / 1024 / 1024).toFixed(2)} MB • Listo
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center pointer-events-none transition-transform group-hover/upload:scale-105 duration-500">
                                    <div className="w-20 h-20 bg-indigo-500/5 rounded-3xl flex items-center justify-center mb-5 border border-[var(--border-main)] shadow-sm group-hover/upload:border-indigo-500/30 group-hover/upload:shadow-inner transition-all">
                                        <Upload size={32} className="text-[var(--text-muted)] group-hover/upload:text-indigo-500 transition-colors" />
                                    </div>
                                    <p className="text-base font-black text-[var(--text-main)] mb-1">Cargar Archivo</p>
                                    <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest opacity-60">PNG, JPG, GIF hasta 10MB</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-center gap-5 shadow-inner">
                                <div className="p-4 bg-indigo-500/10 rounded-2xl shadow-sm">
                                    <Globe2 size={24} className="text-indigo-500 shrink-0" />
                                </div>
                                <div className="text-left">
                                    <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1.5 leading-none">Importación Directa</h4>
                                    <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed">Nuestra nube optimizará automáticamente tu imagen desde cualquier dirección web válida.</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">URL de la Imagen</label>
                                <input
                                    type="url"
                                    value={imageUrlInput}
                                    onChange={(e) => setImageUrlInput(e.target.value)}
                                    placeholder="https://images.unsplash.com/photo-..."
                                    className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl px-6 py-5 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all text-[var(--text-main)] text-sm font-mono placeholder:opacity-30 placeholder:font-sans"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => { setIsImageModalOpen(false); setImageFile(null); setImageUrlInput(''); }}
                            disabled={isUploading}
                            className="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-all disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleAddImage}
                            disabled={(imageSourceType === 'file' ? !imageFile : !imageUrlInput.trim()) || isUploading}
                            className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100 shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-95 translate-y-0"
                        >
                            {isUploading ? <><Loader2 size={18} className="animate-spin" /> Procesando</> : <><ImageIcon size={18} /> Añadir a Galería</>}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} title="Confirmar Eliminación">
                <div className="p-10 space-y-8 text-center font-sans">
                    <div className="relative inline-block">
                        <div className="w-24 h-24 bg-red-500/5 rounded-[32px] flex items-center justify-center mx-auto border border-red-500/10 shadow-inner">
                            <Trash2 size={40} className="text-red-500" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-[var(--bg-app)] animate-bounce">
                            <AlertTriangle size={16} />
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] mb-2">Advertencia Crítica</p>
                            <h3 className="text-2xl font-black text-[var(--text-main)] tracking-tight italic">¿Eliminar permanentemente?</h3>
                        </div>
                        <p className="text-[var(--text-muted)] text-sm leading-relaxed font-medium max-w-xs mx-auto">
                            Vas a borrar <strong>"{itemToDelete?.title}"</strong> del Master Doc. Esta acción no se puede deshacer y todo el contenido asociado será purgado.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 pt-6 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => {
                                if (!itemToDelete) return;
                                if (itemToDelete.type === 'character') {
                                    deleteCharacter(itemToDelete.id);
                                } else {
                                    deleteWorldItem(itemToDelete.id);
                                }
                                if (itemToDelete.pop) popPath(path.length - 2);
                                setItemToDelete(null);
                            }}
                            className="w-full px-8 py-5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl shadow-red-600/30 active:scale-95"
                        >
                            Sí, eliminar definitivamente
                        </button>
                        <button
                            onClick={() => setItemToDelete(null)}
                            className="w-full px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-editor)] transition-all"
                        >
                            Cancelar Acción
                        </button>
                    </div>
                </div>
            </Modal>
            {/* Edit Title Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditTarget(null); setEditTitle(''); }} title="Editar Título">
                <div className="p-8 space-y-8 text-left font-sans">
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-6 flex items-center gap-4 shadow-inner">
                        <div className="p-3 bg-blue-500/10 rounded-xl">
                            <Pencil size={24} className="text-blue-500" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-blue-500 tracking-[0.2em] mb-1.5">Renombrar Registro</p>
                            <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed">El nuevo título se reflejará instantáneamente en todo el Master Doc y la navegación.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-end px-1">
                            <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">
                                Identificador de Entrada
                            </label>
                            <div className="flex items-center gap-1.5 translate-y-2">
                                <button onClick={() => setEditTitle(editTitle.toUpperCase())} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-blue-500 hover:border-blue-500/50 transition-all uppercase" title="Mayúsculas">AA</button>
                                <button onClick={() => setEditTitle(editTitle ? editTitle.charAt(0).toUpperCase() + editTitle.slice(1).toLowerCase() : '')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-blue-500 hover:border-blue-500/50 transition-all uppercase" title="Capitalizar">Aa</button>
                            </div>
                        </div>
                        <input
                            type="text"
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave();
                            }}
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-[24px] px-6 py-5 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all text-[var(--text-main)] text-xl font-serif italic"
                        />
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => { setIsEditModalOpen(false); setEditTarget(null); setEditTitle(''); }}
                            className="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-all"
                        >
                            Omitir
                        </button>
                        <button
                            onClick={handleEditSave}
                            disabled={!editTitle.trim()}
                            className="px-10 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all disabled:opacity-40 disabled:grayscale shadow-xl shadow-blue-600/20 active:scale-95 flex items-center justify-center gap-3"
                        >
                            <Check size={18} /> Actualizar Título
                        </button>
                    </div>
                </div>
            </Modal>

            {isFullImageModalOpen && createPortal(
                <div
                    ref={zoomContainerRef}
                    className={`fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm animate-in fade-in duration-200 overflow-auto flex ${zoomLevel > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
                    onClick={() => {
                        if (hasDraggedRef.current) return;
                        setIsFullImageModalOpen(false);
                        setZoomLevel(1);
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <div className={`m-auto p-4 flex items-center justify-center transition-all ${zoomLevel > 1 ? 'min-w-max min-h-max' : 'w-full h-full'}`}>
                        <img
                            src={selectedImageUrl}
                            alt="Full screen view"
                            onDragStart={(e) => e.preventDefault()}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (hasDraggedRef.current) return;
                                setZoomLevel(prev => prev === 1 ? 1.05 : 1);
                            }}
                            className={`rounded-lg shadow-2xl origin-center ${zoomLevel === 1 ? 'max-w-[95vw] max-h-[95vh] object-contain cursor-zoom-in' : ''}`}
                            style={zoomLevel > 1 ? { width: `${zoomLevel * 100}vw`, maxWidth: 'none', transition: isDragging ? 'none' : 'width 0.3s ease-out' } : { transition: 'width 0.3s ease-out' }}
                        />
                    </div>

                    {/* Controles de Zoom */}
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-sm px-6 py-3 rounded-full z-[10000] shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
                        <button onClick={(e) => handleZoom(e, 'out')} disabled={zoomLevel <= 1} className="text-white hover:text-[var(--accent-main)] disabled:opacity-30 disabled:hover:text-white transition-colors"><ZoomOut size={20} /></button>
                        <span className="text-white font-bold text-sm min-w-[3rem] text-center">{Math.round(zoomLevel * 100)}%</span>
                        <button onClick={(e) => handleZoom(e, 'in')} disabled={zoomLevel >= 4} className="text-white hover:text-[var(--accent-main)] disabled:opacity-30 disabled:hover:text-white transition-colors"><ZoomIn size={20} /></button>
                    </div>

                    <button
                        className="fixed top-4 right-4 p-3 bg-black/60 text-white rounded-full hover:bg-red-500 transition-all backdrop-blur-sm shadow-xl z-[10000]"
                        onClick={(e) => { e.stopPropagation(); setIsFullImageModalOpen(false); setZoomLevel(1); }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>,
                document.body
            )}
        </div>
    );
};

export default WorldView;
