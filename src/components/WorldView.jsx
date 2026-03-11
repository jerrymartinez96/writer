import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../context/DataContext';
import { FileText, Image as ImageIcon, Plus, Trash2, Globe, LayoutList, Upload, Loader2, Users, BookOpen, Layers, Folder, ChevronRight, Bookmark, Pencil, ZoomIn, ZoomOut } from 'lucide-react';
import Modal from './Modal';
import { useToast } from './Toast';
import { uploadImageToCloudinary } from '../services/cloudinary';

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
        if (imageFile && imageTarget) {
            setIsUploading(true);
            try {
                const uploadedUrl = await uploadImageToCloudinary(imageFile);
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
            } catch (error) {
                console.error("Error uploading image:", error);
                toast.error("Error al subir la imagen. Por favor, intenta de nuevo.");
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

                <textarea
                    value={isCharacter ? (realItem.description || '') : (realItem.content || '')}
                    onChange={(e) => {
                        if (isCharacter) updateCharacter(realItem.id, { description: e.target.value });
                        else updateWorldItem(realItem.id, { content: e.target.value });
                    }}
                    placeholder={`Describe los detalles, resúmenes profundos o reglas para ${isCharacter ? realItem.name : realItem.title}...`}
                    className="w-full h-[400px] bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-8 text-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-main)]/50 focus:border-[var(--accent-main)] resize-y transition-all mb-8 shadow-sm leading-relaxed text-[var(--text-main)]"
                />

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
                <div className="space-y-4 text-left font-sans">
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                                Nombre / Título
                            </label>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setNewItemTitle(newItemTitle.toUpperCase())} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Mayúsculas">AA</button>
                                <button onClick={() => setNewItemTitle(newItemTitle.toLowerCase())} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Minúsculas">aa</button>
                                <button onClick={() => setNewItemTitle(newItemTitle ? newItemTitle.charAt(0).toUpperCase() + newItemTitle.slice(1).toLowerCase() : '')} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Capitalizar Letra Inicial">Aa</button>
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
                            placeholder="Ej. Espada Larga, Clima, etc..."
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--accent-main)] focus:ring-1 focus:ring-[var(--accent-main)] transition-all text-[var(--text-main)]"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={() => setIsCreateModalOpen(false)}
                            className="px-5 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={!newItemTitle.trim()}
                            className="px-5 py-2.5 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                        >
                            Crear
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Image Modal */}
            <Modal isOpen={isImageModalOpen} onClose={() => { setIsImageModalOpen(false); setImageFile(null); }} title="Subir Imagen de Referencia">
                <div className="space-y-4 text-left font-sans">
                    <div className="border-2 border-dashed border-[var(--border-main)] rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[var(--accent-main)]/50 hover:bg-[var(--accent-soft)]/20 transition-all relative">
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
                            <div className="flex flex-col items-center">
                                <ImageIcon size={40} className="text-[var(--accent-main)] mb-3" />
                                <p className="text-sm font-bold text-[var(--text-main)] truncate max-w-xs">{imageFile.name}</p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">{(imageFile.size / 1024 / 1024).toFixed(2)} MB • Haz clic para cambiar</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center pointer-events-none">
                                <Upload size={40} className="text-[var(--text-muted)] mb-3" />
                                <p className="text-sm font-bold text-[var(--text-main)] mb-1">Haz clic para subir una imagen</p>
                                <p className="text-xs text-[var(--text-muted)]">PNG, JPG, GIF hasta 10MB</p>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={() => { setIsImageModalOpen(false); setImageFile(null); }}
                            disabled={isUploading}
                            className="px-5 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleAddImage}
                            disabled={!imageFile || isUploading}
                            className="px-5 py-2.5 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-2"
                        >
                            {isUploading ? <><Loader2 size={16} className="animate-spin" /> Subiendo...</> : "Subir Imagen"}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} title="Confirmar Eliminación">
                <div className="space-y-4 text-left font-sans">
                    <p className="text-[var(--text-main)]">
                        ¿Estás seguro de que deseas eliminar permanentemente <strong>{itemToDelete?.title}</strong>?
                        <br /><span className="text-xs text-red-500 font-bold uppercase mt-2 block">Esta acción no se puede deshacer.</span>
                    </p>
                    <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-main)] mt-4">
                        <button
                            onClick={() => setItemToDelete(null)}
                            className="px-5 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
                        >
                            Cancelar
                        </button>
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
                            className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-colors shadow-md"
                        >
                            Sí, Eliminar
                        </button>
                    </div>
                </div>
            </Modal>
            {/* Edit Title Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditTarget(null); setEditTitle(''); }} title="Editar Título">
                <div className="space-y-4 text-left font-sans">
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                                Nuevo Nombre / Título
                            </label>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setEditTitle(editTitle.toUpperCase())} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Mayúsculas">AA</button>
                                <button onClick={() => setEditTitle(editTitle.toLowerCase())} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Minúsculas">aa</button>
                                <button onClick={() => setEditTitle(editTitle ? editTitle.charAt(0).toUpperCase() + editTitle.slice(1).toLowerCase() : '')} className="px-1.5 py-0.5 rounded bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] transition-all" title="Capitalizar Letra Inicial">Aa</button>
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
                            className="w-full bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--accent-main)] focus:ring-1 focus:ring-[var(--accent-main)] transition-all text-[var(--text-main)]"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={() => { setIsEditModalOpen(false); setEditTarget(null); setEditTitle(''); }}
                            className="px-5 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleEditSave}
                            disabled={!editTitle.trim()}
                            className="px-5 py-2.5 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md flex items-center gap-2"
                        >
                            <Pencil size={16} /> Guardar Cambios
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
