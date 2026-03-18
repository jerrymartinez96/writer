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
export const generateComprehensiveWorldContext = (worldItems, includedSections = {}, flags = {}) => {
    if (!worldItems) return '';

    const { 
        includeEstructura = true, 
        includeNotasGenerales = true 
    } = flags;

    const renderTree = (parentId, depth = 0) => {
        const items = worldItems.filter(i => i.parentId === parentId);
        if (items.length === 0) return '';

        return items
            .map(item => {
                // If it's a root item (parentId === null), check includedSections
                if (parentId === null && includedSections[item.id] === false) return '';
                
                // Special system folders handled by flags
                if (item.id === 'system_estructura' && !includeEstructura) return '';
                if (item.id === 'system_notas' && !includeNotasGenerales) return '';

                const indent = '  '.repeat(depth);
                const title = item.title?.toUpperCase() || 'SIN TÍTULO';
                const content = cleanText(item.content);
                
                let output = `${indent}[${title}]\n`;
                if (content) {
                    output += `${indent}${content}\n`;
                }

                const children = renderTree(item.id, depth + 1);
                if (children) {
                    output += children;
                }

                return output;
            })
            .filter(Boolean)
            .join('\n');
    };

    const worldContent = renderTree(null);
    const estructuraContent = includeEstructura ? renderTree('system_estructura') : '';
    const notasContent = includeNotasGenerales ? renderTree('system_notas') : '';

    return `
${estructuraContent ? `==== ESTRUCTURA DEL PROYECTO ====\n${estructuraContent}\n` : ''}
${worldContent ? `==== BIBLIA DEL MUNDO ====\n${worldContent}\n` : ''}
${notasContent ? `==== NOTAS GENERALES ====\n${notasContent}\n` : ''}
    `.trim();
};
