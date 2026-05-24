export const FOCUSES = {
    psychology: {
        id: 'psychology',
        label: 'Psicología y Trauma',
        title: '🧠 Psicología y Trauma (La Herida)',
        description: 'Traumas del pasado, secretos ocultos y los miedos más profundos que dictan sus comportamientos actuales.'
    },
    desires: {
        id: 'desires',
        label: 'Deseos y Necesidades',
        title: '🎯 Deseos Conscientes vs. Necesidades Inconscientes',
        description: 'Contradicción central: lo que cree que quiere (motivación externa) contra lo que verdaderamente necesita para crecer (desarrollo interno).'
    },
    moral: {
        id: 'moral',
        label: 'Fricción Moral y Sombras',
        title: '⚖️ Fricción Moral, Líneas Rojas y Sombras',
        description: 'Dilemas éticos, el lado oscuro del personaje y las líneas rojas que jura no cruzar jamás.'
    },
    relationships: {
        id: 'relationships',
        label: 'Relaciones y Tensiones',
        title: '👥 Relaciones y Tensiones del Elenco',
        description: 'Dinámicas relacionales con otros personajes, rivalidades, deudas emocionales y tensiones subyacentes.'
    },
    general: {
        id: 'general',
        label: 'Perfil General y Arquetipo',
        title: '✨ Perfil General y Arquetipo Literario',
        description: 'Visión equilibrada para fundar la esencia, el rol narrativo y el arquetipo literario del personaje.'
    }
};

/**
 * Extracts and parses a JSON block from AI output, even if wrapped in markdown code blocks.
 */
export const extractJSON = (text) => {
    if (!text) return null;
    const cleanText = text.trim();
    try {
        return JSON.parse(cleanText);
    } catch (e) {
        // Try extracting from ```json ... ```
        const jsonMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/) || cleanText.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch (err) {
                console.error("Failed to parse extracted markdown JSON block", err);
            }
        }
        
        // Try finding the first '{' and last '}'
        const firstCurly = cleanText.indexOf('{');
        const lastCurly = cleanText.lastIndexOf('}');
        if (firstCurly !== -1 && lastCurly !== -1) {
            try {
                return JSON.parse(cleanText.substring(firstCurly, lastCurly + 1));
            } catch (err) {
                console.error("Failed to parse substring between curly braces", err);
            }
        }
        
        // Try finding the first '[' and last ']'
        const firstBracket = cleanText.indexOf('[');
        const lastBracket = cleanText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            try {
                return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
            } catch (err) {
                console.error("Failed to parse substring between brackets", err);
            }
        }
        
        throw new Error("Could not extract valid JSON from LLM response");
    }
};

/**
 * Parses characters from the marker format:
 * [[PERSONAJE: Nombre]]
 * [[FRAGMENTO]]
 * ...
 * [[FIN_PERSONAJE]]
 */
export const parseCharactersFromMarkers = (text) => {
    if (!text) return [];
    
    const results = [];
    // Split the text by [[PERSONAJE: (case-insensitive)
    const parts = text.split(/\[\[PERSONAJE:\s*/i);
    
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const closingBracketIdx = part.indexOf(']]');
        if (closingBracketIdx === -1) continue;
        
        const nombre = part.substring(0, closingBracketIdx).trim();
        let content = part.substring(closingBracketIdx + 2);
        
        // Remove [[FRAGMENTO]] if it exists (case-insensitive)
        content = content.replace(/\[\[FRAGMENTO\]\]/gi, '');
        
        // Remove [[FIN_PERSONAJE]] or similar closing markers (case-insensitive)
        content = content.replace(/\[\[FIN_PERSONAJE\]\]/gi, '');
        content = content.replace(/\[\[FIN\]\]/gi, '');
        
        // Clean up trailing/leading whitespaces
        content = content.trim();
        
        if (nombre) {
            results.push({
                nombre,
                fragmento_exacto: content
            });
        }
    }
    
    // Fallback: only call JSON parsing if we found absolutely no markers
    if (results.length === 0) {
        try {
            // Silence console.error logs during fallback checks
            const originalConsoleError = console.error;
            console.error = () => {};
            try {
                const parsed = extractJSON(text);
                console.error = originalConsoleError;
                if (Array.isArray(parsed)) return parsed;
            } catch (err) {
                console.error = originalConsoleError;
            }
        } catch (e) {
            // Ignore fallback error
        }
    }
    
    return results;
};

/**
 * Prompt to analyze the characters flat document and extract character names and their exact text/HTML fragments.
 */
export const buildDetectionPrompt = (documentContent) => {
    return `Actúa como un analizador sintáctico y semántico experto en textos literarios.
Analiza detenidamente el siguiente documento de personajes que pertenece a una novela en desarrollo:

--- CONTENIDO DEL DOCUMENTO DE PERSONAJES ---
${documentContent || '(El documento está vacío)'}
--------------------------------------------

Tu tarea es:
1. Detectar TODOS los personajes individuales que están documentados o detallados en este texto.
2. Extraer de manera QUIRÚRGICA y TEXTUAL el fragmento exacto de texto (incluyendo sus títulos, descripciones, párrafos, notas y etiquetas HTML si las hubiera) que le pertenece al perfil de cada personaje. El fragmento debe ser EXACTAMENTE idéntico a cómo está escrito en el documento original, ya que lo usaremos para hacer un reemplazo de texto directo en el código.
   - Nota: El fragmento de cada personaje suele comenzar con su encabezado (ej. "## Sylas", "<h3>Mirella</h3>" o similar) y abarca todo el texto descriptivo del personaje hasta que empiece el siguiente o termine el documento.

Debes responder estructurando la lista de personajes detectados usando caracteres indicadores en lugar de JSON.
Para cada personaje detectado, utiliza la siguiente estructura EXACTA:

[[PERSONAJE: Nombre del Personaje]]
[[FRAGMENTO]]
Fragmento exacto textual del personaje extraído del documento (debe ser 100% idéntico al original, incluyendo HTML o markdown si lo hubiera)
[[FIN_PERSONAJE]]

REGLAS CRÍTICAS:
- No utilices bloques JSON ni formato JSON. Responde únicamente con la lista delimitada por las etiquetas indicadas.
- No incluyas preámbulos, explicaciones ni comentarios. Solo la lista de personajes estructurada con las etiquetas.
- Si el documento está vacío o no contiene personajes, no devuelvas nada o responde con un texto vacío.
- En el fragmento, debes incluir todo el texto/HTML del personaje de forma textual y exacta. No resumas, no reescribas nada. Debe ser idéntico al original para que funcione la búsqueda y reemplazo.`;
};

/**
 * Prompt to analyze the document, cast, and selected character's current profile,
 * and suggest exactly 3 highly specific, contextual areas or gaps to refine/improve.
 */
export const buildRefineSuggestionsPrompt = (characterName, characterProfile, fullDocumentContent, bookContext) => {
    return `Actúa como un editor literario y psicólogo de personajes sumamente agudo.
Estás analizando el elenco de una novela para ayudar al autor a pulir y refinar al personaje "${characterName}".

Aquí tienes el contexto general de la obra:
--- CONTEXTO DEL MANUSCRITO ---
${bookContext}
------------------------------

Aquí tienes a todos los personajes documentados (el elenco completo):
--- ELENCO DE PERSONAJES COMPLETO ---
${fullDocumentContent}
-------------------------------------

Y este es el perfil documentado del personaje que deseamos refinar:
--- PERFIL ACTUAL DE ${characterName} ---
${characterProfile}
----------------------------------------

Tu misión es identificar exactamente 3 brechas, contradicciones, lagunas de información o áreas de mejora muy específicas y lógicas en la psicología, trasfondo, motivaciones o relaciones de "${characterName}" en comparación con el resto del elenco y la trama.
- Ejemplo de brecha: Si otros personajes tienen detalles sobre su pasado familiar o apariencia física (ej. color de cabello, marcas, cicatrices) pero este no, identifícalo.
- Ejemplo de contradicción: Si su arquetipo dice ser fiel pero en la trama traiciona a alguien, sugiere explorar esa fricción moral.
- Ejemplo de relación: Sugiere pulir su fricción o deuda emocional con otro personaje específico del elenco si falta detalle.

Debes responder ÚNICAMENTE en formato JSON con la siguiente estructura exacta (un array con exactamente 3 sugerencias):
[
  {
    "titulo": "Título de la sugerencia (ej: Pasado familiar no revelado, Fricción oculta con Mirella, Contradicción en su núcleo moral)",
    "descripcion": "Descripción detallada del vacío o área a pulir, justificándolo a partir de lo que le falta en comparación con el elenco (ej: 'Varios personajes del elenco tienen marcas físicas claras de su pasado, pero el perfil de Sylas carece de ellas...', o 'Falta detallar cuál es el origen de su resentimiento hacia Mirella...')"
  },
  ...
]

REGLAS:
- Evita el melodrama pretencioso y la cursilería. Las sugerencias deben ser realistas, profesionales y de alto valor literario.
- No incluyas preámbulos, explicaciones ni comentarios. Solo el array JSON válido.`;
};

/**
 * Prompt to suggest 5 names based on the book context and current style.
 */
export const buildNameProposalsPrompt = (bookContext, option = 'completo') => {
    const optionStr = option === 'completo' ? 'nombres y apellidos' : 'solo nombres individuales';
    return `Actúa como un co-escritor y asesor lingüístico literario.
Basándote en el universo, el tono, la temática y el contexto actual de la novela descripta abajo, propón exactamente 5 nombres sugeridos que sean sumamente evocadores, coherentes y encajen a la perfección con la historia.

Debes proponer: ${optionStr}.

--- CONTEXTO DEL MANUSCRITO ---
${bookContext}
------------------------------

INSTRUCCIONES DE FORMATO:
- Devuelve la respuesta ÚNICAMENTE como un array JSON válido de strings. Ejemplo:
[
  "Nombre Sugerido 1",
  "Nombre Sugerido 2",
  "Nombre Sugerido 3",
  "Nombre Sugerido 4",
  "Nombre Sugerido 5"
]
- No agregues explicaciones, preámbulos ni números. Solo el array JSON.`;
};

/**
 * Prompt to suggest 3 detailed character profiles based on the book context.
 */
export const buildCharacterSuggestionsPrompt = (bookContext) => {
    return `Actúa como un novelista galardonado y experto en diseño de elencos de personajes literarios.
A partir del contexto del manuscrito, crea exactamente 3 propuestas de nuevos personajes para enriquecer e impulsar la trama del libro.
Cada personaje debe ser tridimensional, tener una personalidad rica y representar un contraste dramático para el elenco actual.

--- CONTEXTO DEL MANUSCRITO ---
${bookContext}
------------------------------

Debes responder estrictamente en un formato JSON válido con la siguiente estructura exacta:
[
  {
    "nombre": "Nombre sugerido y apellido",
    "rol": "Rol dramático propuesto (ej: Antagonista encubierto, Mentor cínico, Aliado poco confiable)",
    "concepto": "Un concepto tridimensional en texto plano detallando su psicología, su secreto, su motivación y cómo afecta a la trama principal."
  },
  ...
]

REGLAS:
- No agregues introducciones ni explicaciones fuera del array JSON. Solo el código JSON.`;
};

/**
 * Prompt to generate exactly 3 diagnostic questions in a conversational wizard,
 * adapted to the character, focus, and whether they are new or being refined.
 */
export const buildChatQuestionsPrompt = (characterName, focusId, initialIdeaOrExistingProfile = "", isRefining = false, customAspect = "") => {
    const focus = FOCUSES[focusId] || FOCUSES.general;
    
    const contextType = isRefining ? 'PERFIL ACTUAL DEL PERSONAJE' : 'IDEA INICIAL / ARQUETIPO';
    const contextStr = initialIdeaOrExistingProfile 
        ? `\n--- ${contextType} ---\n${initialIdeaOrExistingProfile}\n--------------------------`
        : '';

    const aspectStr = isRefining && customAspect 
        ? `\n--- ASPECTO / DETALLE ESPECÍFICO QUE EL AUTOR QUIERE REFINAR ---\n"${customAspect}"\n--------------------------------------------------------------`
        : '';

    return `Actúa como un psicólogo de personajes, editor literario y consultor de narrativa experto.
Tu tarea es formular exactamente 3 preguntas de diagnóstico psicológico y narrativo muy útiles, profundas y concretas para el personaje "${characterName}".

Estas preguntas deben centrarse exclusivamente en el siguiente enfoque narrativo:
${isRefining && customAspect ? `ENFOQUE DE REFINAMIENTO PERSONALIZADO: "${customAspect}"` : `ENFOQUE: "${focus.title}"\nDESCRIPCIÓN: ${focus.description}`}
${contextStr}
${aspectStr}

INSTRUCCIONES DE DISEÑO DE PREGUNTAS:
- ¡CRÍTICO! Evita por completo la cursilería, el melodrama teatral, la poesía pretenciosa, las metáforas góticas u oscuras exageradas (NO hagas preguntas del tipo "qué canción de cuna te cantas en la oscuridad para evadir el remordimiento" o "qué cicatriz fundacional llamas destino").
- Escribe preguntas profesionales, realistas, directas y sumamente útiles para un escritor que está construyendo una novela. Las preguntas deben ser psicológicamente agudas y estimulantes, pero formuladas de manera natural y clara.
- ${isRefining && customAspect 
    ? `Dado que el autor desea refinar el aspecto específico: "${customAspect}", formula 3 preguntas concretas que exploren precisamente ese detalle, sus causas, sus contradicciones, cómo impacta a la psicología del personaje o cómo afecta sus interacciones con los demás. No te desvíes a otros temas.`
    : `Si el enfoque es "Perfil General y Arquetipo", las preguntas deben ser fundacionales y centrarse en la identidad esencial del personaje, su función narrativa o rol en la trama, su rasgo de personalidad definitorio y sus principales fortalezas o debilidades iniciales.`}
- Si es para REFINAR (isRefining = true), analiza lo que ya se conoce en su perfil actual y haz preguntas orientadas a profundizar en contradicciones, huecos de información o evolución de sus relaciones.
- Si es para CREAR, haz preguntas que revelen su personalidad, motivaciones básicas y la forma en que se desenvuelve ante los conflictos.

INSTRUCCIONES DE FORMATO:
- Devuelve la respuesta ÚNICAMENTE en formato de array JSON de strings con exactamente 3 elementos:
[
  "Pregunta 1...",
  "Pregunta 2...",
  "Pregunta 3..."
]
- No incluyas preámbulos, introducciones ni explicaciones fuera del array.`;
};

/**
 * Prompt to suggest 3 quick creative answer suggestions for a single question.
 */
export const buildAnswerSuggestionsPrompt = (characterName, focusId, question) => {
    const focus = FOCUSES[focusId] || FOCUSES.general;

    return `Actúa como un co-escritor creativo. Un escritor tiene bloqueo frente a la siguiente pregunta diagnóstica para su personaje "${characterName}":

Pregunta: "${question}"
Enfoque Narrativo: "${focus.title}"

Genera exactamente 3 alternativas de respuestas o ideas creativas sumamente diferentes entre sí, originales y llenas de potencial dramático, para que el escritor se inspire o elija una.
Mantén cada opción sumamente concisa (de 1 a 3 frases máximo) y escríbelas en una voz sugerente y evocadora.

INSTRUCCIONES DE FORMATO:
- Devuelve estrictamente un array JSON de strings:
[
  "Opción de respuesta 1...",
  "Opción de respuesta 2...",
  "Opción de respuesta 3..."
]
- No agregues introducciones ni explicaciones fuera del array JSON.`;
};

/**
 * Prompt to compile answers and generate/merge the final clean flat-text profile.
 */
export const buildSynthesisPrompt = (characterName, focusId, questionsAndAnswers, existingProfile = "") => {
    const focus = FOCUSES[focusId] || FOCUSES.general;

    const qaStr = questionsAndAnswers.map((item, idx) => {
        return `Pregunta: ${item.question}\nRespuesta: ${item.answer || '(Inferencia de la IA)'}`;
    }).join('\n\n');

    const hasExisting = existingProfile && existingProfile.trim().length > 0;
    const existingStr = hasExisting 
        ? `\n--- PERFIL ACTUAL DEL PERSONAJE (TEXTO PLANO / HTML EXISTENTE) ---\n${existingProfile}\n--------------------------------------------------------------`
        : '';

    return `Actúa como un editor literario, consultor de narrativa y creador de fichas de personajes experto.
Tu misión es consolidar las respuestas de la entrevista psicológica y redactar el perfil técnico, descriptivo y detallado del personaje "${characterName}".

--- RESPUESTAS DE LA ENTREVISTA ---
${qaStr}
------------------------------------
${existingStr}

INSTRUCCIONES CRÍTICAS DE REDACCIÓN Y FUSIÓN:
- ¡EVITA EL LIRISMO VAGO Y LA PROSA POÉTICA NARRATIVA! No redactes el perfil como una historia corta, un cuento o un texto puramente lírico. El autor necesita una FICHA DE TRABAJO descriptiva, clara, estructurada y técnica en texto plano. Utiliza descripciones directas y listas con viñetas de Markdown simples, evitando tablas complejas u otros formatos que no sean texto plano legible.
- ¡RESPETA Y PRESERVA AL 100% EL CONTENIDO Y ESTILO ORIGINAL! Si el personaje ya tiene un perfil (se adjunta arriba), NO debes reescribir ni alterar sus descripciones físicas, color de cabello, rasgos, edad u otros hechos ya definidos. Tu tarea es únicamente INTEGRAR y COMPLEMENTAR la información nueva de la entrevista como sutiles apoyos, agregando detalles a las secciones existentes o creando una subsección nueva al final, respetando absolutamente todo lo anterior.
- Si es un personaje nuevo (desde cero), estructura la ficha de forma organizada utilizando el siguiente esquema claro:
  - Datos Básicos (Nombre, Rol Dramático, Arquetipo)
  - Apariencia Física y Detalles Concretos (Cabello, vestimenta, cicatrices, etc.)
  - Perfil Psicológico y Motivaciones (Deseos, miedos, traumas revelados)
  - Notas de Desarrollo (Detalles narrativos y evolución)

NORMAS DE FORMATO:
- Estructura el perfil utilizando una jerarquía limpia de títulos planos de Markdown (ej. "## [Nombre]", "### Apariencia Física", "### Psicología y Fisuras").
- Sé sumamente detallado, específico y concreto en lugar de usar metáforas abstractas o lenguaje poético vago.
- **CRÍTICO:** Devuelve ÚNICAMENTE la ficha final redactada en texto/markdown plano. No incluyas cajas de código tipo \`\`\`markdown, ni preámbulos, ni explicaciones de "Aquí tienes tu ficha...". Devuelve directamente el texto de la ficha redactada.`;
};
