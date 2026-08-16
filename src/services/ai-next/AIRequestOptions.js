export const getConfiguredAIOptions = (profile, overrides = {}) => ({
    model: profile?.aiConfig?.defaultModel || 'deepseek-v4-flash',
    reasoningMode: profile?.aiConfig?.reasoningMode ?? false,
    reasoningEffort: profile?.aiConfig?.reasoningEffort || 'high',
    ...overrides,
});

export default getConfiguredAIOptions;
