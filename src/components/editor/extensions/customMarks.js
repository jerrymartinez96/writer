import { Mark, mergeAttributes } from '@tiptap/react'

export const CharacterMention = Mark.create({
    name: 'characterMention',
    addOptions() {
        return {
            HTMLAttributes: {
                class: 'character-mention cursor-pointer font-bold text-[var(--accent-main)] hover:bg-[var(--accent-soft)] px-0.5 rounded transition-colors border-b-2 border-dashed border-[var(--accent-main)]/50',
            },
        }
    },
    addAttributes() {
        return {
            charId: {
                default: null,
                parseHTML: element => element.getAttribute('data-char-id'),
                renderHTML: attributes => {
                    if (!attributes.charId) return {}
                    return { 'data-char-id': attributes.charId }
                },
            },
        }
    },
    parseHTML() {
        return [{ tag: 'span[data-char-id]' }]
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    },
})

export const InlineNote = Mark.create({
    name: 'inlineNote',
    addOptions() {
        return {
            HTMLAttributes: {
                class: 'inline-note',
            },
        }
    },
    addAttributes() {
        return {
            noteId: {
                default: null,
                parseHTML: element => element.getAttribute('data-note-id'),
                renderHTML: attributes => {
                    if (!attributes.noteId) return {}
                    return { 'data-note-id': attributes.noteId }
                },
            },
            noteText: {
                default: '',
                parseHTML: element => element.getAttribute('data-note-text'),
                renderHTML: attributes => {
                    return { 'data-note-text': attributes.noteText || '' }
                },
            },
        }
    },
    parseHTML() {
        return [{ tag: 'mark[data-note-id]' }]
    },
    renderHTML({ HTMLAttributes }) {
        return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    },
})

export const GhostMention = Mark.create({
    name: 'ghostMention',
    addOptions() {
        return {
            HTMLAttributes: {
                class: 'ghost-mention-node',
            },
        }
    },
    addAttributes() {
        return {
            charId: {
                default: null,
                parseHTML: element => element.getAttribute('data-char-id'),
                renderHTML: attributes => {
                    if (!attributes.charId) return {}
                    return { 'data-char-id': attributes.charId }
                },
            },
        }
    },
    parseHTML() {
        return [{ tag: 'span[data-ghost-char-id]' }]
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(this.options.HTMLAttributes, { 'data-ghost-char-id': HTMLAttributes.charId }), 0]
    },
})
