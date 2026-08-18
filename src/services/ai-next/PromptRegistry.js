/**
 * Registro único de contratos de prompt usados por los flujos de IA.
 *
 * Cada entrada es deliberadamente pequeña: el contexto variable se inyecta
 * al final y las reglas compartidas permanecen estables y versionadas.
 */
export const PROMPT_VERSION = '1.0.0';

const SHARED_RULES = [
    'Usa únicamente la información entregada en el contexto.',
    'No inventes IDs, hechos, citas ni relaciones.',
    'Si la evidencia es insuficiente, decláralo en lugar de completar con una suposición.',
].join('\n');

const asContext = (label, value, fallback = '(sin datos)') => `${label}:\n${value || fallback}`;

export const INTENT_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        intent: { type: 'string', enum: ['change', 'question', 'analysis', 'creative', 'specialized'] },
        changeType: { type: 'string', enum: ['text', 'narrative', 'continuity', 'none'] },
        scope: { type: 'string', enum: ['single', 'multiple', 'unknown'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reason: { type: 'string' },
        recommendedTool: { type: 'string', enum: ['none', 'global-constructor', 'creative-studio', 'audit', 'narrator'] },
    },
    required: ['intent', 'changeType', 'scope', 'confidence', 'reason', 'recommendedTool'],
};

export const INTENT_RESPONSE_TOOL = {
    type: 'function',
    function: {
        name: 'clasificar_intencion',
        description: 'Clasifica la intención del escritor para decidir si debe continuar en Core o abrir una Tool Room.',
        parameters: INTENT_RESPONSE_SCHEMA,
    },
};

export const PROMPT_REGISTRY = Object.freeze({
    classifyRequestIntent: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        schema: INTENT_RESPONSE_SCHEMA,
        build: ({ message, context }) => [
            'Clasifica la intención real de la solicitud del escritor.',
            'No decidas por palabras aisladas: interpreta el objetivo completo.',
            SHARED_RULES,
            'Reglas de clasificación:',
            '- intent=change solo si pide modificar, eliminar, sustituir, conservar o redefinir algo de la obra.',
            '- Una pregunta hipotética no es una orden de cambio.',
            '- changeType=narrative cuando cambia arco, motivación, lealtad, redención, canon o función de personaje.',
            '- changeType=continuity cuando exige revisar hechos relacionados en varios documentos.',
            '- scope=multiple solo con evidencia de más de un documento o entidad.',
            '- No prepares parches ni contenido; solo clasifica.',
            asContext('Solicitud del escritor', message),
            asContext('Contexto disponible', context),
            'Responde únicamente con el objeto JSON definido por el contrato.',
        ].join('\n\n'),
    },
    globalImpact: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ mission, documents }) => [
            'Eres el analista de impacto del Constructor Global.',
            'Analiza una modificación importante del canon sin modificar documentos.',
            SHARED_RULES,
            'Separa hechos confirmados, dependencias, riesgos y preguntas pendientes.',
            asContext('Misión', JSON.stringify(mission)),
            asContext('Documentos disponibles', JSON.stringify(documents)),
            'Devuelve únicamente los argumentos de la herramienta solicitada.',
        ].join('\n\n'),
    },
    globalAlternatives: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ mission, impact, documents }) => [
            'Eres un editor de desarrollo narrativo.',
            'Propón exactamente tres alternativas para la modificación solicitada y no apliques cambios.',
            'La primera debe ser conservadora, la segunda transformadora y la tercera compensatoria.',
            SHARED_RULES,
            asContext('Misión', JSON.stringify(mission)),
            asContext('Impacto', JSON.stringify(impact)),
            asContext('Documentos', JSON.stringify(documents)),
            'Devuelve únicamente los argumentos de la herramienta solicitada.',
        ].join('\n\n'),
    },
    globalOperations: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ mission, impact, alternative, documents }) => [
            'Eres el Constructor Global.',
            'Prepara un plan exacto de operaciones para la alternativa elegida. No lo ejecutes.',
            'Nunca uses documentos fuera de los IDs permitidos. originalText debe existir literalmente.',
            'Para eliminar usa action=delete con originalText exacto. No reemplaces un documento completo salvo action=replace.',
            SHARED_RULES,
            asContext('Misión', JSON.stringify(mission)),
            asContext('Impacto', JSON.stringify(impact)),
            asContext('Alternativa', JSON.stringify(alternative)),
            asContext('Documentos', JSON.stringify(documents)),
            'Devuelve únicamente los argumentos de la herramienta solicitada.',
        ].join('\n\n'),
    },
    globalVerification: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ mission, operations, documents }) => [
            'Eres el auditor posterior del Constructor Global.',
            'Verifica que el resultado aplicado conserve las restricciones y no introduzca contradicciones evidentes.',
            'No modifiques documentos.',
            SHARED_RULES,
            asContext('Misión', JSON.stringify(mission)),
            asContext('Operaciones aplicadas', JSON.stringify(operations)),
            asContext('Documentos después del cambio', JSON.stringify(documents)),
            'Devuelve únicamente los argumentos de la herramienta solicitada.',
        ].join('\n\n'),
    },
    toolRoomProposal: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ roomName, instruction, sourceContent, contextContent }) => [
            `Eres la herramienta especializada ${roomName}.`,
            'Prepara una propuesta revisable y no apliques ningún cambio.',
            'Devuelve texto plano, sin HTML ni Markdown. Conserva toda la información no afectada.',
            SHARED_RULES,
            asContext('Objetivo', instruction),
            asContext('Contenido original editable', sourceContent),
            asContext('Contexto de apoyo no editable', contextContent),
            'Devuelve únicamente los argumentos de la herramienta solicitada.',
        ].join('\n\n'),
    },
    toolRoomInsight: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ roomName, instruction, sourceContent, contextContent, documentIds }) => [
            `Eres la herramienta especializada ${roomName}.`,
            'Reporta únicamente contradicciones objetivas mediante la herramienta disponible. No modifiques documentos.',
            'Un hallazgo es válido solo si dos afirmaciones no pueden ser verdaderas al mismo tiempo y existe evidencia concreta de ambas.',
            'No reportes dudas, omisiones, diferencias de estilo, mejoras narrativas ni hechos compatibles.',
            SHARED_RULES,
            asContext('IDs válidos', JSON.stringify(documentIds)),
            asContext('Objetivo', instruction),
            asContext('Documentos analizables', sourceContent),
            asContext('Contexto de apoyo no analizable', contextContent),
            'Si no existe una contradicción real, devuelve findings vacío.',
        ].join('\n\n'),
    },
    narrativeInsight: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ roomName, instruction, sourceContent, contextContent }) => [
            `Eres la herramienta especializada ${roomName}.`,
            'Devuelve un análisis de solo lectura mediante la herramienta disponible.',
            'Usa texto plano, no inventes hechos y separa el resultado principal de los elementos accionables.',
            SHARED_RULES,
            asContext('Objetivo', instruction),
            asContext('Contenido principal', sourceContent),
            asContext('Contexto de apoyo no editable', contextContent),
        ].join('\n\n'),
    },
    narrationScript: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ chapterId, sourceContent, contextContent, instruction }) => [
            'Eres un director de narración y diseño sonoro para audiolibros.',
            'Diseña un guion de producción sobre el texto recibido. No modifiques el manuscrito ni inventes contenido narrativo.',
            'Conserva literalmente el texto de cada segmento. Solo puedes añadir dirección de voz, pausas, énfasis y pronunciaciones.',
            'Divide el texto en segmentos ordenados y completos. No omitas, combines ni reescribas frases.',
            'Usa pausas y énfasis con moderación. Si no hay una indicación clara, utiliza tono neutro y pausas naturales.',
            'El resultado será revisado por el usuario antes de preparar audio.',
            SHARED_RULES,
            `ID del capítulo: ${chapterId || '(sin ID)'}`,
            asContext('Texto fuente exacto', sourceContent),
            asContext('Contexto de apoyo limitado', contextContent, '(ninguno)'),
            asContext('Instrucción adicional', instruction, '(ninguna)'),
            'Devuelve únicamente los argumentos de la herramienta diseñar_guion_narracion.',
        ].join('\n\n'),
    },
    coreChat: {
        version: PROMPT_VERSION,
        responseMode: 'text',
        build: ({ capability, message, context }) => [
            capability === 'analyze' ? 'Analiza con claridad y estructura.' : 'Responde de forma útil y concreta.',
            'No inventes hechos fuera del contexto controlado. Si falta información, dilo explícitamente.',
            asContext('Solicitud', message),
            asContext('Contexto controlado', context),
        ].join('\n\n'),
    },
    chapterStructureAnalysis: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ structureContent, normalizedChapters, lastChapter, worldContent, characters }) => [
            'ROL: Eres el editor principal de continuidad de una novela. Esta tarea es de diagnóstico, no de escritura.',
            'OBJETIVO: interpretar el documento Estructura completo, compararlo con el manuscrito y recomendar qué capítulo debe redactarse después.',
            'JERARQUÍA DE FUENTES:',
            '1. Estructura define el plan previsto y sus títulos, posiciones, propósitos, conflictos y escenas.',
            '2. El manuscrito define lo que realmente está escrito; nunca supongas que una intención de Estructura ya ocurrió.',
            '3. Mundo, personajes y último capítulo sirven para comprobar continuidad, no para inventar capítulos ausentes.',
            'REGLAS:',
            '- Extrae todos los capítulos identificables, conserva su orden y no fusiones capítulos distintos.',
            '- Marca written solo con evidencia clara; usa empty o uncertain cuando no sea posible confirmar.',
            '- Una coincidencia debe comparar hechos, personajes, eventos y posición, no solo títulos parecidos.',
            '- No marques automáticamente nada como confirmado: matches son sugerencias para revisión humana.',
            '- Si Estructura está vacía, devuelve chapters vacío y explica que debe diseñarse el siguiente capítulo.',
            'CONTRATO: llama a la herramienta analizar_estructura_capitulos. No escribas prosa ni devuelvas texto fuera de la herramienta.',
            asContext('Documento de Estructura', structureContent, '(vacío)'),
            asContext('Capítulos del manuscrito', JSON.stringify(normalizedChapters), '[]'),
            asContext('Último capítulo disponible', JSON.stringify(lastChapter), 'null'),
            asContext('Información general del mundo', worldContent, '(sin información general)'),
            asContext('Personajes', JSON.stringify(characters), '[]'),
        ].join('\n\n'),
    },
    chapterDraft: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ title, plan, structure, sizeLabel, lastChapter, contextContent }) => [
            'ROL: Eres el novelista responsable de redactar un capítulo completo y el editor de continuidad que debe impedir contradicciones.',
            'TAREA: escribe el capítulo indicado por la estructura aprobada. No entregues resumen, esquema, muestra, explicación ni comentario editorial.',
            'ORDEN DE PRIORIDAD: estructura y escenas aprobadas; continuidad del manuscrito; mundo y personajes; instrucciones de estilo.',
            'PLANIFICACIÓN:',
            '- Desarrolla todas las escenas aprobadas en el orden recibido, sin omitirlas, fusionarlas ni sustituirlas.',
            '- Cada escena debe tener objetivo, acción, conflicto y consecuencia visible.',
            '- Usa transiciones claras y deja exactamente la consecuencia prevista por la estructura.',
            'CONTINUIDAD:',
            '- Conserva punto de vista, persona, tiempo verbal, tono, registro y tratamiento de diálogos.',
            '- No introduzcas personajes, lugares, poderes, relaciones, fechas o hechos no autorizados.',
            '- Si falta un detalle, elige la opción más conservadora y compatible.',
            'FORMATO:',
            '- Devuelve prosa narrativa completa en texto plano, con párrafos y bloques de diálogo separados.',
            '- No uses HTML, Markdown, encabezados técnicos, notas, etiquetas de escena ni texto fuera del capítulo.',
            '- No termines con frase incompleta, elipsis terminal, marcador de truncamiento, “continuará” o resumen.',
            `Tamaño objetivo: ${sizeLabel}. Permanece dentro del rango sin recortar escenas.`,
            `Título: ${title}`,
            `Plan estructurado: ${JSON.stringify(plan || {})}`,
            `Estructura aprobada completa:\n${structure || '(no disponible; usa el plan estructurado)'}`,
            `Último capítulo:\n${JSON.stringify(lastChapter)}`,
            `Contexto completo de continuidad:\n${contextContent || '(sin contexto adicional)'}`,
            'Devuelve únicamente los argumentos de la herramienta solicitada.',
        ].join('\n\n'),
    },
    chapterFormatting: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ original }) => [
            'ROL: Eres un corrector de formato de lectura.',
            'TAREA: organiza el texto completo para que sea legible en un editor narrativo.',
            'REGLA ABSOLUTA: no cambies, elimines, añadas ni reordenes ninguna palabra, signo, diálogo o fragmento.',
            'Solo puedes insertar saltos de línea dobles entre párrafos, bloques de diálogo y cambios claros de escena.',
            'Conserva exactamente ortografía, puntuación, comillas, guiones, nombres y orden original.',
            'No resumas, no corrijas estilo, no reescribas y no agregues títulos.',
            'Devuelve únicamente los argumentos de la herramienta aplicar_formateo_lectura.',
            asContext('Texto original completo', original),
        ].join('\n\n'),
    },
    chapterDirections: {
        version: PROMPT_VERSION,
        responseMode: 'json',
        build: ({ idea, chapterPlan, lastChapter, openThreads, contextContent }) => [
            'ROL: Eres un editor de desarrollo narrativo. Diseña posibilidades, pero no redactes prosa.',
            'TAREA: propone exactamente tres direcciones realmente distintas para el próximo capítulo.',
            'Las tres deben conservar hechos establecidos y responder a la idea del usuario.',
            'Opción 1: conservadora y de bajo riesgo. Opción 2: aumenta tensión o costo emocional. Opción 3: arriesgada pero compatible y con consecuencias claras.',
            'Explica propósito, conflicto, revelaciones posibles, consecuencias, riesgos y compatibilidad tonal.',
            'No inventes una solución definitiva si la estructura indica que el conflicto debe continuar.',
            'Devuelve únicamente el JSON solicitado, sin comentarios fuera de él.',
            asContext('Idea del usuario', idea, '(sin idea adicional)'),
            asContext('Plan detectado', JSON.stringify(chapterPlan || {}), '{}'),
            asContext('Último capítulo', JSON.stringify(lastChapter), 'null'),
            asContext('Cabos abiertos', JSON.stringify(openThreads), '[]'),
            asContext('Contexto de apoyo', contextContent, '(sin contexto adicional)'),
        ].join('\n\n'),
    },
    chapterScene: {
        version: PROMPT_VERSION,
        responseMode: 'json',
        build: ({ nextNumber, size, chapterPlan, direction, scenes, lastChapter, contextContent, instruction }) => [
            'ROL: Eres un diseñador de escenas, no un redactor de prosa.',
            `TAREA: propone únicamente la escena ${nextNumber} del capítulo en el formato solicitado.`,
            'Debe continuar lo aprobado, avanzar el conflicto y dejar una transición clara.',
            'No repitas escenas, no resuelvas antes de tiempo el conflicto y no introduzcas personajes o hechos no autorizados.',
            'Si una revelación está reservada, conviértela en indicio o tensión, no la reveles completa.',
            'Cada campo debe ser concreto y accionable: objetivo, lugar/momento, personajes, conflicto, acción, revelación, cambio emocional y transición.',
            'Devuelve únicamente el objeto scene; no incluyas prosa ni explicaciones.',
            asContext('Tamaño objetivo', size),
            asContext('Plan', JSON.stringify(chapterPlan || {})),
            asContext('Dirección elegida', JSON.stringify(direction || {})),
            asContext('Escenas aprobadas', JSON.stringify(scenes)),
            asContext('Último capítulo', JSON.stringify(lastChapter), 'null'),
            asContext('Contexto', contextContent, '(sin contexto adicional)'),
            asContext('Instrucción adicional', instruction, '(ninguna)'),
        ].join('\n\n'),
    },
    consistencyAudit: {
        version: PROMPT_VERSION,
        responseMode: 'tool',
        build: ({ auditType, query, canonical, instruction, normalizedDocuments }) => {
            const integral = auditType === 'full';
            return [
                'Eres el auditor principal de una obra narrativa. Esta es una auditoría integral, no una revisión puntual ni una tarea de escritura.',
                integral
                    ? 'Analiza automáticamente todas las dimensiones relevantes: canon y continuidad, contradicciones, incoherencias, huecos de trama, causalidad, consecuencias, personajes, relaciones, evolución, mundo, reglas, cronología, terminología, referencias desactualizadas y cabos abiertos.'
                    : `El usuario solicitó una auditoría dirigida sobre el área: ${auditType}. Mantén el mismo rigor de evidencia, pero prioriza esa área.`,
                'No modifiques nada. No esperes que el usuario especifique qué problema buscar: descubre los problemas a partir de todos los documentos recibidos.',
                'Distingue entre contradicción confirmada, hueco probable, pregunta abierta intencional y simple ausencia de información. No conviertas una posibilidad en un hecho.',
                'Cada hallazgo debe apuntar a un documentId válido. Para contradicciones entre documentos incluye evidence con al menos una cita exacta de cada documento involucrado.',
                'Para huecos de trama y causalidad incluye la evidencia del planteamiento, consecuencia o transición que hace visible el vacío. Si no puedes demostrarlo, marca evidencia insuficiente o no lo reportes.',
                'originalText debe ser el fragmento mínimo literal y replacementText debe conservar una oración gramatical. No propongas cambiar hechos por aparecer una sola vez.',
                'Para muletillas conserva usos intencionales y reescribe conectores sobrantes cuando sea necesario.',
                `Elemento o búsqueda opcional: ${query || '(ninguno; realiza la auditoría integral)'}`,
                `Fuente de verdad opcional: ${canonical || '(no definida; compara y detecta)'}`,
                `Instrucción adicional opcional: ${instruction || '(ninguna)'}`,
                asContext('Documentos', JSON.stringify(normalizedDocuments)),
                'Clasifica cada hallazgo con una categoría clara, severidad y confianza. Reporta los hallazgos mediante la herramienta disponible y no escribas texto fuera de ella.',
            ].join('\n\n');
        },
    },
    coreImpact: {
        version: PROMPT_VERSION,
        responseMode: 'json',
        build: ({ request, contextText }) => [
            'Analiza el impacto narrativo de esta solicitud sin modificar documentos.',
            'Devuelve únicamente JSON con summary, impact, affectedDocuments, risks y recommendation.',
            SHARED_RULES,
            asContext('Solicitud', request),
            asContext('Documentos disponibles', contextText),
        ].join('\n\n'),
    },
    corePatch: {
        version: PROMPT_VERSION,
        responseMode: 'json',
        build: ({ limit, impactAnalysis, request, contextText }) => [
            `Eres el Core de edición. Prepara ${limit}.`,
            'Devuelve únicamente JSON con summary y patches[]. Cada parche debe usar docId exacto, original literal y content completo del documento afectado.',
            'Está prohibido usar HTML, Markdown o inventar IDs.',
            SHARED_RULES,
            asContext('Análisis previo', JSON.stringify(impactAnalysis)),
            asContext('Solicitud', request),
            asContext('Documentos disponibles', contextText),
        ].join('\n\n'),
    },
});

export const buildRegisteredPrompt = (name, input = {}) => {
    const definition = PROMPT_REGISTRY[name];
    if (!definition) throw new Error(`Prompt no registrado: ${name}`);
    return definition.build(input);
};

export const getPromptDefinition = (name) => PROMPT_REGISTRY[name] || null;
