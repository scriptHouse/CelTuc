import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  History,
  Loader2,
  Lock,
  PackageSearch,
  RotateCcw,
  ShieldCheck,
  Store,
  Trash2,
  X,
} from 'lucide-react'
import type { ProductoCatalogo } from '@/types'
import {
  PALABRA_BORRAR,
  detalleVaciado,
  listarVaciados,
  restaurarVaciado,
  vaciarStock,
  type ModoRestauracion,
  type ResultadoRestauracion,
  type StockRow,
  type Sucursal,
  type VaciadoStock,
} from '@/services/inventario'
import { ApiError } from '@/lib/api'
import { fechaHora, money0, moneyCompact, num, tiempoRelativo } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ToastProvider'

/**
 * Borrar el stock por sucursal — con red de seguridad.
 *
 * Tres actos, como el resto de las operaciones fuertes del sistema:
 * **Elegir** las sucursales → **Revisar** exactamente qué se va a borrar →
 * **Confirmar** escribiendo la palabra. Recién ahí las cantidades se ponen en
 * cero, y siempre después de guardar un respaldo completo (producto por
 * producto) que solo el superadministrador puede restaurar.
 *
 * La regla que ordena todo: **borrar stock no borra el catálogo**. Los
 * productos, sus precios y las demás sucursales quedan intactos; lo único que
 * cambia son las cantidades de los locales elegidos.
 */

type Paso = 1 | 2 | 3 | 'listo'
type Solapa = 'borrar' | 'respaldos'

const PASOS: Array<{ id: 1 | 2 | 3; label: string }> = [
  { id: 1, label: 'Sucursales' },
  { id: 2, label: 'Revisión' },
  { id: 3, label: 'Confirmar' },
]

/** Identidad del borrado: rojo sobrio, legible en claro y en oscuro. */
const TINTA_PELIGRO = 'text-red-700 dark:text-red-400'
const PANEL_PELIGRO = 'rounded-2xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3.5'
const BOTON_PELIGRO =
  'bg-red-600 text-white hover:bg-red-700 active:bg-red-700 focus-visible:ring-red-600'

/** "Solar YB", "Solar YB y Salta", "Solar YB, Salta y Centro". */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * Plata para las tarjetas chicas: compacta cuando es grande ($ 120,1 M) y
 * exacta cuando entra. En el celular las tres tarjetas van en un renglón y un
 * total de ocho cifras no entra sin cortarse.
 */
function plata(valor: number): string {
  return valor >= 1_000_000 ? moneyCompact(valor) : money0(valor)
}

export function VaciarStockModal({
  abierto,
  sucursales,
  productos,
  stock,
  esSuper,
  sucursalInicial,
  onCerrar,
  onVaciado,
  onRestaurado,
}: {
  abierto: boolean
  /** Las sucursales activas, en el orden de la pantalla. */
  sucursales: Sucursal[]
  /** El catálogo, para poner nombre y precio a lo que se está por borrar. */
  productos: ProductoCatalogo[]
  /** Todas las filas de stock (las mismas que muestra Inventario). */
  stock: StockRow[]
  /** Solo el superadministrador puede restaurar un respaldo. */
  esSuper: boolean
  /** La sucursal seleccionada en la pantalla, si hay una (viene marcada). */
  sucursalInicial: number | null
  onCerrar: () => void
  onVaciado: (vaciado: VaciadoStock) => void
  onRestaurado: (resultado: ResultadoRestauracion) => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [solapa, setSolapa] = useState<Solapa>('borrar')
  const [paso, setPaso] = useState<Paso>(1)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [elegidas, setElegidas] = useState<number[]>([])
  const [motivo, setMotivo] = useState('')
  const [palabra, setPalabra] = useState('')
  const [resultado, setResultado] = useState<VaciadoStock | null>(null)
  /** Respaldo abierto en el panel de restauración (null = lista). */
  const [mirando, setMirando] = useState<VaciadoStock | null>(null)
  const [modo, setModo] = useState<ModoRestauracion>('reemplazar')

  // ---- Índices del catálogo ----
  const listaDe = useMemo(() => {
    const mapa = new Map<number, number>()
    for (const p of productos) {
      const lista = p.efectivo?.lista_ars
      if (lista != null) mapa.set(p.id, Number(lista))
    }
    return mapa
  }, [productos])

  const nombreDe = useMemo(
    () => new Map(productos.map((p) => [p.id, p.nombre])),
    [productos],
  )

  /** Foto de cada sucursal: qué tiene hoy (y cuánto vale). */
  const foto = useMemo(() => {
    const mapa = new Map<number, { productos: number; unidades: number; valor: number }>()
    for (const s of sucursales) mapa.set(s.id, { productos: 0, unidades: 0, valor: 0 })
    for (const fila of stock) {
      const suya = mapa.get(fila.sucursal)
      if (!suya || fila.cantidad === 0) continue
      suya.productos += 1
      suya.unidades += fila.cantidad
      suya.valor += (listaDe.get(fila.producto) ?? 0) * Math.max(fila.cantidad, 0)
    }
    return mapa
  }, [sucursales, stock, listaDe])

  /** Exactamente las filas que el borrado va a tocar (las que tienen unidades). */
  const filasElegidas = useMemo(() => {
    if (!elegidas.length) return []
    const set = new Set(elegidas)
    return stock
      .filter((f) => set.has(f.sucursal) && f.cantidad !== 0)
      .sort((a, b) => b.cantidad - a.cantidad)
  }, [stock, elegidas])

  const total = useMemo(() => {
    let unidades = 0
    let valor = 0
    for (const fila of filasElegidas) {
      unidades += fila.cantidad
      valor += (listaDe.get(fila.producto) ?? 0) * Math.max(fila.cantidad, 0)
    }
    return { productos: filasElegidas.length, unidades, valor }
  }, [filasElegidas, listaDe])

  const nombresElegidas = useMemo(
    () => sucursales.filter((s) => elegidas.includes(s.id)).map((s) => s.nombre),
    [sucursales, elegidas],
  )
  const rotulo = enumerar(nombresElegidas)

  const conStock = sucursales.filter((s) => (foto.get(s.id)?.unidades ?? 0) !== 0)
  const hayAlgoParaBorrar = conStock.length > 0

  // ---- Respaldos ----
  const { data: vaciados = [], isLoading: cargandoVaciados } = useQuery({
    queryKey: ['inv-vaciados'],
    queryFn: listarVaciados,
    enabled: abierto,
  })

  const { data: detalle, isLoading: cargandoDetalle } = useQuery({
    queryKey: ['inv-vaciado', mirando?.id],
    queryFn: () => detalleVaciado(mirando!.id),
    enabled: abierto && mirando !== null,
  })

  // ---- Reinicio al abrir ----
  useEffect(() => {
    if (!abierto) return
    setSolapa('borrar')
    setPaso(1)
    setDir('fwd')
    setMotivo('')
    setPalabra('')
    setResultado(null)
    setMirando(null)
    setModo('reemplazar')
    // La sucursal que se está mirando en la pantalla viene marcada, pero solo
    // si tiene algo que borrar (marcar una vacía sería un click al pedo).
    const inicial =
      sucursalInicial !== null && (foto.get(sucursalInicial)?.unidades ?? 0) !== 0
        ? [sucursalInicial]
        : []
    setElegidas(inicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, sucursalInicial])

  function ir(siguiente: Paso) {
    const orden = (p: Paso) => (p === 'listo' ? 4 : p)
    setDir(orden(siguiente) >= orden(paso) ? 'fwd' : 'back')
    setPaso(siguiente)
  }

  function alternar(id: number) {
    setElegidas((previas) =>
      previas.includes(id) ? previas.filter((x) => x !== id) : [...previas, id],
    )
  }

  // ---- Mutaciones ----
  const borrar = useMutation({
    mutationFn: () =>
      vaciarStock({
        sucursales: elegidas,
        motivo: motivo.trim(),
        confirmacion: palabra.trim().toUpperCase(),
      }),
    onSuccess: (vaciado) => {
      setResultado(vaciado)
      ir('listo')
      queryClient.invalidateQueries({ queryKey: ['inv-vaciados'] })
      onVaciado(vaciado)
    },
    onError: (e) =>
      toast.error('No se pudo borrar', e instanceof ApiError ? e.message : undefined),
  })

  const restaurar = useMutation({
    mutationFn: ({ id, modo: comoVuelve }: { id: number; modo: ModoRestauracion }) =>
      restaurarVaciado(id, { modo: comoVuelve }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['inv-vaciados'] })
      queryClient.invalidateQueries({ queryKey: ['inv-vaciado', r.vaciado.id] })
      // Se vuelve a la lista de respaldos: ahí se ve el que acaba de quedar
      // marcado como restaurado (se llegue desde la lista o desde el «deshacer»).
      setMirando(null)
      setResultado(null)
      setSolapa('respaldos')
      setPaso(1)
      onRestaurado(r)
    },
    onError: (e) =>
      toast.error('No se pudo restaurar', e instanceof ApiError ? e.message : undefined),
  })

  const ocupado = borrar.isPending || restaurar.isPending
  const palabraOk = palabra.trim().toUpperCase() === PALABRA_BORRAR
  const guardados = vaciados.filter((v) => v.puede_restaurar).length

  const titulos: Record<Paso, { titulo: string; sub: string }> = {
    1: {
      titulo: 'Borrar stock por sucursal',
      sub: '¿De qué locales querés poner las cantidades en cero?',
    },
    2: {
      titulo: 'Revisá qué se va a borrar',
      sub: `${rotulo || 'Sin sucursales'} · todavía no se tocó nada.`,
    },
    3: {
      titulo: 'Confirmá el borrado',
      sub: 'Último paso: escribí la palabra y listo.',
    },
    listo: {
      titulo: 'Stock borrado',
      sub: `${rotulo} quedó en cero, con su respaldo guardado.`,
    },
  }
  const cabecera =
    solapa === 'respaldos'
      ? {
          titulo: mirando ? `Respaldo #${mirando.id}` : 'Respaldos de stock',
          sub: mirando
            ? `${mirando.sucursales_nombres} · ${num(mirando.productos)} productos guardados`
            : 'Todo lo que se borró alguna vez, y cómo devolverlo.',
        }
      : titulos[paso]

  const Icono = solapa === 'respaldos' ? History : paso === 'listo' ? CheckCircle2 : Trash2

  return (
    <Modal
      open={abierto}
      onClose={ocupado ? () => {} : onCerrar}
      size="xl"
      labelledBy="vaciar-stock-titulo"
      dismissable={!ocupado}
    >
      {/* ---------- Cabecera ---------- */}
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center">
              {solapa === 'borrar' && paso !== 'listo' && (
                <span
                  aria-hidden
                  className="ct-modal-halo absolute inset-0 rounded-xl bg-red-500/25"
                />
              )}
              <span
                className={cn(
                  'relative grid h-9 w-9 place-items-center rounded-xl',
                  solapa === 'borrar' && paso !== 'listo'
                    ? 'bg-red-600 text-white'
                    : 'bg-ink-950 text-on-ink',
                )}
              >
                <Icono className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
              </span>
            </span>
            <div className="min-w-0">
              <h2
                id="vaciar-stock-titulo"
                className="truncate text-lg font-semibold text-ink-950"
              >
                {cabecera.titulo}
              </h2>
              <p className="mt-0.5 text-xs text-ink-400">{cabecera.sub}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={ocupado}
            aria-label="Cerrar"
            className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Solapas: solo cuando no hay un flujo a medio hacer. */}
        {(solapa === 'respaldos' || paso === 1 || paso === 'listo') && !mirando && (
          <div className="mt-3.5 inline-flex rounded-xl bg-ink-100 p-1">
            <SolapaBoton
              activa={solapa === 'borrar'}
              onClick={() => {
                setSolapa('borrar')
                // Volver desde la pantalla final arranca un borrado NUEVO: lo que
                // ya se borró quedó en cero y no tiene sentido traerlo marcado.
                if (paso === 'listo') {
                  setElegidas([])
                  setMotivo('')
                  setPalabra('')
                  setResultado(null)
                  ir(1)
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Borrar
            </SolapaBoton>
            <SolapaBoton activa={solapa === 'respaldos'} onClick={() => setSolapa('respaldos')}>
              <History className="h-3.5 w-3.5" aria-hidden />
              Respaldos
              {guardados > 0 && (
                <span
                  className={cn(
                    'tnum ml-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.6rem] font-bold',
                    solapa === 'respaldos' ? 'bg-ink-100 text-ink-900' : 'bg-ink-200 text-ink-700',
                  )}
                >
                  {guardados}
                </span>
              )}
            </SolapaBoton>
          </div>
        )}

        {solapa === 'borrar' && paso !== 'listo' && <Riel paso={paso} />}
      </div>

      {/* ---------- Paso 1: elegir sucursales ---------- */}
      {solapa === 'borrar' && paso === 1 && (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div key="paso1" className={dir === 'fwd' ? 'ct-step-fwd' : 'ct-step-back'}>
              {!hayAlgoParaBorrar ? (
                <div className="rounded-2xl border border-line bg-canvas/40 px-5 py-10 text-center">
                  <PackageSearch className="mx-auto h-8 w-8 text-ink-300" aria-hidden />
                  <p className="mt-3 text-sm font-semibold text-ink-900">No hay stock cargado</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-ink-400">
                    Ninguna sucursal tiene unidades: no hay nada para borrar.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-ink-500">
                      Podés elegir <b className="text-ink-900">más de una</b>.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setElegidas(
                          elegidas.length === conStock.length ? [] : conStock.map((s) => s.id),
                        )
                      }
                      className="shrink-0 text-xs font-semibold text-ink-600 underline underline-offset-2 transition-colors hover:text-ink-900"
                    >
                      {elegidas.length === conStock.length ? 'Quitar todas' : 'Elegir todas'}
                    </button>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {sucursales.map((s, i) => {
                      const suya = foto.get(s.id) ?? { productos: 0, unidades: 0, valor: 0 }
                      const vacia = suya.unidades === 0
                      const elegida = elegidas.includes(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={vacia}
                          onClick={() => alternar(s.id)}
                          aria-pressed={elegida}
                          style={ctStagger(i)}
                          className={cn(
                            'ct-stagger-item group flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600',
                            vacia && 'cursor-not-allowed border-line bg-canvas/40 opacity-55',
                            !vacia && elegida && 'border-red-500/60 bg-red-500/[0.07] shadow-sm',
                            !vacia &&
                              !elegida &&
                              'border-line-strong bg-surface hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md motion-reduce:hover:translate-y-0',
                          )}
                        >
                          <span
                            className={cn(
                              'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors',
                              elegida
                                ? 'bg-red-600 text-white'
                                : 'bg-ink-50 text-ink-500 ring-1 ring-line',
                            )}
                          >
                            {elegida ? <Check className="h-5 w-5" /> : <Store className="h-5 w-5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink-900">
                              {s.nombre}
                            </span>
                            <span className="tnum block truncate text-xs text-ink-400">
                              {vacia
                                ? 'sin unidades cargadas'
                                : `${num(suya.productos)} productos · ${num(suya.unidades)} unidades`}
                            </span>
                            {!vacia && suya.valor > 0 && (
                              <span className="tnum block truncate text-[0.65rem] text-ink-400">
                                {money0(suya.valor)} a lista
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              <Aviso icono={ShieldCheck} className="mt-4">
                Antes de borrar se guarda un <b>respaldo completo</b> del stock, producto por
                producto. Solo el <b>superadministrador</b> puede restaurarlo.
              </Aviso>
            </div>
          </div>
          <Pie>
            {total.productos > 0 && (
              <p className="tnum mr-auto hidden text-xs text-ink-500 sm:block">
                Vas a borrar <b className={TINTA_PELIGRO}>{num(total.productos)}</b> productos ·{' '}
                <b className={TINTA_PELIGRO}>{num(total.unidades)}</b> unidades
              </p>
            )}
            <Button variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            {/* Sin unidades no hay nada que borrar: el paso 2 no tendría qué mostrar. */}
            <Button disabled={total.productos === 0} onClick={() => ir(2)}>
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Pie>
        </>
      )}

      {/* ---------- Paso 2: revisar ---------- */}
      {solapa === 'borrar' && paso === 2 && (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div key="paso2" className={cn('space-y-4', dir === 'fwd' ? 'ct-step-fwd' : 'ct-step-back')}>
              <div className={PANEL_PELIGRO}>
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={cn('mt-0.5 h-5 w-5 shrink-0', TINTA_PELIGRO)}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className={cn('text-sm font-semibold', TINTA_PELIGRO)}>
                      Se va a borrar el stock de {rotulo}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-600">
                      Todas sus cantidades quedan en <b>0</b>. Es una acción masiva: no se puede
                      deshacer desde acá, solo restaurando el respaldo.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <Tarjeta label="Productos" valor={num(total.productos)} icono={PackageSearch} />
                <Tarjeta label="Unidades" valor={num(total.unidades)} icono={Boxes} />
                <Tarjeta
                  label="Valor a lista"
                  valor={plata(total.valor)}
                  titulo={money0(total.valor)}
                  icono={Trash2}
                  detalle="precios vivos"
                />
              </div>

              {nombresElegidas.length > 1 && (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {sucursales
                    .filter((s) => elegidas.includes(s.id))
                    .map((s) => {
                      const suya = foto.get(s.id)!
                      return (
                        <li
                          key={s.id}
                          className="flex items-center gap-3 px-3.5 py-2.5 text-xs"
                        >
                          <Store className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                          <span className="min-w-0 flex-1 truncate font-medium text-ink-800">
                            {s.nombre}
                          </span>
                          <span className="tnum shrink-0 text-ink-500">
                            {num(suya.productos)} prod.
                          </span>
                          <span className="tnum w-16 shrink-0 text-right font-semibold text-ink-900">
                            {num(suya.unidades)} u.
                          </span>
                        </li>
                      )
                    })}
                </ul>
              )}

              {filasElegidas.length > 0 && (
                <div>
                  <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
                    Lo que más pesa
                  </p>
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                    {filasElegidas.slice(0, 6).map((fila) => (
                      <li
                        key={fila.id}
                        className="flex items-center gap-3 px-3.5 py-2 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate text-ink-700">
                          {nombreDe.get(fila.producto) ?? `Producto #${fila.producto}`}
                          <span className="text-ink-400">
                            {' · '}
                            {sucursales.find((s) => s.id === fila.sucursal)?.nombre ?? ''}
                          </span>
                        </span>
                        <span className={cn('tnum shrink-0 font-semibold', TINTA_PELIGRO)}>
                          −{num(fila.cantidad)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {filasElegidas.length > 6 && (
                    <p className="tnum mt-1.5 text-[0.7rem] text-ink-400">
                      y {num(filasElegidas.length - 6)} productos más.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-line bg-canvas/40 px-4 py-3.5">
                <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
                  Lo que NO se toca
                </p>
                <ul className="grid gap-1.5 text-xs text-ink-600 sm:grid-cols-2">
                  {[
                    'Los productos del catálogo',
                    'Los precios (lista y contado)',
                    'Las otras sucursales',
                    'El historial de movimientos y ventas',
                  ].map((texto) => (
                    <li key={texto} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                      {texto}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <label
                  htmlFor="vaciar-motivo"
                  className="mb-1.5 block text-xs font-medium text-ink-500"
                >
                  Motivo (opcional)
                </label>
                <Input
                  id="vaciar-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder='Ej: "arrancamos el conteo de cero"'
                  maxLength={200}
                />
                <p className="mt-1 text-xs text-ink-400">
                  Queda en el respaldo y en el historial de cada producto.
                </p>
              </div>
            </div>
          </div>
          <Pie>
            <Button variant="outline" onClick={() => ir(1)}>
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </Button>
            <Button onClick={() => ir(3)}>
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Pie>
        </>
      )}

      {/* ---------- Paso 3: confirmar ---------- */}
      {solapa === 'borrar' && paso === 3 && (
        <>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6">
            <div
              key="paso3"
              className={cn('space-y-5', dir === 'fwd' ? 'ct-step-fwd' : 'ct-step-back')}
            >
              <div className="text-center">
                <span className="relative mx-auto grid h-16 w-16 place-items-center">
                  <span
                    aria-hidden
                    className="ct-modal-halo absolute inset-0 rounded-2xl bg-red-500/25"
                  />
                  <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-red-600 text-white">
                    <Trash2 className="h-7 w-7" />
                  </span>
                </span>
                <p className="mt-3.5 text-balance text-base font-semibold text-ink-950">
                  Estás por borrar el stock de{' '}
                  <span className={TINTA_PELIGRO}>{rotulo}</span>
                </p>
                <p className="tnum mx-auto mt-1 max-w-sm text-xs text-ink-500">
                  {num(total.productos)} productos · {num(total.unidades)} unidades ·{' '}
                  {money0(total.valor)} a lista
                </p>
              </div>

              <div className={PANEL_PELIGRO}>
                <label
                  htmlFor="vaciar-palabra"
                  className={cn('block text-xs font-semibold', TINTA_PELIGRO)}
                >
                  Para confirmar, escribí {PALABRA_BORRAR}
                </label>
                <div className="relative mt-2">
                  <Input
                    id="vaciar-palabra"
                    data-autofocus
                    value={palabra}
                    onChange={(e) => setPalabra(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter = confirmar, como en cualquier diálogo del sistema.
                      if (e.key === 'Enter' && palabraOk && !ocupado) borrar.mutate()
                    }}
                    placeholder={PALABRA_BORRAR}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-describedby="vaciar-palabra-ayuda"
                    className={cn(
                      'pr-10 font-mono uppercase tracking-[0.2em]',
                      palabraOk && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
                    )}
                  />
                  {palabraOk && (
                    <Check
                      className={cn(
                        'ct-slot-pop absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2',
                        TINTA_PELIGRO,
                      )}
                      aria-hidden
                    />
                  )}
                </div>
                <p id="vaciar-palabra-ayuda" className="mt-2 text-xs text-ink-600">
                  Es a propósito: escribirla evita borrar un local de un click.
                </p>
              </div>

              <Aviso icono={ShieldCheck}>
                Ni bien confirmes se guarda el respaldo con todo lo borrado, producto por
                producto.{' '}
                {esSuper
                  ? 'Como superadministrador, vas a poder restaurarlo cuando quieras.'
                  : 'Restaurarlo lo hace únicamente el superadministrador.'}
              </Aviso>
            </div>
          </div>
          <Pie>
            <Button
              type="button"
              variant="outline"
              disabled={borrar.isPending}
              onClick={() => ir(2)}
            >
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </Button>
            <Button
              type="button"
              disabled={!palabraOk || borrar.isPending}
              onClick={() => borrar.mutate()}
              className={cn(BOTON_PELIGRO, 'min-w-0')}
            >
              {borrar.isPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">
                {borrar.isPending
                  ? 'Borrando…'
                  : nombresElegidas.length === 1
                    ? `Borrar el stock de ${rotulo}`
                    : `Borrar el stock de ${nombresElegidas.length} sucursales`}
              </span>
            </Button>
          </Pie>
        </>
      )}

      {/* ---------- Listo ---------- */}
      {solapa === 'borrar' && paso === 'listo' && resultado && (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-6">
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-ink-950 text-on-ink">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <p className="text-balance text-base font-semibold text-ink-950">
                {resultado.sucursales_nombres} quedó en cero
              </p>
              <p className="max-w-sm text-xs text-ink-500">
                Cada producto dejó su movimiento en el historial, con tu usuario y el motivo.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <Tarjeta label="Productos" valor={num(resultado.productos)} icono={PackageSearch} />
              <Tarjeta label="Unidades" valor={num(resultado.unidades)} icono={Boxes} />
              <Tarjeta
                label="Valor a lista"
                valor={plata(Number(resultado.valor_lista))}
                titulo={money0(Number(resultado.valor_lista))}
                icono={Trash2}
              />
            </div>

            <div className="rounded-2xl border border-line bg-canvas/40 px-4 py-3.5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ink-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">
                    Respaldo #{resultado.id} guardado
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {esSuper
                      ? 'Podés devolver todo a como estaba cuando quieras, desde acá o desde Respaldos.'
                      : 'Si hizo falta volver atrás, solo el superadministrador puede restaurarlo.'}
                  </p>
                </div>
              </div>
              {esSuper && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full sm:w-auto"
                  disabled={restaurar.isPending}
                  onClick={() => restaurar.mutate({ id: resultado.id, modo: 'reemplazar' })}
                >
                  {restaurar.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Deshacer: restaurar todo
                </Button>
              )}
            </div>
          </div>
          <Pie>
            <Button variant="outline" onClick={() => setSolapa('respaldos')}>
              <History className="h-4 w-4" />
              Ver respaldos
            </Button>
            <Button onClick={onCerrar}>Terminar</Button>
          </Pie>
        </>
      )}

      {/* ---------- Respaldos: lista ---------- */}
      {solapa === 'respaldos' && !mirando && (
        <>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
            {cargandoVaciados ? (
              <p className="flex items-center gap-2 px-1 py-6 text-xs text-ink-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Buscando respaldos…
              </p>
            ) : vaciados.length === 0 ? (
              <div className="rounded-2xl border border-line bg-canvas/40 px-5 py-10 text-center">
                <History className="mx-auto h-8 w-8 text-ink-300" aria-hidden />
                <p className="mt-3 text-sm font-semibold text-ink-900">Todavía no hay respaldos</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-ink-400">
                  Cada vez que se borre el stock de una sucursal, la foto de lo borrado va a
                  aparecer acá.
                </p>
              </div>
            ) : (
              vaciados.map((v, i) => (
                <div
                  key={v.id}
                  style={ctStagger(i)}
                  className="ct-stagger-item rounded-2xl border border-line bg-surface px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={v.puede_restaurar ? 'solid' : 'outline'}>
                          {v.puede_restaurar ? 'Guardado' : 'Restaurado'}
                        </Badge>
                        <span className="truncate text-sm font-semibold text-ink-900">
                          {v.sucursales_nombres}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-ink-400" title={fechaHora(v.creado)}>
                        {tiempoRelativo(v.creado)}
                        {v.usuario && ` · ${v.usuario}`}
                        {v.motivo && ` · «${v.motivo}»`}
                      </p>
                      {!v.puede_restaurar && v.restaurado && (
                        <p className="mt-0.5 truncate text-xs text-ink-400">
                          Restaurado {tiempoRelativo(v.restaurado)}
                          {v.restaurado_por_usuario && ` por ${v.restaurado_por_usuario}`}
                        </p>
                      )}
                    </div>
                    <div className="tnum shrink-0 text-right">
                      <p className="text-sm font-bold text-ink-950">{num(v.unidades)} u.</p>
                      <p className="text-xs text-ink-400">{num(v.productos)} productos</p>
                      {Number(v.valor_lista) > 0 && (
                        <p
                          className="text-[0.65rem] text-ink-400"
                          title={money0(Number(v.valor_lista))}
                        >
                          {plata(Number(v.valor_lista))}
                        </p>
                      )}
                    </div>
                  </div>
                  {v.puede_restaurar && (
                    <div className="mt-3 flex items-center justify-end border-t border-line pt-3">
                      {esSuper ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setModo('reemplazar')
                            setMirando(v)
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Restaurar
                        </Button>
                      ) : (
                        <p className="flex items-center gap-1.5 text-xs text-ink-400">
                          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Solo el superadministrador puede restaurarlo
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <Pie>
            <Button variant="outline" onClick={onCerrar}>
              Cerrar
            </Button>
          </Pie>
        </>
      )}

      {/* ---------- Respaldos: restaurar uno ---------- */}
      {solapa === 'respaldos' && mirando && (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {cargandoDetalle || !detalle ? (
              <p className="flex items-center gap-2 px-1 py-6 text-xs text-ink-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Leyendo el respaldo…
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  <Tarjeta
                    label="Productos"
                    valor={num(detalle.vaciado.productos)}
                    icono={PackageSearch}
                  />
                  <Tarjeta label="Unidades" valor={num(detalle.vaciado.unidades)} icono={Boxes} />
                  <Tarjeta
                    label="Borrado"
                    valor={tiempoRelativo(detalle.vaciado.creado)}
                    icono={History}
                    detalle={detalle.vaciado.usuario ?? undefined}
                  />
                </div>

                {detalle.conflictos > 0 ? (
                  <div className={PANEL_PELIGRO}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className={cn('mt-0.5 h-5 w-5 shrink-0', TINTA_PELIGRO)}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className={cn('text-sm font-semibold', TINTA_PELIGRO)}>
                          Desde el borrado, {num(detalle.conflictos)} productos volvieron a tener
                          stock
                        </p>
                        <p className="mt-0.5 text-xs text-ink-600">
                          Hoy hay {num(detalle.unidades_hoy)} unidades cargadas en esas filas.
                          Elegí qué hacer con ellas.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Aviso icono={ShieldCheck}>
                    Nadie tocó esas filas desde el borrado: todo vuelve <b>exactamente</b> a como
                    estaba.
                  </Aviso>
                )}

                {detalle.conflictos > 0 && (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <OpcionModo
                      elegida={modo === 'reemplazar'}
                      onClick={() => setModo('reemplazar')}
                      titulo="Dejar el stock como estaba"
                      detalle="Se pisa lo cargado después. Es lo normal cuando el borrado fue un error."
                      recomendada
                    />
                    <OpcionModo
                      elegida={modo === 'sumar'}
                      onClick={() => setModo('sumar')}
                      titulo="Sumar lo guardado a lo de hoy"
                      detalle="Lo respaldado se suma al conteo actual. Sirve si lo nuevo también es real."
                    />
                  </div>
                )}

                <div>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
                      Qué vuelve
                    </p>
                    <p className="text-[0.65rem] text-ink-400">hoy → quedaría</p>
                  </div>
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                    {detalle.items.map((item) => {
                      const queda =
                        modo === 'reemplazar' ? item.cantidad : item.cantidad_hoy + item.cantidad
                      return (
                        <li
                          key={`${item.producto}-${item.sucursal}`}
                          className="flex items-center gap-2.5 px-3.5 py-2 text-xs"
                        >
                          <span className="min-w-0 flex-1 truncate text-ink-700">
                            {item.producto_nombre}
                            <span className="text-ink-400"> · {item.sucursal_nombre}</span>
                          </span>
                          <span className="tnum w-9 shrink-0 text-right text-ink-400">
                            {num(item.cantidad_hoy)}
                          </span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-ink-300" aria-hidden />
                          <span className="tnum w-9 shrink-0 text-right font-semibold text-ink-950">
                            {num(queda)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  {detalle.total_items > detalle.items.length && (
                    <p className="tnum mt-1.5 text-[0.7rem] text-ink-400">
                      y {num(detalle.total_items - detalle.items.length)} productos más, todos
                      incluidos en la restauración.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
          <Pie>
            <Button
              variant="outline"
              disabled={restaurar.isPending}
              onClick={() => setMirando(null)}
            >
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </Button>
            <Button
              disabled={restaurar.isPending || !detalle}
              onClick={() => restaurar.mutate({ id: mirando.id, modo })}
            >
              {restaurar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Restaurar el stock
            </Button>
          </Pie>
        </>
      )}
    </Modal>
  )
}

// ===== Subcomponentes =====

function SolapaBoton({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
        activa ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
      )}
    >
      {children}
    </button>
  )
}

/** Riel de progreso: en qué acto del borrado estamos. */
function Riel({ paso }: { paso: Paso }) {
  const actual = paso === 'listo' ? PASOS.length : PASOS.findIndex((p) => p.id === paso)
  return (
    <ol className="mt-3 flex items-center gap-1.5" aria-label="Progreso del borrado">
      {PASOS.map((p, i) => (
        <li key={p.id} className="flex flex-1 items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                'block h-1 rounded-full transition-colors duration-300',
                i < actual ? 'bg-red-600' : i === actual ? 'bg-red-500/50' : 'bg-ink-100',
              )}
            />
            <span
              className={cn(
                'mt-1 block truncate text-[0.6rem] font-medium uppercase tracking-[0.08em] transition-colors',
                i <= actual ? 'text-ink-600' : 'text-ink-300',
              )}
            >
              {p.label}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

function OpcionModo({
  elegida,
  onClick,
  titulo,
  detalle,
  recomendada = false,
}: {
  elegida: boolean
  onClick: () => void
  titulo: string
  detalle: string
  recomendada?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={elegida}
      className={cn(
        'rounded-2xl border px-4 py-3 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
        elegida
          ? 'border-ink-900 bg-ink-950 text-on-ink shadow-lg'
          : 'border-line-strong bg-surface hover:border-ink-300 hover:bg-ink-50',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'grid h-4 w-4 shrink-0 place-items-center rounded-full border',
            elegida ? 'border-white/70 bg-white/20' : 'border-line-strong',
          )}
        >
          {elegida && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo}</span>
        {recomendada && (
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide',
              elegida ? 'bg-white/15 text-on-ink' : 'bg-ink-100 text-ink-600',
            )}
          >
            sugerida
          </span>
        )}
      </span>
      <span
        className={cn(
          'mt-1 block text-xs leading-relaxed',
          elegida ? 'text-on-ink/70' : 'text-ink-400',
        )}
      >
        {detalle}
      </span>
    </button>
  )
}

function Tarjeta({
  label,
  valor,
  detalle,
  titulo,
  icono: Icono,
}: {
  label: string
  valor: string
  detalle?: string
  /** El valor exacto, para cuando el de la tarjeta viene compactado. */
  titulo?: string
  icono: typeof Boxes
}) {
  return (
    <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
          {label}
        </p>
        <Icono className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
      </div>
      <p
        className="tnum mt-0.5 truncate text-base font-bold leading-tight text-ink-950 sm:text-lg"
        title={titulo}
      >
        {valor}
      </p>
      {detalle && <p className="mt-0.5 truncate text-[0.65rem] text-ink-400">{detalle}</p>}
    </div>
  )
}

function Aviso({
  icono: Icono,
  className,
  children,
}: {
  icono: typeof ShieldCheck
  className?: string
  children: ReactNode
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-xs leading-relaxed text-ink-600',
        className,
      )}
    >
      <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function Pie({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
      {children}
    </div>
  )
}
