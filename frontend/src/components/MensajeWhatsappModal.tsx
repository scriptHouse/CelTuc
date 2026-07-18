import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Plus, RotateCcw, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import {
  EJEMPLO_MENSAJE,
  PLANTILLA_WHATSAPP_DEFAULT,
  VARIABLES_MENSAJE,
  construirMensajeCotizacion,
} from '@/lib/mensajeCotizacion'

/**
 * Editor de la plantilla del mensaje de WhatsApp de cotizaciones.
 *  - Variables insertables con un toque (se rellenan al copiar).
 *  - Vista previa en vivo con un equipo de ejemplo.
 *  - Restaurar al texto por defecto y guardar (persiste en localStorage).
 */
export function MensajeWhatsappModal({
  open,
  onClose,
  valorActual,
  onGuardar,
}: {
  open: boolean
  onClose: () => void
  valorActual: string
  onGuardar: (plantilla: string) => void
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
  const esDefault = limpio === PLANTILLA_WHATSAPP_DEFAULT
  const preview = limpio ? construirMensajeCotizacion(valor, EJEMPLO_MENSAJE) : ''

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
            <p className="text-xs text-ink-400">El texto que se copia al tocar «WhatsApp» en un modelo.</p>
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
            {VARIABLES_MENSAJE.map((v) => (
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
            rows={5}
            className="min-h-[120px] leading-relaxed"
            data-autofocus
          />
          {!limpio && <p className="mt-1.5 text-xs text-ink-500">El mensaje no puede quedar vacío.</p>}
        </div>

        <div>
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Vista previa</p>
          <div className="rounded-xl border border-line bg-canvas/50 p-3.5 text-sm leading-relaxed text-ink-700">
            {preview || <span className="text-ink-400">Escribí un mensaje para ver la vista previa.</span>}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">
            Ejemplo con {EJEMPLO_MENSAJE.modelo}. Al copiar, cada variable se reemplaza por los datos reales del equipo.
          </p>
        </div>
      </div>

      {/* Pie */}
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3.5">
        <Button variant="ghost" size="sm" onClick={() => setValor(PLANTILLA_WHATSAPP_DEFAULT)} disabled={esDefault}>
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
