import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  CirclePause,
  CirclePlay,
  KeyRound,
  LayoutGrid,
  Loader2,
  PencilLine,
  ShieldCheck,
  ShieldOff,
  Trash2,
  TriangleAlert,
  UserRound,
  UserRoundX,
  X,
} from 'lucide-react'
import type { Rol, Sucursal } from '@/types'
import { actualizarEmpleado, eliminarEmpleado } from '@/services/empleados'
import { actualizarUsuario, eliminarUsuario } from '@/services/usuarios'
import { useAuth } from '@/store/auth'
import { fecha, tiempoRelativo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Presencia } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import { CampoContrasena, CampoEmail, CampoUsuario } from '@/components/equipo/CamposAcceso'
import { DatosParaPasar } from '@/components/equipo/DatosParaPasar'
import { ElegirRol } from '@/components/equipo/ElegirRol'
import { queVeEnPalabras } from '@/components/equipo/modulos'
import { leerErrores, mensajeDeError } from '@/components/equipo/errores'
import type { Integrante } from '@/components/equipo/integrante'
import { estadoAcceso, nombreDe } from '@/components/equipo/integrante'
import { Avatar, Bloqueado, Etiqueta, Explicacion, MensajeCampo, Seccion } from '@/components/equipo/piezas'
import { problemaContrasena, problemaEmail, problemaUsuario, useChequeoDato } from '@/components/equipo/reglas'

/**
 * La ficha de una persona del equipo (o de una cuenta suelta): todo lo que se
 * puede hacer con ella, en tres bloques que responden tres preguntas:
 *
 *  1. ¿Quién es?          → nombre, apellido y sucursal.
 *  2. ¿Puede entrar?      → su acceso: usuario, email, contraseña; pausar o quitar.
 *  3. ¿Qué puede ver?     → su rol, elegido entre tarjetas con sus pantallas.
 *
 * Cada acción dice qué va a pasar ANTES de hacerla, y lo que no se puede hacer
 * aparece con el porqué (en vez de un botón que falla).
 */
export function FichaIntegrante({
  integrante,
  abierto,
  onCerrar,
  roles,
  sucursales,
  onDarAcceso,
}: {
  integrante: Integrante | null
  abierto: boolean
  onCerrar: () => void
  roles: Rol[]
  sucursales: Sucursal[]
  /** Abre el asistente para darle acceso a esta persona (desde Empleados). */
  onDarAcceso?: (empleadoId: number) => void
}) {
  const yo = useAuth((s) => s.usuario)
  const soySuper = Boolean(yo?.is_superuser)

  if (!integrante) return <Modal open={false} onClose={onCerrar}>{null}</Modal>

  const { empleado, cuenta } = integrante
  const nombre = nombreDe(integrante)
  const primerNombre = empleado?.nombre ?? nombre
  const estado = estadoAcceso(integrante)
  const esMia = Boolean(cuenta && yo && cuenta.id === yo.id)
  const esPrincipal = Boolean(cuenta?.is_superuser)
  // Jerarquía (la misma del backend): la cuenta de otro administrador solo la
  // toca el superadministrador.
  const puedoGestionarCuenta = !cuenta || esMia || soySuper || !cuenta.es_administrador
  const motivoAjena = puedoGestionarCuenta
    ? null
    : `${primerNombre} entra como administrador. Solo el superadministrador (la cuenta principal del sistema) puede cambiar su acceso o su rol.`

  return (
    <Modal open={abierto} onClose={onCerrar} size="xl">
      {/* Encabezado: quién es y cómo está su acceso, en palabras */}
      <div className="flex shrink-0 items-start gap-3.5 border-b border-line px-5 pb-4 pt-4">
        <Avatar texto={empleado?.nombre_completo ?? cuenta?.username ?? '?'} enLinea={cuenta?.en_linea} tamano="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
            {empleado ? 'Ficha del empleado' : 'Cuenta sin empleado'}
          </p>
          <h2 className="truncate text-lg font-semibold leading-tight text-ink-950">{nombre}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <EstadoAccesoBadge estado={estado} />
            {cuenta?.es_administrador && (
              <Badge tone="solid">
                <ShieldCheck className="h-3 w-3" />
                {esPrincipal ? 'Superadmin' : 'Administrador'}
              </Badge>
            )}
            {esMia && <Badge tone="outline">Sos vos</Badge>}
            {cuenta && <Presencia enLinea={cuenta.en_linea} ultimaActividad={cuenta.ultima_actividad} />}
          </div>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="-mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto bg-canvas/40 px-4 py-4 sm:px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* key: al cambiar de persona, cada bloque arranca de cero */}
        <BloquePersona key={`p-${integrante.clave}`} integrante={integrante} sucursales={sucursales} />
        <BloqueAcceso
          key={`a-${integrante.clave}-${cuenta?.id ?? 'no'}`}
          integrante={integrante}
          esMia={esMia}
          motivoAjena={motivoAjena}
          onDarAcceso={onDarAcceso}
        />
        {cuenta && (
          <BloqueRol
            key={`r-${integrante.clave}-${cuenta.id}`}
            integrante={integrante}
            roles={roles}
            esMia={esMia}
            motivoAjena={motivoAjena}
          />
        )}
        <BloqueCuidado integrante={integrante} esMia={esMia} soySuper={soySuper} onCerrar={onCerrar} />
      </div>
    </Modal>
  )
}

// ===== Estado del acceso en una palabra =====

export function EstadoAccesoBadge({ estado }: { estado: ReturnType<typeof estadoAcceso> }) {
  if (estado === 'activo') {
    return (
      <Badge tone="soft">
        <KeyRound className="h-3 w-3" /> Puede entrar
      </Badge>
    )
  }
  if (estado === 'pausado') {
    return (
      <Badge tone="outline">
        <CirclePause className="h-3 w-3" /> Acceso pausado
      </Badge>
    )
  }
  return (
    <Badge tone="outline" className="text-ink-500">
      <UserRoundX className="h-3 w-3" /> Sin acceso
    </Badge>
  )
}

// ===== Invalidar lo que muestra el equipo =====

function useRefrescarEquipo() {
  const queryClient = useQueryClient()
  const refrescarUsuario = useAuth((s) => s.refrescarUsuario)
  return (tocaMiCuenta = false) => {
    queryClient.invalidateQueries({ queryKey: ['empleados'] })
    queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    queryClient.invalidateQueries({ queryKey: ['roles'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.removeQueries({ queryKey: ['disponibilidad'] })
    if (tocaMiCuenta) void refrescarUsuario()
  }
}

// ===== 1. La persona =====

function BloquePersona({ integrante, sucursales }: { integrante: Integrante; sucursales: Sucursal[] }) {
  const toast = useToast()
  const refrescar = useRefrescarEquipo()
  const { empleado } = integrante

  const [nombre, setNombre] = useState(empleado?.nombre ?? '')
  const [apellido, setApellido] = useState(empleado?.apellido ?? '')
  const [sucursalId, setSucursalId] = useState<number | null>(empleado?.sucursal?.id ?? null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: () =>
      actualizarEmpleado(empleado!.id, { nombre: nombre.trim(), apellido: apellido.trim(), sucursal: sucursalId }),
    onSuccess: () => {
      setErrores({})
      setGeneral(null)
      refrescar()
      toast.success('Datos guardados', `${nombre.trim()} ya figura así en el equipo.`)
    },
    onError: (e) => {
      const r = leerErrores(e)
      setErrores(r.campos)
      setGeneral(r.general)
    },
  })

  if (!empleado) {
    return (
      <Seccion icono={UserRound} titulo="¿Quién es?" subtitulo="Esta cuenta no es de nadie del equipo.">
        <p className="text-sm leading-relaxed text-ink-600">
          Es una cuenta suelta (por ejemplo, la de un contador o de soporte técnico), así que no aparece en Empleados.
          Todo lo demás funciona igual: tiene su acceso y su rol.
        </p>
      </Seccion>
    )
  }

  const sucursalActual = empleado.sucursal?.id ?? null
  const sucio =
    nombre.trim() !== empleado.nombre || apellido.trim() !== (empleado.apellido ?? '') || sucursalId !== sucursalActual
  const opciones = sucursales.filter((s) => s.activa || s.id === sucursalActual)

  return (
    <Seccion
      icono={UserRound}
      titulo="¿Quién es?"
      subtitulo={`Así aparece en la lista del equipo y en los documentos.${empleado.creado ? ` En el equipo desde el ${fecha(empleado.creado)}.` : ''}`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!nombre.trim()) {
            setErrores({ nombre: 'Falta el nombre de la persona (por ejemplo «Lucas»).' })
            return
          }
          if (sucio) guardar.mutate()
        }}
        noValidate
        className="space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Etiqueta titulo="Nombre" error={errores.nombre}>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              aria-invalid={Boolean(errores.nombre)}
              className="h-11 text-base sm:text-sm"
            />
          </Etiqueta>
          <Etiqueta titulo="Apellido (opcional)" error={errores.apellido}>
            <Input value={apellido} onChange={(e) => setApellido(e.target.value)} className="h-11 text-base sm:text-sm" />
          </Etiqueta>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900">Sucursal</p>
          <p className="mb-2 mt-0.5 text-xs text-ink-500">Se elige sola en los documentos que haga.</p>
          <div className="flex flex-wrap gap-1.5">
            {[...opciones.map((s) => ({ id: s.id as number | null, nombre: s.nombre })), { id: null, nombre: 'Ninguna' }].map((s) => (
              <button
                key={s.id ?? 'ninguna'}
                type="button"
                role="radio"
                aria-checked={sucursalId === s.id}
                onClick={() => setSucursalId(s.id)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                  sucursalId === s.id
                    ? 'border-ink-950 bg-ink-950 text-on-ink'
                    : 'border-line-strong bg-surface text-ink-700 hover:border-ink-300',
                )}
              >
                {s.id !== null && <Building2 className="h-3.5 w-3.5" />}
                {s.nombre}
              </button>
            ))}
          </div>
          {errores.sucursal && <MensajeCampo tono="mal">{errores.sucursal}</MensajeCampo>}
        </div>
        {general && <MensajeCampo tono="mal">{general}</MensajeCampo>}
        {sucio && (
          <div className="ct-rise flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNombre(empleado.nombre)
                setApellido(empleado.apellido ?? '')
                setSucursalId(sucursalActual)
                setErrores({})
                setGeneral(null)
              }}
            >
              Deshacer
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar datos
            </Button>
          </div>
        )}
      </form>
    </Seccion>
  )
}

// ===== 2. El acceso =====

function BloqueAcceso({
  integrante,
  esMia,
  motivoAjena,
  onDarAcceso,
}: {
  integrante: Integrante
  esMia: boolean
  motivoAjena: string | null
  onDarAcceso?: (empleadoId: number) => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const refrescar = useRefrescarEquipo()
  const { empleado, cuenta } = integrante
  const primerNombre = empleado?.nombre ?? (cuenta ? `@${cuenta.username}` : '')

  const [editando, setEditando] = useState<'datos' | 'contrasena' | null>(null)
  const [username, setUsername] = useState(cuenta?.username ?? '')
  const [email, setEmail] = useState(cuenta?.email ?? '')
  const [password, setPassword] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [recienCambiada, setRecienCambiada] = useState<string | null>(null)

  const chequeoUsuario = useChequeoDato('username', username, { excluir: cuenta?.id, original: cuenta?.username })
  const chequeoEmail = useChequeoDato('email', email, { excluir: cuenta?.id, original: cuenta?.email })

  useEffect(() => {
    setUsername(cuenta?.username ?? '')
    setEmail(cuenta?.email ?? '')
  }, [cuenta?.username, cuenta?.email])

  const alFallar = (e: unknown) => {
    const r = leerErrores(e)
    setErrores(r.campos)
    setGeneral(r.general)
  }

  const guardarDatos = useMutation({
    mutationFn: () => actualizarUsuario(cuenta!.id, { username: username.trim(), email: email.trim() }),
    onSuccess: () => {
      setEditando(null)
      setErrores({})
      setGeneral(null)
      refrescar(esMia)
      toast.success('Acceso actualizado', 'Desde ahora entra con los datos nuevos.')
    },
    onError: alFallar,
  })

  const guardarContrasena = useMutation({
    mutationFn: () => actualizarUsuario(cuenta!.id, { password }),
    onSuccess: () => {
      setRecienCambiada(password)
      setPassword('')
      setEditando(null)
      setErrores({})
      setGeneral(null)
      refrescar(esMia)
    },
    onError: alFallar,
  })

  const cambiarEstado = useMutation({
    mutationFn: (activo: boolean) => actualizarUsuario(cuenta!.id, { is_active: activo }),
    onSuccess: (_u, activo) => {
      refrescar()
      toast.success(activo ? 'Acceso reactivado' : 'Acceso pausado', activo ? `${primerNombre} ya puede entrar de nuevo.` : `${primerNombre} no va a poder entrar hasta que lo reactives.`)
    },
    onError: (e) => toast.error('No se pudo cambiar', mensajeDeError(e)),
  })

  const quitarAcceso = useMutation({
    mutationFn: () => actualizarEmpleado(empleado!.id, { acceso: null }),
    onSuccess: () => {
      refrescar()
      toast.success('Acceso quitado', `${primerNombre} sigue en el equipo, pero ya no puede entrar.`)
    },
    onError: (e) => toast.error('No se pudo quitar', mensajeDeError(e)),
  })

  const quitarStaff = useMutation({
    mutationFn: () => actualizarUsuario(cuenta!.id, { is_staff: false }),
    onSuccess: () => {
      refrescar()
      toast.success('Permiso especial quitado', 'Ahora ve solo lo que diga su rol.')
    },
    onError: (e) => toast.error('No se pudo quitar', mensajeDeError(e)),
  })

  // --- Sin acceso -----------------------------------------------------------
  if (!cuenta) {
    return (
      <Seccion icono={KeyRound} titulo="¿Puede entrar al sistema?" subtitulo="Para entrar necesita un acceso: un usuario y una contraseña.">
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-4 py-4 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-600">
            <b className="text-ink-950">Todavía no.</b> {primerNombre} está en el equipo pero no tiene acceso, así que no
            puede entrar.
          </p>
          {empleado && onDarAcceso && (
            <Button onClick={() => onDarAcceso(empleado.id)} className="shrink-0">
              <KeyRound className="h-4 w-4" />
              Darle acceso
            </Button>
          )}
        </div>
      </Seccion>
    )
  }

  // --- Con acceso -----------------------------------------------------------
  const pausado = !cuenta.is_active
  const bloqueoPausa = esMia
    ? 'Es tu propia cuenta: no podés pausarla ni quitártela, porque te quedarías afuera del sistema.'
    : null

  async function pausar() {
    const ok = await confirm({
      title: `¿Pausar el acceso de ${primerNombre}?`,
      description: 'No va a poder entrar hasta que lo reactives. No se borra nada: ni su cuenta, ni sus ventas, ni sus documentos. Ideal para vacaciones o licencias.',
      confirmLabel: 'Pausar acceso',
      cancelLabel: 'No, dejarlo',
      tone: 'warning',
      icon: CirclePause,
    })
    if (ok) cambiarEstado.mutate(false)
  }

  async function quitar() {
    const r = await confirm({
      title: `¿Quitarle el acceso a ${primerNombre}?`,
      description: (
        <>
          Se borran su usuario y su contraseña y ya no va a poder entrar. <b>{primerNombre} sigue en el equipo</b>, y le
          podés volver a dar acceso cuando quieras, incluso con el mismo email. Si es solo por unos días, mejor pausalo.
        </>
      ),
      confirmLabel: 'Quitar acceso',
      cancelLabel: 'Cancelar',
      secundariaLabel: pausado ? undefined : 'Mejor pausarlo',
      tone: 'danger',
      icon: UserRoundX,
    })
    if (r === 'secundaria') cambiarEstado.mutate(false)
    else if (r === true) quitarAcceso.mutate()
  }

  return (
    <Seccion
      icono={KeyRound}
      titulo="¿Puede entrar al sistema?"
      subtitulo="Su acceso: el usuario (o el email) y la contraseña con que entra."
    >
      <div
        className={cn(
          'rounded-xl px-4 py-3 text-sm leading-relaxed ring-1',
          pausado ? 'bg-surface text-ink-600 ring-line-strong' : 'bg-ink-50 text-ink-700 ring-line',
        )}
      >
        {pausado ? (
          <p>
            <b className="text-ink-950">No, está pausado.</b> Su cuenta existe pero no puede entrar hasta que la
            reactives.
          </p>
        ) : (
          <p>
            <b className="text-ink-950">Sí.</b> Entra con <b className="text-ink-950">{cuenta.username}</b> o con{' '}
            <b className="break-all text-ink-950">{cuenta.email}</b>.
          </p>
        )}
        <p className="mt-1 text-xs text-ink-500">
          {cuenta.last_login ? `Entró por última vez ${tiempoRelativo(cuenta.last_login)}.` : 'Todavía no entró nunca.'}
        </p>
      </div>

      {recienCambiada && (
        <div className="ct-rise mt-3 space-y-2.5">
          <p className="text-sm font-semibold text-ink-950">Contraseña nueva guardada. Pasale sus datos:</p>
          <DatosParaPasar
            nombre={empleado?.nombre_completo ?? ''}
            username={cuenta.username}
            email={cuenta.email}
            contrasena={recienCambiada}
          />
          <button
            type="button"
            onClick={() => setRecienCambiada(null)}
            className="text-xs font-medium text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
          >
            Ya se los pasé, ocultar
          </button>
        </div>
      )}

      {motivoAjena ? (
        <Bloqueado className="mt-3">{motivoAjena}</Bloqueado>
      ) : (
        <>
          {/* Acciones: una a la vez, cada una con su explicación */}
          {editando === null && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <AccionFicha icono={PencilLine} titulo="Cambiar usuario o email" onClick={() => setEditando('datos')} />
              <AccionFicha
                icono={KeyRound}
                titulo="Poner otra contraseña"
                subtitulo="Si se la olvidó"
                onClick={() => {
                  setRecienCambiada(null)
                  setEditando('contrasena')
                }}
              />
              {pausado ? (
                <AccionFicha
                  icono={CirclePlay}
                  titulo="Reactivar acceso"
                  subtitulo="Vuelve a poder entrar"
                  onClick={() => cambiarEstado.mutate(true)}
                  cargando={cambiarEstado.isPending}
                />
              ) : (
                <AccionFicha
                  icono={CirclePause}
                  titulo="Pausar acceso"
                  subtitulo="Sin borrar nada"
                  onClick={pausar}
                  deshabilitado={Boolean(bloqueoPausa)}
                  cargando={cambiarEstado.isPending}
                />
              )}
            </div>
          )}

          {editando === 'datos' && (
            <form
              className="ct-rise mt-3 space-y-4 rounded-xl border border-line bg-surface p-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                const nuevos: Record<string, string> = {}
                const pu = problemaUsuario(username) ?? (chequeoUsuario.estado === 'mal' ? chequeoUsuario.mensaje : null)
                const pe = problemaEmail(email) ?? (chequeoEmail.estado === 'mal' ? chequeoEmail.mensaje : null)
                if (pu) nuevos.username = pu
                if (pe) nuevos.email = pe
                setErrores(nuevos)
                if (Object.keys(nuevos).length === 0) guardarDatos.mutate()
              }}
            >
              <CampoUsuario
                valor={username}
                onValor={(v) => {
                  setUsername(v)
                  setErrores((p) => ({ ...p, username: '' }))
                }}
                chequeo={chequeoUsuario}
                error={errores.username || null}
                autoFocus
              />
              <CampoEmail
                valor={email}
                onValor={(v) => {
                  setEmail(v)
                  setErrores((p) => ({ ...p, email: '' }))
                }}
                chequeo={chequeoEmail}
                error={errores.email || null}
              />
              {general && <MensajeCampo tono="mal">{general}</MensajeCampo>}
              <BotonesEdicion
                guardando={guardarDatos.isPending}
                textoGuardar="Guardar"
                onCancelar={() => {
                  setEditando(null)
                  setUsername(cuenta.username)
                  setEmail(cuenta.email)
                  setErrores({})
                  setGeneral(null)
                }}
              />
            </form>
          )}

          {editando === 'contrasena' && (
            <form
              className="ct-rise mt-3 space-y-4 rounded-xl border border-line bg-surface p-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                const pc = problemaContrasena(password)
                if (pc) {
                  setErrores({ password: pc })
                  return
                }
                guardarContrasena.mutate()
              }}
            >
              <CampoContrasena
                valor={password}
                onValor={(v) => {
                  setPassword(v)
                  setErrores({})
                }}
                titulo="Contraseña nueva"
                ayuda="La de antes deja de andar. Después se la pasás (aparecen sus datos para copiar o mandar por WhatsApp)."
                error={errores.password || null}
              />
              {general && <MensajeCampo tono="mal">{general}</MensajeCampo>}
              <BotonesEdicion
                guardando={guardarContrasena.isPending}
                textoGuardar="Guardar contraseña"
                onCancelar={() => {
                  setEditando(null)
                  setPassword('')
                  setErrores({})
                  setGeneral(null)
                }}
              />
            </form>
          )}

          {bloqueoPausa && editando === null && <Bloqueado className="mt-3">{bloqueoPausa}</Bloqueado>}

          {cuenta.is_staff && !cuenta.is_superuser && (
            <Explicacion className="mt-3" icono={ShieldCheck} titulo="Tiene el permiso especial de administrador">
              Por eso ve todo, diga lo que diga su rol. Es un permiso viejo («staff»); si querés que vea solo lo de su
              rol, quitáselo.
              {!esMia && (
                <span className="mt-2 block">
                  <Button size="sm" variant="outline" onClick={() => quitarStaff.mutate()} disabled={quitarStaff.isPending}>
                    <ShieldOff className="h-4 w-4" />
                    Quitar el permiso especial
                  </Button>
                </span>
              )}
            </Explicacion>
          )}

          {empleado && !esMia && editando === null && (
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={quitar} disabled={quitarAcceso.isPending}>
                {quitarAcceso.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundX className="h-4 w-4" />}
                Quitarle el acceso
              </Button>
            </div>
          )}
        </>
      )}
    </Seccion>
  )
}

// ===== 3. Qué puede ver =====

function BloqueRol({
  integrante,
  roles,
  esMia,
  motivoAjena,
}: {
  integrante: Integrante
  roles: Rol[]
  esMia: boolean
  motivoAjena: string | null
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const refrescar = useRefrescarEquipo()
  const cuenta = integrante.cuenta!
  const primerNombre = integrante.empleado?.nombre ?? `@${cuenta.username}`
  const actual = cuenta.rol ? String(cuenta.rol.id) : ''
  const [rolId, setRolId] = useState(actual)
  const [error, setError] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: () => actualizarUsuario(cuenta.id, { rol: rolId ? Number(rolId) : null }),
    onSuccess: () => {
      setError(null)
      refrescar()
      const rol = roles.find((r) => String(r.id) === rolId)
      toast.success('Rol cambiado', `${primerNombre} ahora ve ${queVeEnPalabras(rol)}.`)
    },
    onError: (e) => setError(mensajeDeError(e)),
  })

  if (cuenta.is_superuser) {
    return (
      <Seccion icono={LayoutGrid} titulo="¿Qué puede ver?">
        <p className="text-sm leading-relaxed text-ink-600">
          Es la cuenta principal del sistema (superadministrador): ve y maneja <b className="text-ink-950">todo</b>,
          siempre. No usa rol.
        </p>
      </Seccion>
    )
  }

  const bloqueo = esMia
    ? 'No podés cambiarte tu propio rol: podrías quedarte sin acceso por error. Pedíselo a otro administrador.'
    : motivoAjena
  const cambio = rolId !== actual
  const rolActual = cuenta.rol ? roles.find((r) => r.id === cuenta.rol!.id) ?? null : null
  // Con el permiso especial «staff» ve todo, diga lo que diga el rol.
  const hoyVe = cuenta.es_administrador ? queVeEnPalabras({ es_admin: true, permisos: [] }) : queVeEnPalabras(rolActual)

  async function guardarRol() {
    const nuevo = roles.find((r) => String(r.id) === rolId)
    if (nuevo?.es_admin) {
      const ok = await confirm({
        title: `¿Hacer administrador a ${primerNombre}?`,
        description: 'Va a poder ver TODO y además cambiar y borrar cosas de todos: cargar gente, dar accesos y cambiar roles. Dáselo solo a alguien de mucha confianza.',
        confirmLabel: 'Sí, hacerlo administrador',
        tone: 'danger',
        icon: ShieldCheck,
      })
      if (!ok) return
    }
    guardar.mutate()
  }

  return (
    <Seccion
      icono={LayoutGrid}
      titulo="¿Qué puede ver?"
      subtitulo={`Lo decide su rol. Hoy ${primerNombre} ve ${hoyVe}.`}
    >
      <ElegirRol roles={roles} valor={rolId} onValor={setRolId} nombrePersona={primerNombre} bloqueo={bloqueo} error={error} />
      {cambio && !bloqueo && (
        <div className="ct-rise mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setRolId(actual)}>
            Deshacer
          </Button>
          <Button onClick={guardarRol} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar rol
          </Button>
        </div>
      )}
    </Seccion>
  )
}

// ===== 4. Zona de cuidado =====

function BloqueCuidado({
  integrante,
  esMia,
  soySuper,
  onCerrar,
}: {
  integrante: Integrante
  esMia: boolean
  soySuper: boolean
  onCerrar: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const refrescar = useRefrescarEquipo()
  const { empleado, cuenta } = integrante
  const nombre = nombreDe(integrante)

  const borrar = useMutation({
    mutationFn: () => (empleado ? eliminarEmpleado(empleado.id) : eliminarUsuario(cuenta!.id)),
    onSuccess: () => {
      onCerrar()
      refrescar()
      toast.success(empleado ? 'Sacado del equipo' : 'Cuenta eliminada', `${nombre} ya no está.`)
    },
    onError: (e) => toast.error('No se pudo', mensajeDeError(e)),
  })

  const motivo = esMia
    ? empleado
      ? 'Sos vos: no podés sacarte del equipo, porque se borraría tu cuenta y te quedarías afuera.'
      : 'Es tu propia cuenta: no podés eliminarla.'
    : cuenta?.is_superuser
      ? 'Es la cuenta principal del sistema: no se puede eliminar.'
      : cuenta?.es_administrador && !soySuper
        ? 'Entra como administrador: solo el superadministrador puede sacarlo.'
        : null

  async function confirmar() {
    const ok = await confirm({
      title: empleado ? `¿Sacar a ${nombre} del equipo?` : `¿Eliminar la cuenta ${nombre}?`,
      description: empleado ? (
        <>
          Deja de aparecer en Empleados{cuenta ? ' y se borra su acceso (no va a poder entrar)' : ''}. Lo que hizo
          (ventas, documentos, cierres de caja) queda guardado.
          {cuenta && ' Si solo querés que no entre por un tiempo, mejor pausá su acceso.'}
        </>
      ) : (
        'Ya no va a poder entrar. Lo que hizo con esta cuenta queda guardado. Si es por un tiempo, mejor pausala.'
      ),
      confirmLabel: empleado ? 'Sacar del equipo' : 'Eliminar cuenta',
      tone: 'danger',
      icon: TriangleAlert,
    })
    if (ok) borrar.mutate()
  }

  return (
    <section className="rounded-2xl border border-dashed border-line-strong p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">
            {empleado ? 'Sacar del equipo' : 'Eliminar esta cuenta'}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
            {empleado
              ? `Borra a ${empleado.nombre} de la lista${cuenta ? ' y también su acceso' : ''}. Lo que hizo queda guardado.`
              : 'Borra la cuenta: ya no va a poder entrar. Lo que hizo queda guardado.'}
          </p>
        </div>
        {motivo ? null : (
          <Button variant="outline" onClick={confirmar} disabled={borrar.isPending} className="shrink-0">
            {borrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {empleado ? 'Sacar del equipo' : 'Eliminar cuenta'}
          </Button>
        )}
      </div>
      {motivo && <Bloqueado className="mt-3">{motivo}</Bloqueado>}
    </section>
  )
}

// ===== Piezas chicas =====

function AccionFicha({
  icono: Icono,
  titulo,
  subtitulo,
  onClick,
  deshabilitado,
  cargando,
}: {
  icono: typeof KeyRound
  titulo: string
  subtitulo?: string
  onClick: () => void
  deshabilitado?: boolean
  cargando?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado || cargando}
      className={cn(
        'flex min-h-12 items-center gap-2.5 rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-left transition-colors',
        'hover:border-ink-300 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
        'disabled:cursor-not-allowed disabled:opacity-45',
      )}
    >
      {cargando ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-500" />
      ) : (
        <Icono className="h-4 w-4 shrink-0 text-ink-600" strokeWidth={1.85} />
      )}
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight text-ink-900">{titulo}</span>
        {subtitulo && <span className="mt-0.5 block text-[0.7rem] text-ink-400">{subtitulo}</span>}
      </span>
    </button>
  )
}

function BotonesEdicion({
  guardando,
  textoGuardar,
  onCancelar,
}: {
  guardando: boolean
  textoGuardar: string
  onCancelar: () => void
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancelar}>
        Cancelar
      </Button>
      <Button type="submit" disabled={guardando}>
        {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
        {textoGuardar}
      </Button>
    </div>
  )
}
