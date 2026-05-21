import React, { createContext, useContext, useState, useCallback } from 'react';

const IAStudioContext = createContext(null);

export const IAStudioProvider = ({ children }) => {
    const [contextSelections, setContextSelections] = useState({ chapterIds: [], worldItemIds: [] });
    const [destinationDoc, setDestinationDoc] = useState({ mode: 'auto', docId: null, docType: 'chapter', docTitle: '' });

    const handleContextChange = useCallback((newContext) => {
        setContextSelections(newContext);
    }, []);

    const handleDestinationChange = useCallback((newDestination) => {
        setDestinationDoc(newDestination);
    }, []);

    return (
        <IAStudioContext.Provider value={{
            contextSelections,
            destinationDoc,
            onContextChange: handleContextChange,
            onDestinationChange: handleDestinationChange,
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
