import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IdCard, Loader2, Mail, Phone, Search, UserSearch } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { buscarClientesDocumento, type ClienteSugerido } from '@/services/documentos'

/**
 * Buscador de clientes ya guardados para completar el papel de un saque.
 *
 * Vive fuera de la hoja a propósito: los "papeles" son una reproducción del
 * formulario impreso (campos posicionados sobre una hoja escalada), así que un
 * desplegable adentro se vería deformado. Acá se elige y la página aplica los
 * datos a los campos que esa plantilla tenga.
 */
export function BuscarClienteModal({
  abierto,
  documento,
  completa,
  onCerrar,
  onElegir,
}: {
  abierto: boolean
  /** Nombre de la plantilla activa, para que se vea dónde se van a cargar. */
  documento: string
  /** Qué campos completa esta plantilla ("nombre, DNI y teléfono"). */
  completa: string
  onCerrar: () => void
  onElegir: (cliente: ClienteSugerido) => void
}) {
  const [texto, setTexto] = useState('')
  const [termino, setTermino] = useState('')

  useEffect(() => {
    if (!abierto) return
    setTexto('')
    setTermino('')
  }, [abierto])

  // Se consulta cuando la escritura se frena, no en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setTermino(texto), 250)
    return () => clearTimeout(t)
  }, [texto])

  const buscando = termino.trim().length >= 2
  const { data: clientes = [], isFetching, isError } = useQuery({
    queryKey: ['doc-clientes', termino.trim()],
    queryFn: () => buscarClientesDocumento(termino),
    enabled: abierto && buscando,
  })

  return (
    <Modal open={abierto} onClose={onCerrar} size="lg" labelledBy="buscar-cliente-titulo">
      <div className="border-b border-line px-5 py-4">
        <h2
          id="buscar-cliente-titulo"
          className="flex items-center gap-2 text-lg font-semibold text-ink-950"
        >
          <UserSearch className="h-4.5 w-4.5 shrink-0 text-ink-500" aria-hidden />
          Traer un cliente
        </h2>
        <p className="text-xs text-ink-400">
          De la base del negocio (facturas, ventas y documentos anteriores). Se completa{' '}
          <b className="text-ink-600">{completa}</b> en {documento}.
        </p>
      </div>

      <div className="space-y-3 px-5 py-5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, DNI, teléfono o mail"
            aria-label="Buscar cliente"
            autoComplete="off"
            data-autofocus
            className="pl-10"
          />
        </div>

        <div className="min-h-[8rem]">
          {!buscando ? (
            <p className="rounded-xl bg-ink-50 px-3 py-3 text-xs text-ink-400">
              Escribí al menos dos letras (o los primeros números del DNI).
            </p>
          ) : isFetching ? (
            <p className="flex items-center gap-2 px-1 py-3 text-xs text-ink-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
            </p>
          ) : isError ? (
            <p className="rounded-xl bg-ink-50 px-3 py-3 text-xs text-ink-600">
              No se pudo buscar. Revisá la conexión y probá de nuevo.
            </p>
          ) : clientes.length === 0 ? (
            <p className="rounded-xl bg-ink-50 px-3 py-3 text-xs text-ink-400">
              Sin clientes que coincidan con «{termino.trim()}». Cargá los datos a mano: al
              exportar, el cliente queda guardado para la próxima.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {clientes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onElegir(c)}
                    className="flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left transition-colors hover:bg-ink-50 focus-visible:bg-ink-50 focus-visible:outline-none"
                  >
                    <span className="w-full truncate text-sm font-medium text-ink-900">
                      {c.nombre}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-400">
                      {c.doc_numero && (
                        <span className="tnum inline-flex items-center gap-1">
                          <IdCard className="h-3 w-3" aria-hidden />
                          {c.doc_numero}
                        </span>
                      )}
                      {c.telefono && (
                        <span className="tnum inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" aria-hidden />
                          {c.telefono}
                        </span>
                      )}
                      {c.email && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Mail className="h-3 w-3 shrink-0" aria-hidden />
                          <span className="truncate">{c.email}</span>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-line pt-3.5">
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
