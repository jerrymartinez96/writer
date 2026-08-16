import { BookOpen, Globe2, Headphones, Network, UsersRound } from 'lucide-react';

/**
 * Catálogo único de Tool Rooms.
 * La navegación y las tarjetas consumen esta definición para evitar nombres
 * y rutas duplicadas entre componentes.
 */
export const TOOL_ROOMS = [
    {
        id: 'characters',
        route: 'toolroom:characters',
        title: 'Diseñador de personajes',
        eyebrow: 'Laboratorio narrativo',
        description: 'Construye personajes consistentes, profundos y conectados con tu historia.',
        icon: UsersRound,
        accent: 'amber',
        status: 'available',
        contextRequirements: ['character'],
    },
    {
        id: 'cowriter',
        route: 'toolroom:cowriter',
        title: 'Coescritor',
        eyebrow: 'Escritura colaborativa',
        description: 'Trabaja escenas y documentos con propuestas revisables de la IA.',
        icon: BookOpen,
        accent: 'indigo',
        status: 'available',
        contextRequirements: ['document'],
    },
    {
        id: 'world',
        route: 'toolroom:world',
        title: 'Constructor de mundo',
        eyebrow: 'Lore y continuidad',
        description: 'Explora relaciones, cronologías y reglas de tu universo narrativo.',
        icon: Network,
        accent: 'emerald',
        status: 'available',
        contextRequirements: ['world'],
    },
    {
        id: 'narrator',
        route: 'toolroom:narrator',
        title: 'Narrador',
        eyebrow: 'Estudio de audio',
        description: 'Convierte capítulos en una experiencia de escucha controlable y envolvente.',
        icon: Headphones,
        accent: 'violet',
        status: 'available',
        contextRequirements: ['chapter'],
    },
    {
        id: 'coherence',
        route: 'toolroom:coherence',
        title: 'Editor de coherencia',
        eyebrow: 'Control de calidad',
        description: 'Detecta contradicciones de personajes, tiempo, lugares y continuidad.',
        icon: Globe2,
        accent: 'cyan',
        status: 'available',
        contextRequirements: ['document'],
    },
];

export const getToolRoom = (id) => TOOL_ROOMS.find((room) => room.id === id) || null;
export const getToolRoomByRoute = (route) => TOOL_ROOMS.find((room) => room.route === route) || null;
