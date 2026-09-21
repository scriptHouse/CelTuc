import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ListChecks, LoaderCircle, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CajaConfig } from '@/types'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import { guardarConfigCaja, obtenerConfigCaja } from '@/services/caja'
import { ConfigCierre } from '@/components/caja/config/ConfigCierre'
import { ConfigCajas } from '@/components/caja/config/ConfigCajas'

/**
 * Configuración del módulo Caja (solo administradores), en dos pestañas:
 *  - «Cierre de caja»: cómo es el cierre, ordenado igual que sus pasos.
 *  - «Cajas y sucursales»: retiros, varias cajas, caja por sucursal y la lista.
 *
 * Cada opción explica qué hace con palabras simples. Los cambios se guardan
 * solos y se ven al instante (si el servidor dice que no, vuelven atrás).
 */

type Pestana = 'cierre' | 'cajas'

const PESTANAS: Array<{ id: Pestana; titulo: string; corto: string; icono: LucideIcon }> = [
  { id: 'cierre', titulo: 'Cierre de caja', corto: 'El cierre', icono: ListChecks },
  { id: 'cajas', titulo: 'Cajas y sucursales', corto: 'Las cajas', icono: Wallet },
]

const CLAVE_CONFIG = ['caja', 'config']

export function CajaManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: config } = useQuery({ queryKey: CLAVE_CONFIG, queryFn: obtenerConfigCaja })
  const [pestana, setPestana] = useState<Pestana>('cierre')
  const cuerpo = useRef<HTMLDivElement>(null)

  // «Guardado» se muestra un rato después de cada cambio que salió bien.
  const [recienGuardado, setRecienGuardado] = useState(false)
  useEffect(() => {
    if (!recienGuardado) return
    const t = setTimeout(() => setRecienGuardado(false), 2200)
    return () => clearTimeout(t)
  }, [recienGuardado])

  const guardar = useMutation({
    mutationFn: (input: Partial<CajaConfig>) => guardarConfigCaja(input),
    // Se ve al instante; si el servidor lo rechaza, vuelve a como estaba.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: CLAVE_CONFIG })
      const previa = queryClient.getQueryData<CajaConfig>(CLAVE_CONFIG)
      if (previa) queryClient.setQueryData<CajaConfig>(CLAVE_CONFIG, { ...previa, ...input })
      return { previa }
    },
    onError: (e: Error, _input, contexto) => {
      if (contexto?.previa) queryClient.setQueryData(CLAVE_CONFIG, contexto.previa)
      toast.error('No se pudo guardar', e.message)
    },
    onSuccess: () => setRecienGuardado(true),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['caja'] }),
  })

  function cambiarPestana(nueva: Pestana) {
    setPestana(nueva)
    cuerpo.current?.scrollTo({ top: 0 })
  }

  if (!config) return null

  const set = (input: Partial<CajaConfig>) => guardar.mutate(input)

  return (
    <Modal open={open} onClose={onClose} size="xl" labelledBy="config-caja-titulo">
      <div className="shrink-0 border-b border-line px-5 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="config-caja-titulo" className="text-lg font-semibold text-ink-950">
              Configurar la caja
            </h2>
            <p className="mt-0.5 text-pretty text-xs leading-relaxed text-ink-500">
              Elegí cómo trabaja tu caja. Cada opción explica qué hace. Los cambios se guardan solos.
            </p>
          </div>
          <EstadoGuardado guardando={guardar.isPending} guardado={recienGuardado} />
        </div>

        <div
          role="tablist"
          aria-label="Partes de la configuración"
          className="mt-3.5 grid grid-cols-2 gap-1 rounded-2xl bg-ink-100 p-1"
        >
          {PESTANAS.map((p) => {
            const activa = p.id === pestana
            const Icono = p.icono
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`config-caja-tab-${p.id}`}
                aria-selected={activa}
                aria-controls="config-caja-panel"
                onClick={() => cambiarPestana(p.id)}
                className={cn(
                  'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                  activa
                    ? 'bg-surface text-ink-950 shadow-[0_2px_8px_rgba(10,10,11,0.1)]'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                <Icono className="h-4 w-4 shrink-0" strokeWidth={1.85} aria-hidden />
                <span className="truncate sm:hidden">{p.corto}</span>
                <span className="hidden truncate sm:inline">{p.titulo}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div
        ref={cuerpo}
        id="config-caja-panel"
        role="tabpanel"
        aria-labelledby={`config-caja-tab-${pestana}`}
        className="overflow-y-auto px-4 py-4 sm:px-5 sm:py-5"
      >
        {pestana === 'cierre' ? (
          <ConfigCierre config={config} guardar={set} />
        ) : (
          <ConfigCajas open={open} config={config} guardar={set} />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-5 py-3.5">
        <p className="text-xs text-ink-400">Solo los administradores ven esta pantalla.</p>
        <Button onClick={onClose}>Listo</Button>
      </div>
    </Modal>
  )
}

/** «Guardando…» / «Guardado» junto al título, para saber que el cambio quedó. */
function EstadoGuardado({ guardando, guardado }: { guardando: boolean; guardado: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.7rem] font-semibold transition-all duration-200',
        guardando
          ? 'bg-ink-100 text-ink-600'
          : guardado
            ? 'bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/25 dark:text-emerald-400'
            : 'text-ink-400',
      )}
    >
      {guardando ? (
        <>
          <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          Guardando…
        </>
      ) : guardado ? (
        <>
          <Check className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
          Guardado
        </>
      ) : (
        'Se guarda solo'
      )}
    </span>
  )
}
