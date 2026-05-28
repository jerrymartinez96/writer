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
export const buildChatQuestionsPrompt = (characterName, focusId, initialIdeaOrExistingProfile = "", isRefining = false, customAspect = "", fullCast = "", bookContext = "") => {
    const focus = FOCUSES[focusId] || FOCUSES.general;
    
    const contextType = isRefining ? 'PERFIL ACTUAL DEL PERSONAJE' : 'IDEA INICIAL / ARQUETIPO';
    const contextStr = initialIdeaOrExistingProfile 
        ? `\n--- ${contextType} ---\n${initialIdeaOrExistingProfile}\n--------------------------`
        : '';

    const aspectStr = isRefining && customAspect 
        ? `\n--- ASPECTO / DETALLE ESPECÍFICO QUE EL AUTOR QUIERE REFINAR ---\n"${customAspect}"\n--------------------------------------------------------------`
        : '';

    const castStr = fullCast 
        ? `\n--- ELENCO DE PERSONAJES COMPLETO (Para coherencia y relaciones) ---\n${fullCast}\n------------------------------------------------------------------`
        : '';

    const bookStr = bookContext 
        ? `\n--- CONTEXTO NARRATIVO GENERAL ---\n${bookContext}\n----------------------------------`
        : '';

    return `Actúa como un psicólogo de personajes, editor literario y consultor de narrativa experto en novelas de alta calidad.
Tu tarea es formular un cuestionario de diagnóstico psicológico, estético y narrativo sumamente útil, directo y concreto para el personaje "${characterName}".

Estas preguntas deben centrarse principalmente en el siguiente enfoque narrativo:
${isRefining && customAspect ? `ENFOQUE DE REFINAMIENTO PERSONALIZADO: "${customAspect}"` : `ENFOQUE: "${focus.title}"\nDESCRIPCIÓN: ${focus.description}`}
${contextStr}
${aspectStr}
${castStr}
${bookStr}

INSTRUCCIONES DE DISEÑO DE PREGUNTAS (TÉCNICAS Y CERTERAS):
1. **Detección de Vacíos Físicos y Básicos**:
   - Analiza minuciosamente el perfil actual o idea inicial de "${characterName}".
   - Identifica si carece de datos físicos o básicos fundamentales: **edad, color de cabello, color de ojos, complexión física/tipo de cuerpo, rasgos clave de personalidad (gustos y disgustos cotidianos)**.
   - Si faltan estos detalles, **DEBES formular preguntas explícitas, concretas y directas para rellenar estos vacíos** (ej: "¿Cuál es su edad exacta o aproximada, complexión física y color de pelo y ojos?", o "¿Cuáles son sus mayores gustos y aversiones diarias?").
2. **Coherencia e Interconexión del Universo**:
   - Utiliza el "ELENCO DE PERSONAJES COMPLETO" y el "CONTEXTO NARRATIVO GENERAL" para vincular al personaje con el resto de la historia de forma orgánica.
   - Si el personaje tiene relaciones lógicas con otros personajes existentes (ej: ser hijo/a, hermano/a, subordinado/a, aliado/a o rival de alguien del elenco), **formula preguntas que interconecten directamente estas dinámicas familiares o de poder** (ej: si pertenece a la realeza como el Rey Van, indaga sobre su relación con él o sus títulos nobiliarios).
3. **Cantidad Dinámica de Preguntas**:
   - Determina dinámicamente cuántas preguntas formular (entre 3 y 6 preguntas) en función de cuántos vacíos o detalles falten en su perfil:
     - Genera **3 preguntas** si es para un refinamiento muy específico sobre un personaje que ya está sumamente completo y detallado.
     - Genera **4 o 5 preguntas** si faltan varios detalles físicos básicos o relaciones por aclarar.
     - Genera **6 preguntas** si es un personaje nuevo creado desde cero o con una descripción inicial extremadamente escueta.
4. **Tono y Estilo Profesional**:
   - ¡CRÍTICO! Evita por completo la cursilería, el melodrama pretencioso, la poesía abstracta y las metáforas góticas u oscuras exageradas (NO preguntes "qué sombra de tu herida llama a la noche").
   - Escribe preguntas profesionales, realistas, claras, directas y enfocadas en la técnica literaria. Deben ser psicológicamente agudas y estimulantes, pero formuladas de manera natural y fácil de entender.

INSTRUCCIONES DE FORMATO:
- Devuelve la respuesta ÚNICAMENTE en formato de array JSON de strings con la cantidad dinámica de elementos que hayas decidido (de 3 a 6 elementos):
[
  "Pregunta 1...",
  "Pregunta 2...",
  ...
]
- No incluyas preámbulos, introducciones ni explicaciones fuera del array JSON.`;
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
export const buildSynthesisPrompt = (characterName, focusId, questionsAndAnswers, existingProfile = "", fullCast = "", bookContext = "") => {
    const focus = FOCUSES[focusId] || FOCUSES.general;

    const qaStr = questionsAndAnswers.map((item, idx) => {
        return `Pregunta: ${item.question}\nRespuesta: ${item.answer || '(Inferencia de la IA)'}`;
    }).join('\n\n');

    const hasExisting = existingProfile && existingProfile.trim().length > 0;
    const existingStr = hasExisting 
        ? `\n--- PERFIL ACTUAL DEL PERSONAJE (A PRESERVAR Y EDITAR) ---\n${existingProfile}\n--------------------------------------------------------------`
        : '';

    const castStr = fullCast 
        ? `\n--- ELENCO DE PERSONAJES COMPLETO (Para consistencia y deducción) ---\n${fullCast}\n---------------------------------------------------------------`
        : '';

    const bookStr = bookContext 
        ? `\n--- CONTEXTO GENERAL DEL LIBRO ---\n${bookContext}\n----------------------------------`
        : '';

    return `Actúa como un editor literario, consultor de narrativa y creador de fichas de personajes de élite.
Tu misión es consolidar las respuestas de la entrevista y fusionarlas para redactar o actualizar el perfil técnico, descriptivo y tridimensional del personaje "${characterName}".

--- RESPUESTAS DE LA ENTREVISTA ---
${qaStr}
------------------------------------
${existingStr}
${castStr}
${bookStr}

INSTRUCCIONES CRÍTICAS DE REDACCIÓN, FUSIÓN Y EDICIÓN:
1. **Consistencia Absoluta con el Universo (apellido, realeza, relaciones)**:
   - Analiza el "ELENCO DE PERSONAJES COMPLETO" y el "CONTEXTO GENERAL DEL LIBRO".
   - Asegúrate de deducir y plasmar datos coherentes del universo en la ficha de "${characterName}". Por ejemplo, si es hija del Rey Van Arcadia, su apellido es indudablemente "Arcadia", su título es "Princesa", y posee los rasgos divinos/físicos y el contexto de su hermandad compartidos en el libro. No digas "(apellido no especificado)" ni ignores su estatus real.
2. **Respeto a Fichas Especiales y Formatos Únicos**:
   - Si el personaje ya posee un perfil estructurado con secciones no estándar o métricas especiales (como las habilidades mágicas, maná total, recipientes y mecánicas de deidad de SUI o la Legión Blanca), **DEBES preservar y respetar estrictamente esa estructura y contenido intacto**. No homogeneices el perfil a una plantilla simple de datos básicos si esto destruye su formato original rico y único.
3. **Respeto Absoluto a Omisiones (\`[OMITIDO]\`)**:
   - Si el autor omitió responder una pregunta (marcada con la respuesta \`[OMITIDO]\` o descrita como omitida), **NO DEBES inventar, sugerir ni rellenar de forma artificial información para ese detalle o aspecto**. Deja esa característica física, dato biográfico o secreto como "no especificado" o "desconocido", o simplemente no agregues ninguna sección para ello si era un personaje nuevo. Respeta al 100% que el escritor quiere mantener ese detalle sin definir.
4. **Soporte para Eliminaciones y Modificaciones Explícitas**:
   - Si el autor indica explícitamente en alguna de las respuestas que desea **MODIFICAR** o **ELIMINAR** una característica física, sección, habilidad o dato que ya existía en el perfil anterior (ej: "elimina la cúpula aegis", "quítale las cicatrices" o "cambia su personalidad"), **DEBES ejecutar fielmente esa remoción o alteración en el texto final** en lugar de preservarlo a ciegas.
5. **No Destructivo**:
   - Integra y complementa la información nueva derivada de la entrevista de forma natural, enriqueciendo los párrafos existentes, añadiendo listas de viñetas claras o creando nuevas subsecciones coherentes al final.
6. **Formato Técnico de Trabajo**:
   - Evita el lirismo vago o la prosa poética abstracta. Redacta descripciones directas, técnicas y útiles para el proceso diario de escritura de un novelista.
   - Utiliza títulos y subtítulos de Markdown limenos (ej: "## [Nombre]", "### Datos Básicos", "### Apariencia Física", "### Notas de Desarrollo"). Evita cajas de código Markdown (\`\`\`markdown) en tu respuesta.

NORMAS DE FORMATO:
- Devuelve ÚNICAMENTE la ficha técnica final redactada en formato de texto plano/Markdown. No incluyas preámbulos, saludos, ni explicaciones adicionales.`;
};

/**
 * Prompt to analyze a list of character documents and detect which ones contain multiple distinct characters,
 * extracting them separately so they can be separated into individual files.
 */
export const buildMultiCharacterDetectionPrompt = (documents) => {
    const docsStr = documents.map(d => {
        return `=== DOCUMENTO ID: ${d.id} (Título: ${d.title}) ===\n${d.content || '(Vacío)'}\n================================================`;
    }).join('\n\n');

    return `Actúa como un analizador semántico experto de elencos literarios.
Estás analizando la lista de documentos de personajes de un escritor para verificar si el contenido de los documentos individuales está agrupado (es decir, si un solo documento contiene descripciones de más de un personaje).

Analiza detalladamente el contenido de los siguientes documentos:
${docsStr}

Tu tarea consiste en:
1. Detectar TODOS los personajes individuales que se describen detalladamente en todos los documentos.
2. Identificar cuáles de estos documentos contienen MÁS DE UN personaje (por ejemplo, si en un documento con ID "doc_123" y título "Sylas" también se define detalladamente a "Mirella" y "Alistair" con sus propios títulos/secciones).
3. Devolver los perfiles de personajes individuales extraídos de forma limpia y quirúrgica.

Debes responder ÚNICAMENTE con un objeto JSON válido que tenga la siguiente estructura:
{
  "characters": [
    {
      "name": "Nombre completo del personaje detectado",
      "description": "El perfil Markdown/HTML completo y exacto de este personaje extraído quirúrgicamente (manteniendo su riqueza, títulos, párrafos y viñetas)",
      "sourceDocId": "ID del documento original donde se encontró",
      "sourceDocTitle": "Título del documento original"
    }
  ],
  "groupedDocuments": [
    {
      "docId": "ID del documento que tiene múltiples personajes",
      "docTitle": "Título del documento agrupado",
      "characterNames": ["Nombre del Personaje 1", "Nombre del Personaje 2"]
    }
  ]
}

REGLAS CRÍTICAS:
- Si un documento contiene únicamente un personaje y no hay otros descritos allí, NO lo agregues a "groupedDocuments". Solo agrégalo a "characters" para que sepamos su perfil individual.
- "groupedDocuments" solo debe listar aquellos documentos que claramente tienen más de un personaje principal estructurado y desarrollado en su descripción (por ejemplo, encabezados distintos para cada personaje).
- No agregues explicaciones, preámbulos ni marcas de formato Markdown como \`\`\`json. Solo devuelve el JSON válido.`;
};

