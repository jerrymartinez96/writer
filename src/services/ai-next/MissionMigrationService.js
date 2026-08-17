const LEGACY_STATUS_MAP = {
    idle: 'draft',
    active: 'configured',
    proposal_ready: 'ready_for_review',
    completed: 'applied',
};
export const MISSION_MIGRATION_VERSION = 1;

const createId = (prefix = 'global') => `${prefix}-${Date.now()}`;

export const normalizeLegacyOperation = (proposal, index = 0) => ({
    id: proposal?.id || `legacy-operation-${Date.now()}-${index}`,
    documentId: String(proposal?.documentId || proposal?.chapterId || ''),
    action: proposal?.action || (proposal?.originalText ? 'patch' : 'review'),
    title: String(proposal?.title || proposal?.summary || 'Propuesta heredada'),
    reason: String(proposal?.reason || proposal?.summary || 'Propuesta creada en una versión anterior.'),
    originalText: String(proposal?.originalText || ''),
    replacementText: String(proposal?.replacementText || proposal?.content || proposal?.proposedContent || ''),
    risk: proposal?.risk || 'medium',
    status: proposal?.status === 'applied' ? 'applied' : 'pending',
});

export const migrateLegacyProposal = (proposal, mission = {}) => {
    if (!proposal) return null;
    const sourceOperations = Array.isArray(proposal.operations) ? proposal.operations : [proposal];
    return {
        id: proposal.id || createId('legacy-mission'),
        summary: proposal.summary || 'Propuesta heredada lista para revisión.',
        operations: sourceOperations.map(normalizeLegacyOperation),
        migratedFrom: 'pendingProposal',
        migratedAt: new Date().toISOString(),
        mission: {
            id: mission.id || createId('global'),
            roomId: 'global-constructor',
            type: mission.type || 'improve_content',
            objective: mission.objective || proposal.objective || proposal.instruction || 'Revisar propuesta heredada',
            scope: mission.scope || (proposal.chapterId ? 'selected' : 'automatic'),
            selectedIds: mission.selectedIds || (proposal.chapterId ? [proposal.chapterId] : []),
        },
    };
};

export const migrateRoomState = (roomState = {}, roomId = 'global-constructor') => {
    const state = roomState || {};
    if (state.mission?.roomId === 'global-constructor' && !state.pendingProposal && (state.migrationVersion >= MISSION_MIGRATION_VERSION || !state.migratedFrom)) return { state, changed: false };
    const legacyMission = state.mission || (state.objective ? {
        id: state.missionId,
        type: state.type,
        objective: state.objective,
        scope: state.chapterId ? 'selected' : 'automatic',
        selectedIds: state.chapterId ? [state.chapterId] : [],
    } : null);
    const legacyProposal = state.pendingProposal ? migrateLegacyProposal(state.pendingProposal, legacyMission || {}) : null;
    if (!legacyMission && !legacyProposal) return { state, changed: false };

    const mission = legacyMission ? {
        id: legacyMission.id || createId('global'),
        roomId: 'global-constructor',
        type: legacyMission.type || 'improve_content',
        objective: String(legacyMission.objective || '').trim(),
        scope: legacyMission.scope || 'automatic',
        selectedIds: Array.isArray(legacyMission.selectedIds) ? legacyMission.selectedIds : [],
        chapterId: legacyMission.chapterId || state.chapterId || null,
        constraints: legacyMission.constraints || { preserveCanon: true, preserveStyle: true, noAutomaticWrites: true },
        migratedFrom: legacyMission.roomId && legacyMission.roomId !== 'global-constructor' ? legacyMission.roomId : undefined,
    } : null;
    return {
        changed: true,
        state: {
            ...state,
            mission,
            result: state.result || legacyProposal,
            missionStatus: state.missionStatus === 'proposal_ready' ? 'ready_for_review' : (LEGACY_STATUS_MAP[state.missionStatus] || state.missionStatus || 'draft'),
            pendingProposal: null,
            migratedFrom: state.migratedFrom || (roomId === 'global-constructor' ? 'legacy-mission' : roomId),
            migratedAt: new Date().toISOString(),
            migrationVersion: MISSION_MIGRATION_VERSION,
        },
    };
};
