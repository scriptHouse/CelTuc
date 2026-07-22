import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Plus, RotateCcw, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'

/**
 * Editor genérico de plantillas de mensajes de WhatsApp (cotizaciones,
 * facturas…). Cada pantalla le pasa sus variables, su plantilla por defecto y
 * cómo armar la vista previa; la persistencia la maneja quien lo usa.
 *  - Variables insertables con un toque (se rellenan al usar el mensaje).
 *  - Vista previa en vivo con datos de ejemplo.
 *  - Restaurar al texto por defecto y guardar.
 */

/** Variable insertable en una plantilla de mensaje. */
export interface VariableMensaje {
  token: string
  etiqueta: string
  descripcion: string
  /** Valor de ejemplo, usado en la vista previa del editor. */
  ejemplo: string
}

export function MensajeWhatsappModal({
  open,
  onClose,
  valorActual,
  onGuardar,
  subtitulo,
  variables,
  plantillaDefault,
  construirPreview,
  notaPreview,
  rows = 5,
}: {
  open: boolean
  onClose: () => void
  valorActual: string
  onGuardar: (plantilla: string) => void
  /** Qué mensaje se está editando (va bajo el título). */
  subtitulo: string
  variables: VariableMensaje[]
  plantillaDefault: string
  /** Arma la vista previa reemplazando las variables por datos de ejemplo. */
  construirPreview: (plantilla: string) => string
  /** Aclaración bajo la vista previa (con qué ejemplo se armó). */
  notaPreview: string
  rows?: number
}) {
  const [valor, setValor] = useState(valorActual)
  const ref = useRef<HTMLTextAreaElement>(null)

  // Al abrir, arranca desde la plantilla vigente (descarta ediciones previas sin guardar).
  useEffect(() => {
    if (open) setValor(valorActual)
  }, [open, valorActual])

  /** Inserta la variable en la posición del cursor (o al final si no hay foco). */
  function insertarVariable(token: string) {
    const ta = ref.current
    if (!ta) {
      setValor((v) => v + token)
      return
    }
    const start = ta.selectionStart ?? valor.length
    const end = ta.selectionEnd ?? valor.length
    setValor(valor.slice(0, start) + token + valor.slice(end))
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + token.length
      ta.setSelectionRange(pos, pos)
    })
  }

  const limpio = valor.trim()
  const esDefault = limpio === plantillaDefault
  const preview = limpio ? construirPreview(valor) : ''

  function guardar() {
    if (!limpio) return
    onGuardar(valor)
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" labelledBy="titulo-msg-wa">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div>
            <h2 id="titulo-msg-wa" className="text-lg font-semibold leading-tight text-ink-950">
              Mensaje de WhatsApp
            </h2>
            <p className="text-xs text-ink-400">{subtitulo}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div>
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
            Variables · tocá para insertar
          </p>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <button
                key={v.token}
                type="button"
                onClick={() => insertarVariable(v.token)}
                title={v.descripcion}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <Plus className="h-3 w-3 text-ink-400" aria-hidden />
                {v.etiqueta}
                <code className="rounded bg-ink-100 px-1 py-0.5 text-[0.68rem] text-ink-500">{v.token}</code>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="plantilla-wa"
            className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400"
          >
            Mensaje
          </label>
          <Textarea
            id="plantilla-wa"
            ref={ref}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            rows={rows}
            className="min-h-[120px] leading-relaxed"
            data-autofocus
          />
          {!limpio && <p className="mt-1.5 text-xs text-ink-500">El mensaje no puede quedar vacío.</p>}
        </div>

        <div>
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Vista previa</p>
          <div className="whitespace-pre-wrap rounded-xl border border-line bg-canvas/50 p-3.5 text-sm leading-relaxed text-ink-700">
            {preview || <span className="text-ink-400">Escribí un mensaje para ver la vista previa.</span>}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">{notaPreview}</p>
        </div>
      </div>

      {/* Pie */}
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3.5">
        <Button variant="ghost" size="sm" onClick={() => setValor(plantillaDefault)} disabled={esDefault}>
          <RotateCcw className="h-4 w-4" /> Restaurar
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!limpio}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
