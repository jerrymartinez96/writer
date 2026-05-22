import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import SessionManager from '../components/ia-studio/IAStudioSessionManager';

const IAStudioContext = createContext(null);

export const IAStudioProvider = ({ children }) => {
    const [contextSelections, setContextSelections] = useState({ chapterIds: [], worldItemIds: [] });
    const [destinationDoc, setDestinationDoc] = useState({ mode: 'auto', docId: null, docType: 'chapter', docTitle: '' });
    
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

    // Initial session load
    useEffect(() => {
        let sess = SessionManager.getActiveSession();
        if (!sess) {
            sess = SessionManager.createSession(contextSelections, destinationDoc);
        }
        setActiveSession(sess);
        setMessages(sess.messages || []);
        
        // Sync context and destination from session to context
        if (sess.contextSelections) {
            setContextSelections(sess.contextSelections);
        }
        if (sess.destinationDoc) {
            setDestinationDoc(sess.destinationDoc);
        }
        
        setSessions(SessionManager.getSessions());
    }, []);

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
            SessionManager.updateSessionContext(activeSession.id, contextSelections);
            setActiveSession(prev => prev ? { ...prev, contextSelections } : prev);
            setSessions(SessionManager.getSessions());
        }
    }, [contextSelections]);

    // Sync destinationDoc modifications to active session in localStorage
    useEffect(() => {
        if (activeSession && destinationDoc) {
            SessionManager.updateSessionDestination(activeSession.id, destinationDoc);
            setActiveSession(prev => prev ? { ...prev, destinationDoc } : prev);
            setSessions(SessionManager.getSessions());
        }
    }, [destinationDoc]);

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

