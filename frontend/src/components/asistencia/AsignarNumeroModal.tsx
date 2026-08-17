import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import type { MapeoAsistencia } from '@/types'
import { actualizarMapeo, crearMapeo, listarRelojes } from '@/services/asistencia'
import { listarEmpleados } from '@/services/empleados'
import { useToast } from '@/components/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'

export interface DatosAsignacion {
  /** Mapeo existente para editar, o null para crear. */
  mapeo?: MapeoAsistencia | null
  numero?: string
  dispositivoId?: number | null
}

/**
 * Asigna un número del reloj a un empleado del sistema. Al guardar, el backend
 * reasigna retroactivamente todas las fichadas que ya llegaron con ese número.
 */
export function AsignarNumeroModal({
  datos,
  onClose,
}: {
  datos: DatosAsignacion | null
  onClose: () => void
}) {
  const abierto = datos !== null
  const queryClient = useQueryClient()
  const toast = useToast()

  const [numero, setNumero] = useState('')
  const [empleado, setEmpleado] = useState('')
  const [alcance, setAlcance] = useState('')

  useEffect(() => {
    if (!abierto) return
    setNumero(datos?.mapeo?.numero_reloj ?? datos?.numero ?? '')
    setEmpleado(datos?.mapeo ? String(datos.mapeo.empleado) : '')
    const dispositivo = datos?.mapeo ? datos.mapeo.dispositivo : datos?.dispositivoId
    setAlcance(dispositivo ? String(dispositivo) : '')
  }, [abierto, datos])

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: listarEmpleados,
    enabled: abierto,
  })
  const { data: relojes = [] } = useQuery({
    queryKey: ['asistencia', 'relojes'],
    queryFn: listarRelojes,
    enabled: abierto,
  })

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        numero_reloj: numero.trim(),
        empleado: Number(empleado),
        dispositivo: alcance ? Number(alcance) : null,
      }
      return datos?.mapeo ? actualizarMapeo(datos.mapeo.id, cuerpo) : crearMapeo(cuerpo)
    },
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      const aplicadas = resultado.fichadas_actualizadas ?? 0
      toast.success(
        'Número asignado',
        aplicadas > 0
          ? `${resultado.empleado_nombre} quedó vinculado y se actualizaron ${aplicadas} fichadas anteriores.`
          : `${resultado.empleado_nombre} quedó vinculado al número ${resultado.numero_reloj}.`,
      )
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo asignar', e.message),
  })

  const valido = numero.trim() !== '' && empleado !== ''

  return (
    <Modal open={abierto} onClose={onClose} size="md">
      <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">
          {datos?.mapeo ? 'Editar asignación' : 'Asignar número a un empleado'}
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Las fichadas que ya llegaron con este número se reasignan automáticamente.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Número en el reloj
            </label>
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Ej: 145"
              className="tnum"
            />
          </div>
          <Select
            label="Empleado"
            placeholder="Elegir empleado…"
            searchable
            value={empleado}
            onChange={setEmpleado}
            options={empleados.map((e) => ({ value: String(e.id), label: e.nombre_completo }))}
          />
          <Select
            label="Alcance"
            placeholder="Todos los relojes"
            value={alcance}
            onChange={setAlcance}
            options={[
              { value: '', label: 'Todos los relojes' },
              ...relojes.map((r) => ({
                value: String(r.id),
                label: `Solo ${r.nombre} · ${r.sucursal_nombre}`,
              })),
            ]}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {datos?.mapeo ? 'Guardar' : 'Asignar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
