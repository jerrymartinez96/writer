import { BookOpen, ClipboardCheck, Globe2, Headphones } from 'lucide-react';

/** Catálogo único de los cuatro espacios especializados visibles en IA Studio. */
export const TOOL_ROOMS = [
    {
        id: 'global-constructor',
        route: 'toolroom:global-constructor',
        title: 'Constructor Global',
        eyebrow: 'Canon y continuidad',
        description: 'Analiza, propone y aplica cambios importantes del canon con revisión completa.',
        icon: Globe2,
        accent: 'indigo',
        status: 'available',
        contextRequirements: ['document'],
    },
    {
        id: 'audit',
        route: 'toolroom:audit',
        title: 'Auditoría de obra',
        eyebrow: 'Control de calidad',
        description: 'Detecta contradicciones, inconsistencias y detalles que necesitan revisión.',
        icon: ClipboardCheck,
        accent: 'cyan',
        status: 'available',
        contextRequirements: ['document'],
    },
    {
        id: 'creative-studio',
        route: 'toolroom:creative-studio',
        title: 'Estudio creativo',
        eyebrow: 'Creación narrativa',
        description: 'Diseña personajes, capítulos y escenas antes de convertirlos en texto.',
        icon: BookOpen,
        accent: 'violet',
        status: 'available',
        contextRequirements: ['document'],
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
];

export const getToolRoom = (id) => TOOL_ROOMS.find((room) => room.id === id) || null;
export const getToolRoomByRoute = (route) => TOOL_ROOMS.find((room) => room.route === route) || null;
