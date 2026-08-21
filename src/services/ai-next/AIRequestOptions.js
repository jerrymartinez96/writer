export const getConfiguredAIOptions = (profile, overrides = {}) => ({
    model: profile?.aiConfig?.defaultModel || 'deepseek-v4-flash',
    reasoningMode: profile?.aiConfig?.reasoningMode ?? false,
    // Un único nivel evita que perfiles antiguos con `max` consuman el
    // presupuesto de salida antes de completar una herramienta o respuesta.
    reasoningEffort: 'high',
    ...overrides,
});

/**
 * DeepSeek no acepta `tool_choice` mientras Thinking está activo. Los flujos
 * estructurados mantienen el razonamiento configurado, envían el schema y
 * dejan que la API seleccione la tool por defecto.
 */
export const getStructuredAIOptions = (profile, schema, overrides = {}) => {
    const base = getConfiguredAIOptions(profile, overrides);
    if (base.reasoningMode) {
        return { ...base, responseMode: 'tool', tools: [schema] };
    }
    return { ...base, responseMode: 'tool', tools: [schema], toolChoice: 'required' };
};

export default getConfiguredAIOptions;
