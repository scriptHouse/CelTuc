import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'celtuc-theme'

/**
 * Tema inicial. Lo más fiable es leer el atributo que el script anti-flash de
 * `index.html` ya dejó en <html> (así el store nace sincronizado y nunca
 * parpadea). Si no estuviera, caemos a localStorage y, por último, a claro.
 */
function readInitial(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'dark' || attr === 'light') return attr
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* localStorage no disponible */
  }
  return 'light'
}

/** Aplica el tema al documento y lo persiste como string plano ('light'|'dark'). */
function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
  // El color de la barra del navegador en móvil acompaña al fondo de la app.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0a0b' : '#f7f7f8')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Modo privado / sin acceso: el tema igual queda aplicado en memoria.
  }
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

/**
 * Estado global del tema (claro / oscuro). El cambio es manual mediante el
 * toggle; la elección se recuerda entre sesiones. `color-scheme` lo resuelve el
 * CSS a partir de `[data-theme]`, así los controles nativos también se adaptan.
 */
export const useTheme = create<ThemeState>((set, get) => ({
  theme: readInitial(),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },
}))
