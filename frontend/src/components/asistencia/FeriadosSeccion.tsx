import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Loader2, PartyPopper, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { FeriadoAsistencia, TipoFeriado } from '@/types'
import {
  actualizarFeriado,
  crearFeriado,
  eliminarFeriado,
  listarFeriados,
  sembrarFeriados,
} from '@/services/asistencia'
import { listarSucursales } from '@/services/sucursales'
import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { TIPOS_FERIADO, etiquetaFecha, fechaLocalISO } from '@/components/asistencia/constantes'
import { cn, ctStagger } from '@/lib/utils'

const TONO_TIPO: Record<TipoFeriado, string> = {
  nacional:
    'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
  provincial:
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300',
  puente: 'border-line bg-ink-50 text-ink-700',
  propio: 'border-line bg-ink-50 text-ink-700',
}

/**
 * Sin feriados cargados, cada feriado aparece como una ausencia de todo el
 * equipo. Esta sección es la que evita ese ruido.
 */
export function FeriadosSeccion() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const anioActual = new Date().getFullYear()
  const [anio, setAnio] = useState(String(anioActual))
  const [editando, setEditando] = useState<FeriadoAsistencia | null | 'nuevo'>(null)

  const { data: feriados = [], isLoading } = useQuery({
    queryKey: ['asistencia', 'feriados', anio],
    queryFn: () => listarFeriados({ anio: Number(anio) }),
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['asistencia'] })

  const sembrar = useMutation({
    mutationFn: () => sembrarFeriados(Number(anio)),
    onSuccess: (r) => {
      invalidar()
      if (r.creados === 0) {
        toast.info('Ya estaban cargados', 'No se agregó ninguno nuevo.')
      } else {
        toast.success(
          `${r.creados} feriados cargados`,
          'Faltan los trasladables (Carnaval, Viernes Santo, 17/8, 12/10 y 20/11): esos se cargan a mano.',
        )
      }
    },
    onError: (e: Error) => toast.error('No se pudieron cargar', e.message),
  })

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarFeriado(id),
    onSuccess: () => {
      invalidar()
      toast.success('Feriado eliminado', 'Ese día vuelve a contarse como jornada normal.')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  const anios = [anioActual - 1, anioActual, anioActual + 1].map((a) => ({
    value: String(a),
    label: String(a),
  }))

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Feriados</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-28">
            <Select value={anio} onChange={setAnio} options={anios} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sembrar.mutate()}
            disabled={sembrar.isPending}
          >
            {sembrar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Cargar nacionales {anio}
          </Button>
          <Button size="sm" onClick={() => setEditando('nuevo')}>
            <Plus className="h-4 w-4" />
            Nuevo feriado
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : feriados.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title={`Sin feriados cargados para ${anio}`}
          description="Sin esto, cada feriado va a figurar como ausencia de todo el equipo. Con «Cargar nacionales» se agregan de una los de fecha fija."
          action={
            <Button onClick={() => sembrar.mutate()} disabled={sembrar.isPending}>
              <Sparkles className="h-4 w-4" />
              Cargar nacionales {anio}
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {feriados.map((f, i) => (
              <li
                key={f.id}
                className="ct-stagger-fade flex items-center gap-3 px-4 py-2.5"
                style={ctStagger(i)}
              >
                <CalendarPlus className="h-4 w-4 shrink-0 text-ink-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-950">{f.nombre}</p>
                  <p className="tnum text-xs text-ink-400">
                    {etiquetaFecha(f.fecha)}
                    {f.sucursal_nombre ? ` · solo ${f.sucursal_nombre}` : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'hidden shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium sm:inline-flex',
                    TONO_TIPO[f.tipo],
                  )}
                >
                  {f.tipo_display}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${f.nombre}`}
                  onClick={() => setEditando(f)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${f.nombre}`}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `¿Eliminar «${f.nombre}»?`,
                      description: 'Ese día vuelve a contarse como jornada normal.',
                      confirmLabel: 'Eliminar',
                      tone: 'danger',
                    })
                    if (ok === true) borrar.mutate(f.id)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FeriadoModal
        feriado={editando === 'nuevo' ? null : editando}
        abierto={editando !== null}
        onClose={() => setEditando(null)}
      />
    </section>
  )
}

function FeriadoModal({
  feriado,
  abierto,
  onClose,
}: {
  feriado: FeriadoAsistencia | null
  abierto: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [fecha, setFecha] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoFeriado>('nacional')
  const [sucursal, setSucursal] = useState('')

  const { data: sucursales = [] } = useQuery({
    queryKey: ['sucursales'],
    queryFn: listarSucursales,
    enabled: abierto,
  })

  useEffect(() => {
    if (!abierto) return
    setFecha(feriado?.fecha ?? fechaLocalISO(new Date()))
    setNombre(feriado?.nombre ?? '')
    setTipo(feriado?.tipo ?? 'nacional')
    setSucursal(feriado?.sucursal ? String(feriado.sucursal) : '')
  }, [abierto, feriado])

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        fecha,
        nombre: nombre.trim(),
        tipo,
        sucursal: sucursal ? Number(sucursal) : null,
      }
      return feriado ? actualizarFeriado(feriado.id, cuerpo) : crearFeriado(cuerpo)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success(feriado ? 'Feriado actualizado' : 'Feriado cargado')
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo guardar', e.message),
  })

  const valido = fecha !== '' && nombre.trim() !== ''

  return (
    <Modal open={abierto} onClose={onClose} size="md">
      <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">
          {feriado ? 'Editar feriado' : 'Nuevo feriado'}
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Ese día no se espera a nadie. Si igual se trabaja, queda registrado como trabajo en
          feriado.
        </p>

        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Fecha</label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="tnum"
              />
            </div>
            <Select
              label="Tipo"
              value={tipo}
              onChange={(v) => setTipo(v as TipoFeriado)}
              options={TIPOS_FERIADO}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Nombre</label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Día de la Revolución de Mayo"
            />
          </div>
          <Select
            label="Alcance"
            placeholder="Todas las sucursales"
            value={sucursal}
            onChange={setSucursal}
            options={[
              { value: '', label: 'Todas las sucursales' },
              ...sucursales.map((s) => ({ value: String(s.id), label: `Solo ${s.nombre}` })),
            ]}
          />
          <p className="text-xs text-ink-400">
            Usá el alcance por sucursal para los feriados provinciales: Salta y Tucumán no siempre
            coinciden.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {feriado ? 'Guardar cambios' : 'Cargar feriado'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
