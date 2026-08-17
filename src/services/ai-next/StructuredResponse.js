export class StructuredResponseError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'StructuredResponseError';
        this.details = details;
    }
}

const extractJsonCandidates = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return [];
    const candidates = [raw];
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) candidates.unshift(fenced[1].trim());
    for (let start = 0; start < raw.length; start += 1) {
        if (raw[start] !== '{' && raw[start] !== '[') continue;
        let depth = 0;
        let quoted = false;
        let escaped = false;
        for (let index = start; index < raw.length; index += 1) {
            const character = raw[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (character === '\\') escaped = true;
                else if (character === '"') quoted = false;
                continue;
            }
            if (character === '"') quoted = true;
            else if (character === '{' || character === '[') depth += 1;
            else if (character === '}' || character === ']') {
                depth -= 1;
                if (depth === 0) {
                    candidates.push(raw.slice(start, index + 1));
                    break;
                }
            }
        }
    }
    return candidates;
};

export const parseStructuredResponse = (value, label = 'respuesta estructurada') => {
    if (value && typeof value === 'object') return value;
    if (!String(value || '').trim()) throw new StructuredResponseError(`La IA devolvió una respuesta vacía para ${label}.`);
    for (const candidate of extractJsonCandidates(value)) {
        try { return JSON.parse(candidate); } catch { /* prueba el siguiente candidato */ }
    }
    throw new StructuredResponseError(`La IA devolvió una ${label} inválida.`);
};

const validateNode = (value, schema, path, errors, deep = true) => {
    if (!schema) return;
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            errors.push(`${path} debe ser un objeto`);
            return;
        }
        (schema.required || []).forEach((key) => {
            if (value[key] === undefined || value[key] === null) errors.push(`${path}.${key} es obligatorio`);
        });
        if (deep) Object.entries(schema.properties || {}).forEach(([key, childSchema]) => {
            if (value[key] !== undefined) validateNode(value[key], childSchema, `${path}.${key}`, errors, deep);
        });
        return;
    }
    if (schema.type === 'array') {
        if (!Array.isArray(value)) {
            errors.push(`${path} debe ser un arreglo`);
            return;
        }
        if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} requiere al menos ${schema.minItems} elementos`);
        if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} admite como máximo ${schema.maxItems} elementos`);
        if (deep) value.forEach((item, index) => validateNode(item, schema.items, `${path}[${index}]`, errors, deep));
        return;
    }
    if (schema.type === 'string' && typeof value !== 'string') errors.push(`${path} debe ser texto`);
    if (schema.type === 'number' && (typeof value !== 'number' || Number.isNaN(value))) errors.push(`${path} debe ser número`);
    if (schema.type === 'boolean' && typeof value !== 'boolean') errors.push(`${path} debe ser booleano`);
    if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} tiene un valor no permitido`);
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} está por debajo del mínimo`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} está por encima del máximo`);
};

export const validateStructuredResponse = (value, schema, label = 'respuesta estructurada', options = {}) => {
    const rootSchema = schema?.function?.parameters || schema;
    const errors = [];
    validateNode(value, rootSchema, '$', errors, options.deep !== false);
    if (errors.length) throw new StructuredResponseError(`La ${label} no cumple el contrato: ${errors.slice(0, 4).join('; ')}`, { errors });
    return value;
};

export const parseAndValidate = (value, schema, label = 'respuesta estructurada', options = {}) => validateStructuredResponse(parseStructuredResponse(value, label), schema, label, options);
