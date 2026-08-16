const decodeBasicEntities = (value) => value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

export const toPlainText = (value) => decodeBasicEntities(String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim());

const splitSentences = (value) => value.match(/[^.!?…]+[.!?…]+(?:["”»])?|[^.!?…]+$/g) || [value];

export const formatDraftText = (value) => {
    const plain = toPlainText(value);
    if (!plain) return '';
    const existingBlocks = plain.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    const sourceBlocks = existingBlocks.length > 1 ? existingBlocks : plain.replace(/\s+(?=—)/g, '\n\n').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    const paragraphs = [];
    sourceBlocks.forEach((block) => {
        if (block.startsWith('—') || block.length < 650) {
            paragraphs.push(block);
            return;
        }
        let current = '';
        splitSentences(block).forEach((sentence) => {
            const next = current ? `${current} ${sentence.trim()}` : sentence.trim();
            if (current && (next.length >= 420 || splitSentences(current).length >= 4)) {
                paragraphs.push(current.trim());
                current = sentence.trim();
            } else {
                current = next;
            }
        });
        if (current) paragraphs.push(current.trim());
    });
    return paragraphs.join('\n\n');
};

const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const toEditorHtml = (value) => formatDraftText(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');

const getTextNodes = (root) => {
    const nodes = [];
    if (typeof document === 'undefined' || typeof document.createTreeWalker !== 'function') return nodes;
    const showText = typeof NodeFilter === 'undefined' ? 4 : NodeFilter.SHOW_TEXT;
    const walker = document.createTreeWalker(root, showText);
    let node = walker.nextNode();
    while (node) {
        nodes.push(node);
        node = walker.nextNode();
    }
    return nodes;
};

const normalizeForMatch = (value) => String(value || '')
    .normalize('NFKC')
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\u00a0/g, ' ');

const locatePlainRange = (textNodes, fullText, searchText) => {
    const exactStart = fullText.indexOf(searchText);
    if (exactStart >= 0) return { start: exactStart, end: exactStart + searchText.length };
    const buildIndex = (value) => {
        let normalized = '';
        const map = [];
        let wasSpace = false;
        normalizeForMatch(value).split('').forEach((character, index) => {
            if (/\s/.test(character)) {
                if (wasSpace) return;
                normalized += ' ';
                map.push(index);
                wasSpace = true;
                return;
            }
            normalized += character;
            map.push(index);
            wasSpace = false;
        });
        return { normalized, map };
    };
    const indexedFull = buildIndex(fullText);
    const normalizedSearch = normalizeForMatch(searchText).replace(/\s+/g, ' ').trim();
    const normalizedStart = indexedFull.normalized.indexOf(normalizedSearch);
    if (normalizedStart < 0 || !normalizedSearch) return null;
    const start = indexedFull.map[normalizedStart];
    const last = indexedFull.map[normalizedStart + normalizedSearch.length - 1];
    return { start, end: last === undefined ? start : last + 1 };
};

export const applyPlainTextPatch = (content, originalText, replacementText) => {
    const source = String(content || '');
    const original = String(originalText || '');
    const replacement = String(replacementText || '');
    if (!original || replacement === undefined || replacement === null) return null;
    if (source.includes(original)) return source.replace(original, replacement);
    if (typeof DOMParser === 'undefined') {
        const range = locatePlainRange([], source, original);
        return range ? `${source.slice(0, range.start)}${replacement}${source.slice(range.end)}` : null;
    }
    const parser = new DOMParser();
    const root = parser.parseFromString(`<div>${source}</div>`, 'text/html').body.firstElementChild;
    if (!root) return null;
    const textNodes = getTextNodes(root);
    const fullText = textNodes.map((node) => node.nodeValue || '').join('');
    const range = locatePlainRange(textNodes, fullText, normalizeForMatch(original));
    if (!range) return null;
    let cursor = 0;
    let startNode = null;
    let endNode = null;
    let startOffset = 0;
    let endOffset = 0;
    textNodes.forEach((node) => {
        const length = (node.nodeValue || '').length;
        if (!startNode && range.start >= cursor && range.start <= cursor + length) {
            startNode = node;
            startOffset = range.start - cursor;
        }
        if (!endNode && range.end > cursor && range.end <= cursor + length) {
            endNode = node;
            endOffset = range.end - cursor;
        }
        cursor += length;
    });
    if (!startNode || !endNode) return null;
    if (startNode === endNode) {
        const value = startNode.nodeValue || '';
        startNode.nodeValue = `${value.slice(0, startOffset)}${replacement}${value.slice(endOffset)}`;
    } else {
        const startValue = startNode.nodeValue || '';
        const endValue = endNode.nodeValue || '';
        startNode.nodeValue = `${startValue.slice(0, startOffset)}${replacement}`;
        endNode.nodeValue = endValue.slice(endOffset);
        const startIndex = textNodes.indexOf(startNode);
        const endIndex = textNodes.indexOf(endNode);
        textNodes.slice(startIndex + 1, endIndex).forEach((node) => { node.nodeValue = ''; });
    }
    return root.innerHTML;
};

export default toPlainText;
