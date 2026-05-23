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
    
    const regex = /\[\[PERSONAJE:\s*(.*?)\s*\]\]\s*\[\[FRAGMENTO\]\]\s*([\s\S]*?)\s*\[\[FIN_PERSONAJE\]\]/g;
    const results = [];
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        results.push({
            nombre: match[1].trim(),
            fragmento_exacto: match[2].trim()
        });
    }
    
    // Fallback to extractJSON if it happened to return JSON anyway
    if (results.length === 0) {
        try {
            const parsed = extractJSON(text);
            if (Array.isArray(parsed)) return parsed;
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
export const buildChatQuestionsPrompt = (characterName, focusId, initialIdeaOrExistingProfile = "", isRefining = false) => {
    const focus = FOCUSES[focusId] || FOCUSES.general;
    
    const contextType = isRefining ? 'PERFIL ACTUAL DEL PERSONAJE' : 'IDEA INICIAL / ARQUETIPO';
    const contextStr = initialIdeaOrExistingProfile 
        ? `\n--- ${contextType} ---\n${initialIdeaOrExistingProfile}\n--------------------------`
        : '';

    return `Actúa como un psicólogo y guionista de cine experto en el desarrollo de personajes literarios tridimensionales complejos.
Tu tarea es formular exactamente 3 preguntas de diagnóstico extremadamente profundas, evocadoras e inquisitivas para el personaje "${characterName}".

Estas preguntas deben centrarse en el siguiente enfoque narrativo:
ENFOQUE: "${focus.title}"
DESCRIPCIÓN: ${focus.description}
${contextStr}

INSTRUCCIONES DE DISEÑO DE PREGUNTAS:
- Si es para REFINAR (isRefining = true), analiza lo que ya se conoce en su perfil actual y formula preguntas que exploren vacíos, contradicciones no resueltas, relaciones de fricción o dilemas latentes que no estén completamente detallados.
- Si es para CREAR, formula preguntas que ayuden a revelar su núcleo moral, sus justificaciones racionales y el dolor que motiva sus actos.
- Diseña preguntas con alto valor lírico y dramático. Evita preguntas genéricas.

INSTRUCCIONES DE FORMATO:
- Devuelve la respuesta ÚNICAMENTE en formato de array JSON de strings con exactamente 3 elementos:
[
  "Pregunta profunda 1...",
  "Pregunta profunda 2...",
  "Pregunta profunda 3..."
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

    return `Actúa como un novelista consagrado y editor literario de alto nivel.
Tu misión es consolidar las respuestas de la entrevista psicológica y redactar el perfil definitivo en texto limpio, estructurado y literario para el personaje "${characterName}".

Enfoque General del Refinamiento: "${focus.title}"

--- RESPUESTAS DE LA ENTREVISTA ---
${qaStr}
------------------------------------
${existingStr}

INSTRUCCIONES DE REDACCIÓN Y FUSIÓN:
${hasExisting
  ? `1. ¡CRÍTICO! El personaje ya posee un perfil documentado (se adjunta arriba). NO debes borrarlo. Tu meta es INTEGRAR y FUSIONAR la información nueva de esta entrevista dentro del perfil actual.
2. Analiza el bloque existente, reescribe los párrafos correspondientes para incorporar los nuevos rasgos psicológicos revelados, y añade nuevas subsecciones si el cuestionario arrojó luz sobre áreas nuevas.
3. El resultado debe ser una única ficha coherente, fluida y consolidada que contenga lo viejo y lo nuevo amalgamado.`
  : `1. Crea una ficha tridimensional estructurada desde cero en base a las respuestas de la entrevista.
2. Organiza la información en secciones claras empleando encabezados de texto plano.`}

NORMAS DE FORMATO:
- Estructura el perfil utilizando una jerarquía limpia de títulos planos de Markdown (ej. "## [Nombre]", "### Psicología y Fisuras", "### Deseos y Contradicciones").
- Utiliza una prosa literaria exquisita, llena de subtexto y sumamente agradable al lector.
- Si hay citas evocadoras, utiliza el bloque de citas de Markdown ("> [Cita]").
- **CRÍTICO:** Devuelve ÚNICAMENTE la ficha final redactada en texto/markdown plano. No incluyas cajas de código tipo \`\`\`markdown, ni preámbulos, ni explicaciones de "Aquí tienes tu ficha...". Devuelve directamente el texto de la ficha redactada.`;
};
