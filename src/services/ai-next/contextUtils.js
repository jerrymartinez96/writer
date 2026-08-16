import { toPlainText } from './plainText';

export const buildContextFromSelections = (activeBook, chapters = [], selectedChapterIds = [], characters = [], worldItems = [], selectedWorldItemIds = [], compressHeavy = false, selectedCharacterIds = []) => {
    void compressHeavy;
    const parts = [];
    if (activeBook) parts.push(`Libro: ${activeBook.title || 'Sin título'}\n${activeBook.description || ''}`);
    chapters.filter((item) => selectedChapterIds.includes(item.id)).forEach((item) => parts.push(`Capítulo: ${item.title}\n${toPlainText(item.content || '')}`));
    characters.filter((item) => selectedCharacterIds.includes(item.id)).forEach((item) => parts.push(`Personaje: ${item.name}\n${toPlainText(item.description || '')}`));
    worldItems.filter((item) => selectedWorldItemIds.includes(item.id)).forEach((item) => parts.push(`Mundo: ${item.title}\n${toPlainText(item.content || '')}`));
    return parts.join('\n\n');
};

export const estimateContextWeight = (chapters = [], selectedChapterIds = [], worldItems = [], selectedWorldItemIds = [], characters = [], selectedCharacterIds = []) => {
    const totalChars = [
        ...chapters.filter((item) => selectedChapterIds.includes(item.id)).map((item) => (item.content || '').length),
        ...worldItems.filter((item) => selectedWorldItemIds.includes(item.id)).map((item) => (item.content || '').length),
        ...characters.filter((item) => selectedCharacterIds.includes(item.id)).map((item) => (item.description || '').length),
    ].reduce((total, length) => total + length, 0);
    return { chars: totalChars, estimatedTokens: Math.ceil(totalChars / 3.8), isHeavy: totalChars > 50000 };
};
