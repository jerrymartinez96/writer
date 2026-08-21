import { describe, expect, it } from 'vitest';
import { buildEditorClipboardText, clipboardTextToEditorHtml } from './editorClipboard';

describe('editorClipboard', () => {
    it('builds title, text and complete clipboard variants', () => {
        const input = { title: 'La puerta', prefix: 'Capítulo 2: ', text: 'Texto del capítulo.' };

        expect(buildEditorClipboardText({ ...input, mode: 'title' })).toBe('Capítulo 2: La puerta');
        expect(buildEditorClipboardText({ ...input, mode: 'text' })).toBe('Texto del capítulo.');
        expect(buildEditorClipboardText({ ...input, mode: 'all' })).toBe('Capítulo 2: La puerta\n\nTexto del capítulo.');
    });

    it('converts pasted text to safe editor HTML while preserving basic Markdown', () => {
        expect(clipboardTextToEditorHtml('# Inicio\nTexto con **fuerza** y *énfasis*.\n<script>alert(1)</script>')).toBe(
            '<h1>Inicio</h1><p>Texto con <strong>fuerza</strong> y <em>énfasis</em>.</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
        );
    });
});

