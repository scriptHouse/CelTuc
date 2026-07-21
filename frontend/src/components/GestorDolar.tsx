import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, DollarSign, Loader2, RefreshCw, TrendingUp } from 'lucide-react'
import {
  actualizarConfiguracion,
  obtenerConfiguracion,
  obtenerDolarBlue,
} from '@/services/preciosService'
import { ApiError } from '@/lib/api'
import { money0, tiempoRelativo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ToastProvider'

/**
 * Gestor de dólar: muestra lado a lado el DÓLAR DEL NEGOCIO (el configurado,
 * con el que se calculan todas las listas) y el DÓLAR BLUE de DolarAPI como
 * referencia de mercado, con la diferencia entre ambos.
 *
 * El del negocio se edita acá mismo (y recalcula Service + Productos al
 * guardar). El blue es SOLO LECTURA: nunca pisa el configurado — el margen
 * cambiario es una decisión comercial.
 *
 * Con `soloDolarNegocio` se muestra ÚNICAMENTE el dólar vigente del negocio
 * (sin el blue de DolarAPI ni la comparación): es lo que ven los empleados en
 * el Panel — el valor que se usa, sin datos de mercado.
 */
export function GestorDolar({
  soloLectura = false,
  soloDolarNegocio = false,
}: {
  soloLectura?: boolean
  soloDolarNegocio?: boolean
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: config, isError: errorConfig } = useQuery({
    queryKey: ['service-config'],
    queryFn: obtenerConfiguracion,
    retry: false,
  })
  const {
    data: blue,
    isLoading: cargandoBlue,
    isError: errorBlue,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['dolar-blue'],
    queryFn: obtenerDolarBlue,
    staleTime: 120_000, // el backend ya cachea 2 min
    retry: 1,
    enabled: !soloDolarNegocio, // el modo restringido ni consulta DolarAPI
  })

  const [valor, setValor] = useState('')
  useEffect(() => {
    if (config) setValor(String(Number(config.dolar)))
  }, [config])

  const sucio = config !== undefined && valor.trim() !== String(Number(config.dolar))

  const guardar = useMutation({
    mutationFn: () => {
      const dolar = Number(valor.trim().replace(',', '.'))
      if (!Number.isFinite(dolar) || dolar <= 0) {
        throw new ApiError(0, 'Poné un dólar válido (ej: 1550).', null)
      }
      return actualizarConfiguracion({ dolar })
    },
    onSuccess: () => {
      toast.success('Dólar del negocio actualizado', 'Service y Productos quedaron recalculados.')
      queryClient.invalidateQueries({ queryKey: ['service-config'] })
      queryClient.invalidateQueries({ queryKey: ['service-secciones'] })
      queryClient.invalidateQueries({ queryKey: ['productos-config'] })
      queryClient.invalidateQueries({ queryKey: ['productos-items'] })
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  // Sin permiso para leer la configuración (ej: cuenta sin acceso a Service),
  // el gestor directamente no se muestra.
  if (errorConfig) return null

  const venta = blue?.venta != null ? Number(blue.venta) : null
  const diferencia = config && venta !== null ? Number(config.dolar) - venta : null
  const porcentaje =
    diferencia !== null && venta ? ((diferencia / venta) * 100).toFixed(1).replace('.', ',') : null

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <p className="border-b border-line px-4 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
        Gestor de dólar
      </p>

      <div className={cn('grid', !soloDolarNegocio && 'sm:grid-cols-2')}>
        {/* ===== Dólar del negocio (editable) ===== */}
        <div className="p-4">
          <p className="mb-1 flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
            <DollarSign className="h-3.5 w-3.5" aria-hidden />
            Dólar del negocio
          </p>
          {config ? (
            <>
              <p className="tnum text-2xl font-bold tracking-tight text-ink-950">
                {money0(Number(config.dolar))}
              </p>
              <p className="mt-0.5 text-[0.7rem] leading-snug text-ink-400">
                Con este se calculan TODAS las listas (Service y Productos).
              </p>
              {!soloLectura && (
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="relative w-28">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                      $
                    </span>
                    <Input
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      inputMode="decimal"
                      aria-label="Nuevo dólar del negocio"
                      className="tnum h-10 pl-6 pr-2 text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => guardar.mutate()}
                    disabled={!sucio || guardar.isPending}
                  >
                    {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
        </div>

        {/* ===== Dólar blue (solo lectura; oculto en el modo restringido) ===== */}
        {!soloDolarNegocio && (
        <div className="border-t border-line bg-canvas/40 p-4 sm:border-l sm:border-t-0">
          <p className="mb-1 flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            Dólar blue · DolarAPI
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Actualizar cotización del dólar blue"
              className="ml-auto grid h-6 w-6 place-items-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            </button>
          </p>
          {cargandoBlue ? (
            <Skeleton className="h-20 w-full" />
          ) : errorBlue || venta === null ? (
            <p className="py-4 text-sm text-ink-400">
              No disponible — DolarAPI no respondió y todavía no hay una cotización guardada.
              Probá refrescar en un rato.
            </p>
          ) : (
            <>
              <p className="tnum text-2xl font-bold tracking-tight text-ink-950">
                {money0(venta)} <span className="text-sm font-medium text-ink-400">venta</span>
              </p>
              <p className="tnum mt-0.5 text-xs text-ink-500">
                compra {money0(Number(blue!.compra))} · actualizado {tiempoRelativo(blue!.fecha)}
              </p>
              {blue!.desactualizado ? (
                <p className="mt-2 flex items-start gap-1.5 text-[0.7rem] font-medium leading-snug text-ink-600">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    DolarAPI no responde ahora: esta es la última cotización que quedó guardada
                    ({tiempoRelativo(blue!.guardado ?? blue!.fecha)}).
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-[0.7rem] leading-snug text-ink-400">
                  Solo referencia de mercado — no modifica el dólar del negocio.
                </p>
              )}
            </>
          )}
        </div>
        )}
      </div>

      {/* ===== Comparación (oculta en el modo restringido) ===== */}
      {!soloDolarNegocio && diferencia !== null && (
        <p className="tnum border-t border-line px-4 py-2 text-xs text-ink-500">
          Tu dólar está{' '}
          <b className="text-ink-900">
            {money0(Math.abs(diferencia))} ({porcentaje} %)
          </b>{' '}
          {diferencia >= 0 ? 'por encima' : 'por debajo'} de la venta blue.
        </p>
      )}
    </div>
  )
}
