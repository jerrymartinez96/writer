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
        characters: ['create_character', 'develop_psychology', 'design_arc', 'analyze_relationships'],
        cowriter: ['write_scene', 'rewrite_document', 'develop_chapter', 'compare_versions'],
        world: ['develop_world', 'analyze_relationships', 'build_timeline', 'analyze_impact'],
        narrator: ['narrate_chapter', 'prepare_segments', 'review_audio'],
        coherence: ['audit_continuity', 'detect_conflicts', 'prepare_resolution'],
    }[room.id] || [],
    canModify: ['characters', 'cowriter', 'world'].includes(room.id),
    requiresApproval: ['characters', 'cowriter', 'world'].includes(room.id),
    riskLevel: room.id === 'coherence' || room.id === 'narrator' ? 'low' : 'medium',
})));

export const getToolDefinition = (toolId) => TOOL_CATALOG.find((tool) => tool.id === toolId) || null;

