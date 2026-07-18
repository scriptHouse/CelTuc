/**
 * Mensaje de WhatsApp de las cotizaciones: plantilla configurable + guardado.
 *
 * El texto que se copia al tocar "WhatsApp" en un modelo ya no está fijo en el
 * código: es una plantilla editable con variables (`{modelo}`, `{precio}`…) que
 * se rellenan con los datos reales del equipo al copiar. Se guarda en
 * `localStorage` (por dispositivo), igual que la dirección de los documentos.
 */

const KEY = 'celtuc:cotizaciones:mensajeWhatsapp'

/** Texto por defecto (la misma redacción que traía la planilla). */
export const PLANTILLA_WHATSAPP_DEFAULT =
  'Al {modelo} podríamos tomarlo en el orden de los USD {precio}. ' +
  'Esto siempre y cuando el equipo se encuentre en condiciones estándar y no haya que reacondicionarlo. ' +
  'La valuación final se pasa en el local a la hora de cotizar el equipo.'

/** Variables disponibles para insertar en la plantilla. */
export interface VariableMensaje {
  token: string
  etiqueta: string
  descripcion: string
  /** Valor de ejemplo, usado en la vista previa del editor. */
  ejemplo: string
}

export const VARIABLES_MENSAJE: VariableMensaje[] = [
  { token: '{modelo}', etiqueta: 'Modelo', descripcion: 'Nombre completo del equipo', ejemplo: 'iPhone 13 Pro Max' },
  { token: '{precio}', etiqueta: 'Precio', descripcion: 'Valor sugerido (punto medio del rango)', ejemplo: '480' },
  { token: '{min}', etiqueta: 'Mínimo', descripcion: 'Toma más baja del modelo', ejemplo: '430' },
  { token: '{max}', etiqueta: 'Máximo', descripcion: 'Toma más alta del modelo', ejemplo: '530' },
]

/** Valores de ejemplo (para la vista previa del editor). */
export const EJEMPLO_MENSAJE = {
  modelo: 'iPhone 13 Pro Max',
  precio: '480',
  min: '430',
  max: '530',
}

/** Plantilla guardada, o la de por defecto si no hay ninguna. */
export function leerPlantillaWhatsapp(): string {
  try {
    const guardada = localStorage.getItem(KEY)
    if (guardada && guardada.trim()) return guardada
  } catch {
    /* localStorage no disponible */
  }
  return PLANTILLA_WHATSAPP_DEFAULT
}

/**
 * Guarda la plantilla. Si queda vacía o es igual a la de por defecto, borra la
 * personalización (así "restaurar" no deja basura en localStorage).
 */
export function guardarPlantillaWhatsapp(plantilla: string): void {
  const limpia = plantilla.trim()
  try {
    if (!limpia || limpia === PLANTILLA_WHATSAPP_DEFAULT) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, limpia)
  } catch {
    /* localStorage no disponible */
  }
}

/** Reemplaza las variables de la plantilla por los valores reales del equipo. */
export function construirMensajeCotizacion(
  plantilla: string,
  valores: { modelo: string; precio: string; min: string; max: string },
): string {
  return plantilla
    .replace(/\{modelo\}/g, valores.modelo)
    .replace(/\{precio\}/g, valores.precio)
    .replace(/\{min\}/g, valores.min)
    .replace(/\{max\}/g, valores.max)
}
