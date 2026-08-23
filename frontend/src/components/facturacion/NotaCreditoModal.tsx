import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FileMinus2, Info, PackageX, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Comprobante, MedioPagoComprobante } from '@/types'
import { MEDIOS_PAGO_CAJA } from '@/types'
import { emitirNotaCredito, obtenerComprobante } from '@/services/facturacion'
import { IVA_RATE, calcularTotales, nombreComprobante } from '@/lib/afip'
import { fecha as fechaCorta, money } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ToastProvider'

/**
 * Emitir la nota de crédito de una factura.
 *
 * Se abre SIEMPRE desde una factura (nunca "en blanco"), que es como funciona
 * fiscalmente: una nota de crédito acredita un comprobante concreto y hereda de
 * él la letra, el cliente y la alícuota. Por eso acá no se elige nada de eso:
 * sólo QUÉ se acredita, CUÁNDO, POR QUÉ y con qué se devuelve la plata.
 *
 * Dos caminos, en un paso:
 *  - **Total**: acredita la factura entera (o el saldo que quede, si ya tenía
 *    notas anteriores). Es un clic.
 *  - **Parcial**: se eligen los renglones y las cantidades a devolver.
 *
 * El total nunca puede pasarse del saldo sin acreditar: se avisa en pantalla y
 * el botón queda deshabilitado (el backend lo vuelve a chequear igual).
 */

/** Motivos frecuentes: rellenan el texto, que después se puede editar. */
const MOTIVOS = [
  'Devolución del producto',
  'Error en la factura',
  'Anulación de la operación',
  'Descuento acordado',
] as const

const OPCIONES_MEDIO = [
  { value: '', label: 'El mismo de la factura' },
  ...MEDIOS_PAGO_CAJA.map((m) => ({ value: m.value, label: m.label })),
]

interface Linea {
  key: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  /** Cantidad facturada originalmente: no se puede devolver más que eso. */
  cantidadOriginal: number
  incluida: boolean
}

/** Fecha de hoy en Argentina como `aaaa-mm-dd` (para el input date). */
function hoyInput(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return partes
}

export function NotaCreditoModal({
  facturaId,
  onClose,
  onEmitida,
}: {
  /** Factura a acreditar; `null` mantiene el modal cerrado. */
  facturaId: number | null
  onClose: () => void
  /** La nota ya emitida (con su CAE), para refrescar y mostrarla. */
  onEmitida: (nota: Comprobante) => void
}) {
  const toast = useToast()

  // El detalle completo (ítems + saldo acreditable). Comparte la clave con el
  // modal de detalle, así abrir uno y otro no vuelve a pedir lo mismo.
  const { data: factura, isLoading } = useQuery({
    queryKey: ['comprobante', facturaId],
    queryFn: () => obtenerComprobante(facturaId as number),
    enabled: facturaId != null,
  })

  const [modo, setModo] = useState<'total' | 'parcial'>('total')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [motivo, setMotivo] = useState('')
  const [fechaNota, setFechaNota] = useState(hoyInput())
  const [medioPago, setMedioPago] = useState<MedioPagoComprobante>('')

  const conIva = factura ? factura.tipo !== 'C' : false
  const total = Number(factura?.total ?? 0)
  const acreditado = Number(factura?.acreditado ?? 0)
  const saldo = Number(factura?.saldo_acreditable ?? 0)
  const parcialmenteAcreditada = acreditado > 0

  // Al abrir (o al cambiar de factura) se arranca de cero, con los renglones de
  // la factura precargados y todo tildado: el caso más común es devolver todo.
  useEffect(() => {
    if (!factura) return
    setModo('total')
    setMotivo('')
    setFechaNota(hoyInput())
    setMedioPago('')
    setLineas(
      (factura.items ?? []).map((it, i) => ({
        key: `nc-${it.id ?? i}`,
        descripcion: it.descripcion,
        cantidad: Number(it.cantidad),
        precioUnitario: Number(it.precio_unitario),
        cantidadOriginal: Number(it.cantidad),
        incluida: true,
      })),
    )
  }, [factura])

  /**
   * Los renglones que van a viajar.
   *
   * En modo total, si la factura ya tenía notas anteriores no se pueden mandar
   * los ítems originales (sumarían más que el saldo): va un único renglón por
   * el saldo restante. El precio se redondea PARA ABAJO para que el total con
   * IVA nunca se pase del saldo por un centavo de redondeo.
   */
  const itemsAEnviar = useMemo(() => {
    if (!factura) return []
    if (modo === 'total') {
      if (!parcialmenteAcreditada) {
        return lineas.map((l) => ({
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
        }))
      }
      const neto = conIva ? Math.floor((saldo / (1 + IVA_RATE)) * 100) / 100 : saldo
      return [{
        descripcion: `Saldo de la ${nombreComprobante('factura', factura.tipo)} ${factura.numero_formateado}`,
        cantidad: 1,
        precio_unitario: neto,
      }]
    }
    return lineas
      .filter((l) => l.incluida && l.cantidad > 0 && l.precioUnitario >= 0)
      .map((l) => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precio_unitario: l.precioUnitario,
      }))
  }, [factura, modo, lineas, parcialmenteAcreditada, conIva, saldo])

  const totales = useMemo(
    () =>
      calcularTotales(
        itemsAEnviar.map((i, n) => ({
          id: String(n),
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precioUnitario: i.precio_unitario,
        })),
        factura?.tipo ?? 'B',
      ),
    [itemsAEnviar, factura],
  )

  // Un centavo de tolerancia: el IVA se redondea, igual que en el backend.
  const sePasa = totales.total > saldo + 0.01
  const sinRenglones = itemsAEnviar.length === 0 || totales.total <= 0
  const fechaInvalida = Boolean(factura && fechaNota && fechaNota < factura.fecha)

  const emitir = useMutation({
    mutationFn: () =>
      emitirNotaCredito(factura!.id, {
        items: itemsAEnviar,
        fecha: fechaNota || undefined,
        observaciones: motivo.trim() || undefined,
        medio_pago: medioPago || undefined,
      }),
    onSuccess: (nota) => {
      toast.success(
        `Nota de crédito ${nota.tipo} emitida`,
        nota.cae ? `N° ${nota.numero_formateado} · CAE ${nota.cae}` : `Total ${money(nota.total)}`,
      )
      onEmitida(nota)
    },
    onError: (e: Error) => toast.error('No se pudo emitir la nota de crédito', e.message),
  })

  function actualizar(key: string, patch: Partial<Linea>) {
    setLineas((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  const puedeEmitir = Boolean(factura) && !sePasa && !sinRenglones && !fechaInvalida && !emitir.isPending

  return (
    <Modal open={facturaId != null} onClose={onClose} size="xl" labelledBy="titulo-nc">
      {isLoading || !factura ? (
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          {/* Cabecera */}
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-950 text-on-ink">
                <FileMinus2 className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <h2 id="titulo-nc" className="text-lg font-semibold leading-tight text-ink-950">
                  Nota de crédito {factura.tipo}
                </h2>
                <p className="truncate text-xs text-ink-400">
                  Acredita la {nombreComprobante('factura', factura.tipo)}{' '}
                  {factura.numero_formateado} · {factura.cliente_nombre}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 overflow-y-auto px-5 py-5">
            {/* Qué se está acreditando: la foto de la factura */}
            <section className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-3">
                <Resumen label="Factura" valor={`${factura.tipo} ${factura.numero_formateado}`} />
                <Resumen label="Emitida" valor={fechaCorta(factura.fecha)} />
                <Resumen label="Total de la factura" valor={money(total)} />
              </div>
              {parcialmenteAcreditada && (
                <div className="mt-3 grid gap-x-4 gap-y-2.5 border-t border-line pt-3 sm:grid-cols-3">
                  <Resumen label="Ya acreditado" valor={`− ${money(acreditado)}`} />
                  <Resumen label="Queda por acreditar" valor={money(saldo)} fuerte />
                  <div className="sm:col-span-1">
                    <Badge tone="outline">
                      {(factura.notas_credito ?? []).length} nota
                      {(factura.notas_credito ?? []).length === 1 ? '' : 's'} anterior
                      {(factura.notas_credito ?? []).length === 1 ? '' : 'es'}
                    </Badge>
                  </div>
                </div>
              )}
            </section>

            {/* Cuánto se acredita */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                Cuánto se acredita
              </h3>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <OpcionModo
                  activa={modo === 'total'}
                  titulo={parcialmenteAcreditada ? 'Todo el saldo' : 'Toda la factura'}
                  ayuda={
                    parcialmenteAcreditada
                      ? `Acredita los ${money(saldo)} que quedan sin acreditar.`
                      : 'Anula la factura completa: se acreditan todos los renglones.'
                  }
                  monto={parcialmenteAcreditada ? saldo : total}
                  onClick={() => setModo('total')}
                />
                <OpcionModo
                  activa={modo === 'parcial'}
                  titulo="Una parte"
                  ayuda="Elegí qué renglones y qué cantidades devolver."
                  onClick={() => setModo('parcial')}
                />
              </div>

              {modo === 'parcial' && (
                <div className="space-y-2.5 rounded-2xl border border-line p-3 sm:p-4">
                  <p className="text-xs leading-relaxed text-ink-500">
                    Destildá lo que no se devuelve y ajustá las cantidades. El importe se
                    recalcula solo.
                  </p>
                  {lineas.map((l) => (
                    <div
                      key={l.key}
                      className={cn(
                        'rounded-xl border p-3 transition-colors',
                        l.incluida ? 'border-line-strong bg-surface' : 'border-line bg-ink-50/60',
                      )}
                    >
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={l.incluida}
                          onChange={(e) => actualizar(l.key, { incluida: e.target.checked })}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-ink-950"
                        />
                        <span
                          className={cn(
                            'min-w-0 flex-1 text-sm font-medium',
                            l.incluida ? 'text-ink-900' : 'text-ink-400 line-through',
                          )}
                        >
                          {l.descripcion}
                        </span>
                      </label>
                      {l.incluida && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
                          <label className="flex items-center gap-1.5 text-xs text-ink-400">
                            Cant.
                            <Input
                              type="number"
                              min={0}
                              max={l.cantidadOriginal}
                              step="1"
                              value={l.cantidad}
                              onChange={(e) =>
                                actualizar(l.key, {
                                  cantidad: Math.min(
                                    Math.max(Number(e.target.value) || 0, 0),
                                    l.cantidadOriginal,
                                  ),
                                })
                              }
                              className="h-9 w-20 px-2 text-center"
                            />
                            <span className="text-ink-300">de {l.cantidadOriginal}</span>
                          </label>
                          <label className="flex min-w-[9rem] flex-1 items-center gap-1.5 text-xs text-ink-400">
                            P. unit. {conIva ? '(neto)' : ''}
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.precioUnitario}
                              onChange={(e) =>
                                actualizar(l.key, {
                                  precioUnitario: Math.max(Number(e.target.value) || 0, 0),
                                })
                              }
                              className="h-9"
                            />
                          </label>
                          <span className="tnum ml-auto w-28 text-right text-sm font-semibold text-ink-900">
                            {money(l.cantidad * l.precioUnitario)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sePasa && (
                <Aviso tono="alerta" icono={AlertTriangle}>
                  <strong className="text-ink-950">El importe se pasa del saldo.</strong> Podés
                  acreditar hasta {money(saldo)} y esta nota suma {money(totales.total)}.
                </Aviso>
              )}
              {sinRenglones && !sePasa && (
                <Aviso tono="neutro" icono={Info}>
                  Elegí al menos un renglón con cantidad e importe para poder emitir.
                </Aviso>
              )}
            </section>

            {/* Motivo, fecha y devolución */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                Motivo y datos
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMotivo(m)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                      motivo === m
                        ? 'border-ink-950 bg-ink-950 text-on-ink'
                        : 'border-line-strong text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Por qué se acredita (sale impreso en el comprobante)"
                rows={2}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">
                    Fecha de la nota
                  </label>
                  <Input
                    type="date"
                    value={fechaNota}
                    min={factura.fecha}
                    onChange={(e) => setFechaNota(e.target.value)}
                  />
                  {fechaInvalida && (
                    <p className="mt-1.5 text-xs text-ink-600">
                      No puede ser anterior a la factura ({fechaCorta(factura.fecha)}).
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">
                    La plata se devuelve con
                  </label>
                  <Select
                    options={OPCIONES_MEDIO}
                    value={medioPago}
                    onChange={(v) => setMedioPago(v as MedioPagoComprobante)}
                  />
                </div>
              </div>
            </section>

            {/* Qué NO hace, dicho antes de emitir */}
            <Aviso tono="neutro" icono={PackageX}>
              La nota de crédito <strong className="text-ink-900">no toca el stock</strong>: si el
              producto volvió, cargá el ingreso desde Inventario. Tampoco borra la factura, que
              sigue existiendo en ARCA.
            </Aviso>

            {/* Totales */}
            <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
              {conIva && (
                <>
                  <Linea label="Neto" value={money(totales.neto)} />
                  <Linea label={`IVA (${Math.round(IVA_RATE * 100)}%)`} value={money(totales.iva)} />
                </>
              )}
              <div className="flex items-center justify-between border-t border-line pt-2 text-base font-semibold text-ink-950">
                <span>Se acredita</span>
                <span className="tnum">{money(totales.total)}</span>
              </div>
            </div>
          </div>

          {/* Pie */}
          <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-400">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Se emite en ARCA con CAE propio, como cualquier comprobante.{' '}
                <strong className="font-medium text-ink-600">No se puede deshacer.</strong>
              </span>
            </p>
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => emitir.mutate()} disabled={!puedeEmitir}>
                {emitir.isPending
                  ? 'Emitiendo…'
                  : `Emitir nota de crédito ${factura.tipo}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}

// ===== Piezas de UI =====

/** Una de las dos formas de acreditar: tarjeta grande, cómoda en el celular. */
function OpcionModo({
  activa,
  titulo,
  ayuda,
  monto,
  onClick,
}: {
  activa: boolean
  titulo: string
  ayuda: string
  monto?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        'rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
        activa
          ? 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_10px_30px_rgba(10,10,11,0.18)]'
          : 'border-line bg-surface hover:border-ink-300 hover:bg-ink-50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-sm font-semibold', activa ? 'text-on-ink' : 'text-ink-900')}>
          {titulo}
        </span>
        {monto != null && (
          <span className={cn('tnum text-sm font-semibold', activa ? 'text-on-ink' : 'text-ink-700')}>
            {money(monto)}
          </span>
        )}
      </div>
      <p className={cn('mt-1 text-xs leading-relaxed', activa ? 'text-on-ink/70' : 'text-ink-400')}>
        {ayuda}
      </p>
    </button>
  )
}

function Resumen({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.1em] text-ink-400">{label}</p>
      <p
        className={cn(
          'tnum mt-0.5 truncate text-sm',
          fuerte ? 'font-semibold text-ink-950' : 'text-ink-800',
        )}
      >
        {valor}
      </p>
    </div>
  )
}

function Aviso({
  tono,
  icono: Icono,
  children,
}: {
  tono: 'alerta' | 'neutro'
  icono: typeof Info
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs leading-relaxed',
        tono === 'alerta'
          ? 'border border-ink-950 bg-ink-50 text-ink-800'
          : 'border border-line bg-ink-50 text-ink-600',
      )}
    >
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

function Linea({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-ink-500">
      <span>{label}</span>
      <span className="tnum text-ink-800">{value}</span>
    </div>
  )
}
