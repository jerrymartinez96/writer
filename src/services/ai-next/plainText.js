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

const locatePlainRange = (textNodes, fullText, searchText) => {
    const exactStart = fullText.indexOf(searchText);
    if (exactStart >= 0) return { start: exactStart, end: exactStart + searchText.length };
    const compact = (value) => value.replace(/\s+/g, ' ');
    const compactFull = compact(fullText);
    const compactSearch = compact(searchText).trim();
    const compactStart = compactFull.indexOf(compactSearch);
    if (compactStart < 0 || !compactSearch) return null;
    const map = [];
    let compactIndex = 0;
    let wasSpace = false;
    for (let index = 0; index < fullText.length; index += 1) {
        const isSpace = /\s/.test(fullText[index]);
        if (isSpace && wasSpace) continue;
        map[compactIndex] = index;
        compactIndex += 1;
        wasSpace = isSpace;
    }
    const start = map[compactStart];
    const last = map[compactStart + compactSearch.length - 1];
    return { start, end: last === undefined ? start : last + 1 };
};

export const applyPlainTextPatch = (content, originalText, replacementText) => {
    const source = String(content || '');
    const original = String(originalText || '');
    const replacement = String(replacementText || '');
    if (!original || replacement === undefined || replacement === null) return null;
    if (source.includes(original)) return source.replace(original, replacement);
    if (typeof DOMParser === 'undefined') return null;
    const parser = new DOMParser();
    const root = parser.parseFromString(`<div>${source}</div>`, 'text/html').body.firstElementChild;
    if (!root) return null;
    const textNodes = getTextNodes(root);
    const fullText = textNodes.map((node) => node.nodeValue || '').join('');
    const range = locatePlainRange(textNodes, fullText, original);
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
