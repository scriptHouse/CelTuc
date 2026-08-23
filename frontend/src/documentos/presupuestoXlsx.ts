import type { Workbook, Worksheet } from 'exceljs'
import { ALIGN, Bordes, blobDe, calibri, nuevaHoja, put, setCols, setRows } from './kitXlsx'
import { LOGO_CELTUC } from './assets'
import { EMPRESA, lineaDireccion } from './content'
import {
  CUOTAS_LABELS,
  EQUIPO_LABELS,
  EQUIPO_TITULO,
  FINANCIACION_TITULO,
  NOTA_EQUIPO,
  NOTA_SERVICE,
  SERVICE_LABELS,
  SERVICE_TITULO,
  totalesEquipo,
  totalesService,
  type PlanPresupuesto,
  type PresupuestoEquipoData,
  type PresupuestoServiceData,
} from './presupuestoComun'

/**
 * Los dos presupuestos en Excel, sobre la grilla de la planilla original.
 *
 * A diferencia del PDF (que es una foto), acá los totales y las cuotas se
 * escriben como FÓRMULAS: se cambia el precio o el dólar en la celda gris y la
 * planilla se recalcula sola, que es exactamente para lo que el negocio la
 * venía usando. Los recargos de cada plan quedan en su columna, así se ve de
 * dónde sale cada número.
 */

/** Formatos numéricos de la planilla original. */
const FMT_USD = '[$usd]\\ #,##0.00'
const FMT_ARS = '[$$]\\ #,##0'
const FMT_PCT = '0.0%'

/** Gris de las celdas rellenables ("completar únicamente las celdas en gris"). */
const GRIS = 'FFD9D9D9'
const GRIS_FUERTE = 'FFBFBFBF'

function pintar(ws: Worksheet, addr: string, argb: string) {
  ws.getCell(addr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

/** Escribe el logo y la identidad en el bloque superior izquierdo. */
function encabezado(
  wb: Workbook,
  ws: Worksheet,
  b: Bordes,
  opciones: { direccion: string; filas: Array<[string, string | number | Date]>; colEtiqueta: number },
) {
  // Identidad (el logo flota sobre las filas 1-3).
  put(ws, 'B1', `      ${EMPRESA.nombre} ®`, calibri(16, true), ALIGN.left)
  put(ws, 'B2', `      ${lineaDireccion(opciones.direccion)}`, calibri(8), ALIGN.left)
  put(ws, 'B3', `      ${EMPRESA.instagram}   ${EMPRESA.facebook}`, calibri(8), ALIGN.left)
  b.caja(2, 1, 3, 3)

  const { colEtiqueta } = opciones
  opciones.filas.forEach(([etiqueta, valor], i) => {
    const fila = i + 1
    put(ws, `${letra(colEtiqueta)}${fila}`, etiqueta, calibri(9, true), ALIGN.right)
    const celda = ws.getCell(fila, colEtiqueta + 1)
    celda.value = valor
    celda.font = { name: 'Calibri', size: 10 }
    celda.alignment = { horizontal: 'center', vertical: 'middle' }
    b.caja(colEtiqueta + 1, fila, colEtiqueta + 1, fila)
    pintar(ws, `${letra(colEtiqueta + 1)}${fila}`, GRIS)
  })

  const logoId = wb.addImage({ base64: LOGO_CELTUC.split(',')[1], extension: 'jpeg' })
  ws.addImage(logoId, { tl: { col: 1.05, row: 0.1 }, ext: { width: 50, height: 50 }, editAs: 'oneCell' })
}

function letra(col: number): string {
  let n = col
  let out = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    out = String.fromCharCode(65 + resto) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/**
 * Tabla de financiación. `celdaBase` es la celda con el monto sobre el que se
 * calcula (el total en pesos), y cada fila queda como `=base*(1+recargo)`: al
 * tocar el precio, la tabla entera se actualiza sola.
 */
function tablaCuotas(
  ws: Worksheet,
  b: Bordes,
  opciones: {
    filaTitulo: number
    colDesde: number
    colHasta: number
    celdaBase: string
    planes: PlanPresupuesto[]
    base: number
  },
): number {
  const { filaTitulo, colDesde, colHasta, celdaBase, planes, base } = opciones
  const colCuota = colDesde
  const colRecargo = colDesde + 1
  const colTotal = colHasta - 1
  const colValor = colHasta

  ws.mergeCells(`${letra(colDesde)}${filaTitulo}:${letra(colHasta)}${filaTitulo}`)
  put(ws, `${letra(colDesde)}${filaTitulo}`, FINANCIACION_TITULO, calibri(11, true), ALIGN.left)
  b.caja(colDesde, filaTitulo, colHasta, filaTitulo)

  const filaCabecera = filaTitulo + 1
  const titulos: Array<[number, string]> = [
    [colCuota, CUOTAS_LABELS.cuota],
    [colRecargo, 'Recargo'],
    [colTotal, CUOTAS_LABELS.total],
    [colValor, CUOTAS_LABELS.valor],
  ]
  titulos.forEach(([col, texto]) => {
    put(ws, `${letra(col)}${filaCabecera}`, texto, calibri(10, true), ALIGN.center)
  })
  b.caja(colDesde, filaCabecera, colHasta, filaCabecera)

  let fila = filaCabecera + 1
  for (const plan of planes) {
    put(ws, `${letra(colCuota)}${fila}`, plan.etiqueta, calibri(10), ALIGN.left)

    const recargo = ws.getCell(fila, colRecargo)
    recargo.value = plan.interes / 100
    recargo.numFmt = FMT_PCT
    recargo.font = { name: 'Calibri', size: 10 }
    recargo.alignment = { horizontal: 'center', vertical: 'middle' }

    const total = ws.getCell(fila, colTotal)
    total.value = { formula: `${celdaBase}*(1+${letra(colRecargo)}${fila})`, result: base * (1 + plan.interes / 100) }
    total.numFmt = FMT_ARS
    total.font = { name: 'Calibri', size: 10 }
    total.alignment = { horizontal: 'center', vertical: 'middle' }

    const valor = ws.getCell(fila, colValor)
    const cuotas = Math.max(1, plan.cuotas)
    valor.value = { formula: `${letra(colTotal)}${fila}/${cuotas}`, result: (base * (1 + plan.interes / 100)) / cuotas }
    valor.numFmt = FMT_ARS
    valor.font = { name: 'Calibri', size: 10, bold: true }
    valor.alignment = { horizontal: 'center', vertical: 'middle' }

    b.caja(colDesde, fila, colHasta, fila)
    fila += 1
  }
  return fila
}

/* ===================== Presupuesto de equipo ===================== */

export async function construirPresupuestoEquipoXlsx(
  d: PresupuestoEquipoData,
  direccion: string = EMPRESA.direccion,
): Promise<Blob> {
  const { wb, ws } = nuevaHoja('Presupuesto equipo')
  //            A     B      C      D      E      F
  setCols(ws, [2.7, 26, 14, 16, 15, 15, 2.7])
  setRows(ws, [19, 19, 14])

  const b = new Bordes()
  const { precio, entrega, totalUsd, cotizacion, totalPesos } = totalesEquipo(d)

  encabezado(wb, ws, b, {
    direccion,
    colEtiqueta: 4, // D = etiqueta, E = valor
    filas: [
      [EQUIPO_LABELS.numero, d.numero],
      [EQUIPO_LABELS.fecha, d.fecha],
      [EQUIPO_LABELS.vendedor, d.vendedor],
    ],
  })

  // Título
  ws.mergeCells('B4:F4')
  put(ws, 'B4', EQUIPO_TITULO, calibri(12, true), ALIGN.center)
  b.caja(2, 4, 6, 4)

  // Cliente
  put(ws, 'B5', EQUIPO_LABELS.cliente, calibri(10, true), ALIGN.left)
  put(ws, 'E5', EQUIPO_LABELS.telefono, calibri(10, true), ALIGN.right)
  ws.mergeCells('B6:D6')
  put(ws, 'B6', d.cliente, calibri(11), ALIGN.left)
  ws.mergeCells('E6:F6')
  put(ws, 'E6', d.telefono, calibri(11), ALIGN.center)
  b.caja(2, 6, 4, 6)
  b.caja(5, 6, 6, 6)
  pintar(ws, 'B6', GRIS)
  pintar(ws, 'E6', GRIS)

  // Equipo + precio
  put(ws, 'B7', EQUIPO_LABELS.equipo, calibri(10, true), ALIGN.left)
  put(ws, 'E7', EQUIPO_LABELS.precio, calibri(10, true), ALIGN.center)
  ws.mergeCells('B8:D8')
  put(ws, 'B8', d.equipo, calibri(11), ALIGN.left)
  ws.getCell('E8').value = precio || null
  ws.getCell('E8').numFmt = FMT_USD
  ws.getCell('E8').font = { name: 'Calibri', size: 11 }
  ws.getCell('E8').alignment = ALIGN.center
  b.caja(2, 8, 4, 8)
  b.caja(5, 8, 5, 8)
  pintar(ws, 'B8', GRIS_FUERTE)
  pintar(ws, 'E8', GRIS_FUERTE)

  // Condición
  put(ws, 'B9', EQUIPO_LABELS.condicion, calibri(10, true), ALIGN.left)
  ws.mergeCells('B10:D10')
  put(ws, 'B10', d.condicion, calibri(11), ALIGN.left)
  b.caja(2, 10, 4, 10)
  pintar(ws, 'B10', GRIS)

  // Entrega + precio
  put(ws, 'B11', EQUIPO_LABELS.entrega, calibri(10, true), ALIGN.left)
  put(ws, 'E11', EQUIPO_LABELS.precio, calibri(10, true), ALIGN.center)
  ws.mergeCells('B12:D12')
  put(ws, 'B12', d.entrega, calibri(11), ALIGN.left)
  ws.getCell('E12').value = entrega || null
  ws.getCell('E12').numFmt = FMT_USD
  ws.getCell('E12').font = { name: 'Calibri', size: 11 }
  ws.getCell('E12').alignment = ALIGN.center
  b.caja(2, 12, 4, 12)
  b.caja(5, 12, 5, 12)
  pintar(ws, 'B12', GRIS_FUERTE)
  pintar(ws, 'E12', GRIS_FUERTE)

  // Observaciones
  put(ws, 'B13', EQUIPO_LABELS.observaciones, calibri(10, true), ALIGN.left)
  ws.mergeCells('B14:F15')
  put(ws, 'B14', d.observaciones, calibri(10), ALIGN.leftTop)
  b.caja(2, 14, 6, 15)
  pintar(ws, 'B14', GRIS)

  // TOTAL A PAGAR
  ws.mergeCells('B17:F17')
  put(ws, 'B17', EQUIPO_LABELS.totalTitulo, calibri(11, true), ALIGN.center)
  b.caja(2, 17, 6, 17)

  put(ws, 'B18', EQUIPO_LABELS.totalUsd, calibri(11, true), ALIGN.left)
  // El total en dólares es precio − entrega: se deja como fórmula viva.
  ws.getCell('E18').value = { formula: 'E8-E12', result: totalUsd }
  ws.getCell('E18').numFmt = FMT_USD
  ws.getCell('E18').font = { name: 'Calibri', size: 11, bold: true }
  ws.getCell('E18').alignment = ALIGN.center
  b.caja(5, 18, 5, 18)

  put(ws, 'B19', EQUIPO_LABELS.dolar, calibri(10, true), ALIGN.left)
  ws.getCell('C19').value = cotizacion || null
  ws.getCell('C19').numFmt = '#,##0'
  ws.getCell('C19').font = { name: 'Calibri', size: 10 }
  ws.getCell('C19').alignment = ALIGN.center
  b.caja(3, 19, 3, 19)
  pintar(ws, 'C19', GRIS_FUERTE)

  put(ws, 'B20', EQUIPO_LABELS.totalPesos, calibri(11, true), ALIGN.left)
  ws.getCell('E20').value = { formula: 'E18*C19', result: totalPesos }
  ws.getCell('E20').numFmt = FMT_ARS
  ws.getCell('E20').font = { name: 'Calibri', size: 12, bold: true }
  ws.getCell('E20').alignment = ALIGN.center
  b.caja(5, 20, 5, 20)

  // Financiación
  if (d.tarjeta.trim()) {
    put(ws, 'B21', `${CUOTAS_LABELS.tarjeta}: ${d.tarjeta}`, calibri(10, true), ALIGN.left)
  }
  const filaNota = tablaCuotas(ws, b, {
    filaTitulo: 22,
    colDesde: 2,
    colHasta: 6,
    celdaBase: '$E$20',
    planes: d.planes,
    base: totalPesos,
  })

  // Nota
  const nota = filaNota + 1
  ws.mergeCells(`B${nota}:F${nota + 1}`)
  put(ws, `B${nota}`, NOTA_EQUIPO, calibri(8), { horizontal: 'left', vertical: 'top', wrapText: true })
  b.caja(2, nota, 6, nota + 1)
  ws.getRow(nota).height = 16
  ws.getRow(nota + 1).height = 16

  b.apply(ws)
  ws.pageSetup.printArea = `A1:G${nota + 2}`
  return blobDe(wb)
}

/* ===================== Presupuesto de service ===================== */

export async function construirPresupuestoServiceXlsx(
  d: PresupuestoServiceData,
  direccion: string = EMPRESA.direccion,
): Promise<Blob> {
  const { wb, ws } = nuevaHoja('Presupuesto service')
  setCols(ws, [2.7, 26, 14, 16, 15, 15, 2.7])
  setRows(ws, [19, 19, 14])

  const b = new Bordes()
  const { lista, contado } = totalesService(d)

  encabezado(wb, ws, b, {
    direccion,
    colEtiqueta: 4,
    filas: [
      [SERVICE_LABELS.numero, d.numero],
      [SERVICE_LABELS.fecha, d.fecha],
      [SERVICE_LABELS.recepciono, d.recepciono],
    ],
  })

  ws.mergeCells('B4:F4')
  put(ws, 'B4', SERVICE_TITULO, calibri(12, true), ALIGN.center)
  b.caja(2, 4, 6, 4)

  // Cliente
  put(ws, 'B5', SERVICE_LABELS.cliente, calibri(10, true), ALIGN.left)
  put(ws, 'E5', SERVICE_LABELS.telefono, calibri(10, true), ALIGN.right)
  ws.mergeCells('B6:D6')
  put(ws, 'B6', d.cliente, calibri(11), ALIGN.left)
  ws.mergeCells('E6:F6')
  put(ws, 'E6', d.telefono, calibri(11), ALIGN.center)
  b.caja(2, 6, 4, 6)
  b.caja(5, 6, 6, 6)
  pintar(ws, 'B6', GRIS)
  pintar(ws, 'E6', GRIS)

  // Equipo
  put(ws, 'B7', SERVICE_LABELS.equipo, calibri(10, true), ALIGN.left)
  ws.mergeCells('B8:F8')
  put(ws, 'B8', d.equipo, calibri(11), ALIGN.left)
  b.caja(2, 8, 6, 8)
  pintar(ws, 'B8', GRIS)

  // Reparación a realizar
  put(ws, 'B9', SERVICE_LABELS.reparacion, calibri(10, true), ALIGN.left)
  ws.mergeCells('B10:F12')
  put(ws, 'B10', d.reparacion, calibri(10), ALIGN.leftTop)
  b.caja(2, 10, 6, 12)
  pintar(ws, 'B10', GRIS)

  // Observaciones
  put(ws, 'B13', SERVICE_LABELS.obs, calibri(10, true), ALIGN.left)
  ws.mergeCells('B14:F15')
  put(ws, 'B14', d.obs, calibri(10), ALIGN.leftTop)
  b.caja(2, 14, 6, 15)
  pintar(ws, 'B14', GRIS)

  // TOTAL: lista y contado
  put(ws, 'D16', SERVICE_LABELS.precioLista, calibri(9, true), ALIGN.center)
  put(ws, 'E16', SERVICE_LABELS.precioContado, calibri(9, true), ALIGN.center)
  put(ws, 'B17', SERVICE_LABELS.total, calibri(11, true), ALIGN.left)

  ws.getCell('D17').value = lista || null
  ws.getCell('D17').numFmt = FMT_ARS
  ws.getCell('D17').font = { name: 'Calibri', size: 11, bold: true }
  ws.getCell('D17').alignment = ALIGN.center
  pintar(ws, 'D17', GRIS_FUERTE)

  ws.getCell('E17').value = contado || null
  ws.getCell('E17').numFmt = FMT_ARS
  ws.getCell('E17').font = { name: 'Calibri', size: 12, bold: true }
  ws.getCell('E17').alignment = ALIGN.center
  pintar(ws, 'E17', GRIS_FUERTE)

  b.caja(4, 16, 4, 17)
  b.caja(5, 16, 5, 17)

  // Financiación (sobre el precio de LISTA, como en la planilla original)
  if (d.tarjeta.trim()) {
    put(ws, 'B18', `${CUOTAS_LABELS.tarjeta}: ${d.tarjeta}`, calibri(10, true), ALIGN.left)
  }
  const filaNota = tablaCuotas(ws, b, {
    filaTitulo: 19,
    colDesde: 2,
    colHasta: 6,
    celdaBase: '$D$17',
    planes: d.planes,
    base: lista,
  })

  const nota = filaNota + 1
  ws.mergeCells(`B${nota}:F${nota + 1}`)
  put(ws, `B${nota}`, NOTA_SERVICE, calibri(8), { horizontal: 'left', vertical: 'top', wrapText: true })
  b.caja(2, nota, 6, nota + 1)
  ws.getRow(nota).height = 16
  ws.getRow(nota + 1).height = 16

  b.apply(ws)
  ws.pageSetup.printArea = `A1:G${nota + 2}`
  return blobDe(wb)
}

