import type {
  ClaseComprobante,
  Cliente,
  ClienteDetalle,
  Comprobante,
  ConceptoFactura,
  Emisor,
  EstadoCobro,
  ItemComprobante,
  MedioPagoComprobante,
  TipoComprobante,
} from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Facturación electrónica real contra ARCA (backend Django).
 *
 * - Emisores (cuentas): leer requiere el permiso `ver_facturacion`; crear/editar
 *   (con credenciales) es solo para administradores.
 * - Comprobantes: listar y emitir requieren `ver_facturacion`. La emisión llama a
 *   ARCA y devuelve el comprobante con su CAE.
 */

const token = () => useAuth.getState().access

// ===== Emisores =====

export interface EmisorInput {
  nombre: string
  condicion: Emisor['condicion']
  cuit: string
  punto_venta: number
  produccion: boolean
  activo?: boolean
  /** Marca interna: true = cuenta de Yerba Buena; false = Centro. */
  responsable_yb?: boolean
  /** Contenido PEM del certificado (.crt). Vacío = no cambiar (en edición). */
  certificado?: string
  /** Contenido PEM de la clave privada (.key). Vacío = no cambiar (en edición). */
  clave_privada?: string
}

export function listarEmisores(): Promise<Emisor[]> {
  return api.get<Emisor[]>('/facturacion/emisores/', token())
}

export function crearEmisor(input: EmisorInput): Promise<Emisor> {
  return api.post<Emisor>('/facturacion/emisores/', input, token())
}

export function actualizarEmisor(id: number, input: Partial<EmisorInput>): Promise<Emisor> {
  return api.patch<Emisor>(`/facturacion/emisores/${id}/`, input, token())
}

export function eliminarEmisor(id: number): Promise<void> {
  return api.del<void>(`/facturacion/emisores/${id}/`, token())
}

/** Resultado de probar la conexión y credenciales del emisor contra ARCA. */
export interface ResultadoConexion {
  servidor: { app: string | null; base: string | null; auth: string | null } | null
  autenticacion: string | null
  ultimo_numero: number | null
  ok: boolean
  mensaje: string
}

export function probarConexion(id: number): Promise<ResultadoConexion> {
  return api.post<ResultadoConexion>(`/facturacion/emisores/${id}/probar/`, undefined, token())
}

// ===== Límite de facturación mensual (control interno; no toca ARCA) =====

/** Un mes del año: su tope (null = sin límite) y lo ya facturado. */
export interface LimiteMes {
  mes: number
  monto: number | null
  facturado: number
}

export interface LimitesAnio {
  anio: number
  limites: LimiteMes[]
}

/** Cuerpo del 409 cuando la factura haría superar el tope del mes. */
export interface LimiteExcedido {
  codigo: 'limite_mensual_excedido'
  detail: string
  anio: number
  mes: number
  mes_nombre: string
  limite: number
  facturado: number
  total_factura: number
  excedente: number
}

/** Los 12 meses del año con su tope y lo facturado (para la barra de uso). */
export function obtenerLimites(emisorId: number, anio: number): Promise<LimitesAnio> {
  return api.get<LimitesAnio>(`/facturacion/emisores/${emisorId}/limites/?anio=${anio}`, token())
}

/**
 * Aplica los topes de los meses enviados de una vez (uno o varios); `monto`
 * en null quita el límite. Los meses que no se envían quedan como estaban.
 */
export function guardarLimites(
  emisorId: number,
  anio: number,
  limites: Array<{ mes: number; monto: number | null }>,
): Promise<LimitesAnio> {
  return api.put<LimitesAnio>(`/facturacion/emisores/${emisorId}/limites/`, { anio, limites }, token())
}

// ===== Comprobantes =====

export function listarComprobantes(emisorId?: number): Promise<Comprobante[]> {
  const query = emisorId ? `?emisor=${emisorId}` : ''
  return api.get<Comprobante[]>(`/facturacion/comprobantes/${query}`, token())
}

// ===== Notas de crédito =====

/**
 * Lo que se manda para acreditar una factura. Sólo se eligen los renglones a
 * acreditar, la fecha, el motivo y con qué se devuelve la plata: el cliente, la
 * letra, la alícuota y el concepto los hereda de la factura (ARCA cruza esos
 * datos con el comprobante asociado, así que no son negociables).
 */
export interface NuevaNotaCredito {
  items: Array<{ descripcion: string; cantidad: number; precio_unitario: number }>
  /** `aaaa-mm-dd`. Por defecto, hoy. Nunca anterior a la factura. */
  fecha?: string
  /** El motivo, tal cual sale impreso en el comprobante. */
  observaciones?: string
  /** Con qué se devuelve la plata. Vacío = el mismo medio de la factura. */
  medio_pago?: MedioPagoComprobante
}

/**
 * Emite la nota de crédito que acredita esa factura: el backend le pide el CAE
 * a ARCA por el MISMO web service que las facturas y la devuelve ya emitida.
 *
 * Errores esperables: 400 si no se puede acreditar (ya está acreditada, el
 * importe se pasa del saldo, la fecha es anterior a la factura) y 502 si ARCA
 * rechaza o no responde.
 */
export function emitirNotaCredito(
  facturaId: number,
  input: NuevaNotaCredito,
): Promise<Comprobante> {
  return api.post<Comprobante>(
    `/facturacion/comprobantes/${facturaId}/nota-credito/`,
    input,
    token(),
  )
}

export function obtenerComprobante(id: number): Promise<Comprobante> {
  return api.get<Comprobante>(`/facturacion/comprobantes/${id}/`, token())
}

export interface NuevoComprobante {
  emisor: number
  concepto?: number
  cliente_nombre: string
  cliente_doc_tipo: string
  cliente_doc_numero?: string
  cliente_condicion: string
  /** Teléfono/celular del cliente (dato interno; alimenta la base de clientes). */
  cliente_telefono?: string
  /** Email del cliente (dato interno; alimenta la base de clientes). */
  cliente_email?: string
  fecha?: string
  vencimiento?: string | null
  alicuota_iva?: number
  observaciones?: string
  estado_cobro?: EstadoCobro
  /** Con qué se cobró (interno, no viaja a ARCA). Vacío = no informado. */
  medio_pago?: MedioPagoComprobante
  items: Array<
    Pick<ItemComprobante, 'descripcion' | 'cantidad' | 'precio_unitario'> & {
      /**
       * Producto del catálogo. Sirve para dos cosas: junto con `sucursal_stock`
       * descuenta stock, y le dice al backend si el ítem lleva concepto
       * genérico (ver `lib/conceptoGenerico`).
       */
      producto?: number
      /** Fila de la lista del taller. Solo concepto genérico: NO toca stock. */
      item_service?: number
    }
  >
  /** Sucursal de la que descontar el stock de los ítems con `producto`. */
  sucursal_stock?: number
  /**
   * Venta de mostrador que se está facturando (la precarga que viene de Caja).
   * Al emitir, esa venta queda apuntada a la factura para que la misma plata no
   * se cuente dos veces en el historial de compras del cliente.
   */
  venta?: number
  /** True = el usuario ya confirmó emitir aunque se pase el límite mensual. */
  confirmar_limite?: boolean
  /**
   * Concepto del banco con el que emitir: si viene, TODOS los renglones se
   * juntan en uno solo con ese texto. Vacío = factura con el detalle real.
   */
  concepto_generico?: number | null
}

/** Emite el comprobante: el backend pide el CAE a ARCA y lo guarda. */
export function emitirComprobante(input: NuevoComprobante): Promise<Comprobante> {
  return api.post<Comprobante>('/facturacion/comprobantes/', input, token())
}

export function cambiarEstadoCobro(id: number, estado: EstadoCobro): Promise<Comprobante> {
  return api.patch<Comprobante>(`/facturacion/comprobantes/${id}/`, { estado_cobro: estado }, token())
}

/** Corrige el medio de cobro de una factura ya emitida (interno, no fiscal). */
export function cambiarMedioPago(
  id: number,
  medio: MedioPagoComprobante,
): Promise<Comprobante> {
  return api.patch<Comprobante>(`/facturacion/comprobantes/${id}/`, { medio_pago: medio }, token())
}

// ===== Resumen mensual (lo que exporta el Studio de Facturación) =====

/** Los "baldes" del resumen: los medios de cobro + lo que no se informó. */
export type MedioResumen =
  | 'efectivo'
  | 'transferencia'
  | 'transf_financiera'
  | 'tarjeta'
  | 'otro'
  | 'sin_medio'

/** Los importes de un corte (un día o el mes entero), ya sumados. */
export interface CorteFacturacion {
  cantidad: number
  total: number
  porMedio: Record<MedioResumen, number>
  /** Facturas A/B (Responsable Inscripto). */
  ri: number
  /** Facturas C (Monotributo). */
  mono: number
  cobrado: number
  pendiente: number
}

export interface DiaFacturacion extends CorteFacturacion {
  /** `aaaa-mm-dd`. */
  fecha: string
}

/** Una cuenta (CUIT) con lo que facturó en el mes, abierto por medio. */
export interface CuentaFacturacion extends CorteFacturacion {
  emisor: number
  nombre: string
  cuit: string
  condicion: 'responsable_inscripto' | 'monotributista'
  punto_venta: number
}

/** Un comprobante del mes, con el medio ya resuelto (ver `resumen.py`). */
export interface ComprobanteResumen {
  id: number
  fecha: string
  /** Factura o nota de crédito: la nota va con `total` NEGATIVO. */
  clase: ClaseComprobante
  tipo: TipoComprobante
  numero_formateado: string
  emisor: number
  emisor_nombre: string
  emisor_cuit: string
  cliente_nombre: string
  total: number
  estado_cobro: EstadoCobro
  cae: string
  /** True si está oculto de la lista (borrado lógico); el CAE existe igual. */
  oculto: boolean
  medio_pago: MedioPagoComprobante
  /**
   * De dónde salió el medio: `comprobante` (se informó), `venta` (se dedujo del
   * cobro real de la venta de mostrador ligada) o vacío (no se sabe).
   */
  medio_origen: 'comprobante' | 'venta' | ''
  porMedio: Partial<Record<MedioResumen, number>>
}

export interface ResumenFacturacion {
  anio: number
  mes: number
  /** `aaaa-mm-dd` del primer y último día del mes. */
  desde: string
  hasta: string
  diasDelMes: number
  emisores: number[]
  incluirOcultos: boolean
  medios: MedioResumen[]
  dias: DiaFacturacion[]
  comprobantes: ComprobanteResumen[]
  /** Una fila por cuenta (CUIT), de la que más facturó a la que menos. */
  porCuenta: CuentaFacturacion[]
  totales: CorteFacturacion
  /** Cuánto quedó sin medio informado (para avisar que falta completarlo). */
  sinMedio: { cantidad: number; total: number }
}

interface CorteApi {
  cantidad: number
  total: number
  por_medio: Record<MedioResumen, number>
  ri: number
  mono: number
  cobrado: number
  pendiente: number
}

interface ResumenApi {
  anio: number
  mes: number
  desde: string
  hasta: string
  dias_del_mes: number
  emisores: number[]
  incluir_ocultos: boolean
  medios: MedioResumen[]
  dias: Array<CorteApi & { fecha: string }>
  comprobantes: Array<
    Omit<ComprobanteResumen, 'porMedio'> & { por_medio: Partial<Record<MedioResumen, number>> }
  >
  por_cuenta: Array<
    CorteApi & Pick<CuentaFacturacion, 'emisor' | 'nombre' | 'cuit' | 'condicion' | 'punto_venta'>
  >
  totales: CorteApi
  sin_medio: { cantidad: number; total: number }
}

const corteDesdeApi = (c: CorteApi): CorteFacturacion => ({
  cantidad: c.cantidad,
  total: c.total,
  porMedio: c.por_medio,
  ri: c.ri,
  mono: c.mono,
  cobrado: c.cobrado,
  pendiente: c.pendiente,
})

export interface OpcionesResumen {
  /** Cuentas que entran. Vacío o sin definir = todas. */
  emisores?: number[]
  /** Suma también los comprobantes ocultados de la lista (borrado lógico). */
  incluirOcultos?: boolean
}

/**
 * Lo facturado en un mes, por día y por medio de cobro. Es la fuente ÚNICA del
 * exportador: el mismo dato alimenta la vista previa y el archivo.
 *
 * Son números del negocio: el backend lo reserva a administradores.
 */
export async function obtenerResumenFacturacion(
  anio: number,
  mes: number,
  opciones: OpcionesResumen = {},
): Promise<ResumenFacturacion> {
  const params = new URLSearchParams({ anio: String(anio), mes: String(mes) })
  if (opciones.emisores?.length) params.set('emisores', opciones.emisores.join(','))
  if (opciones.incluirOcultos) params.set('incluir_ocultos', '1')
  const r = await api.get<ResumenApi>(
    `/facturacion/comprobantes/resumen-mensual/?${params.toString()}`,
    token(),
  )
  return {
    anio: r.anio,
    mes: r.mes,
    desde: r.desde,
    hasta: r.hasta,
    diasDelMes: r.dias_del_mes,
    emisores: r.emisores,
    incluirOcultos: r.incluir_ocultos,
    medios: r.medios,
    dias: r.dias.map((d) => ({ fecha: d.fecha, ...corteDesdeApi(d) })),
    comprobantes: r.comprobantes.map(({ por_medio, ...resto }) => ({
      ...resto,
      porMedio: por_medio,
    })),
    porCuenta: r.por_cuenta.map(({ por_medio, ...cuenta }) => ({
      ...cuenta,
      porMedio: por_medio,
      cantidad: cuenta.cantidad,
      total: cuenta.total,
      ri: cuenta.ri,
      mono: cuenta.mono,
      cobrado: cuenta.cobrado,
      pendiente: cuenta.pendiente,
    })),
    totales: corteDesdeApi(r.totales),
    sinMedio: r.sin_medio,
  }
}

export function eliminarComprobante(id: number): Promise<void> {
  return api.del<void>(`/facturacion/comprobantes/${id}/`, token())
}

// ===== Clientes (base + gestor con historial de compras) =====

/** Busca clientes por nombre, teléfono o documento (para el autocompletado). */
export function buscarClientes(busqueda: string): Promise<Cliente[]> {
  const query = busqueda.trim() ? `?buscar=${encodeURIComponent(busqueda.trim())}` : ''
  return api.get<Cliente[]>(`/facturacion/clientes/${query}`, token())
}

/** Lista los clientes con sus estadísticas de compras (para el gestor). */
export function listarClientes(busqueda?: string): Promise<Cliente[]> {
  const params = new URLSearchParams({ stats: '1' })
  if (busqueda?.trim()) params.set('buscar', busqueda.trim())
  return api.get<Cliente[]>(`/facturacion/clientes/?${params.toString()}`, token())
}

/** Trae un cliente con su historial de compras (comprobantes + productos). */
export function obtenerCliente(id: number): Promise<ClienteDetalle> {
  return api.get<ClienteDetalle>(`/facturacion/clientes/${id}/`, token())
}

export interface ClienteInput {
  nombre: string
  telefono?: string
  email?: string
  condicion?: string
}

/** Edita los datos de contacto del cliente (nombre, teléfono, email, condición). */
export function actualizarCliente(id: number, input: ClienteInput): Promise<ClienteDetalle> {
  return api.patch<ClienteDetalle>(`/facturacion/clientes/${id}/`, input, token())
}

/** Elimina el cliente de la base (borrado lógico; no toca las facturas). */
export function eliminarCliente(id: number): Promise<void> {
  return api.del<void>(`/facturacion/clientes/${id}/`, token())
}

/** Envía por email el PDF (ya generado en el front, en base64) de un comprobante. */
export function enviarComprobanteEmail(
  id: number,
  email: string,
  pdfBase64: string,
  mensaje?: string,
): Promise<{ detail: string }> {
  return api.post<{ detail: string }>(
    `/facturacion/comprobantes/${id}/enviar-email/`,
    { email, pdf_base64: pdfBase64, mensaje },
    token(),
  )
}

// ===== Banco de conceptos =====
// Textos con los que se puede emitir una factura sin detallar los productos.
// Leerlos alcanza con poder facturar; crearlos/editarlos es de administradores.

export interface ConceptoFacturaInput {
  texto: string
  predeterminado?: boolean
  orden?: number
  activo?: boolean
}

export function listarConceptos(): Promise<ConceptoFactura[]> {
  return api.get<ConceptoFactura[]>('/facturacion/conceptos/', token())
}

export function crearConcepto(input: ConceptoFacturaInput): Promise<ConceptoFactura> {
  return api.post<ConceptoFactura>('/facturacion/conceptos/', input, token())
}

export function actualizarConcepto(
  id: number,
  input: Partial<ConceptoFacturaInput>,
): Promise<ConceptoFactura> {
  return api.patch<ConceptoFactura>(`/facturacion/conceptos/${id}/`, input, token())
}

export function eliminarConcepto(id: number): Promise<void> {
  return api.del<void>(`/facturacion/conceptos/${id}/`, token())
}
