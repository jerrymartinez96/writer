/**
 * ForgeActionExecutor — Executes function calls from Gemini Live API tool use.
 * Maps model-generated function calls to actual DataContext mutations.
 * 
 * Each function receives args from the model + context (DataContext functions),
 * executes the mutation, and returns a result for the model to acknowledge.
 */

/**
 * Tool declarations for the Gemini Live API config.
 * These define what functions the model can call.
 */
export const FORGE_TOOL_DECLARATIONS = [
    // ─── World / Master Doc Cards ───
    {
        name: 'create_card',
        description: 'Crea una nueva tarjeta/ficha en el Master Doc (biblia del mundo). Usa esta función cuando el usuario pida crear lore, lugares, objetos, sistemas de magia, facciones, reglas, eventos o criaturas.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'Título de la tarjeta' },
                content: { type: 'STRING', description: 'Contenido en texto plano de la tarjeta' },
                folderName: { type: 'STRING', description: 'Nombre de la carpeta destino (se creará si no existe). Puede ser vacío para guardar en la raíz.' },
            },
            required: ['title', 'content'],
        }
    },
    {
        name: 'update_card',
        description: 'Actualiza el contenido de una tarjeta existente en el Master Doc. Requiere el título exacto de la tarjeta existente.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'Título exacto de la tarjeta a actualizar' },
                newTitle: { type: 'STRING', description: 'Nuevo título (opcional, solo si se quiere renombrar)' },
                content: { type: 'STRING', description: 'Nuevo contenido completo de la tarjeta' },
            },
            required: ['title'],
        }
    },
    {
        name: 'delete_card',
        description: 'Elimina una tarjeta del Master Doc. Requiere confirmación previa del usuario. Solo usa esto si el usuario lo pide explícitamente.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'Título exacto de la tarjeta a eliminar' },
            },
            required: ['title'],
        }
    },
    {
        name: 'move_card',
        description: 'Mueve una tarjeta del Master Doc a otra carpeta.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'Título exacto de la tarjeta a mover' },
                targetFolderName: { type: 'STRING', description: 'Nombre de la carpeta destino (se creará si no existe)' },
            },
            required: ['title', 'targetFolderName'],
        }
    },
    {
        name: 'create_folder',
        description: 'Crea una nueva carpeta/categoría en el Master Doc.',
        parameters: {
            type: 'OBJECT',
            properties: {
                name: { type: 'STRING', description: 'Nombre de la nueva carpeta' },
            },
            required: ['name'],
        }
    },

    // ─── Characters ───
    {
        name: 'create_character',
        description: 'Crea un nuevo personaje en la biblia del proyecto.',
        parameters: {
            type: 'OBJECT',
            properties: {
                name: { type: 'STRING', description: 'Nombre del personaje' },
                role: { type: 'STRING', description: 'Rol del personaje (ej: Protagonista, Antagonista, Secundario)' },
                description: { type: 'STRING', description: 'Descripción detallada del personaje en texto plano' },
            },
            required: ['name', 'description'],
        }
    },
    {
        name: 'update_character',
        description: 'Actualiza un personaje existente. Requiere el nombre exacto.',
        parameters: {
            type: 'OBJECT',
            properties: {
                name: { type: 'STRING', description: 'Nombre exacto del personaje a actualizar' },
                newName: { type: 'STRING', description: 'Nuevo nombre (opcional)' },
                role: { type: 'STRING', description: 'Nuevo rol (opcional)' },
                description: { type: 'STRING', description: 'Nueva descripción (opcional)' },
            },
            required: ['name'],
        }
    },
    {
        name: 'delete_character',
        description: 'Elimina un personaje. Solo si el usuario lo pide explícitamente.',
        parameters: {
            type: 'OBJECT',
            properties: {
                name: { type: 'STRING', description: 'Nombre exacto del personaje a eliminar' },
            },
            required: ['name'],
        }
    },

    // ─── Manuscript Structure ───
    {
        name: 'create_chapter',
        description: 'Crea un nuevo capítulo en el manuscrito.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'Título del capítulo' },
                volumeTitle: { type: 'STRING', description: 'Título del volumen al que pertenece (opcional). Si no existe, se crea.' },
            },
            required: ['title'],
        }
    },
    {
        name: 'create_volume',
        description: 'Crea un nuevo volumen en el manuscrito.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'Título del volumen' },
            },
            required: ['title'],
        }
    },
];

/**
 * Resolves a folder by name — finds existing or creates new
 * @param {string} folderName 
 * @param {Array} worldItems 
 * @param {Function} createWorldItem 
 * @returns {string|null} folderId
 */
async function resolveFolder(folderName, worldItems, createWorldItem) {
    if (!folderName || !folderName.trim()) return null;

    const normalizedName = folderName.trim().toLowerCase();
    const existing = worldItems.find(
        item => item.isCategory && (item.title || '').trim().toLowerCase() === normalizedName
    );

    if (existing) return existing.id;

    // Create new folder
    const newFolder = await createWorldItem({
        title: folderName.trim(),
        isCategory: true,
        parentId: null,
    });
    return newFolder?.id || null;
}

/**
 * Find a world item by title (case-insensitive)
 */
function findCardByTitle(title, worldItems) {
    if (!title) return null;
    const normalized = title.trim().toLowerCase();
    return worldItems.find(
        item => !item.isCategory && (item.title || '').trim().toLowerCase() === normalized
    ) || null;
}

/**
 * Find a character by name (case-insensitive)
 */
function findCharByName(name, characters) {
    if (!name) return null;
    const normalized = name.trim().toLowerCase();
    return characters.find(
        c => !c.isCategory && (c.name || '').trim().toLowerCase() === normalized
    ) || null;
}

/**
 * Find a chapter/volume by title
 */
function findChapterByTitle(title, chapters) {
    if (!title) return null;
    const normalized = title.trim().toLowerCase();
    return chapters.find(
        c => (c.title || '').trim().toLowerCase() === normalized
    ) || null;
}


/**
 * Execute a batch of function calls from the model
 * @param {Array} functionCalls - [{ name, id, args }]
 * @param {Object} context - DataContext functions and state
 * @param {Function} onActionExecuted - Callback per action for UI feedback
 * @returns {Array} functionResponses to send back to model
 */
export async function executeForgeActions(functionCalls, context, onActionExecuted) {
    const {
        worldItems,
        characters,
        chapters,
        createWorldItem,
        updateWorldItem,
        deleteWorldItem,
        createCharacter,
        updateCharacter,
        deleteCharacter,
        createChapter,
    } = context;

    const responses = [];

    for (const fc of functionCalls) {
        const { name, id, args } = fc;
        let result = { status: 'error', message: 'Función desconocida' };

        try {
            switch (name) {
                // ─── CARDS ───
                case 'create_card': {
                    const folderId = await resolveFolder(args.folderName, worldItems, createWorldItem);
                    const newCard = await createWorldItem({
                        title: args.title,
                        content: args.content || '',
                        parentId: folderId,
                        isCategory: false,
                        images: [],
                    });
                    result = { status: 'success', message: `Tarjeta "${args.title}" creada`, id: newCard?.id };
                    onActionExecuted?.({ type: 'create_card', title: args.title, folderId });
                    break;
                }

                case 'update_card': {
                    const card = findCardByTitle(args.title, worldItems);
                    if (!card) {
                        result = { status: 'error', message: `No se encontró tarjeta "${args.title}"` };
                    } else {
                        const updateData = {};
                        if (args.newTitle) updateData.title = args.newTitle;
                        if (args.content) updateData.content = args.content;
                        await updateWorldItem(card.id, updateData);
                        result = { status: 'success', message: `Tarjeta "${args.title}" actualizada` };
                        onActionExecuted?.({ type: 'update_card', title: args.newTitle || args.title });
                    }
                    break;
                }

                case 'delete_card': {
                    const card = findCardByTitle(args.title, worldItems);
                    if (!card) {
                        result = { status: 'error', message: `No se encontró tarjeta "${args.title}"` };
                    } else {
                        await deleteWorldItem(card.id);
                        result = { status: 'success', message: `Tarjeta "${args.title}" eliminada` };
                        onActionExecuted?.({ type: 'delete_card', title: args.title });
                    }
                    break;
                }

                case 'move_card': {
                    const card = findCardByTitle(args.title, worldItems);
                    if (!card) {
                        result = { status: 'error', message: `No se encontró tarjeta "${args.title}"` };
                    } else {
                        const targetId = await resolveFolder(args.targetFolderName, worldItems, createWorldItem);
                        await updateWorldItem(card.id, { parentId: targetId });
                        result = { status: 'success', message: `Tarjeta "${args.title}" movida a "${args.targetFolderName}"` };
                        onActionExecuted?.({ type: 'move_card', title: args.title, targetFolder: args.targetFolderName });
                    }
                    break;
                }

                case 'create_folder': {
                    const newFolder = await createWorldItem({
                        title: args.name,
                        isCategory: true,
                        parentId: null,
                    });
                    result = { status: 'success', message: `Carpeta "${args.name}" creada`, id: newFolder?.id };
                    onActionExecuted?.({ type: 'create_folder', title: args.name });
                    break;
                }

                // ─── CHARACTERS ───
                case 'create_character': {
                    const newChar = await createCharacter({
                        name: args.name,
                        role: args.role || '',
                        description: args.description || '',
                        parentId: null,
                        isCategory: false,
                        images: [],
                    });
                    result = { status: 'success', message: `Personaje "${args.name}" creado`, id: newChar?.id };
                    onActionExecuted?.({ type: 'create_character', name: args.name });
                    break;
                }

                case 'update_character': {
                    const char = findCharByName(args.name, characters);
                    if (!char) {
                        result = { status: 'error', message: `No se encontró personaje "${args.name}"` };
                    } else {
                        const updateData = {};
                        if (args.newName) updateData.name = args.newName;
                        if (args.role) updateData.role = args.role;
                        if (args.description) updateData.description = args.description;
                        await updateCharacter(char.id, updateData);
                        result = { status: 'success', message: `Personaje "${args.name}" actualizado` };
                        onActionExecuted?.({ type: 'update_character', name: args.newName || args.name });
                    }
                    break;
                }

                case 'delete_character': {
                    const char = findCharByName(args.name, characters);
                    if (!char) {
                        result = { status: 'error', message: `No se encontró personaje "${args.name}"` };
                    } else {
                        await deleteCharacter(char.id);
                        result = { status: 'success', message: `Personaje "${args.name}" eliminado` };
                        onActionExecuted?.({ type: 'delete_character', name: args.name });
                    }
                    break;
                }

                // ─── MANUSCRIPT ───
                case 'create_chapter': {
                    let parentId = null;
                    if (args.volumeTitle) {
                        const vol = findChapterByTitle(args.volumeTitle, chapters);
                        if (vol) {
                            parentId = vol.id;
                        } else {
                            // Auto-create volume
                            const newVol = await createChapter({ title: args.volumeTitle, isVolume: true, parentId: null });
                            parentId = newVol?.id || null;
                            onActionExecuted?.({ type: 'create_volume', title: args.volumeTitle });
                        }
                    }
                    const newChap = await createChapter({ title: args.title, parentId, isVolume: false }, { preventRedirect: true });
                    result = { status: 'success', message: `Capítulo "${args.title}" creado`, id: newChap?.id };
                    onActionExecuted?.({ type: 'create_chapter', title: args.title });
                    break;
                }

                case 'create_volume': {
                    const newVol = await createChapter({ title: args.title, isVolume: true, parentId: null });
                    result = { status: 'success', message: `Volumen "${args.title}" creado`, id: newVol?.id };
                    onActionExecuted?.({ type: 'create_volume', title: args.title });
                    break;
                }

                default:
                    result = { status: 'error', message: `Función "${name}" no reconocida` };
            }
        } catch (err) {
            console.error(`[ForgeAction] Error executing ${name}:`, err);
            result = { status: 'error', message: err.message };
        }

        responses.push({
            name,
            id,
            response: { result }
        });
    }

    return responses;
}

export default { FORGE_TOOL_DECLARATIONS, executeForgeActions };
