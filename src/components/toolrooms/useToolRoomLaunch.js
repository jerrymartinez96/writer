import { useEffect, useState } from 'react';

const readLaunch = () => {
    try {
        const raw = window.sessionStorage.getItem('verne-ia-studio-launch');
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('No se pudo leer el contexto de Tool Room:', error);
        return null;
    }
};

export const useToolRoomLaunch = (roomId) => {
    const [launch] = useState(() => {
        const value = readLaunch();
        return value?.roomId === roomId ? value : null;
    });

    useEffect(() => {
        if (!launch) return;
        try { window.sessionStorage.removeItem('verne-ia-studio-launch'); } catch { /* no-op */ }
    }, [launch]);

    return launch;
};

export default useToolRoomLaunch;
