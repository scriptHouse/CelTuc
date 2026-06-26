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

/** Encabezado CelTuc estándar: nombre, dirección, redes, CUPON/FECHA + logo e íconos.
 *  Agrega los bordes de las cajas de cupón/fecha al acumulador `b`. */
export function ctHeaderXlsx(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  b: Bordes,
  opts: { socials?: 'redes' | 'simple'; cupon: string; dia: string; mes: string; anio: string },
) {
  const ig = opts.socials === 'simple' ? 'CelTuc' : EMPRESA.instagram
  const fb = opts.socials === 'simple' ? 'CelTuc' : EMPRESA.facebook
  put(ws, 'C3', '   ' + EMPRESA.nombre, calibri(16, true), ALIGN.left)
  put(ws, 'C4', EMPRESA.direccion, calibri(8), ALIGN.left)
  put(ws, 'C5', `   ${ig}      ${fb}`, calibri(9), ALIGN.left)
  put(ws, 'F3', 'CUPON N°', calibri(11), ALIGN.center)
  put(ws, 'F5', 'FECHA', calibri(11), ALIGN.center)
  put(ws, 'G3', opts.cupon, calibri(11), ALIGN.center)
  put(ws, 'G5', opts.dia, calibri(11), ALIGN.center)
  put(ws, 'H5', opts.mes, calibri(11), ALIGN.center)
  put(ws, 'I5', opts.anio, calibri(11), ALIGN.center)
  // Cajas: cupón G3:I3 (sin divisiones) y fecha G5:I5 (3 compartimentos).
  b.h(7, 9, 3, 'top')
  b.h(7, 9, 3, 'bottom')
  b.add(7, 3, { left: MEDIUM })
  b.add(9, 3, { right: MEDIUM })
  b.h(7, 9, 5, 'top')
  b.h(7, 9, 5, 'bottom')
  ;[7, 8, 9].forEach((c) => b.add(c, 5, { left: MEDIUM }))
  b.add(9, 5, { right: MEDIUM })
  // Imágenes
  const add = (uri: string, ext: 'jpeg' | 'png') => wb.addImage({ base64: uri.split(',')[1], extension: ext })
  ws.addImage(add(LOGO_CELTUC, 'jpeg'), { tl: { col: 1.03, row: 1.35 }, ext: { width: 66, height: 66 }, editAs: 'oneCell' })
  ws.addImage(add(ICON_INSTAGRAM, 'jpeg'), { tl: { col: 1.92, row: 4.35 }, ext: { width: 13, height: 13 }, editAs: 'oneCell' })
  ws.addImage(add(ICON_FACEBOOK, 'jpeg'), { tl: { col: 3.0, row: 4.35 }, ext: { width: 13, height: 13 }, editAs: 'oneCell' })
}

/** Texto enriquecido para una celda de garantía (tamaño chico, con negritas). */
export function richGarantia(runs: Run[], size = 7): ExcelJS.CellValue {
  return { richText: runs.map((r) => ({ font: { name: 'Calibri', size, bold: !!r.bold }, text: r.t })) }
}

export async function blobDe(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
