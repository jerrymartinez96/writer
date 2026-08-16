import { describe, expect, it } from 'vitest';
import { classifyCoreRequest } from './CoreRouter';

const route = (userMessage) => classifyCoreRequest({ userMessage });

describe('CoreRouter', () => {
    it.each([
        ['chat general', '¿Qué función cumple este capítulo dentro de la historia?', 'core', 'chat'],
        ['análisis', 'Analiza el ritmo y la estructura de este capítulo.', 'core', 'analyze'],
        ['parche puntual', 'Cambia el nombre de Elena por Elisa en este capítulo.', 'core', 'patch'],
        ['multiparche', 'Actualiza el nombre de Elena por Elisa en todos los capítulos y documentos donde aparezca.', 'core', 'multi_patch'],
        ['personajes', 'Crea un personaje con miedo al abandono y diseña su arco narrativo.', 'toolroom', 'character_development'],
        ['coescritor', 'Reescribe la escena para aumentar la tensión sin cambiar el desenlace.', 'toolroom', 'chapter_writing'],
        ['mundo', 'Construye una ciudad con reglas, facciones y una cronología propia.', 'toolroom', 'world_development'],
        ['narrador', 'Narra el capítulo con una voz íntima y pausas dramáticas.', 'toolroom', 'narration'],
        ['auditoría', 'Audita el lore y busca contradicciones de toda la obra.', 'toolroom', 'continuity_audit'],
    ])('clasifica %s correctamente', (_name, message, expectedRoute, expectedCapability) => {
        const result = route(message);
        expect(result.route).toBe(expectedRoute);
        expect(result.capability).toBe(expectedCapability);
    });

    it('no convierte una restricción narrativa en un parche', () => {
        const result = route('Reescribe el capítulo manteniendo intacto el desenlace y sin modificar el protagonista.');
        expect(result.toolId).toBe('cowriter');
        expect(result.capability).toBe('chapter_writing');
    });

    it('mantiene una solicitud ambigua en el core', () => {
        const result = route('Ayúdame a pensar qué podría pasar después.');
        expect(result.route).toBe('core');
        expect(result.capability).toBe('chat');
        expect(result.needsConfirmation).toBe(false);
    });

    it('prioriza multiparche cuando una solicitud menciona varios documentos', () => {
        const result = route('Corrige esta frase en el capítulo 1 y en el documento de lore.');
        expect(result.route).toBe('core');
        expect(result.capability).toBe('multi_patch');
        expect(result.needsConfirmation).toBe(true);
    });

    it('normaliza acentos al clasificar herramientas', () => {
        const result = route('Audita la cronología y busca contradicciones de toda la obra.');
        expect(result.toolId).toBe('coherence');
        expect(result.route).toBe('toolroom');
    });

    it('no deriva un análisis que no pide cambios', () => {
        const result = route('Revisa el capítulo y evalúa su ritmo.');
        expect(result.route).toBe('core');
        expect(result.capability).toBe('analyze');
        expect(result.needsConfirmation).toBe(false);
    });
});
