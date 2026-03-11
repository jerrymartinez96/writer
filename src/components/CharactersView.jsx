import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../context/DataContext';
import { Trash2, User, Image as ImageIcon, ChevronRight, Layers, FileText, Folder, Plus, Upload, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import Modal from './Modal';
import { useToast } from './Toast';
import { uploadImageToCloudinary } from '../services/cloudinary';

const CharactersView = () => {
    const { characters, createCharacter, updateCharacter, deleteCharacter } = useData();
    const toast = useToast();
    const [currentParentId, setCurrentParentId] = useState(null);

    // Modal states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createType, setCreateType] = useState(false); // false = char, true = group
    const [newItemName, setNewItemName] = useState('');

    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [imageFile, setImageFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
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

    // Derived state for the current view
    const currentItems = useMemo(() => {
        return characters.filter(item => item.parentId === currentParentId);
    }, [characters, currentParentId]);

    const activeItem = useMemo(() => {
        if (!currentParentId) return null;
        return characters.find(item => item.id === currentParentId);
    }, [characters, currentParentId]);

    // Breadcrumbs
    const getBreadcrumbs = (itemId) => {
        const path = [];
        let curr = characters.find(i => i.id === itemId);
        while (curr) {
            path.unshift(curr);
            curr = characters.find(i => i.id === curr.parentId);
        }
        return path;
    };
    const breadcrumbs = getBreadcrumbs(currentParentId);

    const handleAdd = () => {
        if (newItemName.trim()) {
            createCharacter({
                name: newItemName.trim(),
                description: '',
                images: [],
                parentId: currentParentId,
                isCategory: createType
            });
            setNewItemName('');
            setIsCreateModalOpen(false);
        }
    };

    const handleUpdateActiveContent = (e) => {
        if (!activeItem) return;
        updateCharacter(activeItem.id, { description: e.target.value });
    };

    const handleAddImage = async () => {
        if (imageFile && activeItem) {
            setIsUploading(true);
            try {
                const uploadedUrl = await uploadImageToCloudinary(imageFile);
                const newImages = [...(activeItem.images || []), uploadedUrl];
                updateCharacter(activeItem.id, { images: newImages });
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

    const handleDeleteImage = (index) => {
        if (!activeItem) return;
        const newImages = [...(activeItem.images || [])];
        newImages.splice(index, 1);
        updateCharacter(activeItem.id, { images: newImages });
    };

    return (
        <div className="max-w-6xl mx-auto p-6 md:p-10 animate-in fade-in duration-500 h-full flex flex-col">

            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 mb-4 md:mb-6 text-xs md:text-sm font-bold tracking-widest uppercase text-[var(--text-muted)] flex-wrap">
                <button
                    onClick={() => setCurrentParentId(null)}
                    className="hover:text-[var(--text-main)] transition-colors flex items-center gap-1"
                >
                    <User size={14} /> Elenco
                </button>
                {breadcrumbs.map(bc => (
                    <React.Fragment key={bc.id}>
                        <ChevronRight size={14} className="opacity-50" />
                        <button
                            onClick={() => setCurrentParentId(bc.id)}
                            className="hover:text-[var(--text-main)] transition-colors"
                        >
                            {bc.name}
                        </button>
                    </React.Fragment>
                ))}
            </div>

            {/* Current Item Content Editor */}
            {activeItem && (
                <div className="mb-10 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col gap-6 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg shrink-0 ${activeItem.isCategory ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                {activeItem.isCategory ? <Folder size={24} /> : <User size={24} />}
                            </div>
                            <h1 className="text-3xl md:text-4xl font-serif font-black text-[var(--text-main)] leading-tight">{activeItem.name}</h1>
                        </div>
                        <button
                            onClick={() => {
                                deleteCharacter(activeItem.id);
                                setCurrentParentId(activeItem.parentId);
                            }}
                            className="px-4 py-2 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all text-sm font-bold flex items-center gap-2"
                        >
                            <Trash2 size={16} /> Eliminar
                        </button>
                    </div>

                    {/* Descripcion / Contexto general */}
                    <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Descripción General / Biografía</label>
                        <textarea
                            value={activeItem.description || ''}
                            onChange={handleUpdateActiveContent}
                            placeholder="Describe aquí al personaje o el grupo (ej: personalidad, trasfondo, motivaciones)..."
                            className="w-full h-40 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl p-4 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent-main)] resize-y transition-all"
                        />
                    </div>

                    {/* Banco de Imágenes */}
                    <div className="bg-[var(--bg-editor)] rounded-xl p-5 border border-[var(--border-main)]">
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
                                <ImageIcon size={14} /> Referencias Visuales
                            </label>
                            <button
                                onClick={() => setIsImageModalOpen(true)}
                                className="text-xs font-bold text-[var(--accent-main)] hover:bg-[var(--accent-soft)] px-3 py-1.5 rounded-lg transition-all"
                            >
                                + Agregar Imagen (URL)
                            </button>
                        </div>

                        {(activeItem.images && activeItem.images.length > 0) ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {activeItem.images.map((img, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => { setSelectedImageUrl(img); setIsFullImageModalOpen(true); }}
                                        className="relative group bg-black/5 rounded-lg overflow-hidden border border-[var(--border-main)] cursor-pointer flex items-center justify-center"
                                    >
                                        <img src={img} alt={`Ref ${idx}`} className="w-full max-h-60 object-contain group-hover:scale-105 transition-transform duration-500" />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteImage(idx); }}
                                            className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-md hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 border-2 border-dashed border-[var(--border-main)] rounded-lg text-sm text-[var(--text-muted)]">
                                No has agregado imágenes para visualizar a este personaje o categoría.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Listado de hijos / Elementos solo si es root o si es una Categoría */}
            {(!activeItem || activeItem.isCategory) && (
                <div className="flex-1 flex flex-col animate-in fade-in duration-300">
                    <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-xl md:text-2xl font-serif font-bold text-[var(--text-main)] flex items-center gap-2">
                                <Layers className="text-[var(--accent-main)] shrink-0" size={24} />
                                <span className="line-clamp-2">{activeItem ? `Miembros / Contenido de ${activeItem.name}` : 'Organización de Personajes'}</span>
                            </h2>
                            <p className="text-[var(--text-muted)] text-sm mt-1">
                                {activeItem ? 'Añade personajes o sub-grupos.' : 'Crea carpetas/facciones (Ej. Villanos, Familia Stark) o añade personajes sueltos.'}
                            </p>
                        </div>

                        <div className="flex bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl overflow-hidden p-1 shadow-sm">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => { setCreateType(false); setIsCreateModalOpen(true); }}
                                    className="px-4 py-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-editor)] rounded-lg transition-colors text-sm font-bold flex items-center gap-2"
                                    title="Añadir Personaje"
                                >
                                    <User size={16} /> Nuevo Personaje
                                </button>
                                <button
                                    onClick={() => { setCreateType(true); setIsCreateModalOpen(true); }}
                                    className="px-4 py-2 text-[var(--accent-main)] hover:bg-[var(--accent-soft)] rounded-lg transition-colors text-sm font-bold flex items-center gap-2"
                                    title="Añadir Facción/Grupo"
                                >
                                    <Folder size={16} /> Nuevo Grupo
                                </button>
                            </div>
                        </div>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
                        {currentItems.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => setCurrentParentId(item.id)}
                                className={`group bg-[var(--bg-editor)] border border-[var(--border-main)] p-5 rounded-2xl hover:border-[var(--accent-main)] cursor-pointer transition-all hover:shadow-md flex flex-col ${item.isCategory ? 'border-l-4 border-l-indigo-500' : 'border-l-4 border-l-emerald-500'}`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        {item.isCategory ? <Folder size={16} className="text-indigo-500" /> : <User size={16} className="text-emerald-500" />}
                                        <h3 className="font-bold text-lg text-[var(--text-main)] line-clamp-1">{item.name}</h3>
                                    </div>
                                    <div className="text-[var(--text-muted)] flex items-center gap-1">
                                        <span className="text-[10px] uppercase font-bold opacity-0 group-hover:opacity-100 transition-opacity mr-1">Abrir</span>
                                        <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                                <p className="text-sm text-[var(--text-muted)] line-clamp-2 italic mb-4 flex-1">
                                    {item.description ? item.description : "Sin biografía..."}
                                </p>
                                <div className="flex items-center gap-3 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                                    {item.images?.length > 0 && (
                                        <span className="flex items-center gap-1"><ImageIcon size={12} /> {item.images.length}</span>
                                    )}
                                    {item.isCategory && (
                                        <span className="flex items-center gap-1"><Layers size={12} /> {(characters.filter(child => child.parentId === item.id)).length} Elementos</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {currentItems.length === 0 && (
                            <div className="col-span-full text-center py-16 border-2 border-dashed border-[var(--border-main)] rounded-2xl opacity-60">
                                <p className="text-lg font-medium text-[var(--text-muted)]">Está vacío.</p>
                                <p className="text-sm text-[var(--text-muted)]">Añade un Grupo o Personaje para empezar.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Modals */}
            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title={createType ? "Nuevo Grupo" : "Nuevo Personaje"}>
                <div className="space-y-4 text-left font-sans">
                    <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Nombre del {createType ? 'grupo' : 'personaje'}</label>
                        <input
                            type="text"
                            autoFocus
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAdd();
                            }}
                            placeholder={createType ? "Ej. Familia Lannister..." : "Ej. Jon Snow..."}
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
                            onClick={handleAdd}
                            disabled={!newItemName.trim()}
                            className="px-5 py-2.5 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                        >
                            Crear
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isImageModalOpen} onClose={() => { setIsImageModalOpen(false); setImageFile(null); }} title="Subir Imagen de Referencia">
                <div className="space-y-4 text-left font-sans">
                    <div className="border-2 border-dashed border-[var(--border-main)] rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[var(--accent-main)] hover:bg-[var(--accent-soft)]/20 transition-all relative">
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

export default CharactersView;
