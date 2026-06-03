/**
 * parserUtils.js
 * Capa 1 — Parsers de Respuestas y Llamadas a Herramientas de IA
 */

import { plainTextToHtml, extractHtmlContent } from './textUtils';
import { resolveTargetDoc } from './domainUtils';

/**
 * Detecta si un string parece un JSON válido de respuesta estructurada
 */
export const isStructuredResponse = (text) => {
    if (!text) return false;
    const trimmed = text.trim();
    return trimmed.startsWith('{') && trimmed.endsWith('}');
};

/**
 * Extrae el contenido de una etiqueta XML semántica.
 */
export const extractXmlTag = (text, tagName) => {
    if (!text) return '';

    const openTag = `<${tagName}>`;
    const closeTag = `</${tagName}>`;

    let startIdx = text.indexOf(openTag);
    let contentStart = -1;

    if (startIdx !== -1) {
        contentStart = startIdx + openTag.length;
    } else {
        const openTagLower = openTag.toLowerCase();
        const textLower = text.toLowerCase();
        startIdx = textLower.indexOf(openTagLower);
        if (startIdx === -1) return '';
        contentStart = startIdx + openTag.length;
    }

    const closeTagLower = closeTag.toLowerCase();
    const endIdx = text.toLowerCase().indexOf(closeTagLower, contentStart);

    if (endIdx !== -1) {
        return text.substring(contentStart, endIdx);
    }

    return text.substring(contentStart);
};

/**
 * Intenta detectar el título de un capítulo a partir del inicio del contenido generado.
 */
export const detectTitleFromContent = (content) => {
    if (!content) return '';
    let clean = content
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n');
    
    clean = clean.replace(/<[^>]*>/g, '').trim();
    if (!clean) return '';

    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';

    let firstLine = lines[0];
    firstLine = firstLine.replace(/^[#\s*]+|[#\s*]+$/g, '').replace(/\*\*/g, '').trim();
    
    if (firstLine.length > 0 && firstLine.length < 70) {
        return firstLine;
    }

    return '';
};

/**
 * Parsea bloques estructurados de inconsistencias y huecos de lore
 */
export const parseInconsistenciesFromResponse = (text) => {
    if (!text) return [];

    const inconsistencies = [];

    // FORMATO 1: Formato oficial de doble corchete
    const incRegexBrackets = /\[\[inconsistencia\s+id="([^"]+)"\s+archivos="([^"]+)"\]\]([\s\S]*?)\[\[\/inconsistencia\]\]/gi;
    let match;

    while ((match = incRegexBrackets.exec(text)) !== null) {
        const id = match[1];
        const filesStr = match[2];
        const innerContent = match[3];

        const titleMatch = /\[\[titulo\]\]([\s\S]*?)\[\[\/titulo\]\]/i.exec(innerContent);
        const problemMatch = /\[\[problema\]\]([\s\S]*?)\[\[\/problema\]\]/i.exec(innerContent);

        const title = titleMatch ? titleMatch[1].trim() : `Conflicto ${id}`;
        const problem = problemMatch ? problemMatch[1].trim() : '';

        const solRegex = /\[\[solucion\s+letra="([^"]+)"\]\]([\s\S]*?)\[\[\/solucion\]\]/gi;
        const options = [];
        let solMatch;

        while ((solMatch = solRegex.exec(innerContent)) !== null) {
            options.push({
                letter: solMatch[1].toUpperCase().trim(),
                text: solMatch[2].trim()
            });
        }

        inconsistencies.push({
            id,
            files: filesStr.split(',').map(f => f.trim()).filter(Boolean),
            title,
            problem,
            options,
            resolved: false,
            selectedOption: null,
            customText: ''
        });
    }

    // FORMATO 2: XML legacy (fallback)
    if (inconsistencies.length === 0) {
        const incRegexXml = /<inconsistencia\s+id="([^"]+)"\s+archivos="([^"]+)">([\s\S]*?)<\/inconsistencia>/gi;
        let xmlMatch;

        while ((xmlMatch = incRegexXml.exec(text)) !== null) {
            const id = xmlMatch[1];
            const filesStr = xmlMatch[2];
            const innerContent = xmlMatch[3];

            const titleMatch = /<titulo>([\s\S]*?)<\/titulo>/i.exec(innerContent);
            const problemMatch = /<problema>([\s\S]*?)<\/problema>/i.exec(innerContent);

            const title = titleMatch ? titleMatch[1].trim() : `Conflicto ${id}`;
            const problem = problemMatch ? problemMatch[1].trim() : '';

            const solRegex = /<solucion\s+letra="([^"]+)">([\s\S]*?)<\/solucion>/gi;
            const options = [];
            let solMatch;

            while ((solMatch = solRegex.exec(innerContent)) !== null) {
                options.push({
                    letter: solMatch[1].toUpperCase().trim(),
                    text: solMatch[2].trim()
                });
            }

            inconsistencies.push({
                id,
                files: filesStr.split(',').map(f => f.trim()).filter(Boolean),
                title,
                problem,
                options,
                resolved: false,
                selectedOption: null,
                customText: ''
            });
        }
    }

    // FORMATO 3: Semi-estructurado tolerante
    if (inconsistencies.length === 0) {
        const incRegexFree = /\[\[inconsistencia\s+\d+\s*:\s*([^\]]+)\]\]\s*([\s\S]*?)(?=\[\[inconsistencia|$)/gim;
        let freeMatch;

        while ((freeMatch = incRegexFree.exec(text)) !== null) {
            const title = freeMatch[1].trim();
            const body = freeMatch[2].trim();
            
            const ubicacionMatch = body.match(/UBICACIÓN:\s*([^\n]+)/i);
            const problemMatch2 = body.match(/PROBLEMA:\s*([\s\S]*?)(?=\n(?:SOLUCIÓN|SOLUCION)\s+(?:A|B):|\n\[\[|$)/im);
            const files = [];

            if (ubicacionMatch) {
                const ubicacion = ubicacionMatch[1].trim();
                const lowerUbi = ubicacion.toLowerCase();
                if (lowerUbi.includes('personaje')) files.push('system_personajes');
                if (lowerUbi.includes('estructura') || lowerUbi.includes('capitulo')) files.push('system_estructura');
                if (lowerUbi.includes('general') || lowerUbi.includes('core') || lowerUbi.includes('informacion')) files.push('system_core');
                if (files.length === 0) files.push(ubicacion);
            }

            const problem = problemMatch2 ? problemMatch2[1].trim() : '';

            const solRegexFree = /(?:SOLUCIÓN|SOLUCION)\s+([A-D])\s*:\s*([\s\S]*?)(?=\n(?:SOLUCIÓN|SOLUCION)\s+[A-D]\s*:|\n\[\[|$)/gim;
            const options = [];
            let solFreeMatch;

            while ((solFreeMatch = solRegexFree.exec(body)) !== null) {
                options.push({
                    letter: solFreeMatch[1].toUpperCase().trim(),
                    text: solFreeMatch[2].trim()
                });
            }

            const numMatch = text.match(/\[\[inconsistencia\s+(\d+)/i);
            const id = numMatch ? numMatch[1] : String(inconsistencies.length + 1);

            inconsistencies.push({
                id,
                files: files.length > 0 ? files : ['unknown'],
                title,
                problem: problem || title,
                options: options.length > 0 ? options : [],
                resolved: false,
                selectedOption: null,
                customText: ''
            });
        }
    }

    return inconsistencies;
};

/**
 * Intenta parsear una respuesta XML semántica o pseudo-etiquetas estructuradas
 */
export const tryParseAIXml = (text) => {
    if (!text) return null;

    const lowerText = text.toLowerCase();
    
    // PARSEADOR MULTI-PARCHE
    const hasMultiPatch = lowerText.includes('[[parche]]') || lowerText.includes('[parche]');
    if (hasMultiPatch) {
        const patches = [];
        const patchBlockRegex = /\[+parche\]+([\s\S]*?)\[+\/parche\]+/gi;
        let match;
        
        while ((match = patchBlockRegex.exec(text)) !== null) {
            const blockContent = match[1];
            
            const typeMatch = /\[+TIPO\s*:\s*([^\]]+)\]+/i.exec(blockContent);
            const targetMatch = /\[+DESTINO\s*:\s*([^\]]+)\]+/i.exec(blockContent);
            const contextMatch = /\[+CONTEXTO\s*:\s*([^\]]+)\]+/i.exec(blockContent);
            const originalMatch = /\[+ORIGINAL\]+([\s\S]*?)\[+\/ORIGINAL\]+/i.exec(blockContent);
            const replacementMatch = /\[+REEMPLAZO\]+([\s\S]*?)\[+\/REEMPLAZO\]+/i.exec(blockContent);
            
            if (originalMatch) {
                const typeVal = typeMatch ? typeMatch[1].trim().toLowerCase() : 'fragmento';
                if (typeVal === 'fragmento' || typeVal === 'parche' || typeVal === 'patch') {
                    let replacementRaw = '';
                    if (replacementMatch) {
                        replacementRaw = replacementMatch[1];
                    } else {
                        let origCloseIdx = blockContent.toLowerCase().indexOf('[[/original]]');
                        let tagLength = '[[/original]]'.length;
                        if (origCloseIdx === -1) {
                            origCloseIdx = blockContent.toLowerCase().indexOf('[/original]');
                            tagLength = '[/original]'.length;
                        }
                        if (origCloseIdx !== -1) {
                            replacementRaw = blockContent.substring(origCloseIdx + tagLength);
                        }
                    }
                    
                    patches.push({
                        target: targetMatch ? targetMatch[1].trim() : '',
                        context: contextMatch ? contextMatch[1].trim() : '',
                        original: originalMatch[1].trim(),
                        replacementText: replacementRaw.trim(),
                        replacement: plainTextToHtml(replacementRaw).trim()
                    });
                }
            }
        }
        
        if (patches.length > 0) {
            return {
                type: 'multi_patch',
                patches
            };
        }
    }

    // PARSEADOR PRIMARIO: Corchetes
    const hasBracketMetadata = lowerText.includes('[tipo:') || lowerText.includes('[tipo :') || lowerText.includes('[[tipo:') || lowerText.includes('[[tipo :');

    if (hasBracketMetadata) {
        const parsed = {};
        const bracketRegex = /^\s*\[+([a-záéíóúüñ\-_]+)\s*:\s*([^\]]+)\]+/gim;
        let match;
        const metadataLines = [];
        
        while ((match = bracketRegex.exec(text)) !== null) {
            const key = match[1].toLowerCase();
            const val = match[2].trim();
            parsed[key] = val;
            metadataLines.push(match[0]);
        }

        const originalBlockRegex = /\[+original\]+([\s\S]*?)\[+\/original\]+/i;
        const origMatch = originalBlockRegex.exec(text);
        if (origMatch) {
            parsed.original = origMatch[1].trim();
            metadataLines.push(origMatch[0]);
        }

        if (parsed.tipo) {
            let type = parsed.tipo.toLowerCase().trim();
            if (type === 'contenido') type = 'content';
            if (type === 'fragmento' || type === 'parche') type = 'patch';
            if (type === 'seccion') type = 'section';
            if (type === 'escena') type = 'scene';
            if (type === 'analisis' || type === 'análisis') type = 'analysis';
            if (type === 'sugerencia') type = 'suggestion';
            if (type === 'inconsistencias' || type === 'inconsistencia' || type === 'huecos') type = 'inconsistencies';

            const finalParsed = { type };

            let scope = parsed.ambito || parsed.scope || '';
            if (scope) {
                scope = scope.toLowerCase().trim();
                if (scope === 'completo') scope = 'complete';
                if (scope === 'parcial') scope = 'partial';
                finalParsed.scope = scope;
            }

            const target = parsed.destino || parsed.target || '';
            if (target) finalParsed.target = target;

            const title = parsed.titulo || parsed.title || parsed.escena || parsed.scene || '';
            if (title) finalParsed.title = title;

            let bodyText = text;
            metadataLines.forEach(line => {
                bodyText = bodyText.replace(line, '');
            });
            bodyText = bodyText.trim();

            if (type === 'content') {
                finalParsed.html = plainTextToHtml(bodyText).trim();
                finalParsed.text = bodyText;
            } else if (type === 'patch') {
                finalParsed.original = parsed.original || '';
                
                const replacementBlockRegex = /\[+REEMPLAZO\]+([\s\S]*?)\[+\/REEMPLAZO\]+/i;
                const repMatch = replacementBlockRegex.exec(text);
                
                let replacementRaw = '';
                if (repMatch) {
                    replacementRaw = repMatch[1].trim();
                } else {
                    let origCloseIdx = text.toLowerCase().indexOf('[[/original]]');
                    let tagLength = '[[/original]]'.length;
                    if (origCloseIdx === -1) {
                        origCloseIdx = text.toLowerCase().indexOf('[/original]');
                        tagLength = '[/original]'.length;
                    }
                    if (origCloseIdx !== -1) {
                        replacementRaw = text.substring(origCloseIdx + tagLength).trim();
                        replacementRaw = replacementRaw.replace(/^\s*\[+([a-záéíóúüñ\-_]+)\s*:\s*([^\]]+)\]+/gim, '').trim();
                    } else {
                        replacementRaw = bodyText;
                    }
                }
                
                finalParsed.replacement = plainTextToHtml(replacementRaw).trim();
                finalParsed.replacementText = replacementRaw;
                finalParsed.context = parsed.contexto || parsed.context || '';
            } else if (type === 'section' || type === 'scene') {
                finalParsed.html = plainTextToHtml(bodyText).trim();
                finalParsed.text = bodyText;
                
                const secStr = parsed.seccion || parsed.section || parsed.escena || parsed.scene || parsed.numero || parsed.número || '';
                const totStr = parsed.total || '';
                finalParsed.sectionIndex = secStr ? parseInt(secStr, 10) : 1;
                finalParsed.totalSections = totStr ? parseInt(totStr, 10) : 1;
            } else if (type === 'analysis' || type === 'suggestion') {
                finalParsed.text = bodyText;
            } else if (type === 'inconsistencies') {
                finalParsed.text = bodyText;
                finalParsed.inconsistencies = parseInconsistenciesFromResponse(text);
            }

            return finalParsed;
        }
    }

    // PARSEADOR SECUNDARIO: XML Estándar
    const hasStandardXml = lowerText.includes('<response_type>') || lowerText.includes('<response-type>');

    if (hasStandardXml) {
        const normalizedText = text
            .replace(/<response-type>/gi, '<response_type>')
            .replace(/<\/response-type>/gi, '</response_type>')
            .replace(/<target-doc>/gi, '<target_doc>')
            .replace(/<\/target-doc>/gi, '</target_doc>')
            .replace(/<content-html>/gi, '<content_html>')
            .replace(/<\/content-html>/gi, '</content_html>')
            .replace(/<content-markdown>/gi, '<content_markdown>')
            .replace(/<\/content-markdown>/gi, '</content_markdown>')
            .replace(/<content-text>/gi, '<content_text>')
            .replace(/<\/content-text>/gi, '</content_text>')
            .replace(/<replacement-markdown>/gi, '<replacement_markdown>')
            .replace(/<\/replacement-markdown>/gi, '</replacement_markdown>')
            .replace(/<replacement-text>/gi, '<replacement_text>')
            .replace(/<\/replacement-text>/gi, '</replacement_text>')
            .replace(/<section-index>/gi, '<section_index>')
            .replace(/<\/section-index>/gi, '</section_index>')
            .replace(/<total-sections>/gi, '<total_sections>')
            .replace(/<\/total-sections>/gi, '</total_sections>')
            .replace(/<response-scope>/gi, '<response_scope>')
            .replace(/<\/response-scope>/gi, '</response_scope>');

        const type = extractXmlTag(normalizedText, 'response_type').trim().toLowerCase();
        if (!type) return null;

        const parsed = { type };

        const scope = extractXmlTag(normalizedText, 'response_scope').trim().toLowerCase();
        if (scope) parsed.scope = scope;

        if (type === 'content') {
            const textContent = extractXmlTag(normalizedText, 'content_text');
            const markdown = extractXmlTag(normalizedText, 'content_markdown');
            
            if (textContent) {
                parsed.html = plainTextToHtml(textContent).trim();
                parsed.text = textContent;
            } else if (markdown) {
                parsed.html = plainTextToHtml(markdown).trim();
                parsed.text = markdown;
                parsed.markdown = markdown;
            } else {
                const legacyHtml = extractXmlTag(normalizedText, 'content_html');
                if (legacyHtml && /<[a-z][\s\S]*?>/i.test(legacyHtml)) {
                    parsed.html = legacyHtml;
                } else {
                    parsed.html = plainTextToHtml(legacyHtml).trim();
                }
                parsed.text = parsed.html;
            }
            parsed.title = extractXmlTag(normalizedText, 'title').trim();
            parsed.target = extractXmlTag(normalizedText, 'target_doc').trim();
        } else if (type === 'patch') {
            parsed.original = extractXmlTag(normalizedText, 'original').trim();
            const replacementText = extractXmlTag(normalizedText, 'replacement_text');
            const replacementMarkdown = extractXmlTag(normalizedText, 'replacement_markdown');
            
            if (replacementText) {
                parsed.replacement = plainTextToHtml(replacementText).trim();
                parsed.replacementText = replacementText;
            } else if (replacementMarkdown) {
                parsed.replacement = plainTextToHtml(replacementMarkdown).trim();
                parsed.replacementMarkdown = replacementMarkdown;
            } else {
                const legacyReplacement = extractXmlTag(normalizedText, 'replacement');
                if (legacyReplacement && /<[a-z][\s\S]*?>/i.test(legacyReplacement)) {
                    parsed.replacement = legacyReplacement;
                } else {
                    parsed.replacement = plainTextToHtml(legacyReplacement).trim();
                }
            }
            parsed.context = extractXmlTag(normalizedText, 'context').trim();
            parsed.target = extractXmlTag(normalizedText, 'target_doc').trim();
        } else if (type === 'section') {
            const textContent = extractXmlTag(normalizedText, 'content_text');
            const markdown = extractXmlTag(normalizedText, 'content_markdown');
            
            if (textContent) {
                parsed.html = plainTextToHtml(textContent).trim();
                parsed.text = textContent;
            } else if (markdown) {
                parsed.html = plainTextToHtml(markdown).trim();
                parsed.markdown = markdown;
            } else {
                const legacyHtml = extractXmlTag(normalizedText, 'content_html');
                if (legacyHtml && /<[a-z][\s\S]*?>/i.test(legacyHtml)) {
                    parsed.html = legacyHtml;
                } else {
                    parsed.html = plainTextToHtml(legacyHtml).trim();
                }
            }
            parsed.title = extractXmlTag(normalizedText, 'title').trim();
            const sectionIdxStr = extractXmlTag(normalizedText, 'section_index').trim();
            const totalSectionsStr = extractXmlTag(normalizedText, 'total_sections').trim();
            parsed.sectionIndex = sectionIdxStr ? parseInt(sectionIdxStr, 10) : 1;
            parsed.totalSections = totalSectionsStr ? parseInt(totalSectionsStr, 10) : 1;
        } else if (type === 'analysis' || type === 'suggestion') {
            parsed.text = extractXmlTag(normalizedText, 'text');
        }

        return parsed;
    }

    // PARSEADOR TERCIARIO: Pseudo-etiquetas
    const keys = [
        'response_type', 'response-type', 'type',
        'response_scope', 'response-scope', 'scope',
        'target_doc', 'target-doc', 'target',
        'title',
        'content_text', 'content-text', 'content_html', 'content-html', 'content',
        'text',
        'original',
        'replacement_text', 'replacement-text', 'replacement',
        'context',
        'section_index', 'section-index',
        'total_sections', 'total-sections'
    ];

    const sortedKeys = [...keys].sort((a, b) => b.length - a.length);
    const regexStr = '(?:<|\\b|\\s|_\\[)?\\b(' + sortedKeys.join('|') + ')\\b(?:>|\\b|\\s|_\\])?\\s*[:=]?\\s*';
    const regex = new RegExp(regexStr, 'gi');

    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push({
            keyName: match[1].toLowerCase(),
            index: match.index,
            length: match[0].length
        });
    }

    if (matches.length >= 2) {
        const parsed = {};
        for (let i = 0; i < matches.length; i++) {
            const current = matches[i];
            const start = current.index + current.length;
            const end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
            const rawVal = text.substring(start, end).trim();

            let key = current.keyName;
            if (key === 'type') key = 'response_type';
            if (key === 'response-type') key = 'response_type';
            if (key === 'scope') key = 'response_scope';
            if (key === 'response-scope') key = 'response_scope';
            if (key === 'target') key = 'target_doc';
            if (key === 'target-doc') key = 'target_doc';
            if (key === 'content-text') key = 'content_text';
            if (key === 'content') key = 'content_text';
            if (key === 'content_html') key = 'content_text';
            if (key === 'content-html') key = 'content_text';
            if (key === 'replacement-text') key = 'replacement_text';
            if (key === 'replacement') key = 'replacement_text';
            if (key === 'section-index') key = 'section_index';
            if (key === 'total-sections') key = 'total_sections';

            parsed[key] = rawVal;
        }

        if (parsed.response_type) {
            const type = parsed.response_type.toLowerCase();
            const finalParsed = { type };
            if (parsed.response_scope) finalParsed.scope = parsed.response_scope.toLowerCase();

            if (type === 'content') {
                const textContent = parsed.content_text || '';
                finalParsed.html = plainTextToHtml(textContent).trim();
                finalParsed.text = textContent;
                finalParsed.title = (parsed.title || '').trim();
                finalParsed.target = (parsed.target_doc || '').trim();
            } else if (type === 'patch') {
                finalParsed.original = (parsed.original || '').trim();
                const replacementText = parsed.replacement_text || '';
                finalParsed.replacement = plainTextToHtml(replacementText).trim();
                finalParsed.replacementText = replacementText;
                finalParsed.context = (parsed.context || '').trim();
                finalParsed.target = (parsed.target_doc || '').trim();
            } else if (type === 'section') {
                const textContent = parsed.content_text || '';
                finalParsed.html = plainTextToHtml(textContent).trim();
                finalParsed.text = textContent;
                finalParsed.title = (parsed.title || '').trim();
                finalParsed.sectionIndex = parsed.section_index ? parseInt(parsed.section_index, 10) : 1;
                finalParsed.totalSections = parsed.total_sections ? parseInt(parsed.total_sections, 10) : 1;
            } else if (type === 'analysis' || type === 'suggestion') {
                finalParsed.text = parsed.text || '';
            }

            return finalParsed;
        }
    }

    return null;
};

/**
 * Tries to parse an AI JSON response string, tolerating minor issues.
 */
export const tryParseAIJson = (text) => {
    if (!text) return null;

    const trimmed = text.trim();

    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.type === 'string') return parsed;
    } catch { /* continue */ }

    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try {
            const parsed = JSON.parse(codeBlockMatch[1].trim());
            if (parsed && typeof parsed.type === 'string') return parsed;
        } catch { /* continue */ }
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
            const parsed = JSON.parse(trimmed.substring(firstBrace, lastBrace + 1));
            if (parsed && typeof parsed.type === 'string') return parsed;
        } catch { /* continue */ }
    }

    return null;
};

/**
 * Converts a parsed AI JSON object into destination blocks.
 */
export const buildBlocksFromParsed = (parsed, destinationDoc, chapters = [], worldItems = [], characters = []) => {
    const responseType = parsed.type || 'analysis';

    if (responseType === 'patch' && parsed.original && parsed.replacement !== undefined) {
        let dest = destinationDoc || { mode: 'auto' };

        if (dest.mode === 'auto' && parsed.target) {
            const resolved = resolveTargetDoc(parsed.target, chapters, worldItems, characters);
            if (resolved) {
                dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
            }
        }

        const blocks = [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: dest.docTitle || 'Fragmento',
            content: parsed.replacement,
            original: parsed.original,
            responseType: 'patch',
            isPatch: true,
            context: parsed.context || '',
        }];
        return blocks;
    }

    if (responseType === 'multi_patch' && parsed.patches) {
        return parsed.patches.map(patch => {
            let dest = { mode: 'auto' };

            if (patch.target) {
                const resolved = resolveTargetDoc(patch.target, chapters, worldItems, characters);
                if (resolved) {
                    dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
                } else {
                    dest = { mode: 'auto', docTitle: patch.target };
                }
            }

            return {
                docType: dest.docType || null,
                docId: dest.docId || null,
                mode: dest.mode || 'auto',
                title: dest.docTitle || patch.target || 'Fragmento',
                content: patch.replacement,
                original: patch.original,
                responseType: 'patch',
                isPatch: true,
                context: patch.context || '',
            };
        });
    }

    if (responseType === 'content' && parsed.html) {
        let dest = destinationDoc || { mode: 'auto' };

        if (dest.mode === 'auto' && parsed.target) {
            const resolved = resolveTargetDoc(parsed.target, chapters, worldItems, characters);
            if (resolved) {
                dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
            }
        }

        const isPartial = parsed.scope === 'partial';

        if (dest.mode === 'new') {
            const blockTitle = dest.docTitle || parsed.title || detectTitleFromContent(parsed.text || parsed.html) || 'Nuevo capítulo';
            return [{ docType: 'chapter', docId: null, mode: 'new', title: blockTitle, content: parsed.html, responseType: 'content', isPartial }];
        } else if (dest.mode === 'manual' && dest.docId) {
            return [{ docType: dest.docType, docId: dest.docId, mode: 'manual', title: dest.docTitle || 'Documento', content: parsed.html, responseType: 'content', isPartial }];
        } else {
            const blockTitle = parsed.title || detectTitleFromContent(parsed.text || parsed.html) || 'Automático';
            return [{ docType: 'chapter', docId: null, mode: 'auto', title: blockTitle, content: parsed.html, responseType: 'content', isPartial }];
        }
    }

    if (responseType === 'section' && parsed.html) {
        const dest = destinationDoc || { mode: 'auto' };
        return [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: parsed.title || `Sección ${parsed.sectionIndex || 1}`,
            content: parsed.html,
            responseType: 'section',
            isSection: true,
            sectionIndex: parsed.sectionIndex,
            totalSections: parsed.totalSections,
        }];
    }

    if (responseType === 'scene' && parsed.html) {
        const dest = destinationDoc || { mode: 'auto' };
        return [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: parsed.title || `Escena ${parsed.sectionIndex || 1}`,
            content: parsed.html,
            responseType: 'scene',
            isScene: true,
            sceneIndex: parsed.sectionIndex,
            titleOriginal: parsed.title || 'Nueva Escena',
        }];
    }

    if ((responseType === 'analysis' || responseType === 'suggestion') && parsed.text) {
        return [{ docType: 'text', docId: null, mode: 'text', title: 'Respuesta', content: parsed.text.trim(), responseType }];
    }

    if (responseType === 'inconsistencies') {
        return [{ docType: 'text', docId: null, mode: 'text', title: 'Inconsistencias', content: parsed.text ? parsed.text.trim() : '', responseType, inconsistencies: parsed.inconsistencies || [] }];
    }

    const fallbackText = parsed.text || parsed.html || JSON.stringify(parsed);
    return [{ docType: 'text', docId: null, mode: 'text', title: 'Respuesta', content: fallbackText, responseType: 'analysis' }];
};

/**
 * Exportable wrapper for tryParseAIJson (for use in components)
 */
export const tryParseAIJsonExported = (text) => {
    if (!text) return null;
    const parsedXml = tryParseAIXml(text);
    if (parsedXml) return parsedXml;

    const trimmed = text.trim();
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.type === 'string') return parsed;
    } catch { /* continue */ }

    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try {
            const parsed = JSON.parse(codeBlockMatch[1].trim());
            if (parsed && typeof parsed.type === 'string') return parsed;
        } catch { /* continue */ }
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
            const parsed = JSON.parse(trimmed.substring(firstBrace, lastBrace + 1));
            if (parsed && typeof parsed.type === 'string') return parsed;
        } catch { /* continue */ }
    }
    return null;
};

/**
 * Parsea la respuesta JSON de la IA.
 */
export const parseDestinationsFromResponse = (response, destinationDoc, chapters = [], worldItems = [], characters = []) => {
    if (!response) return [];

    const trimmed = response.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsedJson = JSON.parse(trimmed);
            if (parsedJson.parches) {
                return parseToolCallResponse('aplicar_parches_resolucion', parsedJson, destinationDoc, chapters, worldItems, characters);
            }
            if (parsedJson.texto_original_exacto) {
                return parseToolCallResponse('localizar_parche_exacto', parsedJson, destinationDoc, chapters, worldItems, characters);
            }
            if (parsedJson.texto_original) {
                return parseToolCallResponse('aplicar_parche', parsedJson, destinationDoc, chapters, worldItems, characters);
            }
        } catch (e) {}
    }

    const parsedXml = tryParseAIXml(response);
    if (parsedXml) {
        return buildBlocksFromParsed(parsedXml, destinationDoc, chapters, worldItems, characters);
    }

    const parsed = tryParseAIJson(response);
    if (parsed) {
        return buildBlocksFromParsed(parsed, destinationDoc, chapters, worldItems, characters);
    }

    const html = extractHtmlContent(response);

    if (html) {
        const dest = destinationDoc || { mode: 'auto' };
        if (dest.mode === 'new') {
            const blockTitle = dest.docTitle || detectTitleFromContent(html) || 'Nuevo capítulo';
            return [{ docType: 'chapter', docId: null, mode: 'new', title: blockTitle, content: html, responseType: 'content' }];
        } else if (dest.mode === 'manual' && dest.docId) {
            return [{ docType: dest.docType, docId: dest.docId, mode: 'manual', title: dest.docTitle || 'Documento', content: html, responseType: 'content' }];
        } else {
            const blockTitle = detectTitleFromContent(html) || 'Automático';
            return [{ docType: 'chapter', docId: null, mode: 'auto', title: blockTitle, content: html, responseType: 'content' }];
        }
    }

    if (response.trim() && !response.startsWith('===')) {
        return [{ docType: 'text', docId: null, mode: 'text', title: 'Respuesta', content: response.trim(), responseType: 'analysis' }];
    }

    return [];
};

/**
 * Parsea respuestas de DeepSeek Tool Calling a la estructura de bloques interna.
 */
export const parseToolCallResponse = (name, argsJson, destinationDoc, chapters = [], worldItems = [], characters = []) => {
    if (!name || !argsJson) return [];
    
    let args = {};
    try {
        args = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
    } catch (e) {
        const cleanJson = typeof argsJson === 'string' ? argsJson.trim() : '';
        try {
            const extractProp = (propName) => {
                const r = new RegExp(`"${propName}"\\s*:\\s*"([^"]*)"`, 'i');
                const m = r.exec(cleanJson);
                return m ? m[1] : '';
            };
            if (name === 'crear_capitulo') {
                args.titulo = extractProp('titulo');
                args.contenido_html = extractProp('contenido_html');
            } else if (name === 'aplicar_parche') {
                args.documento_id = extractProp('documento_id');
                args.texto_original = extractProp('texto_original');
                args.texto_reemplazo = extractProp('texto_reemplazo');
                args.contexto_linea = extractProp('contexto_linea');
            } else if (name === 'registrar_inconsistencia') {
                args.titulo = extractProp('titulo');
                args.problema = extractProp('problema');
            }
        } catch (innerErr) {}
    }

    if (name === 'crear_capitulo') {
        let dest = destinationDoc || { mode: 'auto' };
        
        // 1. DESTINO ESPECÍFICO (Manual): Si seleccionaste un capítulo existente (ej. Capítulo 1 vacío)
        if (dest.mode === 'manual' && dest.docId) {
            return [{
                docType: dest.docType || 'chapter',
                docId: dest.docId,
                mode: 'manual',
                title: dest.docTitle || args.titulo || 'Documento',
                content: args.contenido_html || '',
                responseType: 'content'
            }];
        }
        
        // 2. DESTINO AUTOMÁTICO: Si la IA decide basándose en el título que generó
        if (dest.mode === 'auto' && args.titulo) {
            const resolved = resolveTargetDoc(args.titulo, chapters, worldItems, characters);
            if (resolved) {
                return [{
                    docType: resolved.docType,
                    docId: resolved.docId,
                    mode: 'manual',
                    title: resolved.title,
                    content: args.contenido_html || '',
                    responseType: 'content'
                }];
            }
        }
        
        // 3. CREAR NUEVO DOCUMENTO (o Automático sin coincidencias de título)
        return [{
            docType: 'chapter',
            docId: null,
            mode: dest.mode === 'new' ? 'new' : 'auto',
            title: args.titulo || 'Nuevo capítulo',
            content: args.contenido_html || '',
            responseType: 'content'
        }];
    }

    if (name === 'aplicar_parche') {
        let dest = destinationDoc || { mode: 'auto' };
        if (args.documento_id) {
            const resolved = resolveTargetDoc(args.documento_id, chapters, worldItems, characters);
            if (resolved) {
                dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
            } else {
                dest = { mode: 'auto', docTitle: args.documento_id };
            }
        }
        return [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: dest.docTitle || 'Fragmento',
            content: args.texto_reemplazo || '',
            original: args.texto_original || '',
            responseType: 'patch',
            isPatch: true,
            context: args.contexto_linea || ''
        }];
    }

    if (name === 'registrar_inconsistencia') {
        const inconsistencies = [];
        const rawIncList = Array.isArray(args.inconsistencias) ? args.inconsistencias : [];
        
        if (rawIncList.length === 0 && (args.titulo || args.problema)) {
            rawIncList.push({
                titulo: args.titulo,
                problema: args.problema,
                archivos_involucrados: args.archivos_involucrados,
                opciones_resolucion: args.opciones_resolucion
            });
        }
        
        rawIncList.forEach(incItem => {
            if (!incItem) return;
            inconsistencies.push({
                id: 'inc_' + Math.random().toString(36).substr(2, 9),
                files: Array.isArray(incItem.archivos_involucrados) 
                    ? incItem.archivos_involucrados.map(f => {
                        const resolved = resolveTargetDoc(f, chapters, worldItems, characters);
                        return resolved ? resolved.docId : f;
                      })
                    : [],
                title: incItem.titulo || 'Conflicto de lore',
                problem: incItem.problema || '',
                options: Array.isArray(incItem.opciones_resolucion)
                    ? incItem.opciones_resolucion.map(o => ({
                        letter: (o.letra || '').toUpperCase().trim(),
                        text: o.texto || ''
                      }))
                    : [],
                resolved: false,
                selectedOption: null,
                customText: ''
            });
        });

        return [{
            docType: 'text',
            docId: null,
            mode: 'text',
            title: 'Inconsistencias',
            content: 'Se han detectado inconsistencias de lore.',
            responseType: 'inconsistencies',
            inconsistencies: inconsistencies
        }];
    }

    if (name === 'aplicar_parches_resolucion') {
        const parches = Array.isArray(args.parches) ? args.parches : [];
        return parches.map(patch => {
            let dest = destinationDoc || { mode: 'auto' };
            if (patch.documento_id) {
                const resolved = resolveTargetDoc(patch.documento_id, chapters, worldItems, characters);
                if (resolved) {
                    dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
                } else {
                    dest = { mode: 'auto', docTitle: patch.documento_id };
                }
            }
            return {
                docType: dest.docType || null,
                docId: dest.docId || null,
                mode: dest.mode || 'auto',
                title: dest.docTitle || patch.documento_id || 'Fragmento',
                content: patch.texto_reemplazo || '',
                original: patch.texto_original || '',
                responseType: 'patch',
                isPatch: true,
                context: 'Resolución de conflicto'
            };
        });
    }

    if (name === 'localizar_parche_exacto') {
        let dest = destinationDoc || { mode: 'auto' };
        if (args.documento_id) {
            const resolved = resolveTargetDoc(args.documento_id, chapters, worldItems, characters);
            if (resolved) {
                dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
            } else {
                dest = { mode: 'auto', docTitle: args.documento_id };
            }
        }
        return [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: dest.docTitle || 'Fragmento',
            content: args.texto_reemplazo || '',
            original: args.texto_original_exacto || '',
            responseType: 'patch',
            isPatch: true,
            context: 'Autocorrección de parche'
        }];
    }

    if (name === 'sugerir_nombres' || name === 'proponer_preguntas_entrevista' || name === 'sugerir_respuestas_rapidas') {
        return [{
            docType: 'text',
            docId: null,
            mode: 'text',
            title: 'Asistente de Personajes',
            content: typeof argsJson === 'string' ? argsJson : JSON.stringify(args),
            responseType: 'analysis'
        }];
    }

    if (name === 'aplicar_formateo_lectura') {
        let dest = destinationDoc || { mode: 'auto' };
        if (args.documento_id) {
            const resolved = resolveTargetDoc(args.documento_id, chapters, worldItems, characters);
            if (resolved) {
                dest = { mode: 'manual', docType: resolved.docType, docId: resolved.docId, docTitle: resolved.title };
            } else {
                dest = { mode: 'auto', docTitle: args.documento_id };
            }
        }
        const rawFormatted = args.texto_formateado || '';
        const htmlFormatted = rawFormatted
            .split(/\n\n+/)
            .map(block => block.trim())
            .filter(Boolean)
            .map(block => `<p>${block.replace(/\n/g, '<br/>')}</p>`)
            .join('\n');

        return [{
            docType: dest.docType || 'chapter',
            docId: dest.docId || null,
            mode: dest.mode || 'auto',
            title: dest.docTitle || args.documento_id || 'Documento',
            content: htmlFormatted,
            original: '',
            responseType: 'format',
            isPatch: false,
            isFormat: true,
            context: 'Formateo de espaciado'
        }];
    }

    return [];
};
