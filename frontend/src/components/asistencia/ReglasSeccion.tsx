import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { ReglaInconsistencia, SeveridadInconsistencia, TipoInconsistencia } from '@/types'
import {
  actualizarRegla,
  catalogoInconsistencias,
  crearRegla,
  eliminarRegla,
  listarReglas,
  listarTurnos,
  sembrarReglas,
} from '@/services/asistencia'
import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { iconoInconsistencia, severidadDe } from '@/components/asistencia/constantes'
import { cn, ctStagger } from '@/lib/utils'

/**
 * El catálogo de reglas: qué se reporta y a partir de cuánto.
 *
 * Las reglas globales vienen cargadas de fábrica; acá se ajustan los umbrales,
 * se apagan las que no interesan y se agregan excepciones para un turno
 * puntual (el turno noche suele tolerar más llegada tarde, por ejemplo).
 */
export function ReglasSeccion() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const [creando, setCreando] = useState(false)

  const { data: reglas = [], isLoading } = useQuery({
    queryKey: ['asistencia', 'reglas'],
    queryFn: () => listarReglas(),
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['asistencia'] })

  const guardar = useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: Record<string, unknown> }) =>
      actualizarRegla(id, cambios),
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error('No se pudo guardar', e.message),
  })

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarRegla(id),
    onSuccess: () => {
      invalidar()
      toast.success('Excepción eliminada', 'Ese turno vuelve a usar la regla general.')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  const sembrar = useMutation({
    mutationFn: sembrarReglas,
    onSuccess: (r) => {
      invalidar()
      if (r.creadas === 0) toast.info('Ya estaban todas', 'No faltaba ninguna regla.')
      else toast.success(`${r.creadas} reglas restauradas`)
    },
    onError: (e: Error) => toast.error('No se pudieron cargar', e.message),
  })

  const globales = reglas.filter((r) => r.turno === null)
  const porTurno = reglas.filter((r) => r.turno !== null)

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Qué se considera una inconsistencia
          </h3>
          <p className="mt-0.5 text-xs text-ink-400">
            Apagá lo que no te interese mirar. Lo que apagues deja de reportarse y de
            teñir el estado del día — lo ya justificado no se pierde.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sembrar.mutate()}
            disabled={sembrar.isPending}
          >
            {sembrar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Restaurar faltantes
          </Button>
          <Button size="sm" onClick={() => setCreando(true)}>
            <Plus className="h-4 w-4" />
            Excepción por turno
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <div className="space-y-4">
          <Card className="divide-y divide-line">
            {globales.map((regla, i) => (
              <FilaRegla
                key={regla.id}
                regla={regla}
                indice={i}
                guardando={guardar.isPending}
                onCambiar={(cambios) => guardar.mutate({ id: regla.id, cambios })}
              />
            ))}
          </Card>

          {porTurno.length > 0 && (
            <div>
              <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">
                Excepciones por turno
              </p>
              <Card className="divide-y divide-line">
                {porTurno.map((regla, i) => (
                  <FilaRegla
                    key={regla.id}
                    regla={regla}
                    indice={i}
                    guardando={guardar.isPending}
                    onCambiar={(cambios) => guardar.mutate({ id: regla.id, cambios })}
                    onBorrar={async () => {
                      const ok = await confirm({
                        title: '¿Eliminar la excepción?',
                        description: `«${regla.turno_nombre}» vuelve a usar la regla general de ${regla.tipo_display.toLowerCase()}.`,
                        confirmLabel: 'Eliminar',
                        tone: 'danger',
                      })
                      if (ok === true) borrar.mutate(regla.id)
                    }}
                  />
                ))}
              </Card>
            </div>
          )}
        </div>
      )}

      <ExcepcionModal abierto={creando} onClose={() => setCreando(false)} />
    </section>
  )
}

// --- Una regla ---------------------------------------------------------------

function FilaRegla({
  regla,
  indice,
  guardando,
  onCambiar,
  onBorrar,
}: {
  regla: ReglaInconsistencia
  indice: number
  guardando: boolean
  onCambiar: (cambios: Record<string, unknown>) => void
  onBorrar?: () => void
}) {
  const Icono = iconoInconsistencia(regla.tipo)
  const severidad = severidadDe(regla.severidad)
  const [umbral, setUmbral] = useState(
    regla.umbral_minutos === null ? '' : String(regla.umbral_minutos),
  )

  useEffect(() => {
    setUmbral(regla.umbral_minutos === null ? '' : String(regla.umbral_minutos))
  }, [regla.umbral_minutos])

  const guardarUmbral = () => {
    const limpio = umbral.trim()
    const valor = limpio === '' ? null : Number(limpio)
    if (valor === regla.umbral_minutos) return
    if (valor !== null && (Number.isNaN(valor) || valor < 0)) {
      setUmbral(regla.umbral_minutos === null ? '' : String(regla.umbral_minutos))
      return
    }
    onCambiar({ umbral_minutos: valor })
  }

  return (
    <div
      className={cn('ct-stagger-fade p-4', !regla.activa && 'opacity-55')}
      style={ctStagger(indice)}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
            severidad.tono,
          )}
        >
          <Icono className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium text-ink-950">
            {regla.tipo_display}
            {regla.turno_nombre && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-normal text-ink-500">
                {regla.turno_nombre}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">{regla.ayuda}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={regla.activa}
            onChange={(v) => onCambiar({ activa: v })}
            aria-label={`${regla.activa ? 'Desactivar' : 'Activar'} ${regla.tipo_display}`}
          />
          {onBorrar && (
            <Button variant="ghost" size="icon" aria-label="Eliminar excepción" onClick={onBorrar}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_10rem_1fr] lg:items-end">
          {regla.usa_umbral && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-ink-500">
                A partir de (min)
              </label>
              <Input
                type="number"
                min={0}
                value={umbral}
                placeholder="tolerancia del turno"
                onChange={(e) => setUmbral(e.target.value)}
                onBlur={guardarUmbral}
                disabled={!regla.activa || guardando}
                className="tnum"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink-500">Severidad</label>
            <Select
              value={regla.severidad}
              onChange={(v) => onCambiar({ severidad: v as SeveridadInconsistencia })}
              disabled={!regla.activa}
              options={[
                { value: 'leve', label: 'Leve' },
                { value: 'moderada', label: 'Moderada' },
                { value: 'grave', label: 'Grave' },
              ]}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-600 lg:pb-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line accent-ink-950"
              checked={regla.requiere_justificacion}
              disabled={!regla.activa}
              onChange={(e) => onCambiar({ requiere_justificacion: e.target.checked })}
            />
            Pedir justificación
          </label>
      </div>
    </div>
  )
}

// --- Excepción para un turno -------------------------------------------------

function ExcepcionModal({ abierto, onClose }: { abierto: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [tipo, setTipo] = useState('')
  const [turno, setTurno] = useState('')
  const [umbral, setUmbral] = useState('')

  const { data: catalogo } = useQuery({
    queryKey: ['asistencia', 'catalogo-inconsistencias'],
    queryFn: catalogoInconsistencias,
    enabled: abierto,
  })
  const { data: turnos = [] } = useQuery({
    queryKey: ['asistencia', 'turnos'],
    queryFn: listarTurnos,
    enabled: abierto,
  })

  useEffect(() => {
    if (!abierto) return
    setTipo('')
    setTurno('')
    setUmbral('')
  }, [abierto])

  const elegido = catalogo?.tipos.find((t) => t.tipo === tipo)

  const guardar = useMutation({
    mutationFn: () =>
      crearRegla({
        tipo: tipo as TipoInconsistencia,
        turno: Number(turno),
        umbral_minutos: elegido?.usa_umbral && umbral.trim() !== '' ? Number(umbral) : null,
        severidad: elegido?.severidad_defecto,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success(
        'Excepción creada',
        `«${r.turno_nombre}» ya no usa la regla general de ${r.tipo_display.toLowerCase()}.`,
      )
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo crear', e.message),
  })

  return (
    <Modal open={abierto} onClose={onClose} size="md">
      <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-ink-950">
          <SlidersHorizontal className="h-5 w-5 text-ink-400" strokeWidth={1.9} />
          Excepción para un turno
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Un turno puede necesitar otro criterio que el resto — por ejemplo, más tolerancia
          de llegada en el turno noche. Esta regla le gana a la general solo para ese turno.
        </p>

        <div className="mt-5 space-y-4">
          <Select
            label="Tipo de inconsistencia"
            placeholder="Elegir tipo…"
            value={tipo}
            onChange={setTipo}
            options={(catalogo?.tipos ?? []).map((t) => ({
              value: t.tipo,
              label: t.tipo_display,
            }))}
          />
          <Select
            label="Turno"
            placeholder="Elegir turno…"
            value={turno}
            onChange={setTurno}
            options={turnos.map((t) => ({ value: String(t.id), label: t.nombre }))}
          />
          {elegido?.usa_umbral && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                A partir de (min)
              </label>
              <Input
                type="number"
                min={0}
                value={umbral}
                onChange={(e) => setUmbral(e.target.value)}
                placeholder="tolerancia del turno"
                className="tnum"
              />
              <p className="mt-1 text-[11px] text-ink-400">{elegido.etiqueta_umbral}</p>
            </div>
          )}
          {elegido && <p className="text-xs text-ink-400">{elegido.ayuda}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => guardar.mutate()}
            disabled={!tipo || !turno || guardar.isPending}
          >
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear
          </Button>
        </div>
      </div>
    </Modal>
  )
}
