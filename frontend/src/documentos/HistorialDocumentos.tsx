import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Building2,
  CalendarDays,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  Search,
  Send,
  Trash2,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { descargarBlob } from '@/lib/descargar'
import { money, num, pad } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  eliminarDocumento,
  obtenerArchivoBlob,
  listarDocumentos,
  type DocumentoGenerado,
  type FormatoDocumento,
} from '@/services/documentos'
import { SUCURSALES_DOC } from './content'
import { DOC_MODULES } from './registry'
import { EnviarDocumentoModal } from './EnviarDocumentoModal'
import { ExportarTablaModal, type GestorExport } from '@/components/exportar/ExportarTablaModal'

/**
 * Historial de documentos generados: la pestaña "Archivo" del módulo.
 *
 * Cada renglón es una exportación real (con su archivo guardado en el
 * servidor). Un empleado ve las suyas; un administrador, las de todo el
 * equipo. Eliminar es borrado lógico y solo para administradores.
 */

const LIMITE = 30

/** Clave raíz de la caché: la página la invalida al archivar una exportación. */
export const QK_HISTORIAL = 'documentos-historial'

const ICONO_FORMATO: Record<FormatoDocumento, LucideIcon> = {
  pdf: FileText,
  xlsx: FileSpreadsheet,
  pos80: Printer,
}

const FORMATOS = [
  { value: '', label: 'Todos los formatos' },
  { value: 'pdf', label: 'PDF' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'pos80', label: 'Ticket POS80' },
]

type Rango = 'hoy' | '7d' | '30d' | 'todo'

const RANGOS: { value: Rango; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'todo', label: 'Todo' },
]

/** Fecha local `aaaa-mm-dd` desde la que abarca el rango elegido. */
function desdeDelRango(rango: Rango): string | undefined {
  if (rango === 'todo') return undefined
  const d = new Date()
  if (rango === '7d') d.setDate(d.getDate() - 6)
  if (rango === '30d') d.setDate(d.getDate() - 29)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`
}

/** "Hoy", "Ayer" o "martes 29 de julio" para los separadores del historial. */
function etiquetaDia(iso: string): string {
  const d = new Date(iso)
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  if (d.toDateString() === hoy.toDateString()) return 'Hoy'
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  const texto = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function peso(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Qué se puede exportar del historial (botón «Exportar»: lo cargado en pantalla). */
const GESTOR_EXPORT_HISTORIAL: GestorExport<DocumentoGenerado> = {
  id: 'documentos-historial',
  titulo: 'Historial de documentos',
  nombreArchivo: 'documentos-{fecha}',
  columnas: [
    { id: 'creado', label: 'Fecha y hora', corto: 'Fecha', tipo: 'fechahora', peso: 17, valor: (d) => d.creado },
    { id: 'tipo', label: 'Documento', tipo: 'texto', peso: 20, valor: (d) => d.tipo_nombre },
    { id: 'referencia', label: 'N° / referencia', corto: 'N°', tipo: 'texto', peso: 11, valor: (d) => d.referencia || '' },
    { id: 'cliente', label: 'Cliente', tipo: 'texto', peso: 22, valor: (d) => d.cliente || '' },
    { id: 'detalle', label: 'Detalle', tipo: 'texto', peso: 26, valor: (d) => d.detalle || '' },
    {
      id: 'total',
      label: 'Importe',
      tipo: 'ars',
      peso: 14,
      totalizable: true,
      valor: (d) => (d.total === null || d.total === '' ? null : Number(d.total)),
    },
    { id: 'formato', label: 'Formato', tipo: 'texto', peso: 10, valor: (d) => d.formato_display },
    { id: 'sucursal', label: 'Sucursal', tipo: 'texto', peso: 14, valor: (d) => d.sucursal || '' },
    {
      id: 'autor',
      label: 'Generado por',
      corto: 'Por',
      tipo: 'texto',
      peso: 14,
      valor: (d) => d.generado_por?.username ?? '',
    },
    {
      id: 'cliente_documento',
      label: 'Documento del cliente',
      corto: 'DNI/CUIT',
      tipo: 'texto',
      peso: 13,
      opcional: true,
      valor: (d) => d.cliente_documento || '',
    },
    {
      id: 'archivo',
      label: 'Archivo',
      tipo: 'texto',
      peso: 26,
      opcional: true,
      valor: (d) => d.nombre_archivo || '',
    },
    { id: 'id', label: 'ID interno', corto: 'ID', tipo: 'entero', peso: 8, opcional: true, valor: (d) => d.id },
  ],
  grupos: [
    { id: 'tipo', label: 'Documento', valor: (d) => d.tipo_nombre },
    { id: 'sucursal', label: 'Sucursal', valor: (d) => d.sucursal || 'Sin sucursal' },
    { id: 'autor', label: 'Generado por', valor: (d) => d.generado_por?.username ?? 'Sin usuario' },
  ],
}

export function HistorialDocumentos({ tipoInicial = '' }: { tipoInicial?: string }) {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const esAdmin = useAuth((s) => Boolean(s.usuario?.es_administrador))

  // Búsqueda con un pequeño debounce para no consultar en cada tecla.
  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQ(busqueda.trim()), 350)
    return () => clearTimeout(timer)
  }, [busqueda])

  // `tipoInicial` permite llegar ya filtrado (p. ej. "ver anteriores" desde el
  // editor de un documento con cupón correlativo). El filtro sigue editable.
  const [tipo, setTipo] = useState(tipoInicial)
  const [formato, setFormato] = useState('')
  const [sucursal, setSucursal] = useState('')
  const [usuario, setUsuario] = useState('')
  const [rango, setRango] = useState<Rango>('30d')
  // Documento que se está por enviar (WhatsApp / email). El modal se monta una
  // sola vez para todo el listado, no uno por renglón.
  const [aEnviar, setAEnviar] = useState<DocumentoGenerado | null>(null)
  const [exportarAbierto, setExportarAbierto] = useState(false)

  const { data, isLoading, isFetching, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: [QK_HISTORIAL, q, tipo, formato, sucursal, usuario, rango],
      queryFn: ({ pageParam }) =>
        listarDocumentos({
          q, tipo, formato, sucursal, usuario,
          desde: desdeDelRango(rango),
          limit: LIMITE,
          offset: pageParam,
        }),
      initialPageParam: 0,
      getNextPageParam: (ultima, paginas) => {
        const cargados = paginas.reduce((n, p) => n + p.resultados.length, 0)
        return cargados < ultima.total ? cargados : undefined
      },
      placeholderData: keepPreviousData,
    })

  const primera = data?.pages[0]
  const documentos = useMemo(() => data?.pages.flatMap((p) => p.resultados) ?? [], [data])
  const resumen = primera?.resumen
  const autores = primera?.usuarios ?? []
  const sucursalesUsadas = primera?.sucursales ?? []

  // Agrupado por día calendario, en el orden en que ya vienen (descendente).
  const porDia = useMemo(() => {
    const grupos: { dia: string; filas: DocumentoGenerado[] }[] = []
    for (const doc of documentos) {
      const dia = etiquetaDia(doc.creado)
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo.dia === dia) ultimo.filas.push(doc)
      else grupos.push({ dia, filas: [doc] })
    }
    return grupos
  }, [documentos])

  const hayFiltros = Boolean(q || tipo || formato || sucursal || usuario || rango !== 'todo')

  // Cómo describir en el archivo exportado lo que se estaba viendo.
  const contextoExport = useMemo(() => {
    const partes: string[] = []
    if (q) partes.push(`Búsqueda: «${q}»`)
    if (tipo) partes.push(`Documento: ${DOC_MODULES.find((m) => m.id === tipo)?.nombre ?? tipo}`)
    if (formato) partes.push(`Formato: ${FORMATOS.find((f) => f.value === formato)?.label ?? formato}`)
    if (sucursal) partes.push(`Sucursal: ${sucursal}`)
    if (usuario) partes.push(`Generados por @${usuario}`)
    partes.push(`Rango: ${RANGOS.find((r) => r.value === rango)?.label ?? rango}`)
    if (primera && documentos.length < primera.total) {
      partes.push(`Los ${num(documentos.length)} más recientes de ${num(primera.total)}`)
    }
    return partes
  }, [q, tipo, formato, sucursal, usuario, rango, primera, documentos.length])

  const opcionesTipo = [
    { value: '', label: 'Todos los documentos' },
    ...DOC_MODULES.map((m) => ({ value: m.id, label: m.nombre })),
  ]
  // Las sucursales del filtro salen de lo que realmente se generó; si el
  // historial está vacío, se ofrecen las tres del encabezado.
  const opcionesSucursal = [
    { value: '', label: 'Todas las sucursales' },
    ...(sucursalesUsadas.length ? sucursalesUsadas : SUCURSALES_DOC.map((s) => s.nombre)).map(
      (s) => ({ value: s, label: s }),
    ),
  ]

  async function eliminar(doc: DocumentoGenerado) {
    const ok = await confirm({
      title: '¿Sacar del historial?',
      description: `"${doc.nombre_archivo || doc.tipo_nombre}" deja de aparecer en el archivo. Queda registrado en la auditoría quién lo sacó.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      tone: 'danger',
      icon: Trash2,
    })
    if (!ok) return
    try {
      await eliminarDocumento(doc.id)
      await qc.invalidateQueries({ queryKey: [QK_HISTORIAL] })
      toast.success('Documento eliminado', 'Salió del historial.')
    } catch (e) {
      console.error(e)
      toast.error('No se pudo eliminar', 'Probá de nuevo en un momento.')
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Métricas. En móvil van de a dos y la tercera ocupa el ancho completo:
          a tres columnas en un celular la etiqueta no entra al lado del ícono. */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(0)}
          label="Hoy"
          value={num(resumen?.hoy ?? 0)}
          icon={CalendarDays}
        />
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(1)}
          label="7 días"
          value={num(resumen?.semana ?? 0)}
          icon={Archive}
        />
        <StatCard
          className="ct-stagger-item col-span-2 sm:col-span-1"
          style={ctStagger(2)}
          label={primera?.puede_ver_todo ? 'Todo el equipo' : 'Mis documentos'}
          value={num(resumen?.total ?? 0)}
          hint={primera?.puede_ver_todo ? 'Historial completo' : 'Los que generaste vos'}
          icon={FileText}
        />
      </div>

      {/* Filtros: se apilan en móvil y van a 2 y 4 columnas al crecer. */}
      <Card className="mb-4 p-3 sm:p-4">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            placeholder="Buscar por cliente, DNI, cupón o equipo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-10 text-base sm:text-sm"
          />
        </div>
        <div
          className={cn(
            'grid gap-2.5 sm:grid-cols-2',
            esAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
          )}
        >
          <Select placeholder="Todos los documentos" value={tipo} onChange={setTipo} options={opcionesTipo} />
          <Select placeholder="Todos los formatos" value={formato} onChange={setFormato} options={FORMATOS} />
          <Select
            placeholder="Todas las sucursales"
            value={sucursal}
            onChange={setSucursal}
            options={opcionesSucursal}
          />
          {esAdmin && (
            <Select
              placeholder="Todo el equipo"
              value={usuario}
              onChange={setUsuario}
              options={[
                { value: '', label: 'Todo el equipo' },
                ...autores.map((u) => ({ value: u, label: `@${u}` })),
              ]}
            />
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {RANGOS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRango(r.value)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                rango === r.value
                  ? 'border-ink-950 bg-ink-950 text-on-ink'
                  : 'border-line text-ink-500 hover:border-line-strong hover:text-ink-900',
              )}
            >
              {r.label}
            </button>
          ))}
          {isFetching && !isFetchingNextPage && !isLoading && (
            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-ink-400" />
          )}
          <span className="ml-auto tnum text-xs text-ink-400">
            {primera ? `${num(documentos.length)} de ${num(primera.total)}` : ''}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportarAbierto(true)}
            disabled={documentos.length === 0}
          >
            <Download className="h-4 w-4" />
            Exportar listado
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <ArchivoSkeleton />
      ) : documentos.length === 0 ? (
        <EmptyState
          icon={Archive}
          title={hayFiltros ? 'Sin resultados' : 'El archivo está vacío'}
          description={
            hayFiltros
              ? 'Ningún documento coincide con los filtros. Probá ampliar el rango de fechas.'
              : 'Todavía no generaste ningún documento. Cada PDF, Excel o ticket que exportes queda guardado acá con su archivo.'
          }
        />
      ) : (
        <div className="space-y-5">
          {porDia.map((grupo, g) => (
            <section key={grupo.dia} className="ct-stagger-item" style={ctStagger(Math.min(g, 8))}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-400">
                {grupo.dia}
              </h2>
              <Card className="divide-y divide-line">
                {grupo.filas.map((doc) => (
                  <FilaDocumento
                    key={doc.id}
                    doc={doc}
                    mostrarAutor={Boolean(primera?.puede_ver_todo)}
                    puedeEliminar={esAdmin}
                    onEnviar={() => setAEnviar(doc)}
                    onEliminar={() => eliminar(doc)}
                  />
                ))}
              </Card>
            </section>
          ))}

          {hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando…
                  </>
                ) : (
                  'Cargar más'
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      <EnviarDocumentoModal doc={aEnviar} onCerrar={() => setAEnviar(null)} />
      <ExportarTablaModal
        abierto={exportarAbierto}
        onCerrar={() => setExportarAbierto(false)}
        gestor={GESTOR_EXPORT_HISTORIAL}
        filasVista={documentos}
        contextoVista={contextoExport}
      />
    </div>
  )
}

// ===== Renglón del archivo =====

function FilaDocumento({
  doc,
  mostrarAutor,
  puedeEliminar,
  onEnviar,
  onEliminar,
}: {
  doc: DocumentoGenerado
  mostrarAutor: boolean
  puedeEliminar: boolean
  onEnviar: () => void
  onEliminar: () => void
}) {
  const toast = useToast()
  const [bajando, setBajando] = useState<'ver' | 'descargar' | null>(null)
  const Icono = ICONO_FORMATO[doc.formato] ?? FileText
  const total = doc.total ? Number(doc.total) : null
  const nombre = doc.nombre_archivo || `${doc.tipo}-${doc.id}`

  /** El Excel no se puede ver en el navegador: para ese formato solo se baja. */
  const sePuedeVer = doc.formato !== 'xlsx'

  async function abrir() {
    if (bajando) return
    setBajando('ver')
    try {
      const blob = await obtenerArchivoBlob(doc.id)
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (win) {
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } else {
        // Pestaña emergente bloqueada: caemos a descarga.
        URL.revokeObjectURL(url)
        descargarBlob(blob, nombre)
      }
    } catch (e) {
      console.error(e)
      toast.error('No se pudo abrir el documento', 'Puede que el archivo ya no esté en el servidor.')
    } finally {
      setBajando(null)
    }
  }

  async function descargar() {
    if (bajando) return
    setBajando('descargar')
    try {
      descargarBlob(await obtenerArchivoBlob(doc.id), nombre)
    } catch (e) {
      console.error(e)
      toast.error('No se pudo descargar', 'Puede que el archivo ya no esté en el servidor.')
    } finally {
      setBajando(null)
    }
  }

  return (
    <div className="px-3 py-3 sm:px-5">
      {/* `flex-wrap` + base de 12rem para el contenido: en pantallas angostas
          los botones bajan solos a una segunda línea (alineados a la derecha)
          en vez de estrangular el texto; en escritorio va todo en un renglón. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-900"
          title={doc.formato_display}
        >
          <Icono className="h-4 w-4" strokeWidth={2} />
        </span>

        <div className="min-w-0 grow basis-48">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-ink-950">{doc.tipo_nombre}</span>
            <Badge tone="outline">{doc.formato_display}</Badge>
            {doc.referencia && (
              <span className="tnum text-xs text-ink-400">N° {doc.referencia}</span>
            )}
            {total !== null && (
              <span className="tnum ml-auto text-sm font-semibold text-ink-950">{money(total)}</span>
            )}
          </div>

          {(doc.cliente || doc.cliente_documento) && (
            <p className="mt-0.5 truncate text-sm text-ink-700">
              {doc.cliente || 'Sin nombre'}
              {doc.cliente_documento && (
                <span className="tnum text-ink-400"> · DNI {doc.cliente_documento}</span>
              )}
            </p>
          )}

          {doc.detalle && (
            <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{doc.detalle}</p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
            <span className="tnum">{hora(doc.creado)}</span>
            {doc.sucursal && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {doc.sucursal}
              </span>
            )}
            {mostrarAutor && doc.generado_por && (
              <span className="inline-flex items-center gap-1" title={doc.generado_por.nombre || undefined}>
                <User className="h-3 w-3" /> {doc.generado_por.username}
              </span>
            )}
            {doc.tamanio > 0 && <span className="tnum">{peso(doc.tamanio)}</span>}
          </div>
        </div>

        {/* Acciones: al envolver quedan pegadas a la derecha (`ml-auto`). */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onEnviar}
            title="Enviar por WhatsApp o email"
            aria-label={`Enviar ${nombre}`}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            <Send className="h-4 w-4" />
          </button>
          {sePuedeVer && (
            <button
              type="button"
              onClick={abrir}
              disabled={bajando !== null}
              title="Ver el documento"
              aria-label={`Ver ${nombre}`}
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 disabled:opacity-40"
            >
              {bajando === 'ver' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={descargar}
            disabled={bajando !== null}
            title="Descargar"
            aria-label={`Descargar ${nombre}`}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 disabled:opacity-40"
          >
            {bajando === 'descargar' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </button>
          {puedeEliminar && (
            <button
              type="button"
              onClick={onEliminar}
              title="Sacar del historial"
              aria-label={`Eliminar ${nombre}`}
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ArchivoSkeleton() {
  return (
    <div className="space-y-5">
      {[0, 1].map((s) => (
        <section key={s}>
          <Skeleton className="mb-2 h-3 w-24" />
          <Card className="divide-y divide-line">
            {[0, 1, 2].map((f) => (
              <div key={f} className="flex items-start gap-3 px-3 py-3.5 sm:px-5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  )
}
