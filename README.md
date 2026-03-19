# 🖋️ Writer

Una plataforma minimalista y potente diseñada para escritores que buscan un entorno de escritura enfocado, organizado y aumentado por IA.

## ✨ Características Principales

- **Biblioteca Personal:** Gestiona tus obras con portadas personalizables en una estantería digital elegante.
- **Editor Enriquecido:** Escritura sin distracciones basada en Tiptap con soporte para formato avanzado.
- **Sistema de Menciones:** Etiqueta y organiza tus personajes directamente en el texto.
- **Modo Lectura:** Una interfaz limpia y tipográfica para revisar tus historias con comodidad.
- **Text-to-Speech:** Escucha tus capítulos leídos en voz alta para detectar errores de flujo.
- **Prompt Studio (IA):** Refina párrafos y diálogos utilizando inteligencia artificial integrada.

## 🚀 Tecnologías

- **Frontend:** React + Vite + Tailwind CSS
- **Backend/Auth:** Firebase (Firestore, Authentication, Hosting)
- **Editor:** Tiptap
- **Iconos:** Lucide React

## 🛠️ Instalación y Configuración

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/jerrymartinez96/writer.git
   cd writer
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   Copia el archivo de ejemplo y completa tus credenciales de Firebase:
   ```bash
   cp .env.example .env.local
   ```

## 📝 Notas de Versión

> [!IMPORTANT]
> **Modo Local/Offline Retirado Temporalmente:** El sistema de guardado local y detección automática offline ha sido desactivado temporalmente para resolver problemas de rendimiento, inconsistencia de datos y conflictos complejos entre dispositivos. El equipo está rediseñando el motor de sincronización para ofrecer una experiencia más robusta en el futuro. Por ahora, se requiere una conexión activa a internet para garantizar que tus cambios se guarden correctamente en la nube.

4. **Correr en local:**
   ```bash
   npm run dev
   ```

5. **Desplegar en Firebase:**
   ```bash
   npm run build && npx firebase-tools deploy --only hosting
   ```
