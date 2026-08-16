import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useData } from './DataContext';

const ToolRoomContext = createContext(null);
const STORAGE_PREFIX = 'verne-toolrooms-v1';

const getStorageKey = (bookId) => `${STORAGE_PREFIX}:${bookId || 'no-book'}`;

const defaultRoomState = {
    selectedCharacterId: null,
    objective: '',
    pendingProposal: null,
    missionStatus: 'idle',
    missionId: null,
    lastVisitedAt: null,
};

export const ToolRoomProvider = ({ children }) => {
    const { activeBook, activeView, setActiveView } = useData();
    const [roomState, setRoomState] = useState({});

    useEffect(() => {
        if (!activeBook?.id) {
            // The room state is scoped by book; reset it when that external key changes.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setRoomState({});
            return;
        }

        try {
            const stored = window.localStorage.getItem(getStorageKey(activeBook.id));
            setRoomState(stored ? JSON.parse(stored) : {});
        } catch (error) {
            console.warn('No se pudo recuperar el estado de Tool Rooms:', error);
            setRoomState({});
        }
    }, [activeBook?.id]);

    useEffect(() => {
        if (!activeBook?.id) return;
        try {
            window.localStorage.setItem(getStorageKey(activeBook.id), JSON.stringify(roomState));
        } catch (error) {
            console.warn('No se pudo guardar el estado de Tool Rooms:', error);
        }
    }, [activeBook?.id, roomState]);

    const openToolRoom = useCallback((route) => {
        try {
            window.sessionStorage.setItem('verne-toolroom-return-view', 'ia-studio');
        } catch (error) {
            console.warn('No se pudo guardar el origen de la Tool Room:', error);
        }
        setActiveView(route);
    }, [activeView, setActiveView]);

    const returnToIAStudio = useCallback(() => {
        let returnView = 'ia-studio';
        try {
            returnView = window.sessionStorage.getItem('verne-toolroom-return-view') || 'ia-studio';
            window.sessionStorage.removeItem('verne-toolroom-return-view');
        } catch (error) {
            console.warn('No se pudo recuperar el origen de la Tool Room:', error);
        }
        setActiveView(returnView);
    }, [setActiveView]);

    const launchInIAStudio = useCallback((payload = {}) => {
        let returnView = 'ia-studio';
        try {
            returnView = window.sessionStorage.getItem('verne-toolroom-return-view') || 'ia-studio';
            window.sessionStorage.setItem('verne-ia-studio-launch', JSON.stringify({
                ...payload,
                createdAt: new Date().toISOString(),
            }));
        } catch (error) {
            console.warn('No se pudo preparar el lanzamiento en IA Studio:', error);
        }
        setActiveView(returnView);
    }, [setActiveView]);

    const updateRoomState = useCallback((roomId, patch) => {
        setRoomState((previous) => ({
            ...previous,
            [roomId]: {
                ...defaultRoomState,
                ...(previous[roomId] || {}),
                ...(typeof patch === 'function' ? patch(previous[roomId] || defaultRoomState) : patch),
            },
        }));
    }, []);

    const getRoomState = useCallback((roomId) => ({
        ...defaultRoomState,
        ...(roomState[roomId] || {}),
    }), [roomState]);

    const startMission = useCallback((roomId, objective, context = {}) => {
        const missionId = `${roomId}-${Date.now()}`;
        updateRoomState(roomId, {
            missionId,
            objective: String(objective || '').trim(),
            missionContext: context,
            missionStatus: 'active',
        });
        return missionId;
    }, [updateRoomState]);

    const saveProposal = useCallback((roomId, proposal) => {
        updateRoomState(roomId, {
            pendingProposal: {
                ...proposal,
                id: proposal?.id || `${roomId}-proposal-${Date.now()}`,
                createdAt: new Date().toISOString(),
                status: 'pending_review',
            },
            missionStatus: 'proposal_ready',
        });
    }, [updateRoomState]);

    const dismissProposal = useCallback((roomId) => {
        updateRoomState(roomId, { pendingProposal: null, missionStatus: 'active' });
    }, [updateRoomState]);

    const completeMission = useCallback((roomId) => {
        updateRoomState(roomId, { missionStatus: 'completed', pendingProposal: null });
    }, [updateRoomState]);

    const value = useMemo(() => ({
        roomState,
        getRoomState,
        updateRoomState,
        startMission,
        saveProposal,
        dismissProposal,
        completeMission,
        openToolRoom,
        returnToIAStudio,
        launchInIAStudio,
    }), [roomState, getRoomState, updateRoomState, startMission, saveProposal, dismissProposal, completeMission, openToolRoom, returnToIAStudio, launchInIAStudio]);

    return <ToolRoomContext.Provider value={value}>{children}</ToolRoomContext.Provider>;
};

// The provider and hook intentionally live together to keep the feature self-contained,
// matching the existing context pattern used by IA Studio.
// eslint-disable-next-line react-refresh/only-export-components
export const useToolRooms = () => {
    const context = useContext(ToolRoomContext);
    if (!context) throw new Error('useToolRooms must be used within ToolRoomProvider');
    return context;
};
