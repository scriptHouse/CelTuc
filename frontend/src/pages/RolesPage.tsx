import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  Eye,
  History,
  LayoutGrid,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import type { Rol, UsuarioAdmin } from '@/types'
import {
  actualizarRol,
  crearRol,
  eliminarRol,
  listarPermisos,
  listarRoles,
  type RolInput,
} from '@/services/roles'
import { actualizarUsuario, listarUsuarios } from '@/services/usuarios'
import { useAuth } from '@/store/auth'
import { fechaHora } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import { ComoFunciona, GuiaEquipo } from '@/components/equipo/ComoFunciona'
import { leerErrores, mensajeDeError } from '@/components/equipo/errores'
import {
  SIEMPRE_VISIBLES,
  listaEnPalabras,
  menuConPermisos,
  modulosDeCodigos,
  modulosDelCatalogo,
  queVeEnPalabras,
} from '@/components/equipo/modulos'
import type { ModuloInfo } from '@/components/equipo/modulos'
import { Bloqueado, Etiqueta, Explicacion, MensajeCampo } from '@/components/equipo/piezas'

/**
 * Roles y permisos (solo administradores). Se llega desde Usuarios o Empleados.
 *
 * Un rol es una lista de pantallas: se lo das a una cuenta y esa cuenta ve solo
 * esas pantallas del menú. Maestro-detalle: a la izquierda los roles, a la
 * derecha el elegido, con cada pantalla explicada en palabras, una vista previa
 * de cómo le queda el menú a quien lo tenga, y las cuentas que lo tienen.
 *
 * Los administradores y el superadmin no se configuran acá: ven todo siempre
 * (lo garantiza el backend con `es_administrador`).
 */
export function RolesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const yo = useAuth((s) => s.usuario)
  const refrescarUsuario = useAuth((s) => s.refrescarUsuario)
  const soySuper = Boolean(yo?.is_superuser)
  const desde = (location.state as { desde?: string } | null)?.desde ?? '/usuarios'

  const { data: roles = [], isLoading: cargandoRoles, isFetching: refrescandoRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: listarRoles,
  })
  const { data: permisos = [], isLoading: cargandoPermisos } = useQuery({
    queryKey: ['permisos'],
    queryFn: listarPermisos,
  })
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios'],
    queryFn: listarUsuarios,
  })

  // Rol elegido: un id, o 'nuevo' cuando se está creando uno.
  const [seleccion, setSeleccion] = useState<number | 'nuevo' | null>(null)
  /** ¿El editor tiene cambios sin guardar? (para avisar antes de cambiar de rol). */
  const sucio = useRef(false)

  // Al cargar (o si el rol elegido desaparece, p. ej. tras eliminarlo), se
  // selecciona el primero. Mientras la lista se refresca no se decide nada:
  // evita pisar la selección de un rol recién creado que todavía no llegó.
  useEffect(() => {
    if (seleccion === 'nuevo' || refrescandoRoles) return
    if (roles.length === 0) return
    if (seleccion === null || !roles.some((r) => r.id === seleccion)) {
      setSeleccion(roles[0].id)
    }
  }, [roles, seleccion, refrescandoRoles])

  async function elegir(nueva: number | 'nuevo') {
    if (nueva === seleccion) return
    if (sucio.current) {
      const ok = await confirm({
        title: '¿Salir sin guardar?',
        description: 'Cambiaste cosas de este rol y no las guardaste. Si seguís, se pierden.',
        confirmLabel: 'Salir sin guardar',
        cancelLabel: 'Quedarme',
        tone: 'danger',
      })
      if (!ok) return
    }
    sucio.current = false
    setSeleccion(nueva)
  }

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['roles'] })
    queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    queryClient.invalidateQueries({ queryKey: ['empleados'] })
    // Por si el cambio toca la propia sesión (permisos del sidebar).
    refrescarUsuario()
  }

  const modulos = useMemo(() => modulosDelCatalogo(permisos), [permisos])
  const rolActual = seleccion === 'nuevo' ? null : roles.find((r) => r.id === seleccion) ?? null
  const cargando = cargandoRoles || cargandoPermisos
  const cuentasConRol = usuarios.filter((u) => u.rol).length

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Accesos"
        title="Roles y permisos"
        subtitle="Un rol es una lista de pantallas. Se lo das a una cuenta y esa cuenta ve solo esas pantallas del menú. Los administradores ven todo, siempre."
        className="ct-rise"
        actions={
          <>
            <GuiaEquipo />
            <Button variant="outline" onClick={() => navigate(desde)}>
              <ArrowLeft className="h-4 w-4" />
              {desde === '/empleados' ? 'Empleados' : 'Usuarios'}
            </Button>
            <Button onClick={() => void elegir('nuevo')} disabled={seleccion === 'nuevo'} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Nuevo rol
            </Button>
          </>
        }
      />

      <ComoFunciona resaltar={3} />

      <div className="mb-5 hidden grid-cols-3 gap-3 sm:grid">
        <StatCard className="ct-stagger-item" style={ctStagger(0)} label="Roles" value={String(roles.length)} icon={ShieldCheck} />
        <StatCard className="ct-stagger-item" style={ctStagger(1)} label="Cuentas con rol" value={String(cuentasConRol)} icon={Users} />
        <StatCard className="ct-stagger-item" style={ctStagger(2)} label="Pantallas" value={String(modulos.filter((m) => m.enMenu).length)} icon={LayoutGrid} />
      </div>

      {cargando ? (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Lista de roles: fichas deslizables en el celular, columna en escritorio. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            <p className="hidden px-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400 lg:block">
              Elegí un rol para verlo
            </p>
            {roles.map((rol) => (
              <RolListItem key={rol.id} rol={rol} activo={seleccion === rol.id} onClick={() => void elegir(rol.id)} />
            ))}
            <button
              type="button"
              onClick={() => void elegir('nuevo')}
              className={cn(
                'flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm font-medium transition-colors lg:w-full',
                seleccion === 'nuevo'
                  ? 'border-ink-900 bg-ink-50 text-ink-900'
                  : 'text-ink-500 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
              )}
            >
              <Plus className="h-4 w-4" />
              Nuevo rol
            </button>
          </div>

          {/* Editor del rol elegido (o formulario de creación). */}
          {seleccion === 'nuevo' ? (
            <RolEditor
              key="nuevo"
              roles={roles}
              modulos={modulos}
              usuarios={usuarios}
              soySuper={soySuper}
              miId={yo?.id}
              onSucio={(v) => (sucio.current = v)}
              onListo={(nuevo) => {
                sucio.current = false
                invalidar()
                if (nuevo) setSeleccion(nuevo.id)
              }}
              onCancelar={() => {
                sucio.current = false
                setSeleccion(roles[0]?.id ?? null)
              }}
            />
          ) : rolActual ? (
            <RolEditor
              key={rolActual.id}
              rol={rolActual}
              roles={roles}
              modulos={modulos}
              usuarios={usuarios}
              soySuper={soySuper}
              miId={yo?.id}
              onSucio={(v) => (sucio.current = v)}
              onListo={() => {
                sucio.current = false
                invalidar()
              }}
            />
          ) : roles.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Sin roles"
              description="Creá el primer rol y elegí qué pantallas abre."
              action={
                <Button onClick={() => void elegir('nuevo')}>
                  <Plus className="h-4 w-4" />
                  Nuevo rol
                </Button>
              }
            />
          ) : (
            // Selección en tránsito (rol recién creado/eliminado): un instante
            // hasta que el efecto de arriba la acomoda.
            <Skeleton className="h-96 w-full rounded-2xl" />
          )}
        </div>
      )}
    </div>
  )
}

// ===== Ítem de la lista de roles =====

function RolListItem({ rol, activo, onClick }: { rol: Rol; activo: boolean; onClick: () => void }) {
  const iconos = rol.es_admin ? [] : modulosDeCodigos(rol.permisos).filter((m) => m.enMenu)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'w-60 shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors lg:w-full',
        activo ? 'border-ink-900 bg-ink-50 shadow-[0_6px_18px_rgba(10,10,11,0.06)]' : 'border-line bg-surface hover:border-ink-300 hover:bg-ink-50/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn('truncate text-sm font-semibold', activo ? 'text-ink-950' : 'text-ink-900')}>{rol.nombre}</span>
        {rol.es_admin && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ink-500" />}
      </span>
      <span className="mt-1 flex items-center gap-2 text-xs text-ink-400">
        <span className="tnum whitespace-nowrap">
          {rol.cantidad_usuarios} cuenta{rol.cantidad_usuarios === 1 ? '' : 's'}
        </span>
        <span aria-hidden>·</span>
        <span className="tnum whitespace-nowrap">
          {rol.es_admin ? 've todo' : `${iconos.length} pantalla${iconos.length === 1 ? '' : 's'}`}
        </span>
      </span>
      {iconos.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1" aria-hidden>
          {iconos.slice(0, 8).map((m) => (
            <span key={m.codigo} title={m.titulo} className="grid h-6 w-6 place-items-center rounded-md bg-ink-100 text-ink-600">
              <m.icono className="h-3.5 w-3.5" strokeWidth={1.9} />
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

// ===== Editor de un rol =====

function RolEditor({
  rol,
  roles,
  modulos,
  usuarios,
  soySuper,
  miId,
  onSucio,
  onListo,
  onCancelar,
}: {
  rol?: Rol
  roles: Rol[]
  modulos: ModuloInfo[]
  usuarios: UsuarioAdmin[]
  soySuper: boolean
  miId?: number
  onSucio: (sucio: boolean) => void
  /** Tras guardar/eliminar. En una creación recibe el rol nuevo, para seleccionarlo. */
  onListo: (nuevo?: Rol) => void
  onCancelar?: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()

  const modoCreacion = !rol
  const esSistema = Boolean(rol?.es_sistema)
  const esAdminRol = Boolean(rol?.es_admin)
  // Un admin común no puede tocar roles de administrador (regla del backend).
  const soloLectura = esAdminRol && !soySuper

  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '')
  const [marcados, setMarcados] = useState<Set<string>>(new Set(rol?.permisos ?? []))
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [verGuardadas, setVerGuardadas] = useState(() => modulos.some((m) => !m.enMenu && (rol?.permisos ?? []).includes(m.codigo)))

  const sucio =
    (modoCreacion && (nombre.trim() !== '' || descripcion.trim() !== '' || marcados.size > 0)) ||
    (!modoCreacion &&
      (nombre.trim() !== (rol?.nombre ?? '') ||
        descripcion.trim() !== (rol?.descripcion ?? '') ||
        [...marcados].sort().join(',') !== [...(rol?.permisos ?? [])].sort().join(',')))

  useEffect(() => {
    onSucio(sucio)
  }, [sucio, onSucio])

  const guardar = useMutation({
    mutationFn: (input: RolInput) => (rol ? actualizarRol(rol.id, input) : crearRol(input)),
    onSuccess: (guardado) => {
      setErrores({})
      setGeneral(null)
      toast.success(
        rol ? 'Rol guardado' : 'Rol creado',
        rol?.cantidad_usuarios
          ? `Les llega a las ${rol.cantidad_usuarios} cuenta${rol.cantidad_usuarios === 1 ? '' : 's'} con este rol.`
          : modoCreacion
            ? 'Ahora dáselo a las cuentas que correspondan (más abajo).'
            : undefined,
      )
      onListo(modoCreacion ? guardado : undefined)
    },
    onError: (e) => {
      const r = leerErrores(e)
      setErrores(r.campos)
      setGeneral(r.general)
    },
  })

  const borrar = useMutation({
    mutationFn: () => eliminarRol(rol!.id),
    onSuccess: () => {
      toast.success('Rol eliminado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo eliminar', mensajeDeError(e)),
  })

  function toggle(codigo: string) {
    setMarcados((prev) => {
      const next = new Set(prev)
      if (next.has(codigo)) next.delete(codigo)
      else next.add(codigo)
      return next
    })
  }

  function handleGuardar() {
    if (!nombre.trim()) {
      setErrores({ nombre: 'El rol necesita un nombre, por ejemplo «Vendedor» o «Cajero».' })
      return
    }
    guardar.mutate({ nombre: nombre.trim(), descripcion: descripcion.trim(), permisos: [...marcados] })
  }

  function descartar() {
    setNombre(rol?.nombre ?? '')
    setDescripcion(rol?.descripcion ?? '')
    setMarcados(new Set(rol?.permisos ?? []))
    setErrores({})
    setGeneral(null)
  }

  async function handleEliminar() {
    const miembros = usuarios.filter((u) => u.rol?.id === rol?.id)
    const ok = await confirm({
      title: `¿Eliminar el rol «${rol?.nombre}»?`,
      description: miembros.length ? (
        <>
          {miembros.length === 1 ? 'Esta cuenta queda' : 'Estas cuentas quedan'} sin rol (no van a ver ninguna pantalla
          del menú) hasta que les des otro: <b>{listaEnPalabras(miembros.map((u) => `@${u.username}`))}</b>.
        </>
      ) : (
        'Nadie tiene este rol, así que no le cambia nada a ninguna cuenta.'
      ),
      confirmLabel: 'Eliminar rol',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  const enMenu = modulos.filter((m) => m.enMenu)
  const guardadas = modulos.filter((m) => !m.enMenu)
  const menuPrevio = menuConPermisos(marcados)
  const soloAdmins = ['Usuarios', 'Auditoría', 'Asistencia']

  return (
    <Card className="p-0">
      <div className="space-y-5 p-4 sm:p-5">
        {/* Nombre y descripción */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {esSistema ? (
              <div>
                <p className="flex items-center gap-1.5 text-lg font-semibold text-ink-950">
                  {nombre}
                  {esAdminRol && <ShieldCheck className="h-4 w-4 text-ink-500" />}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">Rol básico del sistema: no se puede renombrar ni eliminar.</p>
              </div>
            ) : (
              <Etiqueta titulo="Nombre del rol" ayuda="Cómo se llama el puesto. Por ejemplo «Vendedor», «Cajero» o «Técnico»." error={errores.nombre}>
                <Input
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value)
                    setErrores((p) => ({ ...p, nombre: '' }))
                  }}
                  placeholder="Vendedor"
                  className="h-11 text-base font-semibold sm:text-sm"
                  autoFocus={modoCreacion}
                  disabled={soloLectura}
                  aria-invalid={Boolean(errores.nombre)}
                />
              </Etiqueta>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pt-1">
            {esAdminRol && (
              <Badge tone="solid">
                <ShieldCheck className="h-3 w-3" /> Administrador
              </Badge>
            )}
            {esSistema && <Badge tone="soft">Del sistema</Badge>}
          </div>
        </div>

        <Etiqueta
          titulo="¿Para quién es? (opcional)"
          ayuda="Una frase que ayude a elegirlo. Aparece al darle un rol a alguien."
          error={errores.descripcion}
        >
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Para los que atienden el mostrador y cobran"
            className="h-11 text-base sm:text-sm"
            disabled={soloLectura}
          />
        </Etiqueta>

        {soloLectura && (
          <Bloqueado>
            Los roles de administrador abren todo el sistema: solo el superadministrador (la cuenta principal) puede
            cambiarlos.
          </Bloqueado>
        )}

        {/* Pantallas que abre, como se ven en el menú */}
        {esAdminRol ? (
          <Explicacion icono={ShieldCheck} titulo="Abre todo">
            Quien tenga este rol ve <b>todas las pantallas</b> y además maneja el sistema: cargar y sacar gente, dar
            accesos y cambiar roles. No se configura pantalla por pantalla.
          </Explicacion>
        ) : (
          <div>
            <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">¿Qué pantallas abre?</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                  Prendé las que tiene que ver quien tenga este rol. Las apagadas no le aparecen en el menú.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone="outline" className="tnum">
                  {enMenu.filter((m) => marcados.has(m.codigo)).length} de {enMenu.length}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => setMarcados(new Set([...marcados, ...enMenu.map((m) => m.codigo)]))}>
                  Todas
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMarcados(new Set([...marcados].filter((c) => !enMenu.some((m) => m.codigo === c))))}
                >
                  Ninguna
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {enMenu.map((m) => (
                <ModuloToggle key={m.codigo} modulo={m} activo={marcados.has(m.codigo)} onToggle={() => toggle(m.codigo)} />
              ))}
            </div>

            {/* Lo que no depende del rol */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <FilaFija icono={Eye} titulo={`${SIEMPRE_VISIBLES.titulo}: lo ven todos`} texto="No hace falta prenderlo: cualquier cuenta que entra lo ve." />
              <FilaFija
                icono={Ban}
                titulo="Solo administradores"
                texto={`${listaEnPalabras(soloAdmins)} no se abren con ningún rol: son de los administradores.`}
              />
            </div>

            {guardadas.length > 0 && (
              <div className="mt-3 rounded-xl border border-line">
                <button
                  type="button"
                  onClick={() => setVerGuardadas((v) => !v)}
                  aria-expanded={verGuardadas}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-ink-600 hover:text-ink-900"
                >
                  <ChevronDown className={cn('h-4 w-4 transition-transform', verGuardadas && 'rotate-180')} />
                  Pantallas guardadas ({guardadas.length}): hoy no están en el menú
                </button>
                {verGuardadas && (
                  <div className="space-y-2 border-t border-line p-3">
                    <p className="text-xs leading-relaxed text-ink-500">
                      Estas pantallas existen pero se sacaron del menú (lo mismo se maneja desde Inventario). Prenderlas no
                      cambia el menú; solo sirve si alguien entra por un link directo.
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {guardadas.map((m) => (
                        <ModuloToggle key={m.codigo} modulo={m} activo={marcados.has(m.codigo)} onToggle={() => toggle(m.codigo)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Vista previa del menú */}
            <div className="mt-4 rounded-2xl bg-ink-950 p-4 text-on-ink">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-on-ink/60">
                Así le queda el menú a quien tenga este rol
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {menuPrevio.map((item) => (
                  <span key={item.to} className="inline-flex items-center gap-1.5 rounded-lg bg-on-ink/10 px-2.5 py-1.5 text-xs font-medium">
                    <item.icon className="h-3.5 w-3.5" strokeWidth={1.9} />
                    {item.label}
                  </span>
                ))}
              </div>
              {marcados.size === 0 && (
                <p className="mt-2.5 text-xs leading-relaxed text-on-ink/70">
                  Con este rol no se ve ninguna pantalla del menú, solo {SIEMPRE_VISIBLES.titulo}. Prendé al menos una.
                </p>
              )}
            </div>
          </div>
        )}

        {general && <MensajeCampo tono="mal">{general}</MensajeCampo>}

        {/* Cuentas con este rol */}
        {rol && (
          <MiembrosDelRol rol={rol} roles={roles} usuarios={usuarios} soySuper={soySuper} miId={miId} onCambio={() => onListo()} />
        )}

        {modoCreacion && (
          <Explicacion>
            Primero creá el rol. Después, acá mismo, vas a poder dárselo a las cuentas que correspondan.
          </Explicacion>
        )}

        {/* Rastro de auditoría */}
        {rol && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-t border-line pt-3 text-xs text-ink-400">
            <History className="h-3.5 w-3.5" />
            Creado{rol.creado_por ? ` por @${rol.creado_por}` : ''} el {fechaHora(rol.creado)}
            {rol.actualizado_por && (
              <>
                <span aria-hidden>·</span>
                Última edición por @{rol.actualizado_por} el {fechaHora(rol.actualizado)}
              </>
            )}
          </p>
        )}
      </div>

      {/* Acciones: fijas abajo mientras hay cambios, para no tener que buscarlas */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 rounded-b-2xl border-t border-line bg-surface px-4 py-3 sm:px-5',
          // En el celular queda arriba de la barra de navegación de abajo.
          sucio && !soloLectura && 'sticky bottom-[5.75rem] z-10 shadow-[0_-10px_24px_rgba(10,10,11,0.06)] lg:bottom-0',
        )}
      >
        <div>
          {rol && !esSistema && (!esAdminRol || soySuper) && !sucio && (
            <Button variant="ghost" size="sm" onClick={handleEliminar} disabled={borrar.isPending}>
              <Trash2 className="h-4 w-4" />
              Eliminar rol
            </Button>
          )}
          {sucio && !soloLectura && <p className="text-xs font-medium text-ink-500">Tenés cambios sin guardar</p>}
        </div>
        <div className={cn('flex items-center gap-2', sucio && !soloLectura && 'w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none')}>
          {modoCreacion ? (
            <Button variant="outline" onClick={onCancelar}>
              Cancelar
            </Button>
          ) : (
            sucio && !soloLectura && (
              <Button variant="outline" onClick={descartar}>
                Descartar
              </Button>
            )
          )}
          {!soloLectura && (
            <Button onClick={handleGuardar} disabled={!sucio || guardar.isPending}>
              {guardar.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : modoCreacion ? (
                'Crear rol'
              ) : (
                'Guardar cambios'
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

// ===== Una pantalla como tarjeta con interruptor =====

function ModuloToggle({ modulo, activo, onToggle }: { modulo: ModuloInfo; activo: boolean; onToggle: () => void }) {
  const Icono = modulo.icono
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={onToggle}
      className={cn(
        'flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
        activo ? 'border-ink-900 bg-ink-50' : 'border-line hover:border-ink-200 hover:bg-ink-50/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors',
          activo ? 'bg-ink-950 text-on-ink' : 'bg-ink-100 text-ink-500',
        )}
      >
        <Icono className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-semibold', activo ? 'text-ink-950' : 'text-ink-700')}>{modulo.titulo}</span>
        {modulo.que && <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{modulo.que}</span>}
        <span className={cn('mt-1 block text-[0.68rem] font-semibold uppercase tracking-[0.08em]', activo ? 'text-ink-900' : 'text-ink-400')}>
          {activo ? 'La ve' : 'No la ve'}
        </span>
      </span>
      {/* Interruptor decorativo: el botón entero es el control. */}
      <span
        aria-hidden
        className={cn(
          'relative mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
          activo ? 'border-ink-950 bg-ink-950' : 'border-line-strong bg-ink-100',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 rounded-full bg-surface shadow-sm transition-transform',
            activo ? 'translate-x-[1.1rem]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

function FilaFija({ icono: Icono, titulo, texto }: { icono: typeof Eye; titulo: string; texto: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-line-strong px-3 py-2.5">
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.85} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink-700">{titulo}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{texto}</span>
      </span>
    </div>
  )
}

// ===== Cuentas con el rol (asignar / quitar) =====

function MiembrosDelRol({
  rol,
  roles,
  usuarios,
  soySuper,
  miId,
  onCambio,
}: {
  rol: Rol
  roles: Rol[]
  usuarios: UsuarioAdmin[]
  soySuper: boolean
  miId?: number
  onCambio: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()

  const miembros = usuarios.filter((u) => u.rol?.id === rol.id)

  // ¿Puedo cambiarle el rol a esta cuenta? Ni la propia (lo bloquea el backend),
  // ni superusuarios, ni cuentas de nivel admin si no soy superadmin.
  const motivoNo = (u: UsuarioAdmin): string | null => {
    if (u.id === miId) return 'Es tu cuenta: no podés cambiarte el rol.'
    if (u.is_superuser) return 'Es la cuenta principal: no usa rol.'
    if (!soySuper && u.es_administrador) return 'Es de un administrador: solo el superadministrador la cambia.'
    return null
  }

  const candidatos = usuarios.filter((u) => u.rol?.id !== rol.id && !motivoNo(u))

  const asignar = useMutation({
    mutationFn: (usuarioId: number) => actualizarUsuario(usuarioId, { rol: rol.id }),
    onSuccess: (u) => {
      toast.success(`Listo: @${u.username} tiene el rol «${rol.nombre}»`, `Ahora ve ${queVeEnPalabras(rol)}.`)
      onCambio()
    },
    onError: (e) => toast.error('No se pudo dar el rol', mensajeDeError(e)),
  })

  const quitar = useMutation({
    mutationFn: (usuarioId: number) => actualizarUsuario(usuarioId, { rol: null }),
    onSuccess: (u) => {
      toast.success(`@${u.username} quedó sin rol`, 'No ve ninguna pantalla del menú hasta que le des otro.')
      onCambio()
    },
    onError: (e) => toast.error('No se pudo quitar', mensajeDeError(e)),
  })

  async function handleAsignar(valor: string) {
    const u = usuarios.find((x) => String(x.id) === valor)
    if (!u) return
    const anterior = u.rol ? roles.find((r) => r.id === u.rol!.id) : null
    if (anterior || rol.es_admin) {
      const ok = await confirm({
        title: rol.es_admin ? `¿Hacer administrador a @${u.username}?` : `¿Cambiarle el rol a @${u.username}?`,
        description: (
          <>
            {anterior && (
              <>
                Hoy tiene «{anterior.nombre}». Una cuenta tiene un solo rol, así que deja de ver lo de «{anterior.nombre}».{' '}
              </>
            )}
            Con «{rol.nombre}» va a ver {queVeEnPalabras(rol)}.
            {rol.es_admin && ' Un administrador puede cambiar y borrar cosas de todos: dáselo solo a alguien de mucha confianza.'}
          </>
        ),
        confirmLabel: rol.es_admin ? 'Sí, hacerlo administrador' : `Darle «${rol.nombre}»`,
        tone: rol.es_admin ? 'danger' : 'brand',
      })
      if (!ok) return
    }
    asignar.mutate(u.id)
  }

  async function handleQuitar(u: UsuarioAdmin) {
    const ok = await confirm({
      title: `¿Quitarle el rol a @${u.username}?`,
      description: `Va a poder entrar, pero no va a ver ninguna pantalla del menú (solo ${SIEMPRE_VISIBLES.titulo}) hasta que le des otro rol. Si lo que querés es que no entre, pausá su acceso desde su ficha.`,
      confirmLabel: 'Quitar rol',
      tone: 'danger',
    })
    if (ok) quitar.mutate(u.id)
  }

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">¿Quién tiene este rol?</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
            Se lo podés dar a todas las cuentas que haga falta. Cada cuenta tiene un solo rol.
          </p>
        </div>
        <Badge tone="outline" className="tnum">
          {miembros.length} cuenta{miembros.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {miembros.length > 0 ? (
        <ul className="space-y-1.5">
          {miembros.map((u) => {
            const motivo = motivoNo(u)
            return (
              <li key={u.id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-100 text-xs font-bold uppercase text-ink-900">
                  {(u.empleado?.nombre_completo ?? u.username).charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium text-ink-900">
                    <span className="truncate">{u.empleado?.nombre_completo ?? `@${u.username}`}</span>
                    {u.id === miId && <Badge tone="soft">vos</Badge>}
                  </span>
                  <span className="block truncate text-xs text-ink-400">
                    @{u.username}
                    {!u.is_active && ' · acceso pausado'}
                  </span>
                </span>
                {motivo ? (
                  <span title={motivo} className="grid h-8 w-8 shrink-0 place-items-center text-ink-300">
                    <Lock className="h-3.5 w-3.5" aria-label={motivo} />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleQuitar(u)}
                    disabled={quitar.isPending}
                    aria-label={`Quitarle el rol a ${u.username}`}
                    title="Quitarle el rol"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-sm text-ink-400">
          Nadie tiene este rol todavía.
        </p>
      )}

      {candidatos.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <UserPlus className="h-3.5 w-3.5" />
            Darle este rol a otra cuenta
          </p>
          <Select
            placeholder={asignar.isPending ? 'Dándole el rol…' : 'Elegí la cuenta…'}
            searchable
            searchPlaceholder="Buscar por nombre o usuario"
            disabled={asignar.isPending}
            value=""
            onChange={(v) => void handleAsignar(v)}
            options={candidatos.map((u) => ({
              value: String(u.id),
              label: `${u.empleado?.nombre_completo ?? `@${u.username}`} (@${u.username}) — ${u.rol ? `hoy: ${u.rol.nombre}` : 'sin rol'}`,
            }))}
          />
        </div>
      )}
    </div>
  )
}
