import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Loader2, Percent, RotateCcw, X } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ToastProvider'

/**
 * Tarjeta «Descuento cash»: el % general arriba y abajo cada categoría (o
 * sección de service) con el % que le aplica hoy. La regla, pensada para
 * explicarse sola: sin % propio se usa el general; un subgrupo sigue a su
 * categoría madre. Editar es tocar el %, tipear y confirmar; «↺» vuelve al
 * general. La usan Configurar productos y Configurar service (solo admins).
 */

export interface FilaDescuento {
  id: number
  nombre: string
  /** 1 = subgrupo (se muestra indentado). */
  nivel: 0 | 1
  /** % propio de la fila; null = heredado. */
  propio: number | null
  /** % que aplica hoy (propio, o el heredado). */
  efectivo: number
  /** De dónde sale el % cuando no es propio: 'general' o el nombre de la madre. */
  origen: string
}

function parsearPct(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!limpio) return null
  const valor = Number(limpio)
  return Number.isFinite(valor) && valor >= 0 && valor <= 100 ? valor : null
}

const num = (v: number) => String(Number(v))

export function DescuentoCashEditor({
  general,
  filas,
  guardarGeneral,
  guardarFila,
  onListo,
}: {
  general: number
  filas: FilaDescuento[]
  guardarGeneral: (pct: number) => Promise<unknown>
  guardarFila: (id: number, pct: number | null) => Promise<unknown>
  onListo: () => void
}) {
  const toast = useToast()
  // Id de la fila en edición ('general' para la primera), para abrir de a una.
  const [editando, setEditando] = useState<number | 'general' | null>(null)

  const guardar = useMutation({
    mutationFn: ({ id, valor }: { id: number | 'general'; valor: number | null }) => {
      if (id === 'general') {
        if (valor === null) return Promise.reject(new ApiError(0, 'Poné un % entre 0 y 100.', null))
        return guardarGeneral(valor)
      }
      return guardarFila(id, valor)
    },
    onSuccess: (_data, { valor }) => {
      setEditando(null)
      toast.success(
        valor === null ? 'Vuelve a usar el descuento general' : 'Descuento guardado',
        'Los precios cash quedaron recalculados.',
      )
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  return (
    <div className="rounded-2xl border border-line bg-canvas/40 p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
        <Percent className="h-3.5 w-3.5" /> Descuento cash
      </p>
      <p className="mb-3 text-xs leading-relaxed text-ink-400">
        Es el % que se descuenta pagando en efectivo. Tocá un % para cambiarlo: las
        categorías sin % propio usan el general, y los subgrupos siguen a su categoría madre.
      </p>

      <FilaPct
        etiqueta="Descuento general"
        destacada
        propio={general}
        efectivo={general}
        origen=""
        abierta={editando === 'general'}
        onAbrir={() => setEditando('general')}
        onCerrar={() => setEditando(null)}
        onGuardar={(valor) => guardar.mutate({ id: 'general', valor })}
        guardando={guardar.isPending && guardar.variables?.id === 'general'}
      />

      <div className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
        {filas.map((fila) => (
          <FilaPct
            key={fila.id}
            etiqueta={fila.nombre}
            nivel={fila.nivel}
            propio={fila.propio}
            efectivo={fila.efectivo}
            origen={fila.origen}
            abierta={editando === fila.id}
            onAbrir={() => setEditando(fila.id)}
            onCerrar={() => setEditando(null)}
            onGuardar={(valor) => guardar.mutate({ id: fila.id, valor })}
            guardando={guardar.isPending && guardar.variables?.id === fila.id}
          />
        ))}
      </div>
    </div>
  )
}

function FilaPct({
  etiqueta,
  nivel = 0,
  destacada = false,
  propio,
  efectivo,
  origen,
  abierta,
  onAbrir,
  onCerrar,
  onGuardar,
  guardando,
}: {
  etiqueta: string
  nivel?: 0 | 1
  destacada?: boolean
  propio: number | null
  efectivo: number
  origen: string
  abierta: boolean
  onAbrir: () => void
  onCerrar: () => void
  onGuardar: (valor: number | null) => void
  guardando: boolean
}) {
  const toast = useToast()
  const [texto, setTexto] = useState('')

  const abrir = () => {
    setTexto(num(efectivo))
    onAbrir()
  }

  const confirmar = () => {
    const valor = parsearPct(texto)
    if (valor === null) {
      toast.error('Poné un % entre 0 y 100')
      return
    }
    onGuardar(valor)
  }

  return (
    <div
      className={cn(
        'flex min-h-11 items-center justify-between gap-3 px-3 py-1.5',
        destacada && 'rounded-xl border border-line bg-surface',
      )}
    >
      <span
        className={cn(
          'min-w-0 truncate text-sm',
          destacada ? 'font-semibold text-ink-900' : 'text-ink-700',
          nivel === 1 && 'pl-4 text-ink-500 before:mr-1.5 before:content-["·"]',
        )}
      >
        {etiqueta}
      </span>

      {abierta ? (
        <span className="flex shrink-0 items-center gap-1">
          <span className="relative">
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmar()
                if (e.key === 'Escape') onCerrar()
              }}
              inputMode="decimal"
              autoFocus
              aria-label={`Descuento de ${etiqueta}`}
              className="tnum h-8 w-20 px-2.5 pr-6 text-sm"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-400">
              %
            </span>
          </span>
          <button
            type="button"
            onClick={confirmar}
            disabled={guardando}
            aria-label="Guardar"
            className="grid h-8 w-8 place-items-center rounded-lg bg-ink-950 text-on-ink transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cancelar"
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={abrir}
            title="Tocá para cambiarlo"
            className={cn(
              'tnum rounded-lg px-2.5 py-1 text-sm font-medium transition-colors',
              propio !== null
                ? 'bg-ink-950 text-on-ink hover:opacity-85'
                : 'text-ink-400 hover:bg-ink-100 hover:text-ink-900',
            )}
          >
            −{num(efectivo)} %
            {propio === null && origen && (
              <span className="ml-1 text-xs font-normal">· {origen}</span>
            )}
          </button>
          {propio !== null && !destacada && (
            <button
              type="button"
              onClick={() => onGuardar(null)}
              disabled={guardando}
              title="Volver al descuento general"
              aria-label={`Volver al general en ${etiqueta}`}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </button>
          )}
        </span>
      )}
    </div>
  )
}
