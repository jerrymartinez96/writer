import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import MentionList from './MentionSuggestion.jsx'

const createSuggestion = (characters) => ({
    items: ({ query }) => {
        const filtered = characters
            .filter(c => !c.isCategory && c.name && c.name.trim() !== '')
            .filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8)
        return filtered
    },

    render: () => {
        let component
        let popup

        return {
            onStart: (props) => {
                component = new ReactRenderer(MentionList, {
                    props,
                    editor: props.editor,
                })

                if (!props.clientRect) return

                popup = tippy('body', {
                    getReferenceClientRect: props.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                    animation: false,
                })
            },

            onUpdate(props) {
                component?.updateProps(props)

                if (!props.clientRect) return

                popup?.[0]?.setProps({
                    getReferenceClientRect: props.clientRect,
                })
            },

            onKeyDown(props) {
                if (props.event.key === 'Escape') {
                    popup?.[0]?.hide()
                    return true
                }
                return component?.ref?.onKeyDown(props)
            },

            onExit() {
                popup?.[0]?.destroy()
                component?.destroy()
            },
        }
    },
})

export default createSuggestion
