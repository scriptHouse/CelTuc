import { hoyDMY } from './types'
import { montoDe } from './montos'

/**
 * Lo que comparten los dos presupuestos (Equipo y Service): el contrato de
 * datos, los textos fijos y —sobre todo— el CÁLCULO.
 *
 * La regla del módulo es que el PDF y el XLSX solo reciben `datos`: no pueden
 * pedirle nada al servidor. Por eso los planes de cuotas viajan DENTRO del
 * documento (`planes`, copiados del simulador cuando se arma el presupuesto) y
 * los totales se derivan acá, con funciones puras que usan las tres puntas
 * (preview, PDF y Excel). Así los tres muestran exactamente lo mismo, y un
 * presupuesto ya emitido conserva los recargos con los que se hizo aunque
 * después alguien cambie la tabla del simulador.
 */

/* ===================== Planes de cuotas ===================== */

/**
 * Un plan de cuotas, tal como sale del simulador (`PlanCuota`) pero reducido a
 * lo que el papel necesita. Se copia al documento: es una FOTO del recargo
 * vigente el día del presupuesto.
 */
export interface PlanPresupuesto {
  etiqueta: string
  cuotas: number
  /** Recargo en porcentaje (35 = 35 %). */
  interes: number
}

/**
 * Los planes que van al papel: los de la tarjeta menos los que se hayan sacado
 * a mano (por etiqueta).
 *
 * Si el filtro dejaría la tabla VACÍA —porque se ocultaron todos, o porque el
 * simulador cambió y ninguna etiqueta coincide— devuelve la lista completa: un
 * presupuesto sin financiación no le sirve a nadie, y es más fácil volver a
 * sacar una fila que descubrir por qué no hay ninguna.
 */
export function sinOcultos(
  planes: PlanPresupuesto[],
  ocultas: string[] | undefined,
): PlanPresupuesto[] {
  if (!ocultas?.length) return planes
  const visibles = planes.filter((plan) => !ocultas.includes(plan.etiqueta))
  return visibles.length ? visibles : planes
}

/** Una fila de la tabla de financiación, ya resuelta en pesos. */
export interface CuotaCalculada extends PlanPresupuesto {
  /** Lo que termina pagando con esa tarjeta y ese plan. */
  total: number
  /** Cuánto le sale cada cuota. */
  valorCuota: number
}

/**
 * Aplica cada plan sobre el monto base, igual que la planilla original:
 * `total = base × (1 + interés)` y `valor de cuota = total ÷ cuotas`.
 * Con base 0 (todavía no se cargó el precio) devuelve la tabla en cero, para
 * que el papel no se rompa mientras se está completando.
 */
export function calcularCuotas(base: number, planes: PlanPresupuesto[]): CuotaCalculada[] {
  return planes.map((plan) => {
    const total = base * (1 + plan.interes / 100)
    return { ...plan, total, valorCuota: plan.cuotas > 0 ? total / plan.cuotas : total }
  })
}

/* ===================== Números y plata ===================== */

/**
 * Lee un importe escrito a mano y lo devuelve como número.
 *
 * Reusa el mismo lector que usa el historial (`montoDe`), así "1.435",
 * "$ 1435", "1435,50" y "US$ 720" se entienden igual en todo el sistema.
 */
export function aNumero(texto: string | undefined | null): number {
  const normalizado = montoDe(texto)
  return normalizado ? Number(normalizado) : 0
}

// Intl mete un espacio duro (U+00A0) entre el símbolo y el número; Helvetica lo
// dibuja raro en el PDF, así que se cambia por un espacio común.
const ESPACIO_DURO = String.fromCharCode(0x00a0)
const sinEspacioDuro = (texto: string) => texto.split(ESPACIO_DURO).join(' ')

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const USD = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Pesos sin centavos: $ 1.033.200 (como la planilla). */
export function pesos(valor: number): string {
  return sinEspacioDuro(ARS.format(Math.round(valor) || 0))
}

/** Dólares con centavos: US$ 720,00 (formato `[$usd]#,##0.00` del Excel). */
export function dolares(valor: number): string {
  return sinEspacioDuro(USD.format(valor || 0))
}

const MILES = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/**
 * Un importe escrito a mano, con separador de miles, para IMPRIMIR.
 *
 * Se usa en el PDF (el Excel ya lo hace solo con el formato de celda): el
 * vendedor escribe `351000` y el papel sale `351.000`, igual que la planilla.
 * Si lo escrito no es un número —"a convenir", "s/ presupuesto"— se respeta tal
 * cual: el campo es libre y nunca se pierde lo que se puso.
 */
export function comoNumero(texto: string | undefined | null): string {
  const limpio = (texto ?? '').trim()
  if (!limpio) return ''
  const n = aNumero(limpio)
  return n ? sinEspacioDuro(MILES.format(n)) : limpio
}

/**
 * Precio de contado a partir del de lista, con la MISMA regla que el resto del
 * negocio: se descuenta el porcentaje cash y se redondea PARA ARRIBA al múltiplo
 * configurado. Es la fórmula `=ROUNDUP(lista*0,8;-3)` de la planilla, pero
 * tomando el descuento y el redondeo de Precios Service en vez de fijarlos.
 */
export function contadoDesdeLista(lista: number, descuentoPct: number, redondeo: number): number {
  const neto = lista * (1 - (descuentoPct || 0) / 100)
  if (redondeo > 0) return Math.ceil(neto / redondeo) * redondeo
  return Math.round(neto)
}

/* ===================== Presupuesto de equipo ===================== */

/** Las dos condiciones de la lista desplegable del Excel (celdas AX1:AX2). */
export const CONDICIONES = ['Nuevo', 'Usado'] as const

export interface PresupuestoEquipoData {
  numero: string
  fecha: string
  vendedor: string
  cliente: string
  telefono: string
  equipo: string
  /** Precio del equipo, en dólares. */
  precioUsd: string
  /** "Nuevo" o "Usado" (la planilla lo resuelve con una lista desplegable). */
  condicion: string
  /** Equipo que el cliente entrega como parte de pago (opcional). */
  entrega: string
  /** Cuánto se le toma al equipo de entrega, en dólares. */
  entregaUsd: string
  observaciones: string
  /** Cotización usada para pasar el total a pesos. */
  dolar: string
  /** Tarjeta del simulador de la que salieron los planes (solo informativa). */
  tarjeta: string
  planes: PlanPresupuesto[]
}

export function presupuestoEquipoVacio(): PresupuestoEquipoData {
  const { dia, mes, anio } = hoyDMY()
  return {
    numero: '',
    fecha: `${dia}/${mes}/${anio}`,
    vendedor: '',
    cliente: '',
    telefono: '',
    equipo: '',
    precioUsd: '',
    condicion: CONDICIONES[0],
    entrega: '',
    entregaUsd: '',
    observaciones: '',
    dolar: '',
    tarjeta: '',
    planes: [],
  }
}

/**
 * Totales del presupuesto de equipo. Lo que se entrega como parte de pago se
 * RESTA del precio: el total es lo que el cliente pone de su bolsillo.
 */
export function totalesEquipo(d: PresupuestoEquipoData) {
  const precio = aNumero(d.precioUsd)
  const entrega = aNumero(d.entregaUsd)
  const totalUsd = precio - entrega
  const cotizacion = aNumero(d.dolar)
  const totalPesos = totalUsd * cotizacion
  return { precio, entrega, totalUsd, cotizacion, totalPesos }
}

export const EQUIPO_W = 776
export const EQUIPO_H = 712

export const EQUIPO_TITULO = 'PRESUPUESTO EQUIPO'

export const EQUIPO_LABELS = {
  numero: 'N° PRESUPUESTO',
  fecha: 'FECHA',
  vendedor: 'VENDEDOR',
  cliente: 'CLIENTE',
  telefono: 'TEL',
  equipo: 'EQUIPO',
  precio: 'PRECIO',
  condicion: 'CONDICIÓN',
  entrega: 'ENTREGA (parte de pago)',
  observaciones: 'OBSERVACIONES',
  totalTitulo: 'TOTAL A PAGAR',
  totalUsd: 'TOTAL USD',
  totalPesos: 'TOTAL PESOS',
  dolar: 'DÓLAR',
} as const

/* ===================== Presupuesto de service ===================== */

export interface PresupuestoServiceData {
  numero: string
  fecha: string
  /** Quién recibió el equipo en el mostrador. */
  recepciono: string
  cliente: string
  telefono: string
  equipo: string
  /** Codigo de desbloqueo del equipo: sin el, el service no puede probarlo. */
  pin: string
  reparacion: string
  obs: string
  /** Precio de lista, en pesos. Es la base de las cuotas. */
  precioLista: string
  /** Precio de contado (se sugiere solo con el descuento cash del negocio). */
  precioContado: string
  tarjeta: string
  planes: PlanPresupuesto[]
}

export function presupuestoServiceVacio(): PresupuestoServiceData {
  const { dia, mes, anio } = hoyDMY()
  return {
    numero: '',
    fecha: `${dia}/${mes}/${anio}`,
    recepciono: '',
    cliente: '',
    telefono: '',
    equipo: '',
    pin: '',
    reparacion: '',
    obs: '',
    precioLista: '',
    precioContado: '',
    tarjeta: '',
    planes: [],
  }
}

/**
 * Totales del service. Las cuotas se calculan sobre el precio de LISTA (no
 * sobre el de contado): el contado es el premio por pagar de una.
 */
export function totalesService(d: PresupuestoServiceData) {
  const lista = aNumero(d.precioLista)
  const contado = aNumero(d.precioContado)
  return { lista, contado }
}

export const SERVICE_W = 776
export const SERVICE_H = 660

export const SERVICE_TITULO = 'PRESUPUESTO SERVICE'

export const SERVICE_LABELS = {
  numero: 'N° PRESUPUESTO',
  fecha: 'FECHA',
  recepciono: 'RECEPCIÓN',
  cliente: 'CLIENTE',
  telefono: 'TEL',
  equipo: 'EQUIPO',
  pin: 'PIN',
  reparacion: 'REPARACIÓN A REALIZAR',
  obs: 'OBS.',
  total: 'TOTAL PESOS',
  precioLista: 'PRECIO DE LISTA',
  precioContado: 'PRECIO CONTADO',
} as const

/* ===================== Textos compartidos ===================== */

export const FINANCIACION_TITULO = 'Opciones de financiación con tarjeta de crédito'

export const CUOTAS_LABELS = {
  cuota: 'Cuota',
  total: 'Total Pesos',
  valor: 'Valor Cuota/s',
  tarjeta: 'TARJETA',
} as const

/** Cuando todavía no se eligió tarjeta, el papel lo dice en vez de quedar mudo. */
export const SIN_PLANES = 'Elegí una tarjeta para mostrar las opciones de financiación.'

export const NOTA_EQUIPO =
  'NOTA: la validez del presente presupuesto se extiende hasta la fecha que figura en el mismo, ' +
  'lo mismo aplica para la cotización del dólar y condición del equipo cotizado.'

export const NOTA_SERVICE =
  'NOTA: la validez del presente presupuesto se extiende hasta la fecha que figura en el mismo, ' +
  'lo mismo aplica para la cotización del dólar. Este presupuesto puede sufrir modificaciones en ' +
  'base a la disponibilidad de repuestos.'
