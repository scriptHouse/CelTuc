/**
 * Mensaje de WhatsApp de las cotizaciones: plantilla configurable.
 *
 * El texto que se copia al tocar "WhatsApp" en un modelo ya no está fijo en el
 * código: es una plantilla editable con variables (`{modelo}`, `{precio}`…) que
 * se rellenan con los datos reales del equipo al copiar. Se guarda en el
 * BACKEND como preferencia global (`services/preferencias`), igual que la de
 * facturación: configurarla una vez vale para todos los usuarios y
 * dispositivos. (Antes vivía en `localStorage`; queda una migración one-time.)
 */

import type { VariableMensaje } from '@/components/MensajeWhatsappModal'

/** Clave de la preferencia global (debe existir en el backend). */
export const CLAVE_MENSAJE_COTIZACION = 'cotizaciones.mensaje_whatsapp'

// Donde vivía la plantilla antes (por dispositivo). Solo se usa para migrar
// una vez ese valor al backend y limpiarlo.
const KEY_LOCAL = 'celtuc:cotizaciones:mensajeWhatsapp'

/** Texto por defecto (la misma redacción que traía la planilla). */
export const PLANTILLA_WHATSAPP_DEFAULT =
  'Al {modelo} podríamos tomarlo en el orden de los USD {precio}. ' +
  'Esto siempre y cuando el equipo se encuentre en condiciones estándar y no haya que reacondicionarlo. ' +
  'La valuación final se pasa en el local a la hora de cotizar el equipo.'

/** Variables disponibles para insertar en la plantilla. */
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

/**
 * Plantilla efectiva a partir del valor guardado en el backend: vacío (o aún
 * sin cargar) significa «sin personalizar» y se usa la de por defecto.
 */
export function plantillaEfectiva(valorGuardado?: string): string {
  return valorGuardado?.trim() ? valorGuardado : PLANTILLA_WHATSAPP_DEFAULT
}

/** Plantilla personalizada que quedó en ESTE dispositivo, o null si no hay. */
export function plantillaLocalPendiente(): string | null {
  try {
    const guardada = localStorage.getItem(KEY_LOCAL)
    if (guardada && guardada.trim() && guardada !== PLANTILLA_WHATSAPP_DEFAULT) return guardada
  } catch {
    /* localStorage no disponible */
  }
  return null
}

/** Limpia la copia local una vez migrada al backend. */
export function borrarPlantillaLocal(): void {
  try {
    localStorage.removeItem(KEY_LOCAL)
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
