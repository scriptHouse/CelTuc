import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { ToastProvider } from '@/components/ToastProvider'
import { ConfirmProvider } from '@/components/ConfirmProvider'
import App from './App'
import './index.css'

/* Recuperación tras un deploy: una pestaña que quedó con el bundle viejo pide
 * los chunks diferidos (p. ej. el PDF de un documento) con hashes que ya no
 * existen en el servidor → 404 → el import falla. Vite avisa con este evento:
 * recargamos una sola vez para tomar la versión nueva (el guard por sesión
 * evita un bucle de recargas si el problema fuera otro). */
window.addEventListener('vite:preloadError', () => {
  const CLAVE = 'celtuc-reload-chunks'
  const ultima = Number(sessionStorage.getItem(CLAVE) ?? 0)
  if (Date.now() - ultima < 30_000) return // ya recargamos hace nada: dejar que el error se vea
  sessionStorage.setItem(CLAVE, String(Date.now()))
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
