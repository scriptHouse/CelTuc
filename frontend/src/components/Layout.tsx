import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { useConfirm } from '@/components/ConfirmProvider'
import { BrandMark, BrandWordmark } from '@/components/Brand'
import { navItems } from '@/components/navItems'

/**
 * Layout responsive:
 *  - Móvil (< lg): cabecera superior + navegación fija inferior.
 *  - Escritorio (>= lg): sidebar compacto (íconos) que se expande en xl.
 */
export function Layout() {
  const usuario = useAuth((s) => s.usuario)
  const logout = useAuth((s) => s.logout)
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const inicial = usuario?.username?.trim().charAt(0).toUpperCase() || 'C'

  async function handleLogout() {
    const ok = await confirm({
      title: '¿Cerrar sesión?',
      description: 'Vas a volver a la pantalla de ingreso.',
      confirmLabel: 'Cerrar sesión',
      cancelLabel: 'Quedarme',
      tone: 'danger',
      icon: LogOut,
    })
    if (!ok) return
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-[100dvh] lg:flex">
      {/* ===== Sidebar (escritorio) ===== */}
      <aside className="hidden shrink-0 border-r border-line bg-surface/80 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:w-[5.5rem] lg:flex-col xl:w-64">
        <div className="flex h-20 items-center justify-center gap-2.5 px-3 xl:justify-start xl:px-6">
          <BrandMark className="h-9 w-9 shrink-0 xl:hidden" />
          <BrandWordmark className="hidden text-[1.75rem] xl:inline-flex" />
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-2" aria-label="Principal">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-12 items-center justify-center rounded-2xl px-3 text-sm font-medium outline-none transition-all duration-200 xl:justify-start xl:gap-3',
                  'focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  isActive
                    ? 'bg-ink-950 text-white shadow-[0_10px_30px_rgba(10,10,11,0.18)]'
                    : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'h-5 w-5 shrink-0 transition-transform duration-200',
                      !isActive && 'group-hover:scale-110',
                    )}
                    strokeWidth={1.85}
                  />
                  <span className="hidden truncate xl:inline">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer: usuario + cerrar sesión */}
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-2xl px-1 py-1 xl:px-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-100 text-sm font-bold text-ink-900">
              {inicial}
            </span>
            <div className="hidden min-w-0 flex-1 xl:block">
              <p className="truncate text-sm font-semibold text-ink-900">{usuario?.username}</p>
              <p className="truncate text-xs text-ink-400">{usuario?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="hidden h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 xl:grid"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="mt-1 grid h-10 w-full place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 xl:hidden"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ===== Contenido ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'sticky top-0 z-[45] flex h-14 items-center justify-between gap-3 px-4 backdrop-blur-xl transition-all duration-300 ease-out lg:hidden',
            scrolled
              ? 'top-3 mx-3 rounded-[1.35rem] border border-line bg-surface/90 shadow-[0_14px_36px_rgba(10,10,11,0.14)]'
              : 'border-b border-line bg-surface/85',
          )}
        >
          <div className="flex shrink-0 items-center gap-2">
            <BrandWordmark className="text-[1.5rem]" />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-100 text-xs font-bold text-ink-900">
              {inicial}
            </span>
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="w-full min-w-0 flex-1 px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:pb-10 xl:px-10 2xl:px-12">
          <Outlet />
        </main>
      </div>

      {/* ===== Bottom nav (móvil) ===== */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 lg:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        aria-label="Principal"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 rounded-[1.35rem] border border-line bg-surface/92 p-1.5 shadow-[0_18px_45px_rgba(10,10,11,0.16)] backdrop-blur-xl">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              aria-label={label}
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
                      isActive ? 'bg-ink-950 text-white shadow-[0_8px_18px_rgba(10,10,11,0.22)]' : 'text-ink-400',
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.85} />
                  </span>
                  <span className="block max-w-full truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
