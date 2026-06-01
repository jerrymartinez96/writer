/**
 * textUtils.js
 * Capa 1 — Utilidades puras de texto y HTML
 */

import { tryParseAIJsonExported } from './parserUtils';

/**
 * Convierte texto plano (con saltos de línea y párrafos) a HTML seguro para el editor Tiptap.
 * Escapa todos los caracteres HTML especiales para evitar inyecciones e interpretaciones erróneas.
 */
export const plainTextToHtml = (text) => {
    if (!text) return '';
    
    // Escapar SOLO los caracteres HTML que son estructuralmente peligrosos.
    const escaped = text
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>');
        
    // Dividir en párrafos por dobles saltos de línea (\n\n)
    const paragraphs = escaped.split(/\n\n+/);
    
    return paragraphs
        .map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            // Reemplazar saltos de línea sencillos con saltos de línea HTML
            const withBreaks = trimmed.replace(/\n/g, '<br />');
            return `<p>${withBreaks}</p>`;
        })
        .filter(Boolean)
        .join('');
};

/**
 * Limpia el HTML a texto plano
 */
export const cleanText = (html) => {
    if (!html) return '';
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Limpia HTML a prose limpio (conserva párrafos y headings pero elimina atributos)
 * Útil para enviar contexto de capítulos a la IA sin perder toda la estructura.
 */
export const cleanHtmlForContext = (html) => {
    if (!html) return '';
    // Remove tag attributes from allowed tags, strip all other tags
    const allowedTagsRe = /<(p|h[1-6]|blockquote|li)[^>]*>/gi;
    const otherTagsRe = new RegExp('<(?!/?(p|h[1-6]|blockquote|li|ul|ol)\\b)[^>]+>', 'gi');
    return html
        .replace(allowedTagsRe, (_, tag) => `<${tag}>`)
        .replace(otherTagsRe, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Convierte contenido HTML de Tiptap a texto plano limpio de alta calidad,
 * reemplazando bloques por saltos de línea y eliminando el formateo.
 */
export const cleanHtmlToPlainText = (html) => {
    if (!html) return '';
    
    let text = html;
    
    // 1. Reemplazar saltos de línea HTML por \n
    text = text.replace(/<br\s*\/?>/gi, '\n');
    
    // 2. Reemplazar cierres de bloques por \n\n
    text = text.replace(/<\/p>/gi, '\n\n')
               .replace(/<\/h[1-6]>/gi, '\n\n')
               .replace(/<\/li>/gi, '\n\n')
               .replace(/<\/div>/gi, '\n\n')
               .replace(/<\/blockquote>/gi, '\n\n');
               
    // 3. Eliminar cualquier otra etiqueta HTML
    text = text.replace(/<[^>]*>/g, '');
    
    // 4. Decodificar entidades HTML comunes
    text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/&/g, '&')
        .replace(/"/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#039;/g, "'");
        
    // 5. Normalizar espacios horizontales en cada línea
    text = text.split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n');
        
    // 6. Normalizar saltos de línea (máximo 2 consecutivos)
    text = text.replace(/\n{3,}/g, '\n\n');
    
    return text.trim();
};

/**
 * Intenta extraer solo el contenido HTML de la respuesta de la IA (fallback legacy).
 * Solo se usa cuando el modelo no devolvió JSON válido.
 */
export const extractHtmlContent = (response) => {
    if (!response) return response;

    // Si ya es HTML puro
    if (/^\s*<(p|h[1-6]|div|section|article|ul|ol|table|br|span|strong|em|b|i|u)/i.test(response)) {
        return response;
    }

    // Buscar bloques de contenido HTML
    const htmlTagRegex = /<(p|h[1-6]|div|section|article|ul|ol|table|span|strong|em|b|i|u|br)[^>]*>[\s\S]*?<\/(\1)>/gi;
    const matches = [];
    let match;
    while ((match = htmlTagRegex.exec(response)) !== null) {
        matches.push(match[0]);
    }

    if (matches.length > 0) {
        return matches.join('\n');
    }

    // Último intento: desde el primer < hasta el último >
    if (response.includes('<') && response.includes('>')) {
        const firstTag = response.indexOf('<');
        const lastTag = response.lastIndexOf('>');
        if (firstTag !== -1 && lastTag > firstTag) {
            const extracted = response.substring(firstTag, lastTag + 1);
            if (extracted.includes('</')) {
                return extracted;
            }
        }
    }

    return '';
};

/**
 * Determina si una respuesta contiene contenido HTML aplicable
 */
export const hasHtmlContent = (response) => {
    if (!response) return false;
    const parsed = tryParseAIJsonExported(response);
    if (parsed) return parsed.type === 'content' && !!parsed.html;
    return /<[a-z][\s\S]*?<\/[a-z]+>/i.test(response);
};
