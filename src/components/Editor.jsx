import { useEditor, EditorContent } from '@tiptap/react'
import { Copy, ClipboardPaste, Maximize2, ScanSearch, ChevronLeft, ChevronRight, Info, X, Tag, History, BookOpen, Settings, Wind, Keyboard, MessageSquarePlus, Sparkles, Trash2, Pencil, Volume2, Pause, Play, Square } from 'lucide-react'
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
        finalizeChapterCleanup
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

    // Text-to-Speech state
    const [isTTSActive, setIsTTSActive] = useState(false);
    const [isTTSPaused, setIsTTSPaused] = useState(false);
    const [ttsSpeed, setTTSSpeed] = useState(1);
    const [ttsCurrentParagraph, setTTSCurrentParagraph] = useState(-1);
    const ttsUtteranceRef = useRef(null);
    const ttsParagraphsRef = useRef([]);

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
                    console.log(`[Safety] Creating major backup before clipboard replacement.`);
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

    const handleSendToPromptStudio = () => {
        if (!viewingNote || !activeChapter) return;
        const instructions = `FRAGMENTO DEL TEXTO A REFINAR:\n"${viewingNote.highlightedText}"\n\nNOTA DEL AUTOR:\n${viewingNote.noteText}`;
        setPromptStudioPreload({
            tab: 'refine',
            chapterId: activeChapter.id,
            instructions
        });
        setActiveView('promptStudio');
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
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            saveChapterContentRef.current(html);

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
            // Update editor ONLY if content is different. 
            // This now triggers on token change (external sync)
            if (currentHtml !== activeChapter.content) {
                editor.commands.setContent(activeChapter.content || '', false);
            }
        }
    }, [activeChapter?.id, activeChapter?.lastSyncToken, editor]); 

    // Handle Read-Only state for Focus Mode
    useEffect(() => {
        if (editor) {
            editor.setEditable(!isFocusMode);
        }
    }, [isFocusMode, editor]);

    // ===== Text-to-Speech Handlers =====
    const handleStopTTS = useCallback(() => {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        // Remove all highlights
        if (ttsParagraphsRef.current) {
            ttsParagraphsRef.current.forEach(p => p.element.classList.remove('tts-reading-highlight'));
        }
        ttsParagraphsRef.current = [];
        setIsTTSActive(false);
        setIsTTSPaused(false);
        setTTSCurrentParagraph(-1);
    }, []);

    const readParagraph = useCallback((index) => {
        const paragraphs = ttsParagraphsRef.current;
        if (index >= paragraphs.length) {
            handleStopTTS();
            return;
        }

        // Remove previous highlights
        paragraphs.forEach(p => p.element.classList.remove('tts-reading-highlight'));

        // Highlight current paragraph
        setTTSCurrentParagraph(index);
        paragraphs[index].element.classList.add('tts-reading-highlight');
        paragraphs[index].element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const utterance = new SpeechSynthesisUtterance(paragraphs[index].text);
        utterance.lang = 'es-MX';
        utterance.rate = ttsSpeed;
        utterance.onend = () => {
            readParagraph(index + 1);
        };
        utterance.onerror = () => {
            handleStopTTS();
        };
        ttsUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    }, [ttsSpeed, handleStopTTS]); // Added handleStopTTS to dependencies

    const handleStartTTS = useCallback(() => {
        if (!editor || !window.speechSynthesis) {
            toast.warning('Tu navegador no soporta Text-to-Speech.');
            return;
        }
        window.speechSynthesis.cancel();

        // Extract paragraphs from editor DOM
        if (!editor || !editor.view?.dom) return;
        const editorDom = editor.view.dom;
        const blocks = editorDom.querySelectorAll('p, h1, h2, h3');
        const paragraphs = Array.from(blocks)
            .map(el => ({ text: el.textContent.trim(), element: el }))
            .filter(p => p.text.length > 0);

        if (paragraphs.length === 0) {
            toast.info('No hay texto para leer.');
            return;
        }

        ttsParagraphsRef.current = paragraphs;
        setIsTTSActive(true);
        setIsTTSPaused(false);
        readParagraph(0);
    }, [editor, readParagraph]); // Added readParagraph to dependencies

    const handlePauseTTS = () => {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            setIsTTSPaused(true);
        }
    };

    const handleResumeTTS = () => {
        if (window.speechSynthesis) {
            window.speechSynthesis.resume();
            setIsTTSPaused(false);
        }
    };

    // Cleanup TTS on unmount or chapter change
    useEffect(() => {
        return () => {
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        };
    }, [activeChapter?.id]);

    // Removal of old click handler useEffect as it's now handled by editorProps.handleClick

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
            {/* Editor Toolbar */}
            {true && (
                <>
                    <div className="border-b border-[var(--border-main)] bg-[var(--bg-app)] shrink-0">
                        {/* Row 1: Main Controls */}
                        {!isFocusMode ? (
                            <div className="flex items-center p-1.5 px-2 sm:p-2 sm:px-3 md:px-6 gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide">
                                {/* Left: Formatting */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                        onClick={() => {
                                            if (!editor || !characters) return;
                                            const sortedCharacters = characters
                                                .filter(c => !c.isCategory && c.name && c.name.trim() !== '');
                                            if (sortedCharacters.length === 0) {
                                                toast.info("No hay personajes creados para detectar.");
                                                return;
                                            }
                                            setIsDetectionModeModalOpen(true);
                                        }}
                                        className="p-1.5 sm:p-2 rounded-lg transition-all duration-200 text-[var(--accent-main)] bg-[var(--accent-soft)] hover:bg-[var(--accent-main)] hover:text-white shadow-sm flex items-center gap-1"
                                        title="Analizar texto y detectar personajes"
                                    >
                                        <ScanSearch size={16} />
                                    </button>

                                    <div className="w-px h-5 bg-[var(--border-main)] mx-1 shrink-0"></div>

                                    <button
                                        onClick={() => editor?.chain().focus().toggleBold().run()}
                                        className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 ${editor?.isActive('bold') ? 'bg-[var(--accent-main)] text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]'}`}
                                        title="Negrita"
                                    >
                                        <span className="font-bold text-sm">B</span>
                                    </button>
                                    <button
                                        onClick={() => editor?.chain().focus().toggleItalic().run()}
                                        className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 ${editor?.isActive('italic') ? 'bg-[var(--accent-main)] text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]'}`}
                                        title="Cursiva"
                                    >
                                        <span className="italic font-serif text-sm">I</span>
                                    </button>

                                    <div className="w-px h-5 bg-[var(--border-main)] mx-0.5 shrink-0"></div>

                                    {[1, 2, 3].map(level => (
                                        <button
                                            key={level}
                                            onClick={() => editor?.chain().focus().toggleHeading({ level }).run()}
                                            className={`p-1.5 px-2 rounded-lg transition-all duration-200 text-xs font-black ${editor?.isActive('heading', { level }) ? 'bg-[var(--accent-main)] text-white shadow-md' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]'}`}
                                            title={`Título ${level}`}
                                        >
                                            H{level}
                                        </button>
                                    ))}
                                </div>

                                {/* Center: Note + Copy operations */}
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={handleAddNote}
                                        className="hidden md:flex p-1.5 sm:p-2 rounded-lg transition-all duration-200 text-amber-600 bg-amber-500/10 hover:bg-amber-500 hover:text-white shadow-sm items-center gap-1 border border-amber-500/20"
                                        title="Añadir nota al texto seleccionado"
                                    >
                                        <MessageSquarePlus size={16} />
                                        <span className="hidden md:inline text-xs font-bold font-sans">Nota</span>
                                    </button>

                                    <div className="w-px h-5 bg-[var(--border-main)] mx-0.5 shrink-0"></div>
                                    <div className="flex items-center bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-lg overflow-hidden shrink-0 shadow-sm">
                                        <select
                                            value={copyMode}
                                            onChange={(e) => setCopyMode(e.target.value)}
                                            className="bg-transparent text-[10px] font-bold text-[var(--text-muted)] focus:outline-none cursor-pointer border-r border-[var(--border-main)] px-1.5 py-1 uppercase tracking-wider h-full"
                                        >
                                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="text">Texto</option>
                                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="title">Título</option>
                                            <option className="bg-[var(--bg-editor)] text-[var(--text-main)]" value="all">Todo</option>
                                        </select>
                                        <button
                                            onClick={handleCopyToClipboard}
                                            className={`px-2 py-1.5 transition-all duration-200 text-xs font-bold flex items-center gap-1 ${copied ? 'bg-green-500 text-white' : 'text-[var(--text-muted)] bg-[var(--bg-app)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-main)]'}`}
                                            title="Copiar selección al portapapeles"
                                        >
                                            <Copy size={14} />
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleReplaceFromClipboard}
                                        className="p-1.5 rounded-lg transition-all duration-200 text-xs font-bold flex items-center gap-1 text-[var(--accent-main)] bg-[var(--accent-soft)] hover:bg-[var(--accent-main)] hover:text-white shadow-sm border border-[var(--border-main)]"
                                        title="Reemplazar todo el contenido con texto del portapapeles"
                                    >
                                        <ClipboardPaste size={15} />
                                    </button>
                                </div>

                                <div className="flex-1"></div>

                                {/* Right: History (all screens) + Status (desktop only) + Focus toggle */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {activeChapter && (
                                        <button
                                            onClick={() => setIsHistoryModalOpen(true)}
                                            className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-full transition-all duration-200 text-[var(--accent-main)] bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-main)] hover:text-white shadow-sm flex items-center gap-1.5 border border-[var(--border-main)]"
                                            title="Historial y Backups"
                                        >
                                            <History size={14} />
                                            <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest">Historial</span>
                                        </button>
                                    )}
                                    {activeChapter && (
                                        <div className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-[var(--border-main)] bg-[var(--bg-editor)] cursor-pointer">
                                            <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${activeChapter.status === 'Finalizado' ? 'bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.6)]' :
                                                activeChapter.status === 'Completado' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]' :
                                                    activeChapter.status === 'Revisión' ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]' :
                                                        activeChapter.status === 'Borrador' ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]' :
                                                            'bg-gray-400/50'
                                                 }`}></div>
                                            <select
                                                className="bg-transparent text-[var(--text-main)] text-[11px] font-bold focus:outline-none cursor-pointer appearance-none pr-4 uppercase tracking-wider"
                                                value={activeChapter.status || 'Idea'}
                                                onChange={(e) => handleStatusChange(e.target.value)}
                                            >
                                                <option value="Idea">Idea</option>
                                                <option value="Borrador">Borrador</option>
                                                <option value="Revisión">Revisión</option>
                                                <option value="Completado">Completado</option>
                                                <option value="Finalizado">Finalizado</option>
                                            </select>
                                        </div>
                                    )}

                                    <button
                                        onClick={isTTSActive ? handleStopTTS : handleStartTTS}
                                        className={`hidden md:flex items-center justify-center p-2 rounded-lg border transition-all shrink-0 shadow-sm mr-1 ${isTTSActive ? 'bg-green-500 text-white border-green-500 hover:bg-red-500 hover:border-red-500' : 'bg-transparent text-[var(--accent-main)] border-transparent hover:bg-[var(--accent-soft)] hover:border-[var(--accent-main)]'}`}
                                        title={isTTSActive ? 'Detener Lectura en Voz Alta' : 'Leer Capítulo en Voz Alta'}
                                    >
                                        <Volume2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => setIsChapterInfoModalOpen(true)}
                                        className="hidden md:flex items-center justify-center p-2 rounded-lg border transition-all shrink-0 bg-[var(--accent-soft)]/50 text-[var(--accent-main)] border-[var(--border-main)] hover:bg-[var(--accent-main)] hover:text-white shadow-sm"
                                        title="Información del Capítulo"
                                    >
                                        <Info size={16} />
                                    </button>
                                    <button
                                        onClick={() => setIsFocusMode(true)}
                                        className="hidden md:flex items-center justify-center p-2 rounded-lg border transition-all shrink-0 bg-[var(--accent-soft)]/50 text-[var(--accent-main)] border-[var(--border-main)] hover:bg-[var(--accent-main)] hover:text-white shadow-sm"
                                        title="Modo Lectura"
                                    >
                                        <BookOpen size={16} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-2 px-3 md:px-6 w-full animate-in fade-in duration-300">
                                <div className="flex items-center gap-1 sm:gap-2">
                                    <button
                                        onClick={() => setIsChapterInfoModalOpen(true)}
                                        className="flex items-center justify-center p-2 rounded-lg border transition-all shrink-0 bg-[var(--bg-editor)] text-[var(--accent-main)] border-[var(--border-main)] hover:bg-[var(--accent-main)] hover:text-white hover:border-[var(--accent-main)] shadow-sm"
                                        title="Información del Capítulo"
                                    >
                                        <Info size={12} />
                                    </button>
                                    <button
                                        onClick={() => setIsReadingSettingsModalOpen(true)}
                                        className="flex items-center justify-center p-2 rounded-lg border transition-all shrink-0 bg-[var(--bg-editor)] text-[var(--text-muted)] border-[var(--border-main)] hover:bg-[var(--accent-main)] hover:text-white hover:border-[var(--accent-main)] shadow-sm"
                                        title="Configuración de Lectura"
                                    >
                                        <Settings size={16} />
                                    </button>

                                </div>

                                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                    {prevChapter && (
                                        <button
                                            onClick={() => selectChapter(prevChapter)}
                                            className="px-2 py-1.5 sm:px-4 sm:py-2 text-[var(--accent-main)] bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-main)] hover:text-white rounded-lg transition-all duration-200 shadow-sm flex items-center gap-1 border border-[var(--border-main)]"
                                            title="Capítulo Anterior"
                                        >
                                            <ChevronLeft size={16} />
                                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">Anterior</span>
                                        </button>
                                    )}
                                    {nextChapter && (
                                        <button
                                            onClick={() => selectChapter(nextChapter)}
                                            className="px-2 py-1.5 sm:px-4 sm:py-2 text-[var(--accent-main)] bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-main)] hover:text-white rounded-lg transition-all duration-200 shadow-sm flex items-center gap-1 border border-[var(--border-main)]"
                                            title="Siguiente Capítulo"
                                        >
                                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">Siguiente</span>
                                            <ChevronRight size={16} />
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 sm:gap-2">
                                    <button
                                        onClick={() => setIsFocusMode(false)}
                                        className="flex items-center gap-1.5 p-1.5 px-3 sm:px-4 sm:py-2 rounded-lg border transition-all shrink-0 bg-[var(--bg-editor)] text-red-500 border-red-500/30 hover:bg-red-500 hover:text-white hover:border-red-500 shadow-sm"
                                        title="Salir del Modo Lectura"
                                    >
                                        <X size={16} />
                                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">Salir</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Row 2 (Mobile only): Status + Focus */}
                    {!isFocusMode && (
                        <div className="flex md:hidden items-center justify-center gap-2 p-1.5 px-3 border-t border-[var(--border-main)] bg-[var(--bg-editor)]/50">
                            {activeChapter && (
                                <>
                                    <button
                                        onClick={() => setIsChapterInfoModalOpen(true)}
                                        className="p-1.5 rounded-full border border-[var(--border-main)] bg-[var(--bg-editor)] text-[var(--accent-main)] hover:bg-[var(--accent-soft)] transition-all shadow-sm"
                                        title="Información del Capítulo"
                                    >
                                        <Info size={16} />
                                    </button>
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border-main)] bg-[var(--bg-editor)] cursor-pointer">
                                        <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${activeChapter.status === 'Finalizado' ? 'bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.6)]' :
                                            activeChapter.status === 'Completado' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]' :
                                                activeChapter.status === 'Revisión' ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]' :
                                                    activeChapter.status === 'Borrador' ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]' :
                                                        'bg-gray-400/50'
                                            }`}></div>
                                        <select
                                            className="bg-transparent text-[10px] font-bold text-[var(--text-main)] focus:outline-none cursor-pointer appearance-none pr-3 uppercase tracking-wider"
                                            value={activeChapter.status || 'Idea'}
                                            onChange={(e) => handleStatusChange(e.target.value)}
                                        >
                                            <option value="Idea">Idea</option>
                                            <option value="Borrador">Borrador</option>
                                            <option value="Revisión">Revisión</option>
                                            <option value="Completado">Completado</option>
                                            <option value="Finalizado">Finalizado</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            <button
                                onClick={handleAddNote}
                                className="flex items-center justify-center p-2 rounded-lg border transition-all shrink-0 bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500 hover:text-white shadow-sm mr-1"
                                title="Añadir nota al texto seleccionado"
                            >
                                <MessageSquarePlus size={14} />
                            </button>
                            <button
                                onClick={() => setIsFocusMode(true)}
                                className="flex items-center justify-center p-2 rounded-lg border transition-all shrink-0 bg-[var(--accent-soft)]/50 text-[var(--accent-main)] border-[var(--border-main)] hover:bg-[var(--accent-main)] hover:text-white shadow-sm"
                            >
                                <BookOpen size={14} />
                            </button>
                        </div>
                    )}
                </>
            )}
            {/* End of Editor Toolbar conditional wrapper */}



            {/* TTS Floating Control Bar */}
            {isTTSActive && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-5 py-3 rounded-2xl bg-[var(--bg-app)]/95 backdrop-blur-xl border border-green-500/30 shadow-2xl shadow-green-500/10 animate-in slide-in-from-bottom-4 fade-in duration-300">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-green-500">Leyendo</span>
                    </div>

                    <div className="w-px h-6 bg-[var(--border-main)]"></div>

                    {/* Play/Pause */}
                    <button
                        onClick={isTTSPaused ? handleResumeTTS : handlePauseTTS}
                        className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white transition-all border border-green-500/20"
                        title={isTTSPaused ? 'Reanudar' : 'Pausar'}
                    >
                        {isTTSPaused ? <Play size={16} /> : <Pause size={16} />}
                    </button>

                    {/* Stop */}
                    <button
                        onClick={handleStopTTS}
                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-all border border-red-500/20"
                        title="Detener"
                    >
                        <Square size={14} />
                    </button>

                    <div className="w-px h-6 bg-[var(--border-main)]"></div>

                    {/* Speed */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Vel:</span>
                        <select
                            value={ttsSpeed}
                            onChange={(e) => setTTSSpeed(parseFloat(e.target.value))}
                            className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-main)] focus:outline-none cursor-pointer"
                        >
                            <option value={0.5}>0.5x</option>
                            <option value={0.75}>0.75x</option>
                            <option value={1}>1x</option>
                            <option value={1.25}>1.25x</option>
                            <option value={1.5}>1.5x</option>
                            <option value={2}>2x</option>
                        </select>
                    </div>

                    {/* Paragraph counter */}
                    <span className="text-[10px] font-bold text-[var(--text-muted)] tabular-nums">
                        {ttsCurrentParagraph + 1}/{ttsParagraphsRef.current.length}
                    </span>
                </div>
            )}

            {/* Editor Content Area */}
            <div className={`flex-1 overflow-y-auto px-4 pt-8 pb-8 md:px-20 md:pt-24 md:pb-8 scrollbar-hide transition-all duration-300 ${isFocusMode ? 'editor-focus-mode ' + readingFont : 'font-[Arial,sans-serif]'}`}>
                <div className={`min-h-full transition-all duration-500 mx-auto ${isFocusMode && readingWidth === 'full' ? 'w-full px-2' :
                    isFocusMode && readingWidth === 'xl' ? 'max-w-7xl' :
                        isFocusMode && readingWidth === 'lg' ? 'max-w-5xl' :
                            isFocusMode && readingWidth === 'sm' ? 'max-w-xl' :
                                'max-w-3xl'
                    }`}>
                    {editor && <EditorContent editor={editor} className="min-h-full cursor-text" onClick={() => editor.commands.focus()} />}
                </div>
            </div>

            {/* Modal de confirmación de detección de personajes */}
            <Modal isOpen={isDetectionModalOpen} onClose={() => { setIsDetectionModalOpen(false); setHighlightedCharId(null); }} title="Personajes Detectados">
                <div className="space-y-6">
                    <div>
                        <p className="text-sm text-[var(--text-muted)] mb-3">Haz clic en un personaje para resaltar sus menciones en la vista previa:</p>
                        <div className="flex flex-wrap gap-2">
                            {detectedCharacters.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => setHighlightedCharId(highlightedCharId === char.id ? null : char.id)}
                                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer border ${highlightedCharId === char.id
                                        ? 'bg-[var(--accent-main)] text-white border-[var(--accent-main)] shadow-md scale-105'
                                        : 'bg-[var(--bg-editor)] border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)]'
                                        }`}
                                >
                                    {char.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Vista Previa:</p>
                        <div
                            className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl p-4 max-h-40 overflow-y-auto text-sm prose prose-sm"
                            dangerouslySetInnerHTML={{
                                __html: (() => {
                                    let html = newPreviewHtml;
                                    if (highlightedCharId) {
                                        // Highlight the selected character's mentions with a bright background
                                        const regex = new RegExp(`<span data-char-id="${highlightedCharId}">(.*?)</span>`, 'gi');
                                        html = html.replace(regex, '<mark style="background:linear-gradient(135deg,#6366f1 0%,#a855f7 100%);color:white;padding:1px 4px;border-radius:4px;font-weight:700;">$1</mark>');
                                        // Other character mentions stay styled normally
                                        html = html.replace(/<span data-char-id/g, '<span style="color:var(--accent-main);font-weight:600;border-bottom:1px dashed var(--accent-main);" data-char-id');
                                    } else {
                                        html = html.replace(/<span data-char-id/g, '<span style="color:var(--accent-main);font-weight:600;border-bottom:1px dashed var(--accent-main);" data-char-id');
                                    }
                                    return html;
                                })()
                            }}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={() => { setIsDetectionModalOpen(false); setHighlightedCharId(null); }}
                            className="px-5 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
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
                            className="px-5 py-2.5 bg-[var(--accent-main)] hover:bg-indigo-600 text-white rounded-xl font-bold transition-colors shadow-md"
                        >
                            Aplicar y Guardar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal de selección de modo de detección */}
            <Modal isOpen={isDetectionModeModalOpen} onClose={() => setIsDetectionModeModalOpen(false)} title="Modo de Detección">
                <div className="space-y-4">
                    <p className="text-sm text-[var(--text-muted)]">¿Cómo deseas buscar a los personajes en el texto?</p>
                    <div className="grid grid-cols-1 gap-3">
                        <button
                            onClick={() => {
                                setIsDetectionModeModalOpen(false);
                                runDetection('full');
                            }}
                            className="p-4 rounded-xl border border-[var(--border-main)] bg-[var(--bg-editor)] hover:border-[var(--accent-main)] hover:bg-[var(--accent-soft)] transition-all text-left group"
                        >
                            <div className="font-bold text-[var(--text-main)] mb-1 group-hover:text-[var(--accent-main)] transition-colors">Solo nombres completos</div>
                            <p className="text-xs text-[var(--text-muted)]">Busca coincidencias exactas. Ej: "Claire Wilson" solo detecta "Claire Wilson".</p>
                        </button>
                        <button
                            onClick={() => {
                                setIsDetectionModeModalOpen(false);
                                runDetection('simple');
                            }}
                            className="p-4 rounded-xl border border-[var(--accent-main)]/30 bg-[var(--accent-soft)]/50 hover:border-[var(--accent-main)] hover:bg-[var(--accent-soft)] transition-all text-left group"
                        >
                            <div className="font-bold text-[var(--accent-main)] mb-1">Completos + Simples <span className="text-[10px] bg-[var(--accent-main)] text-white rounded-full px-2 py-0.5 ml-1">Recomendado</span></div>
                            <p className="text-xs text-[var(--text-muted)]">Busca el nombre completo y también el primer nombre por separado. Ej: "Claire Wilson" detecta "Claire Wilson" y también "Claire" sola.</p>
                        </button>
                    </div>
                    <div className="flex justify-end pt-2">
                        <button
                            onClick={() => setIsDetectionModeModalOpen(false)}
                            className="px-5 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
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

            {/* Settings Reading Modal */}
            <Modal isOpen={isReadingSettingsModalOpen} onClose={() => setIsReadingSettingsModalOpen(false)} title="Configuración de Lectura">
                <div className="space-y-6">
                    <div>
                        <label className="block text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-2">Tipografía</label>
                        <select
                            value={readingFont}
                            onChange={(e) => setReadingFont(e.target.value)}
                            className="w-full bg-[var(--bg-editor)] text-sm font-bold text-[var(--text-main)] focus:outline-none cursor-pointer border border-[var(--border-main)] rounded-lg px-3 py-2"
                        >
                            <option value="font-serif">Serif (Ideal para impresión)</option>
                            <option value="font-sans">Sans (Moderna)</option>
                            <option value="font-[Arial,sans-serif]">Arial</option>
                            <option value="font-['Roboto',sans-serif]">Roboto</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-2">Tamaño de Texto</label>
                        <select
                            value={readingTextSize}
                            onChange={(e) => setReadingTextSize(e.target.value)}
                            className="w-full bg-[var(--bg-editor)] text-sm font-bold text-[var(--text-main)] focus:outline-none cursor-pointer border border-[var(--border-main)] rounded-lg px-3 py-2"
                        >
                            <option value="sm">Chica</option>
                            <option value="base">Normal</option>
                            <option value="lg">Grande</option>
                            <option value="xl">Gigante</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-2">Ancho de Lectura</label>
                        <select
                            value={readingWidth}
                            onChange={(e) => setReadingWidth(e.target.value)}
                            className="w-full bg-[var(--bg-editor)] text-sm font-bold text-[var(--text-main)] focus:outline-none cursor-pointer border border-[var(--border-main)] rounded-lg px-3 py-2"
                        >
                            <option value="sm">Angosto</option>
                            <option value="md">Ideal</option>
                            <option value="lg">Ancho</option>
                            <option value="xl">Súper Ancho</option>
                            <option value="full">Pantalla Completa</option>
                        </select>
                    </div>
                </div>
                <div className="mt-8 flex justify-end">
                    <button
                        onClick={() => setIsReadingSettingsModalOpen(false)}
                        className="px-6 py-2.5 bg-[var(--accent-main)] hover:bg-[#4f46e5] text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 text-sm w-full sm:w-auto"
                    >
                        Cerrar
                    </button>
                </div>
            </Modal>

            {/* Note Creation Modal */}
            <Modal isOpen={isNoteModalOpen} onClose={() => { setIsNoteModalOpen(false); setNoteText(''); setNoteSelectionRange(null); }} title="📝 Añadir Nota al Texto">
                <div className="space-y-4">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                        <p className="text-xs font-bold uppercase text-amber-600 tracking-wider mb-1">Texto seleccionado:</p>
                        <p className="text-sm text-[var(--text-main)] italic font-serif leading-relaxed">
                            "{editor && noteSelectionRange ? editor.state.doc.textBetween(noteSelectionRange.from, noteSelectionRange.to, ' ') : ''}"
                        </p>
                    </div>
                    <div>
                        <label className="block text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-2">Tu nota / comentario:</label>
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Escribe tu anotación aquí... (ej: 'Revisar tono', 'Ampliar diálogo', 'Cambiar escenario')"
                            className="w-full h-32 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-[var(--text-main)] resize-none transition-all font-[Arial,sans-serif]"
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={() => { setIsNoteModalOpen(false); setNoteText(''); setNoteSelectionRange(null); }}
                            className="px-5 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSaveNote}
                            disabled={!noteText.trim()}
                            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <MessageSquarePlus size={16} />
                            Guardar Nota
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Note Viewer Modal */}
            <Modal isOpen={isViewNoteModalOpen} onClose={() => { setIsViewNoteModalOpen(false); setViewingNote(null); setIsEditingNote(false); }} title="📌 Nota del Autor">
                {viewingNote && (
                    <div className="space-y-4">
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                            <p className="text-xs font-bold uppercase text-amber-600 tracking-wider mb-1">Fragmento resaltado:</p>
                            <p className="text-sm text-[var(--text-main)] italic font-serif leading-relaxed">
                                "{viewingNote.highlightedText}"
                            </p>
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase text-[var(--text-muted)] tracking-wider mb-2">Comentario:</p>
                            {isEditingNote ? (
                                <div className="space-y-3">
                                    <textarea
                                        value={editNoteText}
                                        onChange={(e) => setEditNoteText(e.target.value)}
                                        className="w-full h-28 bg-[var(--bg-editor)] border border-amber-500/50 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-[var(--text-main)] resize-none transition-all font-[Arial,sans-serif]"
                                        autoFocus
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => { setIsEditingNote(false); setEditNoteText(viewingNote.noteText); }} className="px-4 py-2 rounded-lg text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-editor)] transition-colors">
                                            Cancelar
                                        </button>
                                        <button onClick={handleUpdateNote} disabled={!editNoteText.trim()} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-40">
                                            Guardar Cambios
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl p-4 text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap font-[Arial,sans-serif]">
                                    {viewingNote.noteText}
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        {!isEditingNote && (
                            <div className="flex flex-col gap-3 pt-2">
                                {/* Bridge to Prompt Studio — the KEY feature */}
                                <button
                                    onClick={handleSendToPromptStudio}
                                    className="w-full group relative px-5 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 flex items-center justify-center gap-2 overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                    <span className="relative z-10 flex items-center gap-2">
                                        <Sparkles size={18} />
                                        ✨ Refinar con IA en Prompt Studio
                                    </span>
                                </button>
                                <p className="text-[10px] text-[var(--text-muted)] text-center uppercase tracking-widest">Enviará el fragmento y la nota al modo Refinado del Prompt Studio</p>

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
        </div >
    )
}

export default Editor
