/**
 * contextUtils.js
 * Capa 1 — Gestión y Compresión de Contexto de Novela
 */

import { cleanHtmlToPlainText } from './textUtils';

/** Umbral en chars a partir del cual un capítulo se considera "pesado" para contexto */
export const HEAVY_CONTEXT_THRESHOLD = 50000; // ~12,500 palabras — umbral realista para activar compresión

/** Umbral de chars a mantener al comprimir contexto pesado (primeras + últimas N chars) */
export const SMART_CONTEXT_HEAD_TAIL = 20000;

/**
 * Estima si un documento tiene contenido "pesado" para contexto
 */
export const isHeavyDocument = (html) => {
    if (!html) return false;
    return html.length > HEAVY_CONTEXT_THRESHOLD;
};

/**
 * Comprime el contenido de un documento largo para reducir tokens en el contexto.
 * Mantiene inicio + fin del texto para preservar continuidad narrativa.
 */
export const smartCompressContext = (html, maxChars = SMART_CONTEXT_HEAD_TAIL * 2) => {
    if (!html) return '';
    const text = cleanHtmlToPlainText(html);
    if (text.length <= maxChars) return text;

    const half = Math.floor(maxChars / 2);
    const head = text.substring(0, half).trim();
    const tail = text.substring(text.length - half).trim();
    const omitted = text.length - maxChars;

    return `${head}\n\n[... ${omitted.toLocaleString()} caracteres omitidos para reducir contexto ...]\n\n${tail}`;
};

/**
 * Construye el contexto SOLO con los documentos seleccionados por el usuario.
 * Usa etiquetas XML semánticas para mejorar la comprensión del modelo.
 */
export const buildContextFromSelections = (
    activeBook,
    chapters,
    selectedChapterIds = [],
    characters = [],
    worldItems = [],
    selectedWorldItemIds = [],
    compressHeavy = false,
    selectedCharacterIds = []
) => {
    const parts = [];

    // Información del libro
    if (activeBook) {
        parts.push('<book>');
        parts.push(`  <title>${activeBook.title || 'Sin título'}</title>`);
        if (activeBook.description) parts.push(`  <description>${activeBook.description}</description>`);
        if (activeBook.genre) parts.push(`  <genre>${activeBook.genre}</genre>`);
        parts.push('</book>');
    }

    // Capítulos seleccionados
    if (selectedChapterIds.length > 0) {
        parts.push('<manuscript>');
        chapters.forEach(chapter => {
            if (selectedChapterIds.includes(chapter.id)) {
                const rawContent = chapter.content || '';
                let content;

                if (compressHeavy && isHeavyDocument(rawContent)) {
                    content = smartCompressContext(rawContent);
                } else {
                    content = cleanHtmlToPlainText(rawContent);
                }

                parts.push(`  <chapter title="${(chapter.title || 'Sin título').replace(/"/g, "'")}"${chapter.status ? ` status="${chapter.status}"` : ''}${compressHeavy && isHeavyDocument(rawContent) ? ' compressed="true"' : ''}>`);
                parts.push(`    ${content}`);
                parts.push(`  </chapter>`);
            }
        });
        parts.push('</manuscript>');
    }

    // Personajes (con selección explícita y/o expansión de contexto relacional inteligente)
    if (characters && characters.length > 0) {
        const validChars = characters.filter(c => !c.isCategory && c.name);
        
        let charactersToInclude = [];
        
        if (selectedCharacterIds && selectedCharacterIds.length > 0) {
            charactersToInclude = validChars.filter(c => selectedCharacterIds.includes(c.id));
        } else {
            let selectedText = '';
            
            if (selectedChapterIds.length > 0) {
                chapters.forEach(ch => {
                    if (selectedChapterIds.includes(ch.id)) {
                        selectedText += ' ' + (ch.content || '');
                    }
                });
            }
            if (selectedWorldItemIds.length > 0) {
                worldItems.forEach(item => {
                    if (selectedWorldItemIds.includes(item.id)) {
                        selectedText += ' ' + (item.content || '');
                    }
                });
            }
            
            if (selectedText.trim().length > 0) {
                const selectedTextLower = selectedText.toLowerCase();
                const directMatches = validChars.filter(char => {
                    const nameLower = char.name.toLowerCase();
                    return selectedTextLower.includes(nameLower) || 
                           selectedTextLower.includes(`data-id="${char.id}"`);
                });
                
                const charNameMap = new Map(
                    validChars.map(c => [c.name.toLowerCase(), c])
                );
                const expandedSet = new Set(directMatches.map(c => c.id));
                directMatches.forEach(char => {
                    if (!char.description) return;
                    const descLower = char.description.toLowerCase();
                    for (const [nameLower, otherChar] of charNameMap) {
                        if (otherChar.id !== char.id && (
                            descLower.includes(nameLower) ||
                            descLower.includes(`data-id="${otherChar.id}"`)
                        )) {
                            expandedSet.add(otherChar.id);
                        }
                    }
                });
                
                charactersToInclude = validChars.filter(c => expandedSet.has(c.id));
            }
            
            if (charactersToInclude.length === 0) {
                charactersToInclude = validChars;
            }
        }

        if (charactersToInclude.length > 0) {
            parts.push('<characters>');
            charactersToInclude.forEach(char => {
                parts.push(`  <character name="${char.name}"${char.role ? ` role="${char.role}"` : ''}>${char.description ? cleanHtmlToPlainText(char.description) : ''}</character>`);
            });
            parts.push('</characters>');
        }
    }

    // World Items (Master Doc) seleccionados
    if (worldItems && worldItems.length > 0 && selectedWorldItemIds.length > 0) {
        const validItems = worldItems.filter(item => selectedWorldItemIds.includes(item.id) && item.title && item.content);
        if (validItems.length > 0) {
            parts.push('<world_building>');
            validItems.forEach(item => {
                const rawContent = item.content || '';
                let content;

                if (compressHeavy && isHeavyDocument(rawContent)) {
                    content = smartCompressContext(rawContent);
                } else {
                    content = cleanHtmlToPlainText(rawContent);
                }

                parts.push(`  <entry title="${(item.title || '').replace(/"/g, "'")}"${compressHeavy && isHeavyDocument(rawContent) ? ' compressed="true"' : ''}>`);
                parts.push(`    ${content}`);
                parts.push(`  </entry>`);
            });
            parts.push('</world_building>');
        }
    }

    if (selectedChapterIds.length === 0 && selectedWorldItemIds.length === 0 && (!selectedCharacterIds || selectedCharacterIds.length === 0)) {
        parts.push('<!-- No se ha seleccionado contexto específico. El usuario no ha indicado documentos de referencia. -->');
    }

    return parts.join('\n');
};

/**
 * Calcula el peso aproximado en tokens del contexto seleccionado.
 * Útil para mostrar advertencias en la UI.
 */
export const estimateContextWeight = (chapters, selectedChapterIds, worldItems, selectedWorldItemIds, characters = [], selectedCharacterIds = []) => {
    let totalChars = 0;

    chapters.forEach(ch => {
        if (selectedChapterIds.includes(ch.id)) {
            totalChars += (ch.content || '').length;
        }
    });

    worldItems.forEach(w => {
        if (selectedWorldItemIds.includes(w.id)) {
            totalChars += (w.content || '').length;
        }
    });

    if (characters && selectedCharacterIds) {
        characters.forEach(c => {
            if (selectedCharacterIds.includes(c.id)) {
                totalChars += (c.description || '').length;
            }
        });
    }

    return {
        chars: totalChars,
        estimatedTokens: Math.ceil(totalChars / 3.8),
        isHeavy: totalChars > HEAVY_CONTEXT_THRESHOLD,
    };
};
