export const cleanText = (html) => {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n') // Convert BR to newlines
        .replace(/<\/p>/gi, '\n\n')    // Paragraphs to double newlines
        .replace(/<[^>]*>?/gm, '')     // Strip remaining tags
        .replace(/&nbsp;/g, ' ')       // Clean entities
        .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú')
        .replace(/&ntilde;/g, 'ñ')
        .trim();
};

export const computeEstructuraLabels = (worldItems) => {
    const labels = {};
    if (!worldItems) return labels;
    let vCount = 1;
    let standaloneCount = 1;
    worldItems.filter(w => w.parentId === 'system_estructura' && w.isCategory).forEach(vol => {
        labels[vol.id] = `Volumen ${vCount}: `;
        vCount++;
        let volChapCount = 1;
        worldItems.filter(w => w.parentId === vol.id).forEach(c => {
            labels[c.id] = `Capítulo ${volChapCount}: `;
            volChapCount++;
        });
    });
    worldItems.filter(w => w.parentId === 'system_estructura' && !w.isCategory).forEach(c => {
        labels[c.id] = `Capítulo ${standaloneCount}: `;
        standaloneCount++;
    });
    return labels;
};

export const computeChapterLabels = (chapters) => {
    const labels = {};
    if (!chapters) return labels;
    let vCount = 1;
    let standaloneCount = 1;
    chapters.filter(c => c.isVolume).forEach(vol => {
        labels[vol.id] = `Volumen ${vCount}: `;
        vCount++;
        let volChapCount = 1;
        chapters.filter(c => c.parentId === vol.id).forEach(c => {
            labels[c.id] = `Capítulo ${volChapCount}: `;
            volChapCount++;
        });
    });
    chapters.filter(c => !c.parentId && !c.isVolume).forEach(c => {
        labels[c.id] = `Capítulo ${standaloneCount}: `;
        standaloneCount++;
    });
    return labels;
};
