import { beforeEach, describe, expect, it } from 'vitest';
import SessionStore from './CoreSessionStore';

const createStorage = () => {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    };
};

describe('CoreSessionStore', () => {
    beforeEach(() => {
        globalThis.window = { localStorage: createStorage() };
        SessionStore.setBookId(`book-${Date.now()}-${Math.random()}`);
    });

    it('crea y recupera una sesión por libro', () => {
        const session = SessionStore.createSession({ chapterIds: ['chapter-1'], worldItemIds: [], characterIds: [] });

        expect(SessionStore.getActiveSession().id).toBe(session.id);
        expect(SessionStore.getSessions()).toHaveLength(1);
        expect(SessionStore.getSession(session.id).contextSelections.chapterIds).toEqual(['chapter-1']);
    });

    it('persiste mensajes y permite eliminarlos', () => {
        const session = SessionStore.createSession();
        SessionStore.addMessage(session.id, { id: 'message-1', role: 'user', content: 'Prueba' });
        expect(SessionStore.getSession(session.id).messages).toHaveLength(1);

        SessionStore.deleteMessage(session.id, 'message-1');
        expect(SessionStore.getSession(session.id).messages).toHaveLength(0);
    });

    it('elimina la sesión activa y selecciona la anterior disponible', () => {
        const first = SessionStore.createSession();
        const second = SessionStore.createSession();
        SessionStore.deleteSession(second.id);

        expect(SessionStore.getActiveSession().id).toBe(first.id);
    });
});
