import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
    getBooks,
    createBook as createBookApi,
    updateBook as updateBookApi,
    deleteBook as deleteBookApi,
    getChapters,
    createChapter as createChapterApi,
    updateChapter as updateChapterApi,
    deleteChapter as deleteChapterApi,
    updateChapterContent,
    getCharacters,
    createCharacter as createCharacterApi,
    updateCharacter as updateCharacterApi,
    deleteCharacter as deleteCharacterApi,
    getWorld,
    createWorldItem as createWorldItemApi,
    updateWorldItem as updateWorldItemApi,
    deleteWorldItem as deleteWorldItemApi,
    getChapterSnapshots as getChapterSnapshotsApi,
    saveChapterSnapshot as saveChapterSnapshotApi,
    deleteAllChapterSnapshots as deleteAllSnapshotsApi,
    getUserProfile,
    createUserProfile,
    updateUserProfile as updateUserProfileApi
} from '../services/db';
import { uploadImageToCloudinary } from '../services/cloudinary';
import { saveLightweightBackup, getLightweightBackups, clearChapterLightweightBackups } from '../services/localDb';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const DataContext = createContext();

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
    const [books, setBooks] = useState([]);
    const pendingSaves = useRef({});
    const [activeBook, setActiveBook] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [activeChapter, setActiveChapter] = useState(null);
    const [characters, setCharacters] = useState([]);
    const [worldItems, setWorldItems] = useState([]);
    const [trashItems, setTrashItems] = useState([]);
    const [activeView, setActiveView] = useState('editor'); // 'editor', 'characters', 'world', 'settings'
    const [promptStudioPreload, setPromptStudioPreload] = useState(null);
    const [loading, setLoading] = useState(true);
    const lastMajorBackupContentRef = useRef({}); // { chapterId: string }
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Online/Offline listener
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
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
                try { await save.fn(); }
                catch (error) { console.error("Error flushing save", error); }
            }
        }
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
                // Removed auto-select so user lands on LibraryView
            } catch (error) {
                console.error("Failed to load books from Firestore", error);
            } finally {
                setLoading(false);
            }
        };
        loadBooks();
    }, [user]);

    const handleSelectBook = async (book) => {
        await flushAllSaves();
        setActiveBook(book);
        
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
            // Load Chapters
            const allChapters = await getChapters(book.id);
            const fetchedChapters = allChapters.filter(c => !c.deletedAt);
            const trashChaps = allChapters.filter(c => c.deletedAt).map(c => ({ ...c, collectionType: 'chapters' }));
            setChapters(fetchedChapters);
            
            if (fetchedChapters.length > 0) {
                const savedChapterId = localStorage.getItem(`lastChapter_${book.id}`);
                const savedChapter = savedChapterId ? fetchedChapters.find(c => c.id === savedChapterId) : null;
                setActiveChapter(savedChapter || fetchedChapters[0]);
            } else {
                setActiveChapter(null);
            }

            // Load Characters
            const allCharacters = await getCharacters(book.id);
            const fetchedCharacters = allCharacters.filter(c => !c.deletedAt);
            const trashChars = allCharacters.filter(c => c.deletedAt).map(c => ({ ...c, collectionType: 'characters' }));
            setCharacters(fetchedCharacters);

            // Load World Items
            const allWorldItems = await getWorld(book.id);
            const fetchedWorldItems = allWorldItems.filter(i => !i.deletedAt);
            const trashWorlds = allWorldItems.filter(i => i.deletedAt).map(c => ({ ...c, collectionType: 'world' }));
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
        if (!confirm("¿Seguro que quieres eliminar todo el libro? Esta acción no se puede deshacer.")) return;
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

    const handleGetChapterSnapshots = async (chapterId) => {
        if (!activeBook) return [];
        try {
            return await getChapterSnapshotsApi(activeBook.id, chapterId);
        } catch (error) {
            console.error("Failed to get chapter snapshots", error);
            return [];
        }
    };

    const handleSaveChapterSnapshot = async (chapterId, content) => {
        if (!activeBook) return null;
        try {
            return await saveChapterSnapshotApi(activeBook.id, chapterId, content);
        } catch (error) {
            console.error("Failed to save chapter snapshot", error);
            return null;
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

    const handleUpdateChapter = async (chapterId, updateData) => {
        if (!activeBook) return;
        setChapters(prev => prev.map(c => c.id === chapterId ? { ...c, ...updateData } : c));
        if (activeChapter && activeChapter.id === chapterId) {
            setActiveChapter(prev => ({ ...prev, ...updateData }));
        }

        const saveKey = `chap_meta_${chapterId}`;
        if (pendingSaves.current[saveKey]) {
            clearTimeout(pendingSaves.current[saveKey].timeoutId);
        }

        const fn = async () => {
            delete pendingSaves.current[saveKey];
            try {
                await updateChapterApi(activeBook.id, chapterId, updateData);
            } catch (error) {
                console.error("Failed to update chapter", error);
            }
        };

        pendingSaves.current[saveKey] = {
            timeoutId: setTimeout(fn, 10000),
            fn
        };
    };

    const finalizeChapterCleanup = async (chapterId) => {
        if (!activeBook) return;
        try {
            await clearChapterLightweightBackups(chapterId);
            await deleteAllSnapshotsApi(activeBook.id, chapterId);
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

    const [syncConflict, setSyncConflict] = useState(null); // { local, cloud, chapterId }

    const resolveSyncConflict = async (winner) => {
        if (!syncConflict) return;
        const { local, chapterId } = syncConflict;
        
        if (winner === 'local') {
            // Update cloud with local content
            const content = local.content;
            setActiveChapter(prev => ({ ...prev, content }));
            setChapters(prev => prev.map(ch => ch.id === chapterId ? { ...ch, content } : ch));
            await updateChapterContent(activeBook.id, chapterId, content);
        }
        // If winner is 'cloud', we don't need to do anything as cloud is already loaded 
        // in activeChapter (unless we want to clear local, but we keep it for safety)
        
        setSyncConflict(null);
    };

    const handleSelectChapter = async (chapter) => {
        await flushAllSaves();
        
        if (chapter && isOnline) {
            // Check for potential sync conflict
            try {
                const localBackups = await getLightweightBackups(chapter.id);
                if (localBackups.length > 0) {
                    const latestLocal = localBackups[0];
                    const cloudTimestamp = chapter.updatedAt?.toDate ? chapter.updatedAt.toDate().getTime() : (chapter.updatedAt || 0);
                    
                    // If local is newer by more than 2 seconds (to avoid tiny clock skews)
                    if (latestLocal.createdAt > (cloudTimestamp + 2000)) {
                        // Check if content is actually different
                        if (latestLocal.content !== chapter.content) {
                            setSyncConflict({
                                local: latestLocal,
                                cloud: chapter,
                                chapterId: chapter.id
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("Conflict detection failed", err);
            }
        }

        setActiveChapter(chapter);
        setActiveView('editor');
        if (activeBook && chapter) {
            localStorage.setItem(`lastChapter_${activeBook.id}`, chapter.id);
        }
    }

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

    const handleUpdateCharacter = async (charId, updateData) => {
        if (!activeBook) return;
        setCharacters(prev => prev.map(c => c.id === charId ? { ...c, ...updateData } : c));

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

    const handleUpdateWorldItem = async (itemId, updateData) => {
        if (!activeBook) return;
        setWorldItems(prev => prev.map(item => item.id === itemId ? { ...item, ...updateData } : item));

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

    // Auto-save for chapters
    const saveChapterContent = useCallback(async (content) => {
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

        // Detection logic for significant change (>15%)
        const detectSignificantChange = (oldHtml, newHtml) => {
            if (!oldHtml) return false;
            const oldLen = oldHtml.replace(/<[^>]*>/g, '').length;
            const newLen = newHtml.replace(/<[^>]*>/g, '').length;
            if (oldLen === 0) return false;
            const diffPercent = Math.abs(oldLen - newLen) / oldLen;
            return diffPercent > 0.15;
        };

        // Define the save function (History + Cloud)
        const fn = async () => {
            delete pendingSaves.current[saveKey];
            
            // 1. Save to Local History (Always attempt, very fast)
            try {
                await saveLightweightBackup(chapId, content);
            } catch (err) {
                console.error("Local backup failed", err);
            }

            // 2. Save to Cloud (Main state)
            try {
                await updateChapterContent(bookId, chapId, content);
                
                // 3. Significant change detection (>15%)
                const lastMajor = lastMajorBackupContentRef.current[chapId] || activeChapter.content || '';
                if (detectSignificantChange(lastMajor, content)) {
                    console.log(`[Backup] Significant change detected (>15%). Triggering major backup.`);
                    await saveChapterSnapshotApi(bookId, chapId, content);
                    lastMajorBackupContentRef.current[chapId] = content;
                }

                console.log(`[Sync] Cloud save successful for chapter ${chapId}`);
            } catch (error) {
                console.warn("Cloud sync failed (possibly offline). Content is safe in Local History.", error);
            }
        };

        // 2. Set new debounce timer (10s)
        pendingSaves.current[saveKey] = {
            timeoutId: setTimeout(fn, 10000),
            fn
        };
    }, [activeBook, activeChapter]);

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

    const contextValue = {
        saveChapterContent,
        books,
        activeBook,
        chapters,
        activeChapter,
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
        createChapter: handleCreateChapter,
        updateChapter: handleUpdateChapter,
        deleteChapter: handleDeleteChapter,
        getChapterSnapshots: handleGetChapterSnapshots,
        saveChapterSnapshot: handleSaveChapterSnapshot,
        createCharacter: handleCreateCharacter,
        updateCharacter: handleUpdateCharacter,
        deleteCharacter: handleDeleteCharacter,
        createWorldItem: handleCreateWorldItem,
        updateWorldItem: handleUpdateWorldItem,
        deleteWorldItem: handleDeleteWorldItem,
        restoreTrashItem: handleRestoreTrashItem,
        promptStudioPreload,
        setPromptStudioPreload,
        reorderChapters: handleReorderChapters,
        getLightweightBackups,
        clearChapterLightweightBackups,
        isOnline,
        syncConflict,
        resolveSyncConflict,
        finalizeChapterCleanup,
        user,
        profile,
        authLoading,
        logout: handleLogout,
        updateProfile: handleUpdateProfile,
        uploadCover: handleUploadCover
    };

    return (
        <DataContext.Provider value={contextValue}>
            {children}
        </DataContext.Provider>
    );
};
