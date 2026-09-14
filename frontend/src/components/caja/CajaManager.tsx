import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, MapPin, Plus, Trash2 } from 'lucide-react'
import type { CajaConfig, CajaRegistradora, CanalCaja, SucursalCaja } from '@/types'
import { DENOMINACIONES_ARS } from '@/types'
import { money0 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import {
  actualizarCaja,
  cambiarModoPorSucursal,
  configurarCajaSucursal,
  crearCaja,
  eliminarCaja,
  guardarConfigCaja,
  listarCajas,
  listarSucursalesCaja,
  obtenerConfigCaja,
} from '@/services/caja'

/**
 * Configuración del módulo Caja (solo administradores): acá se prende y apaga
 * cada función profesional — cierre ciego, tolerancia, retiros, multi-caja,
 * checklist de lote — y se administran las cajas y los billetes de la grilla.
 * Los cambios se guardan solos, sin botón de guardar.
 */

export function CajaManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const { data: config } = useQuery({ queryKey: ['caja', 'config'], queryFn: obtenerConfigCaja })
  const { data: cajas = [] } = useQuery({ queryKey: ['caja', 'cajas'], queryFn: listarCajas })
  const { data: sucursales = [], isSuccess: sucursalesCargadas } = useQuery({
    queryKey: ['caja', 'sucursales'],
    queryFn: listarSucursalesCaja,
    enabled: open,
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['caja'] })

  const guardar = useMutation({
    mutationFn: (input: Partial<CajaConfig>) => guardarConfigCaja(input),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error('No se pudo guardar', e.message),
  })
  const cambiarModo = useMutation({
    mutationFn: ({ activar, sucursalesIds }: { activar: boolean; sucursalesIds?: string[] }) =>
      cambiarModoPorSucursal(activar, sucursalesIds),
    onSuccess: (_config, { activar }) => {
      invalidar()
      toast.success(
        activar ? 'Cada sucursal tiene su caja' : 'Volviste a las cajas compartidas',
        activar
          ? 'Abrí el turno de cada sucursal para que sus ventas entren a su arqueo.'
          : 'Las ventas de todas las sucursales vuelven a entrar a las mismas cajas.',
      )
    },
    onError: (e: Error) => toast.error('No se pudo cambiar', e.message),
  })
  const cambiarCajaSucursal = useMutation({
    mutationFn: ({ id, tieneCaja }: { id: string; tieneCaja: boolean }) =>
      configurarCajaSucursal(id, tieneCaja),
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

  // Montos con edición local (se guardan al salir del campo).
  const [tolerancia, setTolerancia] = useState('')
  const [fondo, setFondo] = useState('')
  const [nuevaCaja, setNuevaCaja] = useState('')
  const [nuevaCajaSucursal, setNuevaCajaSucursal] = useState('')

  useEffect(() => {
    if (!open || !config) return
    setTolerancia(String(config.toleranciaMonto))
    setFondo(String(config.fondoSugerido))
    setNuevaCaja('')
  }, [open, config])

  // --- Caja por sucursal ---------------------------------------------------------

  const porSucursal = Boolean(config?.porSucursal)
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

  if (!config) return null

  const set = (input: Partial<CajaConfig>) => guardar.mutate(input)

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
              registran igual, pero no entran a ningún arqueo.
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
          'Sus ventas se van a seguir registrando, pero no van a entrar a ningún arqueo. ' +
          'Sus cajas y sus cierres se conservan: si le volvés a dar caja, son las mismas.',
      })
      if (!ok) return
    }
    cambiarCajaSucursal.mutate({ id: sucursal.id, tieneCaja })
  }

  function toggleDenominacion(den: number) {
    if (!config) return
    const activas = config.denominaciones.includes(den)
      ? config.denominaciones.filter((d) => d !== den)
      : [...config.denominaciones, den]
    if (activas.length === 0) {
      toast.error('Dejá al menos un billete activo')
      return
    }
    set({ denominaciones: activas })
  }

  async function handleEliminarCaja(caja: CajaRegistradora) {
    const ok = await confirm({
      title: `¿Eliminar la caja "${caja.nombre}"?`,
      description: 'Su historial de cierres se conserva. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate(caja.id)
  }

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">Configurar Caja</h2>
        <p className="mt-0.5 text-xs text-ink-400">
          Elegí qué funciones usa tu operación. Los cambios se guardan solos.
        </p>
      </div>

      <div className="space-y-6 overflow-y-auto px-5 py-5">
        {/* ===== Funciones ===== */}
        <section>
          <TituloSeccion>Funciones del cierre</TituloSeccion>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            <FilaSwitch
              titulo="Cierre ciego"
              descripcion="Quien cuenta no ve el esperado del efectivo; se revela recién al confirmar. Evita conteos «acomodados»."
              checked={config.cierreCiego}
              onChange={(v) => set({ cierreCiego: v })}
            />
            <FilaSwitch
              titulo="Tolerancia de diferencia"
              descripcion="Si la diferencia supera este monto, el cierre exige motivo y nota."
              checked={config.toleranciaActiva}
              onChange={(v) => set({ toleranciaActiva: v })}
              extra={
                config.toleranciaActiva && (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={tolerancia}
                    onChange={(e) => setTolerancia(e.target.value)}
                    onBlur={() => {
                      const v = Math.max(0, Number(tolerancia) || 0)
                      if (v !== config.toleranciaMonto) set({ toleranciaMonto: v })
                    }}
                    aria-label="Tolerancia en pesos"
                    className="tnum h-9 w-28 text-right"
                  />
                )
              }
            />
            <FilaSwitch
              titulo="Retiros a bóveda"
              descripcion="Permite retirar efectivo del cajón durante el turno (recomendado: no acumular)."
              checked={config.retirosHabilitados}
              onChange={(v) => set({ retirosHabilitados: v })}
            />
            <FilaSwitch
              titulo="Exigir cierre de lote"
              descripcion="Si hubo ventas con tarjeta, el pre-cierre pide confirmar el cierre de lote de la terminal."
              checked={config.exigirLote}
              onChange={(v) => set({ exigirLote: v })}
            />
            <FilaSwitch
              titulo="Multi-caja"
              descripcion="Varias cajas nombradas, cada una con su turno y su arqueo."
              checked={config.multiCaja}
              onChange={(v) => set({ multiCaja: v })}
            />
          </div>
        </section>

        {/* ===== Fondo sugerido ===== */}
        <section>
          <TituloSeccion>Fondo sugerido</TituloSeccion>
          <div className="flex flex-col gap-3 rounded-2xl border border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-ink-500">
              Se propone al abrir un turno y como «dejar en caja» al cerrar.
            </p>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={fondo}
              onChange={(e) => setFondo(e.target.value)}
              onBlur={() => {
                const v = Math.max(0, Number(fondo) || 0)
                if (v !== config.fondoSugerido) set({ fondoSugerido: v })
              }}
              aria-label="Fondo sugerido en pesos"
              className="tnum h-9 w-full text-right sm:w-36"
            />
          </div>
        </section>

        {/* ===== Denominaciones ===== */}
        <section>
          <TituloSeccion>Billetes de la grilla de arqueo</TituloSeccion>
          <div className="rounded-2xl border border-line px-4 py-3.5">
            <div className="flex flex-wrap gap-1.5">
              {DENOMINACIONES_ARS.map((den) => {
                const activa = config.denominaciones.includes(den)
                return (
                  <button
                    key={den}
                    type="button"
                    onClick={() => toggleDenominacion(den)}
                    aria-pressed={activa}
                    className={cn(
                      'tnum rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                      activa
                        ? 'border-ink-950 bg-ink-950 text-on-ink'
                        : 'border-line-strong bg-surface text-ink-400 hover:border-ink-300 hover:text-ink-700',
                    )}
                  >
                    {money0(den)}
                  </button>
                )
              })}
            </div>
            <p className="mt-2.5 text-xs text-ink-400">
              Los billetes chicos que casi no circulan conviene dejarlos afuera: siempre queda el campo «Sueltos».
            </p>
          </div>
        </section>

        {/* ===== Caja por sucursal ===== */}
        <section>
          <TituloSeccion>Caja por sucursal</TituloSeccion>
          {porSucursal ? (
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
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
                          ? 'Tiene caja, con un turno abierto ahora.'
                          : 'Tiene caja: Facturación RI y Monotributo y sin factura.'
                        : 'Sin caja: sus ventas no entran a ningún arqueo.'}
                    </p>
                  </div>
                  <Switch
                    checked={s.tieneCaja}
                    onChange={(v) => handleCajaSucursal(s, v)}
                    label={`Caja en ${s.nombre}`}
                    disabled={cambiarCajaSucursal.isPending || (!s.activa && !s.tieneCaja)}
                  />
                </div>
              ))}
              <div className="flex flex-col gap-2 bg-canvas/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-ink-500">
                  Cada sucursal abre y cierra su propio cajón, y sus ventas entran solo a sus cajas.
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
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line">
              <div className="flex items-start gap-3 px-4 py-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-line">
                  <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">Hoy las cajas son compartidas</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                    Las ventas de todas las sucursales entran a las mismas cajas. Separalas para que
                    cada sucursal abra y cierre su propio cajón, con sus dos cajas fiscales.
                  </p>
                </div>
              </div>
              <div className="border-t border-line px-4 py-3.5">
                <p className="mb-2 text-xs font-medium text-ink-500">¿Qué sucursales tienen caja?</p>
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
                            marcada
                              ? elegidasEfectivas.filter((id) => id !== s.id)
                              : [...elegidasEfectivas, s.id],
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
                <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[0.7rem] leading-relaxed text-ink-400">
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
            </div>
          )}
        </section>

        {/* ===== Cajas ===== */}
        <section>
          <TituloSeccion>Cajas del local</TituloSeccion>
          <p className="mb-2 text-xs leading-relaxed text-ink-500">
            El <b>canal fiscal</b> separa la plata sola: lo facturado con Responsable Inscripto
            (Factura A/B) entra a su caja, y la Factura C de monotributo junto con lo sin factura
            entran a la general. Una caja «común» queda fuera del enrutamiento.
          </p>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {grupos.map((grupo) => (
              <Fragment key={grupo.clave}>
                {conEncabezados && (
                  <p className="flex flex-wrap items-baseline gap-x-2 bg-canvas/60 px-4 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    {grupo.titulo}
                    {grupo.nota && (
                      <span className="font-normal normal-case tracking-normal text-ink-400">
                        {grupo.nota}
                      </span>
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
                placeholder="Nueva caja (ej: Delivery)"
                className="h-9 min-w-36 flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!nuevaCaja.trim() || crear.isPending}
                onClick={crearNueva}
              >
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </div>
          </div>
          {!config.multiCaja && cajas.length > 1 && (
            <p className="mt-2 text-xs text-ink-400">
              Con multi-caja apagado se opera solo con la primera caja activa.
            </p>
          )}
        </section>

        <div className="flex justify-end pt-1">
          <Button onClick={onClose}>Listo</Button>
        </div>
      </div>
    </Modal>
  )
}

// ===== Piezas =====

function TituloSeccion({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
      {children}
    </h3>
  )
}

function FilaSwitch({
  titulo,
  descripcion,
  checked,
  onChange,
  extra,
}: {
  titulo: string
  descripcion: string
  checked: boolean
  onChange: (v: boolean) => void
  extra?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900">{titulo}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{descripcion}</p>
      </div>
      {extra}
      <Switch checked={checked} onChange={onChange} label={titulo} />
    </div>
  )
}

/** Switch monocromático accesible (no hay uno en ui/ todavía). */
function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:opacity-40',
        checked ? 'bg-ink-950' : 'bg-ink-200',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'block h-5 w-5 rounded-full bg-surface shadow-[0_1px_3px_rgba(10,10,11,0.3)] ring-1 ring-line transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
          checked && 'translate-x-4',
        )}
      />
    </button>
  )
}

const OPCIONES_CANAL: Array<{ value: CanalCaja; label: string }> = [
  { value: '', label: 'Caja común' },
  { value: 'factura_ri', label: 'Facturado RI (A/B)' },
  { value: 'general', label: 'Monotributo y sin factura' },
]

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
      <label className="flex items-center gap-1.5 text-xs text-ink-500">
        <Switch checked={caja.activa} onChange={onActiva} label={`Caja ${caja.nombre} activa`} />
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
