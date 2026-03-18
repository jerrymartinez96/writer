import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Copy, ClipboardPaste, Maximize2, ScanSearch, ChevronLeft, ChevronRight, Info, X, Tag, History, BookOpen, Settings, Wind, Keyboard, MessageSquarePlus, Sparkles, Trash2, Pencil, Volume2, Pause, Play, Square, Lock, Unlock, Check, BookMarked, Languages, Plus, FileAudio, MoreHorizontal, Sliders, ChevronDown } from 'lucide-react'
import confetti from 'canvas-confetti'
import { Mark, mergeAttributes } from '@tiptap/react'
import Modal from './Modal'
import HistoryModal from './HistoryModal'
import { useToast } from './Toast'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import { useData } from '../context/DataContext'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import Focus from '@tiptap/extension-focus'
import createSuggestion from './MentionSuggestionConfig'
import PremiumNarrator from './PremiumNarrator';
import NarratorSelector from './NarratorSelector';
import PremiumPlayer from './PremiumPlayer';
import FinalizeModal from './FinalizeModal'

const CharacterMention = Mark.create({
    name: 'characterMention',
    addOptions() {
        return {
            HTMLAttributes: {
                class: 'character-mention cursor-pointer font-bold text-[var(--accent-main)] hover:bg-[var(--accent-soft)] px-0.5 rounded transition-colors border-b-2 border-dashed border-[var(--accent-main)]/50',
            },
        }
    },
    addAttributes() {
        return {
            charId: {
                default: null,
                parseHTML: element => element.getAttribute('data-char-id'),
                renderHTML: attributes => {
                    if (!attributes.charId) return {}
                    return { 'data-char-id': attributes.charId }
                },
            },
        }
    },
    parseHTML() {
        return [{ tag: 'span[data-char-id]' }]
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    },
})

const InlineNote = Mark.create({
    name: 'inlineNote',
    addOptions() {
        return {
            HTMLAttributes: {
                class: 'inline-note',
            },
        }
    },
    addAttributes() {
        return {
            noteId: {
                default: null,
                parseHTML: element => element.getAttribute('data-note-id'),
                renderHTML: attributes => {
                    if (!attributes.noteId) return {}
                    return { 'data-note-id': attributes.noteId }
                },
            },
            noteText: {
                default: '',
                parseHTML: element => element.getAttribute('data-note-text'),
                renderHTML: attributes => {
                    return { 'data-note-text': attributes.noteText || '' }
                },
            },
        }
    },
    parseHTML() {
        return [{ tag: 'mark[data-note-id]' }]
    },
    renderHTML({ HTMLAttributes }) {
        return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    },
})

const GhostMention = Mark.create({
    name: 'ghostMention',
    addOptions() {
        return {
            HTMLAttributes: {
                class: 'ghost-mention-node',
            },
        }
    },
    addAttributes() {
        return {
            charId: {
                default: null,
                parseHTML: element => element.getAttribute('data-char-id'),
                renderHTML: attributes => {
                    if (!attributes.charId) return {}
                    return { 'data-char-id': attributes.charId }
                },
            },
        }
    },
    parseHTML() {
        return [{ tag: 'span[data-ghost-char-id]' }]
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(this.options.HTMLAttributes, { 'data-ghost-char-id': HTMLAttributes.charId }), 0]
    },
})




const Editor = () => {
    const {
        chapters, activeChapter, saveChapterContent, characters, updateChapter,
        activeView, selectChapter, setActiveView, setPromptStudioPreload,
        finalizeChapterCleanup, chapterLock, claimLock, releaseLock, saveChapterSnapshot,
        activeBook, profile
    } = useData();
    const toast = useToast();
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [readingFont, setReadingFont] = useState('font-[Arial,sans-serif]');
    const [readingWidth, setReadingWidth] = useState('md');
    const [readingTextSize, setReadingTextSize] = useState('base');
    const [copied, setCopied] = useState(false);
    const [copyMode, setCopyMode] = useState('text');

    const [isDetectionModalOpen, setIsDetectionModalOpen] = useState(false);
    const [detectedCharacters, setDetectedCharacters] = useState([]);
    const [newPreviewHtml, setNewPreviewHtml] = useState('');
    const [isDetectionModeModalOpen, setIsDetectionModeModalOpen] = useState(false);
    const [highlightedCharId, setHighlightedCharId] = useState(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isReadingSettingsModalOpen, setIsReadingSettingsModalOpen] = useState(false);
    const [isDesktopMoreOpen, setIsDesktopMoreOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

    const STATUS_OPTIONS = [
        { label: 'Idea', value: 'Idea', color: 'bg-gray-400', shadow: 'shadow-gray-400/50' },
        { label: 'Borrador', value: 'Borrador', color: 'bg-blue-500', shadow: 'shadow-blue-500/50' },
        { label: 'Revisión', value: 'Revisión', color: 'bg-amber-500', shadow: 'shadow-amber-500/50' },
        { label: 'Completado', value: 'Completado', color: 'bg-emerald-500', shadow: 'shadow-emerald-500/50' },
        { label: 'Finalizado', value: 'Finalizado', color: 'bg-indigo-500', shadow: 'shadow-indigo-500/50' },
    ];
    const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const [isCardModalOpen, setIsCardModalOpen] = useState(false);
    const [selectedCharacterId, setSelectedCharacterId] = useState(null);
    const [isCardFlipped, setIsCardFlipped] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // Inline Notes state
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [noteSelectionRange, setNoteSelectionRange] = useState(null);
    const [isViewNoteModalOpen, setIsViewNoteModalOpen] = useState(false);
    const [viewingNote, setViewingNote] = useState(null); // { noteId, noteText, highlightedText }
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [editNoteText, setEditNoteText] = useState('');
    const [isChapterInfoModalOpen, setIsChapterInfoModalOpen] = useState(false);
    const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
    const [isFormattingModalOpen, setIsFormattingModalOpen] = useState(false);
    
    // Phase 4: Selection & Metrics
    const [selectionMetrics, setSelectionMetrics] = useState({ words: 0, chars: 0, show: false });
    const [totalWordCount, setTotalWordCount] = useState(0);

    // Refs to avoid stale closures in editor callbacks
    const charactersRef = useRef(characters);
    const activeChapterRef = useRef(activeChapter);
    const saveChapterContentRef = useRef(saveChapterContent);

    useEffect(() => {
        charactersRef.current = characters;
    }, [characters]);

    useEffect(() => {
        activeChapterRef.current = activeChapter;
    }, [activeChapter]);

    useEffect(() => {
        saveChapterContentRef.current = saveChapterContent;
    }, [saveChapterContent]);


    
    // Configuración TTS
    const orderedChapters = useMemo(() => {
        if (!chapters) return [];
        const sorted = [];
        chapters.filter(c => c.isVolume).forEach(vol => {
            sorted.push(...chapters.filter(c => c.parentId === vol.id));
        });
        sorted.push(...chapters.filter(c => !c.parentId && !c.isVolume));
        return sorted;
    }, [chapters]);

    const activeIndex = activeChapter ? orderedChapters.findIndex(c => c.id === activeChapter.id) : -1;
    const prevChapter = activeIndex > 0 ? orderedChapters[activeIndex - 1] : null;
    const nextChapter = activeIndex >= 0 && activeIndex < orderedChapters.length - 1 ? orderedChapters[activeIndex + 1] : null;

    const activeChapterHeader = useMemo(() => {
        if (!activeChapter || !chapters) return null;

        let volumeLabel = '';
        let chapterLabel = '';

        // Find if it belongs to a volume
        const parentVolume = chapters.find(c => c.id === activeChapter.parentId && c.isVolume);

        // Count volumes for numbering - sort by orderIndex
        const volumes = chapters.filter(c => c.isVolume).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        if (parentVolume) {
            const volIndex = volumes.findIndex(v => v.id === parentVolume.id);
            volumeLabel = `Volumen ${volIndex + 1}: ${parentVolume.title}`;

            // Count chapters in this volume
            const chaptersInVol = chapters.filter(c => c.parentId === parentVolume.id).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            const chapIndex = chaptersInVol.findIndex(c => c.id === activeChapter.id);
            chapterLabel = `Capítulo ${chapIndex + 1}: ${activeChapter.title}`;
        } else {
            // Standalone chapters
            const standaloneChapters = chapters.filter(c => !c.parentId && !c.isVolume).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            const chapIndex = standaloneChapters.findIndex(c => c.id === activeChapter.id);
            chapterLabel = `Capítulo ${chapIndex + 1}: ${activeChapter.title}`;
        }

        return { volumeLabel, chapterLabel };
    }, [activeChapter, chapters]);

    const parentVolume = useMemo(() => {
        if (!activeChapter || !chapters) return null;
        return chapters.find(c => c.id === activeChapter.parentId && c.isVolume);
    }, [activeChapter, chapters]);

    const handleConvertGhostMention = (charId, text, pos) => {
        if (!editor) return;
        const char = charactersRef.current.find(c => c.id === charId);
        if (!char) return;

        // Replace the text with a proper mention node
        editor.chain()
            .focus()
            .insertContentAt({ from: pos, to: pos + text.length }, {
                type: 'mention',
                attrs: { id: charId, label: char.name }
            })
            .run();

        toast.success(`Convertido a mención: ${char.name}`);
    };

    const runDetection = (mode) => {
        if (!editor || !charactersRef.current) return;
        let html = editor.getHTML();
        let foundIds = new Set();
        const baseCharacters = charactersRef.current
            .filter(c => !c.isCategory && c.name && c.name.trim() !== '');

        // Build search terms: full names + optionally individual parts
        const searchTerms = [];
        baseCharacters.forEach(char => {
            searchTerms.push({ name: char.name, id: char.id });
            if (mode === 'simple') {
                const parts = char.name.trim().split(/\s+/);
                if (parts.length > 1 && parts[0].length >= 3) {
                    // Only add the first name (e.g. "Claire" from "Claire Wilson")
                    searchTerms.push({ name: parts[0], id: char.id });
                }
            }
        });

        // Sort by name length descending so longer names match first
        searchTerms.sort((a, b) => b.name.length - a.name.length);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.parentElement && node.parentElement.getAttribute('data-char-id')) continue;
            textNodes.push(node);
        }

        textNodes.forEach(textNode => {
            let newHtml = textNode.nodeValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            let modified = false;

            searchTerms.forEach(term => {
                const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const matchRegex = new RegExp(`\\b(${escapeRegExp(term.name)})\\b`, 'gi');
                if (matchRegex.test(newHtml)) {
                    newHtml = newHtml.replace(matchRegex, `<span data-char-id="${term.id}">$1</span>`);
                    foundIds.add(term.id);
                    modified = true;
                }
            });

            if (modified) {
                const tempSpan = document.createElement('span');
                tempSpan.innerHTML = newHtml;
                textNode.replaceWith(...tempSpan.childNodes);
            }
        });

        const parsedIds = Array.from(foundIds);
        if (parsedIds.length > 0) {
            setNewPreviewHtml(tempDiv.innerHTML);
            setDetectedCharacters(parsedIds.map(id => charactersRef.current.find(c => c.id === id)).filter(Boolean));
            setHighlightedCharId(null);
            setIsDetectionModalOpen(true);
        } else {
            toast.info("No se detectaron personajes nuevos en el texto.");
        }
    };

    const handleCopyToClipboard = () => {
        if (!editor || !activeChapter) return;

        const itemLabels = {};
        let volCount = 1;
        let standaloneChapCount = 1;

        if (chapters) {
            chapters.filter(c => c.isVolume).forEach(vol => {
                itemLabels[vol.id] = `Volumen ${volCount}: `;
                volCount++;
                let volChapCount = 1;
                chapters.filter(c => c.parentId === vol.id).forEach(chap => {
                    itemLabels[chap.id] = `Capítulo ${volChapCount}: `;
                    volChapCount++;
                });
            });
            chapters.filter(c => !c.parentId && !c.isVolume).forEach(chap => {
                itemLabels[chap.id] = `Capítulo ${standaloneChapCount}: `;
                standaloneChapCount++;
            });
        }

        const chapterPrefix = itemLabels[activeChapter.id] || '';

        let textToCopy = '';
        if (copyMode === 'title') {
            textToCopy = `${chapterPrefix}${activeChapter.title || ''}`;
        } else if (copyMode === 'text') {
            textToCopy = editor.getText();
        } else if (copyMode === 'all') {
            textToCopy = `${chapterPrefix}${activeChapter.title || ''}\n\n${editor.getText()}`;
        }

        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReplaceFromClipboard = async () => {
        if (!editor || !activeChapter) return;
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                // 1. Trigger MAJOR backup preventively before erasing everything
                const currentContent = editor.getHTML();
                if (currentContent && currentContent !== '<p></p>') {
                    await saveChapterSnapshot(activeChapter.id, currentContent);
                    toast.success("Respaldo de seguridad creado.");
                }

                let htmlContent = '';
                if (text.includes('<p>') || text.includes('<h1>')) {
                    htmlContent = text;
                } else {
                    htmlContent = text.split('\n')
                        .map(line => line.trim())
                        .filter(line => line !== '')
                        .map(trimmed => {
                            // Strip markdown bold asterisks loosely and headers
                            let pText = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                            pText = pText.replace(/\*(.*?)\*/g, '<em>$1</em>');

                            if (trimmed.startsWith('### ')) return `<h3>${pText.replace(/^###\s*/, '')}</h3>`;
                            if (trimmed.startsWith('## ')) return `<h2>${pText.replace(/^##\s*/, '')}</h2>`;
                            if (trimmed.startsWith('# ')) return `<h1>${pText.replace(/^#\s*/, '')}</h1>`;

                            return `<p>${pText}</p>`;
                        }).join('');
                }
                editor.commands.setContent(htmlContent);
            }
        } catch (err) {
            console.error(err);
            toast.warning('No se pudo acceder al portapapeles. Da permiso al navegador en este sitio web.');
        }
    };

    // Memoize suggestion config so Mention extension gets latest characters
    const suggestionConfig = useMemo(() => createSuggestion(characters || []), [characters]);

    // Handlers for Inline Notes
    const handleAddNote = () => {
        if (!editor) return;
        const { from, to, empty } = editor.state.selection;
        if (empty) {
            toast.info('Selecciona un fragmento de texto primero para añadir una nota.');
            return;
        }
        setNoteSelectionRange({ from, to });
        setNoteText('');
        setIsNoteModalOpen(true);
    };

    const handleSaveNote = () => {
        if (!editor || !noteSelectionRange || !noteText.trim()) return;
        const noteId = 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        editor.chain()
            .focus()
            .setTextSelection(noteSelectionRange)
            .setMark('inlineNote', { noteId, noteText: noteText.trim() })
            .run();
        setIsNoteModalOpen(false);
        setNoteText('');
        setNoteSelectionRange(null);
        toast.success('Nota añadida al texto.');
    };

    const handleDeleteNote = (noteId) => {
        if (!editor) return;
        const { doc } = editor.state;
        let noteFrom = null;
        let noteTo = null;
        doc.descendants((node, pos) => {
            if (node.isText) {
                node.marks.forEach(mark => {
                    if (mark.type.name === 'inlineNote' && mark.attrs.noteId === noteId) {
                        if (noteFrom === null) noteFrom = pos;
                        noteTo = pos + node.nodeSize;
                    }
                });
            }
        });
        if (noteFrom !== null && noteTo !== null) {
            editor.chain()
                .focus()
                .setTextSelection({ from: noteFrom, to: noteTo })
                .unsetMark('inlineNote')
                .run();
        }
        setIsViewNoteModalOpen(false);
        setViewingNote(null);
        toast.info('Nota eliminada.');
    };

    const handleUpdateNote = () => {
        if (!editor || !viewingNote || !editNoteText.trim()) return;
        const { doc } = editor.state;
        let noteFrom = null;
        let noteTo = null;
        doc.descendants((node, pos) => {
            if (node.isText) {
                node.marks.forEach(mark => {
                    if (mark.type.name === 'inlineNote' && mark.attrs.noteId === viewingNote.noteId) {
                        if (noteFrom === null) noteFrom = pos;
                        noteTo = pos + node.nodeSize;
                    }
                });
            }
        });
        if (noteFrom !== null && noteTo !== null) {
            editor.chain()
                .focus()
                .setTextSelection({ from: noteFrom, to: noteTo })
                .setMark('inlineNote', { noteId: viewingNote.noteId, noteText: editNoteText.trim() })
                .run();
        }
        setViewingNote(prev => ({ ...prev, noteText: editNoteText.trim() }));
        setIsEditingNote(false);
        toast.success('Nota actualizada.');
    };

    const handleStatusChange = (newStatus) => {
        if (!activeChapter) return;

        if (newStatus === 'Finalizado') {
            setIsFinalizeModalOpen(true);
        } else {
            updateChapter(activeChapter.id, { status: newStatus });
            if (newStatus === 'Completado') {
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#34d399', '#6ee7b7']
                });
            }
        }
    };

    const confirmFinalize = async (shouldCleanup) => {
        if (!activeChapter) return;

        try {
            // 1. Update status in cloud
            await updateChapter(activeChapter.id, { status: 'Finalizado' });

            // 2. Perform cleanup if selected
            if (shouldCleanup) {
                await finalizeChapterCleanup(activeChapter.id);
                toast.success("Capítulo finalizado y respaldos optimizados.");
            } else {
                toast.success("Capítulo marcado como finalizado.");
            }

            // 3. Visual Effects
            confetti({
                particleCount: 200,
                spread: 90,
                origin: { y: 0.6 },
                colors: ['#6366f1', '#a855f7', '#ec4899', '#3b82f6']
            });
        } catch (error) {
            toast.error("Error al finalizar el capítulo.");
        } finally {
            setIsFinalizeModalOpen(false);
        }
    };

    const handleSendToIAStudio = () => {
        if (!viewingNote || !activeChapter) return;
        const instructions = `FRAGMENTO DEL TEXTO A REFINAR:\n"${viewingNote.highlightedText}"\n\nNOTA DEL AUTOR:\n${viewingNote.noteText}`;
        setPromptStudioPreload({
            tab: 'refine',
            chapterId: activeChapter.id,
            instructions
        });
        setActiveView('iaStudio');
        setIsViewNoteModalOpen(false);
        setViewingNote(null);
    };

    const editor = useEditor({
        extensions: [
            StarterKit,
            CharacterMention,
            InlineNote,
            GhostMention,
            Placeholder.configure({
                placeholder: 'Haz clic aquí para empezar a escribir...',
            }),
            Focus.configure({
                className: 'has-focus',
                mode: 'deepest',
            }),
            Mention.configure({
                HTMLAttributes: {
                    class: 'character-mention-node',
                },
                suggestion: suggestionConfig,
                renderHTML({ options, node }) {
                    return [
                        'span',
                        mergeAttributes(
                            { 'data-char-id': node.attrs.id },
                            options.HTMLAttributes,
                        ),
                        `@${node.attrs.label ?? node.attrs.id}`,
                    ]
                },
            }),
        ],
        content: activeChapter?.content || '',
        editorProps: {
            attributes: {
                class: 'prose mx-auto focus:outline-none h-full max-w-none',
            },
            handleClick: (view, pos, event) => {
                const target = event.target;

                // Check for inline note click
                const noteTarget = target.closest('mark[data-note-id]');
                if (noteTarget) {
                    const noteId = noteTarget.getAttribute('data-note-id');
                    const noteTextAttr = noteTarget.getAttribute('data-note-text');
                    const highlightedText = noteTarget.textContent;
                    setViewingNote({ noteId, noteText: noteTextAttr, highlightedText });
                    setEditNoteText(noteTextAttr);
                    setIsEditingNote(false);
                    setIsViewNoteModalOpen(true);
                    return true;
                }

                // Check for ghost mention click
                const ghostTarget = target.closest('span[data-ghost-char-id]');
                if (ghostTarget) {
                    const charId = ghostTarget.getAttribute('data-ghost-char-id');
                    const text = ghostTarget.textContent;
                    handleConvertGhostMention(charId, text, pos);
                    return true;
                }

                // Check for regular character mention click (node or mark)
                const charTarget = target.closest('[data-char-id]');
                if (charTarget) {
                    const charId = charTarget.getAttribute('data-char-id');
                    setSelectedCharacterId(charId);
                    setCurrentImageIndex(0);
                    setIsCardFlipped(false);
                    setIsCardModalOpen(true);
                    return true;
                }

                return false;
            }
        },
        onSelectionUpdate: ({ editor }) => {
            const { from, to, empty } = editor.state.selection;
            const isReadOnlyStatus = activeChapterRef.current?.status === 'Completado' || activeChapterRef.current?.status === 'Finalizado';
            const isReadOnlyMode = isReadOnlyStatus || isFocusMode;

            if (empty || from === to || isReadOnlyMode) {
                setSelectionMetrics({ words: 0, chars: 0, show: false });
                return;
            }

            const text = editor.state.doc.textBetween(from, to, ' ');
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            const chars = text.length;

            if (words > 0) {
                setSelectionMetrics({ words, chars, show: true });
            } else {
                setSelectionMetrics({ words: 0, chars: 0, show: false });
            }
        },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            saveChapterContentRef.current(html);

            // Update total word count
            const text = editor.getText();
            setTotalWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);

            // Passive Detection Logic (ghost mentions)
            if (window.ghostDetectTimeout) clearTimeout(window.ghostDetectTimeout);
            window.ghostDetectTimeout = setTimeout(() => {
                const currentCharacters = charactersRef.current;
                if (!editor || !currentCharacters || currentCharacters.length === 0) return;
                if (editor.isActive('mention')) return;

                const baseCharacters = currentCharacters.filter(c => !c.isCategory && c.name && c.name.trim() !== '');
                if (baseCharacters.length === 0) return;

                const searchTerms = [];
                baseCharacters.forEach(char => {
                    searchTerms.push({ name: char.name, id: char.id });
                    const parts = char.name.trim().split(/\s+/);
                    if (parts.length > 1 && parts[0].length >= 3) {
                        searchTerms.push({ name: parts[0], id: char.id });
                    }
                });
                searchTerms.sort((a, b) => b.name.length - a.name.length);

                const { doc } = editor.state;
                let tr = editor.state.tr;
                let hasChanges = false;

                doc.descendants((node, pos) => {
                    if (!node.isText) return true;

                    // Skip if parent is a mention or ghost mention already
                    const parent = doc.resolve(pos).parent;
                    if (parent.type.name === 'mention' || parent.type.name === 'characterMention') return false;

                    const textContent = node.text;
                    searchTerms.forEach(term => {
                        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`\\b(${escapeRegExp(term.name)})\\b`, 'gi');

                        let match;
                        while ((match = regex.exec(textContent)) !== null) {
                            const start = pos + match.index;
                            const end = start + match[0].length;

                            // Check if already has ghostMention or characterMention mark
                            const currentMarks = doc.resolve(start + 1).marks();
                            const hasMark = currentMarks.some(m => m.type.name === 'ghostMention' || m.type.name === 'characterMention' || m.type.name === 'mention');

                            if (!hasMark) {
                                const ghostMark = editor.schema.marks.ghostMention.create({ charId: term.id });
                                tr = tr.addMark(start, end, ghostMark);
                                hasChanges = true;
                            }
                        }
                    });
                });

                if (hasChanges && editor && !editor.isDestroyed && editor.view) {
                    editor.view.dispatch(tr.setMeta('addToHistory', false));
                }
            }, 1500);
        }
    })

    // Whenever the active chapter changes (from sidebar), we reset editor content
    useEffect(() => {
        if (editor && activeChapter) {
            const currentHtml = editor.getHTML();
            if (currentHtml !== activeChapter.content) {
                editor.commands.setContent(activeChapter.content || '', false);
                
                // Also update word count after setting content
                const text = editor.getText();
                setTotalWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
            }
        }
    }, [activeChapter?.id, activeChapter?.lastSyncToken, editor]);

    // Handle Editable state (Focus Mode + Real-time Lock + Finalized Status)
    useEffect(() => {
        if (editor) {
            const isReadOnlyStatus = activeChapter?.status === 'Completado' || activeChapter?.status === 'Finalizado';
            const isEditable = !isFocusMode && !chapterLock.isLocked && !isReadOnlyStatus;
            editor.setEditable(isEditable);
        }
    }, [isFocusMode, chapterLock.isLocked, activeChapter?.status, editor]);

    const isEditorLocked = useMemo(() => {
        const isReadOnlyStatus = activeChapter?.status === 'Completado' || activeChapter?.status === 'Finalizado';
        return isFocusMode || chapterLock.isLocked || isReadOnlyStatus;
    }, [isFocusMode, chapterLock.isLocked, activeChapter?.status]);



    // Removal of old click handler useEffect as it's now handled by editorProps.handleClick

    const [isPremiumNarratorOpen, setIsPremiumNarratorOpen] = useState(false);
    const [isNarratorSelectorOpen, setIsNarratorSelectorOpen] = useState(false);
    const [isPremiumPlayerOpen, setIsPremiumPlayerOpen] = useState(false);
    const [playingChunk, setPlayingChunk] = useState(null);

    // Resaltado en Editor (Narración Sincronizada)
    useEffect(() => {
        if (!editor || editor.isDestroyed || !playingChunk) {
            document.querySelectorAll('.playing-chunk-highlight').forEach(el => el.classList.remove('playing-chunk-highlight'));
            return;
        }

        const clean = (t) => t.replace(/\s+/g, ' ').trim();
        const textToFind = clean(playingChunk.textoActual);
        if (!textToFind) return;

        const timeoutId = setTimeout(() => {
            if (!editor.view?.dom) return;
            const paragraphs = editor.view.dom.querySelectorAll('p, h1, h2, h3, li');
            
            // Limpiar todos antes de marcar el nuevo
            document.querySelectorAll('.playing-chunk-highlight').forEach(el => el.classList.remove('playing-chunk-highlight'));

            let found = false;
            paragraphs.forEach(p => {
                const pText = clean(p.textContent);
                if (pText.includes(textToFind) || textToFind.includes(pText)) {
                    p.classList.add('playing-chunk-highlight');
                    if (!found) {
                        p.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        found = true;
                    }
                }
            });
        }, 150);

        return () => clearTimeout(timeoutId);
    }, [playingChunk, editor]);

    // Update typography classes dynamically when size changes
    useEffect(() => {
        if (!editor || editor.isDestroyed || !editor.view?.dom) return;
        const sizeClass = readingTextSize === 'sm' ? 'prose-sm' :
            readingTextSize === 'lg' ? 'prose-lg' :
                readingTextSize === 'xl' ? 'prose-xl' :
                    'prose-base';

        // Use classList to safely add Tailwind classes without removing Tiptap internal classes (like is-empty, ProseMirror)
        editor.view.dom.classList.remove('prose-sm', 'prose-base', 'prose-lg', 'prose-xl');
        editor.view.dom.classList.add('prose', sizeClass, 'max-w-none', 'mx-auto', 'focus:outline-none', 'h-full');
    }, [readingTextSize, editor]);



    return (
        <div className={`flex flex-col bg-[var(--bg-editor)] overflow-hidden transition-all duration-300 ${isFocusMode ? 'fixed inset-0 z-50' : 'w-full h-full'}`}>
            {/* Multi-device Presence Banner */}
            {chapterLock.isLocked && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-medium">
                        <Lock size={16} />
                        <span>Este capítulo está siendo editado desde otro dispositivo.</span>
                    </div>
                    <button
                        onClick={() => claimLock()}
                        className="text-xs bg-amber-500 text-white px-3 py-1 rounded-full font-bold hover:bg-amber-600 transition-colors shadow-sm flex items-center gap-1"
                    >
                        <Unlock size={12} />
                        Tomar el control
                    </button>
                </div>
            )}

            {!chapterLock.isLocked && chapterLock.activeEditorId && (
                <div className="bg-indigo-500/10 border-b border-indigo-500/20 px-6 py-1 flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
                    <Check size={10} />
                    <span>Tienes el control de edición en este dispositivo</span>
                </div>
            )}

            {/* Editor Toolbar */}
            {!isFocusMode ? (
                <div className="border-b border-[var(--border-main)] bg-[var(--bg-app)] shrink-0 px-3 py-2 md:px-6">
                    {/* Mobile Only: Simplified row based on user image */}
                    <div className="flex md:hidden items-center justify-between gap-3">
                        <button
                            onClick={() => setIsChapterInfoModalOpen(true)}
                            className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--border-main)] text-[var(--accent-main)] bg-[var(--bg-app)]"
                        >
                            <Info size={18} />
                        </button>

                        {activeChapter && (
                            <div className="flex-1 flex items-center gap-2 px-3 h-10 rounded-full border border-[var(--border-main)] bg-[var(--bg-editor)]">
                                <div className={`w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_rgba(99,102,241,0.4)] ${
                                    activeChapter.status === 'Finalizado' ? 'bg-indigo-500' :
                                    activeChapter.status === 'Completado' ? 'bg-emerald-500' :
                                    activeChapter.status === 'Revisión' ? 'bg-amber-500' :
                                    'bg-blue-500'
                                }`}></div>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-main)] truncate">
                                    {activeChapter.status || 'Idea'}
                                </span>
                            </div>
                        )}

                        <button
                            onClick={handleAddNote}
                            className="w-10 h-10 flex items-center justify-center rounded-xl border border-amber-500/30 text-amber-600 bg-amber-500/5"
                        >
                            <MessageSquarePlus size={18} />
                        </button>

                        <button
                            onClick={() => setIsFocusMode(true)}
                            className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--border-main)] text-[var(--accent-main)] bg-[var(--bg-app)]"
                        >
                            <BookOpen size={18} />
                        </button>

                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--accent-main)]/30 text-[var(--accent-main)] bg-[var(--accent-soft)]"
                        >
                            <MoreHorizontal size={20} />
                        </button>
                    </div>

                    {/* Desktop Toolbar (Sophisticated) */}
                    {/* Desktop Toolbar (Sophisticated) */}
                    <div className="hidden md:flex items-center justify-between gap-4 w-full h-14">
                        {/* Left Group */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsFormattingModalOpen(true)}
                                className="h-11 px-4 rounded-xl text-[var(--accent-main)] bg-[var(--accent-soft)] hover:bg-[var(--accent-main)] hover:text-white transition-all shadow-sm flex items-center gap-2 border border-[var(--border-main)]"
                                title="Formato y Estilos"
                            >
                                <Pencil size={18} />
                                <span className="text-base font-black leading-none pb-0.5">A</span>
                            </button>

                            <button
                                onClick={() => setIsFocusMode(true)}
                                className="w-11 h-11 rounded-xl text-[var(--text-muted)] border border-[var(--border-main)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)] transition-all shadow-sm flex items-center justify-center"
                                title="Modo Lectura / Foco"
                            >
                                <BookOpen size={20} />
                            </button>

                            <button
                                onClick={() => setIsChapterInfoModalOpen(true)}
                                className="w-11 h-11 rounded-xl text-[var(--text-muted)] border border-[var(--border-main)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)] transition-all shadow-sm flex items-center justify-center"
                                title="Información del Capítulo"
                            >
                                <Info size={20} />
                            </button>
                        </div>

                        {/* Center Group */}
                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl p-1 shadow-sm relative">
                                <button
                                    onClick={() => setIsCopyDropdownOpen(!isCopyDropdownOpen)}
                                    className="px-3 py-1.5 text-[10px] font-black text-[var(--text-main)] uppercase tracking-widest flex items-center gap-2 hover:bg-[var(--accent-soft)] rounded-lg transition-all"
                                >
                                    <span>{copyMode === 'text' ? 'Texto' : copyMode === 'title' ? 'Título' : 'Todo'}</span>
                                    <ChevronRight size={12} className={`transition-transform duration-300 ${isCopyDropdownOpen ? 'rotate-90' : ''}`} />
                                </button>

                                {isCopyDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsCopyDropdownOpen(false)}></div>
                                        <div className="absolute top-full left-0 mt-2 w-32 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150">
                                            <div className="p-1 space-y-0.5">
                                                {[
                                                    { id: 'text', label: 'Texto' },
                                                    { id: 'title', label: 'Título' },
                                                    { id: 'all', label: 'Todo' }
                                                ].map(mode => (
                                                    <button
                                                        key={mode.id}
                                                        onClick={() => { setCopyMode(mode.id); setIsCopyDropdownOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${copyMode === mode.id ? 'bg-[var(--accent-main)] text-white' : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'}`}
                                                    >
                                                        {mode.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="w-px h-4 bg-[var(--border-main)] mx-1"></div>
                                <button
                                    onClick={handleCopyToClipboard}
                                    className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${copied ? 'bg-green-500 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-main)]'}`}
                                    title="Copiar"
                                >
                                    <Copy size={18} />
                                </button>
                            </div>
                            
                            <button
                                onClick={handleReplaceFromClipboard}
                                className="h-11 px-4 rounded-xl text-[var(--accent-main)] bg-[var(--accent-soft)] hover:bg-[var(--accent-main)] hover:text-white transition-all shadow-sm border border-[var(--border-main)] flex items-center gap-2"
                                title="Sustituir con Portapapeles"
                            >
                                <ClipboardPaste size={18} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Reemplazar</span>
                            </button>
                        </div>

                        {/* Right Group */}
                        <div className="flex items-center gap-3">
                            {activeChapter && (
                                <div className="relative">
                                    <button 
                                        onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                                        className="flex items-center gap-3 px-5 h-11 rounded-full border border-[var(--border-main)] bg-[var(--bg-editor)] shadow-sm hover:border-[var(--accent-main)] transition-all group"
                                    >
                                        <div className={`w-2.5 h-2.5 rounded-full ${
                                            STATUS_OPTIONS.find(o => o.value === activeChapter.status)?.color || 'bg-gray-400'
                                        } ${
                                            STATUS_OPTIONS.find(o => o.value === activeChapter.status)?.shadow || ''
                                        } shadow-sm transition-all duration-300`}></div>
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-main)] italic">{activeChapter.status || 'Idea'}</span>
                                        <ChevronDown size={14} className={`text-[var(--text-muted)] group-hover:text-[var(--accent-main)] transition-transform duration-300 ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isStatusDropdownOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setIsStatusDropdownOpen(false)}></div>
                                            <div className="absolute right-0 mt-3 w-52 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-[24px] shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200">
                                                <div className="p-2 space-y-1">
                                                    {STATUS_OPTIONS.map((opt) => (
                                                        <button 
                                                            key={opt.value}
                                                            onClick={() => {
                                                                handleStatusChange(opt.value);
                                                                setIsStatusDropdownOpen(false);
                                                            }}
                                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${activeChapter.status === opt.value ? 'bg-indigo-500/5' : 'hover:bg-[var(--bg-editor)]'}`}
                                                        >
                                                            <div className={`w-2.5 h-2.5 rounded-full ${opt.color} ${opt.shadow} shadow-sm transition-transform group-hover:scale-110`} />
                                                            <span className={`text-[10px] font-black uppercase tracking-widest ${activeChapter.status === opt.value ? 'text-indigo-600' : 'text-[var(--text-muted)] group-hover:text-[var(--text-main)]'}`}>{opt.label}</span>
                                                            {activeChapter.status === opt.value && (
                                                                <Check size={12} className="ml-auto text-indigo-500" />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Options Dropdown */}
                            <div className="relative">
                                <button 
                                    onClick={() => setIsDesktopMoreOpen(!isDesktopMoreOpen)}
                                    className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-300 ${isDesktopMoreOpen ? 'bg-[var(--accent-main)] text-white shadow-lg' : 'bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-muted)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)] shadow-sm'}`}
                                >
                                    <MoreHorizontal size={22} />
                                </button>

                                {isDesktopMoreOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsDesktopMoreOpen(false)}></div>
                                        <div className="absolute right-0 mt-3 w-64 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200">
                                            <div className="p-1.5 space-y-1">
                                                <button onClick={() => { setIsDetectionModeModalOpen(true); setIsDesktopMoreOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--accent-soft)] text-[var(--text-main)] rounded-xl transition-all group text-left">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                                        <ScanSearch size={16} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black uppercase tracking-widest">IA Scan</span>
                                                        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">Analizar Personajes</span>
                                                    </div>
                                                </button>

                                                <button onClick={() => { setIsHistoryModalOpen(true); setIsDesktopMoreOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--accent-soft)] text-[var(--text-main)] rounded-xl transition-all group text-left">
                                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                                        <History size={16} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black uppercase tracking-widest">Historial</span>
                                                        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">Versiones y Backup</span>
                                                    </div>
                                                </button>

                                                <button onClick={() => { setIsReadingSettingsModalOpen(true); setIsDesktopMoreOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--accent-soft)] text-[var(--text-main)] rounded-xl transition-all group text-left">
                                                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-all">
                                                        <Settings size={18} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black uppercase tracking-widest">Vista</span>
                                                        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">Fuentes y Diseño</span>
                                                    </div>
                                                </button>

                                                 {(profile?.googleApiKey1 || profile?.googleApiKey2) && (
                                                    <button 
                                                        onClick={() => { setIsNarratorSelectorOpen(true); setIsDesktopMoreOpen(false); }}
                                                        disabled={activeChapter?.status !== 'Finalizado'}
                                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group text-left ${activeChapter?.status === 'Finalizado' ? 'hover:bg-indigo-50' : 'opacity-40 grayscale cursor-not-allowed'}`}
                                                    >
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeChapter?.status === 'Finalizado' ? 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white' : 'bg-gray-100 text-gray-400'} transition-all`}>
                                                            <FileAudio size={16} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-black uppercase tracking-widest">Narrador</span>
                                                            <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">Generar Audio Premium</span>
                                                        </div>
                                                    </button>
                                                )}

                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between p-2 px-3 md:px-6 w-full bg-[var(--bg-app)] border-b border-[var(--border-main)]">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsReadingSettingsModalOpen(true)} className="p-2 rounded-lg border border-[var(--border-main)] text-[var(--text-muted)]"><Settings size={16} /></button>
                    </div>
                    <div className="flex items-center gap-2">
                        {prevChapter && <button onClick={() => selectChapter(prevChapter)} className="p-2 text-[var(--accent-main)]"><ChevronLeft size={20} /></button>}
                        {nextChapter && <button onClick={() => selectChapter(nextChapter)} className="p-2 text-[var(--accent-main)]"><ChevronRight size={20} /></button>}
                    </div>
                    <button onClick={() => setIsFocusMode(false)} className="px-4 py-2 rounded-lg border border-red-500/30 text-red-500 font-bold uppercase text-[10px]">Salir</button>
                </div>
            )}

            {/* Premium Buffering Overlay */}

            <div className={`flex-1 overflow-y-auto px-4 pt-8 pb-8 md:px-20 md:pt-24 md:pb-8 scrollbar-hide transition-all duration-300 ${isFocusMode ? 'editor-focus-mode ' + readingFont : 'font-[Arial,sans-serif]'} ${isEditorLocked ? 'editor-locked-mode' : ''}`}>
                <div className={`min-h-full transition-all duration-500 mx-auto ${isFocusMode && readingWidth === 'full' ? 'w-full px-2' :
                    isFocusMode && readingWidth === 'xl' ? 'max-w-7xl' :
                        isFocusMode && readingWidth === 'lg' ? 'max-w-5xl' :
                            isFocusMode && readingWidth === 'sm' ? 'max-w-xl' :
                                'max-w-3xl'
                    }`}>
                    {editor && (
                        <BubbleMenu 
                            editor={editor} 
                            pluginKey="bubbleMenuSelection"
                            shouldShow={({ state, from, to }) => {
                                const isReadOnlyStatus = activeChapterRef.current?.status === 'Completado' || activeChapterRef.current?.status === 'Finalizado';
                                const isReadOnlyMode = isReadOnlyStatus || isFocusMode;
                                return from !== to && !state.selection.empty && !isReadOnlyMode;
                            }}
                            className="flex items-center gap-1 bg-[var(--bg-app)]/80 backdrop-blur-xl border border-white/20 p-1.5 rounded-2xl shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-200 z-[9999]"
                        >
                            <div className="flex items-center gap-0.5 px-1 border-r border-white/10 mr-1">
                                <button
                                    onClick={() => editor.chain().focus().toggleBold().run()}
                                    className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${editor.isActive('bold') ? 'bg-[var(--accent-main)] text-white' : 'text-[var(--text-main)] hover:bg-white/10'}`}
                                    title="Negrita"
                                >
                                    <span className="font-bold text-sm">B</span>
                                </button>
                                <button
                                    onClick={() => editor.chain().focus().toggleItalic().run()}
                                    className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${editor.isActive('italic') ? 'bg-[var(--accent-main)] text-white' : 'text-[var(--text-main)] hover:bg-white/10'}`}
                                    title="Cursiva"
                                >
                                    <span className="italic font-serif text-sm">I</span>
                                </button>
                            </div>

                            <div className="flex items-center gap-0.5 px-1 border-r border-white/10 mr-1">
                                {[1, 2, 3].map(level => (
                                    <button
                                        key={level}
                                        onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
                                        className={`w-9 h-9 flex items-center justify-center rounded-xl text-[10px] font-black transition-all ${editor.isActive('heading', { level }) ? 'bg-[var(--accent-main)] text-white' : 'text-[var(--text-main)] hover:bg-white/10'}`}
                                        title={`Título ${level}`}
                                    >
                                        H{level}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => {
                                    const { from, to } = editor.state.selection;
                                    const text = editor.state.doc.textBetween(from, to, ' ');
                                    navigator.clipboard.writeText(text);
                                    toast.success('¡Copiado!');
                                }}
                                className="w-9 h-9 flex items-center justify-center rounded-xl text-[var(--accent-main)] hover:bg-[var(--accent-main)] hover:text-white transition-all ml-0.5"
                                title="Copiar Selección"
                            >
                                <Copy size={16} />
                            </button>
                        </BubbleMenu>
                    )}
                    {editor && <EditorContent editor={editor} className={`min-h-full cursor-text ${isEditorLocked ? 'pointer-events-none select-none' : ''}`} onClick={() => !isEditorLocked && editor.commands.focus()} />}
                </div>
            </div>

            {/* Phase 4: Selection Toast */}
            {selectionMetrics.show && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-[var(--bg-app)]/90 backdrop-blur-2xl border border-indigo-500/30 rounded-2xl p-2 px-4 shadow-2xl flex items-center gap-6 ring-1 ring-indigo-500/20">
                        <div className="flex items-center gap-4 border-r border-[var(--border-main)] pr-6">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest leading-none mb-1">Selección</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-black text-[var(--text-main)]">{selectionMetrics.words} <span className="text-[10px] opacity-40 font-bold uppercase ml-0.5">Palabras</span></span>
                                    <div className="w-1 h-1 rounded-full bg-[var(--border-main)]"></div>
                                    <span className="text-sm font-black text-[var(--text-main)]">{selectionMetrics.chars} <span className="text-[10px] opacity-40 font-bold uppercase ml-0.5">Letras</span></span>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                const { from, to } = editor.state.selection;
                                const text = editor.state.doc.textBetween(from, to, ' ');
                                setPromptStudioPreload({
                                    tab: 'refine',
                                    chapterId: activeChapter.id,
                                    instructions: `FRAGMENTO SELECCIONADO PARA REFINAR:\n"${text}"`
                                });
                                setActiveView('iaStudio');
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-indigo-600/20 active:scale-95 group"
                        >
                            <Sparkles size={14} className="group-hover:rotate-12 transition-transform" />
                            Refinar IA
                        </button>

                        <button 
                            onClick={() => {
                                editor.chain().focus().setTextSelection({ from: editor.state.selection.to, to: editor.state.selection.to }).run();
                                setSelectionMetrics({ ...selectionMetrics, show: false });
                            }}
                            className="p-2 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}


            {/* Modal de confirmación de detección de personajes */}
            <Modal isOpen={isDetectionModalOpen} onClose={() => { setIsDetectionModalOpen(false); setHighlightedCharId(null); }} title="Personajes Detectados">
                <div className="p-8 space-y-6 font-sans">
                    <div className="space-y-4">
                        <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">Se han identificado menciones de personajes en tu texto. Selecciona uno para previsualizar los cambios:</p>
                        <div className="flex flex-wrap gap-2 py-1">
                            {detectedCharacters.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => setHighlightedCharId(highlightedCharId === char.id ? null : char.id)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border ${highlightedCharId === char.id
                                        ? 'bg-[var(--accent-main)] text-white border-[var(--accent-main)] shadow-lg scale-105'
                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)]'
                                        }`}
                                >
                                    {char.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Vista Previa de Anotaciones</label>
                        <div
                            className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl p-6 max-h-48 overflow-y-auto text-sm prose prose-sm shadow-inner"
                            dangerouslySetInnerHTML={{
                                __html: (() => {
                                    let html = newPreviewHtml;
                                    if (highlightedCharId) {
                                        const regex = new RegExp(`<span data-char-id="${highlightedCharId}">(.*?)</span>`, 'gi');
                                        html = html.replace(regex, '<mark style="background:linear-gradient(135deg,#6366f1 0%,#a855f7 100%);color:white;padding:1px 4px;border-radius:4px;font-weight:700;">$1</mark>');
                                        html = html.replace(/<span data-char-id/g, '<span style="color:var(--accent-main);font-weight:600;border-bottom:1px dashed var(--accent-main);" data-char-id');
                                    } else {
                                        html = html.replace(/<span data-char-id/g, '<span style="color:var(--accent-main);font-weight:600;border-bottom:1px dashed var(--accent-main);" data-char-id');
                                    }
                                    return html;
                                })()
                            }}
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => { setIsDetectionModalOpen(false); setHighlightedCharId(null); }}
                            className="px-6 py-3 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors text-sm"
                        >
                            Descartar
                        </button>
                        <button
                            onClick={() => {
                                if (editor) {
                                    editor.commands.setContent(newPreviewHtml);
                                }
                                setIsDetectionModalOpen(false);
                                setHighlightedCharId(null);
                            }}
                            className="px-8 py-3 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95"
                        >
                            Aplicar al Documento
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal de selección de modo de detección */}
            <Modal isOpen={isDetectionModeModalOpen} onClose={() => setIsDetectionModeModalOpen(false)} title="Modo de Detección">
                <div className="p-8 space-y-6 font-sans">
                    <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">Personaliza el motor de búsqueda para encontrar los nombres de tus personajes en el manuscrito:</p>
                    <div className="grid grid-cols-1 gap-4">
                        <button
                            onClick={() => {
                                setIsDetectionModeModalOpen(false);
                                runDetection('full');
                            }}
                            className="p-6 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-editor)] hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left group shadow-sm"
                        >
                            <div className="font-black text-xs uppercase tracking-widest text-[var(--text-main)] mb-2 group-hover:text-indigo-600 transition-colors">Solo nombres completos</div>
                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Busca coincidencias exactas. Ej: "Claire Wilson" solo detectará el nombre completo.</p>
                        </button>
                        <button
                            onClick={() => {
                                setIsDetectionModeModalOpen(false);
                                runDetection('simple');
                            }}
                            className="p-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500 hover:bg-indigo-500/10 transition-all text-left group shadow-md"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="font-black text-xs uppercase tracking-widest text-indigo-600 transition-colors">Completos + Simples</div>
                                <span className="text-[9px] bg-indigo-600 text-white rounded-full px-2.5 py-1 font-black uppercase tracking-tighter shadow-sm">Recomendado</span>
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Detecta nombres completos y también por separado. Ej: "Claire Wilson" y también "Claire".</p>
                        </button>
                    </div>
                    <div className="flex justify-end pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => setIsDetectionModeModalOpen(false)}
                            className="px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-all"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal Character Card */}
            {
                isCardModalOpen && selectedCharacterId && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsCardModalOpen(false)}>
                        {(() => {
                            const char = characters.find(c => c.id === selectedCharacterId);
                            if (!char) return null;
                            const hasImages = char.images && char.images.length > 0;
                            const images = hasImages ? char.images : ['https://via.placeholder.com/400x600?text=Sin+Imagen'];

                            return (
                                <div
                                    className="relative w-[22rem] h-[34rem] perspective-1000 animate-in zoom-in-95 duration-300"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className={`w-full h-full transition-transform duration-700 transform-style-3d ${isCardFlipped ? 'rotate-y-180' : ''}`}>
                                        {/* Frente: Carrusel de Imágenes */}
                                        <div className="absolute inset-0 bg-[var(--bg-app)] rounded-3xl shadow-2xl border border-[var(--border-main)] overflow-hidden backface-hidden flex flex-col ring-1 ring-black/5 dark:ring-white/10">
                                            <div className="flex-1 relative group bg-black min-h-0 w-full overflow-hidden">
                                                <img
                                                    src={images[currentImageIndex]}
                                                    alt={char.name}
                                                    className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-700 group-hover:scale-105"
                                                />
                                                {/* Gradiente sutil Superior e Inferior */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-black/60 pointer-events-none"></div>

                                                {hasImages && images.length > 1 && (
                                                    <>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1)); }}
                                                            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                                                        >
                                                            <ChevronLeft size={20} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1)); }}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                                                        >
                                                            <ChevronRight size={20} />
                                                        </button>

                                                        {/* Indicadores flotantes iOS style */}
                                                        <div className="absolute bottom-[20px] left-0 right-0 flex justify-center gap-2">
                                                            {images.map((_, i) => (
                                                                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === currentImageIndex ? 'w-5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'w-1.5 bg-white/40 hover:bg-white/60'}`} />
                                                            ))}
                                                        </div>
                                                    </>
                                                )}

                                                <div className="absolute top-4 right-4">
                                                    <button onClick={() => setIsCardModalOpen(false)} className="p-2 bg-black/30 hover:bg-red-500/80 backdrop-blur-md text-white rounded-full transition-all shadow-md">
                                                        <X size={16} />
                                                    </button>
                                                </div>

                                                <div className="absolute bottom-[45px] left-6 right-6 pointer-events-none flex flex-col justify-end">
                                                    {char.role && (
                                                        <span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#818cf8] mb-1.5 drop-shadow-md">{char.role}</span>
                                                    )}
                                                    <h3 className="text-3xl font-black font-serif text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{char.name}</h3>
                                                </div>
                                            </div>

                                            <div className="p-4 bg-[var(--bg-app)]/95 backdrop-blur-md shrink-0 border-t border-[var(--border-main)]">
                                                <button
                                                    onClick={() => setIsCardFlipped(true)}
                                                    className="w-full py-3 bg-gradient-to-r from-indigo-500 to-[var(--accent-main)] hover:from-indigo-600 hover:to-indigo-500 text-white text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 hover:scale-[1.02] active:scale-95"
                                                >
                                                    <Info size={18} /> Ver Expediente
                                                </button>
                                            </div>
                                        </div>

                                        {/* Reverso: Detalles */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-app)] to-[var(--bg-editor)] rounded-3xl shadow-2xl border border-[var(--border-main)] overflow-hidden backface-hidden rotate-y-180 flex flex-col p-2 ring-1 ring-black/5 dark:ring-white/10">
                                            <div className="relative flex-1 bg-[var(--bg-app)] rounded-[1.25rem] border border-[var(--border-main)]/50 flex flex-col overflow-hidden">

                                                <div className="p-6 pb-4 shrink-0 flex items-start justify-between border-b border-[var(--border-main)]/50 bg-[var(--bg-editor)]/50">
                                                    <div>
                                                        <h3 className="text-2xl font-black font-serif text-[var(--text-main)] leading-tight">{char.name}</h3>
                                                        {char.role && <div className="text-xs font-bold uppercase tracking-widest text-[#818cf8] mt-1">{char.role}</div>}
                                                    </div>
                                                    <button onClick={() => setIsCardModalOpen(false)} className="p-2 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors shrink-0 -mt-1 -mr-1">
                                                        <X size={18} />
                                                    </button>
                                                </div>

                                                <div className="p-6 flex-1 overflow-y-auto w-full scrollbar-hide">
                                                    <div className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap font-sans">
                                                        {char.description ? char.description : <span className="text-[var(--text-muted)] italic">No hay biografía disponible para este perfil.</span>}
                                                    </div>
                                                </div>

                                                <div className="p-4 bg-[var(--bg-editor)]/50 border-t border-[var(--border-main)]/50 shrink-0">
                                                    <button
                                                        onClick={() => setIsCardFlipped(false)}
                                                        className="w-full py-3 bg-[var(--bg-app)] border border-[var(--border-main)] hover:border-[var(--accent-main)] text-[var(--text-main)] text-sm font-bold rounded-xl transition-all shadow-sm hover:shadow-md"
                                                    >
                                                        Volver al Perfil Visual
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )
            }

            {/* History Modal */}
            <HistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                editor={editor}
            />

            {/* Formatting Hub Modal */}
            <Modal isOpen={isFormattingModalOpen} onClose={() => setIsFormattingModalOpen(false)} title="Opciones de Formato">
                <div className="p-8 space-y-8 font-sans">
                    {/* Headings & Text Styles */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em]">Estilos de Jerarquía</label>
                        <div className="grid grid-cols-3 gap-3">
                            {[1, 2, 3].map(level => (
                                <button
                                    key={level}
                                    onClick={() => {
                                        editor?.chain().focus().toggleHeading({ level }).run();
                                        setIsFormattingModalOpen(false);
                                    }}
                                    className={`p-5 rounded-2xl border transition-all flex flex-col items-center justify-center gap-2 ${editor?.isActive('heading', { level }) ? 'bg-[var(--accent-main)] border-[var(--accent-main)] text-white shadow-lg' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)]/50'}`}
                                >
                                    <span className="text-2xl font-black">H{level}</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Nivel {level}</span>
                                </button>
                            ))}
                            <button
                                onClick={() => {
                                    editor?.chain().focus().setParagraph().run();
                                    setIsFormattingModalOpen(false);
                                }}
                                className={`p-4 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 col-span-3 ${editor?.isActive('paragraph') ? 'bg-[var(--accent-main)] border-[var(--accent-main)] text-white shadow-lg' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)]/50'}`}
                            >
                                <span className="text-sm font-black uppercase tracking-widest leading-none">Párrafo Estándar</span>
                                <span className="text-[9px] font-medium opacity-60">Texto normal del manuscrito</span>
                            </button>
                        </div>
                    </div>

                    {/* Basic Formatting */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em]">Énfasis de Texto</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => editor?.chain().focus().toggleBold().run()}
                                className={`p-4 rounded-2xl border transition-all flex items-center justify-between px-6 ${editor?.isActive('bold') ? 'bg-[var(--accent-main)] border-[var(--accent-main)] text-white shadow-lg' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)]/50'}`}
                            >
                                <span className="text-2xl font-black">B</span>
                                <span className="text-xs font-black uppercase tracking-widest">Negrita</span>
                            </button>
                            <button
                                onClick={() => editor?.chain().focus().toggleItalic().run()}
                                className={`p-4 rounded-2xl border transition-all flex items-center justify-between px-6 ${editor?.isActive('italic') ? 'bg-[var(--accent-main)] border-[var(--accent-main)] text-white shadow-lg' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)]/50'}`}
                            >
                                <span className="text-2xl italic font-serif">I</span>
                                <span className="text-xs font-black uppercase tracking-widest">Cursiva</span>
                            </button>
                        </div>
                    </div>

                    {/* Cleanup */}
                    <div className="pt-6 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => {
                                editor?.chain().focus().unsetAllMarks().run();
                                editor?.chain().focus().clearNodes().run();
                                setIsFormattingModalOpen(false);
                                toast.info("Formato limpiado.");
                            }}
                            className="w-full py-4 bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 border border-red-500/10 hover:border-red-500 shadow-sm"
                        >
                            <Trash2 size={16} />
                            Limpiar Todo el Formato
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Settings Reading Modal */}
            <Modal isOpen={isReadingSettingsModalOpen} onClose={() => setIsReadingSettingsModalOpen(false)} title="Configuración de Lectura">
                <div className="p-8 space-y-8 font-sans">
                    {/* Typography Mosaic */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em]">Tipografía</label>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { id: 'font-serif', label: 'Serif', detail: 'Clásica y Elegante' },
                                { id: 'font-sans', label: 'Sans', detail: 'Moderna y Limpia' },
                                { id: 'font-[Arial,sans-serif]', label: 'Arial', detail: 'Estilo Estándar' },
                                { id: "font-['Roboto',sans-serif]", label: 'Roboto', detail: 'Google Style' }
                            ].map(font => (
                                <button
                                    key={font.id}
                                    onClick={() => setReadingFont(font.id)}
                                    className={`p-4 rounded-2xl border transition-all text-left flex flex-col gap-1.5 ${readingFont === font.id ? 'bg-[var(--accent-main)] border-[var(--accent-main)] text-white shadow-lg' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)]/50'}`}
                                >
                                    <span className={`text-2xl font-bold ${font.id} leading-none`}>Aa</span>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">{font.label}</span>
                                        <span className={`text-[9px] font-medium mt-1 ${readingFont === font.id ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>{font.detail}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Text Size Mosaic */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em]">Escala de Texto</label>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { id: 'sm', label: 'Chica', size: 'text-xs' },
                                { id: 'base', label: 'Normal', size: 'text-sm' },
                                { id: 'lg', label: 'Grande', size: 'text-base' },
                                { id: 'xl', label: 'Extra', size: 'text-lg' }
                            ].map(size => (
                                <button
                                    key={size.id}
                                    onClick={() => setReadingTextSize(size.id)}
                                    className={`p-3 py-4 rounded-2xl border transition-all flex flex-col items-center justify-center gap-2 ${readingTextSize === size.id ? 'bg-[var(--accent-main)] border-[var(--accent-main)] text-white shadow-lg' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)]/50'}`}
                                >
                                    <span className={`font-serif font-black ${size.size}`}>A</span>
                                    <span className="text-[9px] font-black uppercase tracking-tighter">{size.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Width Mosaic */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em]">Ancho de Enfoque</label>
                        <div className="grid grid-cols-5 gap-2">
                            {[
                                { id: 'sm', label: 'Min' },
                                { id: 'md', label: 'Ideal' },
                                { id: 'lg', label: 'Ancho' },
                                { id: 'xl', label: 'Extra' },
                                { id: 'full', label: 'Max' }
                            ].map(width => (
                                <button
                                    key={width.id}
                                    onClick={() => setReadingWidth(width.id)}
                                    className={`p-2 py-4 rounded-xl border transition-all flex flex-col items-center justify-center gap-2 ${readingWidth === width.id ? 'bg-[var(--accent-main)] border-[var(--accent-main)] text-white shadow-lg' : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)]/50'}`}
                                >
                                    <div className="flex items-center gap-0.5 opacity-60">
                                        <div className="w-0.5 h-3 bg-current rounded-full"></div>
                                        <div className={`h-3 bg-current rounded-sm ${width.id === 'sm' ? 'w-2' : width.id === 'md' ? 'w-4' : width.id === 'lg' ? 'w-6' : width.id === 'xl' ? 'w-8' : 'w-10'}`}></div>
                                        <div className="w-0.5 h-3 bg-current rounded-full"></div>
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-tighter">{width.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-6 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => setIsReadingSettingsModalOpen(false)}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95 text-xs"
                        >
                            Actualizar Preferencias
                        </button>
                    </div>
                </div>
            </Modal>


            {/* Note Creation Modal */}
            <Modal isOpen={isNoteModalOpen} onClose={() => { setIsNoteModalOpen(false); setNoteText(''); setNoteSelectionRange(null); }} title="📝 Añadir Nota al Texto">
                <div className="p-8 space-y-6 font-sans">
                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-6 space-y-3 shadow-inner">
                        <p className="text-[10px] font-black uppercase text-amber-600 tracking-[0.2em]">Fragmento Seleccionado</p>
                        <p className="text-base text-[var(--text-main)] italic font-serif leading-relaxed opacity-80">
                            "{editor && noteSelectionRange ? editor.state.doc.textBetween(noteSelectionRange.from, noteSelectionRange.to, ' ') : ''}"
                        </p>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] tracking-[0.2em]">Tu anotación</label>
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Escribe tu comentario aquí... (ej: 'Revisar tono', 'Ampliar diálogo')"
                            className="w-full h-40 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 text-[var(--text-main)] resize-none transition-all font-sans leading-relaxed placeholder:opacity-30"
                            autoFocus
                        />
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-[var(--border-main)]">
                        <button
                            onClick={() => { setIsNoteModalOpen(false); setNoteText(''); setNoteSelectionRange(null); }}
                            className="px-8 py-4 font-black text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] hover:bg-[var(--bg-editor)] rounded-2xl transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSaveNote}
                            disabled={!noteText.trim()}
                            className="px-10 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-amber-500/20 disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 active:scale-95"
                        >
                            <MessageSquarePlus size={18} />
                            Guardar Nota
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Note Viewer Modal */}
            <Modal isOpen={isViewNoteModalOpen} onClose={() => { setIsViewNoteModalOpen(false); setViewingNote(null); setIsEditingNote(false); }} title="📌 Nota del Autor">
                {viewingNote && (
                    <div className="p-8 space-y-6 font-sans">
                        <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-6 space-y-3 shadow-inner">
                            <p className="text-[10px] font-black uppercase text-amber-600 tracking-[0.2em]">Fragmento Resaltado</p>
                            <p className="text-base text-[var(--text-main)] italic font-serif leading-relaxed opacity-80">
                                "{viewingNote.highlightedText}"
                            </p>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] tracking-[0.2em]">Comentario</label>
                            {isEditingNote ? (
                                <div className="space-y-4">
                                    <textarea
                                        value={editNoteText}
                                        onChange={(e) => setEditNoteText(e.target.value)}
                                        className="w-full h-32 bg-[var(--bg-editor)] border border-amber-500/30 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-[var(--text-main)] resize-none transition-all font-sans leading-relaxed shadow-inner"
                                        autoFocus
                                    />
                                    <div className="flex justify-end gap-3">
                                        <button onClick={() => setIsEditingNote(false)} className="px-6 py-3 font-bold text-xs uppercase tracking-widest text-[var(--text-muted)] hover:bg-[var(--bg-editor)] rounded-xl transition-all">Cancelar</button>
                                        <button onClick={handleUpdateNote} className="px-8 py-3 bg-amber-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95">Guardar Cambios</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-6 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-2xl shadow-sm">
                                    <p className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap font-medium">
                                        {viewingNote.noteText}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        {!isEditingNote && (
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-[var(--border-main)]">
                                {/* Bridge to Prompt Studio — the KEY feature */}
                                <button
                                    onClick={handleSendToIAStudio}
                                    className="w-full sm:w-auto group relative px-5 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 flex items-center justify-center gap-2 overflow-hidden active:scale-95"
                                >
                                    <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                    <span className="relative z-10 flex items-center gap-2">
                                        <Sparkles size={18} />
                                        ✨ Refinar con IA en IA Studio
                                    </span>
                                </button>
                                <p className="text-[10px] text-[var(--text-muted)] text-center uppercase tracking-widest">Enviará el fragmento y la nota al modo Refinado del IA Studio</p>

                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={() => setIsEditingNote(true)}
                                        className="flex-1 px-4 py-2.5 border border-[var(--border-main)] rounded-xl font-bold text-[var(--text-main)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent-main)] transition-all flex items-center justify-center gap-2 text-sm"
                                    >
                                        <Pencil size={14} />
                                        Editar Nota
                                    </button>
                                    <button
                                        onClick={() => handleDeleteNote(viewingNote.noteId)}
                                        className="flex-1 px-4 py-2.5 border border-red-500/30 rounded-xl font-bold text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all flex items-center justify-center gap-2 text-sm"
                                    >
                                        <Trash2 size={14} />
                                        Eliminar Nota
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Chapter Info Modal (Transparent Blur) */}
            {isChapterInfoModalOpen && activeChapterHeader && (
                <div
                    className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/20 backdrop-blur-md animate-in fade-in duration-300"
                    onClick={() => setIsChapterInfoModalOpen(false)}
                >
                    <div
                        className="w-full max-w-lg bg-[var(--bg-app)]/40 backdrop-blur-2xl border border-white/20 rounded-[2.5rem] p-8 md:p-12 shadow-2xl animate-in zoom-in-95 duration-300 relative overflow-hidden group"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Decorative background elements */}
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[var(--accent-main)]/10 rounded-full blur-3xl group-hover:bg-[var(--accent-main)]/20 transition-all duration-1000"></div>
                        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-1000"></div>

                        <button
                            onClick={() => setIsChapterInfoModalOpen(false)}
                            className="absolute top-6 right-6 p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-white/10 rounded-full transition-all"
                        >
                            <X size={20} />
                        </button>

                        <div className="relative z-10 text-center">
                            {activeChapterHeader.volumeLabel && (
                                <div className="text-sm font-black uppercase tracking-[0.4em] text-[var(--accent-main)] mb-6 opacity-80">
                                    {activeChapterHeader.volumeLabel}
                                </div>
                            )}

                            <div className="w-12 h-1 bg-[var(--accent-main)] mx-auto mb-8 opacity-40 rounded-full"></div>

                            <h2 className="text-3xl md:text-5xl font-black font-serif text-[var(--text-main)] leading-tight tracking-tight mb-8">
                                {activeChapterHeader.chapterLabel}
                            </h2>

                            <div className="flex justify-center items-center gap-6 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                <div className="flex items-center gap-2">
                                    <BookOpen size={14} className="opacity-50" />
                                    <span>{activeChapter?.content?.replace(/<[^>]*>/g, '').length || 0} Caracteres</span>
                                </div>
                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--border-main)]"></div>
                                <div className="flex items-center gap-2">
                                    <Tag size={14} className="opacity-50" />
                                    <span>Estado: {activeChapter.status || 'Borrador'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 pt-8 border-t border-white/10 text-center">
                            <button
                                onClick={() => setIsChapterInfoModalOpen(false)}
                                className="px-8 py-3 bg-[var(--accent-main)] hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-[var(--accent-main)]/20 hover:scale-105 active:scale-95"
                            >
                                Continuar Escribiendo
                            </button>
                        </div>
                    </div>
                </div>
            )}




            <FinalizeModal
                isOpen={isFinalizeModalOpen}
                onClose={() => setIsFinalizeModalOpen(false)}
                onConfirm={confirmFinalize}
            />
            <PremiumNarrator 
                isOpen={isPremiumNarratorOpen} 
                onClose={() => setIsPremiumNarratorOpen(false)} 
                chapter={activeChapter}
                bookId={activeBook?.id}
            />

            {/* Mobile Actions Modal */}
            <Modal isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} title="Herramientas del Editor">
                <div className="p-8 space-y-10 bg-indigo-500/[0.01]">
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => { setIsFormattingModalOpen(true); setIsMobileMenuOpen(false); }}
                            className="p-8 rounded-[32px] bg-[var(--bg-editor)] border border-[var(--border-main)] flex flex-col items-center gap-4 active:scale-95 transition-all shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 group"
                        >
                            <div className="w-14 h-14 rounded-[20px] bg-indigo-100 text-indigo-600 flex items-center justify-center transition-transform group-hover:scale-110">
                                <Pencil size={28} />
                            </div>
                            <div className="text-center">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-main)]">Formato</span>
                                <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-widest opacity-60">Tipografía</span>
                            </div>
                        </button>

                        <button
                            onClick={() => { setIsDetectionModeModalOpen(true); setIsMobileMenuOpen(false); }}
                            className="p-8 rounded-[32px] bg-[var(--bg-editor)] border border-[var(--border-main)] flex flex-col items-center gap-4 active:scale-95 transition-all shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 group"
                        >
                            <div className="w-14 h-14 rounded-[20px] bg-emerald-100 text-emerald-600 flex items-center justify-center transition-transform group-hover:scale-110">
                                <ScanSearch size={28} />
                            </div>
                            <div className="text-center">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-main)]">IA Scan</span>
                                <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-widest opacity-60">Detección</span>
                            </div>
                        </button>

                        <button
                            onClick={() => { setIsHistoryModalOpen(true); setIsMobileMenuOpen(false); }}
                            className="p-8 rounded-[32px] bg-[var(--bg-editor)] border border-[var(--border-main)] flex flex-col items-center gap-4 active:scale-95 transition-all shadow-sm hover:shadow-xl hover:shadow-blue-500/5 group"
                        >
                            <div className="w-14 h-14 rounded-[20px] bg-blue-100 text-blue-600 flex items-center justify-center transition-transform group-hover:scale-110">
                                <History size={28} />
                            </div>
                            <div className="text-center">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-main)]">Versiones</span>
                                <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-widest opacity-60">Control</span>
                            </div>
                        </button>

                        <button
                            onClick={() => { setIsReadingSettingsModalOpen(true); setIsMobileMenuOpen(false); }}
                            className="p-8 rounded-[32px] bg-[var(--bg-editor)] border border-[var(--border-main)] flex flex-col items-center gap-4 active:scale-95 transition-all shadow-sm hover:shadow-xl hover:shadow-orange-500/5 group"
                        >
                            <div className="w-14 h-14 rounded-[20px] bg-orange-100 text-orange-600 flex items-center justify-center transition-transform group-hover:scale-110">
                                <Sliders size={28} />
                            </div>
                            <div className="text-center">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-main)]">Lectura</span>
                                <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-widest opacity-60">Ajustes</span>
                            </div>
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-blue-600/5 rounded-[32px] p-8 border border-blue-500/10 shadow-inner">
                            <label className="block text-[9px] font-black uppercase text-blue-600 tracking-[0.3em] mb-6 text-center">Configuración de Portapapeles</label>
                            <div className="flex gap-3 justify-center mb-6">
                                {[
                                    { id: 'title', label: 'Título' },
                                    { id: 'text', label: 'Contenido' },
                                    { id: 'all', label: 'Completo' }
                                ].map(mode => (
                                    <button
                                        key={mode.id}
                                        onClick={() => setCopyMode(mode.id)}
                                        className={`px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                                            copyMode === mode.id 
                                            ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20 scale-105' 
                                            : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)] hover:border-blue-500/30'
                                        }`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => { handleCopyToClipboard(); setIsMobileMenuOpen(false); }}
                                className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-xl shadow-blue-600/30 active:scale-95 transition-all"
                            >
                                <Copy size={18} />
                                <span>Copiar Selección</span>
                            </button>
                        </div>

                        <div className="bg-indigo-600/5 rounded-[32px] p-8 border border-indigo-500/10 shadow-inner">
                            <label className="block text-[9px] font-black uppercase text-indigo-600 tracking-[0.3em] mb-6 text-center">Estado del Manuscrito</label>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {['Idea', 'Borrador', 'Revisión', 'Completado', 'Finalizado'].map(status => (
                                    <button
                                        key={status}
                                        onClick={() => { handleStatusChange(status); setIsMobileMenuOpen(false); }}
                                        className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                                            activeChapter?.status === status 
                                            ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 scale-110' 
                                            : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-main)] hover:border-indigo-500/30'
                                        }`}
                                    >
                                        {status}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="w-full py-4 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.4em] opacity-40 hover:opacity-100 transition-opacity"
                    >
                        Cerrar Herramientas
                    </button>
                </div>
            </Modal>

            <NarratorSelector 
                isOpen={isNarratorSelectorOpen}
                onClose={() => setIsNarratorSelectorOpen(false)}
                chapter={activeChapter}
                bookId={activeBook?.id}
                onOpenGenerator={() => {
                    setIsNarratorSelectorOpen(false);
                    setIsPremiumNarratorOpen(true);
                }}
                onOpenPlayer={() => {
                    setIsNarratorSelectorOpen(false);
                    setIsPremiumPlayerOpen(true);
                }}
            />
            <PremiumPlayer 
                isOpen={isPremiumPlayerOpen}
                onClose={() => {
                    setIsPremiumPlayerOpen(false);
                    setPlayingChunk(null);
                }}
                chapter={activeChapter}
                bookId={activeBook?.id}
                onChunkChange={(chunk) => {
                    setPlayingChunk(chunk);
                }}
            />
        </div>
    );
};

export default Editor;
