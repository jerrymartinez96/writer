import { useState, useEffect, useRef, useMemo } from 'react'
import { useData } from '../context/DataContext'
import { Search, FileText, Users, Globe, X, CornerDownLeft } from 'lucide-react'

const CommandPalette = ({ isOpen, onClose }) => {
    const { chapters, characters, worldItems, selectChapter, setActiveView } = useData()
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
        if (!query.trim()) return []
        const q = query.toLowerCase()
        const found = []

        // Search chapters
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
                        id: ch.id,
                        title: ch.title,
                        snippet,
                        data: ch,
                        icon: FileText
                    })
                }
            })
        }

        // Search characters
        if (characters) {
            characters.filter(c => !c.isCategory).forEach(ch => {
                const nameMatch = ch.name?.toLowerCase().includes(q)
                const descMatch = ch.description?.toLowerCase().includes(q)
                if (nameMatch || descMatch) {
                    found.push({
                        type: 'character',
                        id: ch.id,
                        title: ch.name,
                        snippet: ch.role || '',
                        data: ch,
                        icon: Users
                    })
                }
            })
        }

        // Search world items
        if (worldItems) {
            worldItems.forEach(wi => {
                const titleMatch = wi.title?.toLowerCase().includes(q)
                const contentMatch = wi.content?.toLowerCase().includes(q)
                if (titleMatch || contentMatch) {
                    found.push({
                        type: 'world',
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
    }, [query, chapters, characters, worldItems])

    useEffect(() => {
        setSelectedIndex(0)
    }, [results])

    const handleSelect = (result) => {
        if (result.type === 'chapter') {
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
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-main)]">
                    <Search size={20} className="text-[var(--text-muted)] shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Buscar capítulos, personajes, mundo..."
                        className="flex-1 bg-transparent text-[var(--text-main)] text-base font-medium focus:outline-none placeholder:text-[var(--text-muted)]/50 font-[Arial,sans-serif]"
                    />
                    <kbd className="hidden sm:flex items-center px-2 py-1 rounded-lg bg-[var(--bg-editor)] border border-[var(--border-main)] text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                        Esc
                    </kbd>
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
                        <div className="py-2">
                            {/* Group by type */}
                            {['chapter', 'character', 'world'].map(type => {
                                const typeResults = results.filter(r => r.type === type)
                                if (typeResults.length === 0) return null
                                const typeLabel = type === 'chapter' ? 'Capítulos' : type === 'character' ? 'Personajes' : 'Mundo'

                                return (
                                    <div key={type}>
                                        <div className="px-5 py-1.5">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{typeLabel}</span>
                                        </div>
                                        {typeResults.map((result) => {
                                            const globalIndex = results.indexOf(result)
                                            const Icon = result.icon
                                            return (
                                                <button
                                                    key={result.id}
                                                    onClick={() => handleSelect(result)}
                                                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                                                    className={`w-full flex items-start gap-3 px-5 py-3 text-left transition-all ${globalIndex === selectedIndex ? 'bg-[var(--accent-soft)] border-l-2 border-[var(--accent-main)]' : 'border-l-2 border-transparent hover:bg-[var(--bg-editor)]'}`}
                                                >
                                                    <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${type === 'chapter' ? 'bg-indigo-500/10 text-indigo-500' : type === 'character' ? 'bg-pink-500/10 text-pink-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                        <Icon size={14} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-sm text-[var(--text-main)] truncate">{result.title}</div>
                                                        {result.snippet && (
                                                            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 font-[Arial,sans-serif]">{result.snippet}</p>
                                                        )}
                                                    </div>
                                                    {globalIndex === selectedIndex && (
                                                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] shrink-0 mt-1">
                                                            <CornerDownLeft size={12} />
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
