/**
 * domainUtils.js
 * Capa 1 — Resolutores de Destinos e IDs del Dominio de Novela
 */

/**
 * IDs de sistema para Master Doc
 */
export const SYSTEM_WORLD_ITEM_IDS = ['system_personajes', 'system_estructura', 'system_core'];

/**
 * Títulos amigables para Master Doc
 */
export const SYSTEM_WORLD_ITEM_LABELS = {
    system_personajes: 'Personajes',
    system_estructura: 'Estructura',
    system_core: 'Información General',
};

/**
 * Resuelve un documento de destino a partir de un texto (ej. "Personajes" o el título de un capítulo)
 */
export const resolveTargetDoc = (targetStr, chapters = [], worldItems = [], characters = []) => {
    if (!targetStr || typeof targetStr !== 'string') {
        return null;
    }

    // 0. Verificar primero coincidencia por ID exacta
    const chById = (chapters || []).find(c => c.id === targetStr);
    if (chById) {
        return { docType: 'chapter', docId: chById.id, title: chById.title };
    }
    const itemById = (worldItems || []).find(w => w.id === targetStr);
    if (itemById) {
        return { docType: 'worldItem', docId: itemById.id, title: itemById.title };
    }
    const charById = (characters || []).find(c => c.id === targetStr);
    if (charById) {
        return { docType: 'character', docId: charById.id, title: charById.name };
    }

    const norm = targetStr.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // 1. Verificar primero secciones de sistema (IDs exactos)
    if (norm === 'personajes' || norm === 'system_personajes') {
        return { docType: 'worldItem', docId: 'system_personajes', title: 'Personajes' };
    }
    if (norm === 'estructura' || norm === 'system_estructura' || norm.includes('estructura de capitulo') || norm.includes('estructura de capitulos')) {
        return { docType: 'worldItem', docId: 'system_estructura', title: 'Estructura' };
    }
    if (norm === 'informacion general' || norm === 'system_core' || norm === 'core') {
        return { docType: 'worldItem', docId: 'system_core', title: 'Información General' };
    }

    // 2a. Personajes — coincidencia EXACTA primero
    for (const char of characters) {
        if (char.name) {
            const charNorm = char.name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (charNorm === norm) {
                return { docType: 'character', docId: char.id, title: char.name };
            }
        }
    }

    // 2b. Personajes — coincidencia parcial como fallback
    for (const char of characters) {
        if (char.name) {
            const charNorm = char.name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (norm.includes(charNorm) || charNorm.includes(norm)) {
                return { docType: 'character', docId: char.id, title: char.name };
            }
        }
    }

    // 3a. Master Doc — coincidencia EXACTA primero
    for (const item of worldItems) {
        if (item.title) {
            const itemNorm = item.title.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (itemNorm === norm) {
                return { docType: 'worldItem', docId: item.id, title: item.title };
            }
        }
    }

    // 3b. Master Doc — coincidencia parcial como fallback
    for (const item of worldItems) {
        if (item.title) {
            const itemNorm = item.title.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (norm.includes(itemNorm) || itemNorm.includes(norm)) {
                return { docType: 'worldItem', docId: item.id, title: item.title };
            }
        }
    }

    // 4a. Capítulos — coincidencia EXACTA primero
    for (const ch of chapters) {
        if (ch.title && !ch.isVolume) {
            const chNorm = ch.title.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (chNorm === norm) {
                return { docType: 'chapter', docId: ch.id, title: ch.title };
            }
        }
    }

    // 4b. Capítulos — coincidencia parcial como fallback
    for (const ch of chapters) {
        if (ch.title && !ch.isVolume) {
            const chNorm = ch.title.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (norm.includes(chNorm) || chNorm.includes(norm)) {
                return { docType: 'chapter', docId: ch.id, title: ch.title };
            }
        }
    }

    return null;
};

/**
 * Encuentra el capítulo o world item destino por ID
 */
export const findDestinationDoc = (destinationDoc, chapters, worldItems, characters = []) => {
    if (!destinationDoc || destinationDoc.mode === 'auto' || destinationDoc.mode === 'new') {
        return null;
    }

    if (destinationDoc.docType === 'chapter') {
        return chapters.find(c => c.id === destinationDoc.docId) || null;
    }

    if (destinationDoc.docType === 'worldItem') {
        return worldItems.find(w => w.id === destinationDoc.docId) || null;
    }

    if (destinationDoc.docType === 'character') {
        return characters.find(c => c.id === destinationDoc.docId) || null;
    }

    return null;
};
