import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Plus, Book, Clock, ChevronRight, Search, BookMarked, Trash2, Edit3, Play, Upload, Loader2, Image as ImageIcon, FileText, ExternalLink } from 'lucide-react';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';

const LibraryView = () => {
    const { books, selectBook, createBook, deleteBook, user, uploadCover } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [coverUrl, setCoverUrl] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, bookId: null });

    const filteredBooks = books.filter(b => 
        b.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const url = await uploadCover(file);
            setCoverUrl(url);
        } catch (error) {
            console.error("Upload failed:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleCreate = async () => {
        if (title.trim()) {
            await createBook(title.trim(), coverUrl.trim() || null);
            setTitle('');
            setCoverUrl('');
            setIsModalOpen(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-app)] p-4 sm:p-6 lg:p-12 animate-in fade-in duration-700">
            <div className="max-w-7xl mx-auto">
                {/* New Header Section */}
                <header className="mb-12 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 border-b border-[var(--border-main)]">
                        <div className="flex items-center gap-2 text-indigo-500 opacity-80">
                            <Book size={14} />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{user?.displayName?.split(' ')[0]}'s Collections</span>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                            <div className="relative group w-full sm:w-auto">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-indigo-500 transition-colors" size={14} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar obra..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full sm:w-48 pl-9 pr-4 py-2 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-xs transition-all shadow-sm"
                                />
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(true)}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-md transition-all active:scale-95"
                            >
                                <Plus size={16} />
                                <span>Nueva Obra</span>
                            </button>
                        </div>
                    </div>

                    <div className="pt-2">
                        <h1 className="text-3xl md:text-5xl font-serif font-black text-[var(--text-main)] leading-tight tracking-tight">
                            El Librero de <span className="text-indigo-600 italic select-none">{user?.displayName?.split(' ')[0]}</span>
                        </h1>
                        <p className="text-[var(--text-muted)] font-medium text-sm md:text-base mt-2">Tu colección privada de mundos y relatos.</p>
                    </div>
                </header>

                {filteredBooks.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-y-12 sm:gap-y-16 gap-x-8 md:gap-x-12 px-4 sm:px-0">
                        {filteredBooks.map((book) => (
                            <div 
                                key={book.id}
                                className="group perspective-1000 flex flex-col items-center cursor-pointer"
                                onClick={() => selectBook(book)}
                            >
                                {/* The Physical Book Container */}
                                <div 
                                    className="relative w-[70%] sm:w-full aspect-[2/3] transition-all duration-500 transform-gpu sm:group-hover:rotate-y-[-12deg] sm:group-hover:scale-[1.03]"
                                    style={{ perspective: '1000px' }}
                                >
                                    {/* Spine Side Projection (Fake 3D) - Only visible on sm+ */}
                                    <div className="hidden sm:block absolute top-0 bottom-0 left-[-6px] w-[6px] bg-indigo-900 rounded-l-sm origin-right transform-gpu rotate-y-[-90deg]"></div>
                                    
                                    {/* Main Cover */}
                                    <div className="w-full h-full relative rounded-r-md overflow-hidden shadow-[10px_10px_25px_rgba(0,0,0,0.2)] md:shadow-[15px_15px_35px_rgba(0,0,0,0.3)] bg-[var(--bg-editor)] border-y border-r border-[var(--border-main)]/30 group-hover:shadow-[20px_20px_45px_rgba(0,0,0,0.35)] transition-shadow">
                                        
                                        {/* Spine Shadow Effect */}
                                        <div className="absolute top-0 bottom-0 left-0 w-8 bg-gradient-to-r from-black/30 to-transparent z-10 pointer-events-none"></div>
                                        <div className="absolute top-0 bottom-0 left-[2px] w-[1px] bg-white/10 z-10"></div>

                                        {/* Cover Image/Art */}
                                        {book.coverUrl ? (
                                            <img 
                                                src={book.coverUrl} 
                                                alt={book.title} 
                                                className="w-full h-full object-cover grayscale-[20%] sm:group-hover:grayscale-0 transition-all duration-700"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-slate-800 to-indigo-950 flex flex-col items-center justify-center p-4 sm:p-6 text-center">
                                                <BookOpenIcon className="text-white/10 w-16 h-16 sm:w-24 sm:h-24 absolute opacity-20" />
                                                <h3 className="relative text-white font-serif font-black text-lg sm:text-xl leading-snug line-clamp-4 drop-shadow-lg uppercase tracking-tight italic">
                                                    {book.title}
                                                </h3>
                                            </div>
                                        )}

                                        {/* Interaction Overlay - Subtle for desktop, button for mobile */}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300 z-20 flex flex-col items-center justify-between p-4 sm:p-6">
                                            {/* Action Buttons */}
                                            <div className="w-full flex justify-end">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ isOpen: true, bookId: book.id }); }}
                                                    className="p-3 bg-red-500/90 hover:bg-red-600 text-white rounded-xl sm:transform sm:translate-y-[-20px] sm:group-hover:translate-y-0 transition-transform duration-300 shadow-lg"
                                                    title="Eliminar obra"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>

                                            <div className="hidden sm:block text-center w-full">
                                                <h3 className="text-white font-serif font-black text-xl mb-4 drop-shadow-md line-clamp-2">
                                                    {book.title}
                                                </h3>
                                                <div className="w-full py-4 bg-white text-indigo-950 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl transform translate-y-[20px] group-hover:translate-y-0 transition-transform duration-300">
                                                    Abrir Libro
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mobile-Only Delete/Menu trigger (Optional, but let's just make the overlay simpler) */}
                                        <div className="sm:hidden absolute top-2 right-2 z-30">
                                             <button 
                                                onClick={(e) => { e.stopPropagation(); setConfirmDelete({ isOpen: true, bookId: book.id }); }}
                                                className="p-2 bg-black/40 backdrop-blur-md text-white rounded-lg active:bg-red-500 transition-colors shadow-lg border border-white/10"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {/* Pages Effect (Right Side) */}
                                    <div className="absolute top-1.5 bottom-1.5 right-[-4px] w-[4px] bg-slate-200/50 rounded-r-sm z-[-1]"></div>
                                </div>
                                
                                {/* Labels below book (Title & Info) */}
                                <div className="mt-4 sm:mt-6 text-center w-full px-2">
                                    <h4 className="font-serif font-black text-[var(--text-main)] text-lg sm:text-xl mb-1 line-clamp-1 sm:line-clamp-2 group-hover:text-indigo-600 transition-colors">
                                        {book.title}
                                    </h4>
                                    <p className="text-[var(--text-muted)] text-[9px] sm:text-[10px] uppercase font-black tracking-[0.2em] opacity-60">
                                        Biblioteca Digital
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-500 mb-6">
                            <BookMarked size={48} />
                        </div>
                        <h2 className="text-2xl font-serif font-black text-[var(--text-main)] mb-2">Tu estantería está vacía</h2>
                        <p className="text-[var(--text-muted)] max-w-sm mb-8 leading-relaxed">Cada gran autor comenzó con una página en blanco. Es momento de escribir tu primera obra maestra.</p>
                        <button 
                            onClick={() => setIsModalOpen(true)}
                            className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20"
                        >
                            Comenzar mi primera historia
                        </button>
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nueva Obra Creativa">
                <div className="p-8 space-y-10 text-left font-sans bg-indigo-500/[0.01]">
                    <div className="p-6 bg-indigo-600/5 rounded-[32px] border border-indigo-500/10 flex items-start gap-5 shadow-inner">
                        <div className="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-600/20 shrink-0">
                            <SparklesIcon size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-2">Consejo Editorial</p>
                            <p className="text-[11px] text-indigo-900/60 dark:text-indigo-400 font-bold leading-relaxed uppercase tracking-tighter">Usa una relación de aspecto 2:3 para que tu portada luzca como un libro real impreso de alta gama.</p>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                <FileText size={14} />
                                Título de la Obra
                            </label>
                            <input 
                                type="text" 
                                autoFocus
                                placeholder="Ej. El Guardian de los Secretos..."
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-[var(--bg-editor)] border-2 border-[var(--border-main)] rounded-[24px] px-8 py-5 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-[var(--text-main)] transition-all font-serif italic text-2xl placeholder:opacity-20 placeholder:italic shadow-sm"
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                    <ImageIcon size={14} />
                                    Identidad Visual
                                </label>
                                <span className="text-[9px] text-indigo-500 font-black bg-indigo-500/10 px-4 py-1.5 rounded-full uppercase tracking-[0.2em] shadow-sm">600x900px sugerido</span>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {/* Upload Box */}
                                <label className={`relative group/upload cursor-pointer border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center p-10 transition-all ${isUploading ? 'bg-indigo-500/5 border-indigo-300 opacity-60 pointer-events-none' : 'bg-[var(--bg-editor)]/50 hover:bg-indigo-500/[0.03] hover:border-indigo-500/50 border-[var(--border-main)] hover:shadow-2xl hover:shadow-indigo-500/5'}`}>
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept="image/*"
                                        onChange={handleFileUpload}
                                    />
                                    {isUploading ? (
                                        <Loader2 className="animate-spin text-indigo-600 mb-4" size={32} />
                                    ) : (
                                        <div className="w-16 h-16 bg-[var(--bg-app)] rounded-2xl flex items-center justify-center mb-4 border border-[var(--border-main)] group-hover/upload:border-indigo-500/20 group-hover/upload:scale-110 transition-all shadow-sm">
                                            <Upload className="text-[var(--text-muted)] group-hover/upload:text-indigo-600" size={28} />
                                        </div>
                                    )}
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] group-hover/upload:text-indigo-600 transition-colors">{isUploading ? 'Procesando...' : 'Cargar Imagen'}</p>
                                </label>

                                {/* URL Input Box */}
                                <div className="flex flex-col justify-center gap-4">
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                                            <ExternalLink size={18} className="text-[var(--text-muted)] group-focus-within:text-indigo-500 transition-colors opacity-50" />
                                        </div>
                                        <input 
                                            type="url" 
                                            placeholder="O vincula una URL externa..."
                                            value={coverUrl}
                                            onChange={(e) => setCoverUrl(e.target.value)}
                                            className="w-full bg-[var(--bg-editor)] border-2 border-[var(--border-main)] rounded-[24px] pl-16 pr-8 py-5 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-[var(--text-main)] transition-all font-mono text-[11px] placeholder:opacity-30 shadow-inner"
                                        />
                                    </div>
                                    <p className="px-6 text-[10px] text-[var(--text-muted)] font-bold italic opacity-40 uppercase tracking-tighter leading-tight text-center">Referencia digital remota (Unsplash, Pinterest, etc.)</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 pt-8 border-t border-[var(--border-main)]">
                        <button 
                            onClick={() => setIsModalOpen(false)} 
                            className="w-full sm:flex-1 py-5 font-black text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)] hover:bg-[var(--bg-editor)] rounded-[22px] transition-all"
                        >
                            No, ahora no
                        </button>
                        <button 
                            onClick={handleCreate}
                            disabled={!title.trim() || isUploading}
                            className="w-full sm:flex-1 py-5 bg-indigo-600 text-white rounded-[22px] font-black text-[10px] uppercase tracking-[0.3em] hover:bg-indigo-700 disabled:opacity-30 disabled:grayscale transition-all shadow-xl shadow-indigo-600/30 hover:shadow-indigo-600/40 hover:scale-105 active:scale-95"
                        >
                            {isUploading ? 'Sincronizando...' : 'Publicar Obra'}
                        </button>
                    </div>
                </div>
            </Modal>

            <ConfirmModal 
                isOpen={confirmDelete.isOpen}
                onClose={() => setConfirmDelete({ isOpen: false, bookId: null })}
                onConfirm={() => deleteBook(confirmDelete.bookId)}
                title="¿Eliminar esta obra?"
                message="¿Estás seguro de que deseas eliminar para siempre esta obra maestra? Esta acción no se puede deshacer y perderás todo el progreso."
                confirmText="Sí, eliminar definitivamente"
            />
        </div>
    );
};

const BookOpenIcon = ({ className }) => (
    <svg 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
);

const SparklesIcon = ({ size }) => (
    <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
    >
        <path d="m12 3 1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3Z" />
        <path d="M5 3v4" /><path d="M3 5h4" /><path d="M21 17v4" /><path d="M19 19h4" />
    </svg>
);

export default LibraryView;
