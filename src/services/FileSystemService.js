/**
 * FileSystemService.js
 * Maneja la interacción con la File System Access API para almacenamiento local de audios.
 */

// Utilidad simple para persistir el handle de la carpeta usando IndexedDB nativo
const DB_NAME = 'LivingWriterFS';
const STORE_NAME = 'Handles';
const DIR_HANDLE_KEY = 'premium_narrator_dir_handle';

const getDB = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const setHandle = async (key, value) => {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
};

const getHandle = async (key) => {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    return new Promise((res, rej) => { request.onsuccess = () => res(request.result); request.onerror = rej; });
};

/**
 * Solicita al usuario permiso para acceder a una carpeta local.
 */
export const requestFolderAccess = async () => {
    try {
        const handle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });
        
        // Guardar el handle en IndexedDB para persistencia entre sesiones
        await setHandle(DIR_HANDLE_KEY, handle);
        return handle;
    } catch (error) {
        if (error.name === 'AbortError') return null;
        console.error("Error accediendo a la carpeta:", error);
        throw error;
    }
};

/**
 * Intenta recuperar el handle de la carpeta guardada previamente.
 */
export const getStoredFolderHandle = async () => {
    try {
        const handle = await getHandle(DIR_HANDLE_KEY);
        if (!handle) return null;

        // Verificar si aún tenemos permiso
        const options = { mode: 'readwrite' };
        if ((await handle.queryPermission(options)) === 'granted') {
            return handle;
        }
        
        return null; // El usuario debe volver a otorgar permiso explícitamente
    } catch (error) {
        console.error("Error recuperando handle guardado:", error);
        return null;
    }
};

/**
 * Solicita de nuevo el permiso para un handle existente.
 */
export const verifyPermission = async (handle) => {
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') {
        return true;
    }
    if ((await handle.requestPermission(options)) === 'granted') {
        return true;
    }
    return false;
};

/**
 * Guarda un archivo (Blob) en la carpeta vinculada.
 * @param {FileSystemDirectoryHandle} dirHandle - El handle de la carpeta.
 * @param {string} fileName - Nombre del archivo (ej: chk_123.mp3).
 * @param {Blob} blob - El contenido del archivo.
 */
export const saveAudioFile = async (dirHandle, fileName, blob) => {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
    } catch (error) {
        console.error(`Error guardando archivo ${fileName}:`, error);
        throw error;
    }
};

/**
 * Verifica si un archivo existe en la carpeta vinculada.
 */
export const checkFileExists = async (dirHandle, fileName) => {
    try {
        await dirHandle.getFileHandle(fileName);
        return true;
    } catch (error) {
        return false;
    }
};

/**
 * Obtiene la URL de un archivo local para su reproducción.
 */
export const getLocalFileUrl = async (dirHandle, fileName) => {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        return URL.createObjectURL(file);
    } catch (error) {
        return null;
    }
};
