import { describe, expect, it } from 'vitest';
import { getToolDefinition, TOOL_CATALOG } from './ToolCatalog';

describe('ToolCatalog', () => {
    it('mantiene identificadores únicos y rutas válidas', () => {
        const ids = TOOL_CATALOG.map((tool) => tool.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(TOOL_CATALOG.every((tool) => tool.route.startsWith('toolroom:'))).toBe(true);
    });

    it('declara políticas de modificación y aprobación', () => {
        expect(getToolDefinition('characters')).toMatchObject({ canModify: true, requiresApproval: true });
        expect(getToolDefinition('cowriter')).toMatchObject({ canModify: true, requiresApproval: true });
        expect(getToolDefinition('narrator')).toMatchObject({ canModify: false, requiresApproval: false });
        expect(getToolDefinition('missing-tool')).toBeNull();
    });
});
