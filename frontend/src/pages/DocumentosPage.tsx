import { useState } from 'react'
import { Clock, Eraser, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import { cn, ctStagger } from '@/lib/utils'
import { RecepcionPaper } from '@/documentos/RecepcionPaper'
import { PaperScaler } from '@/documentos/PaperScaler'
import { NATURAL_H, NATURAL_W } from '@/documentos/layout'
import { recepcionVacia, type RecepcionData } from '@/documentos/types'
import { PROXIMOS_DOCS, RECEPCION_DEF } from '@/documentos/registry'

/** Estado inicial: documento en blanco con la fecha de hoy ya cargada. */
function estadoInicial(): RecepcionData {
  const base = recepcionVacia()
  const hoy = new Date()
  return {
    ...base,
    fechaDia: String(hoy.getDate()).padStart(2, '0'),
    fechaMes: String(hoy.getMonth() + 1).padStart(2, '0'),
    fechaAnio: String(hoy.getFullYear()).slice(-2),
  }
}

function descargar(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function DocumentosPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [datos, setDatos] = useState<RecepcionData>(estadoInicial)
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)

  const patch = (p: Partial<RecepcionData>) => setDatos((d) => ({ ...d, ...p }))

  async function exportarPdf() {
    if (busy) return
    setBusy('pdf')
    try {
      const [{ pdf }, { RecepcionPdf }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/documentos/RecepcionPdf'),
      ])
      const blob = await pdf(<RecepcionPdf datos={datos} />).toBlob()
      descargar(blob, `${RECEPCION_DEF.nombreArchivo(datos)}.pdf`)
      toast.success('PDF generado', 'Se descargó la orden de recepción.')
    } catch (e) {
      console.error(e)
      toast.error('No se pudo generar el PDF', 'Probá de nuevo en un momento.')
    } finally {
      setBusy(null)
    }
  }

  async function exportarXlsx() {
    if (busy) return
    setBusy('xlsx')
    try {
      const { construirRecepcionXlsx } = await import('@/documentos/recepcionXlsx')
      const blob = await construirRecepcionXlsx(datos)
      descargar(blob, `${RECEPCION_DEF.nombreArchivo(datos)}.xlsx`)
      toast.success('Excel generado', 'Se descargó la planilla editable.')
    } catch (e) {
      console.error(e)
      toast.error('No se pudo generar el Excel', 'Probá de nuevo en un momento.')
    } finally {
      setBusy(null)
    }
  }

  async function limpiar() {
    const ok = await confirm({
      title: '¿Vaciar el documento?',
      description: 'Se borran todos los campos cargados. Esta acción no se puede deshacer.',
      confirmLabel: 'Vaciar',
      cancelLabel: 'Cancelar',
      tone: 'danger',
      icon: Eraser,
    })
    if (!ok) return
    setDatos(estadoInicial())
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={FileText}
        eyebrow="Plantillas"
        title="Documentos"
        subtitle="Completá los formularios de CelTuc y exportalos en PDF o Excel editable, idénticos al original."
        className="ct-rise"
      />

      {/* Selector de tipo de documento */}
      <div className="ct-rise mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <DocChip nombre={RECEPCION_DEF.nombre} descripcion={RECEPCION_DEF.descripcion} activo index={0} />
        {PROXIMOS_DOCS.map((d, i) => (
          <DocChip key={d.id} nombre={d.nombre} descripcion={d.descripcion} index={i + 1} />
        ))}
      </div>

      {/* Editor */}
      <Card className="ct-rise overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink-900">{RECEPCION_DEF.nombre}</h2>
            <p className="text-xs text-ink-400">Tocá cualquier campo para completarlo.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={limpiar} disabled={!!busy}>
              <Eraser className="h-4 w-4" /> Limpiar
            </Button>
            <Button variant="outline" size="sm" onClick={exportarXlsx} disabled={!!busy}>
              {busy === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Excel
            </Button>
            <Button size="sm" onClick={exportarPdf} disabled={!!busy}>
              {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              PDF
            </Button>
          </div>
        </div>

        {/* "Escritorio": el papel blanco sobre un fondo neutro */}
        <div className="bg-canvas p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[760px]">
            <div className="overflow-hidden rounded-[5px] bg-white shadow-[0_12px_44px_rgba(10,10,11,0.18)] ring-1 ring-black/5">
              <PaperScaler naturalW={NATURAL_W} naturalH={NATURAL_H}>
                <RecepcionPaper datos={datos} onChange={patch} />
              </PaperScaler>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

function DocChip({
  nombre,
  descripcion,
  activo = false,
  index,
}: {
  nombre: string
  descripcion: string
  activo?: boolean
  index: number
}) {
  return (
    <div
      className={cn(
        'ct-stagger-item flex flex-col gap-1 rounded-2xl border p-3 text-left transition-colors',
        activo
          ? 'border-ink-900 bg-ink-950 text-on-ink shadow-[0_10px_30px_rgba(10,10,11,0.18)]'
          : 'border-line bg-surface',
      )}
      style={ctStagger(index)}
    >
      <div className="flex items-center gap-2">
        <FileText className={cn('h-4 w-4 shrink-0', activo ? 'text-on-ink' : 'text-ink-400')} strokeWidth={1.85} />
        <span className={cn('truncate text-sm font-semibold', activo ? 'text-on-ink' : 'text-ink-700')}>{nombre}</span>
      </div>
      <p className={cn('line-clamp-2 text-xs', activo ? 'text-on-ink/70' : 'text-ink-400')}>{descripcion}</p>
      {!activo && (
        <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[0.65rem] font-medium text-ink-500">
          <Clock className="h-3 w-3" /> Próximamente
        </span>
      )}
    </div>
  )
}
