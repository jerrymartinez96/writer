import { describe, expect, it } from 'vitest';
import { applyPlainTextPatch, toPlainText } from './plainText';

describe('toPlainText', () => {
    it('elimina etiquetas de formato y conserva el contenido', () => {
        expect(toPlainText('<h2>Título</h2><p><strong>Texto</strong></p><ul><li>Uno</li><li>Dos</li></ul>'))
            .toBe('Título\nTexto\nUno\nDos');
    });

    it('convierte saltos HTML y limita los saltos vacíos consecutivos', () => {
        expect(toPlainText('Uno<br><br><br><div>Dos</div>'))
            .toBe('Uno\n\nDos');
    });

    it('decodifica entidades básicas después de limpiar el marcado', () => {
        expect(toPlainText('<p>A&nbsp;&amp;&nbsp;B &lt; prueba</p>'))
            .toBe('A & B < prueba');
    });

    it('acepta texto plano sin alterarlo innecesariamente', () => {
        expect(toPlainText('  Una línea\n\nOtra línea  '))
            .toBe('Una línea\n\nOtra línea');
    });

    it('aplica un parche exacto sobre texto plano sin reemplazar el documento completo', () => {
        expect(applyPlainTextPatch('Antes: dos meses. Después: catorce UMAs.', 'dos meses', 'tres meses'))
            .toBe('Antes: tres meses. Después: catorce UMAs.');
    });

    it('permite eliminar una coincidencia al usar un reemplazo vacío', () => {
        expect(applyPlainTextPatch('Elena, ya sabes, volvió a entrar.', 'ya sabes, ', ''))
            .toBe('Elena, volvió a entrar.');
    });
});
