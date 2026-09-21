import { Fragment, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpFromLine, Check, Layers, MapPin, Plus, Trash2, Wallet } from 'lucide-react'
import type { CajaConfig, CajaRegistradora, CanalCaja, SucursalCaja } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import {
  actualizarCaja,
  cambiarModoPorSucursal,
  configurarCajaSucursal,
  crearCaja,
  eliminarCaja,
  listarCajas,
  listarSucursalesCaja,
} from '@/services/caja'
import { Bloque, Ejemplo, Interruptor, Opcion, Pildora } from '@/components/caja/config/piezas'

/**
 * Configuración de las cajas en sí: qué se puede hacer durante el día, cuántas
 * cajas hay, si cada sucursal tiene la suya y la lista de cajas del local.
 * Todo con su explicación al lado, igual que el cierre.
 */

const OPCIONES_CANAL: Array<{ value: CanalCaja; label: string }> = [
  { value: '', label: 'Caja común' },
  { value: 'factura_ri', label: 'Facturado RI (A/B)' },
  { value: 'general', label: 'Monotributo y sin factura' },
]

export function ConfigCajas({
  open,
  config,
  guardar,
}: {
  open: boolean
  config: CajaConfig
  guardar: (input: Partial<CajaConfig>) => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const { data: cajas = [] } = useQuery({ queryKey: ['caja', 'cajas'], queryFn: listarCajas })
  const { data: sucursales = [], isSuccess: sucursalesCargadas } = useQuery({
    queryKey: ['caja', 'sucursales'],
    queryFn: listarSucursalesCaja,
    enabled: open,
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['caja'] })

  const cambiarModo = useMutation({
    mutationFn: ({ activar, sucursalesIds }: { activar: boolean; sucursalesIds?: string[] }) =>
      cambiarModoPorSucursal(activar, sucursalesIds),
    onSuccess: (_config, { activar }) => {
      invalidar()
      toast.success(
        activar ? 'Cada sucursal tiene su caja' : 'Volviste a las cajas compartidas',
        activar
          ? 'Abrí el turno de cada sucursal para que sus ventas entren a su cierre.'
          : 'Las ventas de todas las sucursales vuelven a entrar a las mismas cajas.',
      )
    },
    onError: (e: Error) => toast.error('No se pudo cambiar', e.message),
  })
  const cambiarCajaSucursal = useMutation({
    mutationFn: ({ id, tieneCaja }: { id: string; tieneCaja: boolean }) => configurarCajaSucursal(id, tieneCaja),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error('No se pudo cambiar la caja de la sucursal', e.message),
  })
  const crear = useMutation({
    mutationFn: ({ nombre, sucursalId }: { nombre: string; sucursalId: string | null }) =>
      crearCaja(nombre, sucursalId),
    onSuccess: () => {
      invalidar()
      setNuevaCaja('')
    },
    onError: (e: Error) => toast.error('No se pudo crear la caja', e.message),
  })
  const actualizar = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Pick<CajaRegistradora, 'nombre' | 'activa' | 'canal'>> }) =>
      actualizarCaja(id, input),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error('No se pudo actualizar', e.message),
  })
  const borrar = useMutation({
    mutationFn: (id: string) => eliminarCaja(id),
    onSuccess: () => {
      invalidar()
      toast.success('Caja eliminada')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  const [nuevaCaja, setNuevaCaja] = useState('')
  const [nuevaCajaSucursal, setNuevaCajaSucursal] = useState('')

  // --- Caja por sucursal ---------------------------------------------------------

  const porSucursal = config.porSucursal
  const sucursalesActivas = useMemo(() => sucursales.filter((s) => s.activa), [sucursales])
  const sucursalesConCaja = useMemo(() => sucursales.filter((s) => s.tieneCaja), [sucursales])

  // Con el modo apagado se eligen de antemano las sucursales que van a tener
  // caja: de entrada todas las activas (se destilda la que no corresponda).
  const [elegidas, setElegidas] = useState<string[] | null>(null)
  const elegidasEfectivas = elegidas ?? sucursalesActivas.map((s) => s.id)
  useEffect(() => {
    if (!open) setElegidas(null)
  }, [open])

  // La caja nueva se crea en una sucursal con caja (con el modo prendido).
  useEffect(() => {
    if (!porSucursal || sucursalesConCaja.length === 0) return
    if (!sucursalesConCaja.some((s) => s.id === nuevaCajaSucursal)) {
      setNuevaCajaSucursal(sucursalesConCaja[0].id)
    }
  }, [porSucursal, sucursalesConCaja, nuevaCajaSucursal])

  // Las cajas agrupadas por ámbito. Si no hay ninguna de sucursal, la lista se
  // ve exactamente como siempre (sin encabezados).
  const grupos = useMemo(() => {
    const compartidas = cajas.filter((c) => !c.sucursalId)
    const deSucursal = new Map<string, { nombre: string; cajas: CajaRegistradora[] }>()
    for (const c of cajas) {
      if (!c.sucursalId) continue
      const grupo = deSucursal.get(c.sucursalId) ?? { nombre: c.sucursalNombre ?? '', cajas: [] }
      grupo.cajas.push(c)
      deSucursal.set(c.sucursalId, grupo)
    }
    const orden = (id: string) => {
      const i = sucursales.findIndex((s) => s.id === id)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    const sucursalesGrupos = [...deSucursal]
      .sort(([a], [b]) => orden(a) - orden(b))
      .map(([id, g]) => ({
        clave: id,
        titulo: g.nombre,
        nota: porSucursal ? '' : 'en pausa: se usan las compartidas',
        cajas: g.cajas,
      }))
    const compartidasGrupo = compartidas.length
      ? [{
          clave: 'compartidas',
          titulo: 'Compartidas',
          nota: porSucursal ? 'de antes: ya no reciben ventas' : '',
          cajas: compartidas,
        }]
      : []
    return porSucursal
      ? [...sucursalesGrupos, ...compartidasGrupo]
      : [...compartidasGrupo, ...sucursalesGrupos]
  }, [cajas, sucursales, porSucursal])
  const conEncabezados = cajas.some((c) => c.sucursalId)

  const nombresDe = (ids: string[]) =>
    sucursalesActivas.filter((s) => ids.includes(s.id)).map((s) => s.nombre).join(', ')

  async function handleSepararPorSucursal() {
    const ids = elegidasEfectivas
    const sinCaja = sucursalesActivas.filter((s) => !ids.includes(s.id))
    const ok = await confirm({
      title: '¿Separar las cajas por sucursal?',
      icon: MapPin,
      confirmLabel: 'Separar por sucursal',
      description: (
        <span className="block space-y-2">
          <span className="block">
            <b>{nombresDe(ids)}</b> van a tener cada una sus dos cajas (Facturación RI y
            Monotributo y sin factura), con su propio turno y su propio cierre.
          </span>
          {sinCaja.length > 0 && (
            <span className="block">
              <b>{sinCaja.map((s) => s.nombre).join(', ')}</b> queda sin caja: sus ventas se
              registran igual, pero no entran a ningún cierre.
            </span>
          )}
          <span className="block">
            Las cajas compartidas de hoy dejan de recibir ventas; sus cierres quedan en el
            historial. Hace falta que no tengan un turno abierto.
          </span>
        </span>
      ),
    })
    if (ok) cambiarModo.mutate({ activar: true, sucursalesIds: ids })
  }

  async function handleVolverACompartidas() {
    const ok = await confirm({
      title: '¿Volver a las cajas compartidas?',
      tone: 'warning',
      confirmLabel: 'Volver a compartidas',
      description:
        'Las ventas de todas las sucursales vuelven a entrar a las mismas cajas. Las cajas de ' +
        'cada sucursal quedan en pausa con su historial. Hace falta que ninguna tenga un turno abierto.',
    })
    if (ok) cambiarModo.mutate({ activar: false })
  }

  /** Con caja por sucursal la caja nueva es de la sucursal elegida; si no, compartida. */
  function crearNueva() {
    crear.mutate({
      nombre: nuevaCaja,
      sucursalId: porSucursal && nuevaCajaSucursal ? nuevaCajaSucursal : null,
    })
  }

  async function handleCajaSucursal(sucursal: SucursalCaja, tieneCaja: boolean) {
    if (!tieneCaja) {
      const ok = await confirm({
        title: `¿Quitarle la caja a ${sucursal.nombre}?`,
        tone: 'warning',
        confirmLabel: 'Quitar la caja',
        description:
          'Sus ventas se van a seguir registrando, pero no van a entrar a ningún cierre. ' +
          'Sus cajas y sus cierres se conservan: si le volvés a dar caja, son las mismas.',
      })
      if (!ok) return
    }
    cambiarCajaSucursal.mutate({ id: sucursal.id, tieneCaja })
  }

  async function handleEliminarCaja(caja: CajaRegistradora) {
    const ok = await confirm({
      title: `¿Eliminar la caja "${caja.nombre}"?`,
      description: 'Sus cierres anteriores se conservan en el historial. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate(caja.id)
  }

  return (
    <div className="space-y-4">
      {/* ===== Durante el día ===== */}
      <Bloque
        icono={ArrowUpFromLine}
        titulo="Durante el día"
        descripcion="Lo que se puede hacer con la plata mientras la caja está abierta."
        indice={0}
      >
        <Opcion
          titulo="Permitir sacar plata para guardarla (retiros)"
          descripcion={
            <>
              Mientras la caja está abierta se puede sacar plata del cajón para guardarla en la caja fuerte, así
              no se junta mucha en el mostrador. Queda anotado quién sacó, cuánto y por qué.
              <Ejemplo>a las 15 h hay $ 300.000 en el cajón: se retiran $ 250.000 y se guardan.</Ejemplo>
            </>
          }
          control={
            <Interruptor
              activo={config.retirosHabilitados}
              onChange={(v) => guardar({ retirosHabilitados: v })}
              etiqueta="Permitir retiros"
            />
          }
        />
      </Bloque>

      {/* ===== Varias cajas ===== */}
      <Bloque
        icono={Layers}
        titulo="Varias cajas"
        descripcion="Si el local maneja más de un cajón, cada uno se abre, se cuenta y se cierra por separado."
        estado={<Pildora apagada={!config.multiCaja}>{config.multiCaja ? 'Prendido' : 'Apagado'}</Pildora>}
        indice={1}
      >
        <Opcion
          titulo="Trabajar con varias cajas"
          descripcion={
            <>
              Prendido, arriba de la pantalla de Caja se elige en qué caja se trabaja (por ejemplo, una para lo
              facturado con Responsable Inscripto y otra para lo demás). Apagado, se usa una sola: la primera
              caja activa de la lista.
            </>
          }
          control={
            <Interruptor
              activo={config.multiCaja}
              onChange={(v) => guardar({ multiCaja: v })}
              etiqueta="Trabajar con varias cajas"
            />
          }
        />
      </Bloque>

      {/* ===== Caja por sucursal ===== */}
      <Bloque
        icono={MapPin}
        titulo="Caja por sucursal"
        descripcion="Decidí si cada local tiene su propio cajón o si todos comparten las mismas cajas."
        estado={<Pildora apagada={!porSucursal}>{porSucursal ? 'Cada sucursal la suya' : 'Compartidas'}</Pildora>}
        indice={2}
      >
        {porSucursal ? (
          <>
            {sucursales.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                <span
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 transition-colors',
                    s.tieneCaja ? 'bg-ink-950 text-on-ink ring-ink-950' : 'bg-ink-50 text-ink-400 ring-line',
                  )}
                >
                  <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {s.nombre}
                    {!s.activa && <span className="ml-1.5 text-xs font-normal text-ink-400">(desactivada)</span>}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                    {s.tieneCaja
                      ? s.turnoAbierto
                        ? 'Tiene caja, y ahora hay un turno abierto.'
                        : 'Tiene caja: sus dos cajas (Facturación RI y Monotributo y sin factura).'
                      : 'No tiene caja: vende igual, pero sus ventas no entran en ningún cierre.'}
                  </p>
                </div>
                <Switch
                  checked={s.tieneCaja}
                  onChange={(v) => handleCajaSucursal(s, v)}
                  aria-label={`Caja en ${s.nombre}`}
                  disabled={cambiarCajaSucursal.isPending || (!s.activa && !s.tieneCaja)}
                />
              </div>
            ))}
            <div className="flex flex-col gap-2 bg-canvas/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-ink-500">
                Cada sucursal abre y cierra su propio cajón: la plata de un local nunca se mezcla con la de otro.
              </p>
              <button
                type="button"
                onClick={handleVolverACompartidas}
                disabled={cambiarModo.isPending}
                className="shrink-0 self-start rounded-lg text-xs font-semibold text-ink-700 underline decoration-ink-300 underline-offset-2 transition-colors hover:text-ink-950 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 sm:self-auto"
              >
                Volver a cajas compartidas
              </button>
            </div>
          </>
        ) : (
          <div className="px-4 py-4">
            <p className="text-pretty text-[0.8rem] leading-relaxed text-ink-500">
              Hoy las ventas de todas las sucursales entran a las mismas cajas. Si cada local tiene su cajón,
              separalas: cada sucursal va a abrir y cerrar el suyo, con sus dos cajas.
            </p>
            <p className="mb-2 mt-3.5 text-xs font-semibold text-ink-700">¿Qué sucursales van a tener caja?</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Sucursales con caja">
              {sucursalesActivas.map((s) => {
                const marcada = elegidasEfectivas.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() =>
                      setElegidas(
                        marcada ? elegidasEfectivas.filter((id) => id !== s.id) : [...elegidasEfectivas, s.id],
                      )
                    }
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                      marcada
                        ? 'border-ink-950 bg-ink-950 text-on-ink'
                        : 'border-line-strong bg-surface text-ink-500 hover:border-ink-300 hover:text-ink-800',
                    )}
                  >
                    {marcada ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                    )}
                    {s.nombre}
                  </button>
                )
              })}
              {sucursalesCargadas && sucursalesActivas.length === 0 && (
                <p className="text-xs text-ink-400">No hay sucursales activas.</p>
              )}
            </div>
            <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[0.72rem] leading-relaxed text-ink-400">
                Hacelo con las cajas de hoy cerradas: un turno no cambia de reglas a la mitad.
              </p>
              <Button
                size="sm"
                className="shrink-0"
                onClick={handleSepararPorSucursal}
                disabled={elegidasEfectivas.length === 0 || cambiarModo.isPending}
              >
                <MapPin className="h-4 w-4" />
                Separar por sucursal
              </Button>
            </div>
          </div>
        )}
      </Bloque>

      {/* ===== Cajas del local ===== */}
      <Bloque
        icono={Wallet}
        titulo="Cajas del local"
        descripcion={
          <>
            Cada caja tiene un nombre y un <b className="font-semibold text-ink-700">tipo</b> que dice qué ventas
            entran solas: «Facturado RI (A/B)» recibe lo facturado con Responsable Inscripto; «Monotributo y sin
            factura» recibe la Factura C y lo que va sin factura; una «Caja común» no recibe ventas sola.
          </>
        }
        indice={3}
      >
        {grupos.map((grupo) => (
          <Fragment key={grupo.clave}>
            {conEncabezados && (
              <p className="flex flex-wrap items-baseline gap-x-2 bg-canvas/60 px-4 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-500">
                {grupo.titulo}
                {grupo.nota && (
                  <span className="font-normal normal-case tracking-normal text-ink-400">{grupo.nota}</span>
                )}
              </p>
            )}
            {grupo.cajas.map((caja) => (
              <FilaCaja
                key={caja.id}
                caja={caja}
                onRenombrar={(nombre) => actualizar.mutate({ id: caja.id, input: { nombre } })}
                onCanal={(canal) => actualizar.mutate({ id: caja.id, input: { canal } })}
                onActiva={(activa) => actualizar.mutate({ id: caja.id, input: { activa } })}
                onEliminar={() => handleEliminarCaja(caja)}
                puedeEliminar={cajas.length > 1}
              />
            ))}
          </Fragment>
        ))}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {porSucursal && sucursalesConCaja.length > 0 && (
            <Select
              options={sucursalesConCaja.map((s) => ({ value: s.id, label: s.nombre }))}
              value={nuevaCajaSucursal}
              onChange={setNuevaCajaSucursal}
              className="w-full sm:w-44"
            />
          )}
          <Input
            value={nuevaCaja}
            onChange={(e) => setNuevaCaja(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nuevaCaja.trim()) crearNueva()
            }}
            placeholder="Nombre de la caja nueva (ej: Delivery)"
            aria-label="Nombre de la caja nueva"
            className="h-9 min-w-36 flex-1"
          />
          <Button size="sm" variant="outline" disabled={!nuevaCaja.trim() || crear.isPending} onClick={crearNueva}>
            <Plus className="h-4 w-4" />
            Agregar caja
          </Button>
        </div>
        {!config.multiCaja && cajas.length > 1 && (
          <p className="bg-canvas/40 px-4 py-2.5 text-xs text-ink-500">
            «Varias cajas» está apagado: se trabaja solo con la primera caja activa.
          </p>
        )}
      </Bloque>
    </div>
  )
}

// ===== Piezas =====

function FilaCaja({
  caja,
  puedeEliminar,
  onRenombrar,
  onCanal,
  onActiva,
  onEliminar,
}: {
  caja: CajaRegistradora
  puedeEliminar: boolean
  onRenombrar: (nombre: string) => void
  onCanal: (canal: CanalCaja) => void
  onActiva: (activa: boolean) => void
  onEliminar: () => void
}) {
  const [nombre, setNombre] = useState(caja.nombre)
  useEffect(() => setNombre(caja.nombre), [caja.nombre])

  return (
    <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
      <Input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onBlur={() => {
          const limpio = nombre.trim()
          if (limpio && limpio !== caja.nombre) onRenombrar(limpio)
          else setNombre(caja.nombre)
        }}
        aria-label={`Nombre de la caja ${caja.nombre}`}
        className="h-9 min-w-36 flex-1"
      />
      <Select
        options={OPCIONES_CANAL}
        value={caja.canal}
        onChange={(v) => onCanal(v as CanalCaja)}
        className="w-full sm:w-56"
      />
      <label className="flex items-center gap-2 text-xs font-medium text-ink-500">
        <Switch checked={caja.activa} onChange={onActiva} aria-label={`Caja ${caja.nombre} activa`} />
        {caja.activa ? 'Activa' : 'Pausada'}
      </label>
      <button
        type="button"
        onClick={onEliminar}
        disabled={!puedeEliminar}
        aria-label={`Eliminar caja ${caja.nombre}`}
        title={puedeEliminar ? 'Eliminar caja' : 'Tiene que quedar al menos una caja'}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
