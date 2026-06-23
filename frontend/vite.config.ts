import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // En desarrollo, el front (5173) habla con el backend Django (8000) vía este
  // proxy: así el código llama siempre a `/api/...` (igual que en producción,
  // donde nginx sirve front y backend en el mismo origen) y no hay líos de CORS.
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
