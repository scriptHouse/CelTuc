import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CircleCheckBig,
  KeyRound,
  Loader2,
  Search,
  UserPlus,
  UserRound,
  UserRoundX,
  Users,
  X,
  Briefcase,
} from 'lucide-react'
import type { Empleado, Rol, Sucursal } from '@/types'
import { crearEmpleado, actualizarEmpleado } from '@/services/empleados'
import type { AccesoInput } from '@/services/empleados'
import { consultarDisponibilidad, crearUsuario } from '@/services/usuarios'
import { cn, normalizarBusqueda } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useConfirm } from '@/components/ConfirmProvider'
import { CampoContrasena, CampoEmail, CampoUsuario } from '@/components/equipo/CamposAcceso'
import { DatosParaPasar } from '@/components/equipo/DatosParaPasar'
import { ElegirRol, PantallasDelRol } from '@/components/equipo/ElegirRol'
import { queVeEnPalabras } from '@/components/equipo/modulos'
import { leerErrores } from '@/components/equipo/errores'
import { Avatar, Etiqueta, Explicacion, MensajeCampo, OpcionGrande } from '@/components/equipo/piezas'
import { problemaContrasena, problemaEmail, problemaUsuario, useChequeoDato } from '@/components/equipo/reglas'

/**
 * Sumar a alguien al sistema, paso a paso y con una sola pregunta por pantalla
 * (el mismo espíritu que el cierre de caja). Es la ÚNICA puerta para dar un
 * acceso, se entre por donde se entre:
 *
 *  - Empleados → «Nuevo empleado»: quién es → ¿usa el sistema? → acceso → qué ve.
 *  - Usuarios → «Nueva cuenta»: ¿para quién? (alguien del equipo, una persona
 *    nueva o una cuenta suelta) → acceso → qué ve.
 *  - La ficha de alguien sin acceso → «Darle acceso»: acceso → qué ve.
 *
 * Siempre termina en un resumen en palabras y, al guardar, en los datos para
 * pasarle a la persona. La persona y su acceso se guardan en UN pedido: si algo
 * falla no queda nada a medias, y el error aparece al lado del campo a corregir.
 */

export type ModoAlta = { tipo: 'empleado' } | { tipo: 'cuenta' } | { tipo: 'acceso'; empleado: Empleado }

type Paso = 'para_quien' | 'persona' | 'usa_sistema' | 'acceso' | 'rol' | 'revisar'
type Destino = 'existente' | 'nueva' | 'suelta'

const TITULO_PASO: Record<Paso, string> = {
  para_quien: '¿Para quién es?',
  persona: '¿Quién es?',
  usa_sistema: '¿Va a usar el sistema?',
  acceso: 'Su acceso',
  rol: '¿Qué puede ver?',
  revisar: 'Revisá y guardá',
}

/** En qué paso se corrige cada campo que puede devolver el backend. */
const CAMPOS_DEL_PASO: [Paso, string[]][] = [
  ['persona', ['nombre', 'apellido', 'sucursal']],
  ['acceso', ['username', 'email', 'password']],
  ['rol', ['rol']],
]

function pasosDe(modo: ModoAlta, destino: Destino | null, usaSistema: boolean | null): Paso[] {
  if (modo.tipo === 'acceso') return ['acceso', 'rol', 'revisar']
  if (modo.tipo === 'empleado') {
    return usaSistema === false ? ['persona', 'usa_sistema', 'revisar'] : ['persona', 'usa_sistema', 'acceso', 'rol', 'revisar']
  }
  if (destino === 'nueva') return ['para_quien', 'persona', 'acceso', 'rol', 'revisar']
  return ['para_quien', 'acceso', 'rol', 'revisar']
}

interface Resultado {
  nombre: string
  /** null = se cargó solo la persona, sin acceso. */
  acceso: { username: string; email: string; contrasena: string } | null
}

export function AltaWizard({
  abierto,
  modo,
  empleados,
  roles,
  sucursales,
  onCerrar,
}: {
  abierto: boolean
  modo: ModoAlta
  /** El equipo: para elegir a alguien sin acceso y avisar si un nombre ya está cargado. */
  empleados: Empleado[]
  roles: Rol[]
  sucursales: Sucursal[]
  onCerrar: () => void
}) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const [paso, setPaso] = useState<Paso>('persona')
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [destino, setDestino] = useState<Destino | null>(null)
  const [empleadoId, setEmpleadoId] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [sucursalId, setSucursalId] = useState<number | null>(null)
  const [usaSistema, setUsaSistema] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rolId, setRolId] = useState('')
  const [propuestas, setPropuestas] = useState<string[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const contenidoRef = useRef<HTMLDivElement>(null)
  /** Si ya eligió un rol a mano, no se le vuelve a proponer el de siempre. */
  const rolTocado = useRef(false)

  // Rol que se propone: el «Empleado» del sistema (el mismo default que el backend).
  const rolPorDefecto = useMemo(
    () => roles.find((r) => r.es_sistema && !r.es_admin) ?? roles.find((r) => !r.es_admin) ?? null,
    [roles],
  )

  const pasos = pasosDe(modo, destino, usaSistema)
  const indice = Math.max(0, pasos.indexOf(paso))

  const sinAcceso = useMemo(() => empleados.filter((e) => !e.usuario), [empleados])
  const empleadoElegido =
    modo.tipo === 'acceso' ? modo.empleado : destino === 'existente' ? sinAcceso.find((e) => e.id === empleadoId) ?? null : null

  /** El nombre de la persona para las frases («Lucas va a poder entrar…»). */
  const nombrePersona =
    empleadoElegido?.nombre_completo ??
    (modo.tipo === 'cuenta' && destino === 'suelta' ? '' : `${nombre} ${apellido}`.trim())
  const primerNombre = nombrePersona.split(/\s+/)[0] || (destino === 'suelta' ? 'La cuenta' : 'Esta persona')

  const chequeoUsuario = useChequeoDato('username', username)
  const chequeoEmail = useChequeoDato('email', email)

  // Al abrir, todo de cero.
  useEffect(() => {
    if (!abierto) return
    setPaso(modo.tipo === 'acceso' ? 'acceso' : modo.tipo === 'cuenta' ? 'para_quien' : 'persona')
    setDir('fwd')
    setDestino(null)
    setEmpleadoId(null)
    setNombre('')
    setApellido('')
    setSucursalId(null)
    setUsaSistema(null)
    setUsername('')
    setEmail('')
    setPassword('')
    rolTocado.current = false
    setRolId(rolPorDefecto ? String(rolPorDefecto.id) : '')
    setPropuestas([])
    setBusqueda('')
    setErrores({})
    setErrorGeneral(null)
    setGuardando(false)
    setResultado(null)
    // `modo` cambia de identidad en cada render del padre: alcanza con su tipo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, modo.tipo])

  // El rol propuesto, por si los roles llegan después de abrir.
  const idPorDefecto = rolPorDefecto?.id
  useEffect(() => {
    if (abierto && !rolTocado.current && idPorDefecto) setRolId(String(idPorDefecto))
  }, [abierto, idPorDefecto])

  // Al llegar al acceso: se propone un usuario armado con el nombre (lgomez, lucas.gomez…).
  useEffect(() => {
    if (!abierto || paso !== 'acceso') return
    const base = empleadoElegido ?? { nombre, apellido }
    if (!base.nombre.trim()) return
    let vigente = true
    consultarDisponibilidad({ nombre: base.nombre, apellido: base.apellido })
      .then((r) => {
        if (!vigente) return
        const lista = r.sugerencias ?? []
        setPropuestas(lista)
        setUsername((actual) => actual || lista[0] || '')
      })
      .catch(() => {
        /* sin sugerencias igual se puede escribir uno */
      })
    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, paso])

  // Cada paso arranca arriba (en el celular, el contenido largo quedaba scrolleado).
  useEffect(() => {
    contenidoRef.current?.scrollTo({ top: 0 })
  }, [paso, resultado])

  const hayDatos = Boolean(nombre || apellido || username || email || password || destino)

  async function cerrar() {
    if (hayDatos && !resultado && !guardando) {
      const ok = await confirm({
        title: '¿Salir sin guardar?',
        description: 'Se pierde lo que cargaste hasta ahora. No se guardó nada todavía.',
        confirmLabel: 'Salir sin guardar',
        cancelLabel: 'Seguir cargando',
        tone: 'danger',
      })
      if (!ok) return
    }
    onCerrar()
  }

  function limpiarError(campo: string) {
    setErrores((prev) => {
      if (!prev[campo]) return prev
      const next = { ...prev }
      delete next[campo]
      return next
    })
  }

  function irA(destinoPaso: Paso, sentido: 'fwd' | 'back') {
    setDir(sentido)
    setPaso(destinoPaso)
  }

  /** ¿Se puede pasar al siguiente paso? Si no, deja los errores a la vista. */
  function validarPaso(): boolean {
    const nuevos: Record<string, string> = {}
    if (paso === 'para_quien') {
      if (!destino) nuevos.destino = 'Elegí una de las tres opciones para seguir.'
      else if (destino === 'existente' && !empleadoId) nuevos.destino = 'Tocá a la persona del equipo a la que le vas a dar acceso.'
    }
    if (paso === 'persona' && !nombre.trim()) nuevos.nombre = 'Falta el nombre de la persona (por ejemplo «Lucas»).'
    if (paso === 'usa_sistema' && usaSistema === null) nuevos.usa_sistema = 'Elegí «Sí» o «No» para seguir.'
    if (paso === 'acceso') {
      const pu = problemaUsuario(username)
      const pe = problemaEmail(email)
      const pc = problemaContrasena(password)
      if (pu) nuevos.username = pu
      else if (chequeoUsuario.estado === 'mal') nuevos.username = chequeoUsuario.mensaje
      if (pe) nuevos.email = pe
      else if (chequeoEmail.estado === 'mal') nuevos.email = chequeoEmail.mensaje
      if (pc) nuevos.password = pc
    }
    setErrores((prev) => ({ ...prev, ...nuevos }))
    return Object.keys(nuevos).length === 0
  }

  function siguiente(e?: FormEvent) {
    e?.preventDefault()
    if (paso === 'revisar') {
      void guardar()
      return
    }
    if (!validarPaso()) return
    const proximo = pasosDe(modo, destino, usaSistema)[indice + 1]
    if (proximo) irA(proximo, 'fwd')
  }

  function atras() {
    const previo = pasos[indice - 1]
    if (previo) irA(previo, 'back')
  }

  async function guardar() {
    setGuardando(true)
    setErrorGeneral(null)
    const rol = rolId ? Number(rolId) : null
    const acceso: AccesoInput = { username: username.trim(), email: email.trim(), password, rol_id: rol }
    const persona = { nombre: nombre.trim(), apellido: apellido.trim(), sucursal: sucursalId }
    const conAcceso = !(modo.tipo === 'empleado' && usaSistema === false)
    try {
      if (modo.tipo === 'acceso') {
        await actualizarEmpleado(modo.empleado.id, { acceso })
      } else if (modo.tipo === 'empleado') {
        await crearEmpleado({ ...persona, ...(conAcceso ? { acceso } : {}) })
      } else if (destino === 'nueva') {
        await crearEmpleado({ ...persona, acceso })
      } else if (destino === 'existente' && empleadoId) {
        await actualizarEmpleado(empleadoId, { acceso })
      } else {
        await crearUsuario({ username: acceso.username, email: acceso.email, password, is_staff: false, rol })
      }
      queryClient.invalidateQueries({ queryKey: ['empleados'] })
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.removeQueries({ queryKey: ['disponibilidad'] })
      setResultado({
        nombre: nombrePersona || acceso.username,
        acceso: conAcceso ? { username: acceso.username, email: acceso.email, contrasena: password } : null,
      })
    } catch (err) {
      const { campos, general } = leerErrores(err)
      setErrores(campos)
      setErrorGeneral(general)
      // Se vuelve al paso donde está lo que hay que corregir.
      const conError = CAMPOS_DEL_PASO.find(([p, cs]) => pasos.includes(p) && cs.some((c) => campos[c]))
      if (conError) irA(conError[0], 'back')
    } finally {
      setGuardando(false)
    }
  }

  // --- Textos del encabezado -----------------------------------------------

  const titulo =
    modo.tipo === 'acceso'
      ? `Darle acceso a ${modo.empleado.nombre}`
      : modo.tipo === 'empleado'
        ? 'Nuevo empleado'
        : 'Nueva cuenta para entrar'

  const rolElegido = roles.find((r) => String(r.id) === rolId) ?? null

  // --- Pasos -----------------------------------------------------------------

  let contenido: ReactNode = null

  if (resultado) {
    contenido = (
      <div className="space-y-5">
        <div className="flex flex-col items-center pt-2 text-center">
          <span className="ct-slot-pop grid h-16 w-16 place-items-center rounded-3xl bg-ink-950 text-on-ink shadow-[0_14px_34px_rgba(10,10,11,0.25)]">
            <CircleCheckBig className="h-8 w-8" strokeWidth={1.75} />
          </span>
          <h3 className="mt-4 text-xl font-bold tracking-tight text-ink-950">
            {resultado.acceso
              ? `¡Listo! ${destino === 'suelta' ? `La cuenta @${resultado.acceso.username}` : primerNombre} ya puede entrar`
              : `¡Listo! ${primerNombre} ya está en el equipo`}
          </h3>
          <p className="mt-1.5 max-w-sm text-pretty text-sm leading-relaxed text-ink-500">
            {resultado.acceso
              ? 'Pasale estos datos. Puede entrar con el usuario o con el email, los dos sirven.'
              : 'Todavía no puede entrar al sistema. Cuando quieras, abrí su ficha y tocá «Darle acceso».'}
          </p>
        </div>
        {resultado.acceso && (
          <>
            <DatosParaPasar
              nombre={resultado.nombre}
              username={resultado.acceso.username}
              email={resultado.acceso.email}
              contrasena={resultado.acceso.contrasena}
            />
            <Explicacion titulo="La contraseña no se vuelve a mostrar">
              Por seguridad, después no se puede ver. Si se la olvida, abrí su ficha y poné una nueva: no hace falta
              borrar nada.
            </Explicacion>
          </>
        )}
      </div>
    )
  } else if (paso === 'para_quien') {
    const filtrados = busqueda
      ? sinAcceso.filter((e) => normalizarBusqueda(e.nombre_completo).includes(normalizarBusqueda(busqueda)))
      : sinAcceso
    contenido = (
      <div className="space-y-3">
        <Pregunta texto="¿Para quién es esta cuenta?" ayuda="Una cuenta es la llave para entrar al sistema: un usuario y una contraseña." />
        <div role="radiogroup" className="space-y-2.5">
          <OpcionGrande
            activo={destino === 'existente'}
            onClick={() => {
              setDestino('existente')
              limpiarError('destino')
            }}
            deshabilitado={sinAcceso.length === 0}
            icono={Users}
            titulo="Para alguien que ya está en el equipo"
            descripcion={
              sinAcceso.length === 0
                ? 'Todos los del equipo ya tienen acceso.'
                : `Está cargado en Empleados pero todavía no puede entrar (${sinAcceso.length} persona${sinAcceso.length === 1 ? '' : 's'}).`
            }
          />
          {destino === 'existente' && sinAcceso.length > 0 && (
            <div className="ct-rise space-y-2 rounded-2xl border border-line bg-canvas/40 p-3">
              {sinAcceso.length > 6 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por nombre"
                    className="pl-10 text-base sm:text-sm"
                  />
                </div>
              )}
              <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {filtrados.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    role="radio"
                    aria-checked={empleadoId === e.id}
                    onClick={() => {
                      setEmpleadoId(e.id)
                      limpiarError('destino')
                    }}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                      empleadoId === e.id
                        ? 'border-ink-950 bg-ink-950 text-on-ink'
                        : 'border-line bg-surface text-ink-900 hover:border-ink-300',
                    )}
                  >
                    <Avatar texto={e.nombre_completo} className="h-8 w-8 rounded-xl text-xs" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{e.nombre_completo}</span>
                      <span className={cn('block truncate text-xs', empleadoId === e.id ? 'text-on-ink/70' : 'text-ink-400')}>
                        {e.sucursal?.nombre ?? 'Sin sucursal'}
                      </span>
                    </span>
                  </button>
                ))}
                {filtrados.length === 0 && <p className="px-1 py-2 text-xs text-ink-400">Nadie coincide con «{busqueda}».</p>}
              </div>
            </div>
          )}
          <OpcionGrande
            activo={destino === 'nueva'}
            onClick={() => {
              setDestino('nueva')
              setEmpleadoId(null)
              limpiarError('destino')
            }}
            icono={UserPlus}
            titulo="Para una persona nueva"
            descripcion="La cargamos al equipo (Empleados) y le damos acceso, todo junto."
          />
          <OpcionGrande
            activo={destino === 'suelta'}
            onClick={() => {
              setDestino('suelta')
              setEmpleadoId(null)
              limpiarError('destino')
            }}
            icono={Briefcase}
            titulo="Una cuenta que no es de nadie del equipo"
            descripcion="Por ejemplo, para el contador o para soporte técnico. No aparece en Empleados."
          />
        </div>
        {errores.destino && <MensajeCampo tono="mal">{errores.destino}</MensajeCampo>}
      </div>
    )
  } else if (paso === 'persona') {
    const completo = normalizarBusqueda(`${nombre} ${apellido}`.trim())
    const repetido = completo ? empleados.find((e) => normalizarBusqueda(e.nombre_completo) === completo) : undefined
    contenido = (
      <div className="space-y-5">
        <Pregunta texto="¿Quién es?" ayuda="Así va a aparecer en la lista del equipo y en los documentos." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Etiqueta titulo="Nombre" error={errores.nombre}>
            <Input
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value)
                limpiarError('nombre')
              }}
              placeholder="Lucas"
              autoFocus
              autoComplete="off"
              aria-invalid={Boolean(errores.nombre)}
              className="h-12 text-base sm:text-sm"
            />
          </Etiqueta>
          <Etiqueta titulo="Apellido (opcional)" error={errores.apellido}>
            <Input
              value={apellido}
              onChange={(e) => {
                setApellido(e.target.value)
                limpiarError('apellido')
              }}
              placeholder="Gómez"
              autoComplete="off"
              className="h-12 text-base sm:text-sm"
            />
          </Etiqueta>
        </div>
        {repetido && (
          <Explicacion titulo={`Ya hay alguien que se llama ${repetido.nombre_completo}`}>
            Si es la misma persona, no la cargues de nuevo: cerrá esto y abrí su ficha. Si son dos personas distintas con
            el mismo nombre, seguí nomás.
          </Explicacion>
        )}
        <div>
          <p className="text-sm font-semibold text-ink-900">¿En qué sucursal trabaja?</p>
          <p className="mb-2 mt-0.5 text-xs text-ink-500">Se elige sola en los documentos que haga. Si trabaja en varias, dejala en «Ninguna por ahora».</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {sucursales
              .filter((s) => s.activa)
              .map((s) => (
                <OpcionGrande
                  key={s.id}
                  activo={sucursalId === s.id}
                  onClick={() => setSucursalId(s.id)}
                  icono={Building2}
                  titulo={s.nombre}
                  descripcion={s.codigo_postal ? `CP ${s.codigo_postal}` : undefined}
                  className="py-3"
                />
              ))}
            <OpcionGrande activo={sucursalId === null} onClick={() => setSucursalId(null)} titulo="Ninguna por ahora" className="py-3" />
          </div>
          {errores.sucursal && <MensajeCampo tono="mal">{errores.sucursal}</MensajeCampo>}
        </div>
      </div>
    )
  } else if (paso === 'usa_sistema') {
    contenido = (
      <div className="space-y-3">
        <Pregunta
          texto={`¿${primerNombre} va a usar el sistema?`}
          ayuda="Para entrar necesita un acceso: un usuario y una contraseña. Si no lo va a usar (por ejemplo, alguien de depósito), no hace falta."
        />
        <div role="radiogroup" className="space-y-2.5">
          <OpcionGrande
            activo={usaSistema === true}
            onClick={() => {
              setUsaSistema(true)
              limpiarError('usa_sistema')
            }}
            icono={KeyRound}
            titulo="Sí, le doy acceso"
            descripcion="En el paso que sigue elegís su usuario y contraseña, y después qué pantallas puede ver."
          />
          <OpcionGrande
            activo={usaSistema === false}
            onClick={() => {
              setUsaSistema(false)
              limpiarError('usa_sistema')
            }}
            icono={UserRoundX}
            titulo="No, solo lo anoto en el equipo"
            descripcion="Queda en la lista de Empleados sin poder entrar. Le podés dar acceso más adelante desde su ficha."
          />
        </div>
        {errores.usa_sistema && <MensajeCampo tono="mal">{errores.usa_sistema}</MensajeCampo>}
      </div>
    )
  } else if (paso === 'acceso') {
    contenido = (
      <div className="space-y-5">
        <Pregunta
          texto={destino === 'suelta' ? 'Los datos para entrar' : `Los datos para que ${primerNombre} entre`}
          ayuda="Es como una llave: con el usuario (o el email) y la contraseña se entra al sistema."
        />
        <CampoUsuario
          valor={username}
          onValor={(v) => {
            setUsername(v)
            limpiarError('username')
          }}
          chequeo={chequeoUsuario}
          propuestas={propuestas}
          error={errores.username}
          autoFocus={!username}
        />
        <CampoEmail
          valor={email}
          onValor={(v) => {
            setEmail(v)
            limpiarError('email')
          }}
          chequeo={chequeoEmail}
          error={errores.email}
        />
        <CampoContrasena
          valor={password}
          onValor={(v) => {
            setPassword(v)
            limpiarError('password')
          }}
          error={errores.password}
        />
      </div>
    )
  } else if (paso === 'rol') {
    contenido = (
      <div className="space-y-4">
        <Pregunta
          texto={destino === 'suelta' ? '¿Qué puede ver esta cuenta?' : `¿Qué puede ver ${primerNombre}?`}
          ayuda="Cada rol es una lista de pantallas del menú. Tocá el que corresponda: abajo de cada uno ves qué abre."
        />
        <ElegirRol
          roles={roles}
          valor={rolId}
          onValor={(v) => {
            rolTocado.current = true
            setRolId(v)
            limpiarError('rol')
          }}
          nombrePersona={destino === 'suelta' ? 'Esta cuenta' : primerNombre}
          error={errores.rol}
          mostrarLinkRoles={false}
        />
      </div>
    )
  } else {
    // Revisar
    const conAcceso = !(modo.tipo === 'empleado' && usaSistema === false)
    const sucursal = sucursales.find((s) => s.id === sucursalId)
    contenido = (
      <div className="space-y-4">
        <Pregunta texto="¿Está todo bien?" ayuda="Leé el resumen. Si algo no va, tocá «Cambiar» y lo corregís." />
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {(modo.tipo === 'empleado' || destino === 'nueva') && (
            <FilaResumen
              icono={UserRound}
              titulo="La persona"
              onCambiar={() => irA('persona', 'back')}
            >
              <b className="text-ink-950">{nombrePersona}</b>
              {sucursal ? `, de ${sucursal.nombre}.` : ', sin sucursal por ahora.'}
            </FilaResumen>
          )}
          {empleadoElegido && (
            <FilaResumen icono={UserRound} titulo="La persona" onCambiar={modo.tipo === 'cuenta' ? () => irA('para_quien', 'back') : undefined}>
              <b className="text-ink-950">{empleadoElegido.nombre_completo}</b>
              {empleadoElegido.sucursal ? `, de ${empleadoElegido.sucursal.nombre}.` : '.'}
            </FilaResumen>
          )}
          {destino === 'suelta' && (
            <FilaResumen icono={Briefcase} titulo="La cuenta" onCambiar={() => irA('para_quien', 'back')}>
              No es de nadie del equipo: no va a aparecer en Empleados.
            </FilaResumen>
          )}
          {conAcceso ? (
            <>
              <FilaResumen icono={KeyRound} titulo="Su acceso" onCambiar={() => irA('acceso', 'back')}>
                Entra con <b className="text-ink-950">{username}</b> o con <b className="text-ink-950">{email}</b>, y la
                contraseña <b className="font-mono text-ink-950">{password}</b>.
              </FilaResumen>
              <FilaResumen icono={Users} titulo="Qué puede ver" onCambiar={() => irA('rol', 'back')}>
                {rolElegido ? (
                  <>
                    Rol <b className="text-ink-950">{rolElegido.nombre}</b>: ve {queVeEnPalabras(rolElegido)}.
                  </>
                ) : (
                  <>Sin rol: ve {queVeEnPalabras(null)}.</>
                )}
                {rolElegido && <PantallasDelRol rol={rolElegido} className="mt-2" />}
              </FilaResumen>
            </>
          ) : (
            <FilaResumen icono={UserRoundX} titulo="Acceso" onCambiar={() => irA('usa_sistema', 'back')}>
              No va a poder entrar al sistema (se lo podés dar después).
            </FilaResumen>
          )}
        </div>
        {errorGeneral && <MensajeCampo tono="mal">{errorGeneral}</MensajeCampo>}
      </div>
    )
  }

  const esUltimo = paso === 'revisar'

  return (
    <Modal open={abierto} onClose={cerrar} size="xl" dismissable={!guardando}>
      {/* Encabezado: título, en qué paso va y cuántos faltan */}
      <div className="shrink-0 border-b border-line px-5 pb-3.5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
              {resultado ? 'Terminado' : `Paso ${indice + 1} de ${pasos.length} · ${TITULO_PASO[paso]}`}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-ink-950">{titulo}</h2>
          </div>
          <button
            type="button"
            onClick={() => (resultado ? onCerrar() : void cerrar())}
            aria-label="Cerrar"
            className="-mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {pasos.map((p, i) => (
            <span
              key={p}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                resultado || i <= indice ? 'bg-ink-950' : 'bg-ink-100',
              )}
            />
          ))}
        </div>
      </div>

      <form onSubmit={siguiente} noValidate className="flex min-h-0 flex-1 flex-col">
        <div ref={contenidoRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div key={resultado ? 'listo' : paso} className={dir === 'fwd' ? 'ct-step-fwd' : 'ct-step-back'}>
            {contenido}
          </div>
        </div>

        {/* Botones: siempre a mano, abajo */}
        <div className="flex shrink-0 gap-2.5 border-t border-line bg-surface px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          {resultado ? (
            <Button type="button" className="flex-1 sm:ml-auto sm:flex-none" onClick={onCerrar}>
              Terminar
            </Button>
          ) : (
            <>
              {indice > 0 ? (
                <Button type="button" variant="outline" onClick={atras} disabled={guardando}>
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => void cerrar()}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" className="flex-1 sm:ml-auto sm:flex-none sm:min-w-[11rem]" disabled={guardando}>
                {guardando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : esUltimo ? (
                  <>
                    <CircleCheckBig className="h-4 w-4" />
                    Guardar
                  </>
                ) : (
                  <>
                    Siguiente
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </form>
    </Modal>
  )
}

// ===== Piezas =====

function Pregunta({ texto, ayuda }: { texto: string; ayuda?: string }) {
  return (
    <div>
      <h3 className="text-balance text-xl font-bold tracking-tight text-ink-950">{texto}</h3>
      {ayuda && <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-500">{ayuda}</p>}
    </div>
  )
}

function FilaResumen({
  icono: Icono,
  titulo,
  onCambiar,
  children,
}: {
  icono: typeof UserRound
  titulo: string
  onCambiar?: () => void
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 border-t border-line px-4 py-3.5 first:border-t-0">
      <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-700">
        <Icono className="h-4 w-4" strokeWidth={1.85} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-ink-400">{titulo}</p>
        <div className="mt-0.5 text-pretty break-words text-sm leading-relaxed text-ink-700">{children}</div>
      </div>
      {onCambiar && (
        <button
          type="button"
          onClick={onCambiar}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-ink-500 underline-offset-4 transition-colors hover:bg-ink-100 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          Cambiar
        </button>
      )}
    </div>
  )
}
