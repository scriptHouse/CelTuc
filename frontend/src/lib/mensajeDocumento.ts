/**
 * Mensaje con el que se envía un documento generado: plantilla configurable.
 *
 * Como el de facturas (`lib/mensajeFactura`): el texto no está fijo en el
 * código, es una plantilla con variables ({cliente}, {total}…) que se rellenan
 * con los datos reales del documento archivado. Se guarda en el BACKEND como
 * preferencia global (`services/preferencias`), así configurarla una vez vale
 * para todos los usuarios y dispositivos.
 *
 * El MISMO texto se usa en los dos canales: WhatsApp lo abre en el chat y el
 * email lo manda como cuerpo (ahí el backend le suma el resumen y el adjunto).
 */
import type { VariableMensaje } from '@/components/MensajeWhatsappModal'
import type { DocumentoGenerado } from '@/services/documentos'
import { fecha, money } from '@/lib/format'

/** Clave de la preferencia global (debe existir en el backend). */
export const CLAVE_MENSAJE_DOCUMENTO = 'documentos.mensaje_envio'

/** Texto por defecto. Las líneas cuya variable quede vacía se borran solas. */
export const PLANTILLA_DOCUMENTO_DEFAULT =
  'Hola {cliente},\n' +
  'Te compartimos el comprobante de tu operación en CelTuc:\n' +
  '\n' +
  '*{documento}*\n' +
  'N° {numero}\n' +
  'Fecha: {fecha}\n' +
  'Detalle: {detalle}\n' +
  'Total: {total}\n' +
  '\n' +
  'Te lo adjuntamos en este mensaje. ¡Gracias por confiar en nosotros!'

/** Variables disponibles para insertar en la plantilla. */
export const VARIABLES_DOCUMENTO: VariableMensaje[] = [
  { token: '{cliente}', etiqueta: 'Cliente', descripcion: 'Nombre del cliente del documento', ejemplo: 'María González' },
  { token: '{documento}', etiqueta: 'Documento', descripcion: 'Tipo de documento (Seña, Compra / Venta…)', ejemplo: 'Compra / Venta' },
  { token: '{numero}', etiqueta: 'N°', descripcion: 'Cupón o N° de recibo (si el documento lo tiene)', ejemplo: '1234' },
  { token: '{fecha}', etiqueta: 'Fecha', descripcion: 'Fecha en que se generó', ejemplo: '21/07/2026' },
  { token: '{detalle}', etiqueta: 'Detalle', descripcion: 'Equipo, concepto o IMEI del documento', ejemplo: 'iPhone 13 Pro · IMEI 350000000000001' },
  { token: '{total}', etiqueta: 'Total', descripcion: 'Importe del documento (si se pudo leer)', ejemplo: '$ 1.500.000,00' },
  { token: '{sucursal}', etiqueta: 'Sucursal', descripcion: 'Sucursal del encabezado del papel', ejemplo: 'Salta' },
]

/** Valores ya formateados con los que se rellena la plantilla. */
export interface ValoresMensajeDocumento {
  cliente: string
  documento: string
  numero: string
  fecha: string
  detalle: string
  total: string
  sucursal: string
}

/** Documento de muestra para la vista previa del editor. */
export const EJEMPLO_DOCUMENTO: ValoresMensajeDocumento = {
  cliente: 'María González',
  documento: 'Compra / Venta',
  numero: '1234',
  fecha: '21/07/2026',
  detalle: 'iPhone 13 Pro · IMEI 350000000000001',
  total: money(1500000),
  sucursal: 'Salta',
}

/** Extrae de un documento archivado los valores para la plantilla. */
export function valoresDeDocumento(d: DocumentoGenerado): ValoresMensajeDocumento {
  const total = d.total != null ? Number(d.total) : null
  return {
    cliente: (d.cliente || '').trim(),
    documento: d.tipo_nombre,
    numero: (d.referencia || '').trim(),
    fecha: fecha(d.creado),
    detalle: (d.detalle || '').trim(),
    total: total != null && Number.isFinite(total) ? money(total) : '',
    sucursal: (d.sucursal || '').trim(),
  }
}

/**
 * Plantilla efectiva a partir del valor guardado en el backend: vacío (o aún
 * sin cargar) significa «sin personalizar» y se usa la de por defecto.
 */
export function plantillaEfectiva(valorGuardado?: string): string {
  return valorGuardado?.trim() ? valorGuardado : PLANTILLA_DOCUMENTO_DEFAULT
}

/** Cualquiera de las variables, con su nombre capturado. */
const TOKEN = /\{(cliente|documento|numero|fecha|detalle|total|sucursal)\}/g

/**
 * Variables que, si el documento no las tiene, se llevan puesto su renglón.
 *
 * Son las que se escriben como "etiqueta: dato" ("Total: {total}"): sin dato,
 * el renglón no dice nada. `{cliente}` NO está: en "Hola {cliente}," el texto
 * es el saludo y la variable es el adorno, así que sin nombre queda "Hola,".
 */
const OPCIONALES = new Set(['documento', 'numero', 'fecha', 'detalle', 'total', 'sucursal'])

/**
 * Reemplaza las variables de la plantilla por los valores reales del documento.
 *
 * Los documentos se completan muy distinto entre sí (una garantía de accesorios
 * no tiene cliente, número ni total), así que el relleno va renglón por renglón:
 * el que existía solo para mostrar un dato que este documento no tiene se borra
 * en vez de quedar hueco ("Total:" a secas).
 */
export function construirMensajeDocumento(
  plantilla: string,
  v: ValoresMensajeDocumento,
): string {
  const lineas: string[] = []
  for (const linea of plantilla.split('\n')) {
    let opcionalVacia = false
    let todasVacias = true
    const texto = linea.replace(TOKEN, (_, clave: keyof ValoresMensajeDocumento) => {
      const valor = (v[clave] ?? '').trim()
      if (valor) todasVacias = false
      else if (OPCIONALES.has(clave)) opcionalVacia = true
      return valor
    })
    if (opcionalVacia && todasVacias) continue
    lineas.push(texto)
  }
  return limpiar(lineas.join('\n'))
}

/**
 * Últimos retoques: "Hola ," (sin cliente) pasa a "Hola,"; un "—", un "·" o un
 * "N°" que quedaron colgados a fin de línea se borran (pasa cuando un renglón
 * mezcla un dato que sí está con otro que no); y los huecos que dejaron los
 * renglones eliminados se colapsan a una sola línea en blanco.
 */
function limpiar(texto: string): string {
  return texto
    .replace(/[ \t]+(?=[,.;:!?])/g, '')
    .replace(/[ \t]+[—·][ \t]*$/gm, '')
    .replace(/[ \t]*N°[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
