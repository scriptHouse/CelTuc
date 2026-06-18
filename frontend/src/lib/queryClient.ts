import { QueryClient } from '@tanstack/react-query'

/**
 * Cliente de TanStack Query. Aunque hoy los datos viven en localStorage, usamos
 * Query igual que en producción: cuando exista un backend, solo cambian los
 * `services/*`, no los componentes.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 0,
      refetchOnWindowFocus: false,
    },
  },
})
