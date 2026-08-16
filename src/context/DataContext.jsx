import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
    getBooks,
    createBook as createBookApi,
    updateBook as updateBookApi,
    deleteBook as deleteBookApi,
    getChapters,
    getChaptersMetadata,
    createChapter as createChapterApi,
    updateChapter as updateChapterApi,
    deleteChapter as deleteChapterApi,
    updateChapterContent,
    getChapter,
    getCharacters,
    createCharacter as createCharacterApi,
    updateCharacter as updateCharacterApi,
    deleteCharacter as deleteCharacterApi,
    getWorld,
    createWorldItem as createWorldItemApi,
    updateWorldItem as updateWorldItemApi,
    deleteWorldItem as deleteWorldItemApi,
    setWorldItemWithId,
    getChapterSnapshots as getChapterSnapshotsApi,
    saveChapterSnapshot as saveChapterSnapshotApi,
    deleteAllChapterSnapshots as deleteAllSnapshotsApi,
    getUserProfile,
    createUserProfile,
    updateUserProfile as updateUserProfileApi,
    subscribeToChapter,
    claimChapterLock as claimLockApi,
    releaseChapterLock as releaseLockApi,
    permanentlyDeleteChapter,
    permanentlyDeleteCharacter,
    permanentlyDeleteWorldItem
} from '../services/db';
import { decompressData } from '../services/compression';
import { uploadImageToCloudinary } from '../services/cloudinary';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import DOMPurify from 'dompurify';
import {
    saveLocalSnapshot,
    getLocalSnapshots,
    deleteLocalSnapshot,
    deleteAllLocalSnapshots
} from '../services/localDb';

const detectSignificantChange = (oldHtml, newHtml) => {
    if (!oldHtml) return false;
    const oldLen = oldHtml.replace(/<[^>]*>/g, '').length;
    const newLen = newHtml.replace(/<[^>]*>/g, '').length;
    if (oldLen === 0) return (newLen > 100); 
    const diffPercent = Math.abs(oldLen - newLen) / oldLen;
    return diffPercent > 0.15;
};

const DataContext = createContext();

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
    const [books, setBooks] = useState([]);
    const pendingSaves = useRef({});
    const [activeBook, setActiveBook] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [activeChapter, setActiveChapter] = useState(null);
    const [activeWorldDoc, setActiveWorldDoc] = useState(null); // { id, title, content }
    const [characters, setCharacters] = useState([]);
    const [worldItems, setWorldItems] = useState([]);
    const [trashItems, setTrashItems] = useState([]);
    const [activeView, setActiveView] = useState('editor'); // 'editor', 'characters', 'world', 'settings'
    const [loading, setLoading] = useState(true);
    const [lastSaved, setLastSaved] = useState(new Date());
    const lastMajorBackupContentRef = useRef({}); // { chapterId: string }
    const lastCloudContentRef = useRef({}); // { chapterId: string }
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [sessionId] = useState(() => {
        const stored = localStorage.getItem('writer_device_id');
        if (stored) return stored;
        const newId = Math.random().toString(36).substring(2, 10);
        localStorage.setItem('writer_device_id', newId);
        return newId;
    });
    const [chapterLock, setChapterLock] = useState({ isLocked: false, activeEditorId: null, deviceName: 'Esta computadora' });
    const [sharedEditor, setSharedEditor] = useState(null);

    // XSS Protection - Sanitize HTML content
    const sanitizeHtml = useCallback((html) => {
        if (!html) return '';
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'span', 'strong', 'em', 'u', 's', 'a', 'br', 'blockquote', 'pre', 'code', 'mark', 'img'],
            ALLOWED_ATTR: ['href', 'title', 'target', 'src', 'alt', 'width', 'height', 'style', 'class', 'data-type', 'data-id']
        });
    }, []);



    const flushAllSaves = useCallback(async () => {
        const keys = Object.keys(pendingSaves.current);
        const savesToRun = [];
        for (const key of keys) {
            savesToRun.push(pendingSaves.current[key]);
            clearTimeout(pendingSaves.current[key].timeoutId);
        }
        pendingSaves.current = {};
        for (const save of savesToRun) {
            if (save.fn) {
                try { await save.fn(true); }
                catch (error) { console.error("Error flushing save", error); }
            }
        }
        pendingSaves.current = {};
    }, []);

    useEffect(() => {
        const handleBeforeUnload = () => {
            if (Object.keys(pendingSaves.current).length > 0) {
                flushAllSaves();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [flushAllSaves]);

    // Auth Listener
    useEffect(() => {
        // Bypass temporal únicamente para desarrollo local con el usuario de pruebas.
        // En producción, Firebase Auth continúa siendo obligatorio.
        if (import.meta.env.DEV) {
            const devUser = {
                uid: 'TZLJ51XTyONUVoGbLfG48O9irz33',
                displayName: 'Usuario de pruebas',
                email: 'test@local.dev',
                photoURL: null,
            };
            setUser(devUser);
            setProfile({ id: devUser.uid, displayName: devUser.displayName, email: devUser.email, photoURL: devUser.photoURL });
            getUserProfile(devUser.uid).then((userProfile) => {
                if (userProfile) setProfile(userProfile);
            }).catch((error) => console.warn('Perfil de pruebas no disponible; se usará el perfil local:', error));
            setAuthLoading(false);
            return undefined;
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                // Check and sync profile
                try {
                    let userProfile = await getUserProfile(currentUser.uid);
                    if (!userProfile) {
                        userProfile = await createUserProfile(currentUser.uid, {
                            displayName: currentUser.displayName,
                            email: currentUser.email,
                            photoURL: currentUser.photoURL
                        });
                    }
                    setProfile(userProfile);
                } catch (error) {
                    console.error("Profile sync error:", error);
                }
            } else {
                setProfile(null);
            }
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSetActiveView = async (view) => {
        await flushAllSaves();
        setActiveView(view);
    };

    // Load all books initially
    useEffect(() => {
        const loadBooks = async () => {
            if (!user) {
                setBooks([]);
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                const fetchedBooks = await getBooks(user.uid);
                setBooks(fetchedBooks);
                
                // RESTORE PERSISTENCE: Check if there's a saved book to auto-select
                const savedBookId = localStorage.getItem('lastBookId');
                if (savedBookId) {
                    const savedBook = fetchedBooks.find(b => b.id === savedBookId);
                    if (savedBook) {
                        handleSelectBook(savedBook);
                    }
                }
            } catch (error) {
                console.error("Failed to load books from Firestore", error);
            } finally {
                setLoading(false);
            }
        };
        loadBooks();
    }, [user]);

    // Real-time synchronization and Presence for active chapter
    useEffect(() => {
        if (!activeBook || !activeChapter || !activeChapter.id) return;

        const unsubscribe = subscribeToChapter(activeBook.id, activeChapter.id, (cloudData) => {
            const saveKey = `chap_${activeChapter.id}`;
            const hasPendingSave = !!pendingSaves.current[saveKey];

            // 1. Handle Content Sync
            if (cloudData.lastSyncToken !== activeChapter.lastSyncToken && !hasPendingSave) {
                const safeContent = sanitizeHtml(cloudData.content);
                setActiveChapter(prev => ({ ...prev, ...cloudData, content: safeContent, isLoaded: true }));
                setChapters(prev => prev.map(ch => ch.id === cloudData.id ? { ...cloudData, content: safeContent, isLoaded: true } : ch));
                lastCloudContentRef.current[cloudData.id] = cloudData.content;
                setLastSaved(new Date());
            }

            // 2. Handle Presence / Locking
            const { activeEditorId, lastEditTime } = cloudData;
            const now = Date.now();
            const lastEditMs = lastEditTime?.toMillis ? lastEditTime.toMillis() : (lastEditTime instanceof Date ? lastEditTime.getTime() : now);
            const isActiveLock = activeEditorId && activeEditorId !== sessionId && (now - lastEditMs < 60000);

            setChapterLock({
                isLocked: isActiveLock,
                activeEditorId: activeEditorId,
                deviceName: activeEditorId === sessionId ? 'Este dispositivo' : 'Otro dispositivo'
            });
        });

        return () => unsubscribe();
    }, [activeBook?.id, activeChapter?.id, sessionId, sanitizeHtml]);

    const handleSelectBook = async (book) => {
        await flushAllSaves();
        setActiveBook(book);
        
        if (book) {
            localStorage.setItem('lastBookId', book.id);
        } else {
            localStorage.removeItem('lastBookId');
        }
        
        if (!book) {
            setChapters([]);
            setActiveChapter(null);
            setCharacters([]);
            setWorldItems([]);
            setTrashItems([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // Load Chapters Metadata (Optimized initial load)
            const allChapters = await getChaptersMetadata(book.id);
            const fetchedChapters = allChapters.filter(c => !c.deletedAt);
            const trashChaps = allChapters.filter(c => c.deletedAt).map(c => ({ ...c, collectionType: 'chapters' }));
            setChapters(fetchedChapters);
            
            if (fetchedChapters.length > 0) {
                const savedChapterId = localStorage.getItem(`lastChapter_${book.id}`);
                const savedChapter = savedChapterId ? fetchedChapters.find(c => c.id === savedChapterId) : null;
                // Important: Use handleSelectChapter to trigger lazy loading of content
                handleSelectChapter(savedChapter || fetchedChapters[0], book.id);
            } else {
                setActiveChapter(null);
            }

            // Load Characters
            const allCharacters = await getCharacters(book.id);
            const fetchedCharacters = allCharacters.filter(c => !c.deletedAt);
            const trashChars = allCharacters.filter(c => c.deletedAt).map(c => ({ ...c, collectionType: 'characters' }));
            setCharacters(fetchedCharacters);

            // Load World Items. `system_personajes` is a legacy document and is
            // intentionally excluded: characters live in the characters collection.
            const allWorldItems = await getWorld(book.id);
            let fetchedWorldItems = allWorldItems.filter(i => !i.deletedAt && i.id !== 'system_personajes');
            const trashWorlds = allWorldItems.filter(i => i.deletedAt && i.id !== 'system_personajes').map(c => ({ ...c, collectionType: 'world' }));

            // Ensure the three system documents exist
            const systemIds = ['system_estructura', 'system_core'];
            const updatedFetchedItems = [...fetchedWorldItems];
            for (const sysId of systemIds) {
                const existing = fetchedWorldItems.find(item => item.id === sysId);
                if (!existing) {
                    const defaultTitle = sysId === 'system_personajes' ? 'Personajes' : sysId === 'system_estructura' ? 'Estructura de Capítulos' : 'Información General';
                    const defaultItem = {
                        title: defaultTitle,
                        content: '',
                        images: [],
                        parentId: null,
                        isCategory: false
                    };
                    try {
                        await setWorldItemWithId(book.id, sysId, defaultItem);
                        const newSysItem = { id: sysId, ...defaultItem };
                        updatedFetchedItems.push(newSysItem);
                    } catch (err) {
                        console.error(`Failed to auto-initialize system item ${sysId}`, err);
                    }
                }
            }
            fetchedWorldItems = updatedFetchedItems;
            setWorldItems(fetchedWorldItems);


            setTrashItems([...trashChaps, ...trashChars, ...trashWorlds]);

            // Default view
            setActiveView('editor');
        } catch (error) {
            console.error("Failed to fully load book data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateBookData = async (data) => {
        if (!activeBook) return;
        setActiveBook(prev => ({ ...prev, ...data }));
        setBooks(prev => prev.map(b => b.id === activeBook.id ? { ...b, ...data } : b));

        const saveKey = `book_${activeBook.id}`;
        if (pendingSaves.current[saveKey]) {
            clearTimeout(pendingSaves.current[saveKey].timeoutId);
        }

        const bookId = activeBook.id;
        const fn = async () => {
            delete pendingSaves.current[saveKey];
            try {
                await updateBookApi(bookId, data);
                setLastSaved(new Date());
            } catch (error) {
                console.error("Failed to update book data", error);
            }
        };

        pendingSaves.current[saveKey] = {
            timeoutId: setTimeout(fn, 10000),
            fn
        };
    };

    const handleCreateBook = async (title, coverUrl = null) => {
        if (!user) return;
        setLoading(true);
        try {
            const newBook = await createBookApi(title, user.uid, '', coverUrl);
            setBooks(prev => [newBook, ...prev]);
            await handleSelectBook(newBook);
            return newBook;
        } catch (error) {
            console.error("Failed to create book", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateBook = async (data) => {
        if (!activeBook) return;
        const updatedBook = { ...activeBook, ...data };
        setActiveBook(updatedBook);
        setBooks(books.map(b => b.id === activeBook.id ? updatedBook : b));
        try {
            await updateBookApi(activeBook.id, data);
        } catch (error) {
            console.error("Failed to update book", error);
        }
    };

    const handleDeleteBook = async (bookId) => {
        try {
            await deleteBookApi(bookId);
            const remainingBooks = books.filter(b => b.id !== bookId);
            setBooks(remainingBooks);
            if (remainingBooks.length > 0) {
                handleSelectBook(remainingBooks[0]);
            } else {
                setActiveBook(null);
            }
        } catch (error) {
            console.error("Failed to delete book", error);
        }
    };

    const handleCreateChapter = async (itemData, options = {}) => {
        if (!activeBook) return;
        try {
            const currentItems = chapters.filter(c => c.parentId === itemData.parentId);
            const orderIndex = currentItems.length;
            const newChapter = await createChapterApi(activeBook.id, { ...itemData, orderIndex });
            setChapters(prev => [...prev, newChapter]);
            if (!itemData.isVolume && !options.preventRedirect) {
                setActiveChapter(newChapter);
                setActiveView('editor');
            }
            return newChapter;
        } catch (error) {
            console.error("Failed to create chapter", error);
        }
    };

    const handleGetDocumentSnapshots = async (documentId) => {
        try {
            return await getLocalSnapshots(documentId);
        } catch (error) {
            console.error("Failed to get document snapshots", error);
            return [];
        }
    };

    const handleSaveDocumentSnapshot = async (documentId, content, triggerType = 'manual') => {
        try {
            await saveLocalSnapshot(documentId, content, triggerType);
            return true;
        } catch (error) {
            console.error("Failed to save document snapshot", error);
            return null;
        }
    };

    const handleDeleteDocumentSnapshot = async (snapshotId) => {
        try {
            await deleteLocalSnapshot(snapshotId);
            return true;
        } catch (error) {
            console.error("Failed to delete document snapshot", error);
            return false;
        }
    };

    const handleDeleteChapter = async (chapterId) => {
        if (!activeBook) return;
        try {
            await deleteChapterApi(activeBook.id, chapterId);
            const toDelete = chapters.find(c => c.id === chapterId);
            if (toDelete) {
                setTrashItems(prev => [...prev, { ...toDelete, deletedAt: new Date(), collectionType: 'chapters' }]);
            }
            const remaining = chapters.filter(c => c.id !== chapterId);
            setChapters(remaining);
            if (activeChapter?.id === chapterId) {
                setActiveChapter(remaining.length > 0 ? remaining[0] : null);
            }
        } catch (error) {
            console.error("Failed to delete chapter", error);
        }
    };

    const handleUpdateChapter = async (chapterId, updateData, options = {}) => {
        if (!activeBook) return;
        setChapters(prev => prev.map(c => c.id === chapterId ? { ...c, ...updateData } : c));
        if (activeChapter && activeChapter.id === chapterId) {
            setActiveChapter(prev => ({ ...prev, ...updateData }));
        }

        if (options.immediate) {
            const expectedToken = activeChapter && activeChapter.id === chapterId ? activeChapter.lastSyncToken : null;
            const newToken = await updateChapterApi(activeBook.id, chapterId, updateData, expectedToken);
            setChapters(prev => prev.map(c => c.id === chapterId ? { ...c, lastSyncToken: newToken } : c));
            if (activeChapter && activeChapter.id === chapterId) setActiveChapter(prev => ({ ...prev, lastSyncToken: newToken }));
            setLastSaved(new Date());
            return newToken;
        }

        const saveKey = `chap_meta_${chapterId}`;
        if (pendingSaves.current[saveKey]) {
            clearTimeout(pendingSaves.current[saveKey].timeoutId);
        }

        const fn = async () => {
            delete pendingSaves.current[saveKey];
            try {
                // Get the current token to validate
                const expectedToken = activeChapter && activeChapter.id === chapterId ? activeChapter.lastSyncToken : null;
                const newToken = await updateChapterApi(activeBook.id, chapterId, updateData, expectedToken);
                
                // Update local token to keep sync chain
                if (activeChapter && activeChapter.id === chapterId) {
                    setActiveChapter(prev => ({ ...prev, lastSyncToken: newToken }));
                }
                setChapters(prev => prev.map(c => c.id === chapterId ? { ...c, lastSyncToken: newToken } : c));
                setLastSaved(new Date());
            } catch (error) {
                console.error("Failed to update chapter", error);
            }
        };

        pendingSaves.current[saveKey] = {
            timeoutId: setTimeout(fn, 10000),
            fn
        };
    };

    // Saves readingBookmark immediately to Firebase without any debounce
    const handleSaveReadingBookmark = async (chapterId, bookmark) => {
        if (!activeBook) return;
        // Update local state immediately so UI reacts at once
        setChapters(prev => prev.map(c => c.id === chapterId ? { ...c, readingBookmark: bookmark } : c));
        if (activeChapter && activeChapter.id === chapterId) {
            setActiveChapter(prev => ({ ...prev, readingBookmark: bookmark }));
        }
        // Write to Firebase right away
        try {
            await updateChapterApi(activeBook.id, chapterId, { readingBookmark: bookmark });
            setLastSaved(new Date());
        } catch (error) {
            console.error("Failed to save reading bookmark", error);
            throw error;
        }
    };


    const finalizeChapterCleanup = async (chapterId) => {
        try {
            await deleteAllLocalSnapshots(chapterId);
            return true;
        } catch (error) {
            console.error("Cleanup failed", error);
            return false;
        }
    };

    const handleReorderChapters = async (orderedIds, parentId) => {
        if (!activeBook) return;
        // Update local state immediately for snappy UX
        setChapters(prev => {
            const updated = [...prev];
            orderedIds.forEach((id, index) => {
                const ch = updated.find(c => c.id === id);
                if (ch) ch.orderIndex = index;
            });
            return updated;
        });
        // Persist to backend
        orderedIds.forEach(async (id, index) => {
            try {
                await updateChapterApi(activeBook.id, id, { orderIndex: index });
            } catch (error) {
                console.error('Failed to reorder chapter', id, error);
            }
        });
    };




    const handleSelectChapter = async (chapter, bookIdOverride = null) => {
        await flushAllSaves();

        const chapterReference = typeof chapter === 'string'
            ? chapters.find((item) => item.id === chapter)
            : chapter;
        if (!chapterReference) return;

        let chapterToActivate = chapterReference;
        const bookId = bookIdOverride || (activeBook ? activeBook.id : null);

        // LAZY LOAD: If chapter exists but content is not loaded, fetch it now
        if (chapterReference && !chapterReference.isLoaded && bookId) {
            try {
                const fullChapter = await getChapter(bookId, chapterReference.id);
                if (fullChapter) {
                    const safeContent = sanitizeHtml(fullChapter.content);
                    chapterToActivate = { ...fullChapter, content: safeContent, isLoaded: true };
                    // Update master list with the now-loaded chapter (prevents re-fetching)
                    setChapters(prev => prev.map(ch => ch.id === chapterReference.id ? chapterToActivate : ch));
                }
            } catch (error) {
                console.error("Lazy loading failed, using metadata-only chapter", error);
            }
        }
        
        setActiveChapter(chapterToActivate);
        setActiveWorldDoc(null); // Clear any active world doc when selecting a chapter
        
        if (chapterToActivate && chapterToActivate.id) {
            lastCloudContentRef.current[chapterToActivate.id] = chapterToActivate.content;
            lastMajorBackupContentRef.current[chapterToActivate.id] = chapterToActivate.content;
            
            // Baseline Snapshot: if history is empty but document has content, save initial state
            const docId = chapterToActivate.id;
            const docContent = chapterToActivate.content || '';
            if (docContent && docContent !== '<p></p>') {
                getLocalSnapshots(docId).then(async (snaps) => {
                    if (snaps.length === 0) {
                        await saveLocalSnapshot(docId, docContent, 'auto');
                    }
                }).catch(err => console.error("Failed to save baseline snapshot", err));
            }
        }
        setActiveView('editor');
        if (bookId && chapterReference) {
            localStorage.setItem(`lastChapter_${bookId}`, chapterReference.id);
        }
    }

    const lazyLoadChapters = useCallback(async (chapterIds) => {
        if (!activeBook || !chapterIds || chapterIds.length === 0) return;
        const unloadedIds = chapterIds.filter(id => {
            const ch = chapters.find(c => c.id === id);
            return ch && !ch.isLoaded;
        });

        if (unloadedIds.length === 0) return [];

        try {
            const fetched = await Promise.all(
                unloadedIds.map(async (id) => {
                    const fullCh = await getChapter(activeBook.id, id);
                    if (fullCh) {
                        const safeContent = sanitizeHtml(fullCh.content);
                        return { ...fullCh, content: safeContent, isLoaded: true };
                    }
                    return null;
                })
            );

            const validFetched = fetched.filter(Boolean);
            if (validFetched.length > 0) {
                setChapters(prev => prev.map(ch => {
                    const found = validFetched.find(f => f.id === ch.id);
                    return found ? found : ch;
                }));
            }
            return validFetched;
        } catch (error) {
            console.error("lazyLoadChapters failed", error);
            throw error;
        }
    }, [activeBook?.id, chapters, sanitizeHtml]);

    // --- Character Management ---
    const handleCreateCharacter = async (itemData) => {
        if (!activeBook) return;
        try {
            const newChar = await createCharacterApi(activeBook.id, itemData);
            setCharacters(prev => [...prev, newChar]);
            return newChar;
        } catch (error) {
            console.error("Failed to create character", error);
        }
    };

    const handleUpdateCharacter = async (charId, updateData, options = {}) => {
        if (!activeBook) return;
        setCharacters(prev => prev.map(c => c.id === charId ? { ...c, ...updateData } : c));
        
        if (activeWorldDoc && activeWorldDoc.id === charId && activeWorldDoc.type === 'character') {
            setActiveWorldDoc(prev => ({ 
                ...prev, 
                content: updateData.description !== undefined ? updateData.description : prev.content,
                title: updateData.name !== undefined ? updateData.name : prev.title,
                role: updateData.role !== undefined ? updateData.role : prev.role
            }));
        }

        if (options.immediate) {
            await updateCharacterApi(activeBook.id, charId, updateData);
            setLastSaved(new Date());
            return true;
        }

        const saveKey = `char_${charId}`;
        if (pendingSaves.current[saveKey]) {
            clearTimeout(pendingSaves.current[saveKey].timeoutId);
        }

        const fn = async () => {
            delete pendingSaves.current[saveKey];
            try {
                await updateCharacterApi(activeBook.id, charId, updateData);
            } catch (error) {
                console.error("Failed to update character", error);
            }
        };

        pendingSaves.current[saveKey] = {
            timeoutId: setTimeout(fn, 10000),
            fn
        };
    };

    const handleDeleteCharacter = async (charId) => {
        if (!activeBook) return;
        try {
            await deleteCharacterApi(activeBook.id, charId);
            const toDelete = characters.find(c => c.id === charId);
            if (toDelete) {
                setTrashItems(prev => [...prev, { ...toDelete, deletedAt: new Date(), collectionType: 'characters' }]);
            }
            setCharacters(prev => prev.filter(c => c.id !== charId));
        } catch (error) {
            console.error("Failed to delete character", error);
        }
    };

    // --- World Doc Mode (Master Doc sections opened in Editor) ---
    const openWorldDoc = async (docId) => {
        await flushAllSaves();
        if (docId === 'system_personajes') {
            setActiveView('world');
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('showCharactersWorldView'));
            }, 50);
            return;
        }
        const item = worldItems.find(w => w.id === docId);
        if (!item) return;
        setActiveChapter(null);
        setActiveWorldDoc({ id: item.id, title: item.title, content: item.content || '', type: 'worldItem' });
        lastMajorBackupContentRef.current[item.id] = item.content || '';
        
        // Baseline Snapshot: if history is empty but document has content, save initial state
        const docContent = item.content || '';
        if (docContent && docContent !== '<p></p>') {
            getLocalSnapshots(item.id).then(async (snaps) => {
                if (snaps.length === 0) {
                    await saveLocalSnapshot(item.id, docContent, 'auto');
                }
            }).catch(err => console.error("Failed to save baseline snapshot", err));
        }
        
        setActiveView('editor');
    };

    const openCharacterDoc = async (charId) => {
        await flushAllSaves();
        const char = characters.find(c => c.id === charId);
        if (!char) return;
        setActiveChapter(null);
        setActiveWorldDoc({
            id: char.id,
            title: char.name,
            content: char.description || '',
            type: 'character',
            role: char.role || ''
        });
        lastMajorBackupContentRef.current[char.id] = char.description || '';
        
        // Baseline Snapshot: if history is empty but document has content, save initial state
        const docContent = char.description || '';
        if (docContent && docContent !== '<p></p>') {
            getLocalSnapshots(char.id).then(async (snaps) => {
                if (snaps.length === 0) {
                    await saveLocalSnapshot(char.id, docContent, 'auto');
                }
            }).catch(err => console.error("Failed to save baseline snapshot", err));
        }
        
        setActiveView('editor');
    };

    const saveWorldDocContent = useCallback((html, triggerType = 'auto') => {
        if (!activeWorldDoc) return;
        setActiveWorldDoc(prev => ({ ...prev, content: html }));
        
        const docId = activeWorldDoc.id;
        const bookId = activeBook?.id;
        const isCharacter = activeWorldDoc.type === 'character';

        if (isCharacter) {
            setCharacters(prev => prev.map(c => c.id === docId ? { ...c, description: html } : c));
        } else {
            setWorldItems(prev => prev.map(item => item.id === docId ? { ...item, content: html } : item));
        }

        const saveKey = `worlddoc_${docId}`;
        if (pendingSaves.current[saveKey]) {
            clearTimeout(pendingSaves.current[saveKey].timeoutId);
        }

        const fn = async (forcedFlush = false) => {
            delete pendingSaves.current[saveKey];
            const isFlushing = forcedFlush;
            try {
                if (bookId) {
                    if (isCharacter) {
                        await updateCharacterApi(bookId, docId, { description: html });
                    } else {
                        await updateWorldItemApi(bookId, docId, { content: html });
                    }
                    
                    // Guardar punto de control local de forma automática en IndexedDB (si es flush o si hay cambio > 15%)
                    const lastMajor = lastMajorBackupContentRef.current[docId];
                    const hasRealDifference = lastMajor !== undefined ? lastMajor !== html : true;
                    
                    if (hasRealDifference && (isFlushing || detectSignificantChange(lastMajor || '', html))) {
                        await saveLocalSnapshot(docId, html, triggerType);
                        lastMajorBackupContentRef.current[docId] = html;
                    }
                }
            } catch (error) {
                console.error('Failed to save world doc content', error);
            }
        };

        if (triggerType === 'ia') {
            fn(true);
        } else {
            pendingSaves.current[saveKey] = {
                timeoutId: setTimeout(fn, 1500),
                fn
            };
        }
    }, [activeWorldDoc, activeBook]);

    // --- World Management ---
    const handleCreateWorldItem = async (itemData) => {
        if (!activeBook) return;
        try {
            const newItem = await createWorldItemApi(activeBook.id, itemData);
            setWorldItems(prev => [...prev, newItem]);
            return newItem;
        } catch (error) {
            console.error("Failed to create world item", error);
        }
    };

    const handleUpdateWorldItem = async (itemId, updateData, options = {}) => {
        if (!activeBook) return;
        setWorldItems(prev => prev.map(item => item.id === itemId ? { ...item, ...updateData } : item));
        if (activeWorldDoc && activeWorldDoc.id === itemId) {
            setActiveWorldDoc(prev => ({ ...prev, ...updateData }));
        }

        if (options.immediate) {
            await updateWorldItemApi(activeBook.id, itemId, updateData);
            setLastSaved(new Date());
            return true;
        }

        const saveKey = `world_${itemId}`;
        if (pendingSaves.current[saveKey]) {
            clearTimeout(pendingSaves.current[saveKey].timeoutId);
        }

        const fn = async () => {
            delete pendingSaves.current[saveKey];
            try {
                await updateWorldItemApi(activeBook.id, itemId, updateData);
            } catch (error) {
                console.error("Failed to update world item", error);
            }
        };

        pendingSaves.current[saveKey] = {
            timeoutId: setTimeout(fn, 10000),
            fn
        };
    };
    const handleDeleteWorldItem = async (itemId) => {
        if (!activeBook) return;
        try {
            await deleteWorldItemApi(activeBook.id, itemId);
            const toDelete = worldItems.find(c => c.id === itemId);
            if (toDelete) {
                setTrashItems(prev => [...prev, { ...toDelete, deletedAt: new Date(), collectionType: 'world' }]);
            }
            setWorldItems(prev => prev.filter(item => item.id !== itemId));
        } catch (error) {
            console.error("Failed to delete world item", error);
        }
    };

    const handleReorderWorldItems = async (orderedIds) => {
        if (!activeBook) return;
        // Update local state immediately
        setWorldItems(prev => {
            const updated = [...prev];
            orderedIds.forEach((id, index) => {
                const item = updated.find(i => i.id === id);
                if (item) item.orderIndex = index;
            });
            return updated;
        });
        // Persist to backend
        for (const [index, id] of orderedIds.entries()) {
            try {
                await updateWorldItemApi(activeBook.id, id, { orderIndex: index });
            } catch (error) {
                console.error('Failed to reorder world item', id, error);
            }
        }
    };
    const handleBatchUpdateChapters = async (updates) => {
        if (!activeBook || !updates.length) return;

        // Update local state once
        setChapters(prev => {
            const updated = [...prev];
            updates.forEach(upd => {
                const itemIdx = updated.findIndex(i => i.id === upd.id);
                if (itemIdx !== -1) {
                    updated[itemIdx] = { ...updated[itemIdx], ...upd.data };
                }
            });
            return updated;
        });

        // Backend updates (can be parallelized)
        await Promise.all(updates.map(upd => updateChapterApi(activeBook.id, upd.id, upd.data)));
        setLastSaved(new Date());
    };


    const handleBatchUpdateWorldItems = async (updates) => {
        if (!activeBook || !updates.length) return;
        
        // Update local state once
        setWorldItems(prev => {
            const updated = [...prev];
            updates.forEach(upd => {
                const itemIdx = updated.findIndex(i => i.id === upd.id);
                if (itemIdx !== -1) {
                    updated[itemIdx] = { ...updated[itemIdx], ...upd.data };
                }
            });
            return updated;
        });

        // Backend updates (can be parallelized)
        await Promise.all(updates.map(upd => updateWorldItemApi(activeBook.id, upd.id, upd.data)));
        setLastSaved(new Date());
    };

    // Auto-save for chapters
    const saveChapterContent = useCallback(async (content, triggerType = 'auto') => {
        if (!activeBook || !activeChapter) return;
        
        // 1. Update In-Memory State Immediately for UI responsiveness
        setActiveChapter(prev => ({ ...prev, content }));
        setChapters(prev => prev.map(ch => ch.id === activeChapter.id ? { ...ch, content } : ch));

        const saveKey = `chap_${activeChapter.id}`;
        
        // Cancel existing timer
        if (pendingSaves.current[saveKey]) {
            clearTimeout(pendingSaves.current[saveKey].timeoutId);
        }

        const bookId = activeBook.id;
        const chapId = activeChapter.id;

        // Dirty Checking: If content is same as last cloud save, only save locally
        const isDirty = lastCloudContentRef.current[chapId] !== content;
        
        if (!isDirty) {
            return;
        }

        // Adaptive Debounce: 10s default, 30s for massive chapters (>20,000 chars)
        const contentSize = content.length;
        const debounceTime = contentSize > 20000 ? 30000 : 10000;
        const safetyLimit = 30000; // 30 seconds forced save

        // Track when this specific save sequence started
        if (!pendingSaves.current[saveKey]) {
            pendingSaves.current[saveKey] = { startTime: Date.now() };
        }
        const timeElapsed = Date.now() - pendingSaves.current[saveKey].startTime;

        // Define the save function
        const fn = async (forcedFlush = false) => {
            const currentSave = pendingSaves.current[saveKey];
            if (currentSave && currentSave.timeoutId) {
                clearTimeout(currentSave.timeoutId);
            }
            delete pendingSaves.current[saveKey];
            
            const isFlushing = forcedFlush;
            try {
                const expectedToken = activeChapter.lastSyncToken;
                const newToken = await updateChapterContent(bookId, chapId, content, expectedToken, sessionId);
                
                setActiveChapter(prev => ({ ...prev, lastSyncToken: newToken }));
                setChapters(prev => prev.map(ch => ch.id === chapId ? { ...ch, lastSyncToken: newToken } : ch));
                lastCloudContentRef.current[chapId] = content;

                // Guardar punto de control local de forma automática en IndexedDB (si es flush o si hay cambio > 15%)
                const lastMajor = lastMajorBackupContentRef.current[chapId];
                const hasRealDifference = lastMajor !== undefined ? lastMajor !== content : true;
                
                if (hasRealDifference && (isFlushing || detectSignificantChange(lastMajor || '', content))) {
                    await saveLocalSnapshot(chapId, content, triggerType);
                    lastMajorBackupContentRef.current[chapId] = content;
                }

                setLastSaved(new Date());
            } catch (error) {
                console.warn("Cloud sync failed.", error);
            }
        };

        // Decide: Normal debounce or Safety Force?
        if (timeElapsed >= safetyLimit || triggerType === 'ia') {
            fn(true);
        } else {
            pendingSaves.current[saveKey].timeoutId = setTimeout(fn, debounceTime);
            pendingSaves.current[saveKey].fn = fn;
        }
    }, [activeBook, activeChapter, sanitizeHtml, sessionId]);

    const handleRestoreTrashItem = async (item) => {
        if (!activeBook) return;
        try {
            if (item.collectionType === 'chapters') {
                await updateChapterApi(activeBook.id, item.id, { deletedAt: null });
                const restored = { ...item }; delete restored.collectionType; delete restored.deletedAt;
                setChapters(prev => [...prev, restored]);
            } else if (item.collectionType === 'characters') {
                await updateCharacterApi(activeBook.id, item.id, { deletedAt: null });
                const restored = { ...item }; delete restored.collectionType; delete restored.deletedAt;
                setCharacters(prev => [...prev, restored]);
            } else if (item.collectionType === 'world') {
                await updateWorldItemApi(activeBook.id, item.id, { deletedAt: null });
                const restored = { ...item }; delete restored.collectionType; delete restored.deletedAt;
                setWorldItems(prev => [...prev, restored]);
            }
            setTrashItems(prev => prev.filter(t => t.id !== item.id));
        } catch (error) {
            console.error("Failed to restore trash item", error);
            throw error;
        }
    };

    const handlePermanentlyDeleteTrashItem = async (item) => {
        if (!activeBook) return;
        try {
            if (item.collectionType === 'chapters') {
                await permanentlyDeleteChapter(activeBook.id, item.id);
            } else if (item.collectionType === 'characters') {
                await permanentlyDeleteCharacter(activeBook.id, item.id);
            } else if (item.collectionType === 'world') {
                await permanentlyDeleteWorldItem(activeBook.id, item.id);
            }
            setTrashItems(prev => prev.filter(t => t.id !== item.id));
        } catch (error) {
            console.error("Failed to permanently delete trash item", error);
            throw error;
        }
    };

    const handleLogout = async () => {
        await flushAllSaves();
        await signOut(auth);
    };

    const handleUpdateProfile = async (data) => {
        if (!user) return;
        setProfile(prev => ({ ...prev, ...data }));
        try {
            await updateUserProfileApi(user.uid, data);
        } catch (error) {
            console.error("Failed to update profile:", error);
        }
    };

    const handleUploadCover = async (file) => {
        if (!user || !file) return null;
        try {
            const url = await uploadImageToCloudinary(file);
            return url;
        } catch (error) {
            console.error("Cloudinary upload failed:", error);
            throw error;
        }
    };

    const handleClaimLock = async () => {
        if (!activeBook || !activeChapter) return;
        await claimLockApi(activeBook.id, activeChapter.id, sessionId);
    };

    const handleReleaseLock = async () => {
        if (!activeBook || !activeChapter) return;
        await releaseLockApi(activeBook.id, activeChapter.id, sessionId);
    };

    const contextValue = {
        saveChapterContent,
        books,
        activeBook,
        chapters,
        activeChapter,
        activeWorldDoc,
        openWorldDoc,
        openCharacterDoc,
        saveWorldDocContent,
        characters,
        worldItems,
        trashItems,
        activeView,
        loading,
        setActiveView: handleSetActiveView,
        selectBook: handleSelectBook,
        createBook: handleCreateBook,
        updateBook: handleUpdateBook,
        updateBookData: handleUpdateBookData,
        deleteBook: handleDeleteBook,
        selectChapter: handleSelectChapter,
        lazyLoadChapters,
        createChapter: handleCreateChapter,
        updateChapter: handleUpdateChapter,
        saveReadingBookmark: handleSaveReadingBookmark,
        batchUpdateChapters: handleBatchUpdateChapters,
        deleteChapter: handleDeleteChapter,
        getChapterSnapshots: handleGetDocumentSnapshots,
        saveChapterSnapshot: handleSaveDocumentSnapshot,
        getDocumentSnapshots: handleGetDocumentSnapshots,
        saveDocumentSnapshot: handleSaveDocumentSnapshot,
        deleteDocumentSnapshot: handleDeleteDocumentSnapshot,
        createCharacter: handleCreateCharacter,
        updateCharacter: handleUpdateCharacter,
        deleteCharacter: handleDeleteCharacter,
        createWorldItem: handleCreateWorldItem,
        updateWorldItem: handleUpdateWorldItem,
        batchUpdateWorldItems: handleBatchUpdateWorldItems,
        deleteWorldItem: handleDeleteWorldItem,
        restoreTrashItem: handleRestoreTrashItem,
        permanentlyDeleteTrashItem: handlePermanentlyDeleteTrashItem,
        reorderChapters: handleReorderChapters,
        reorderWorldItems: handleReorderWorldItems,
        finalizeChapterCleanup,
        lastSaved,
        chapterLock,
        sessionId,
        claimLock: handleClaimLock,
        releaseLock: handleReleaseLock,
        user,
        profile,
        authLoading,
        logout: handleLogout,
        updateProfile: handleUpdateProfile,
        uploadCover: handleUploadCover,
        editor: sharedEditor,
        setSharedEditor,
        flushAllSaves,
    };

    return (
        <DataContext.Provider value={contextValue}>
            {children}
        </DataContext.Provider>
    );
};
