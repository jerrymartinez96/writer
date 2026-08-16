import React from 'react';
import { toPlainText } from '../../services/ai-next/plainText';

const SanitizedContentPreview = ({ content = '', className = '' }) => {
    const plainContent = toPlainText(content);
    return <div className={`whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-main)] ${className}`}>{plainContent || '(vacío)'}</div>;
};

export default SanitizedContentPreview;
