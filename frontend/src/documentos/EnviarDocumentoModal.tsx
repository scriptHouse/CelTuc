import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, Mail, MessageCircle, Pencil, Send, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MensajeWhatsappModal } from '@/components/MensajeWhatsappModal'
import { useToast } from '@/components/ToastProvider'
import { descargarBlob } from '@/lib/descargar'
import { waLink, waNumeroArgentino } from '@/lib/whatsapp'
import {
  CLAVE_MENSAJE_DOCUMENTO,
  EJEMPLO_DOCUMENTO,
  PLANTILLA_DOCUMENTO_DEFAULT,
  VARIABLES_DOCUMENTO,
  construirMensajeDocumento,
  plantillaEfectiva,
  valoresDeDocumento,
} from '@/lib/mensajeDocumento'
import { guardarPreferencia, obtenerPreferencia } from '@/services/preferencias'
import {
  buscarClientesDocumento,
  enviarDocumentoEmail,
  obtenerArchivoBlob,
  type DocumentoGenerado,
} from '@/services/documentos'
import { moduloDe } from './registry'

/**
 * Enviar un documento ya generado al cliente, por WhatsApp y/o por email.
 *
 * Los dos canales comparten el MISMO texto (una plantilla global editable con
 * el lápiz), pero se entregan distinto:
 *
 *  - **WhatsApp** abre el chat del cliente con el mensaje escrito (link
 *    `wa.me`, sin API ni costo). El archivo no se puede adjuntar solo por esa
 *    vía, así que el modal ofrece bajarlo para arrastrarlo al chat.
 *  - **Email** lo manda el backend con el archivo YA adjunto: es el mismo que
 *    se descargó y se entregó en el mostrador, no se vuelve a generar.
 *
 * El teléfono y el mail se precargan de dónde correspondan: primero del propio
 * documento (el campo que la plantilla usa para el contacto) y, si el papel no
 * los pedía, de la base de clientes por su DNI o su nombre. Siempre quedan
 * editables: el que atiende puede tipear otro número en el momento.
 */

/** Clave de caché de la plantilla (compartida por todas las aperturas). */
const QK_PLANTILLA = ['preferencia', CLAVE_MENSAJE_DOCUMENTO]

/** Contacto que trae el propio documento, según qué campos usa su plantilla. */
function contactoDelDocumento(doc: DocumentoGenerado): { telefono: string; email: string } {
  const campos = moduloDe(doc.tipo)?.camposCliente
  const datos = doc.datos ?? {}
  const leer = (campo?: string) => {
    const valor = campo ? datos[campo] : undefined
    return typeof valor === 'string' ? valor.trim() : ''
  }
  return { telefono: leer(campos?.telefono), email: leer(campos?.email) }
}

export function EnviarDocumentoModal({
  doc,
  onCerrar,
}: {
  /** Documento a enviar; `null` mantiene el modal cerrado. */
  doc: DocumentoGenerado | null
  onCerrar: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [bajando, setBajando] = useState(false)
  const [msgOpen, setMsgOpen] = useState(false)

  // Documento que se muestra. Se recuerda el último mientras el modal se
  // cierra: si el contenido se fuera junto con `doc`, el panel quedaría en
  // blanco durante la animación de salida.
  const ultimo = useRef<DocumentoGenerado | null>(null)
  if (doc) ultimo.current = doc
  const visible = doc ?? ultimo.current

  // El modal queda montado entre aperturas: al abrir OTRO documento se
  // precargan los contactos con lo que traiga ESE papel (al cerrar no se tocan,
  // para que no parpadeen mientras se va).
  const docId = doc?.id
  useEffect(() => {
    if (!doc) return
    const contacto = contactoDelDocumento(doc)
    setTelefono(contacto.telefono)
    setEmail(contacto.email)
    // Solo al cambiar de documento (no en cada render del mismo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  // Documentos que no piden contacto (una compraventa lleva DNI, no teléfono):
  // se busca al cliente en la base compartida por su documento o su nombre.
  const aBuscar = (visible?.cliente_documento || visible?.cliente || '').trim()
  const { data: enBase = [] } = useQuery({
    queryKey: ['documentos-contacto', aBuscar],
    queryFn: () => buscarClientesDocumento(aBuscar),
    enabled: doc != null && aBuscar.length >= 2,
    staleTime: 60 * 1000,
  })
  useEffect(() => {
    if (!enBase.length) return
    // Con DNI cargado, solo vale el cliente de ESE documento; si no, el primero
    // que coincida por nombre. Nunca pisa lo que ya está escrito.
    const dni = (visible?.cliente_documento || '').replace(/\D/g, '')
    const cliente = dni ? enBase.find((c) => c.doc_numero === dni) : enBase[0]
    if (!cliente) return
    if (cliente.telefono) setTelefono((actual) => actual || cliente.telefono)
    if (cliente.email) setEmail((actual) => actual || cliente.email)
  }, [enBase, visible?.cliente_documento])

  // Plantilla del mensaje: preferencia GLOBAL del backend (vale para todos los
  // usuarios y dispositivos). Sin personalizar, cargando o con error, se usa el
  // texto por defecto y el botón sigue funcionando.
  const { data: pref } = useQuery({
    queryKey: QK_PLANTILLA,
    queryFn: () => obtenerPreferencia(CLAVE_MENSAJE_DOCUMENTO),
    enabled: doc != null,
    staleTime: 5 * 60 * 1000,
  })
  const plantilla = plantillaEfectiva(pref?.valor)

  const guardarMensaje = useMutation({
    // Guardar el texto default equivale a «sin personalizar»: se manda vacío,
    // así futuras mejoras del default llegan solas a quien nunca lo tocó.
    mutationFn: (nueva: string) =>
      guardarPreferencia(
        CLAVE_MENSAJE_DOCUMENTO,
        nueva.trim() === PLANTILLA_DOCUMENTO_DEFAULT ? '' : nueva,
      ),
    onSuccess: (guardada) => {
      qc.setQueryData(QK_PLANTILLA, guardada)
      setMsgOpen(false)
      toast.success('Mensaje guardado', 'Vale para todos los usuarios y dispositivos.')
    },
    onError: (e) => toast.error('No se pudo guardar', (e as Error).message),
  })

  const mensaje = useMemo(
    () => (visible ? construirMensajeDocumento(plantilla, valoresDeDocumento(visible)) : ''),
    [visible, plantilla],
  )

  /** Abre WhatsApp con el mensaje precargado (el archivo se adjunta a mano). */
  function enviarWhatsapp() {
    if (!visible) return
    const crudo = telefono.trim()
    const numero = crudo ? waNumeroArgentino(crudo) : null
    if (crudo && !numero) {
      toast.error(
        'Teléfono inválido',
        'No parece un celular argentino. Probá con área y número, ej.: 381 555-4433.',
      )
      return
    }
    window.open(waLink(mensaje, numero), '_blank', 'noopener,noreferrer')
  }

  /** Manda el mail: el backend adjunta el archivo guardado de este documento. */
  async function enviarEmail() {
    if (!visible || !email.trim() || enviando) return
    setEnviando(true)
    try {
      const r = await enviarDocumentoEmail(visible.id, email.trim(), mensaje)
      toast.success('Documento enviado', r.detail)
    } catch (e) {
      toast.error('No se pudo enviar', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  /** Baja el archivo para poder adjuntarlo en el chat de WhatsApp. */
  async function descargar() {
    if (!visible || bajando) return
    setBajando(true)
    try {
      descargarBlob(
        await obtenerArchivoBlob(visible.id),
        visible.nombre_archivo || `${visible.tipo}-${visible.id}`,
      )
    } catch (e) {
      console.error(e)
      toast.error('No se pudo descargar', 'Puede que el archivo ya no esté en el servidor.')
    } finally {
      setBajando(false)
    }
  }

  const subtitulo = [
    visible?.tipo_nombre,
    visible?.referencia && `N° ${visible.referencia}`,
    visible?.cliente,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <Modal open={doc != null} onClose={onCerrar} size="lg" labelledBy="titulo-enviar-doc">
        {visible && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-on-ink">
                  <Send className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <h2
                    id="titulo-enviar-doc"
                    className="text-base font-semibold leading-tight text-ink-950"
                  >
                    Enviar documento
                  </h2>
                  <p className="truncate text-xs text-ink-400">{subtitulo}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCerrar}
                aria-label="Cerrar"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-4">
              {/* El texto que se va a enviar, tal cual, por los dos canales. */}
              <section>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
                    Mensaje
                  </p>
                  <button
                    type="button"
                    onClick={() => setMsgOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                </div>
                <div className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-canvas/60 p-3.5 text-sm leading-relaxed text-ink-700">
                  {mensaje}
                </div>
              </section>

              {/* WhatsApp */}
              <section className="space-y-1.5">
                <label
                  htmlFor="enviar-doc-tel"
                  className="block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400"
                >
                  WhatsApp
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="enviar-doc-tel"
                    type="tel"
                    inputMode="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="Número del cliente (381 555-4433)"
                    className="flex-1 text-base sm:text-sm"
                  />
                  <Button variant="outline" onClick={enviarWhatsapp}>
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </Button>
                </div>
                <p className="text-xs text-ink-400">
                  Se abre tu WhatsApp con el mensaje listo para enviar. El archivo adjuntalo en el
                  chat: descargalo con el botón de abajo. Sin número, elegís el chat en WhatsApp.
                </p>
              </section>

              {/* Email */}
              <section className="space-y-1.5">
                <label
                  htmlFor="enviar-doc-mail"
                  className="block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400"
                >
                  Email
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="enviar-doc-mail"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Correo del cliente (cliente@correo.com)"
                    className="flex-1 text-base sm:text-sm"
                  />
                  <Button variant="outline" onClick={enviarEmail} disabled={enviando || !email.trim()}>
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {enviando ? 'Enviando…' : 'Enviar'}
                  </Button>
                </div>
                <p className="text-xs text-ink-400">
                  El correo sale con el documento ya adjunto (el mismo archivo que se descargó).
                </p>
              </section>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" size="sm" onClick={descargar} disabled={bajando}>
                {bajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Descargar para adjuntar
              </Button>
              <Button variant="outline" onClick={onCerrar}>
                Cerrar
              </Button>
            </div>
          </>
        )}
      </Modal>

      <MensajeWhatsappModal
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        valorActual={plantilla}
        onGuardar={(nueva) => guardarMensaje.mutate(nueva)}
        subtitulo="El texto con el que se envían los documentos por WhatsApp y por email."
        variables={VARIABLES_DOCUMENTO}
        plantillaDefault={PLANTILLA_DOCUMENTO_DEFAULT}
        construirPreview={(p) => construirMensajeDocumento(p, EJEMPLO_DOCUMENTO)}
        notaPreview="Ejemplo con un documento de muestra. Al enviar, cada variable se reemplaza por los datos reales; los renglones cuyo dato no exista se borran solos."
        rows={9}
      />
    </>
  )
}
