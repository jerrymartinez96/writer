import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Copy, ClipboardPaste, Maximize2, ScanSearch, ChevronLeft, ChevronRight, Info, X, Tag, History, BookOpen, Settings, Wind, Keyboard, MessageSquarePlus, Sparkles, Trash2, Pencil, Volume2, Pause, Play, Square, Lock, Unlock, Check, Languages, Plus, FileAudio, MoreHorizontal, Sliders, ChevronDown, Users, Folder, Layers, AlignLeft, Bookmark } from 'lucide-react'
import confetti from 'canvas-confetti'
import { uploadImageToCloudinary } from '../services/cloudinary'
import { mergeAttributes } from '@tiptap/react'
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

// Isolated Extensions & Modals Imports
import { CharacterMention, InlineNote, GhostMention } from './editor/extensions/customMarks'
import CharacterCardModal from './editor/components/CharacterCardModal'
import InlineNoteModal from './editor/components/InlineNoteModal'
import DetectionModal from './editor/components/DetectionModal'
import ReadingSettingsModal from './editor/components/ReadingSettingsModal'
import ChapterInfoModal from './editor/components/ChapterInfoModal'

const Editor = () => {
    const {
        chapters, activeChapter, saveChapterContent, characters, updateChapter, saveReadingBookmark,
        activeView, selectChapter, setActiveView,
        finalizeChapterCleanup, chapterLock, claimLock, releaseLock, saveChapterSnapshot,
        activeBook, profile,
        worldItems, updateCharacter, createCharacter, deleteCharacter,
        updateWorldItem, createWorldItem, deleteWorldItem,
        activeWorldDoc, saveWorldDocContent,
        setSharedEditor
    } = useData();
    const isWorldDocMode = !!activeWorldDoc && !activeChapter;
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
    
    // Selection & Metrics
    const [selectionMetrics, setSelectionMetrics] = useState({ words: 0, chars: 0, show: false });
    const [totalWordCount, setTotalWordCount] = useState(0);

    // Refs to avoid stale closures in editor callbacks
    const charactersRef = useRef(characters);
    const activeChapterRef = useRef(activeChapter);
    const saveChapterContentRef = useRef(saveChapterContent);
    const editorScrollRef = useRef(null);
    const bookmarkRestoredRef = useRef(null);

    useEffect(() => {
        bookmarkRestoredRef.current = null;
    }, [activeChapter?.id]);


    useEffect(() => {
        charactersRef.current = characters;
    }, [characters]);

    useEffect(() => {
        activeChapterRef.current = activeChapter;
    }, [activeChapter]);

    useEffect(() => {
        saveChapterContentRef.current = saveChapterContent;
    }, [saveChapterContent]);

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

    const handleChapterNavigation = useCallback((chapter) => {
        selectChapter(chapter);
        if (editorScrollRef.current) {
            editorScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [selectChapter]);

    const activeDocInfo = useMemo(() => {
        const activeDoc = activeChapter || activeWorldDoc;
        if (!activeDoc) return null;

        const isChapter = !!activeChapter;
        let volumeLabel = '';
        let chapterLabel = activeDoc.title;
        let docType = isChapter ? 'Capítulo' : 'Documento';

        if (isChapter && chapters) {
            const parentVolume = chapters.find(c => c.id === activeChapter.parentId && c.isVolume);
            const volumes = chapters.filter(c => c.isVolume).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

            if (parentVolume) {
                const volIndex = volumes.findIndex(v => v.id === parentVolume.id);
                volumeLabel = `Volumen ${volIndex + 1}: ${parentVolume.title}`;

                const chaptersInVol = chapters.filter(c => c.parentId === parentVolume.id).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                const chapIndex = chaptersInVol.findIndex(c => c.id === activeChapter.id);
                chapterLabel = `Capítulo ${chapIndex + 1}: ${activeChapter.title}`;
            } else {
                const standaloneChapters = chapters.filter(c => !c.parentId && !c.isVolume).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                const chapIndex = standaloneChapters.findIndex(c => c.id === activeChapter.id);
                chapterLabel = `Capítulo ${chapIndex + 1}: ${activeChapter.title}`;
            }
        } else if (!isChapter) {
            if (activeWorldDoc.id === 'system_personajes') {
                volumeLabel = 'Master Doc / Secciones';
                chapterLabel = 'Personajes';
                docType = 'Ficha del Sistema';
            } else if (activeWorldDoc.id === 'system_estructura') {
                volumeLabel = 'Master Doc / Secciones';
                chapterLabel = 'Estructura';
                docType = 'Ficha del Sistema';
            } else if (activeWorldDoc.id === 'system_core') {
                volumeLabel = 'Master Doc / Secciones';
                chapterLabel = 'Info General';
                docType = 'Ficha del Sistema';
            } else {
                volumeLabel = 'Master Doc / Ficha';
                chapterLabel = activeWorldDoc.title || 'Detalles';
                docType = activeWorldDoc.type === 'character' ? 'Personaje' : 'Documento';
            }
        }

        const plainText = activeDoc.content?.replace(/<[^>]*>/g, '') || '';
        const charCount = plainText.length;
        const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).filter(Boolean).length : 0;

        return {
            volumeLabel,
            chapterLabel,
            docType,
            charCount,
            wordCount,
            status: isChapter ? (activeChapter.status || 'Borrador') : 'Master Doc',
            isChapter
        };
    }, [activeChapter, activeWorldDoc, chapters]);

    const handleConvertGhostMention = (charId, text, pos) => {
        if (!editor) return;
        const char = charactersRef.current.find(c => c.id === charId);
        if (!char) return;

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

        const searchTerms = [];
        baseCharacters.forEach(char => {
            searchTerms.push({ name: char.name, id: char.id });
            if (mode === 'simple') {
                const parts = char.name.trim().split(/\s+/);
                if (parts.length > 1 && parts[0].length >= 3) {
                    searchTerms.push({ name: parts[0], id: char.id });
                }
            }
        });

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

    const suggestionConfig = useMemo(() => createSuggestion(characters || []), [characters]);

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
            await updateChapter(activeChapter.id, { status: 'Finalizado' });
            if (shouldCleanup) {
                await finalizeChapterCleanup(activeChapter.id);
                toast.success("Capítulo finalizado y respaldos optimizados.");
            } else {
                toast.success("Capítulo marcado como finalizado.");
            }

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

    const handleSaveBookmark = async () => {
        if (!editor || !activeChapter || !editorScrollRef.current) return;

        if (activeChapter.readingBookmark) {
            try {
                await saveReadingBookmark(activeChapter.id, null);
                toast.success("Marcador eliminado.");
            } catch (error) {
                console.error("Error deleting bookmark:", error);
                toast.error("No se pudo eliminar el marcador.");
            }
            return;
        }

        const container = editorScrollRef.current;
        const elements = container.querySelectorAll('.prose p, .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6, .prose li');
        let visibleParagraphIndex = 0;
        let textSnippet = "";
        const containerTop = container.getBoundingClientRect().top;

        for (let i = 0; i < elements.length; i++) {
            const rect = elements[i].getBoundingClientRect();
            if (rect.top >= containerTop - 40) {
                visibleParagraphIndex = i;
                const text = elements[i].textContent || "";
                textSnippet = text.trim().substring(0, 45);
                break;
            }
        }

        const scrollPercentage = container.scrollTop / (container.scrollHeight - container.clientHeight) || 0;

        try {
            await saveReadingBookmark(activeChapter.id, {
                paragraphIndex: visibleParagraphIndex,
                textSnippet,
                scrollPercentage,
                updatedAt: new Date().toISOString()
            });
            toast.success("Marcador guardado.");
        } catch (error) {
            console.error("Error saving bookmark:", error);
            toast.error("No se pudo guardar el marcador.");
        }
    };

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                bold: false,
                italic: false,
                heading: false,
                strike: false,
                code: false,
                blockquote: false,
                bulletList: false,
                orderedList: false,
                listItem: false,
                codeBlock: false,
                horizontalRule: false,
            }),
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

                const ghostTarget = target.closest('span[data-ghost-char-id]');
                if (ghostTarget) {
                    const charId = ghostTarget.getAttribute('data-ghost-char-id');
                    const text = ghostTarget.textContent;
                    handleConvertGhostMention(charId, text, pos);
                    return true;
                }

                const charTarget = target.closest('[data-char-id]');
                if (charTarget) {
                    const charId = charTarget.getAttribute('data-char-id');
                    setSelectedCharacterId(charId);
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
            if (isWorldDocMode) {
                saveWorldDocContent(html);
            } else {
                saveChapterContentRef.current(html);
            }

            const text = editor.getText();
            setTotalWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);

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
    });

    useEffect(() => {
        if (editor) {
            setSharedEditor(editor);
        }
        return () => {
            setSharedEditor(null);
        };
    }, [editor, setSharedEditor]);

    useEffect(() => {
        if (!editor) return;
        if (isWorldDocMode && activeWorldDoc) {
            const currentHtml = editor.getHTML();
            if (currentHtml !== activeWorldDoc.content) {
                editor.commands.setContent(activeWorldDoc.content || '', false);
                const text = editor.getText();
                setTotalWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
            }
        } else if (activeChapter) {
            const currentHtml = editor.getHTML();
            if (currentHtml !== activeChapter.content) {
                editor.commands.setContent(activeChapter.content || '', false);
                const text = editor.getText();
                setTotalWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
            }
        }
    }, [activeChapter?.id, activeChapter?.content, activeChapter?.lastSyncToken, activeWorldDoc?.id, activeWorldDoc?.content, editor]);

    // Effect 1: scroll to top when the chapter changes (normal behavior)
    useEffect(() => {
        if (!editorScrollRef.current) return;
        editorScrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }, [activeChapter?.id, activeWorldDoc?.id]);

    // Effect 2: when focus mode is turned ON, restore bookmark position if one exists
    useEffect(() => {
        if (!isFocusMode) return;
        if (!editorScrollRef.current || !activeChapter?.readingBookmark) return;

        const { paragraphIndex, textSnippet, scrollPercentage } = activeChapter.readingBookmark;
        const container = editorScrollRef.current;

        const doScroll = () => {
            const elements = container.querySelectorAll('.prose p, .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6, .prose li');
            if (elements.length === 0) return false;

            let targetEl = null;

            if (textSnippet && textSnippet.trim() !== '') {
                for (let i = 0; i < elements.length; i++) {
                    if (elements[i].textContent?.trim().startsWith(textSnippet)) {
                        targetEl = elements[i];
                        break;
                    }
                }
            }

            if (!targetEl && paragraphIndex !== undefined && paragraphIndex < elements.length) {
                targetEl = elements[paragraphIndex];
            }

            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetEl.classList.add('bookmark-active-glow');
                setTimeout(() => targetEl.classList.remove('bookmark-active-glow'), 2500);
                return true;
            } else if (scrollPercentage !== undefined) {
                const dest = scrollPercentage * (container.scrollHeight - container.clientHeight);
                container.scrollTo({ top: dest, behavior: 'smooth' });
                return true;
            }
            return false;
        };

        // Try immediately first; if content not rendered yet retry after a short wait
        if (!doScroll()) {
            const timer = setTimeout(doScroll, 400);
            return () => clearTimeout(timer);
        }
    }, [isFocusMode]);


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

    useEffect(() => {
        if (!editor || editor.isDestroyed || !editor.view?.dom) return;
        const sizeClass = readingTextSize === 'sm' ? 'prose-sm' :
            readingTextSize === 'lg' ? 'prose-lg' :
                readingTextSize === 'xl' ? 'prose-xl' :
                    'prose-base';

        editor.view.dom.classList.remove('prose-sm', 'prose-base', 'prose-lg', 'prose-xl');
        editor.view.dom.classList.add('prose', sizeClass, 'max-w-none', 'mx-auto', 'focus:outline-none', 'h-full');
    }, [readingTextSize, editor]);

    return (
        <div className={`flex flex-col bg-[var(--bg-editor)] overflow-hidden transition-all duration-300 ${isFocusMode ? 'fixed inset-0 z-50' : 'w-full h-full'}`}>
            {chapterLock.isLocked && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-medium">
                        <Lock size={16} />
                        <span>Este capítulo está siendo editado desde otro dispositivo.</span>
                    </div>
                    <button
                        onClick={() => claimLock()}
                        className="text-xs bg-amber-500 text-white px-3 py-1 rounded-full font-bold hover:bg-amber-600 transition-colors shadow-sm flex items-center gap-1 cursor-pointer"
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

            {!isFocusMode ? (
                <div className="border-b border-[var(--border-main)] bg-[var(--bg-app)] shrink-0 px-3 py-2 md:px-6">
                    <div className="flex md:hidden items-center justify-between gap-3">
                        <button
                            onClick={() => setIsChapterInfoModalOpen(true)}
                            className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--border-main)] text-[var(--accent-main)] bg-[var(--bg-app)] cursor-pointer"
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
                            className="w-10 h-10 flex items-center justify-center rounded-xl border border-amber-500/30 text-amber-600 bg-amber-500/5 cursor-pointer"
                        >
                            <MessageSquarePlus size={18} />
                        </button>

                        <button
                            onClick={() => setIsFocusMode(true)}
                            className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--border-main)] text-[var(--accent-main)] bg-[var(--bg-app)] cursor-pointer"
                        >
                            <BookOpen size={18} />
                        </button>

                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--accent-main)]/30 text-[var(--accent-main)] bg-[var(--accent-soft)] cursor-pointer"
                        >
                            <MoreHorizontal size={20} />
                        </button>
                    </div>

                    <div className="hidden md:flex items-center justify-between gap-4 w-full h-14">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsFocusMode(true)}
                                className="w-11 h-11 rounded-xl text-[var(--text-muted)] border border-[var(--border-main)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)] transition-all shadow-sm flex items-center justify-center cursor-pointer"
                                title="Modo Lectura / Foco"
                            >
                                <BookOpen size={20} />
                            </button>

                            <button
                                onClick={() => setIsChapterInfoModalOpen(true)}
                                className="w-11 h-11 rounded-xl text-[var(--text-muted)] border border-[var(--border-main)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)] transition-all shadow-sm flex items-center justify-center cursor-pointer"
                                title="Información del Capítulo"
                            >
                                <Info size={20} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-xl p-1 shadow-sm relative">
                                <button
                                    onClick={() => setIsCopyDropdownOpen(!isCopyDropdownOpen)}
                                    className="px-3 py-1.5 text-[10px] font-black text-[var(--text-main)] uppercase tracking-widest flex items-center gap-2 hover:bg-[var(--accent-soft)] rounded-lg transition-all cursor-pointer"
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
                                                        className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${copyMode === mode.id ? 'bg-[var(--accent-main)] text-white' : 'text-[var(--text-main)] hover:bg-[var(--accent-soft)]'}`}
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
                                    className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all cursor-pointer ${copied ? 'bg-green-500 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-main)]'}`}
                                    title="Copiar"
                                >
                                    <Copy size={18} />
                                </button>
                            </div>
                            
                            <button
                                onClick={handleReplaceFromClipboard}
                                className="h-11 px-4 rounded-xl text-[var(--accent-main)] bg-[var(--accent-soft)] hover:bg-[var(--accent-main)] hover:text-white transition-all shadow-sm border border-[var(--border-main)] flex items-center gap-2 cursor-pointer"
                                title="Sustituir con Portapapeles"
                            >
                                <ClipboardPaste size={18} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Reemplazar</span>
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            {activeChapter && (
                                <div className="relative">
                                    <button 
                                        onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                                        className="flex items-center gap-3 px-5 h-11 rounded-full border border-[var(--border-main)] bg-[var(--bg-editor)] shadow-sm hover:border-[var(--accent-main)] transition-all group cursor-pointer"
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
                                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group cursor-pointer ${activeChapter.status === opt.value ? 'bg-indigo-500/5' : 'hover:bg-[var(--bg-editor)]'}`}
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

                            <div className="relative">
                                <button 
                                    onClick={() => setIsDesktopMoreOpen(!isDesktopMoreOpen)}
                                    className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-300 cursor-pointer ${isDesktopMoreOpen ? 'bg-[var(--accent-main)] text-white shadow-lg' : 'bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-muted)] hover:border-[var(--accent-main)] hover:text-[var(--accent-main)] shadow-sm'}`}
                                >
                                    <MoreHorizontal size={22} />
                                </button>

                                {isDesktopMoreOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsDesktopMoreOpen(false)}></div>
                                        <div className="absolute right-0 mt-3 w-64 bg-[var(--bg-app)] border border-[var(--border-main)] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200">
                                            <div className="p-1.5 space-y-1">
                                                <button onClick={() => { setActiveView('ia-studio'); setIsDesktopMoreOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--accent-soft)] text-[var(--text-main)] rounded-xl transition-all group text-left cursor-pointer">
                                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center group-hover:from-purple-600 group-hover:to-indigo-700 transition-all">
                                                        <Sparkles size={16} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black uppercase tracking-widest">IA Studio</span>
                                                        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">Chat con Inteligencia Artificial</span>
                                                    </div>
                                                </button>

                                                <button onClick={() => { setIsDetectionModeModalOpen(true); setIsDesktopMoreOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--accent-soft)] text-[var(--text-main)] rounded-xl transition-all group text-left cursor-pointer">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                                        <ScanSearch size={16} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black uppercase tracking-widest">IA Scan</span>
                                                        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">Analizar Personajes</span>
                                                    </div>
                                                </button>

                                                <button onClick={() => { setIsHistoryModalOpen(true); setIsDesktopMoreOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--accent-soft)] text-[var(--text-main)] rounded-xl transition-all group text-left cursor-pointer">
                                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                                        <History size={16} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black uppercase tracking-widest">Historial</span>
                                                        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">Versiones y Backup</span>
                                                    </div>
                                                </button>

                                                <button onClick={() => { setIsReadingSettingsModalOpen(true); setIsDesktopMoreOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--accent-soft)] text-[var(--text-main)] rounded-xl transition-all group text-left cursor-pointer">
                                                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-all">
                                                        <Settings size={18} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black uppercase tracking-widest">Vista</span>
                                                        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">Fuentes y Diseño</span>
                                                    </div>
                                                </button>
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
                        <button onClick={() => setIsReadingSettingsModalOpen(true)} className="p-2 rounded-lg border border-[var(--border-main)] text-[var(--text-muted)] cursor-pointer" title="Ajustes de Vista"><Settings size={16} /></button>
                        {!isWorldDocMode && activeChapter && (
                            <button
                                onClick={handleSaveBookmark}
                                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                                    activeChapter.readingBookmark
                                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20'
                                        : 'border-[var(--border-main)] text-[var(--text-muted)] hover:border-indigo-500/50 hover:text-indigo-500'
                                }`}
                                title={activeChapter.readingBookmark ? "Quitar Marcador de Lectura" : "Marcar Posición de Lectura"}
                            >
                                <Bookmark size={16} fill={activeChapter.readingBookmark ? "currentColor" : "none"} />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!isWorldDocMode && prevChapter && <button onClick={() => handleChapterNavigation(prevChapter)} className="p-2 text-[var(--accent-main)] cursor-pointer"><ChevronLeft size={20} /></button>}
                        {!isWorldDocMode && nextChapter && <button onClick={() => handleChapterNavigation(nextChapter)} className="p-2 text-[var(--accent-main)] cursor-pointer"><ChevronRight size={20} /></button>}
                    </div>
                    <button onClick={() => setIsFocusMode(false)} className="px-4 py-2 rounded-lg border border-red-500/30 text-red-500 font-bold uppercase text-[10px] cursor-pointer">Salir</button>
                </div>
            )}

            <div className="flex-grow flex overflow-hidden relative w-full h-full">
                <div ref={editorScrollRef} className={`flex-1 overflow-y-auto px-4 pt-8 pb-8 md:px-20 md:pt-24 md:pb-8 scrollbar-hide transition-all duration-300 ${isFocusMode ? 'editor-focus-mode ' + readingFont : 'font-[Arial,sans-serif]'} ${isEditorLocked ? 'editor-locked-mode' : ''}`}>
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
                                className="flex items-center gap-1.5 bg-[var(--bg-app)]/85 backdrop-blur-2xl border border-white/10 p-1.5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-indigo-500/10 shadow-indigo-950/20 z-[9999]"
                            >
                                <button
                                    onClick={() => {
                                        const { from, to } = editor.state.selection;
                                        const text = editor.state.doc.textBetween(from, to, ' ');
                                        navigator.clipboard.writeText(text);
                                        toast.success('¡Copiado!');
                                    }}
                                    className="h-10 px-4 flex items-center justify-center rounded-xl bg-[var(--accent-main)]/10 text-[var(--accent-main)] hover:bg-[var(--accent-main)] hover:text-white transition-all duration-300 gap-2 font-black text-[10px] uppercase tracking-[0.15em] hover:scale-[1.03] active:scale-95 shadow-sm active:shadow-none cursor-pointer"
                                    title="Copiar Selección"
                                >
                                    <Copy size={13} />
                                    <span className="pr-0.5 leading-none">Copiar</span>
                                </button>
                            </BubbleMenu>
                        )}
                        {editor && <EditorContent editor={editor} className={`min-h-full cursor-text ${isEditorLocked ? 'pointer-events-none select-none' : ''}`} onClick={() => !isEditorLocked && editor.commands.focus()} />}
                    </div>
                </div>
            </div>

            {/* Selection metrics toast */}
            {selectionMetrics.show && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-[var(--bg-app)]/90 backdrop-blur-2xl border border-indigo-500/30 rounded-2xl p-2 px-4 shadow-2xl flex items-center gap-6 ring-1 ring-indigo-500/20">
                        <div className="flex items-center gap-4">
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
                                editor.chain().focus().setTextSelection({ from: editor.state.selection.to, to: editor.state.selection.to }).run();
                                setSelectionMetrics({ ...selectionMetrics, show: false });
                            }}
                            className="p-2 text-[var(--text-muted)] hover:text-red-500 transition-colors cursor-pointer"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Isolated character Card modal */}
            <CharacterCardModal
                isOpen={isCardModalOpen}
                onClose={() => setIsCardModalOpen(false)}
                characterId={selectedCharacterId}
                characters={characters}
            />

            {/* Isolated Inline Note Modal */}
            <InlineNoteModal
                isNoteModalOpen={isNoteModalOpen}
                onNoteModalClose={() => { setIsNoteModalOpen(false); setNoteText(''); setNoteSelectionRange(null); }}
                noteText={noteText}
                setNoteText={setNoteText}
                onSaveNote={handleSaveNote}
                isViewNoteModalOpen={isViewNoteModalOpen}
                onViewNoteModalClose={() => { setIsViewNoteModalOpen(false); setViewingNote(null); setIsEditingNote(false); }}
                viewingNote={viewingNote}
                isEditingNote={isEditingNote}
                setIsEditingNote={setIsEditingNote}
                editNoteText={editNoteText}
                setEditNoteText={setEditNoteText}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
            />

            {/* Isolated Detection Modal */}
            <DetectionModal
                isDetectionModeModalOpen={isDetectionModeModalOpen}
                onDetectionModeClose={() => setIsDetectionModeModalOpen(false)}
                onRunDetection={(mode) => {
                    setIsDetectionModeModalOpen(false);
                    runDetection(mode);
                }}
                isDetectionModalOpen={isDetectionModalOpen}
                onDetectionClose={() => { setIsDetectionModalOpen(false); setHighlightedCharId(null); }}
                detectedCharacters={detectedCharacters}
                highlightedCharId={highlightedCharId}
                setHighlightedCharId={setHighlightedCharId}
                newPreviewHtml={newPreviewHtml}
                onApplyToDocument={() => {
                    if (editor) {
                        editor.commands.setContent(newPreviewHtml);
                    }
                    setIsDetectionModalOpen(false);
                    setHighlightedCharId(null);
                }}
            />

            {/* Isolated Reading Settings Modal */}
            <ReadingSettingsModal
                isOpen={isReadingSettingsModalOpen}
                onClose={() => setIsReadingSettingsModalOpen(false)}
                readingFont={readingFont}
                setReadingFont={setReadingFont}
                readingWidth={readingWidth}
                setReadingWidth={setReadingWidth}
                readingTextSize={readingTextSize}
                setReadingTextSize={setReadingTextSize}
            />

            {/* Isolated Chapter Info Modal */}
            <ChapterInfoModal
                isOpen={isChapterInfoModalOpen}
                onClose={() => setIsChapterInfoModalOpen(false)}
                activeDocInfo={activeDocInfo}
                activeBook={activeBook}
            />

            {/* History Modal */}
            <HistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                editor={editor}
            />

            {/* Finalize Modal */}
            <FinalizeModal
                isOpen={isFinalizeModalOpen}
                onClose={() => setIsFinalizeModalOpen(false)}
                onConfirm={confirmFinalize}
            />

            {/* Mobile Menu Tools Drawer */}
            <Modal isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} title="Herramientas del Editor">
                <div className="p-8 space-y-10 bg-indigo-500/[0.01]">
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => { setIsDetectionModeModalOpen(true); setIsMobileMenuOpen(false); }}
                            className="p-8 rounded-[32px] bg-[var(--bg-editor)] border border-[var(--border-main)] flex flex-col items-center gap-4 active:scale-95 transition-all shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 group cursor-pointer"
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
                            className="p-8 rounded-[32px] bg-[var(--bg-editor)] border border-[var(--border-main)] flex flex-col items-center gap-4 active:scale-95 transition-all shadow-sm hover:shadow-xl hover:shadow-blue-500/5 group cursor-pointer"
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
                            className="p-8 rounded-[32px] bg-[var(--bg-editor)] border border-[var(--border-main)] flex flex-col items-center gap-4 active:scale-95 transition-all shadow-sm hover:shadow-xl hover:shadow-orange-500/5 group col-span-2 flex-row justify-center gap-8 cursor-pointer"
                        >
                            <div className="w-14 h-14 rounded-[20px] bg-orange-100 text-orange-600 flex items-center justify-center transition-transform group-hover:scale-110">
                                <Sliders size={28} />
                            </div>
                            <div className="text-left">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-main)]">Lectura</span>
                                <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-widest opacity-60">Ajustes del Visualizador</span>
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
                                        className={`px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
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
                                className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-xl shadow-blue-600/30 active:scale-95 transition-all cursor-pointer"
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
                                        className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
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
                        className="w-full py-4 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.4em] opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                    >
                        Cerrar Herramientas
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default Editor;
