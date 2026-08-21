const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatInlineMarkdown = (value) => escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

export const buildEditorClipboardText = ({ mode = 'text', title = '', prefix = '', text = '' }) => {
    if (mode === 'title') return `${prefix}${title}`;
    if (mode === 'all') return `${prefix}${title}\n\n${text}`.trim();
    return String(text || '');
};

export const clipboardTextToEditorHtml = (value) => String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
        if (line.startsWith('### ')) return `<h3>${formatInlineMarkdown(line.slice(4))}</h3>`;
        if (line.startsWith('## ')) return `<h2>${formatInlineMarkdown(line.slice(3))}</h2>`;
        if (line.startsWith('# ')) return `<h1>${formatInlineMarkdown(line.slice(2))}</h1>`;
        return `<p>${formatInlineMarkdown(line)}</p>`;
    })
    .join('');

