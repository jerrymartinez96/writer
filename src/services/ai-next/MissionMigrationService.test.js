import { describe, expect, it } from 'vitest';
import { migrateLegacyProposal, migrateRoomState } from './MissionMigrationService';

describe('MissionMigrationService', () => {
    it('converts a legacy pending proposal into reviewable operations', () => {
        const result = migrateLegacyProposal({ id: 'proposal-1', chapterId: 'chapter-4', originalText: 'Viejo', proposedContent: 'Nuevo' }, {});
        expect(result.mission.roomId).toBe('global-constructor');
        expect(result.mission.selectedIds).toEqual(['chapter-4']);
        expect(result.operations[0].action).toBe('patch');
        expect(result.operations[0].replacementText).toBe('Nuevo');
    });

    it('migrates legacy room state without requiring a chapter', () => {
        const result = migrateRoomState({ objective: 'Definir una regla', missionStatus: 'active' });
        expect(result.changed).toBe(true);
        expect(result.state.mission.scope).toBe('automatic');
        expect(result.state.missionStatus).toBe('configured');
    });
});
