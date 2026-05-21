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
            StarterKit,
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
                    className="flex items-center gap-1 bg-[var(--bg-app)]/80 backdrop-blur-xl border border-white/20 p-1.5 rounded-2xl shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-200 z-[9999]"
                >
                    <div className="flex items-center gap-0.5 px-1 border-r border-white/10 mr-1">
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${editor.isActive('bold') ? 'bg-[var(--accent-main)] text-white' : 'text-[var(--text-main)] hover:bg-white/10'}`}
                            title="Negrita"
                        >
                            <span className="font-bold text-sm">B</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${editor.isActive('italic') ? 'bg-[var(--accent-main)] text-white' : 'text-[var(--text-main)] hover:bg-white/10'}`}
                            title="Cursiva"
                        >
                            <span className="italic font-serif text-sm">I</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-0.5 px-1 border-r border-white/10 mr-1">
                        {[1, 2, 3].map(level => (
                            <button
                                type="button"
                                key={level}
                                onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
                                className={`w-8 h-8 flex items-center justify-center rounded-xl text-[10px] font-black transition-all ${editor.isActive('heading', { level }) ? 'bg-[var(--accent-main)] text-white' : 'text-[var(--text-main)] hover:bg-white/10'}`}
                                title={`Título ${level}`}
                            >
                                H{level}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            const { from, to } = editor.state.selection;
                            const text = editor.state.doc.textBetween(from, to, ' ');
                            navigator.clipboard.writeText(text);
                            toast.success('¡Copiado!');
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-[var(--accent-main)] hover:bg-[var(--accent-main)] hover:text-white transition-all ml-0.5"
                        title="Copiar Selección"
                    >
                        <Copy size={14} />
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
