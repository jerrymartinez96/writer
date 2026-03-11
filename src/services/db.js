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
    setDoc
} from 'firebase/firestore';
import { db } from '../firebase';

const BOOKS_COLLECTION = 'books';
const CHAPTERS_COLLECTION = 'chapters';
const USERS_COLLECTION = 'users';

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

        const docRef = await addDoc(chaptersRef, {
            ...itemData,
            content: itemData.content || '', // Empty initial content
            status: itemData.status || 'Idea',
            povCharacterId: itemData.povCharacterId || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        return { id: docRef.id, ...itemData, content: itemData.content || '' };
    } catch (error) {
        console.error("Error creating chapter: ", error);
        throw error;
    }
};

export const getChapters = async (bookId) => {
    try {
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        const q = query(collection(bookRef, CHAPTERS_COLLECTION), orderBy('orderIndex', 'asc'));
        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error getting chapters: ", error);
        throw error;
    }
};

export const updateChapterContent = async (bookId, chapterId, newContent) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
        await updateDoc(chapterRef, {
            content: newContent,
            updatedAt: serverTimestamp()
        });

        // Also update the book's updatedAt timestamp
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        await updateDoc(bookRef, {
            updatedAt: serverTimestamp()
        });

        return true;
    } catch (error) {
        console.error("Error updating chapter content: ", error);
        throw error;
    }
};

export const updateChapter = async (bookId, chapterId, updateData) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
        await updateDoc(chapterRef, {
            ...updateData,
            updatedAt: serverTimestamp()
        });

        // Also update the book's updatedAt timestamp
        const bookRef = doc(db, BOOKS_COLLECTION, bookId);
        await updateDoc(bookRef, {
            updatedAt: serverTimestamp()
        });

        return true;
    } catch (error) {
        console.error("Error updating chapter metadata: ", error);
        throw error;
    }
};

export const deleteChapter = async (bookId, chapterId) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
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

// --- CHAPTER SNAPSHOTS (BACKUPS) ---
const SNAPSHOTS_COLLECTION = 'snapshots';

export const getChapterSnapshots = async (bookId, chapterId) => {
    try {
        const chapterRef = doc(db, BOOKS_COLLECTION, bookId, CHAPTERS_COLLECTION, chapterId);
        const q = query(collection(chapterRef, SNAPSHOTS_COLLECTION), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
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
            content,
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
        const charRef = doc(db, BOOKS_COLLECTION, bookId, CHARACTERS_COLLECTION, characterId);
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
        const itemRef = doc(db, BOOKS_COLLECTION, bookId, WORLD_COLLECTION, itemId);
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
