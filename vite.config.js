import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react';
            if (id.includes('@tiptap')) return 'vendor-tiptap';
            if (id.includes('lucide-react') || id.includes('@dnd-kit')) return 'vendor-ui';
            if (id.includes('jspdf')) return 'vendor-export-pdf';
            if (id.includes('docx') || id.includes('file-saver') || id.includes('html-to-text')) return 'vendor-export';
            if (id.includes('dexie') || id.includes('lz-string') || id.includes('dompurify')) return 'vendor-data';
            if (id.includes('tippy.js') || id.includes('tailwind-merge') || id.includes('clsx')) return 'vendor-utils';
            return 'vendor';
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000 // Aumentamos un poco el límite ya que el editor siempre será pesado
  }
})
