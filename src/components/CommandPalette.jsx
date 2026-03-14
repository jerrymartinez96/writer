import { useState, useEffect, useRef, useMemo } from 'react'
import { useData } from '../context/DataContext'
import { Search, FileText, Users, Globe, X, CornerDownLeft, Plus, Settings, Moon, Sun, Trash2, Sparkles, Command } from 'lucide-react'

const CommandPalette = ({ isOpen, onClose }) => {
    const { 
        chapters, characters, worldItems, selectChapter, setActiveView,
        createChapter, activeBook
    } = useData()
    const [query, setQuery] = useState('')
    const inputRef = useRef(null)
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => {
        if (isOpen) {
            setQuery('')
            setSelectedIndex(0)
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [isOpen])

    // Keyboard shortcut listener
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                if (isOpen) {
                    onClose()
                } else {
                    onClose() // toggle via parent
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    const results = useMemo(() => {
        const q = query.toLowerCase().trim()
        const found = []

        // 1. Quick Commands (Always visible or filtered)
        const commands = [
            { id: 'cmd-new-chap', type: 'command', title: 'Crear nuevo capítulo', icon: Plus, action: () => { createChapter({ title: 'Nuevo Capítulo' }); setActiveView('editor'); } },
            { id: 'cmd-world', type: 'command', title: 'Ir al Master Doc', icon: Globe, action: () => setActiveView('world') },
            { id: 'cmd-chars', type: 'command', title: 'Ver Personajes', icon: Users, action: () => setActiveView('characters') },
            { id: 'cmd-prompt', type: 'command', title: 'Exportador a IA', icon: Sparkles, action: () => setActiveView('promptStudio') },
            { id: 'cmd-settings', type: 'command', title: 'Ajustes del libro', icon: Settings, action: () => setActiveView('settings') },
            { id: 'cmd-trash', type: 'command', title: 'Ver Papelera', icon: Trash2, action: () => setActiveView('trash') },
        ]

        const filteredCommands = q 
            ? commands.filter(c => c.title.toLowerCase().includes(q))
            : commands.slice(0, 3) // Show first 3 if no query

        filteredCommands.forEach(c => found.push({ ...c, category: 'command' }))

        if (!q) return found

        // 2. Search chapters
        if (chapters) {
            chapters.filter(c => !c.isVolume).forEach(ch => {
                const titleMatch = ch.title?.toLowerCase().includes(q)
                const contentMatch = ch.content?.replace(/<[^>]*>?/gm, '').toLowerCase().includes(q)
                if (titleMatch || contentMatch) {
                    let snippet = ''
                    if (contentMatch && ch.content) {
                        const plainText = ch.content.replace(/<[^>]*>?/gm, '')
                        const idx = plainText.toLowerCase().indexOf(q)
                        if (idx >= 0) {
                            const start = Math.max(0, idx - 40)
                            const end = Math.min(plainText.length, idx + q.length + 40)
                            snippet = (start > 0 ? '...' : '') + plainText.substring(start, end) + (end < plainText.length ? '...' : '')
                        }
                    }
                    found.push({
                        type: 'chapter',
                        category: 'content',
                        id: ch.id,
                        title: ch.title,
                        snippet,
                        data: ch,
                        icon: FileText
                    })
                }
            })
        }

        // 3. Search characters
        if (characters) {
            characters.filter(c => !c.isCategory).forEach(ch => {
                const nameMatch = ch.name?.toLowerCase().includes(q)
                const descMatch = ch.description?.toLowerCase().includes(q)
                if (nameMatch || descMatch) {
                    found.push({
                        type: 'character',
                        category: 'content',
                        id: ch.id,
                        title: ch.name,
                        snippet: ch.role || ch.description?.substring(0, 60) || '',
                        data: ch,
                        icon: Users
                    })
                }
            })
        }

        // 4. Search world items
        if (worldItems) {
            worldItems.forEach(wi => {
                const titleMatch = wi.title?.toLowerCase().includes(q)
                const contentMatch = wi.content?.toLowerCase().includes(q)
                if (titleMatch || contentMatch) {
                    found.push({
                        type: 'world',
                        category: 'content',
                        id: wi.id,
                        title: wi.title,
                        snippet: wi.content?.substring(0, 80) || '',
                        data: wi,
                        icon: Globe
                    })
                }
            })
        }

        return found.slice(0, 15)
    }, [query, chapters, characters, worldItems, createChapter, setActiveView])

    useEffect(() => {
        setSelectedIndex(0)
    }, [results])

    const handleSelect = (result) => {
        if (result.type === 'command') {
            result.action()
        } else if (result.type === 'chapter') {
            selectChapter(result.data)
        } else if (result.type === 'character') {
            setActiveView('characters')
        } else if (result.type === 'world') {
            setActiveView('world')
        }
        onClose()
    }

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex(prev => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            e.preventDefault()
            handleSelect(results[selectedIndex])
        } else if (e.key === 'Escape') {
            onClose()
        }
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[300] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={onClose}
        >
            <div
                className="w-full max-w-xl bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search Input */}
                <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border-main)] bg-[var(--bg-app)]/50 backdrop-blur-xl">
                    <div className="p-2 bg-[var(--accent-main)]/10 text-[var(--accent-main)] rounded-xl animate-pulse">
                        <Search size={22} className="shrink-0" />
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Busca cualquier cosa o escribe un comando..."
                        className="flex-1 bg-transparent text-[var(--text-main)] text-lg placeholder:text-[var(--text-muted)]/50 focus:outline-none font-serif tracking-tight"
                    />
                    <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-editor)] border border-[var(--border-main)] shadow-inner">
                        <Command size={10} className="text-[var(--text-muted)]" />
                        <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">K</span>
                    </div>
                </div>

                {/* Results */}
                <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                    {query.trim() && results.length === 0 && (
                        <div className="px-5 py-10 text-center">
                            <p className="text-[var(--text-muted)] text-sm font-medium">No se encontraron resultados para "{query}"</p>
                        </div>
                    )}

                    {!query.trim() && (
                        <div className="px-5 py-8 text-center">
                            <p className="text-[var(--text-muted)] text-sm">Escribe para buscar en toda tu novela...</p>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="py-3">
                            {/* Group by category */}
                            {['command', 'chapter', 'character', 'world'].map(type => {
                                const typeResults = results.filter(r => r.type === type)
                                if (typeResults.length === 0) return null
                                const typeLabel = type === 'command' ? 'Comandos Rápidos' : type === 'chapter' ? 'Capítulos' : type === 'character' ? 'Personajes' : 'Mundo'

                                return (
                                    <div key={type} className="mb-2 last:mb-0">
                                        <div className="px-6 py-2">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-60">{typeLabel}</span>
                                        </div>
                                        {typeResults.map((result) => {
                                            const globalIndex = results.indexOf(result)
                                            const Icon = result.icon
                                            const isSelected = globalIndex === selectedIndex

                                            return (
                                                <button
                                                    key={result.id}
                                                    onClick={() => handleSelect(result)}
                                                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                                                    className={`w-full flex items-center gap-4 px-6 py-3.5 text-left transition-all relative group ${isSelected ? 'bg-[var(--accent-main)]/10' : 'hover:bg-[var(--bg-editor)]/40'}`}
                                                >
                                                    {isSelected && (
                                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent-main)] shadow-[0_0_15px_var(--accent-main)]" />
                                                    )}
                                                    
                                                    <div className={`p-2 rounded-xl shrink-0 shadow-sm transition-transform duration-300 ${isSelected ? 'scale-110 bg-[var(--accent-main)] text-white' : 'bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:bg-[var(--accent-soft)]'}`}>
                                                        <Icon size={18} />
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className={`font-bold transition-colors ${isSelected ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-main)]'}`}>
                                                            {result.title}
                                                        </div>
                                                        {result.snippet && (
                                                            <p className="text-xs text-[var(--text-muted)] opacity-60 truncate mt-0.5 font-serif italic">{result.snippet}</p>
                                                        )}
                                                    </div>

                                                    {isSelected && (
                                                        <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--bg-app)] border border-[var(--border-main)] animate-in slide-in-from-right-2 duration-300">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Abrir</span>
                                                            <CornerDownLeft size={10} className="text-[var(--text-muted)]" />
                                                        </div>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {results.length > 0 && (
                    <div className="flex items-center justify-between px-5 py-2.5 border-t border-[var(--border-main)] bg-[var(--bg-editor)]/50">
                        <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-main)] font-bold">↑↓</kbd> Navegar</span>
                            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-main)] font-bold">↵</kbd> Abrir</span>
                        </div>
                        <span className="text-[10px] font-bold text-[var(--text-muted)]">{results.length} resultados</span>
                    </div>
                )}
            </div>
        </div>
    )
}

export default CommandPalette
