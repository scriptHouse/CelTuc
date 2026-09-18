import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Gauge } from 'lucide-react'
import type { Comprobante } from '@/types'
import {
  emitirComprobante,
  type LimiteExcedido,
  type NuevoComprobante,
} from '@/services/facturacion'
import { ApiError } from '@/lib/api'
import { money } from '@/lib/format'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * Emitir una factura contra ARCA: la MISMA lógica que usa Facturación, extraída
 * tal cual para que Caja pueda emitir desde su propio modal sin repetirla.
 *
 * Incluye lo que hace falta alrededor del CAE: refrescar lo que se ve
 * (comprobantes, tope mensual, panel, stock), el aviso de stock que no se pudo
 * descontar y el 409 del tope mensual, que pregunta y reintenta con
 * `confirmar_limite`. Lo propio de cada pantalla (cerrar su modal, abrir el
 * detalle) va en `onEmitida`.
 */
export function useEmitirFactura({ onEmitida }: { onEmitida?: (c: Comprobante) => void } = {}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const invalidarComprobantes = () => {
    queryClient.invalidateQueries({ queryKey: ['comprobantes'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['fact-limites'] })
    // El resumen del mes que exporta el Studio: sin esto, emitir una factura y
    // abrir «Exportar facturación» dentro del minuto siguiente bajaría el Excel
    // sin esa factura (la query tiene staleTime).
    queryClient.invalidateQueries({ queryKey: ['fact-resumen'] })
  }

  const emitirMut = useMutation({
    mutationFn: (input: NuevoComprobante) => emitirComprobante(input),
    onSuccess: (c) => {
      invalidarComprobantes()
      queryClient.invalidateQueries({ queryKey: ['inv-stock'] })
      queryClient.invalidateQueries({ queryKey: ['inv-movimientos'] })
      toast.success(`Factura ${c.tipo} emitida`, c.cae ? `CAE ${c.cae}` : `Total ${money(c.total)}`)
      // La factura salió igual: esto es solo lo que NO se pudo descontar.
      if (c.avisos_stock?.length) toast.info('Stock sin descontar', c.avisos_stock.join(' '))
      onEmitida?.(c)
    },
    onError: async (e: Error, variables) => {
      // El backend avisa (409) ANTES de pedir el CAE si el mes queda pasado del
      // tope. Se muestra el detalle y, si el usuario confirma, se emite igual.
      const aviso = e instanceof ApiError && e.status === 409
        ? (e.data as Partial<LimiteExcedido> | null)
        : null
      if (aviso?.codigo === 'limite_mensual_excedido') {
        const ok = await confirm({
          title: `Se supera el límite de ${aviso.mes_nombre ?? 'este mes'}`,
          tone: 'warning',
          icon: Gauge,
          confirmLabel: 'Emitir de todas formas',
          cancelLabel: 'No emitir',
          description: (
            <span className="block space-y-2.5">
              <span className="block">
                Esta factura pasa el <strong>límite de facturación mensual</strong> configurado
                para la cuenta.
              </span>
              <span className="block space-y-1 rounded-xl bg-ink-50 px-3.5 py-2.5 text-left">
                <span className="flex items-center justify-between gap-3">
                  <span>Límite de {aviso.mes_nombre ?? 'el mes'}</span>
                  <span className="tnum font-medium text-ink-900">{money(aviso.limite ?? 0)}</span>
                </span>
                <span className="flex items-center justify-between gap-3">
                  <span>Ya facturado</span>
                  <span className="tnum font-medium text-ink-900">{money(aviso.facturado ?? 0)}</span>
                </span>
                <span className="flex items-center justify-between gap-3">
                  <span>Esta factura</span>
                  <span className="tnum font-medium text-ink-900">{money(aviso.total_factura ?? 0)}</span>
                </span>
                <span className="flex items-center justify-between gap-3 border-t border-line pt-1.5 font-semibold text-ink-950">
                  <span>Se pasa por</span>
                  <span className="tnum">{money(aviso.excedente ?? 0)}</span>
                </span>
              </span>
              <span className="block">¿Querés emitirla de todas formas?</span>
            </span>
          ),
        })
        if (ok) emitirMut.mutate({ ...variables, confirmar_limite: true })
        return
      }
      toast.error('No se pudo emitir', e.message)
    },
  })

  return emitirMut
}
