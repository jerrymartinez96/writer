import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIService from '../AIService';
import { classifyRequestIntent } from './RequestIntentService';

vi.mock('../AIService', () => ({
    default: { sendMessage: vi.fn() },
}));

const response = JSON.stringify({
    intent: 'question',
    changeType: 'none',
    scope: 'single',
    confidence: 0.92,
    reason: 'Es una consulta general.',
    recommendedTool: 'none',
});

describe('RequestIntentService', () => {
    beforeEach(() => vi.resetAllMocks());

    it('conserva Thinking y omite tool_choice cuando el razonamiento está activo', async () => {
        AIService.sendMessage.mockResolvedValue(response);

        await classifyRequestIntent({
            profile: { deepseekApiKey: 'test-key', aiConfig: { reasoningMode: true, reasoningEffort: 'high' } },
            message: 'Quiero comenzar una obra nueva.',
        });

        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({
            reasoningMode: true,
            responseMode: 'tool',
            tools: expect.any(Array),
        }));
        expect(AIService.sendMessage.mock.calls[0][2]).not.toHaveProperty('toolChoice');
    });

    it('usa tool calling estricto cuando Thinking está desactivado', async () => {
        AIService.sendMessage.mockResolvedValue(response);

        await classifyRequestIntent({
            profile: { deepseekApiKey: 'test-key', aiConfig: { reasoningMode: false } },
            message: 'Quiero comenzar una obra nueva.',
        });

        expect(AIService.sendMessage.mock.calls[0][2]).toEqual(expect.objectContaining({
            reasoningMode: false,
            responseMode: 'tool',
            toolChoice: 'required',
            tools: expect.any(Array),
        }));
    });
});
