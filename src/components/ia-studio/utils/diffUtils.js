/**
 * diffUtils.js
 * Capa 1 — Motor de Parches y Diferencias
 */

import DiffMatchPatch from 'diff-match-patch';
import { plainTextToHtml, cleanText } from './textUtils';

const _dmp = new DiffMatchPatch();

/**
 * Computa un diff a nivel de PALABRA en vez de carácter.
 * Tokeniza ambos textos en palabras y espacios, mapea cada token a un caracter único,
 * ejecuta DMP sobre los caracteres, y re-expande a los tokens originales.
 */
export const computeWordDiff = (textA, textB) => {
    if (!textA && !textB) return [];
    if (!textA) return [[1, textB]];
    if (!textB) return [[-1, textA]];

    const wordArray = [''];  // index 0 no se usa
    const wordHash = {};

    const wordsToChars = (text) => {
        const tokens = text.match(/\S+|\s+/g) || [];
        return tokens.map(token => {
            if (token in wordHash) {
                return wordHash[token];
            }
            wordArray.push(token);
            const char = String.fromCharCode(wordArray.length - 1);
            wordHash[token] = char;
            return char;
        }).join('');
    };

    const chars1 = wordsToChars(textA);
    const chars2 = wordsToChars(textB);

    const diffs = _dmp.diff_main(chars1, chars2);
    _dmp.diff_cleanupSemantic(diffs);

    return diffs.map(([op, chars]) => {
        const decoded = Array.from(chars).map(c => wordArray[c.charCodeAt(0)]).join('');
        return [op, decoded];
    });
};

/**
 * Comprueba si dos textos comparten un substring común de al menos minLen caracteres.
 * Búsqueda optimizada: solo examina substrings cada `stride` posiciones.
 */
export const hasLongCommonSubstring = (a, b, minLen = 40) => {
    if (!a || !b || a.length < minLen || b.length < minLen) return false;
    const stride = Math.max(1, Math.floor(minLen / 2));
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    for (let i = 0; i <= shorter.length - minLen; i += stride) {
        const sub = shorter.substring(i, i + minLen);
        if (longer.includes(sub)) return true;
    }
    return false;
};

/**
 * Smart merge: fusiona una respuesta parcial de la IA con el documento original.
 */
export const smartMergePartialResponse = (originalText, partialText) => {
    const diffs = computeWordDiff(originalText, partialText);

    let result = '';
    let i = 0;

    while (i < diffs.length) {
        const [op] = diffs[i];

        if (op === 0) {
            result += diffs[i][1];
            i++;
            continue;
        }

        let deleteText = '';
        let insertText = '';
        while (i < diffs.length && diffs[i][0] !== 0) {
            if (diffs[i][0] === -1) deleteText += diffs[i][1];
            if (diffs[i][0] === 1) insertText += diffs[i][1];
            i++;
        }

        const deleteWords = deleteText.trim().split(/\s+/).filter(Boolean).length;
        const insertWords = insertText.trim().split(/\s+/).filter(Boolean).length;

        const insertRatio = deleteWords > 0 ? insertWords / deleteWords : 0;
        if (deleteWords > 50 && insertRatio < 0.15) {
            const deletePreview = deleteText.substring(0, Math.min(200, deleteText.length));
            const insertPreview = insertText.substring(0, Math.min(200, insertText.length));
            const hasCommonPhrase = hasLongCommonSubstring(deletePreview, insertPreview, 40);
            
            if (!hasCommonPhrase) {
                result += deleteText;
                if (insertText.trim()) {
                    result += '\n' + insertText;
                }
                continue;
            }
        }

        if (deleteWords > 50 && insertRatio < 0.3) {
            result += deleteText;
        } else {
            result += insertText;
        }
    }

    const originalWords = originalText.trim().split(/\s+/).filter(Boolean).length;
    const resultWords = result.trim().split(/\s+/).filter(Boolean).length;
    if (originalWords > 100 && resultWords < originalWords * 0.6) {
        return originalText + '\n\n' + result;
    }

    return result;
};

/**
 * Calcula la longitud del substring común más largo (LCS simplificado para scoring)
 */
export const longestCommonSubstring = (a, b) => {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    let maxLen = 0;
    for (let i = 0; i < shorter.length - 10; i++) {
        const sub = shorter.substring(i, i + 20);
        if (longer.includes(sub)) {
            maxLen = Math.max(maxLen, sub.length);
        }
    }
    return maxLen;
};

/**
 * Aplica un patch al HTML de un documento.
 * Busca el texto `original` en el HTML y lo reemplaza con `replacement`.
 * Tolerante a diferencias menores de espacios/formato.
 */
export const applyPatch = (chapterHtml, original, replacement) => {
    if (!original) {
        return { success: false, html: chapterHtml, method: 'none' };
    }

    if (!chapterHtml || chapterHtml.trim() === '' || chapterHtml === '<p></p>') {
        return {
            success: true,
            html: replacement,
            method: 'empty_document_fallback',
        };
    }

    try {
        const stripHtml = (s) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
        const plainOriginal = stripHtml(original);
        const plainDoc = stripHtml(chapterHtml);

        if (plainOriginal.length > 5 && plainDoc.includes(plainOriginal)) {
            const plainIdx = plainDoc.indexOf(plainOriginal);
            const wordsBeforeMatch = plainDoc.substring(0, plainIdx).split(/\s+/).filter(Boolean).length;
            const wordsInMatch = plainOriginal.split(/\s+/).filter(Boolean).length;

            const wordPositions = [];
            const wordRegex = /[^\s<>][^<>]*/g;
            let htmlCopy = chapterHtml;
            const tagRanges = [];
            const tagRegex = /<[^>]*>/g;
            let tagMatch;
            while ((tagMatch = tagRegex.exec(htmlCopy)) !== null) {
                tagRanges.push({ start: tagMatch.index, end: tagMatch.index + tagMatch[0].length });
            }
            const isInsideTag = (pos) => tagRanges.some(r => pos >= r.start && pos < r.end);

            let wordIdx = 0;
            let i = 0;
            while (i < htmlCopy.length) {
                if (isInsideTag(i)) {
                    const tag = tagRanges.find(r => r.start === i);
                    if (tag) { i = tag.end; continue; }
                }
                if (/\S/.test(htmlCopy[i])) {
                    let wordStart = i;
                    while (i < htmlCopy.length && /\S/.test(htmlCopy[i]) && !isInsideTag(i)) i++;
                    wordPositions.push({ wordIndex: wordIdx++, charStart: wordStart, charEnd: i });
                } else {
                    i++;
                }
            }

            if (wordPositions.length > wordsBeforeMatch + wordsInMatch - 1) {
                const firstWord = wordPositions[wordsBeforeMatch];
                const lastWord = wordPositions[Math.min(wordsBeforeMatch + wordsInMatch - 1, wordPositions.length - 1)];
                if (firstWord && lastWord) {
                    const htmlBefore = chapterHtml.substring(0, firstWord.charStart);
                    const htmlAfter = chapterHtml.substring(lastWord.charEnd);
                    const hasHtmlTags = /<[a-z][^>]*>/i.test(replacement);
                    const finalReplacement = hasHtmlTags ? replacement : `<p>${replacement}</p>`;
                    return {
                        success: true,
                        html: htmlBefore + finalReplacement + htmlAfter,
                        method: 'plaintext_normalized_match'
                    };
                }
            }
        }
    } catch (_normErr) {
        // Continuar con los métodos siguientes si la normalización falla
    }

    if (chapterHtml.includes(original)) {
        return {
            success: true,
            html: chapterHtml.replace(original, replacement),
            method: 'exact_html',
        };
    }

    try {
        const tokenizeHtml = (html) => {
            const tokens = [];
            let i = 0;
            const len = html.length;

            while (i < len) {
                const char = html[i];
                if (char === '<') {
                    const endIdx = html.indexOf('>', i);
                    if (endIdx !== -1) {
                        tokens.push({ type: 'tag', text: html.substring(i, endIdx + 1), index: i });
                        i = endIdx + 1;
                        continue;
                    }
                }
                if (/\s/.test(char)) {
                    let start = i;
                    while (i < len && /\s/.test(html[i])) i++;
                    tokens.push({ type: 'whitespace', text: html.substring(start, i), index: start });
                    continue;
                }
                let start = i;
                while (i < len && html[i] !== '<' && !/\s/.test(html[i])) i++;
                tokens.push({ type: 'word', text: html.substring(start, i), index: start });
            }
            return tokens;
        };

        const normalizeWord = (w) => {
            return w.trim().toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, "");
        };

        const htmlTokens = tokenizeHtml(chapterHtml);
        const htmlWords = [];
        for (let idx = 0; idx < htmlTokens.length; idx++) {
            const t = htmlTokens[idx];
            if (t.type === 'word') {
                const norm = normalizeWord(t.text);
                if (norm) {
                    htmlWords.push({
                        normalized: norm,
                        tokenIndex: idx,
                        charIndex: t.index
                    });
                }
            }
        }

        const originalTokens = tokenizeHtml(original);
        const originalWords = [];
        for (const t of originalTokens) {
            if (t.type === 'word') {
                const norm = normalizeWord(t.text);
                if (norm) originalWords.push(norm);
            }
        }

        if (originalWords.length > 0 && htmlWords.length >= originalWords.length) {
            let matchStartIndex = -1;
            let matchEndIndex = -1;
            const wordLen = originalWords.length;

            const buildKMPFailure = (pattern) => {
                const failure = new Array(pattern.length).fill(0);
                let j = 0;
                for (let i = 1; i < pattern.length; i++) {
                    while (j > 0 && pattern[i] !== pattern[j]) j = failure[j - 1];
                    if (pattern[i] === pattern[j]) j++;
                    failure[i] = j;
                }
                return failure;
            };

            const textNormWords = htmlWords.map(w => w.normalized);
            const failure = buildKMPFailure(originalWords);
            let kmpJ = 0;
            let kmpMatchStart = -1;
            for (let i = 0; i < textNormWords.length; i++) {
                while (kmpJ > 0 && textNormWords[i] !== originalWords[kmpJ]) kmpJ = failure[kmpJ - 1];
                if (textNormWords[i] === originalWords[kmpJ]) kmpJ++;
                if (kmpJ === wordLen) {
                    kmpMatchStart = i - wordLen + 1;
                    break;
                }
            }

            if (kmpMatchStart !== -1) {
                matchStartIndex = htmlWords[kmpMatchStart].tokenIndex;
                matchEndIndex = htmlWords[kmpMatchStart + wordLen - 1].tokenIndex;
            }

            if (matchStartIndex === -1) {
                let bestScore = 0;
                let bestStart = -1;
                let bestEnd = -1;

                for (let i = 0; i <= htmlWords.length - wordLen; i++) {
                    let score = 0;
                    for (let j = 0; j < wordLen; j++) {
                        if (htmlWords[i + j].normalized === originalWords[j]) {
                            score++;
                        }
                    }
                    if (score > bestScore) {
                        bestScore = score;
                        bestStart = htmlWords[i].tokenIndex;
                        bestEnd = htmlWords[i + wordLen - 1].tokenIndex;
                    }
                }

                if (bestScore / wordLen >= 0.70) {
                    matchStartIndex = bestStart;
                    matchEndIndex = bestEnd;
                }
            }

            if (matchStartIndex !== -1 && matchEndIndex !== -1) {
                const startCharIndex = htmlTokens[matchStartIndex].index;
                const endToken = htmlTokens[matchEndIndex];
                const endCharIndex = endToken.index + endToken.text.length;

                let cleanReplacement = replacement;
                const trimmedRep = replacement.trim();
                if (trimmedRep.toLowerCase().startsWith('<p>') && trimmedRep.toLowerCase().endsWith('</p>')) {
                    cleanReplacement = trimmedRep.substring(3, trimmedRep.length - 4);
                } else if (trimmedRep.toLowerCase().startsWith('<p ') && trimmedRep.toLowerCase().endsWith('</p>')) {
                    const firstClose = trimmedRep.indexOf('>');
                    if (firstClose !== -1) {
                        cleanReplacement = trimmedRep.substring(firstClose + 1, trimmedRep.length - 4);
                    }
                }

                const newHtml = chapterHtml.substring(0, startCharIndex)
                    + cleanReplacement
                    + chapterHtml.substring(endCharIndex);

                return {
                    success: true,
                    html: newHtml,
                    method: 'word_sequence_mapping'
                };
            }
        }
    } catch (err) {
        // Ignorar silenciado en producción
    }

    const originalClean = cleanText(original).toLowerCase().replace(/\s+/g, ' ').trim();

    const paragraphRegex = /<(p|h[1-6]|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    const paragraphs = [];

    while ((match = paragraphRegex.exec(chapterHtml)) !== null) {
        paragraphs.push({
            full: match[0],
            tag: match[1],
            innerText: cleanText(match[2]).toLowerCase().replace(/\s+/g, ' ').trim(),
            index: match.index,
        });
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const para of paragraphs) {
        if (originalClean.length > 20 && para.innerText.includes(originalClean.substring(0, 40))) {
            const score = longestCommonSubstring(para.innerText, originalClean);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = para;
            }
        }
    }

    if (bestMatch && bestScore > 30) {
        const newHtml = chapterHtml.substring(0, bestMatch.index)
            + replacement
            + chapterHtml.substring(bestMatch.index + bestMatch.full.length);
        return { success: true, html: newHtml, method: 'fuzzy_paragraph' };
    }

    return { success: false, html: chapterHtml, method: 'not_found' };
};
