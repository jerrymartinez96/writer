import { TOOL_ROOMS } from '../../components/toolrooms/toolRoomCatalog';

/**
 * Contrato técnico del catálogo. La interfaz puede seguir usando TOOL_ROOMS,
 * pero el Router consume esta versión normalizada y sin componentes visuales.
 */
export const TOOL_CATALOG = Object.freeze(TOOL_ROOMS.map((room) => ({
    id: room.id,
    name: room.title,
    route: room.route,
    description: room.description,
    status: room.status,
    requiredContext: room.contextRequirements || [],
    capabilities: {
        'global-constructor': ['analyze_impact', 'propose_alternatives', 'build_change_plan', 'verify_change'],
        'creative-studio': ['create_character', 'design_chapter', 'design_scene', 'write_chapter'],
        narrator: ['narrate_chapter', 'prepare_segments', 'review_audio'],
        audit: ['audit_continuity', 'audit_consistency', 'validate_evidence', 'prepare_resolution'],
    }[room.id] || [],
    canModify: ['global-constructor', 'creative-studio'].includes(room.id),
    requiresApproval: ['global-constructor', 'creative-studio'].includes(room.id),
    riskLevel: room.id === 'audit' || room.id === 'narrator' ? 'low' : 'high',
})));

export const getToolDefinition = (toolId) => TOOL_CATALOG.find((tool) => tool.id === toolId) || null;
