import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Building2, Clock, Eraser, FileSpreadsheet, FileText, Hash, Loader2, PackagePlus, PenLine, Printer, Send, UserSearch } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import { SumarCompraventaInventario } from '@/components/SumarCompraventaInventario'
import { useAuth } from '@/store/auth'
import { descargarBlob } from '@/lib/descargar'
import { cn, ctStagger } from '@/lib/utils'
import { PaperScaler } from '@/documentos/PaperScaler'
import { SUCURSALES_DOC, SUCURSAL_DOC_POR_DEFECTO, direccionDeSucursal } from '@/documentos/content'
import { cvTieneEquipo, type CompraventaData } from '@/documentos/compraventaContent'
import { DOC_MODULES, PROXIMOS_DOCS } from '@/documentos/registry'
import { HistorialDocumentos, QK_HISTORIAL } from '@/documentos/HistorialDocumentos'
import { BuscarClienteModal } from '@/documentos/BuscarClienteModal'
import { EnviarDocumentoModal } from '@/documentos/EnviarDocumentoModal'
import {
  listarDocumentos,
  proximoCupon,
  registrarDocumento,
  type ClienteSugerido,
  type DocumentoArchivado,
  type DocumentoGenerado,
  type FormatoDocumento,
} from '@/services/documentos'

/** Clave de caché del próximo cupón correlativo (se invalida al archivar). */
const QK_PROXIMO_CUPON = 'documentos-proximo-cupon'

/** "19/08 14:30" para los cupones anteriores del editor. */
function fechaCorta(iso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${dia} ${hora}`
}

/** Sucursal del encabezado de todos los documentos. Como en la venta rápida:
 *  cada visita arranca en la del empleado logueado y elegir otra a mano vale
 *  solo para esa visita (no se recuerda en el dispositivo). */
const SUC_OPTIONS = SUCURSALES_DOC.map((s) => ({ value: s.nombre, label: s.nombre }))
const SUC_NOMBRES: readonly string[] = SUCURSALES_DOC.map((s) => s.nombre)

/** Celda del selector: 2 columnas en móvil, 3 en sm y 4 en lg. El `p-1` de cada
 *  celda genera la separación entre tarjetas (equivale al gap de la grilla). */
const CHIP_CELL = 'w-1/2 p-1 sm:w-1/3 lg:w-1/4'

/** Sucursal inicial: la del empleado logueado (o la por defecto si no tiene). */
function leerSucursal(sucursalUsuario?: string | null): string {
  if (sucursalUsuario && SUC_NOMBRES.includes(sucursalUsuario)) return sucursalUsuario
  return SUCURSAL_DOC_POR_DEFECTO
}

/** "nombre, DNI y teléfono": qué datos del cliente completa esta plantilla. */
/** Borradores de los papeles, por tipo, para sobrevivir a una recarga. */
const CLAVE_BORRADORES = 'celtuc-documentos-borradores'

function leerBorradores(): Record<string, Record<string, unknown>> | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_BORRADORES)
    return crudo ? JSON.parse(crudo) : null
  } catch {
    return null
  }
}

function listaDeCampos(campos: { documento?: string; telefono?: string; email?: string }): string {
  const partes = ['nombre']
  if (campos.documento) partes.push('DNI')
  if (campos.telefono) partes.push('teléfono')
  if (campos.email) partes.push('mail')
  if (partes.length === 1) return partes[0]
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

export function DocumentosPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()

  const [vista, setVista] = useState<'generar' | 'historial'>('generar')
  // Tipo con el que llega prefiltrado el Historial (desde "ver anteriores").
  const [historialTipo, setHistorialTipo] = useState('')
  const [activeId, setActiveId] = useState(DOC_MODULES[0].id)
  // Estado por documento: se preserva al cambiar de pestaña y sobrevive a una
  // recarga de la página (sessionStorage): si la pestaña se recarga —a mano o
  // sola, tras un deploy que dejó chunks viejos— el papel a medio llenar vuelve.
  const [estados, setEstados] = useState<Record<string, unknown>>(() => {
    const guardados = leerBorradores()
    return Object.fromEntries(
      DOC_MODULES.map((m) => {
        const previo = guardados?.[m.id]
        // Merge sobre el vacío: si la plantilla sumó campos, ninguno queda sin clave.
        const base = m.crearVacio() as Record<string, unknown>
        return [m.id, previo && typeof previo === 'object' ? { ...base, ...previo } : base]
      }),
    )
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE_BORRADORES, JSON.stringify(estados))
    } catch {
      /* storage lleno o bloqueado: el borrador solo vive en memoria */
    }
  }, [estados])
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | 'pos80' | null>(null)
  const usuario = useAuth((s) => s.usuario)
  // Sucursal del encabezado; la dirección impresa se deriva de ella.
  const [sucursal, setSucursal] = useState<string>(() => leerSucursal(useAuth.getState().usuario?.sucursal?.nombre))
  const direccion = direccionDeSucursal(sucursal)

  const active = useMemo(() => DOC_MODULES.find((m) => m.id === activeId) ?? DOC_MODULES[0], [activeId])
  const datos = estados[active.id]
  const patch = (p: Record<string, unknown>) =>
    setEstados((s) => ({ ...s, [active.id]: { ...(s[active.id] as object), ...p } }))

  /* --- Cupón correlativo -------------------------------------------------
   * Para las plantillas que lo declaran (`cuponAuto`: todas las que tienen
   * CUPON N°) el N° lo asigna el sistema: el backend calcula el próximo mirando
   * el historial DE ESE TIPO (cada documento lleva su propio contador, arranca
   * en 0 y nunca repite) y acá se precarga cuando el campo está vacío. El campo
   * sigue editable como válvula de escape. */
  const cuponAuto = active.cuponAuto as string | undefined
  const cuponActual = cuponAuto
    ? String((datos as Record<string, unknown>)[cuponAuto] ?? '')
    : ''

  const proxCupon = useQuery({
    queryKey: [QK_PROXIMO_CUPON, active.id],
    queryFn: () => proximoCupon(active.id),
    enabled: vista === 'generar' && Boolean(cuponAuto),
  })
  // Últimos generados de este tipo, para ver los cupones anteriores sin salir
  // del editor. Comparte la clave raíz del historial: se invalidan juntos.
  const anteriores = useQuery({
    queryKey: [QK_HISTORIAL, 'ultimos', active.id],
    queryFn: () => listarDocumentos({ tipo: active.id, limit: 8 }),
    enabled: vista === 'generar' && Boolean(cuponAuto),
  })
  // Un mismo papel se exporta varias veces (PDF y Excel): un renglón por cupón.
  const ultimos = useMemo(() => {
    const unicos: DocumentoGenerado[] = []
    const vistos = new Set<string>()
    for (const doc of anteriores.data?.resultados ?? []) {
      const clave = doc.referencia || `#${doc.id}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      unicos.push(doc)
    }
    return unicos.slice(0, 4)
  }, [anteriores.data])

  /** Último valor que precargamos nosotros, por documento. Distingue "lo puso
   *  el sistema y se puede refrescar" de "lo tocó el usuario o ya se exportó"
   *  (después de exportar, el N° del papel en pantalla no se toca más). */
  const cuponPrecargado = useRef<Record<string, string | null>>({})
  useEffect(() => {
    if (!cuponAuto || proxCupon.data === undefined) return
    const objetivo = String(proxCupon.data.proximo)
    const precargado = cuponPrecargado.current[active.id] ?? null
    if (cuponActual === objetivo) {
      cuponPrecargado.current[active.id] = objetivo
      return
    }
    // Solo se pisa un campo vacío o uno que seguía con nuestra precarga vieja.
    if (cuponActual.trim() === '' || cuponActual === precargado) {
      cuponPrecargado.current[active.id] = objetivo
      patch({ [cuponAuto]: objetivo })
    }
    // `patch` cambia de identidad en cada render; el guard hace el resto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuponAuto, proxCupon.data, cuponActual, active.id])

  // Compraventa: el equipo del contrato se puede sumar al inventario (con
  // confirmación). El modal también se ofrece solo al exportar el PDF.
  const [sumarInv, setSumarInv] = useState(false)
  const [buscarCliente, setBuscarCliente] = useState(false)
  /* Último documento archivado de cada tipo: es lo que habilita «Enviar» apenas
   * se exporta (el envío necesita el archivo ya guardado en el servidor). Va por
   * tipo para que cambiar de plantilla no ofrezca mandar el papel de otra. */
  const [ultimoArchivado, setUltimoArchivado] = useState<Record<string, DocumentoArchivado>>({})
  const [aEnviar, setAEnviar] = useState<DocumentoGenerado | null>(null)
  const enviable = ultimoArchivado[active.id] ?? null
  const cv = active.id === 'compraventa' ? (datos as CompraventaData) : null
  const equipoCargado = !!cv && cvTieneEquipo(cv)

  // Mientras no elija una a mano, seguimos la sucursal de su cuenta (puede
  // llegar tras el refresco de sesión que hace el Layout al montar la app).
  const elegidaAMano = useRef(false)
  useEffect(() => {
    if (elegidaAMano.current) return
    const suc = usuario?.sucursal?.nombre
    if (suc && SUC_NOMBRES.includes(suc)) setSucursal(suc)
  }, [usuario])

  function cambiarSucursal(v: string) {
    elegidaAMano.current = true
    setSucursal(v)
  }

  // Dónde vive el cliente en esta plantilla (cada una lo nombra distinto).
  const campos = active.camposCliente
  /** Valor cargado en un campo del formulario activo, o undefined si está vacío. */
  function valorDe(campo?: string): string | undefined {
    if (!campo) return undefined
    const valor = (datos as Record<string, unknown>)[campo]
    return typeof valor === 'string' && valor.trim() ? valor.trim() : undefined
  }

  /**
   * Sube al historial el archivo recién generado (con los datos del formulario
   * y quién lo hizo). Es de "mejor esfuerzo" a propósito: la descarga ya
   * ocurrió, así que un fallo de red avisa pero NUNCA le saca al usuario el
   * documento que tenía que entregar.
   *
   * De paso, el backend deja al cliente del papel en la base compartida (la
   * misma de facturas y ventas), así la próxima operación lo autocompleta.
   */
  async function archivar(
    blob: Blob,
    formato: FormatoDocumento,
    nombreArchivo: string,
  ): Promise<DocumentoArchivado | null> {
    try {
      const r = active.resumen(datos)
      const archivado = await registrarDocumento(
        {
          tipo: active.id,
          tipoNombre: active.nombre,
          formato,
          nombreArchivo,
          sucursal,
          referencia: r.referencia,
          cliente: r.cliente,
          clienteDocumento: r.clienteDocumento,
          // Contacto: no se archiva con el papel, identifica al cliente.
          clienteTelefono: valorDe(campos?.telefono),
          clienteEmail: valorDe(campos?.email),
          detalle: r.detalle,
          total: r.total,
          datos,
        },
        blob,
      )
      setUltimoArchivado((prev) => ({ ...prev, [active.id]: archivado }))
      if (cuponAuto) {
        // El N° de este papel ya quedó registrado: no se toca más en pantalla
        // (así reexportar el mismo documento en otro formato repite el número)
        // y el contador se refresca para el próximo.
        cuponPrecargado.current[active.id] = null
        await qc.invalidateQueries({ queryKey: [QK_PROXIMO_CUPON, active.id] })
      }
      await qc.invalidateQueries({ queryKey: [QK_HISTORIAL] })
      return archivado
    } catch (e) {
      console.error(e)
      toast.error(
        'Quedó sin registrar en el historial',
        'El archivo se descargó igual. Revisá la conexión y volvé a exportarlo para archivarlo.',
      )
      return null
    }
  }

  /** Coletilla del toast cuando el documento además tocó la base de clientes. */
  function avisoCliente(archivado: DocumentoArchivado): string {
    const c = archivado.cliente_registrado
    if (!c) return ''
    return c.nuevo
      ? ` ${c.nombre} quedó guardado en clientes.`
      : ` Se actualizaron los datos de ${c.nombre} en clientes.`
  }

  /** Carga en el papel los datos de un cliente ya guardado. */
  function traerCliente(cliente: ClienteSugerido) {
    if (!campos) return
    const cambios: Record<string, unknown> = { [campos.nombre]: cliente.nombre }
    if (campos.documento && cliente.doc_numero) cambios[campos.documento] = cliente.doc_numero
    if (campos.telefono && cliente.telefono) cambios[campos.telefono] = cliente.telefono
    if (campos.email && cliente.email) cambios[campos.email] = cliente.email
    patch(cambios)
    setBuscarCliente(false)
    toast.success('Datos cargados', `${cliente.nombre} · ${active.nombre}.`)
  }

  async function exportarPdf() {
    if (busy) return
    setBusy('pdf')
    try {
      const [{ pdf }, Pdf] = await Promise.all([import('@react-pdf/renderer'), active.loadPdf()])
      const blob = await pdf(<Pdf datos={datos} direccion={direccion} />).toBlob()
      const nombre = `${active.nombreArchivo(datos)}.pdf`
      descargarBlob(blob, nombre)
      const archivado = await archivar(blob, 'pdf', nombre)
      if (archivado) {
        toast.success(
          'PDF generado',
          `Se descargó y quedó en el historial: ${active.nombre}.${avisoCliente(archivado)}`,
        )
      }
      // Contrato exportado con equipo cargado: ofrecer sumarlo al inventario.
      if (cv && equipoCargado) setSumarInv(true)
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
      const nombre = `${active.nombreArchivo(datos)}.xlsx`
      descargarBlob(blob, nombre)
      const archivado = await archivar(blob, 'xlsx', nombre)
      if (archivado) {
        toast.success(
          'Excel generado',
          `Se descargó la planilla y quedó en el historial.${avisoCliente(archivado)}`,
        )
      }
    } catch (e) {
      console.error(e)
      toast.error('No se pudo generar el Excel', 'Probá de nuevo en un momento.')
    } finally {
      setBusy(null)
    }
  }

  /**
   * Genera el ticket para la impresora térmica POS80 (80mm) y lo abre en una
   * pestaña nueva, listo para imprimir. El PDF ya viene a 80mm de ancho, así que
   * conviene imprimirlo a "tamaño real / 100%" en la ticketera. Si el navegador
   * bloquea la pestaña emergente, se descarga como respaldo.
   */
  async function imprimirPos80() {
    if (busy || !active.loadPos80) return
    setBusy('pos80')
    try {
      const [{ pdf }, Pos80] = await Promise.all([import('@react-pdf/renderer'), active.loadPos80()])
      const blob = await pdf(<Pos80 direccion={direccion} />).toBlob()
      const nombre = `${active.nombreArchivo(datos)}-ticket.pdf`
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (win) {
        toast.success('Ticket POS80 listo', 'Imprimí a tamaño real (100%) en la ticketera.')
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } else {
        // Popup bloqueado: caemos a descarga.
        URL.revokeObjectURL(url)
        descargarBlob(blob, nombre)
        toast.success('Ticket POS80 descargado', 'Abrilo e imprimí a tamaño real (100%).')
      }
      await archivar(blob, 'pos80', nombre)
    } catch (e) {
      console.error(e)
      toast.error('No se pudo generar el ticket', 'Probá de nuevo en un momento.')
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
    // El papel en pantalla ya no es el que se archivó: no se ofrece enviarlo.
    setUltimoArchivado(({ [active.id]: _, ...resto }) => resto)
  }

  const Paper = active.Paper

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={FileText}
        eyebrow="Plantillas"
        title="Documentos"
        subtitle="Completá los formularios de CelTuc, exportalos idénticos al original y consultá todo lo que se generó."
        className="ct-rise"
      />

      {/* Generar / Historial. Ocupa todo el ancho en móvil y se ajusta al
          contenido desde sm: dos objetivos táctiles grandes en el celular. */}
      <div
        role="tablist"
        aria-label="Vista del módulo Documentos"
        className="ct-rise mb-4 flex gap-1 rounded-2xl border border-line bg-surface p-1 sm:w-fit"
      >
        <VistaTab
          activo={vista === 'generar'}
          icon={PenLine}
          label="Generar"
          onClick={() => setVista('generar')}
        />
        <VistaTab
          activo={vista === 'historial'}
          icon={Archive}
          label="Historial"
          onClick={() => {
            // Desde la pestaña se entra sin prefiltro (el atajo "ver historial
            // completo" del editor es el que llega filtrado por tipo).
            setHistorialTipo('')
            setVista('historial')
          }}
        />
      </div>

      {vista === 'historial' ? (
        <HistorialDocumentos key={historialTipo || 'todo'} tipoInicial={historialTipo} />
      ) : (
        <>
        {/* Selector de tipo de documento. Flex centrado: mismo ancho por tarjeta
            que una grilla de 2/3/4 columnas, pero la última fila (si queda
            incompleta) se centra en lugar de dejar un hueco al costado. */}
        <div className="ct-rise mb-4 flex flex-wrap justify-center">
          {DOC_MODULES.map((m, i) => (
            <div key={m.id} className={CHIP_CELL}>
              <DocChip
                className="h-full w-full"
                nombre={m.nombre}
                descripcion={m.descripcion}
                activo={m.id === activeId}
                index={i}
                onClick={() => setActiveId(m.id)}
              />
            </div>
          ))}
          {PROXIMOS_DOCS.map((d, i) => (
            <div key={d.id} className={CHIP_CELL}>
              <DocChip className="h-full w-full" nombre={d.nombre} descripcion={d.descripcion} index={DOC_MODULES.length + i} proximamente />
            </div>
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
              <div className="flex items-center gap-1.5" title="Sucursal del encabezado (se aplica a todos los documentos)">
                <Building2 className="h-4 w-4 shrink-0 text-ink-400" />
                <Select
                  options={SUC_OPTIONS}
                  value={sucursal}
                  onChange={cambiarSucursal}
                  className="w-44"
                  triggerClassName="h-9 text-xs"
                />
              </div>
              {campos && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBuscarCliente(true)}
                  disabled={!!busy}
                  title="Completar con los datos de un cliente ya guardado"
                >
                  <UserSearch className="h-4 w-4" /> Traer cliente
                </Button>
              )}
              {cv && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSumarInv(true)}
                  disabled={!!busy || !equipoCargado}
                  title={
                    equipoCargado
                      ? 'Sumar el equipo del contrato al inventario'
                      : 'Completá el modelo del equipo para poder sumarlo'
                  }
                >
                  <PackagePlus className="h-4 w-4" /> Sumar a inventario
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={limpiar} disabled={!!busy}>
                <Eraser className="h-4 w-4" /> Limpiar
              </Button>
              <Button variant="outline" size="sm" onClick={exportarXlsx} disabled={!!busy}>
                {busy === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Excel
              </Button>
              {active.loadPos80 && (
                <Button variant="outline" size="sm" onClick={imprimirPos80} disabled={!!busy} title="Imprimir en ticketera térmica POS80 (80mm)">
                  {busy === 'pos80' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  Ticket POS80
                </Button>
              )}
              <Button size="sm" onClick={exportarPdf} disabled={!!busy}>
                {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                PDF
              </Button>
              {/* Aparece recién cuando hay algo para mandar: el envío usa el
                  archivo que quedó guardado al exportar, así que es el paso
                  siguiente natural del botón de al lado. */}
              {enviable && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAEnviar(enviable)}
                  disabled={!!busy}
                  title="Enviar al cliente por WhatsApp o email el último documento exportado"
                >
                  <Send className="h-4 w-4" /> Enviar
                </Button>
              )}
            </div>
          </div>

          {/* Cupón correlativo: el N° asignado y el registro de los anteriores */}
          {cuponAuto && (
            <div className="border-b border-line bg-surface px-3 py-2.5 sm:px-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                  <span className="font-semibold text-ink-950">
                    Cupón N° <span className="tnum">{cuponActual.trim() || '…'}</span>
                  </span>
                </span>
                <span className="text-ink-400">
                  {proxCupon.isError
                    ? 'No se pudo traer el N° automático: completalo a mano en el papel.'
                    : proxCupon.data?.ultimo == null
                      ? 'Se asigna solo y es correlativo. Este es el primero.'
                      : `Se asigna solo y es correlativo · último usado: N° ${proxCupon.data.ultimo}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setHistorialTipo(active.id)
                    setVista('historial')
                  }}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
                >
                  <Archive className="h-3.5 w-3.5" /> Ver historial completo
                </button>
              </div>
              {ultimos.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-ink-400">Anteriores:</span>
                  {ultimos.map((doc) => (
                    <span
                      key={doc.id}
                      className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink-600"
                      title={`${doc.tipo_nombre} · ${doc.cliente || 'sin cliente'} · ${fechaCorta(doc.creado)}`}
                    >
                      <span className="tnum font-semibold text-ink-900">
                        N° {doc.referencia || '—'}
                      </span>
                      {doc.cliente && <span className="truncate">· {doc.cliente}</span>}
                      <span className="tnum text-ink-400">· {fechaCorta(doc.creado)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

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
        </>
      )}

      {campos && (
        <BuscarClienteModal
          abierto={buscarCliente}
          documento={active.nombre}
          completa={listaDeCampos(campos)}
          onCerrar={() => setBuscarCliente(false)}
          onElegir={traerCliente}
        />
      )}

      {cv && (
        <SumarCompraventaInventario
          abierto={sumarInv}
          datos={cv}
          onCerrar={() => setSumarInv(false)}
        />
      )}

      <EnviarDocumentoModal doc={aEnviar} onCerrar={() => setAEnviar(null)} />
    </div>
  )
}

/** Pestaña del switch Generar / Historial. */
function VistaTab({
  activo,
  icon: Icon,
  label,
  onClick,
}: {
  activo: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activo}
      onClick={onClick}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 sm:flex-none',
        activo
          ? 'bg-ink-950 text-on-ink shadow-[0_6px_18px_rgba(10,10,11,0.16)]'
          : 'text-ink-500 hover:bg-ink-50 hover:text-ink-900',
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.9} />
      {label}
    </button>
  )
}

function DocChip({
  nombre,
  descripcion,
  activo = false,
  proximamente = false,
  index,
  onClick,
  className,
}: {
  nombre: string
  descripcion: string
  activo?: boolean
  proximamente?: boolean
  index: number
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={proximamente}
      aria-pressed={proximamente ? undefined : activo}
      className={cn(
        'ct-stagger-item flex flex-col gap-1 rounded-2xl border p-3 text-left transition-colors',
        className,
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
