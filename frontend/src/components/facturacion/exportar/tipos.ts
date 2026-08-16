/**
 * Exportador de Facturación — el CONTRATO de la exportación.
 *
 * Todo lo que se puede elegir en el Studio vive acá, en un objeto plano y
 * serializable: así una configuración se recuerda entre visitas, se guarda como
 * plantilla y se le pasa igual al generador (`xlsx.ts`) sin que éste tenga que
 * saber nada de la pantalla.
 *
 * Regla de oro del módulo: `ConfigFacturacion` es DATO, no UI. No importa React
 * ni componentes; el generador sólo recibe el dataset ya resuelto (`datos.ts`)
 * más este objeto.
 *
 * El formato de la planilla (columnas, colores, fórmulas) calca el Excel que
 * usa el negocio: Fecha · Efectivo · Transferencias · Tarjetas · TOTAL ·
 * ESTADO · ÍNDICE, con el TOTAL en verde y el ÍNDICE pintado por su resultado.
 */
import type { MedioResumen } from '@/services/facturacion'

/* ===================== Columnas ===================== */

export type TipoColumna = 'fecha' | 'texto' | 'entero' | 'ars' | 'blanco'

/** Con qué se agrupa el selector de columnas. */
export type FamiliaColumna = 'dia' | 'medios' | 'totales' | 'control'

export interface DefinicionColumna {
  id: string
  /** Rótulo que va en la fila de títulos del Excel. */
  label: string
  familia: FamiliaColumna
  tipo: TipoColumna
  /** Ancho en caracteres de la columna de Excel. */
  ancho: number
  /**
   * El "balde" de medios que representa. Con esto el TOTAL sabe si las columnas
   * elegidas cubren toda la plata del mes (y entonces puede ir como fórmula).
   */
  medios?: MedioResumen[]
  /** No se puede quitar. */
  fija?: boolean
  ayuda?: string
}

/**
 * El catálogo completo. El orden de esta lista es el orden en que aparecen las
 * columnas disponibles; el orden de la exportación lo manda `config.columnas`.
 */
export const COLUMNAS: DefinicionColumna[] = [
  // --- Día ---
  {
    id: 'fecha',
    label: 'Fecha',
    familia: 'dia',
    tipo: 'fecha',
    ancho: 12.7,
    fija: true,
    ayuda: 'Un renglón por día del mes, como la planilla de siempre.',
  },
  {
    id: 'dia_semana',
    label: 'Día',
    familia: 'dia',
    tipo: 'texto',
    ancho: 8,
    ayuda: 'Lun, mar, mié… Ayuda a leer los picos de fin de semana.',
  },

  // --- Medios de cobro ---
  {
    id: 'efectivo',
    label: 'Efectivo',
    familia: 'medios',
    tipo: 'ars',
    ancho: 12.7,
    medios: ['efectivo'],
  },
  {
    id: 'transferencias',
    label: 'Transferencias',
    familia: 'medios',
    tipo: 'ars',
    ancho: 12.7,
    medios: ['transferencia', 'transf_financiera'],
    ayuda: 'Las dos juntas (la común y la financiera), como en la planilla original.',
  },
  {
    id: 'transferencia',
    label: 'Transferencia',
    familia: 'medios',
    tipo: 'ars',
    ancho: 12.7,
    medios: ['transferencia'],
    ayuda: 'Sólo la común: la del Responsable Inscripto.',
  },
  {
    id: 'transf_financiera',
    label: 'Transf. financiera',
    familia: 'medios',
    tipo: 'ars',
    ancho: 14,
    medios: ['transf_financiera'],
    ayuda: 'Sólo la financiera: la del monotributo.',
  },
  {
    id: 'tarjetas',
    label: 'Tarjetas',
    familia: 'medios',
    tipo: 'ars',
    ancho: 12.7,
    medios: ['tarjeta'],
  },
  {
    id: 'otro',
    label: 'Otro',
    familia: 'medios',
    tipo: 'ars',
    ancho: 11,
    medios: ['otro'],
  },
  {
    id: 'sin_medio',
    label: 'Sin informar',
    familia: 'medios',
    tipo: 'ars',
    ancho: 12.7,
    medios: ['sin_medio'],
    ayuda: 'Facturas a las que todavía no se les cargó con qué se cobraron.',
  },

  // --- Totales ---
  {
    id: 'total',
    label: 'TOTAL',
    familia: 'totales',
    tipo: 'ars',
    ancho: 12.7,
    ayuda: 'Lo facturado ese día. Va como fórmula si las columnas de medios cubren todo.',
  },
  {
    id: 'cantidad',
    label: 'Facturas',
    familia: 'totales',
    tipo: 'entero',
    ancho: 9.5,
    ayuda: 'Cuántos comprobantes se emitieron ese día.',
  },
  {
    id: 'ri',
    label: 'Resp. Inscripto',
    familia: 'totales',
    tipo: 'ars',
    ancho: 14,
    ayuda: 'Lo facturado con Factura A/B.',
  },
  {
    id: 'mono',
    label: 'Monotributo',
    familia: 'totales',
    tipo: 'ars',
    ancho: 13,
    ayuda: 'Lo facturado con Factura C.',
  },
  {
    id: 'cobrado',
    label: 'Cobrado',
    familia: 'totales',
    tipo: 'ars',
    ancho: 12.7,
    ayuda: 'Las facturas marcadas como pagadas.',
  },
  {
    id: 'pendiente',
    label: 'Pendiente',
    familia: 'totales',
    tipo: 'ars',
    ancho: 12.7,
    ayuda: 'Lo que todavía figura sin cobrar.',
  },

  // --- Control ---
  {
    id: 'estado',
    label: 'ESTADO',
    familia: 'control',
    tipo: 'blanco',
    ancho: 12.7,
    ayuda: 'Columna VACÍA a propósito: se anota a mano, igual que en la planilla.',
  },
  {
    id: 'indice',
    label: 'ÍNDICE',
    familia: 'control',
    tipo: 'texto',
    ancho: 12.7,
    ayuda: 'GANANCIA o PÉRDIDA según la meta diaria. Se pinta solo en el Excel.',
  },
]

export const COLUMNAS_POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]))

export const FAMILIAS: Array<{ id: FamiliaColumna; label: string; ayuda: string }> = [
  { id: 'dia', label: 'Día', ayuda: 'La fecha del renglón.' },
  { id: 'medios', label: 'Medios de cobro', ayuda: 'Con qué entró la plata.' },
  { id: 'totales', label: 'Totales', ayuda: 'Cortes del día.' },
  { id: 'control', label: 'Control', ayuda: 'Las columnas para leer el mes de un vistazo.' },
]

/* ===================== Configuración ===================== */

/**
 * Qué renglones entran:
 * - `mes_completo`: los 30/31 días, aunque no se haya facturado (calca la
 *   planilla del negocio, que se completa día a día).
 * - `con_facturacion`: sólo los días que tuvieron comprobantes.
 */
export type AlcanceFilas = 'mes_completo' | 'con_facturacion'

export interface OpcionesXlsxFacturacion {
  /** Hoja con una fila por comprobante del mes (número, cliente, CAE, medio). */
  hojaComprobantes: boolean
  /**
   * Hoja «Por cuenta»: una fila por CUIT con lo que entró por cada medio
   * (efectivo, transferencia, financiera, tarjeta). Es el corte con el que se
   * concilia cada cuenta por separado.
   */
  hojaCuentas: boolean
  /** Hoja con los filtros, la cuenta y quién exportó. Trazabilidad. */
  hojaComoSeGenero: boolean
  /**
   * TOTAL como `=B+C+D` e ÍNDICE como `=IF(...)`, vivos: se edita un importe y
   * la planilla se recalcula sola, igual que la original.
   */
  formulas: boolean
  /** El piso del ÍNDICE: arriba es GANANCIA, abajo (y sobre cero) PÉRDIDA. */
  metaDiaria: number
  /** Pinta el ÍNDICE (verde/rojo) con formato condicional nativo de Excel. */
  resaltarIndice: boolean
  /** Fila TOTAL al pie, con la suma del mes. */
  totalGeneral: boolean
  /** Congela la fila de títulos al scrollear. */
  congelar: boolean
  /** Flechitas de filtro en la fila de títulos. */
  autofiltro: boolean
  /** Sombrea los sábados y domingos. */
  finesDeSemana: boolean
}

export interface ConfigFacturacion {
  anio: number
  /** 1 = enero … 12 = diciembre. */
  mes: number
  /** Ids de las cuentas que entran. Vacío = todas. */
  emisores: number[]
  /** Suma también los comprobantes ocultados de la lista (el CAE existe igual). */
  incluirOcultos: boolean
  alcance: AlcanceFilas
  /** Columnas elegidas, EN ORDEN. La fecha va siempre primera. */
  columnas: string[]
  /** El logo de CelTuc arriba a la izquierda. */
  conLogo: boolean
  /**
   * La banda de encabezado (título, mes, cuentas, quién exportó). Apagada, la
   * tabla arranca en A1: el calco exacto para pegar en otra planilla.
   */
  banda: boolean
  titulo: string
  subtitulo: string
  /** Plantilla con tokens: {mes} {anio} {fecha} {hora} {cuenta}. */
  nombreArchivo: string
  xlsx: OpcionesXlsxFacturacion
}

export const CONFIG_POR_DEFECTO: Omit<ConfigFacturacion, 'anio' | 'mes'> = {
  emisores: [],
  incluirOcultos: false,
  alcance: 'mes_completo',
  // El mismo orden de la planilla del negocio.
  columnas: ['fecha', 'efectivo', 'transferencias', 'tarjetas', 'total', 'estado', 'indice'],
  conLogo: true,
  banda: true,
  titulo: 'Facturación',
  subtitulo: '',
  nombreArchivo: 'facturacion-{mes}-{anio}',
  xlsx: {
    hojaComprobantes: true,
    hojaCuentas: true,
    hojaComoSeGenero: false,
    formulas: true,
    metaDiaria: 205000,
    resaltarIndice: true,
    totalGeneral: true,
    congelar: true,
    autofiltro: false,
    finesDeSemana: true,
  },
}

/** La config completa del mes indicado, lista para arrancar. */
export function configInicial(anio: number, mes: number): ConfigFacturacion {
  return {
    ...CONFIG_POR_DEFECTO,
    anio,
    mes,
    emisores: [],
    columnas: [...CONFIG_POR_DEFECTO.columnas],
    xlsx: { ...CONFIG_POR_DEFECTO.xlsx },
  }
}

/* ===================== Plantillas ===================== */

export type ParcialConfig = Omit<Partial<ConfigFacturacion>, 'xlsx'> & {
  xlsx?: Partial<OpcionesXlsxFacturacion>
}

export interface PlantillaFacturacion {
  id: string
  nombre: string
  descripcion: string
  /** Se aplica ENCIMA de la config por defecto. */
  config: ParcialConfig
  deFabrica?: boolean
}

/** Los tres pedidos reales, cada uno con sus columnas ya elegidas. */
export const PLANTILLAS_FABRICA: PlantillaFacturacion[] = [
  {
    id: 'planilla',
    nombre: 'Planilla del mes',
    descripcion: 'El formato de siempre: Efectivo, Transferencias, Tarjetas, TOTAL e ÍNDICE.',
    deFabrica: true,
    config: {
      alcance: 'mes_completo',
      columnas: ['fecha', 'efectivo', 'transferencias', 'tarjetas', 'total', 'estado', 'indice'],
      xlsx: { formulas: true, resaltarIndice: true, hojaComprobantes: true },
    },
  },
  {
    id: 'rieles',
    nombre: 'Por riel fiscal',
    descripcion: 'Separa la transferencia común de la financiera y muestra RI vs Monotributo.',
    deFabrica: true,
    config: {
      alcance: 'mes_completo',
      titulo: 'Facturación por riel',
      columnas: [
        'fecha',
        'efectivo',
        'transferencia',
        'transf_financiera',
        'tarjetas',
        'total',
        'ri',
        'mono',
      ],
      xlsx: { formulas: true, resaltarIndice: false, totalGeneral: true, hojaCuentas: true },
    },
  },
  {
    id: 'cobranza',
    nombre: 'Cobranza',
    descripcion: 'Sólo los días con facturas: cuántas, cuánto se cobró y cuánto falta.',
    deFabrica: true,
    config: {
      alcance: 'con_facturacion',
      titulo: 'Cobranza del mes',
      columnas: ['fecha', 'dia_semana', 'cantidad', 'total', 'cobrado', 'pendiente'],
      nombreArchivo: 'cobranza-{mes}-{anio}',
      xlsx: { formulas: false, resaltarIndice: false, autofiltro: true, hojaComprobantes: true },
    },
  },
]

/** Mezcla una plantilla (o cualquier parcial) sobre una config completa. */
export function fusionarConfig(base: ConfigFacturacion, patch: ParcialConfig): ConfigFacturacion {
  return { ...base, ...patch, xlsx: { ...base.xlsx, ...patch.xlsx } }
}

/** Aplica una plantilla sobre la config LIMPIA (no arrastra lo anterior). */
export function aplicarPlantilla(
  plantilla: PlantillaFacturacion,
  base: Pick<ConfigFacturacion, 'anio' | 'mes' | 'emisores' | 'incluirOcultos' | 'conLogo'>,
): ConfigFacturacion {
  const limpia: ConfigFacturacion = {
    ...configInicial(base.anio, base.mes),
    emisores: [...base.emisores],
    incluirOcultos: base.incluirOcultos,
    conLogo: base.conLogo,
  }
  return fusionarConfig(limpia, plantilla.config)
}

/* ===================== Nombre del archivo ===================== */

export const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

export function nombreMes(mes: number): string {
  return MESES[mes - 1] ?? String(mes)
}

const dosDigitos = (n: number) => String(n).padStart(2, '0')

/** Resuelve los tokens del nombre y le pone la extensión. */
export function resolverNombreArchivo(
  plantilla: string,
  datos: { anio: number; mes: number; cuenta: string; generado: Date },
): string {
  const { anio, mes, cuenta, generado } = datos
  const base = (plantilla || 'facturacion-{mes}-{anio}')
    .replace(/\{mes\}/g, nombreMes(mes))
    .replace(/\{mesNum\}/g, dosDigitos(mes))
    .replace(/\{anio\}/g, String(anio))
    .replace(/\{cuenta\}/g, cuenta)
    .replace(
      /\{fecha\}/g,
      `${generado.getFullYear()}-${dosDigitos(generado.getMonth() + 1)}-${dosDigitos(generado.getDate())}`,
    )
    .replace(/\{hora\}/g, `${dosDigitos(generado.getHours())}${dosDigitos(generado.getMinutes())}`)
  // Nada de caracteres que un sistema de archivos rechace.
  const limpio =
    base
      .normalize('NFC')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.\s]+|[.\s]+$/g, '') || 'facturacion'
  return `${limpio}.xlsx`
}

export const TOKENS_NOMBRE: Array<[string, string]> = [
  ['{mes}', 'agosto'],
  ['{mesNum}', '08'],
  ['{anio}', '2026'],
  ['{cuenta}', 'las cuentas elegidas'],
  ['{fecha}', 'la fecha de hoy'],
  ['{hora}', 'la hora'],
]
