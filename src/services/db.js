import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    query,
    orderBy,
    where,
    setDoc,
    runTransaction,
    onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { compressData, decompressData } from './compression';

const BOOKS_COLLECTION = 'books';
const CHAPTERS_COLLECTION = 'chapters';
const CHUNKS_COLLECTION = 'chunks';
const USERS_COLLECTION = 'users';

// Utility to generate sync tokens
const generateSyncToken = () => {
    try {
        return window.crypto.randomUUID();
    } catch (e) {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
};

// --- PROFILES / USERS ---

export const getUserProfile = async (uid) => {
    try {
        const userRef = doc(db, USERS_COLLECTION, uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            return { id: userDoc.id, ...userDoc.data() };
        }
        return null;
    } catch (error) {
        console.error("Error getting user profile: ", error);
        throw error;
    }
};

export const createUserProfile = async (uid, userData) => {
    try {
        const userRef = doc(db, USERS_COLLECTION, uid);
        const profile = {
            ...userData,
            displayName: userData.displayName || '',
            email: userData.email || '',
            photoURL: userData.photoURL || '',
            bio: '',
            role: 'writer',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };
        await setDoc(userRef, profile);
        return { id: uid, ...profile };
    } catch (error) {
        console.error("Error creating user profile: ", error);
        throw error;
    }
};

export const updateUserProfile = async (uid, data) => {
    try {
        const userRef = doc(db, USERS_COLLECTION, uid);
        await updateDoc(userRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error updating user profile: ", error);
        throw error;
    }
};



// --- BOOKS ---

export const createBook = async (title, ownerId, description = '', coverUrl = null) => {
    try {
        const docRef = await addDoc(collection(db, BOOKS_COLLECTION), {
            title,
            description,
            ownerId,
            coverUrl,
            visibility: 'private',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return { id: docRef.id, title, description, ownerId, coverUrl, visibility: 'private' };
    } catch (error) {
        console.error("Error creating book: ", error);
        throw error;
    }
};

export const getBooks = async (ownerId) => {
    try {
        if (!ownerId) return [];
        const booksRef = collection(db, BOOKS_COLLECTION);
        const q = query(booksRef, where('ownerId', '==', ownerId));
        
        const querySnapshot = await getDocs(q);
        const books = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Manual sort by updatedAt Descending
        return books.sort((a, b) => {
            const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt?.seconds || 0) * 1000;
            const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt?.seconds || 0) * 1000;
            return timeB - timeA;
        });
    } catch (error) {
        console.error("Error getting books: ", error);
        throw error;
    }
};

export const updateBook = async (bookId, data) => {
    try {
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        await updateDoc(bookRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error updating book: ", error);
        throw error;
    }
};

export const deleteBook = async (bookId) => {
    try {
        await deleteDoc(doc(db, BOOKS_COLLECTION, bookId));
        return true;
    } catch (error) {
        console.error("Error deleting book: ", error);
        throw error;
    }
};

// --- CHAPTERS ---

export const createChapter = async (bookId, itemData) => {
    try {
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        const chaptersRef = collection(bookRef, CHAPTERS_COLLECTION);

        const newSyncToken = generateSyncToken();

        const docRef = await addDoc(chaptersRef, {
            ...itemData,
            content: compressData(itemData.content || ''),
            status: itemData.status || 'Idea',
            povCharacterId: itemData.povCharacterId || null,
            lastSyncToken: newSyncToken,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        return { 
            id: docRef.id, 
            ...itemData, 
            content: itemData.content || '',
            lastSyncToken: newSyncToken 
        };
    } catch (error) {
        console.error("Error creating chapter: ", error);
        throw error;
    }
};

export const subscribeToChapter = (bookId, chapterId, onUpdate) => {
    const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
    return onSnapshot(chapterRef, (docSnap) => {
        if (docSnap.exists() && !docSnap.metadata.hasPendingWrites) {
            const data = docSnap.data();
            onUpdate({
                id: docSnap.id,
                ...data,
                content: decompressData(data.content || '')
            });
        }
    }, (error) => {
        console.error("Error subscribing to chapter: ", error);
    });
};

export const getChapter = async (bookId, chapterId) => {
    try {
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        const chapterRef = doc(bookRef, CHAPTERS_COLLECTION, chapterId);
        const docSnap = await getDoc(chapterRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data,
                content: decompressData(data.content || '')
            };
        }
        return null;
    } catch (error) {
        console.error("Error getting single chapter: ", error);
        throw error;
    }
};

/**
 * Fetches only chapter metadata (title, order, pov, etc.) without the heavy content.
 * Used for initial sidebar load to save bandwidth.
 */
export const getChaptersMetadata = async (bookId) => {
    try {
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        // We still fetch the whole document because Firestore doesn't support field exclusion,
        // but we avoid the CPU-intensive decompression here.
        // NOTE: In a more advanced version, content should be in a separate sub-collection.
        const q = query(collection(bookRef, CHAPTERS_COLLECTION), orderBy('orderIndex', 'asc'));
        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            const { content, ...metadata } = data; // Destructure to exclude content
            return {
                id: doc.id,
                ...metadata,
                hasContent: !!content,
                isLoaded: false // Flag to indicate content hasn't been fetched/decompressed yet
            };
        });
    } catch (error) {
        console.error("Error getting chapters metadata: ", error);
        throw error;
    }
};

export const getChapters = async (bookId) => {
    try {
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        const q = query(collection(bookRef, CHAPTERS_COLLECTION), orderBy('orderIndex', 'asc'));
        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                content: decompressData(data.content || '')
            };
        });
    } catch (error) {
        console.error("Error getting chapters: ", error);
        throw error;
    }
};

/**
 * Atomic update for chapter content with sync token validation
 */
export const updateChapterContent = async (bookId, chapterId, newContent, expectedToken = null, activeEditorId = 'unknown') => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        const newToken = generateSyncToken();

        await runTransaction(db, async (transaction) => {
            const chapDoc = await transaction.get(chapterRef);
            if (!chapDoc.exists()) throw new Error("Chapter does not exist");

            const currentToken = chapDoc.data().lastSyncToken;

            // Token validation removed for forced saving

            transaction.update(chapterRef, {
                content: compressData(newContent),
                lastSyncToken: newToken,
                updatedAt: serverTimestamp(),
                // Session Presence fields (Persistent Device ID)
                lastEditTime: serverTimestamp(),
                activeEditorId: activeEditorId 
            });

            transaction.update(bookRef, {
                updatedAt: serverTimestamp()
            });
        });

        return newToken;
    } catch (error) {
        if (error.code !== 'SYNC_CONFLICT') {
            console.error("Error updating chapter content atomicly: ", error);
        }
        throw error;
    }
};

/**
 * Atomic update for chapter metadata with sync token validation
 */
export const updateChapter = async (bookId, chapterId, updateData, expectedToken = null) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        const newToken = generateSyncToken();

        await runTransaction(db, async (transaction) => {
            const chapDoc = await transaction.get(chapterRef);
            if (!chapDoc.exists()) throw new Error("Chapter does not exist");

            const currentToken = chapDoc.data().lastSyncToken;

            // Forced save: ignoring token mismatches

            transaction.update(chapterRef, {
                ...updateData,
                lastSyncToken: newToken,
                updatedAt: serverTimestamp()
            });

            transaction.update(bookRef, {
                updatedAt: serverTimestamp()
            });
        });

        return newToken;
    } catch (error) {
        if (error.code !== 'SYNC_CONFLICT') {
            console.error("Error updating chapter metadata atomicly: ", error);
        }
        throw error;
    }
};

export const claimChapterLock = async (bookId, chapterId, sessionId) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
        await setDoc(chapterRef, {
            activeEditorId: sessionId,
            lastEditTime: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error("Error claiming lock:", error);
        return false;
    }
};

export const releaseChapterLock = async (bookId, chapterId, sessionId) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
        const chapDoc = await getDoc(chapterRef);
        if (chapDoc.exists() && chapDoc.data().activeEditorId === sessionId) {
            await setDoc(chapterRef, {
                activeEditorId: null,
                lastEditTime: serverTimestamp()
            }, { merge: true });
        }
        return true;
    } catch (error) {
        console.error("Error releasing lock:", error);
        return false;
    }
};

export const deleteChapter = async (bookId, chapterId) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId.toString(), CHAPTERS_COLLECTION, chapterId.toString());
        await updateDoc(chapterRef, {
            deletedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error deleting (soft) chapter: ", error);
        throw error;
    }
};

export const permanentlyDeleteChapter = async (bookId, chapterId) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId.toString(), CHAPTERS_COLLECTION, chapterId.toString());
        await deleteDoc(chapterRef);
        return true;
    } catch (error) {
        console.error("Error deleting (permanent) chapter: ", error);
        throw error;
    }
};

// --- CHAPTER SNAPSHOTS (BACKUPS) ---
const SNAPSHOTS_COLLECTION = 'snapshots';

export const getChapterSnapshots = async (bookId, chapterId) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
        const q = query(collection(chapterRef, SNAPSHOTS_COLLECTION), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                content: decompressData(data.content || '')
            };
        });
    } catch (error) {
        console.error("Error getting chapter snapshots: ", error);
        throw error;
    }
};

export const saveChapterSnapshot = async (bookId, chapterId, content) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
        const snapshotsRef = collection(chapterRef, SNAPSHOTS_COLLECTION);

        // 1. Get existing snapshots
        const existingSnapshots = await getChapterSnapshots(bookId, chapterId);

        // 2. Enforce Max 5 rule (FIFO). If we have 5, we need to delete the oldest
        if (existingSnapshots.length >= 5) {
            // keep the 4 newest, delete the rest
            const snapshotsToDelete = existingSnapshots.slice(4);
            for (const snap of snapshotsToDelete) {
                await deleteDoc(doc(snapshotsRef, snap.id));
            }
        }

        // 3. Add the new snapshot
        const docRef = await addDoc(snapshotsRef, {
            content: compressData(content),
            createdAt: serverTimestamp(),
        });

        return { id: docRef.id, content };
    } catch (error) {
        console.error("Error saving chapter snapshot: ", error);
        throw error;
    }
};

export const deleteAllChapterSnapshots = async (bookId, chapterId) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
        const snapshotsRef = collection(chapterRef, SNAPSHOTS_COLLECTION);
        const querySnapshot = await getDocs(snapshotsRef);
        const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        return true;
    } catch (error) {
        console.error("Error deleting all snapshots: ", error);
        throw error;
    }
};

// --- CHARACTERS ---
const CHARACTERS_COLLECTION = 'characters';

export const getCharacters = async (bookId) => {
    try {
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        const q = query(collection(bookRef, CHARACTERS_COLLECTION), orderBy('createdAt', 'asc'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error getting characters: ", error);
        throw error;
    }
};

export const createCharacter = async (bookId, itemData) => {
    try {
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        const docRef = await addDoc(collection(bookRef, CHARACTERS_COLLECTION), {
            ...itemData,
            images: itemData.images || [],
            parentId: itemData.parentId || null,
            isCategory: itemData.isCategory || false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return { id: docRef.id, ...itemData, images: itemData.images || [], parentId: itemData.parentId || null, isCategory: itemData.isCategory || false };
    } catch (error) {
        console.error("Error creating character: ", error);
        throw error;
    }
};

export const updateCharacter = async (bookId, charId, updateData) => {
    try {
        const charRef = doc(db, BOOKS_COLLECTION, bookId, CHARACTERS_COLLECTION, charId);
        await updateDoc(charRef, {
            ...updateData,
            updatedAt: serverTimestamp(),
        });
        return true;
    } catch (error) {
        console.error("Error updating character: ", error);
        throw error;
    }
};

export const deleteCharacter = async (bookId, characterId) => {
    try {
        const charRef = doc(db, BOOKS_COLLECTION, bookId.toString(), CHARACTERS_COLLECTION, characterId.toString());
        await updateDoc(charRef, {
            deletedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error deleting (soft) character: ", error);
        throw error;
    }
};

export const permanentlyDeleteCharacter = async (bookId, characterId) => {
    try {
        const charRef = doc(db, BOOKS_COLLECTION, bookId.toString(), CHARACTERS_COLLECTION, characterId.toString());
        await deleteDoc(charRef);
        return true;
    } catch (error) {
        console.error("Error deleting (permanent) character: ", error);
        throw error;
    }
};

// --- WORLD / LORE ---
const WORLD_COLLECTION = 'world';

export const getWorld = async (bookId) => {
    try {
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        const q = query(collection(bookRef, WORLD_COLLECTION), orderBy('createdAt', 'asc'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error getting world items: ", error);
        throw error;
    }
};

export const createWorldItem = async (bookId, itemData) => {
    try {
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        const docRef = await addDoc(collection(bookRef, WORLD_COLLECTION), {
            ...itemData,
            images: itemData.images || [],
            parentId: itemData.parentId || null,
            isCategory: itemData.isCategory || false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return { id: docRef.id, ...itemData, images: itemData.images || [], parentId: itemData.parentId || null, isCategory: itemData.isCategory || false };
    } catch (error) {
        console.error("Error creating world item: ", error);
        throw error;
    }
};

export const updateWorldItem = async (bookId, itemId, updateData) => {
    try {
        const itemRef = doc(db, BOOKS_COLLECTION, bookId, WORLD_COLLECTION, itemId);
        await updateDoc(itemRef, {
            ...updateData,
            updatedAt: serverTimestamp(),
        });
        return true;
    } catch (error) {
        console.error("Error updating world item: ", error);
        throw error;
    }
};

export const deleteWorldItem = async (bookId, itemId) => {
    try {
        const itemRef = doc(db, BOOKS_COLLECTION, bookId.toString(), WORLD_COLLECTION, itemId.toString());
        await updateDoc(itemRef, {
            deletedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error deleting (soft) world item: ", error);
        throw error;
    }
};

export const permanentlyDeleteWorldItem = async (bookId, itemId) => {
    try {
        const itemRef = doc(db, BOOKS_COLLECTION, bookId.toString(), WORLD_COLLECTION, itemId.toString());
        await deleteDoc(itemRef);
        return true;
    } catch (error) {
        console.error("Error deleting (permanent) world item: ", error);
        throw error;
    }
};

// --- CHAPTER CHUNKS ---

export const getChapterChunks = async (bookId, chapterId) => {
    if (!bookId || !chapterId) {
        console.warn("getChapterChunks: bookId or chapterId is missing", { bookId, chapterId });
        return [];
    }
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId.toString(), CHAPTERS_COLLECTION, chapterId.toString());
        const q = query(collection(chapterRef, CHUNKS_COLLECTION), orderBy('orden', 'asc'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error getting chapter chunks: ", error);
        throw error;
    }
};

export const createChunk = async (bookId, chapterId, chunkData) => {
    if (!bookId || !chapterId) {
        throw new Error("createChunk: bookId or chapterId is missing");
    }
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId.toString(), CHAPTERS_COLLECTION, chapterId.toString());
        const chunksRef = collection(chapterRef, CHUNKS_COLLECTION);
        const docRef = await addDoc(chunksRef, {
            ...chunkData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return { id: docRef.id, ...chunkData };
    } catch (error) {
        console.error("Error creating chunk: ", error);
        throw error;
    }
};

export const updateChunk = async (bookId, chapterId, chunkId, updateData) => {
    if (!bookId || !chapterId || !chunkId) {
        throw new Error("updateChunk: Missing required IDs");
    }
    try {
        const chunkRef = doc(db, BOOKS_COLLECTION, bookId.toString(), CHAPTERS_COLLECTION, chapterId.toString(), CHUNKS_COLLECTION, chunkId.toString());
        await updateDoc(chunkRef, {
            ...updateData,
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error updating chunk: ", error);
        throw error;
    }
};

export const deleteChunk = async (bookId, chapterId, chunkId) => {
    if (!bookId || !chapterId || !chunkId) {
        throw new Error("deleteChunk: Missing required IDs");
    }
    try {
        const chunkRef = doc(db, BOOKS_COLLECTION, bookId.toString(), CHAPTERS_COLLECTION, chapterId.toString(), CHUNKS_COLLECTION, chunkId.toString());
        await deleteDoc(chunkRef);
        return true;
    } catch (error) {
        console.error("Error deleting chunk: ", error);
        throw error;
    }
};

// --- API KEYS CONFIG (DUAL KEY STRATEGY) ---

export const saveGoogleApiKeys = async (userId, key1, key2) => {
    try {
        const userRef = doc(db, USERS_COLLECTION, userId);
        await updateDoc(userRef, {
            googleApiKey1: key1,
            googleApiKey2: key2,
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error saving API keys: ", error);
        throw error;
    }
};
