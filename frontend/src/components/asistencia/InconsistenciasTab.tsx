import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  CircleSlash,
  Loader2,
  MapPinOff,
  PowerOff,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import type { EstadoInconsistencia, FilaInconsistencia } from '@/types'
import {
  catalogoInconsistencias,
  listarInconsistencias,
  reabrirInconsistencia,
  resolverInconsistencia,
} from '@/services/asistencia'
import { listarEmpleados } from '@/services/empleados'
import { listarSucursales } from '@/services/sucursales'
import { useToast } from '@/components/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { Textarea } from '@/components/ui/Textarea'
import { ReglasSeccion } from '@/components/asistencia/ReglasSeccion'
import {
  ESTADO_INCONSISTENCIA,
  duracion,
  etiquetaFecha,
  haceDias,
  iconoInconsistencia,
  severidadDe,
} from '@/components/asistencia/constantes'
import { num } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

type Rango = '7d' | '14d' | '30d'
const RANGOS: { value: Rango; label: string; dias: number }[] = [
  { value: '7d', label: '7 días', dias: 6 },
  { value: '14d', label: '14 días', dias: 13 },
  { value: '30d', label: '30 días', dias: 29 },
]

const ESTADOS = [
  { value: '', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'justificada', label: 'Justificadas' },
  { value: 'rechazada', label: 'Sin justificar' },
]

const SEVERIDADES = [
  { value: '', label: 'Cualquier severidad' },
  { value: 'grave', label: 'Solo graves' },
  { value: 'moderada', label: 'Solo moderadas' },
  { value: 'leve', label: 'Solo leves' },
]

/**
 * Todo lo que pide una mirada, en un solo lugar.
 *
 * Las inconsistencias no son una tabla: se recalculan cada vez desde las
 * fichadas y las reglas vigentes. Por eso cambiar un umbral se ve al
 * instante, y lo único que sobrevive es lo que alguien decidió sobre cada una.
 */
export function InconsistenciasTab() {
  const [rango, setRango] = useState<Rango>('7d')
  const [estado, setEstado] = useState('pendiente')
  const [severidad, setSeveridad] = useState('')
  const [tipo, setTipo] = useState('')
  const [empleado, setEmpleado] = useState('')
  const [sucursal, setSucursal] = useState('')
  const [verReglas, setVerReglas] = useState(false)
  const [resolviendo, setResolviendo] = useState<FilaInconsistencia | null>(null)

  const { data: catalogo } = useQuery({
    queryKey: ['asistencia', 'catalogo-inconsistencias'],
    queryFn: catalogoInconsistencias,
  })
  const { data: empleados = [] } = useQuery({ queryKey: ['empleados'], queryFn: listarEmpleados })
  const { data: sucursales = [] } = useQuery({ queryKey: ['sucursales'], queryFn: listarSucursales })

  const dias = RANGOS.find((r) => r.value === rango)?.dias ?? 6
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['asistencia', 'inconsistencias', rango, estado, severidad, tipo, empleado, sucursal],
    queryFn: () =>
      listarInconsistencias({
        desde: haceDias(dias),
        estado: estado as EstadoInconsistencia | '',
        severidad: severidad as never,
        tipo: tipo as never,
        empleado: empleado ? Number(empleado) : '',
        sucursal: sucursal ? Number(sucursal) : '',
      }),
    placeholderData: keepPreviousData,
  })

  const resumen = data?.resumen
  const porFecha = useMemo(() => {
    const grupos: { fecha: string; filas: FilaInconsistencia[] }[] = []
    for (const fila of data?.resultados ?? []) {
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo.fecha === fila.fecha) ultimo.filas.push(fila)
      else grupos.push({ fecha: fila.fecha, filas: [fila] })
    }
    return grupos
  }, [data])

  const tiposFiltro = [
    { value: '', label: 'Todos los tipos' },
    ...(catalogo?.tipos ?? []).map((t) => ({ value: t.tipo, label: t.tipo_display })),
  ]

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Pendientes"
          value={num(resumen?.pendientes ?? 0)}
          hint="esperando una decisión"
          icon={TriangleAlert}
          className="ct-stagger-item"
          style={ctStagger(0)}
        />
        <StatCard
          label="Graves"
          value={num(resumen?.graves ?? 0)}
          hint="ausencias y marcas faltantes"
          icon={CircleSlash}
          className="ct-stagger-item"
          style={ctStagger(1)}
        />
        <StatCard
          label="Justificadas"
          value={num(resumen?.justificadas ?? 0)}
          hint="con motivo registrado"
          icon={ShieldCheck}
          className="ct-stagger-item"
          style={ctStagger(2)}
        />
        <StatCard
          label="Total del período"
          value={num(resumen?.total ?? 0)}
          hint={`últimos ${dias + 1} días`}
          icon={CheckCircle2}
          className="ct-stagger-item"
          style={ctStagger(3)}
        />
      </div>

      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Período"
            value={rango}
            onChange={(v) => setRango(v as Rango)}
            options={RANGOS.map((r) => ({ value: r.value, label: r.label }))}
          />
          <Select label="Estado" value={estado} onChange={setEstado} options={ESTADOS} />
          <Select label="Tipo" value={tipo} onChange={setTipo} options={tiposFiltro} />
          <Select
            label="Severidad"
            value={severidad}
            onChange={setSeveridad}
            options={SEVERIDADES}
          />
          <Select
            label="Empleado"
            value={empleado}
            onChange={setEmpleado}
            searchable
            options={[
              { value: '', label: 'Todos' },
              ...empleados.map((e) => ({ value: String(e.id), label: e.nombre_completo })),
            ]}
          />
          <Select
            label="Sucursal"
            value={sucursal}
            onChange={setSucursal}
            options={[
              { value: '', label: 'Todas' },
              ...sucursales.map((s) => ({ value: String(s.id), label: s.nombre })),
            ]}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-xs text-ink-400">
            {isFetching && <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" />}
            Se recalculan solas: cambiar una regla se ve acá al instante.
          </p>
          <Button variant="outline" size="sm" onClick={() => setVerReglas((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" />
            {verReglas ? 'Ocultar reglas' : 'Configurar reglas'}
          </Button>
        </div>
      </Card>

      {((catalogo?.sucursales_sin_reloj.length ?? 0) > 0 ||
        (catalogo?.sucursales_sin_control.length ?? 0) > 0) && (
        <Card className="mb-5 space-y-2 border-dashed p-4">
          {/* Los dos motivos van separados porque se arreglan distinto: uno se
              resuelve instalando el reloj, el otro con el interruptor. */}
          {(catalogo?.sucursales_sin_reloj.length ?? 0) > 0 && (
            <div className="flex items-start gap-3">
              <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.9} />
              <p className="text-xs text-ink-500">
                <span className="font-medium text-ink-700">
                  {catalogo?.sucursales_sin_reloj.map((s) => s.nombre).join(', ')}
                </span>{' '}
                {catalogo!.sucursales_sin_reloj.length === 1 ? 'no tiene' : 'no tienen'} reloj
                cargado, así que a quien trabaje ahí no se le exige fichar. Se controla solo
                en cuanto des de alta el reloj en Configuración.
              </p>
            </div>
          )}
          {(catalogo?.sucursales_sin_control.length ?? 0) > 0 && (
            <div className="flex items-start gap-3">
              <PowerOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.9} />
              <p className="text-xs text-ink-500">
                <span className="font-medium text-ink-700">
                  {catalogo?.sucursales_sin_control.map((s) => s.nombre).join(', ')}
                </span>{' '}
                {catalogo!.sucursales_sin_control.length === 1
                  ? 'está apagada'
                  : 'están apagadas'}{' '}
                a propósito: sus fichadas se registran pero no se juzgan. El interruptor
                está en Configuración.
              </p>
            </div>
          )}
        </Card>
      )}

      {verReglas && (
        <div className="mb-5">
          <ReglasSeccion />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : porFecha.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={estado === 'pendiente' ? 'No hay nada pendiente' : 'Sin inconsistencias'}
          description={
            estado === 'pendiente'
              ? 'Todo lo del período está revisado. Cambiá el filtro de estado para ver lo ya resuelto.'
              : 'Nadie llegó tarde, faltó ni se olvidó de marcar en este período con las reglas actuales.'
          }
        />
      ) : (
        <div className="space-y-5">
          {porFecha.map((grupo) => (
            <div key={grupo.fecha}>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                {etiquetaFecha(grupo.fecha)}
              </h3>
              <Card className="divide-y divide-line">
                {grupo.filas.map((fila, i) => (
                  <FilaInconsistenciaVista
                    key={fila.clave}
                    fila={fila}
                    indice={i}
                    onResolver={() => setResolviendo(fila)}
                  />
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}

      <ResolverModal
        fila={resolviendo}
        abierto={resolviendo !== null}
        onClose={() => setResolviendo(null)}
      />
    </div>
  )
}

// --- Una inconsistencia ------------------------------------------------------

function FilaInconsistenciaVista({
  fila,
  indice,
  onResolver,
}: {
  fila: FilaInconsistencia
  indice: number
  onResolver: () => void
}) {
  const Icono = iconoInconsistencia(fila.tipo)
  const severidad = severidadDe(fila.severidad)
  const estado = ESTADO_INCONSISTENCIA[fila.estado] ?? ESTADO_INCONSISTENCIA.pendiente

  return (
    <div className="ct-stagger-fade flex flex-wrap items-start gap-4 p-4" style={ctStagger(indice)}>
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
          {fila.nombre}
          <span className="text-ink-400">·</span>
          <span className="font-normal text-ink-600">{fila.tipo_display}</span>
          {fila.minutos > 0 && (
            <span className="tnum rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-600">
              {duracion(fila.minutos)}
            </span>
          )}
        </p>

        <p className="mt-0.5 text-xs text-ink-400">
          {fila.detalle ||
            [fila.turno, fila.horario_esperado].filter(Boolean).join(' · ') ||
            'Sin turno asignado'}
          {fila.sucursal_esperada ? ` · ${fila.sucursal_esperada.nombre}` : ''}
        </p>

        {fila.motivo && (
          <p className="mt-2 rounded-lg border border-line bg-ink-50 px-3 py-2 text-xs text-ink-600">
            <span className="font-medium text-ink-700">Motivo:</span> {fila.motivo}
            {fila.resuelta_por && (
              <span className="text-ink-400"> — {fila.resuelta_por}</span>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
            estado.tono,
          )}
        >
          {estado.label}
        </span>
        {fila.requiere_justificacion && (
          <Button variant="outline" size="sm" onClick={onResolver}>
            {fila.estado === 'pendiente' ? 'Revisar' : 'Cambiar'}
          </Button>
        )}
      </div>
    </div>
  )
}

// --- Justificar / rechazar / reabrir -----------------------------------------

function ResolverModal({
  fila,
  abierto,
  onClose,
}: {
  fila: FilaInconsistencia | null
  abierto: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (abierto) setMotivo(fila?.motivo ?? '')
  }, [abierto, fila])

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['asistencia'] })

  const resolver = useMutation({
    mutationFn: (estado: EstadoInconsistencia) =>
      resolverInconsistencia({
        empleado: fila!.empleado!.id,
        fecha: fila!.fecha,
        tipo: fila!.tipo,
        estado,
        motivo: motivo.trim(),
      }),
    onSuccess: (_r, estado) => {
      invalidar()
      toast.success(
        estado === 'justificada' ? 'Justificada' : 'Marcada sin justificación',
        'Deja de figurar como pendiente.',
      )
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo guardar', e.message),
  })

  const reabrir = useMutation({
    mutationFn: () =>
      reabrirInconsistencia({
        empleado: fila!.empleado!.id,
        fecha: fila!.fecha,
        tipo: fila!.tipo,
      }),
    onSuccess: () => {
      invalidar()
      toast.success('Vuelve a estar pendiente')
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo reabrir', e.message),
  })

  if (!fila) return null

  const trabajando = resolver.isPending || reabrir.isPending
  const sinEmpleado = fila.empleado === null

  return (
    <Modal open={abierto} onClose={onClose} size="md">
      <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">{fila.tipo_display}</h3>
        <p className="mt-1 text-sm text-ink-500">
          {fila.nombre} · {etiquetaFecha(fila.fecha)}
          {fila.minutos > 0 && ` · ${duracion(fila.minutos)}`}
        </p>
        {fila.detalle && <p className="mt-2 text-sm text-ink-600">{fila.detalle}</p>}

        {sinEmpleado ? (
          <p className="mt-5 rounded-xl border border-line bg-ink-50 p-3 text-sm text-ink-600">
            Esta fichada todavía no está asignada a ningún empleado. Asignala en la pestaña
            Empleados y después vas a poder justificarla.
          </p>
        ) : (
          <>
            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                Motivo <span className="font-normal text-ink-400">(queda en el historial)</span>
              </label>
              <Textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Vino del médico con certificado, corte de calle, permiso acordado…"
              />
              <p className="mt-1 text-[11px] text-ink-400">
                Justificar necesita un motivo. Para dejar constancia de que el motivo no
                alcanza, usá «Sin justificación».
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              {fila.estado !== 'pendiente' ? (
                <Button
                  variant="ghost"
                  onClick={() => reabrir.mutate()}
                  disabled={trabajando}
                >
                  <Undo2 className="h-4 w-4" />
                  Volver a pendiente
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={onClose} disabled={trabajando}>
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => resolver.mutate('rechazada')}
                  disabled={trabajando}
                >
                  Sin justificación
                </Button>
                <Button
                  onClick={() => resolver.mutate('justificada')}
                  disabled={trabajando || motivo.trim() === ''}
                >
                  {resolver.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Justificar
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
