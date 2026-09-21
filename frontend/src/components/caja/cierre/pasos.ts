import { Banknote, CreditCard, ListChecks, Lock, Scale, Sunrise } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CajaConfig, MedioPagoCaja } from '@/types'
import { MEDIOS_PAGO_CAJA } from '@/types'
import { montoDe } from '@/documentos/montos'

/**
 * Los pasos del cierre de caja y sus textos.
 *
 * El cierre se arma según la configuración: cada paso aparece solo si hace
 * falta (sin tareas no hay «Antes de empezar», sin transferencias ni tarjetas
 * no hay nada que revisar…). Los textos están escritos para que los entienda
 * cualquiera, aunque sea su primer día: nada de «arqueo», «bóveda» ni «lote»
 * sin explicar.
 */

export type PasoCierre = 'tareas' | 'efectivo' | 'otros' | 'resultado' | 'fondo' | 'confirmar'

/** Todos los pasos posibles, en orden. */
export const ORDEN_PASOS: PasoCierre[] = ['tareas', 'efectivo', 'otros', 'resultado', 'fondo', 'confirmar']

/**
 * Los pasos de ESTE cierre. Contar, ver si cuadra y cerrar están siempre; el
 * resto aparece solo si tiene algo para hacer.
 */
export function pasosDelCierre(hay: { tareas: boolean; otros: boolean; fondo: boolean }): PasoCierre[] {
  return ORDEN_PASOS.filter((p) => {
    if (p === 'tareas') return hay.tareas
    if (p === 'otros') return hay.otros
    if (p === 'fondo') return hay.fondo
    return true
  })
}

/** Si el paso dejó de existir (p. ej. cambió la configuración), el anterior que sí está. */
export function pasoVigente(paso: PasoCierre, pasos: PasoCierre[]): PasoCierre {
  if (pasos.includes(paso)) return paso
  const orden = ORDEN_PASOS.indexOf(paso)
  const anteriores = pasos.filter((p) => ORDEN_PASOS.indexOf(p) < orden)
  return anteriores[anteriores.length - 1] ?? pasos[0]
}

/** Cómo se está contando el efectivo en este momento. */
export type FormaConteo = 'billetes' | 'total'

export interface InfoPaso {
  /** Nombre corto (la barra de pasos). */
  corto: string
  /** La consigna grande del encabezado. */
  titulo: string
  /** Una línea que dice para qué es el paso. */
  bajada: string
  /** «¿Qué hago acá?»: qué hacer, con palabras simples. */
  ayuda: string
  icono: LucideIcon
}

const INFO: Record<PasoCierre, InfoPaso> = {
  tareas: {
    corto: 'Antes de empezar',
    titulo: 'Antes de empezar',
    bajada: 'Hacé estas tareas y tildalas. Después contamos la plata.',
    ayuda:
      'Hacé cada tarea de la lista y tocala para marcarla como hecha. Cuando estén todas tildadas, tocá «Empezar a contar».',
    icono: ListChecks,
  },
  efectivo: {
    corto: 'Contar efectivo',
    titulo: 'Contá los billetes del cajón',
    bajada: 'Tocá un billete por cada uno que tengas. El total se suma solo.',
    ayuda:
      'Sacá toda la plata del cajón y separala por billete. Tocá el billete (o el +) una vez por cada uno que tengas; si te pasás, usá el −. Las monedas y los billetes que no están en la lista se suman juntos en «Monedas y sueltos».',
    icono: Banknote,
  },
  otros: {
    corto: 'Otros cobros',
    titulo: 'Revisá transferencias y tarjetas',
    bajada: '¿Lo que anotó el sistema es lo mismo que ves en el banco y en el posnet?',
    ayuda:
      'Para cada uno, mirá cuánto entró hoy en la cuenta del banco o en el ticket del posnet. Si es el mismo número, tocá «Sí, es igual». Si no, tocá «No, es otro» y escribí el número que ves.',
    icono: CreditCard,
  },
  resultado: {
    corto: '¿Cuadra?',
    titulo: '¿Cuadra la caja?',
    bajada: 'Comparamos lo que contaste con lo que tendría que haber.',
    ayuda:
      'Si falta o sobra plata, primero volvé a contar: casi siempre es un billete que se pasó. Si igual no cuadra, contá qué pasó para que quede anotado.',
    icono: Scale,
  },
  fondo: {
    corto: 'Para mañana',
    titulo: '¿Cuánto dejás para mañana?',
    bajada: 'Es el cambio para dar vuelto cuando se vuelva a abrir la caja.',
    ayuda:
      'Dejá billetes chicos: son los que sirven para dar vuelto. Lo que no queda en el cajón se guarda aparte (en la caja fuerte o para llevar al banco).',
    icono: Sunrise,
  },
  confirmar: {
    corto: 'Cerrar',
    titulo: 'Revisá y cerrá la caja',
    bajada: 'Así queda el cierre. Cuando cierres, ya no se puede cambiar.',
    ayuda:
      'Mirá que los números estén bien. Si algo no está bien, tocá «Cambiar» al lado, o tocá el paso arriba para volver.',
    icono: Lock,
  },
}

/** Los textos de un paso (el de contar cambia si se escribe el total). */
export function infoPaso(paso: PasoCierre, forma: FormaConteo = 'billetes'): InfoPaso {
  if (paso === 'efectivo' && forma === 'total') {
    return {
      ...INFO.efectivo,
      titulo: '¿Cuánta plata hay en el cajón?',
      bajada: 'Contá todo el efectivo, con las monedas, y escribí el total.',
      ayuda:
        'Sacá toda la plata del cajón y contala: billetes y monedas. Escribí el total en el recuadro. Si preferís que el sistema sume por vos, elegí «Billete por billete».',
    }
  }
  return INFO[paso]
}

// ===== Medios que no son efectivo ==============================================

export type OtroMedio = Exclude<MedioPagoCaja, 'efectivo'>

/** Transferencias, tarjeta y otro, en el orden de la UI. */
export const OTROS_MEDIOS: OtroMedio[] = MEDIOS_PAGO_CAJA.map((m) => m.value).filter(
  (m): m is OtroMedio => m !== 'efectivo',
)

/** La respuesta a «¿es lo mismo que ves?» de un medio. */
export interface RevisionMedio {
  respuesta: 'igual' | 'otro' | null
  /** Lo que se ve en el banco / posnet, si no es igual. */
  monto: string
}

/** ¿Ese medio ya quedó revisado? (es igual, o se escribió el otro monto). */
export function medioRevisado(r?: RevisionMedio): boolean {
  if (!r) return false
  return r.respuesta === 'igual' || (r.respuesta === 'otro' && hayMonto(r.monto))
}

/** Dónde mirar para saber si lo que anotó el sistema está bien. */
export const DONDE_MIRAR: Record<OtroMedio, string> = {
  transferencia: 'Mirá cuánto entró hoy en la cuenta del banco (la del Responsable Inscripto).',
  transf_financiera: 'Mirá cuánto entró hoy en la cuenta financiera (la del monotributo).',
  tarjeta: 'Mirá el total del ticket de «Cierre de lote» que imprime el posnet.',
  otro: 'Revisá los comprobantes de los cobros que se hicieron de otra forma.',
}

// ===== Tareas antes de contar ==================================================

export interface TareaCierre {
  /** Identifica la tarea en el estado del asistente. */
  clave: string
  titulo: string
  /** Explicación para quien no sabe cómo se hace (opcional). */
  detalle?: string
  /** Cómo queda escrita en el comprobante. */
  registro: string
}

/** El cierre del posnet: se pide si hubo ventas con tarjeta y la config lo exige. */
export const TAREA_LOTE: TareaCierre = {
  clave: 'lote',
  titulo: 'Hacé el cierre de lote en el posnet',
  detalle:
    'En la maquinita de las tarjetas elegí «Cierre de lote». Sale un ticket con todo lo que se cobró con tarjeta hoy: guardalo, lo vas a usar para comparar.',
  registro: 'Cierre de lote del posnet',
}

/** Las tareas que se piden antes de contar, en orden. */
export function tareasDelCierre(config: CajaConfig, huboTarjeta: boolean): TareaCierre[] {
  const tareas: TareaCierre[] = []
  if (config.exigirLote && huboTarjeta) tareas.push(TAREA_LOTE)
  // La clave es el texto (vienen sin repetir): si la configuración cambia en el
  // medio del cierre, lo tildado sigue pegado a su tarea.
  for (const texto of config.tareasCierre) {
    tareas.push({ clave: `propia:${texto}`, titulo: texto, registro: texto })
  }
  return tareas
}

// ===== Números =================================================================

/** Redondea a centavos: así 0,1 + 0,2 nunca deja una diferencia fantasma. */
export function centavos(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Lee la plata escrita a mano con la misma regla que el resto del sistema:
 * «10.000», «10000», «$ 10.000» y «10.000,50» se entienden bien.
 */
export function leerMonto(texto: string): number {
  const normalizado = montoDe(texto)
  return normalizado ? Number(normalizado) : 0
}

/** ¿El texto tiene un número legible? (vacío o letras = no). */
export function hayMonto(texto: string): boolean {
  return montoDe(texto) !== undefined
}

/** «1 venta» / «3 ventas». */
export function ventasLabel(n: number): string {
  return n === 1 ? '1 venta' : `${n} ventas`
}

/** Un monto como lo escribe una persona («10.000», «152.500,5»): se vuelve a leer igual. */
export function montoATexto(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

/** El salto de la barra deslizante del fondo, según cuánta plata hay. */
export function saltoDeFondo(maximo: number): number {
  if (maximo >= 200000) return 1000
  if (maximo >= 20000) return 500
  return 100
}
