import React, { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Copy } from 'lucide-react'
import { useToast } from './Toast'

const RichTextEditor = ({ content, onChange, onBlur, placeholder = 'Escribe aquí...', className = '', isEditable = true }) => {
    const toast = useToast()
    
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                bold: false,
                italic: false,
                heading: false,
                strike: false,
                code: false,
                blockquote: false,
                bulletList: false,
                orderedList: false,
                listItem: false,
                codeBlock: false,
                horizontalRule: false,
            }),
            Placeholder.configure({
                placeholder,
            }),
        ],
        content: content || '',
        editorProps: {
            attributes: {
                class: 'prose mx-auto focus:outline-none h-full max-w-none custom-scrollbar text-[var(--text-main)]',
            },
        },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML()
            if (onChange) {
                onChange(html)
            }
        },
        onBlur: ({ editor }) => {
            if (onBlur) {
                onBlur(editor.getHTML())
            }
        },
        editable: isEditable,
    })

    // Sync content when external content changes (if not focused)
    const isFocused = editor?.isFocused
    useEffect(() => {
        if (editor && content !== undefined && !isFocused) {
            const currentHtml = editor.getHTML()
            if (currentHtml !== content) {
                editor.commands.setContent(content || '', false)
            }
        }
    }, [content, editor, isFocused])

    // Sync editable status
    useEffect(() => {
        if (editor) {
            editor.setEditable(isEditable)
        }
    }, [isEditable, editor])

    return (
        <div className={`rich-text-editor-wrapper relative h-full flex flex-col ${className}`}>
            {editor && (
                <BubbleMenu
                    editor={editor}
                    tippyOptions={{ duration: 150 }}
                    shouldShow={({ state, from, to }) => {
                        return from !== to && !state.selection.empty && isEditable;
                    }}
                    className="flex items-center gap-1.5 bg-[var(--bg-app)]/85 backdrop-blur-2xl border border-white/10 p-1.5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-indigo-500/10 shadow-indigo-950/20 z-[9999]"
                >
                    <button
                        type="button"
                        onClick={() => {
                            const { from, to } = editor.state.selection;
                            const text = editor.state.doc.textBetween(from, to, ' ');
                            navigator.clipboard.writeText(text);
                            toast.success('¡Copiado!');
                        }}
                        className="h-10 px-4 flex items-center justify-center rounded-xl bg-[var(--accent-main)]/10 text-[var(--accent-main)] hover:bg-[var(--accent-main)] hover:text-white transition-all duration-300 gap-2 font-black text-[10px] uppercase tracking-[0.15em] hover:scale-[1.03] active:scale-95 shadow-sm active:shadow-none cursor-pointer"
                        title="Copiar Selección"
                    >
                        <Copy size={13} className="transition-transform group-hover:scale-110" />
                        <span className="pr-0.5 leading-none">Copiar</span>
                    </button>
                </BubbleMenu>
            )}
            
            <div 
                className="flex-1 overflow-y-auto outline-none"
                onClick={() => isEditable && editor?.commands.focus()}
            >
                <EditorContent editor={editor} className="min-h-full cursor-text" />
            </div>
        </div>
    )
}

export default RichTextEditor
