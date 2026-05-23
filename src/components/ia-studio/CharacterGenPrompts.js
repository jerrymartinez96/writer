export const FOCUSES = {
    psychology: {
        id: 'psychology',
        label: 'Psicología y Trauma',
        title: '🧠 Psicología y Trauma (La Herida / "Ghost")',
        description: 'Explora traumas del pasado, secretos guardados y los miedos más profundos que dictan sus comportamientos actuales.'
    },
    desires: {
        id: 'desires',
        label: 'Deseos y Necesidades',
        title: '🎯 Deseos Conscientes vs. Necesidades Inconscientes',
        description: 'Examina la contradicción central: lo que cree que quiere (motivación externa) contra lo que verdaderamente necesita para crecer (desarrollo interno).'
    },
    moral: {
        id: 'moral',
        label: 'Fricción Moral y Sombras',
        title: '⚖️ Fricción Moral, Líneas Rojas y Sombras',
        description: 'Profundiza en los dilemas éticos, el lado oscuro del personaje y las líneas rojas que jura no cruzar jamás.'
    },
    relationships: {
        id: 'relationships',
        label: 'Relaciones y Tensiones',
        title: '👥 Relaciones y Tensiones del Elenco',
        description: 'Mapea las dinámicas relacionales con otros personajes, sus rivalidades, deudas emocionales y tensiones subyacentes.'
    },
    general: {
        id: 'general',
        label: 'Perfil General y Arquetipo',
        title: '✨ Perfil General y Arquetipo Literario',
        description: 'Una visión equilibrada para fundar la esencia, el rol narrativo y el arquetipo literario del personaje.'
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
 * Prompt to generate psychological/narrative diagnostic questions for characters.
 */
export const buildQuestionGenerationPrompt = (characters, focusId) => {
    const focus = FOCUSES[focusId] || FOCUSES.general;
    
    const charsListStr = characters.map((c, i) => {
        const name = typeof c === 'string' ? c : c.name;
        const detail = typeof c === 'object' && c.detail ? ` (Idea inicial/Arquetipo: ${c.detail})` : '';
        return `${i + 1}. ${name}${detail}`;
    }).join('\n');

    return `Actúa como un psicólogo experto en diseño de personajes literarios tridimensionales y de alta complejidad psicológica.
Tu objetivo es formular un cuestionario de diagnóstico con exactamente 4 o 5 preguntas profundas, desafiantes y sumamente evocadoras para cada uno de los personajes listados abajo.

Estas preguntas deben estar diseñadas bajo el siguiente enfoque narrativo:
ENFOQUE: "${focus.title}"
DESCRIPCIÓN DEL ENFOQUE: ${focus.description}

Personajes a evaluar:
${charsListStr}

INSTRUCCIONES DE FORMATO IMPORTANTES:
1. Debes devolver la respuesta estrictamente en un bloque de código JSON válido. No incluyas texto explicativo fuera del JSON.
2. El JSON debe tener la siguiente estructura exacta:
{
  "characters": [
    {
      "name": "Nombre del Personaje 1",
      "questions": [
        "Pregunta profunda 1 relacionada con el enfoque...",
        "Pregunta profunda 2 relacionada con el enfoque...",
        "Pregunta profunda 3 relacionada con el enfoque...",
        "Pregunta profunda 4 relacionada con el enfoque...",
        "Pregunta profunda 5 relacionada con el enfoque..."
      ]
    },
    ...
  ]
}

Diseña preguntas que saquen al escritor del molde genérico y exploren el subtexto, contradicciones, heridas emocionales reales y dilemas existenciales. Evita preguntas básicas como "¿cómo viste?" o "¿cuál es su color favorito".`;
};

/**
 * Prompt to suggest creative answers for a single question (writer's block solver).
 */
export const buildSuggestionPrompt = (characterName, focusId, question) => {
    const focus = FOCUSES[focusId] || FOCUSES.general;

    return `Actúa como un co-escritor creativo de alto nivel. Un novelista está diseñando al personaje "${characterName}" y tiene bloqueo de escritor frente a la siguiente pregunta de su ficha de diseño psicológico:

Pregunta: "${question}"
Enfoque Narrativo General: "${focus.title}"

Tu tarea es generar exactamente 3 opciones de respuesta/sugerencias creativas, literarias y tridimensionales para inspirarle. Cada sugerencia debe ser muy diferente entre sí, audaz y llena de potencial dramático.
Mantén cada opción concisa (de 1 a 3 frases máximo), y escríbelas en primera persona del personaje (como si él mismo confesara su verdad) o en tercera persona narrativa evocadora.

INSTRUCCIONES DE FORMATO IMPORTANTES:
1. Devuelve la respuesta estrictamente en un formato de JSON array de strings:
[
  "Opción inspiradora 1: Confesión o detalle tridimensional...",
  "Opción inspiradora 2: Otra alternativa estilísticamente opuesta y conflictiva...",
  "Opción inspiradora 3: Una opción sorprendente o moralmente ambigua..."
]
2. No agregues preámbulos, ni introducciones, ni explicaciones fuera del array JSON.`;
};

/**
 * Prompt to synthesize questions and answers into a high-fidelity tridimensional HTML profile,
 * merging with existing profile details if they exist.
 */
export const buildProfileSynthesisPrompt = (characterName, focusId, questionsAndAnswers, existingDescription = "") => {
    const focus = FOCUSES[focusId] || FOCUSES.general;
    
    const qaStr = questionsAndAnswers.map((item, idx) => {
        return `Pregunta ${idx + 1}: ${item.question}\nRespuesta: ${item.answer || '(Sin respuesta - inferir de forma lógica y creativa)'}`;
    }).join('\n\n');

    const hasExisting = existingDescription && existingDescription.trim().length > 0;
    const existingStr = hasExisting 
        ? `\n--- FICHA ACTUAL DE PERSONAJE (HTML EXISTENTE) ---\n${existingDescription}\n---------------------------------------------`
        : '';

    return `Actúa como un editor literario premium y novelista experto. Tu misión es tomar la entrevista psicológica realizada al personaje "${characterName}" y sintetizarla en un perfil de personaje tridimensional de altísima fidelidad narrativa, formateado en HTML limpio, elegante y profesional.

Enfoque Narrativo Principal: "${focus.title}"

--- RESPUESTAS DE LA ENTREVISTA ---
${qaStr}
------------------------------------
${existingStr}

INSTRUCCIONES DE SÍNTESIS Y FUSIÓN:
${hasExisting 
  ? `1. ¡CRÍTICO! El personaje YA posee una ficha (se adjunta arriba en "FICHA ACTUAL"). NO debes destruirla ni sobreescribir sus detalles de forma ciega.
2. Tu objetivo es FUSIONAR e INTEGRAR la información nueva derivada de esta entrevista dentro de la estructura HTML existente.
3. Amplía las secciones existentes, añade nuevos subapartados si es necesario (utilizando encabezados <h3>) y mantén una voz cohesionada. Preserva nombres, datos biográficos y notas clave que ya estuvieran en la ficha actual.` 
  : `1. Crea una ficha de personaje tridimensional estructurada desde cero.
2. Organiza la información en secciones lógicas utilizando encabezados elegantes. Usa etiquetas HTML semánticas como <h3> para títulos, <p> para párrafos, <strong> para énfasis, <blockquote> para citas memorables o confesiones íntimas, y <ul>/<li> para listas de rasgos.`}

SECCIONES RECOMENDADAS PARA INCLUIR/ENRIQUECER:
- **Resumen del Perfil y Rol Narrativo** (Una sinopsis lírica del alma del personaje y su papel en la trama).
- **Psicología y Fisuras del Alma** (Profundiza en la herida, traumas y miedos basados en la entrevista).
- **Deseos Internos vs. Necesidades del Arco** (Contradicción dramática que guiará su evolución).
- **Sombras y Dilemas Morales** (Líneas rojas y lo que haría bajo presión extrema).
- **Dinámicas de Comportamiento y Secretos** (Hábitos, posturas, deudas relacionales y secretos revelados).

NORMAS DE FORMATO Y ESTILO:
- Utiliza una prosa literaria exquisita, rica en subtexto y evocación.
- Devuelve ÚNICAMENTE el código HTML limpio.
- NO agregues envolturas de código markdown tipo \`\`\`html ni introducciones como "Aquí tienes tu ficha...". Devuelve directamente el HTML que empieza por las etiquetas semánticas del perfil (ej: <h3> o <div>).`;
};
