/**
 * Mensaje de WhatsApp de las facturas: plantilla configurable + guardado.
 *
 * Igual que el de cotizaciones (`lib/mensajeCotizacion`): el texto que abre el
 * botón «WhatsApp» del detalle no está fijo en el código, es una plantilla con
 * variables ({cliente}, {total}…) que se rellenan con los datos reales del
 * comprobante. Se guarda en `localStorage` (por dispositivo).
 */
import type { VariableMensaje } from '@/components/MensajeWhatsappModal'
import type { Comprobante } from '@/types'
import { fecha, money } from '@/lib/format'

const KEY = 'celtuc:facturacion:mensajeWhatsapp'

/** Texto por defecto (misma información que el email de comprobantes). */
export const PLANTILLA_FACTURA_DEFAULT =
  'Hola {cliente},\n' +
  'Te compartimos el comprobante de tu compra:\n' +
  '\n' +
  '*Factura {tipo} N° {numero}* — {emisor}\n' +
  'Fecha: {fecha}\n' +
  'Total: {total}\n' +
  'CAE: {cae} (vence {vto_cae})\n' +
  '\n' +
  'Ahora te adjuntamos el PDF de la factura. ¡Gracias por tu compra!'

/** Variables disponibles para insertar en la plantilla. */
export const VARIABLES_FACTURA: VariableMensaje[] = [
  { token: '{cliente}', etiqueta: 'Cliente', descripcion: 'Nombre del cliente (queda vacío si es Consumidor Final)', ejemplo: 'María González' },
  { token: '{tipo}', etiqueta: 'Tipo', descripcion: 'Letra del comprobante (A, B o C)', ejemplo: 'B' },
  { token: '{numero}', etiqueta: 'Número', descripcion: 'Número completo, con punto de venta', ejemplo: '00003-00001234' },
  { token: '{emisor}', etiqueta: 'Emisor', descripcion: 'Nombre de la cuenta que emitió', ejemplo: 'CelTuc' },
  { token: '{fecha}', etiqueta: 'Fecha', descripcion: 'Fecha de emisión', ejemplo: '21/07/2026' },
  { token: '{total}', etiqueta: 'Total', descripcion: 'Total del comprobante', ejemplo: '$ 1.350.000,00' },
  { token: '{cae}', etiqueta: 'CAE', descripcion: 'Código de autorización de ARCA', ejemplo: '75298765432109' },
  { token: '{vto_cae}', etiqueta: 'Vto. CAE', descripcion: 'Vencimiento del CAE', ejemplo: '31/07/2026' },
]

/** Valores ya formateados con los que se rellena la plantilla. */
export interface ValoresMensajeFactura {
  cliente: string
  tipo: string
  numero: string
  emisor: string
  fecha: string
  total: string
  cae: string
  vto_cae: string
}

/** Comprobante de muestra para la vista previa del editor. */
export const EJEMPLO_FACTURA: ValoresMensajeFactura = {
  cliente: 'María González',
  tipo: 'B',
  numero: '00003-00001234',
  emisor: 'CelTuc',
  fecha: '21/07/2026',
  total: money(1350000),
  cae: '75298765432109',
  vto_cae: '31/07/2026',
}

/** Extrae de un comprobante real los valores para la plantilla. */
export function valoresDeComprobante(c: Comprobante): ValoresMensajeFactura {
  const nombre = (c.cliente_nombre || '').trim()
  return {
    // "Consumidor Final" no es un nombre: se deja vacío y `limpiar` acomoda el saludo.
    cliente: nombre.toLowerCase() === 'consumidor final' ? '' : nombre,
    tipo: c.tipo,
    numero: c.numero_formateado,
    emisor: c.emisor_nombre ?? '',
    fecha: fecha(c.fecha),
    total: money(c.total),
    cae: c.cae || '—',
    vto_cae: c.cae_vencimiento ? fecha(c.cae_vencimiento) : '—',
  }
}

/** Plantilla guardada, o la de por defecto si no hay ninguna. */
export function leerPlantillaFactura(): string {
  try {
    const guardada = localStorage.getItem(KEY)
    if (guardada && guardada.trim()) return guardada
  } catch {
    /* localStorage no disponible */
  }
  return PLANTILLA_FACTURA_DEFAULT
}

/**
 * Guarda la plantilla. Si queda vacía o es igual a la de por defecto, borra la
 * personalización (así "restaurar" no deja basura en localStorage).
 */
export function guardarPlantillaFactura(plantilla: string): void {
  const limpia = plantilla.trim()
  try {
    if (!limpia || limpia === PLANTILLA_FACTURA_DEFAULT) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, limpia)
  } catch {
    /* localStorage no disponible */
  }
}

/** Reemplaza las variables de la plantilla por los valores reales del comprobante. */
export function construirMensajeFactura(plantilla: string, v: ValoresMensajeFactura): string {
  const texto = plantilla
    .replace(/\{cliente\}/g, v.cliente)
    .replace(/\{tipo\}/g, v.tipo)
    .replace(/\{numero\}/g, v.numero)
    .replace(/\{emisor\}/g, v.emisor)
    .replace(/\{fecha\}/g, v.fecha)
    .replace(/\{total\}/g, v.total)
    .replace(/\{vto_cae\}/g, v.vto_cae)
    .replace(/\{cae\}/g, v.cae)
  return limpiar(texto)
}

/**
 * Acomoda el texto cuando una variable quedó vacía: "Hola ," (Consumidor
 * Final) pasa a "Hola," y un "—" colgado a fin de línea (sin emisor) se borra.
 */
function limpiar(texto: string): string {
  return texto.replace(/[ \t]+(?=[,.;:!?])/g, '').replace(/[ \t]+—[ \t]*$/gm, '')
}
