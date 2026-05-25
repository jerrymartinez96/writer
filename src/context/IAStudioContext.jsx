import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import SessionManager from '../components/ia-studio/IAStudioSessionManager';
import { useData } from './DataContext';

const IAStudioContext = createContext(null);

export const IAStudioProvider = ({ children }) => {
    const { activeBook } = useData();
    const [contextSelections, setContextSelections] = useState({ chapterIds: [], worldItemIds: [] });
    const [destinationDoc, setDestinationDoc] = useState({ mode: 'auto', docId: null, docType: 'chapter', docTitle: '' });
    const [compressContext, setCompressContext] = useState(false);
    
    // Sessions state
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [messages, setMessages] = useState([]);

    const handleContextChange = useCallback((newContext) => {
        setContextSelections(newContext);
    }, []);

    const handleDestinationChange = useCallback((newDestination) => {
        setDestinationDoc(newDestination);
    }, []);

    // Sincronizar cambios de libro activo y cargar sus sesiones
    useEffect(() => {
        if (!activeBook?.id) return;
        
        SessionManager.setBookId(activeBook.id);
        
        let sess = SessionManager.getActiveSession();
        if (!sess) {
            sess = SessionManager.createSession(
                { chapterIds: [], worldItemIds: [] },
                { mode: 'auto', docId: null, docType: 'chapter', docTitle: '' }
            );
        }
        
        // Sincronizar contexto y destino desde la sesión cargada al estado local
        if (sess.contextSelections) {
            setContextSelections(sess.contextSelections);
        } else {
            setContextSelections({ chapterIds: [], worldItemIds: [] });
        }
        if (sess.destinationDoc) {
            setDestinationDoc(sess.destinationDoc);
        } else {
            setDestinationDoc({ mode: 'auto', docId: null, docType: 'chapter', docTitle: '' });
        }

        setActiveSession(sess);
        setMessages(sess.messages || []);
        setSessions(SessionManager.getSessions());
    }, [activeBook?.id]);

    // Switch active session
    const switchSession = useCallback((sessionId) => {
        SessionManager.setActiveSession(sessionId);
        const sess = SessionManager.getSession(sessionId);
        if (sess) {
            setActiveSession(sess);
            setMessages(sess.messages || []);
            
            if (sess.contextSelections) {
                setContextSelections(sess.contextSelections);
            }
            if (sess.destinationDoc) {
                setDestinationDoc(sess.destinationDoc);
            }
        }
        setSessions(SessionManager.getSessions());
    }, []);

    // Create a new session
    const newSession = useCallback(() => {
        const newSess = SessionManager.createSession(contextSelections, destinationDoc);
        setActiveSession(newSess);
        setMessages([]);
        
        if (newSess.contextSelections) {
            setContextSelections(newSess.contextSelections);
        }
        if (newSess.destinationDoc) {
            setDestinationDoc(newSess.destinationDoc);
        }
        
        setSessions(SessionManager.getSessions());
    }, [contextSelections, destinationDoc]);

    // Delete a session
    const deleteSession = useCallback((sessionId) => {
        SessionManager.deleteSession(sessionId);
        const active = SessionManager.getActiveSession();
        if (active) {
            setActiveSession(active);
            setMessages(active.messages || []);
            
            if (active.contextSelections) {
                setContextSelections(active.contextSelections);
            }
            if (active.destinationDoc) {
                setDestinationDoc(active.destinationDoc);
            }
        } else {
            const newSess = SessionManager.createSession(contextSelections, destinationDoc);
            setActiveSession(newSess);
            setMessages([]);
            
            if (newSess.contextSelections) {
                setContextSelections(newSess.contextSelections);
            }
            if (newSess.destinationDoc) {
                setDestinationDoc(newSess.destinationDoc);
            }
        }
        setSessions(SessionManager.getSessions());
    }, [contextSelections, destinationDoc]);

    // Rename a session
    const renameSession = useCallback((sessionId, newName) => {
        SessionManager.renameSession(sessionId, newName);
        const active = SessionManager.getActiveSession();
        if (active) {
            setActiveSession(active);
        }
        setSessions(SessionManager.getSessions());
    }, []);

    // Sync contextSelections modifications to active session in localStorage
    useEffect(() => {
        if (activeSession && contextSelections) {
            const hasChanged = JSON.stringify(activeSession.contextSelections) !== JSON.stringify(contextSelections);
            if (hasChanged) {
                SessionManager.updateSessionContext(activeSession.id, contextSelections);
                setActiveSession(prev => prev ? { ...prev, contextSelections } : prev);
                setSessions(SessionManager.getSessions());
            }
        }
    }, [contextSelections, activeSession?.id]);

    // Sync destinationDoc modifications to active session in localStorage
    useEffect(() => {
        if (activeSession && destinationDoc) {
            const hasChanged = JSON.stringify(activeSession.destinationDoc) !== JSON.stringify(destinationDoc);
            if (hasChanged) {
                SessionManager.updateSessionDestination(activeSession.id, destinationDoc);
                setActiveSession(prev => prev ? { ...prev, destinationDoc } : prev);
                setSessions(SessionManager.getSessions());
            }
        }
    }, [destinationDoc, activeSession?.id]);

    // Delete a specific message
    const deleteMessage = useCallback((messageId) => {
        if (activeSession) {
            SessionManager.deleteMessage(activeSession.id, messageId);
            setMessages(prev => prev.filter(m => m.id !== messageId));
            setSessions(SessionManager.getSessions());
        }
    }, [activeSession]);

    return (
        <IAStudioContext.Provider value={{
            contextSelections,
            destinationDoc,
            onContextChange: handleContextChange,
            onDestinationChange: handleDestinationChange,
            sessions,
            activeSession,
            messages,
            setMessages,
            setSessions,
            setActiveSession,
            switchSession,
            newSession,
            deleteSession,
            renameSession,
            compressContext,
            setCompressContext,
            deleteMessage,
        }}>
            {children}
        </IAStudioContext.Provider>
    );
};

export const useIAStudioContext = () => {
    const ctx = useContext(IAStudioContext);
    if (!ctx) throw new Error('useIAStudioContext must be used within IAStudioProvider');
    return ctx;
};

