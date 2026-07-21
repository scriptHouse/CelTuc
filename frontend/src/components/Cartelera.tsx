import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCheck,
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Film,
  History,
  Image as ImageIcon,
  Megaphone,
  Paperclip,
  Pin,
  PinOff,
  Send,
  Trash2,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  actualizarComunicado,
  descargarAdjunto,
  eliminarComunicado,
  listarComunicados,
  marcarVisto,
  obtenerAdjuntoBlob,
  publicarComunicado,
  MAX_ADJUNTOS,
  MAX_TAMANIO_ADJUNTO,
  type ArchivoComunicado,
  type Comunicado,
} from '@/services/comunicados'
import { fechaHora } from '@/lib/format'
import { cn } from '@/lib/utils'
import { esAdmin } from '@/lib/permisos'
import { useAuth } from '@/store/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * Cartelera de comunicación interna del Panel.
 *
 * El último comunicado (o el fijado) se muestra como un cartel protagonista;
 * el resto queda en el historial, con sus archivos y sus constancias de
 * lectura (quién lo vio y cuándo). Solo los administradores publican.
 */

function pesoLegible(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function iconoPorContenido(contentType: string, nombre: string): LucideIcon {
  const ct = contentType.toLowerCase()
  const ext = nombre.toLowerCase()
  if (ct.startsWith('image/')) return ImageIcon
  if (ct.startsWith('video/')) return Film
  if (ct.includes('sheet') || ct.includes('excel') || /\.(xlsx?|csv)$/.test(ext)) return FileSpreadsheet
  if (ct.includes('pdf') || ct.startsWith('text/')) return FileText
  return Paperclip
}

/** Baja el adjunto autenticado una sola vez y lo expone como object URL. */
function useAdjuntoUrl(id: number): string | undefined {
  const { data: blob } = useQuery({
    queryKey: ['comunicado-adjunto', id],
    queryFn: () => obtenerAdjuntoBlob(id),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  })
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const objeto = URL.createObjectURL(blob)
    setUrl(objeto)
    return () => URL.revokeObjectURL(objeto)
  }, [blob])
  return url
}

export function Cartelera() {
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: comunicados = [], isLoading } = useQuery({
    queryKey: ['comunicados'],
    queryFn: listarComunicados,
  })

  const [historialAbierto, setHistorialAbierto] = useState(false)
  const [composerAbierto, setComposerAbierto] = useState(false)

  const vistoMut = useMutation({
    mutationFn: (id: number) => marcarVisto(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comunicados'] }),
    onError: (e: Error) => toast.error('No se pudo marcar como visto', e.message),
  })

  if (isLoading) {
    return <Skeleton className="ct-rise mb-5 h-48 w-full rounded-2xl" />
  }

  const destacado = comunicados[0]
  if (!destacado && !admin) return null

  return (
    <section className="ct-rise mb-5">
      {destacado ? (
        <div className="relative overflow-hidden rounded-2xl bg-ink-950 text-on-ink shadow-[0_18px_50px_rgba(10,10,11,0.28)]">
          {/* Brillos decorativos (solo estética, no interceptan clics) */}
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-on-ink/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-on-ink/5 blur-3xl" />

          <div className="relative space-y-4 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-on-ink/15">
                  <Megaphone className="h-5 w-5" />
                </span>
                <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-on-ink/70">
                  Cartelera · Comunicación interna
                </span>
                {!destacado.leido_por_mi && (
                  <span className="relative flex items-center gap-1.5 rounded-full bg-on-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-950">
                    Nuevo
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {admin && (
                  <button
                    type="button"
                    onClick={() => setComposerAbierto(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-on-ink px-3.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-on-ink/90"
                  >
                    <Megaphone className="h-4 w-4" />
                    Publicar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setHistorialAbierto(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-on-ink/25 px-3.5 text-sm font-medium text-on-ink transition-colors hover:bg-on-ink/10"
                >
                  <History className="h-4 w-4" />
                  Historial
                </button>
              </div>
            </div>

            <div>
              <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-snug sm:text-2xl">
                {destacado.fijado && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-on-ink/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-ink/90">
                    <Pin className="h-3 w-3" /> Fijado
                  </span>
                )}
                {destacado.titulo}
              </h2>
              {destacado.cuerpo && (
                <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-on-ink/80">
                  {destacado.cuerpo}
                </p>
              )}
            </div>

            <AdjuntosGaleria archivos={destacado.archivos} oscuro />

            <div className="flex flex-col gap-3 border-t border-on-ink/15 pt-3.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-on-ink/60">
                Publicado por <span className="font-medium text-on-ink/90">{destacado.publicado_por}</span>
                {' · '}
                <span className="tnum">{fechaHora(destacado.creado)}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setHistorialAbierto(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-on-ink/70 transition-colors hover:text-on-ink"
                  title="Ver quién lo vio y cuándo"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Visto por {destacado.total_lecturas}
                </button>
                {destacado.leido_por_mi ? (
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-on-ink/10 px-3.5 text-sm font-medium text-on-ink/80">
                    <CheckCheck className="h-4 w-4" />
                    Ya lo viste
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => vistoMut.mutate(destacado.id)}
                    disabled={vistoMut.isPending}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-on-ink px-3.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-on-ink/90 disabled:opacity-60"
                  >
                    <CheckCheck className="h-4 w-4" />
                    {vistoMut.isPending ? 'Marcando…' : 'Marcar como visto'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-line bg-surface px-5 py-7 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink-950 text-on-ink">
              <Megaphone className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900">La cartelera está vacía</p>
              <p className="text-xs text-ink-400">
                Publicá el primer comunicado para el equipo: novedades, horarios, planillas, fotos o videos.
              </p>
            </div>
          </div>
          <Button onClick={() => setComposerAbierto(true)}>
            <Megaphone className="h-4 w-4" />
            Publicar
          </Button>
        </div>
      )}

      <HistorialModal
        open={historialAbierto}
        comunicados={comunicados}
        admin={admin}
        onClose={() => setHistorialAbierto(false)}
      />
      {admin && <ComposerModal open={composerAbierto} onClose={() => setComposerAbierto(false)} />}
    </section>
  )
}

// ===== Adjuntos ==============================================================

function AdjuntosGaleria({ archivos, oscuro }: { archivos: ArchivoComunicado[]; oscuro?: boolean }) {
  const imagenes = archivos.filter((a) => a.tipo === 'imagen')
  const videos = archivos.filter((a) => a.tipo === 'video')
  const otros = archivos.filter((a) => a.tipo === 'archivo')
  if (archivos.length === 0) return null
  return (
    <div className="space-y-3">
      {imagenes.length > 0 && (
        <div className={cn('grid gap-2.5', imagenes.length > 1 && 'grid-cols-2 sm:grid-cols-3')}>
          {imagenes.map((a) => (
            <AdjuntoImagen key={a.id} adjunto={a} sola={imagenes.length === 1} />
          ))}
        </div>
      )}
      {videos.map((a) => (
        <AdjuntoVideo key={a.id} adjunto={a} />
      ))}
      {otros.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {otros.map((a) => (
            <ChipArchivo key={a.id} adjunto={a} oscuro={oscuro} />
          ))}
        </div>
      )}
    </div>
  )
}

function AdjuntoImagen({ adjunto, sola }: { adjunto: ArchivoComunicado; sola: boolean }) {
  const url = useAdjuntoUrl(adjunto.id)
  if (!url) return <Skeleton className={cn('w-full rounded-xl', sola ? 'h-56' : 'aspect-[4/3]')} />
  return (
    <button
      type="button"
      onClick={() => window.open(url, '_blank', 'noopener')}
      title={`Ver ${adjunto.nombre}`}
      className="group block w-full overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400"
    >
      <img
        src={url}
        alt={adjunto.nombre}
        className={cn(
          'w-full transition-transform duration-300 group-hover:scale-[1.02]',
          sola ? 'max-h-96 object-contain' : 'aspect-[4/3] object-cover',
        )}
      />
    </button>
  )
}

function AdjuntoVideo({ adjunto }: { adjunto: ArchivoComunicado }) {
  const url = useAdjuntoUrl(adjunto.id)
  if (!url) return <Skeleton className="aspect-video w-full rounded-xl" />
  return (
    <video src={url} controls preload="metadata" className="max-h-96 w-full rounded-xl bg-black">
      {adjunto.nombre}
    </video>
  )
}

function ChipArchivo({ adjunto, oscuro }: { adjunto: ArchivoComunicado; oscuro?: boolean }) {
  const toast = useToast()
  const [bajando, setBajando] = useState(false)
  const Icono = iconoPorContenido(adjunto.content_type, adjunto.nombre)

  async function bajar() {
    setBajando(true)
    try {
      await descargarAdjunto(adjunto)
    } catch (e) {
      toast.error('No se pudo descargar', (e as Error).message)
    } finally {
      setBajando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={bajar}
      disabled={bajando}
      title={`Descargar ${adjunto.nombre}`}
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-60',
        oscuro
          ? 'border-on-ink/25 bg-on-ink/10 text-on-ink hover:bg-on-ink/15'
          : 'border-line bg-surface text-ink-700 hover:border-ink-300',
      )}
    >
      <Icono className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate font-medium">{adjunto.nombre}</span>
      <span className={cn('tnum shrink-0 text-xs', oscuro ? 'text-on-ink/60' : 'text-ink-400')}>
        {pesoLegible(adjunto.tamanio)}
      </span>
      <Download className="h-3.5 w-3.5 shrink-0" />
    </button>
  )
}

// ===== Historial =============================================================

function HistorialModal({
  open,
  comunicados,
  admin,
  onClose,
}: {
  open: boolean
  comunicados: Comunicado[]
  admin: boolean
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">Historial de la cartelera</h2>
        <p className="text-xs text-ink-400">
          Todos los comunicados, con sus archivos y las constancias de lectura (quién y cuándo).
        </p>
      </div>
      <div className="divide-y divide-line overflow-y-auto">
        {comunicados.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-400">Todavía no hay comunicados.</p>
        ) : (
          comunicados.map((c) => <ItemHistorial key={c.id} comunicado={c} admin={admin} />)
        )}
      </div>
      <div className="flex justify-end border-t border-line px-5 py-4">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  )
}

function ItemHistorial({ comunicado: c, admin }: { comunicado: Comunicado; admin: boolean }) {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [verLecturas, setVerLecturas] = useState(false)

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['comunicados'] })

  const fijarMut = useMutation({
    mutationFn: () => actualizarComunicado(c.id, { fijado: !c.fijado }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error('No se pudo actualizar', e.message),
  })

  const eliminarMut = useMutation({
    mutationFn: () => eliminarComunicado(c.id),
    onSuccess: () => {
      invalidar()
      toast.success('Comunicado eliminado', 'Queda guardado en la base con sus lecturas.')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  async function handleEliminar() {
    const ok = await confirm({
      title: '¿Eliminar el comunicado?',
      description: `"${c.titulo}" sale de la cartelera. El registro y sus lecturas quedan guardados en la base.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) eliminarMut.mutate()
  }

  return (
    <div className="space-y-2.5 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-900">
            {c.fijado && <Pin className="h-3.5 w-3.5 shrink-0 text-ink-500" />}
            {c.titulo}
          </p>
          <p className="text-xs text-ink-400">
            {c.publicado_por} · <span className="tnum">{fechaHora(c.creado)}</span>
          </p>
        </div>
        {admin && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => fijarMut.mutate()}
              disabled={fijarMut.isPending}
              aria-label={c.fijado ? 'Desfijar' : 'Fijar arriba'}
              title={c.fijado ? 'Desfijar' : 'Fijar arriba de la cartelera'}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {c.fijado ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleEliminar}
              disabled={eliminarMut.isPending}
              aria-label="Eliminar"
              title="Eliminar de la cartelera"
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {c.cuerpo && <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{c.cuerpo}</p>}

      <AdjuntosGaleria archivos={c.archivos} />

      <div>
        <button
          type="button"
          onClick={() => setVerLecturas((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          <Eye className="h-3.5 w-3.5" />
          Visto por {c.total_lecturas} {c.total_lecturas === 1 ? 'persona' : 'personas'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', verLecturas && 'rotate-180')} />
        </button>
        {verLecturas &&
          (c.lecturas.length > 0 ? (
            <ul className="mt-2 space-y-1.5 rounded-xl bg-ink-50 px-3.5 py-2.5">
              {c.lecturas.map((l) => (
                <li key={`${l.usuario}-${l.fecha}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-medium text-ink-800">{l.usuario}</span>
                  <span className="tnum shrink-0 text-ink-400">{fechaHora(l.fecha)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ink-400">Nadie lo marcó como visto todavía.</p>
          ))}
      </div>
    </div>
  )
}

// ===== Publicar (solo admin) =================================================

function ComposerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [fijado, setFijado] = useState(false)
  const [archivos, setArchivos] = useState<File[]>([])
  const [arrastrando, setArrastrando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTitulo('')
    setCuerpo('')
    setFijado(false)
    setArchivos([])
    setArrastrando(false)
  }, [open])

  const publicarMut = useMutation({
    mutationFn: () =>
      publicarComunicado({
        titulo: titulo.trim(),
        cuerpo: cuerpo.trim() || undefined,
        fijado,
        archivos,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comunicados'] })
      toast.success('Comunicado publicado', titulo.trim())
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo publicar', e.message),
  })

  function agregarArchivos(nuevos: FileList | File[]) {
    const lista = [...archivos]
    for (const f of Array.from(nuevos)) {
      if (lista.length >= MAX_ADJUNTOS) {
        toast.error('Demasiados archivos', `Máximo ${MAX_ADJUNTOS} por comunicado.`)
        break
      }
      if (f.size > MAX_TAMANIO_ADJUNTO) {
        toast.error('Archivo muy pesado', `"${f.name}" supera los 19 MB.`)
        continue
      }
      lista.push(f)
    }
    const total = lista.reduce((a, f) => a + f.size, 0)
    if (total > MAX_TAMANIO_ADJUNTO) {
      toast.error('Publicación muy pesada', 'Entre todos los archivos no pueden superar los 19 MB.')
      return
    }
    setArchivos(lista)
  }

  function submit() {
    if (!titulo.trim()) {
      toast.error('Falta el título', 'Poné un título al comunicado.')
      return
    }
    publicarMut.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">Publicar en la cartelera</h2>
        <p className="text-xs text-ink-400">
          Lo ve todo el equipo en el Panel; cada persona puede marcarlo como visto y queda la constancia.
        </p>
      </div>

      <div className="space-y-4 overflow-y-auto px-5 py-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">Título</label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej.: Nuevo horario de atención"
            maxLength={160}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">Mensaje (opcional)</label>
          <Textarea
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder="Escribí el comunicado para el equipo…"
            className="min-h-[110px]"
          />
        </div>

        {/* Zona de adjuntos: clic o arrastrar y soltar */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setArrastrando(true)
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastrando(false)
            agregarArchivos(e.dataTransfer.files)
          }}
          className={cn(
            'cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
            arrastrando ? 'border-ink-950 bg-ink-50' : 'border-line hover:border-ink-300',
          )}
        >
          <Upload className="mx-auto h-6 w-6 text-ink-400" />
          <p className="mt-1.5 text-sm font-medium text-ink-700">
            Arrastrá archivos acá o hacé clic para elegirlos
          </p>
          <p className="text-xs text-ink-400">
            Imágenes, videos, planillas, PDF… hasta {MAX_ADJUNTOS} archivos y 19 MB en total.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) agregarArchivos(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {archivos.length > 0 && (
          <ul className="space-y-2">
            {archivos.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                <MiniaturaArchivo archivo={f} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{f.name}</p>
                  <p className="tnum text-xs text-ink-400">{pesoLegible(f.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setArchivos((lista) => lista.filter((_, j) => j !== i))}
                  aria-label={`Quitar ${f.name}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={fijado}
            onChange={(e) => setFijado(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong accent-ink-950"
          />
          Fijar arriba de la cartelera
        </label>
      </div>

      <div className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={publicarMut.isPending}>
          <Send className="h-4 w-4" />
          {publicarMut.isPending ? 'Publicando…' : 'Publicar'}
        </Button>
      </div>
    </Modal>
  )
}

function MiniaturaArchivo({ archivo }: { archivo: File }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!archivo.type.startsWith('image/')) return
    const objeto = URL.createObjectURL(archivo)
    setUrl(objeto)
    return () => URL.revokeObjectURL(objeto)
  }, [archivo])

  if (url) return <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
  const Icono = iconoPorContenido(archivo.type, archivo.name)
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500">
      <Icono className="h-5 w-5" />
    </span>
  )
}
