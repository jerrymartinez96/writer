const normalizeWord = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const visibleWords = (html) => {
    const words = [];
    const tagPattern = /<[^>]*>/g;
    let cursor = 0;
    let tag;
    while ((tag = tagPattern.exec(html)) !== null) {
        const text = html.slice(cursor, tag.index);
        const offset = cursor;
        text.replace(/\S+/g, (word, index) => {
            words.push({ normalized: normalizeWord(word), start: offset + index, end: offset + index + word.length });
            return word;
        });
        cursor = tag.index + tag[0].length;
    }
    const tail = html.slice(cursor);
    tail.replace(/\S+/g, (word, index) => {
        words.push({ normalized: normalizeWord(word), start: cursor + index, end: cursor + index + word.length });
        return word;
    });
    return words.filter((word) => word.normalized);
};

export const applyPatch = (documentContent, original, replacement) => {
    const source = String(documentContent || '');
    const before = String(original || '');
    const next = String(replacement || '');
    if (!source.trim() || source === '<p></p>') return { success: true, html: next || '<p></p>', method: 'empty_document_fallback' };
    if (!before) return { success: false, html: source, method: 'none' };
    const sourceWords = visibleWords(source);
    const targetWords = before.replace(/<[^>]*>/g, ' ').split(/\s+/).map(normalizeWord).filter(Boolean);
    for (let index = 0; index <= sourceWords.length - targetWords.length; index += 1) {
        const matches = targetWords.every((word, offset) => sourceWords[index + offset].normalized === word);
        if (matches) {
            const start = sourceWords[index].start;
            const end = sourceWords[index + targetWords.length - 1].end;
            return { success: true, html: source.slice(0, start) + next + source.slice(end), method: 'word_sequence_match' };
        }
    }
    if (source.includes(before)) return { success: true, html: source.replace(before, next), method: 'exact_html' };
    return { success: false, html: source, method: 'none' };
};

export default applyPatch;
