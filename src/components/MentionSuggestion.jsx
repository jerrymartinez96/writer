import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

const MentionList = forwardRef((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    const selectItem = (index) => {
        const item = props.items[index]
        if (item) {
            props.command({ id: item.id, label: item.name })
        }
    }

    const upHandler = () => {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
    }

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % props.items.length)
    }

    const enterHandler = () => {
        selectItem(selectedIndex)
    }

    useEffect(() => setSelectedIndex(0), [props.items])

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (event.key === 'ArrowUp') {
                upHandler()
                return true
            }
            if (event.key === 'ArrowDown') {
                downHandler()
                return true
            }
            if (event.key === 'Enter') {
                enterHandler()
                return true
            }
            return false
        },
    }))

    if (!props.items.length) {
        return (
            <div className="mention-dropdown">
                <div className="mention-item-empty">
                    Sin resultados
                </div>
            </div>
        )
    }

    return (
        <div className="mention-dropdown">
            {props.items.map((item, index) => (
                <button
                    key={item.id}
                    className={`mention-item ${index === selectedIndex ? 'is-selected' : ''}`}
                    onClick={() => selectItem(index)}
                >
                    <div className="mention-item-avatar">
                        {item.images && item.images.length > 0 ? (
                            <img src={item.images[0]} alt={item.name} />
                        ) : (
                            <span>{item.name?.charAt(0)?.toUpperCase()}</span>
                        )}
                    </div>
                    <div className="mention-item-info">
                        <span className="mention-item-name">{item.name}</span>
                        {item.role && <span className="mention-item-role">{item.role}</span>}
                    </div>
                </button>
            ))}
        </div>
    )
})

MentionList.displayName = 'MentionList'

export default MentionList
