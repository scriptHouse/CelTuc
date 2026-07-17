import { useMemo, useState } from 'react'
import { Clock, Eraser, FileSpreadsheet, FileText, Loader2, MapPin } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import { cn, ctStagger } from '@/lib/utils'
import { PaperScaler } from '@/documentos/PaperScaler'
import { DIRECCION_POR_DEFECTO, DIRECCIONES } from '@/documentos/content'
import { DOC_MODULES, PROXIMOS_DOCS } from '@/documentos/registry'

/** Dirección elegida para el encabezado de todos los documentos (se recuerda). */
const DIR_KEY = 'celtuc:doc:direccion'
const DIR_OPTIONS = DIRECCIONES.map((d) => ({ value: d, label: d }))

function leerDireccion(): string {
  try {
    const g = localStorage.getItem(DIR_KEY)
    if (g && (DIRECCIONES as readonly string[]).includes(g)) return g
  } catch {
    /* localStorage no disponible */
  }
  return DIRECCION_POR_DEFECTO
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

  const [activeId, setActiveId] = useState(DOC_MODULES[0].id)
  // Estado por documento: se preserva al cambiar de pestaña dentro de la sesión.
  const [estados, setEstados] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(DOC_MODULES.map((m) => [m.id, m.crearVacio()])),
  )
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [direccion, setDireccion] = useState<string>(leerDireccion)

  const active = useMemo(() => DOC_MODULES.find((m) => m.id === activeId) ?? DOC_MODULES[0], [activeId])
  const datos = estados[active.id]
  const patch = (p: Record<string, unknown>) =>
    setEstados((s) => ({ ...s, [active.id]: { ...(s[active.id] as object), ...p } }))

  function cambiarDireccion(v: string) {
    setDireccion(v)
    try {
      localStorage.setItem(DIR_KEY, v)
    } catch {
      /* localStorage no disponible */
    }
  }

  async function exportarPdf() {
    if (busy) return
    setBusy('pdf')
    try {
      const [{ pdf }, Pdf] = await Promise.all([import('@react-pdf/renderer'), active.loadPdf()])
      const blob = await pdf(<Pdf datos={datos} direccion={direccion} />).toBlob()
      descargar(blob, `${active.nombreArchivo(datos)}.pdf`)
      toast.success('PDF generado', `Se descargó: ${active.nombre}.`)
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
      const construir = await active.loadXlsx()
      const blob = await construir(datos, direccion)
      descargar(blob, `${active.nombreArchivo(datos)}.xlsx`)
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
    setEstados((s) => ({ ...s, [active.id]: active.crearVacio() }))
  }

  const Paper = active.Paper

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
        {DOC_MODULES.map((m, i) => (
          <DocChip
            key={m.id}
            nombre={m.nombre}
            descripcion={m.descripcion}
            activo={m.id === activeId}
            index={i}
            onClick={() => setActiveId(m.id)}
          />
        ))}
        {PROXIMOS_DOCS.map((d, i) => (
          <DocChip key={d.id} nombre={d.nombre} descripcion={d.descripcion} index={DOC_MODULES.length + i} proximamente />
        ))}
      </div>

      {/* Editor */}
      <Card className="ct-rise overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink-900">{active.nombre}</h2>
            <p className="text-xs text-ink-400">Tocá cualquier campo para completarlo.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5" title="Dirección del encabezado (se aplica a todos los documentos)">
              <MapPin className="h-4 w-4 shrink-0 text-ink-400" />
              <Select
                options={DIR_OPTIONS}
                value={direccion}
                onChange={cambiarDireccion}
                className="w-52"
                triggerClassName="h-9 text-xs"
              />
            </div>
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
          <div className="mx-auto" style={{ maxWidth: Math.min(active.naturalW * 1.55, 820) }}>
            <div className="overflow-hidden rounded-[5px] bg-white shadow-[0_12px_44px_rgba(10,10,11,0.18)] ring-1 ring-black/5">
              <PaperScaler naturalW={active.naturalW} naturalH={active.naturalH}>
                <Paper datos={datos} onChange={patch} direccion={direccion} />
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
  proximamente = false,
  index,
  onClick,
}: {
  nombre: string
  descripcion: string
  activo?: boolean
  proximamente?: boolean
  index: number
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={proximamente}
      aria-pressed={proximamente ? undefined : activo}
      className={cn(
        'ct-stagger-item flex flex-col gap-1 rounded-2xl border p-3 text-left transition-colors',
        proximamente
          ? 'cursor-default border-line bg-surface'
          : activo
            ? 'border-ink-900 bg-ink-950 text-on-ink shadow-[0_10px_30px_rgba(10,10,11,0.18)]'
            : 'cursor-pointer border-line bg-surface hover:border-ink-300 hover:bg-ink-50',
      )}
      style={ctStagger(index)}
    >
      <div className="flex items-center gap-2">
        <FileText className={cn('h-4 w-4 shrink-0', activo ? 'text-on-ink' : 'text-ink-400')} strokeWidth={1.85} />
        <span className={cn('truncate text-sm font-semibold', activo ? 'text-on-ink' : 'text-ink-700')}>{nombre}</span>
      </div>
      <p className={cn('line-clamp-2 text-xs', activo ? 'text-on-ink/70' : 'text-ink-400')}>{descripcion}</p>
      {proximamente && (
        <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[0.65rem] font-medium text-ink-500">
          <Clock className="h-3 w-3" /> Próximamente
        </span>
      )}
    </button>
  )
}
