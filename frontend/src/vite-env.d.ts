/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base de la API. Por defecto `/api` (mismo origen / proxy de Vite). */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
