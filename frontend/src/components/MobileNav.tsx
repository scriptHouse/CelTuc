import { useEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavItem } from '@/components/navItems'

/**
 * Navegación móvil (< lg): barra inferior adaptativa + hoja de módulos.
 *
 *  - Con hasta 5 módulos visibles la barra los muestra todos, como siempre.
 *  - Con más, muestra 4 fijos + un 5.º slot «Más» que abre una hoja inferior
 *    con el resto en grilla (patrón de Google Drive / Gmail / Mercado Pago).
 *  - Slot dinámico: si la ruta activa vive en la hoja, el slot «Más» se
 *    convierte en ese módulo (ícono + etiqueta, con la píldora activa) y un
 *    toque reabre la hoja para cambiar de módulo.
 *  - La hoja sigue al dedo: se arrastra hacia abajo para cerrarla (dispara por
 *    distancia o velocidad) y ofrece resistencia elástica hacia arriba.
 *
 * No reutiliza <Modal>: necesita física de arrastre sobre el panel y un ciclo
 * de gestos/foco propio que el modal genérico no expone.
 */

/** Hasta esta cantidad, todos los módulos entran en la barra sin truncarse. */
const MAX_EN_BARRA = 5
/** Al desbordar, quedan estos fijos y el resto pasa a la hoja. */
const FIJOS = 4
/** Umbrales del gesto de cierre: distancia (px) o velocidad (px/ms). */
const CIERRE_DISTANCIA = 96
const CIERRE_VELOCIDAD = 0.55

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Réplica del criterio de NavLink con `end={to === '/'}`. */
function esRutaActiva(pathname: string, to: string) {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation()
  const [abierta, setAbierta] = useState(false)

  const desborda = items.length > MAX_EN_BARRA
  const enBarra = desborda ? items.slice(0, FIJOS) : items
  const extras = desborda ? items.slice(FIJOS) : []
  const extraActivo = extras.find((item) => esRutaActiva(pathname, item.to))
  const IconoSlot = extraActivo?.icon ?? MoreHorizontal

  // Al navegar (tap en un módulo de la hoja) la hoja se retira sola.
  useEffect(() => {
    setAbierta(false)
  }, [pathname])

  function abrir() {
    setAbierta(true)
    // Confirmación háptica sutil donde el hardware la soporta (Android).
    navigator.vibrate?.(8)
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 lg:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        aria-label="Principal"
      >
        <div
          className="mx-auto grid max-w-md rounded-[1.35rem] border border-line bg-surface/92 p-1.5 shadow-[0_18px_45px_rgba(10,10,11,0.16)] backdrop-blur-xl"
          style={{ gridTemplateColumns: `repeat(${enBarra.length + (desborda ? 1 : 0)}, minmax(0, 1fr))` }}
        >
          {enBarra.map((item) => (
            <ItemBarra key={item.to} item={item} />
          ))}

          {desborda && (
            <button
              type="button"
              onClick={abrir}
              aria-haspopup="dialog"
              aria-expanded={abierta}
              aria-label={extraActivo ? `${extraActivo.label} — cambiar de módulo` : 'Más módulos'}
              className={cn(
                'relative z-10 flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-medium leading-none outline-none transition-colors duration-200',
                'focus-visible:ring-2 focus-visible:ring-ink-900',
                extraActivo ? 'text-ink-950' : 'text-ink-400 hover:text-ink-700',
              )}
            >
              {/* La key reinicia la animación de "pop" cuando cambia el módulo del slot. */}
              <span
                key={extraActivo?.to ?? 'mas'}
                className={cn(
                  'ct-slot-pop relative grid h-9 w-9 place-items-center rounded-2xl transition-all duration-200',
                  extraActivo
                    ? 'bg-ink-950 text-on-ink shadow-[0_8px_18px_rgba(10,10,11,0.22)]'
                    : 'text-ink-400',
                )}
              >
                <IconoSlot className="h-5 w-5" strokeWidth={1.85} />
                {extraActivo && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-line bg-surface text-ink-500"
                  >
                    <MoreHorizontal className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </span>
                )}
              </span>
              <span className="block max-w-full truncate">{extraActivo ? extraActivo.label : 'Más'}</span>
            </button>
          )}
        </div>
      </nav>

      {desborda && (
        <HojaModulos
          abierta={abierta}
          onCerrar={() => setAbierta(false)}
          extras={extras}
          pathname={pathname}
        />
      )}
    </>
  )
}

/** Ítem de la barra: mismo lenguaje visual que siempre (píldora oscura activa). */
function ItemBarra({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      aria-label={item.label}
      className={({ isActive }) =>
        cn(
          'relative z-10 flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-medium leading-none outline-none transition-colors duration-200',
          'focus-visible:ring-2 focus-visible:ring-ink-900',
          isActive ? 'text-ink-950' : 'text-ink-400 hover:text-ink-700',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'grid h-9 w-9 place-items-center rounded-2xl transition-all duration-200',
              isActive
                ? 'bg-ink-950 text-on-ink shadow-[0_8px_18px_rgba(10,10,11,0.22)]'
                : 'text-ink-400',
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <span className="block max-w-full truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

interface HojaModulosProps {
  abierta: boolean
  onCerrar: () => void
  extras: NavItem[]
  pathname: string
}

/**
 * Hoja inferior con el resto de los módulos.
 * Mismo ciclo mounted/entered que <Modal> (transiciones de entrada/salida sin
 * perder el desmontaje), más el gesto de arrastre para cerrar.
 */
function HojaModulos({ abierta, onCerrar, extras, pathname }: HojaModulosProps) {
  const [mounted, setMounted] = useState(abierta)
  const [entered, setEntered] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const asaRef = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  // Estado del gesto fuera de React: se actualiza a 60 fps sin re-renders.
  const gesto = useRef({
    activo: false,
    inicioY: 0,
    dy: 0,
    ultimoY: 0,
    ultimoT: 0,
    vy: 0,
    descartaClick: false,
  })

  useEffect(() => {
    if (abierta) {
      setMounted(true)
      return
    }
    setEntered(false)
    const t = setTimeout(() => setMounted(false), 220)
    return () => clearTimeout(t)
  }, [abierta])

  useEffect(() => {
    if (mounted && abierta) {
      const raf = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(raf)
    }
  }, [mounted, abierta])

  // Bloquea el scroll del fondo mientras la hoja está presente.
  useEffect(() => {
    if (!mounted) return
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previo
    }
  }, [mounted])

  // Escape cierra; si la ventana pasa a escritorio (>= lg) la hoja se retira.
  useEffect(() => {
    if (!mounted) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCerrar()
    }
    const mq = window.matchMedia('(min-width: 1024px)')
    const onMq = () => {
      if (mq.matches) onCerrar()
    }
    document.addEventListener('keydown', onKey)
    mq.addEventListener('change', onMq)
    return () => {
      document.removeEventListener('keydown', onKey)
      mq.removeEventListener('change', onMq)
    }
  }, [mounted, onCerrar])

  // Foco: guarda el origen (botón «Más»), enfoca el módulo activo o el panel,
  // y devuelve el foco al cerrar.
  useEffect(() => {
    if (abierta) {
      lastFocused.current = (document.activeElement as HTMLElement | null) ?? null
    } else {
      lastFocused.current?.focus?.()
    }
  }, [abierta])

  useEffect(() => {
    if (!entered) return
    const panel = panelRef.current
    if (!panel) return
    const objetivo = panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel
    objetivo.focus()
  }, [entered])

  if (!mounted) return null

  function alTocar(event: ReactTouchEvent<HTMLDivElement>) {
    const t = event.touches[0]
    gesto.current = {
      activo: true,
      inicioY: t.clientY,
      dy: 0,
      ultimoY: t.clientY,
      ultimoT: event.timeStamp,
      vy: 0,
      descartaClick: false,
    }
  }

  function alArrastrar(event: ReactTouchEvent<HTMLDivElement>) {
    const g = gesto.current
    const panel = panelRef.current
    if (!g.activo || !panel) return
    const t = event.touches[0]
    const dt = event.timeStamp - g.ultimoT
    if (dt > 0) g.vy = (t.clientY - g.ultimoY) / dt
    g.ultimoY = t.clientY
    g.ultimoT = event.timeStamp
    let dy = t.clientY - g.inicioY
    // Umbral: un tap con micro-movimiento no debe convertirse en arrastre.
    if (Math.abs(dy) < 6) return
    g.descartaClick = true
    // Hacia arriba la hoja no va: solo cede con resistencia elástica.
    if (dy < 0) dy = -Math.pow(-dy, 0.72)
    g.dy = dy
    panel.style.transition = 'none'
    panel.style.transform = `translateY(${dy}px)`
    if (asaRef.current) asaRef.current.style.width = '3.25rem'
  }

  function alSoltar() {
    const g = gesto.current
    const panel = panelRef.current
    if (!g.activo || !panel) return
    g.activo = false
    if (asaRef.current) asaRef.current.style.width = ''
    panel.style.transition = ''
    const cierra = g.dy > CIERRE_DISTANCIA || (g.dy > 24 && g.vy > CIERRE_VELOCIDAD)
    // El cambio de transform va en el siguiente frame para que la transición
    // (recién restaurada) anime desde la posición actual del dedo.
    requestAnimationFrame(() => {
      panel.style.transform = cierra ? 'translateY(110%)' : ''
    })
    if (cierra) onCerrar()
  }

  /** Tras un arrastre real, el click residual sobre un módulo no debe navegar. */
  function alCapturarClick(event: ReactMouseEvent) {
    if (!gesto.current.descartaClick) return
    gesto.current.descartaClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  function alTeclear(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    )
    if (focusables.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden" onKeyDown={alTeclear}>
      <div
        aria-hidden="true"
        onClick={onCerrar}
        className={cn(
          'absolute inset-0 bg-overlay backdrop-blur-[3px] transition-opacity duration-200 motion-reduce:transition-none',
          entered ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Todos los módulos"
        tabIndex={-1}
        onTouchStart={alTocar}
        onTouchMove={alArrastrar}
        onTouchEnd={alSoltar}
        onTouchCancel={alSoltar}
        onClickCapture={alCapturarClick}
        className={cn(
          'relative w-full max-w-md touch-none rounded-t-3xl border border-b-0 border-line bg-surface shadow-2xl outline-none',
          'transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none',
          entered ? 'translate-y-0 duration-300' : 'translate-y-full duration-200',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Asa de arrastre: se ensancha mientras la hoja sigue al dedo. */}
        <div
          ref={asaRef}
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-ink-200 transition-all duration-200"
        />

        <div className="flex items-baseline justify-between px-5 pb-1 pt-3">
          <h2 className="text-sm font-semibold text-ink-950">Todos los módulos</h2>
          <span className="text-xs text-ink-400 tnum">{extras.length}</span>
        </div>

        <nav aria-label="Más módulos" className="grid grid-cols-4 gap-1.5 px-4 pb-5 pt-2">
          {extras.map((item, indice) => {
            const activo = esRutaActiva(pathname, item.to)
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                aria-label={item.label}
                data-autofocus={activo ? '' : undefined}
                className={cn(
                  'ct-stagger-item group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 pb-1.5 pt-2 text-[11px] font-medium leading-none outline-none transition-transform duration-200 active:scale-[0.96]',
                  'focus-visible:ring-2 focus-visible:ring-ink-900',
                  activo ? 'text-ink-950' : 'text-ink-500',
                )}
                style={{ '--ct-index': indice } as CSSProperties}
              >
                <span
                  className={cn(
                    'grid h-12 w-12 place-items-center rounded-2xl border transition-all duration-200',
                    activo
                      ? 'border-transparent bg-ink-950 text-on-ink shadow-[0_8px_18px_rgba(10,10,11,0.22)]'
                      : 'border-line bg-canvas text-ink-600 group-hover:border-line-strong group-hover:text-ink-900',
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.85} />
                </span>
                <span className="block max-w-full truncate">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>,
    document.body,
  )
}
