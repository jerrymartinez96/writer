import { jsPDF } from "jspdf";
import { convert } from "html-to-text";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } from "docx";
import { saveAs } from "file-saver";

class ExportService {
    /**
     * Limpia el contenido HTML de Tiptap para exportación en texto plano o PDF
     */
    static cleanContent(html) {
        if (!html) return '';
        return convert(html, {
            wordwrap: 130,
            selectors: [
                { selector: 'h1', options: { uppercase: true } },
                { selector: 'h2', options: { uppercase: true } },
                { selector: 'a', options: { ignoreHref: true } }
            ]
        });
    }

    /**
     * Exporta el libro en formato TXT
     */
    static async exportAsTXT(book, chapters, includeMasterDoc, characters = [], worldItems = []) {
        let content = `${book.title.toUpperCase()}\n`;
        content += `Autor: ${book.author || 'Escritor'}\n`;
        content += `Sinopsis: ${book.description || ''}\n`;
        content += `\n------------------------------------------------\n\n`;

        // Añadir capítulos
        const sortedChapters = [...chapters].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        
        sortedChapters.forEach((chapter, index) => {
            if (chapter.isVolume) {
                content += `\n\n=== SECCIÓN: ${chapter.title.toUpperCase()} ===\n\n`;
            } else {
                content += `\n\nCAPÍTULO ${index + 1}: ${chapter.title}\n`;
                content += `------------------------------------------------\n\n`;
                content += this.cleanContent(chapter.content);
                content += `\n\n`;
            }
        });

        if (includeMasterDoc) {
            content += `\n\n================================================\n`;
            content += `BIBLIA DEL PROYECTO\n`;
            content += `================================================\n\n`;

            if (characters.length > 0) {
                content += `--- PERSONAJES ---\n\n`;
                characters.forEach(char => {
                    content += `- ${char.name}${char.role ? ` (${char.role})` : ''}:\n  ${char.description || 'Sin descripción'}\n\n`;
                });
            }

            if (worldItems.length > 0) {
                content += `--- UNIVERSO Y NOTAS ---\n`;

                const renderItemsRecursive = (parentId, depth = 0) => {
                    const children = worldItems.filter(i => i.parentId === parentId);
                    if (children.length === 0) return '';

                    const indent = '  '.repeat(depth);
                    let text = '';

                    children.forEach(item => {
                        const cleanItemContent = item.content ? this.cleanContent(item.content) : '';
                        text += `${indent}${depth === 0 ? '■ ' : '└─ '}${item.title}${item.isCategory ? ' [CARPETA]' : ''}${cleanItemContent ? `\n${indent}   ${cleanItemContent.replace(/\n/g, '\n' + indent + '   ')}` : ''}\n\n`;
                        text += renderItemsRecursive(item.id, depth + 1);
                    });
                    return text;
                };

                const structureText = renderItemsRecursive('system_estructura');
                if (structureText) content += `\n[ESTRUCTURA]\n${structureText}`;

                const notesText = renderItemsRecursive('system_notas');
                if (notesText) content += `\n[NOTAS ADICIONALES]\n${notesText}`;

                // Dynamic root sections (not the system ones)
                const dynamicRoots = worldItems.filter(i => !i.parentId && i.id !== 'system_estructura' && i.id !== 'system_notas');
                if (dynamicRoots.length > 0) {
                    content += `\n[OTRAS SECCIONES]\n`;
                    dynamicRoots.forEach(item => {
                        const cleanItemContent = item.content ? this.cleanContent(item.content) : '';
                        content += `■ ${item.title}${item.isCategory ? ' [CARPETA]' : ''}${cleanItemContent ? `\n   ${cleanItemContent.replace(/\n/g, '\n   ')}` : ''}\n\n`;
                        content += renderItemsRecursive(item.id, 1);
                    });
                }
            }
        }

        content += `\n\n--- FIN DEL MANUSCRITO ---`;

        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        saveAs(blob, `${book.title.replace(/\s+/g, '_')}_Manuscrito.txt`);
    }

    /**
     * Exporta el libro en formato PDF
     */
    static async exportAsPDF(book, chapters, includeMasterDoc, characters = [], worldItems = []) {
        const doc = new jsPDF({
            orientation: "p",
            unit: "pt",
            format: "a4"
        });

        const margin = 50;
        const pageWidth = doc.internal.pageSize.getWidth();
        const contentWidth = pageWidth - (margin * 2);

        // 1. Portada
        doc.setFont("times", "bold");
        doc.setFontSize(36);
        doc.text(book.title, pageWidth / 2, 200, { align: "center" });
        
        doc.setFontSize(18);
        doc.setFont("times", "normal");
        doc.text(`por ${book.author || 'Escritor'}`, pageWidth / 2, 240, { align: "center" });

        if (book.description) {
            doc.setFontSize(12);
            doc.setFont("times", "italic");
            const splitDesc = doc.splitTextToSize(book.description, contentWidth);
            doc.text(splitDesc, pageWidth / 2, 400, { align: "center" });
        }

        // 2. Capítulos
        const sortedChapters = [...chapters].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        
        sortedChapters.forEach((chapter, index) => {
            if (chapter.isVolume) {
                doc.addPage();
                doc.setFont("times", "bold");
                doc.setFontSize(24);
                doc.text(chapter.title.toUpperCase(), pageWidth / 2, 300, { align: "center" });
            } else {
                doc.addPage();
                doc.setFont("times", "bold");
                doc.setFontSize(20);
                doc.text(chapter.title, margin, 60);
                
                doc.setFont("times", "normal");
                doc.setFontSize(12);
                
                const cleanText = this.cleanContent(chapter.content);
                const splitText = doc.splitTextToSize(cleanText, contentWidth);
                
                let y = 100;
                splitText.forEach(line => {
                    if (y > 780) {
                        doc.addPage();
                        y = 60;
                    }
                    doc.text(line, margin, y);
                    y += 16;
                });
            }
        });

        // 3. Biblia
        if (includeMasterDoc && (characters.length > 0 || worldItems.length > 0)) {
            doc.addPage();
            doc.setFont("times", "bold");
            doc.setFontSize(24);
            doc.text("BIBLIA DEL PROYECTO", pageWidth / 2, 100, { align: "center" });

            let y = 160;
            if (characters.length > 0) {
                doc.setFontSize(18);
                doc.text("Personajes", margin, y);
                y += 30;
                doc.setFontSize(12);
                doc.setFont("times", "normal");
                
                characters.forEach(char => {
                    if (y > 750) { doc.addPage(); y = 60; }
                    doc.setFont("times", "bold");
                    doc.text(char.name + (char.role ? ` (${char.role})` : ''), margin, y);
                    y += 15;
                    doc.setFont("times", "normal");
                    const charDesc = doc.splitTextToSize(char.description || 'Sin descripción', contentWidth);
                    doc.text(charDesc, margin, y);
                    y += (charDesc.length * 14) + 15;
                });
            }

            if (worldItems.length > 0) {
                if (y > 700) { doc.addPage(); y = 60; }
                y += 20;
                doc.setFont("times", "bold");
                doc.setFontSize(18);
                doc.text("Universo, Estructura y Notas", margin, y);
                y += 30;
                doc.setFontSize(12);
                doc.setFont("times", "normal");

                // Exportar worldItems (solo items con contenido o categorías raíz)
                const renderableItems = worldItems.filter(i => !i.isCategory || !i.parentId);
                renderableItems.forEach(item => {
                    if (y > 750) { doc.addPage(); y = 60; }
                    doc.setFont("times", "bold");
                    const prefix = item.isCategory ? '[SECCIÓN] ' : '';
                    doc.text(`${prefix}${item.title}`, margin, y);
                    y += 15;
                    doc.setFont("times", "normal");
                    const rawContent = item.content ? this.cleanContent(item.content) : (item.isCategory ? '' : 'Sin contenido');
                    if (rawContent) {
                        const itemContent = doc.splitTextToSize(rawContent, contentWidth);
                        doc.text(itemContent, margin, y);
                        y += (itemContent.length * 14) + 15;
                    } else {
                        y += 10;
                    }
                });
            }
        }

        doc.save(`${book.title.replace(/\s+/g, '_')}_Manuscrito.pdf`);
    }

    /**
     * Exporta el libro en formato DOCX (Word)
     */
    static async exportAsDOCX(book, chapters, includeMasterDoc, characters = [], worldItems = []) {
        const sections = [];

        // 1. Portada
        sections.push({
            properties: {},
            children: [
                new Paragraph({
                    text: book.title,
                    heading: HeadingLevel.TITLE,
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 2400 },
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `por ${book.author || 'Escritor'}`,
                            italics: true,
                            size: 28,
                        }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 400 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: book.description || "", size: 24 })],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 2000 },
                }),
                new Paragraph({ children: [new PageBreak()] }),
            ],
        });

        // 2. Capítulos
        const sortedChapters = [...chapters].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        
        const contentChildren = [];
        sortedChapters.forEach((chapter, index) => {
            if (chapter.isVolume) {
                contentChildren.push(new Paragraph({
                    text: chapter.title.toUpperCase(),
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 1000, after: 1000 },
                }));
            } else {
                contentChildren.push(new Paragraph({
                    text: chapter.title,
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 400, after: 400 },
                }));

                const lines = this.cleanContent(chapter.content).split('\n');
                lines.forEach(line => {
                    contentChildren.push(new Paragraph({
                        children: [new TextRun({ text: line, size: 24 })],
                        spacing: { after: 120 },
                    }));
                });
            }
            contentChildren.push(new Paragraph({ children: [new PageBreak()] }));
        });

        // 3. Biblia
        if (includeMasterDoc) {
            contentChildren.push(new Paragraph({
                text: "BIBLIA DEL PROYECTO",
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
            }));

            if (characters.length > 0) {
                contentChildren.push(new Paragraph({ text: "Personajes", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }));
                characters.forEach(char => {
                    contentChildren.push(new Paragraph({
                        children: [new TextRun({ text: char.name + (char.role ? ` (${char.role})` : ''), bold: true })],
                        spacing: { before: 200 }
                    }));
                    contentChildren.push(new Paragraph({ text: char.description || "Sin descripción" }));
                });
            }

            if (worldItems.length > 0) {
                contentChildren.push(new Paragraph({ text: "Universo, Estructura y Notas", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }));
                worldItems.forEach(item => {
                    contentChildren.push(new Paragraph({
                        children: [new TextRun({ text: `${item.isCategory ? '[SECCIÓN] ' : ''}${item.title}`, bold: true })],
                        spacing: { before: 200 }
                    }));
                    const cleanedContent = item.content ? this.cleanContent(item.content) : (item.isCategory ? '' : 'Sin contenido');
                    if (cleanedContent) {
                        const lines = cleanedContent.split('\n');
                        lines.forEach(line => {
                            contentChildren.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })], spacing: { after: 80 } }));
                        });
                    }
                });
            }
        }

        sections.push({ children: contentChildren });

        const doc = new Document({ sections });
        const buffer = await Packer.toBlob(doc);
        saveAs(buffer, `${book.title.replace(/\s+/g, '_')}_Manuscrito.docx`);
    }

    /**
     * Genera el texto plano de la Biblia para copiar al portapapeles
     */
    static getMasterDocText(book, characters = [], worldItems = []) {
        let content = `BIBLIA DEL PROYECTO: ${book.title.toUpperCase()}\n`;
        content += `================================================\n\n`;

        if (characters.length > 0) {
            content += `--- PERSONAJES ---\n\n`;
            characters.forEach(char => {
                content += `- ${char.name}${char.role ? ` (${char.role})` : ''}:\n  ${char.description || 'Sin descripción'}\n\n`;
            });
        }

        if (worldItems.length > 0) {
            content += `--- UNIVERSO Y NOTAS ---\n`;
            
            const renderItemsRecursive = (parentId, depth = 0) => {
                const children = worldItems.filter(i => i.parentId === parentId);
                if (children.length === 0) return '';
                
                const indent = '  '.repeat(depth);
                let text = '';
                
                children.forEach(item => {
                    text += `${indent}${depth === 0 ? '■ ' : '└─ '}${item.title}${item.isCategory ? ' [CARPETA]' : ''}${item.content ? `\n${indent}   ${item.content.replace(/\n/g, '\n' + indent + '   ')}` : ''}\n\n`;
                    text += renderItemsRecursive(item.id, depth + 1);
                });
                return text;
            };

            const structureText = renderItemsRecursive('system_estructura');
            if (structureText) content += `\n[ESTRUCTURA]\n${structureText}`;
            
            const notesText = renderItemsRecursive('system_notas');
            if (notesText) content += `\n[NOTAS ADICIONALES]\n${notesText}`;
            
            const dynamicItems = worldItems.filter(i => !i.parentId && i.id !== 'system_estructura' && i.id !== 'system_notas');
            if (dynamicItems.length > 0) {
                content += `\n[OTRAS SECCIONES]\n`;
                dynamicItems.forEach(item => {
                    content += `■ ${item.title}${item.isCategory ? ' [CARPETA]' : ''}${item.content ? `\n   ${item.content.replace(/\n/g, '\n   ')}` : ''}\n\n`;
                    content += renderItemsRecursive(item.id, 1);
                });
            }
        }

        return content;
    }

}

export default ExportService;
