import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import type { CajaConfig, CajaRegistradora, CanalCaja } from '@/types'
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
  crearCaja,
  eliminarCaja,
  guardarConfigCaja,
  listarCajas,
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

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['caja'] })

  const guardar = useMutation({
    mutationFn: (input: Partial<CajaConfig>) => guardarConfigCaja(input),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error('No se pudo guardar', e.message),
  })
  const crear = useMutation({
    mutationFn: (nombre: string) => crearCaja(nombre),
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

  useEffect(() => {
    if (!open || !config) return
    setTolerancia(String(config.toleranciaMonto))
    setFondo(String(config.fondoSugerido))
    setNuevaCaja('')
  }, [open, config])

  if (!config) return null

  const set = (input: Partial<CajaConfig>) => guardar.mutate(input)

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

        {/* ===== Cajas ===== */}
        <section>
          <TituloSeccion>Cajas del local</TituloSeccion>
          <p className="mb-2 text-xs leading-relaxed text-ink-500">
            El <b>canal fiscal</b> separa la plata sola: lo facturado con Responsable Inscripto
            (Factura A/B) entra a su caja, y la Factura C de monotributo junto con lo sin factura
            entran a la general. Una caja «común» queda fuera del enrutamiento.
          </p>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {cajas.map((caja) => (
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
            <div className="flex items-center gap-2 px-4 py-3">
              <Input
                value={nuevaCaja}
                onChange={(e) => setNuevaCaja(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nuevaCaja.trim()) crear.mutate(nuevaCaja)
                }}
                placeholder="Nueva caja (ej: Delivery)"
                className="h-9 flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!nuevaCaja.trim() || crear.isPending}
                onClick={() => crear.mutate(nuevaCaja)}
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
