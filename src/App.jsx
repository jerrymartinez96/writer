import { lazy, Suspense, useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import CommandPalette from './components/CommandPalette'
import Modal from './components/Modal'
import Login from './components/Login'
import { DataProvider, useData } from './context/DataContext'
import { Settings, FileText, Moon, Sun, Menu, X, Library, LogIn, LogOut, Loader2, Check } from 'lucide-react'

// Lazy loaded views
const Editor = lazy(() => import('./components/Editor'))
const WorldView = lazy(() => import('./components/WorldView'))
const SettingsView = lazy(() => import('./components/SettingsView'))
const IAStudioView = lazy(() => import('./components/IAStudioView'))
const ManuscriptView = lazy(() => import('./components/ManuscriptView'))
const TrashView = lazy(() => import('./components/TrashView'))
const LibraryView = lazy(() => import('./components/LibraryView'))

const LoadingScreen = () => (
  <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-editor)] text-[var(--text-muted)] p-12 animate-in fade-in duration-500">
    <div className="relative">
      <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full"></div>
      <Loader2 className="animate-spin text-indigo-500 relative z-10" size={48} strokeWidth={1.5} />
    </div>
    <span className="mt-6 text-[10px] font-black uppercase tracking-[0.3em] opacity-50">Cargando Módulo</span>
  </div>
);

function AppContent() {
  const { activeBook, activeChapter, loading, createBook, activeView, setActiveView, user, authLoading, logout, selectBook, lastSaved } = useData();
  const [timeSinceSave, setTimeSinceSave] = useState('Recién');

  useEffect(() => {
    const updateRelativeTime = () => {
      if (!lastSaved) return;
      const seconds = Math.floor((new Date() - new Date(lastSaved)) / 1000);
      
      if (seconds < 60) setTimeSinceSave('Recién');
      else if (seconds < 3600) setTimeSinceSave(`hace ${Math.floor(seconds / 60)} min`);
      else setTimeSinceSave(`hace ${Math.floor(seconds / 3600)} h`);
    };

    updateRelativeTime();
    const interval = setInterval(updateRelativeTime, 30000); // 30s update
    return () => clearInterval(interval);
  }, [lastSaved]);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Global Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return true;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  if (authLoading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[var(--bg-app)] text-[var(--text-muted)] gap-4 transition-colors duration-500">
        <div className="w-12 h-12 border-4 border-t-[var(--accent-main)] border-[var(--border-main)] rounded-full animate-spin shadow-inner"></div>
        <p className="text-xl font-serif font-black animate-pulse tracking-widest uppercase">Iniciando sesión...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (loading && !activeBook) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[var(--bg-app)] text-[var(--text-muted)] gap-4 transition-colors duration-500">
        <div className="w-12 h-12 border-4 border-t-[var(--accent-main)] border-[var(--border-main)] rounded-full animate-spin shadow-inner"></div>
        <p className="text-xl font-serif font-black animate-pulse tracking-widest uppercase">Cargando Biblioteca...</p>
      </div>
    );
  }

  // Pantalla de Biblioteca si no hay libro seleccionado
  if (!activeBook && !loading) {
    return (
      <div className="flex flex-col h-screen bg-[var(--bg-app)]">
        <header className="h-16 border-b border-[var(--border-main)] flex items-center justify-between px-4 lg:px-12 bg-[var(--bg-app)]/90 backdrop-blur-xl shrink-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg transform -rotate-6">
              <FileText className="text-white" size={24} />
            </div>
            <h2 className="text-xl font-serif font-black text-[var(--accent-main)] tracking-tight">LivingWriter</h2>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-all">
              {isDarkMode ? <Sun size={22} /> : <Moon size={22} />}
            </button>
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="w-10 h-10 rounded-2xl border-2 border-[var(--border-main)] overflow-hidden shadow-lg hover:scale-105 transition-transform cursor-pointer relative z-10"
                title="Menú de usuario"
              >
                {user?.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-[var(--accent-main)] to-indigo-400 flex items-center justify-center text-white font-black text-xs sm:text-sm">
                    {user?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'LW'}
                  </div>
                )}
              </button>

              {isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
                  <div className="absolute right-0 mt-3 w-56 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl shadow-2xl z-50 py-2 animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-4 py-2 border-b border-[var(--border-main)]/50 mb-1">
                      <p className="text-xs font-black text-[var(--accent-main)] uppercase tracking-widest truncate">{user?.displayName}</p>
                      <p className="text-[10px] text-[var(--text-muted)] truncate">{user?.email}</p>
                    </div>

                    <button
                      onClick={() => { selectBook(null); setIsUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-colors text-left"
                    >
                      <Library size={18} className="text-indigo-500" />
                      Biblioteca
                    </button>

                    <div className="h-px bg-[var(--border-main)]/50 my-1"></div>

                    <button
                      onClick={() => { logout(); setIsUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-500/5 transition-colors text-left"
                    >
                      <LogOut size={18} />
                      Cerrar Sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<LoadingScreen />}>
            <LibraryView />
          </Suspense>
        </div>
      </div>
    );
  }

  const renderActiveView = () => {
    switch (activeView) {
      case 'world':
        return <WorldView />;
      case 'settings':
        return <SettingsView />;
      case 'iaStudio':
        return <IAStudioView />;
      case 'trash':
        return <TrashView />;
      case 'manuscript':
        return <ManuscriptView />;
      case 'editor':
      default:
        return activeChapter ? (
          <Editor />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 text-[var(--text-muted)] animate-in fade-in duration-1000">
            <div className="w-20 h-20 bg-[var(--accent-soft)]/30 rounded-full flex items-center justify-center shadow-inner">
              <FileText size={40} className="text-[var(--accent-main)] opacity-50" />
            </div>
            <p className="text-xl font-serif">Selecciona o crea un capítulo en la barra lateral</p>
          </div>
        );
    }
  };

  return (
    <div className="w-screen h-screen flex bg-[var(--bg-app)] text-[var(--text-main)] overflow-hidden font-sans transition-colors duration-300">
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
      <Sidebar isMobileOpen={isMobileMenuOpen} setIsMobileOpen={setIsMobileMenuOpen} />
      <main className="flex-1 h-full flex flex-col min-w-0 bg-[var(--bg-editor)]">
        {/* Top Navbar Refined */}
        <header className="h-16 border-b border-[var(--border-main)] flex items-center justify-between px-4 lg:px-12 bg-[var(--bg-app)]/90 backdrop-blur-xl z-20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)] rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex flex-col min-w-0 hidden sm:flex">
              <h2 className="text-lg font-serif font-black text-[var(--text-main)] truncate leading-tight tracking-tight">
                {activeBook?.title || "Biblioteca vacía"}
              </h2>
              <p className="text-[10px] text-[var(--text-muted)] truncate uppercase tracking-widest font-black opacity-70">
                {activeView === 'editor'
                  ? (activeChapter?.title || "Sin capítulo seleccionado")
                  : (activeView === 'world' ? 'Master Doc Central' : activeView === 'trash' ? 'Papelera' : activeView === 'iaStudio' ? 'IA Studio' : activeView === 'manuscript' ? 'Vista General' : 'Ajustes del libro')}
              </p>
            </div>
            {/* Mobile title fallback */}
            <div className="flex flex-col min-w-0 sm:hidden">
              <h2 className="text-[15px] font-serif font-black text-[var(--text-main)] truncate leading-tight tracking-tight">
                {activeBook?.title || "Biblioteca vacía"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-6 shrink-0">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-full shadow-sm hover:border-emerald-500/30 transition-all group" title="Tu trabajo se guarda automáticamente">
              <div className="relative flex items-center justify-center">
                <Check size={14} className="text-emerald-500 relative z-10" strokeWidth={3} />
                <div className="absolute inset-0 bg-emerald-500/20 blur-sm rounded-full animate-pulse group-hover:bg-emerald-500/30 transition-all"></div>
              </div>
              <span className="text-[11px] font-medium text-[var(--text-main)] transition-colors">
                <span className="text-[var(--text-muted)] opacity-60 font-normal">Guardado</span> {timeSinceSave}
              </span>
            </div>

            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2.5 transition-all rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]`}
              title="Cambiar tema"
            >
              {isDarkMode ? <Sun size={22} /> : <Moon size={22} />}
            </button>
            <button
              onClick={() => setActiveView('settings')}
              className={`p-2.5 transition-all rounded-xl hidden sm:block ${activeView === 'settings' ? 'bg-[var(--accent-main)] text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--accent-soft)]'}`}
              title="Ajustes y eliminación"
            >
              <Settings size={22} />
            </button>
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="w-10 h-10 rounded-2xl border-2 border-[var(--border-main)] overflow-hidden shadow-lg hover:scale-105 transition-transform cursor-pointer relative z-10"
                title="Menú de usuario"
              >
                {user?.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-[var(--accent-main)] to-indigo-400 flex items-center justify-center text-white font-black text-xs sm:text-sm">
                    {user?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'LW'}
                  </div>
                )}
              </button>

              {isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
                  <div className="absolute right-0 mt-3 w-56 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl shadow-2xl z-50 py-2 animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-4 py-2 border-b border-[var(--border-main)]/50 mb-1">
                      <p className="text-xs font-black text-[var(--accent-main)] uppercase tracking-widest truncate">{user?.displayName}</p>
                      <p className="text-[10px] text-[var(--text-muted)] truncate">{user?.email}</p>
                    </div>

                    <button
                      onClick={() => { selectBook(null); setIsUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-[var(--text-main)] hover:bg-[var(--accent-soft)] transition-colors text-left"
                    >
                      <Library size={18} className="text-indigo-500" />
                      Biblioteca
                    </button>

                    <div className="h-px bg-[var(--border-main)]/50 my-1"></div>

                    <button
                      onClick={() => { logout(); setIsUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-500/5 transition-colors text-left"
                    >
                      <LogOut size={18} />
                      Cerrar Sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* View Transitioning Container */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <div className="absolute inset-0 overflow-y-auto scrollbar-hide">
            <Suspense fallback={<LoadingScreen />}>
              {renderActiveView()}
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  )
}
import { ToastProvider } from './components/Toast'

function App() {
  return (
    <ToastProvider>
      <DataProvider>
        <AppContent />
      </DataProvider>
    </ToastProvider>
  )
}

export default App
