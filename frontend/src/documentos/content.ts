/**
 * Contenido fijo (textos e identidad) del documento de Recepción, tal cual la
 * hoja original de Excel de CelTuc. Centralizado acá para que el preview en
 * pantalla, el PDF (@react-pdf) y el Excel (exceljs) usen exactamente lo mismo.
 */

export const EMPRESA = {
  nombre: 'CELTUC',
  direccion: 'Salta 186 - Yerba Buena',
  instagram: '@CelTuc',
  facebook: '/CelTuc',
} as const

/**
 * Direcciones disponibles para el encabezado. Se elige una desde la página y
 * se aplica a TODOS los documentos (preview, PDF y Excel).
 */
export const DIRECCIONES = ['Salta 186 - Yerba Buena', 'Yerba Buena - Tucumán'] as const

export type Direccion = (typeof DIRECCIONES)[number]

export const DIRECCION_POR_DEFECTO: Direccion = DIRECCIONES[0]

/**
 * Sucursales que se pueden elegir como encabezado de los documentos, con la
 * dirección que imprime cada una. La sucursal del empleado logueado se
 * preselecciona sola (ver DocumentosPage). El código postal vive en el backend
 * (modelo Sucursal); acá solo mapeamos el nombre a su dirección para el papel.
 *
 * Mantener los NOMBRES en sync con la semilla del backend
 * (empleados/migrations/0004_seed_sucursales). Una sucursal nueva sin entrada
 * acá cae en la dirección por defecto hasta agregarle su línea.
 */
export const SUCURSALES_DOC = [
  { nombre: 'La Salta', direccion: 'Salta 186 - Yerba Buena' },
  { nombre: 'YB', direccion: 'Yerba Buena - Tucumán' },
  { nombre: 'Central YB', direccion: 'Yerba Buena - Tucumán' },
] as const

export const SUCURSAL_DOC_POR_DEFECTO = SUCURSALES_DOC[0].nombre

/** Dirección del encabezado para una sucursal (por nombre); default si no mapea. */
export function direccionDeSucursal(nombre: string | null | undefined): string {
  return SUCURSALES_DOC.find((s) => s.nombre === nombre)?.direccion ?? DIRECCION_POR_DEFECTO
}

export const RECEPCION_TITULO = 'RECEPCION DE EQUIPO/S'

/** Etiquetas fijas de los campos (idénticas al Excel, con sus mayúsculas). */
export const LABELS = {
  cupon: 'CUPON N°',
  fecha: 'FECHA',
  recibiDe: 'RECIBI DE',
  equipos: 'EL EQUIPO/S',
  falla: 'CON LA SIGUIENTE FALLA/S',
  obs: 'OBS:',
  recepciono: 'RECEPCIONO:',
  codDesbloqueo: 'COD. DESBLOQUEO:',
  tel: 'TEL:',
  presupuesto: 'PRESUPUESTO:',
  sena: 'SEÑA:',
  pendiente: 'PENDIENTE:',
  diagnostico: 'DIAGNOSTICO TECNICO:',
} as const

/**
 * Texto de garantía al pie. Reproduce el "rich text" del Excel: todo en un
 * tamaño muy chico, justificado, con una sola frase en negrita
 * ("Esta garantía NO cubre:"). Los `\n` son saltos de línea dentro del bloque.
 */
export interface GarantiaRun {
  t: string
  bold?: boolean
}

export const GARANTIA_RUNS: GarantiaRun[] = [
  {
    t:
      'Documento válido como garantía. \n' +
      'La garantía sólo podrá ser reclamada por la persona que aparece en la orden, presentando una identificación oficial. El tiempo para validar si procede o no con la garantía es de hasta tres (3) días. Si la garantía aplica, la reparación de ésta puede demorar hasta 10 días hábiles dependiendo de la disponibilidad de la pieza. \n' +
      'Los cambios de batería cuentan con sesenta (60) días de garantía, mientras que el resto de las reparaciones (modulo-placa-pin de carga-cámara-etc.) cuenta con noventa (90) días de garantía, el plazo de la misma comienza a contar desde el día que se hace entrega del equipo reparado.\n',
  },
  { t: 'Esta garantía NO cubre:', bold: true },
  {
    t:
      '\nReembolsos/devoluciones; si el equipo supera el plazo de garantía; software ;daños, roturas, golpes, irregularidades y/o vicios aparentes de fácil e inmediata observación que no fueron registrados en la hoja de recepción del equipo; daños por fluidos; si fue utilizado con algún accesorio que no pertenece al celular, por ejemplo un cargador de otra marca; si se utilizó algún software no autorizado por el fabricante; defectos o daños ocasionados por testeos, instalaciones, alteraciones y/o modificación de cualquier tipo realizado por otro servicio técnico; robo o hurto del equipo; los equipos que no sean retirados en un plazo de treinta (30) días desde que el cliente fue notificado para retirar el mismo, serán enviados a un deposito.\n',
  },
]

/** El mismo texto como string plano (para el campo combinado del Excel). */
export const GARANTIA_TEXTO = GARANTIA_RUNS.map((r) => r.t).join('')

/**
 * Parte un texto de garantía en "runs" resaltando en negrita la frase
 * "Esta garantía NO cubre:" (subtítulo común a todas las garantías de CelTuc).
 */
export function partirGarantia(texto: string): GarantiaRun[] {
  const marca = 'Esta garantía NO cubre:'
  const i = texto.indexOf(marca)
  if (i < 0) return [{ t: texto }]
  return [{ t: texto.slice(0, i) }, { t: marca, bold: true }, { t: texto.slice(i + marca.length) }]
}
