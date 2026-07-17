import ExcelJS from 'exceljs'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA } from './content'
import type { Run } from './kit'

/* ============================================================================
 * Kit de helpers para generar los XLSX (exceljs) reproduciendo las hojas
 * originales: bordes, celdas combinadas, anchos/altos, fuentes, header y logo.
 * ========================================================================== */

export const MEDIUM = { style: 'medium' as const, color: { argb: 'FF000000' } }
export type Side = Partial<Record<'top' | 'bottom' | 'left' | 'right', typeof MEDIUM>>

/** Acumula bordes por celda y los aplica fusionando lados. */
export class Bordes {
  private map = new Map<string, Side>()
  add(col: number, row: number, sides: Side) {
    const k = `${row}:${col}`
    this.map.set(k, { ...this.map.get(k), ...sides })
  }
  h(cFrom: number, cTo: number, row: number, side: 'top' | 'bottom') {
    for (let c = cFrom; c <= cTo; c++) this.add(c, row, { [side]: MEDIUM } as Side)
  }
  v(col: number, rFrom: number, rTo: number, side: 'left' | 'right') {
    for (let r = rFrom; r <= rTo; r++) this.add(col, r, { [side]: MEDIUM } as Side)
  }
  /** Rectángulo c1..c2 × r1..r2 con divisores horizontales opcionales (bottom de esas filas). */
  caja(c1: number, r1: number, c2: number, r2: number, divAfter: number[] = []) {
    this.h(c1, c2, r1, 'top')
    this.h(c1, c2, r2, 'bottom')
    this.v(c1, r1, r2, 'left')
    this.v(c2, r1, r2, 'right')
    divAfter.forEach((r) => this.h(c1, c2, r, 'bottom'))
  }
  apply(ws: ExcelJS.Worksheet) {
    this.map.forEach((side, k) => {
      const [r, c] = k.split(':').map(Number)
      ws.getCell(r, c).border = side
    })
  }
}

/** Caja completa sobre la celda maestra de un rango combinado. */
export function cajaCompletaEn(ws: ExcelJS.Worksheet, addr: string) {
  ws.getCell(addr).border = { top: MEDIUM, bottom: MEDIUM, left: MEDIUM, right: MEDIUM }
}

export function nuevaHoja(nombre: string): { wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet } {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CelTuc'
  wb.created = new Date()
  const ws = wb.addWorksheet(nombre, {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      horizontalCentered: true,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  })
  return { wb, ws }
}

export function setCols(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
}

/** Altos de fila desde un array (índice 0 = fila 1). */
export function setRows(ws: ExcelJS.Worksheet, heights: number[]) {
  heights.forEach((h, i) => (ws.getRow(i + 1).height = h))
}

export function calibri(size: number, bold = false): Partial<ExcelJS.Font> {
  return { name: 'Calibri', size, bold }
}

export function put(
  ws: ExcelJS.Worksheet,
  addr: string,
  value: ExcelJS.CellValue,
  font: Partial<ExcelJS.Font>,
  align?: Partial<ExcelJS.Alignment>,
) {
  const cell = ws.getCell(addr)
  cell.value = value
  cell.font = font
  if (align) cell.alignment = align
}

export const ALIGN = {
  left: { horizontal: 'left' as const, vertical: 'middle' as const },
  center: { horizontal: 'center' as const, vertical: 'middle' as const },
  leftTop: { horizontal: 'left' as const, vertical: 'top' as const, wrapText: true },
  justify: { horizontal: 'justify' as const, vertical: 'top' as const, wrapText: true },
}

/** Anchos de columna del formato estándar (Excel nuevo). */
export const STD_COLS = [0.86, 11.43, 13, 16, 13.71, 11.43, 13, 13, 10.43, 0.86]

/** Encabezado CelTuc del formato nuevo (filas 2-4): identidad + CUPON (fila 2) y
 *  FECHA en tres cajas (fila 3), con logo e íconos. Agrega bordes al acumulador `b`. */
export function ctHeaderXlsx(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  b: Bordes,
  opts: { socials?: 'redes' | 'simple'; cupon: string; dia: string; mes: string; anio: string; direccion?: string },
) {
  const ig = opts.socials === 'simple' ? 'CelTuc' : EMPRESA.instagram
  const fb = opts.socials === 'simple' ? 'CelTuc' : EMPRESA.facebook
  put(ws, 'C2', '   ' + EMPRESA.nombre, calibri(16, true), ALIGN.left)
  put(ws, 'C3', opts.direccion ?? EMPRESA.direccion, calibri(8), ALIGN.left)
  put(ws, 'C4', `   ${ig}      ${fb}`, calibri(9), ALIGN.left)
  put(ws, 'F2', 'CUPON N°', calibri(11), ALIGN.center)
  put(ws, 'F3', 'FECHA', calibri(11), ALIGN.center)
  put(ws, 'G2', opts.cupon, calibri(11), ALIGN.center)
  put(ws, 'G3', opts.dia, calibri(11), ALIGN.center)
  put(ws, 'H3', opts.mes, calibri(11), ALIGN.center)
  put(ws, 'I3', opts.anio, calibri(11), ALIGN.center)
  // Caja de cupón G2:I2 (sin divisiones internas).
  b.h(7, 9, 2, 'top')
  b.h(7, 9, 2, 'bottom')
  b.add(7, 2, { left: MEDIUM })
  b.add(9, 2, { right: MEDIUM })
  // Fecha G3/H3/I3: cada celda es su propia caja.
  b.h(7, 9, 3, 'top')
  b.h(7, 9, 3, 'bottom')
  ;[7, 8, 9].forEach((c) => b.add(c, 3, { left: MEDIUM, right: MEDIUM }))
  // Imágenes
  const add = (uri: string, ext: 'jpeg' | 'png') => wb.addImage({ base64: uri.split(',')[1], extension: ext })
  ws.addImage(add(LOGO_CELTUC, 'jpeg'), { tl: { col: 1.05, row: 1.1 }, ext: { width: 56, height: 56 }, editAs: 'oneCell' })
  ws.addImage(add(ICON_INSTAGRAM, 'jpeg'), { tl: { col: 2.03, row: 3.28 }, ext: { width: 12, height: 12 }, editAs: 'oneCell' })
  ws.addImage(add(ICON_FACEBOOK, 'jpeg'), { tl: { col: 2.62, row: 3.28 }, ext: { width: 12, height: 12 }, editAs: 'oneCell' })
}

/** Bloque de firmas: fila con las líneas y fila con las leyendas (B:D y F:H). */
export function firmasXlsx(ws: ExcelJS.Worksheet, filaLinea: number, izq = 'FIRMA', der = 'ACLARACION') {
  const linea = '_____________________________________________'
  const filaLabel = filaLinea + 1
  ws.mergeCells(`B${filaLinea}:D${filaLinea}`)
  ws.mergeCells(`F${filaLinea}:H${filaLinea}`)
  ws.mergeCells(`B${filaLabel}:D${filaLabel}`)
  ws.mergeCells(`F${filaLabel}:H${filaLabel}`)
  put(ws, `B${filaLinea}`, linea, calibri(8), { horizontal: 'center', wrapText: true })
  put(ws, `F${filaLinea}`, linea, calibri(8), { horizontal: 'center', wrapText: true })
  put(ws, `B${filaLabel}`, izq, calibri(7), { horizontal: 'center', vertical: 'top', wrapText: true })
  put(ws, `F${filaLabel}`, der, calibri(7), { horizontal: 'center', vertical: 'top', wrapText: true })
}

/** Texto enriquecido para una celda de garantía (tamaño chico, con negritas). */
export function richGarantia(runs: Run[], size = 7): ExcelJS.CellValue {
  return { richText: runs.map((r) => ({ font: { name: 'Calibri', size, bold: !!r.bold }, text: r.t })) }
}

export async function blobDe(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
