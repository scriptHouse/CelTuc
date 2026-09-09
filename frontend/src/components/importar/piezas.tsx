import type { DragEvent, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { Check, FileSpreadsheet, Info, Loader2, Sparkles, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Las piezas que comparten los importadores (Inventario y Precios de service).
 *
 * Los dos hacen el mismo ritual —subir el Excel, procesar, revisar fila por
 * fila y recién ahí aplicar— así que se ven y se usan igual: quien aprendió uno
 * ya sabe usar el otro. Acá vive todo lo que no depende de QUÉ se importa.
 */

/** Riel de progreso: en qué acto de la importación estamos. */
export function RielImportacion({
  pasos,
  actual,
}: {
  pasos: Array<{ id: string; label: string }>
  /** Índice del paso actual (los anteriores quedan marcados como hechos). */
  actual: number
}) {
  return (
    <ol className="mt-3 flex items-center gap-1.5" aria-label="Progreso de la importación">
      {pasos.map((p, i) => (
        <li key={p.id} className="flex flex-1 items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                'block h-1 rounded-full transition-colors duration-300',
                i < actual ? 'bg-ink-900' : i === actual ? 'bg-ink-500' : 'bg-ink-100',
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

/** Las etapas que se cuentan mientras el servidor lee la planilla. */
const ETAPAS_PROCESANDO = [
  { hasta: 30, texto: 'Leyendo la planilla…' },
  { hasta: 65, texto: 'Cruzando cada fila con el catálogo…' },
  { hasta: 95, texto: 'Calculando el antes y el después…' },
  { hasta: 101, texto: '¡Listo! Preparando la revisión…' },
]

/** Pantalla de procesado: dice en qué anda, no solo que espere. */
export function Procesando({
  avance,
  archivo,
  etapas = ETAPAS_PROCESANDO,
}: {
  avance: number
  archivo: string
  etapas?: Array<{ hasta: number; texto: string }>
}) {
  const etapa = etapas.find((e) => avance < e.hasta) ?? etapas[etapas.length - 1]
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-14 text-center">
      <span className="relative grid h-20 w-20 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-ink-100 motion-reduce:animate-none" />
        <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-ink-950 text-on-ink">
          <Sparkles className="h-7 w-7" />
        </span>
      </span>
      <div>
        <p className="text-base font-semibold text-ink-950">{etapa.texto}</p>
        <p className="mt-1 max-w-xs truncate text-xs text-ink-400">{archivo}</p>
      </div>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-full rounded-full bg-ink-950 transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.round(avance))}%` }}
        />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-ink-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Nada se guarda todavía: primero se revisa.
      </p>
    </div>
  )
}

/** La zona donde se suelta el Excel, con lo que el sistema va a mirar. */
export function ZonaArchivo({
  archivo,
  onArchivo,
  ayuda,
  maximoMb = 10,
}: {
  archivo: File | null
  onArchivo: (archivo: File | null | undefined) => void
  /** Las tres o cuatro cosas que el importador mira de la planilla. */
  ayuda: ReactNode[]
  maximoMb?: number
}) {
  const input = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)

  function soltar(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setArrastrando(false)
    onArchivo(e.dataTransfer.files?.[0])
  }

  return (
    <>
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltar}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          arrastrando
            ? 'border-ink-900 bg-ink-50'
            : 'border-line-strong bg-canvas/40 hover:border-ink-300 hover:bg-ink-50/60',
        )}
      >
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={(e) => onArchivo(e.target.files?.[0])}
        />
        <span
          className={cn(
            'grid h-14 w-14 place-items-center rounded-2xl transition-colors',
            archivo ? 'bg-ink-950 text-on-ink' : 'bg-ink-100 text-ink-500',
          )}
        >
          {archivo ? <FileSpreadsheet className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
        </span>
        {archivo ? (
          <>
            <span className="max-w-full truncate text-sm font-semibold text-ink-900">
              {archivo.name}
            </span>
            <span className="tnum text-xs text-ink-400">
              {(archivo.size / 1024).toFixed(0)} KB · tocá para cambiarlo
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-ink-800">
              Arrastrá el Excel acá, o tocá para buscarlo
            </span>
            <span className="text-xs text-ink-400">Formato .xlsx · hasta {maximoMb} MB</span>
          </>
        )}
      </label>

      <div className="rounded-2xl border border-line bg-canvas/40 px-4 py-3.5">
        <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
          Qué mira el sistema
        </p>
        <ul className="space-y-1.5 text-xs text-ink-600">
          {ayuda.map((linea, i) => (
            <li key={i} className="flex gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
              <span>{linea}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

/** Una cifra del resumen de la revisión. */
export function Tarjeta({
  label,
  valor,
  detalle,
  icono: Icono,
}: {
  label: string
  valor: string
  detalle?: string
  icono: typeof Info
}) {
  return (
    <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
          {label}
        </p>
        <Icono className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
      </div>
      <p className="tnum mt-0.5 text-lg font-bold leading-none text-ink-950">{valor}</p>
      {detalle && <p className="mt-1 truncate text-[0.65rem] text-ink-400">{detalle}</p>}
    </div>
  )
}

export function Aviso({ icono: Icono, children }: { icono: typeof Info; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
      <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export function PieModal({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
      {children}
    </div>
  )
}
