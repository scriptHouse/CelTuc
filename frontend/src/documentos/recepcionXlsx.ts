import ExcelJS from 'exceljs'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA, GARANTIA_RUNS, LABELS } from './content'
import type { RecepcionData } from './types'

/* ============================================================================
 * Genera el XLSX de Recepción reproduciendo la hoja original de CelTuc
 * (bordes, celdas combinadas, anchos, altos, fuentes, logo) y completándola con
 * los datos cargados. El archivo queda 100 % editable, idéntico al original.
 * ========================================================================== */

const BLACK = { argb: 'FF000000' }
const MEDIUM = { style: 'medium' as const, color: BLACK }
type Side = Partial<Record<'top' | 'bottom' | 'left' | 'right', typeof MEDIUM>>

/** Renglones en blanco (con sus guiones) tal cual el Excel original. */
const LINEAS = {
  recibiDe: 'RECIBI DE ______________________________________________________________________',
  equipos: 'EL EQUIPO/S _____________________________________________________________________',
  falla: 'CON LA SIGUIENTE FALLA/S_________________________________________________________',
  fallaExtra: '________________________________________________________________________________',
}

export async function construirRecepcionXlsx(datos: RecepcionData): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CelTuc'
  wb.created = new Date()

  const ws = wb.addWorksheet('Recepcion', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      horizontalCentered: true,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  })

  // ----- Anchos de columna (unidades Excel, igual al original) -----
  const widths = [0.855, 10.71, 7.71, 11.426, 6.855, 12.285, 3.71, 4.285, 3.855, 2.285]
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))

  // ----- Altos de fila (en puntos) -----
  const setH = (r: number, h: number) => (ws.getRow(r).height = h)
  setH(1, 20.1)
  ;[2, 4, 6].forEach((r) => setH(r, 9.95))
  ;[3, 5].forEach((r) => setH(r, 15))
  for (let r = 7; r <= 20; r++) setH(r, 14.1)
  setH(21, 12)
  for (let r = 22; r <= 30; r++) setH(r, 15)
  setH(31, 21)
  setH(32, 7.15)

  // ----- Celdas combinadas (idénticas al original) -----
  ;['A1:J1', 'B7:I7', 'B8:I8', 'B9:I9', 'B10:I10', 'B22:I31'].forEach((m) => ws.mergeCells(m))

  // ----- Bordes: acumulador para fusionar lados por celda -----
  const borders = new Map<string, Side>()
  const add = (col: number, row: number, sides: Side) => {
    const key = `${row}:${col}`
    borders.set(key, { ...borders.get(key), ...sides })
  }
  const hLine = (cFrom: number, cTo: number, row: number, side: 'top' | 'bottom') => {
    for (let c = cFrom; c <= cTo; c++) add(c, row, { [side]: MEDIUM } as Side)
  }
  const vLine = (col: number, rFrom: number, rTo: number, side: 'left' | 'right') => {
    for (let r = rFrom; r <= rTo; r++) add(col, r, { [side]: MEDIUM } as Side)
  }

  // Marco exterior. La fila 1 (título) y su recuadro se aplican como caja sobre
  // la celda combinada A1:J1 más abajo (en celdas combinadas, Excel dibuja el
  // borde de la celda maestra alrededor de todo el rango).
  hLine(1, 10, 32, 'bottom') // cierre inferior del marco
  vLine(1, 2, 32, 'left') // lateral izquierdo (la fila 1 va en la caja de A1)
  vLine(10, 2, 32, 'right') // lateral derecho

  // Caja CUPON (G3:I3) — sin divisiones internas.
  hLine(7, 9, 3, 'top')
  hLine(7, 9, 3, 'bottom')
  add(7, 3, { left: MEDIUM })
  add(9, 3, { right: MEDIUM })

  // Cajas FECHA (G5,H5,I5) — 3 compartimentos.
  hLine(7, 9, 5, 'top')
  hLine(7, 9, 5, 'bottom')
  ;[7, 8, 9].forEach((c) => add(c, 5, { left: MEDIUM }))
  add(9, 5, { right: MEDIUM })

  // Caja OBS (B12:I13).
  hLine(2, 9, 12, 'top')
  hLine(2, 9, 13, 'bottom')
  vLine(2, 12, 13, 'left')
  vLine(9, 12, 13, 'right')

  // Caja izquierda (RECEPCIONO/COD/TEL) B15:D17 con divisores.
  hLine(2, 4, 15, 'top')
  ;[15, 16, 17].forEach((r) => hLine(2, 4, r, 'bottom'))
  vLine(2, 15, 17, 'left')
  vLine(4, 15, 17, 'right')

  // Caja derecha (PRESUPUESTO/SEÑA/PENDIENTE) F15:I17 con divisores.
  hLine(6, 9, 15, 'top')
  ;[15, 16, 17].forEach((r) => hLine(6, 9, r, 'bottom'))
  vLine(6, 15, 17, 'left')
  vLine(9, 15, 17, 'right')

  // Caja DIAGNOSTICO (B19:I20) con divisor entre etiqueta y espacio.
  hLine(2, 9, 19, 'top')
  hLine(2, 9, 19, 'bottom')
  hLine(2, 9, 20, 'bottom')
  vLine(2, 19, 20, 'left')
  vLine(9, 19, 20, 'right')

  // (La caja de GARANTIA B22:I31 es una celda combinada: su borde se aplica
  //  como caja completa sobre la maestra B22, junto con el título, más abajo.)

  borders.forEach((side, key) => {
    const [row, col] = key.split(':').map(Number)
    ws.getCell(row, col).border = side
  })

  // Cajas sobre celdas COMBINADAS: el borde va en la celda maestra como caja
  // completa (Excel lo dibuja alrededor de todo el rango combinado).
  const cajaCompleta: Side = { top: MEDIUM, bottom: MEDIUM, left: MEDIUM, right: MEDIUM }
  ws.getCell('A1').border = cajaCompleta // título + borde superior/lateral del marco en la fila 1
  ws.getCell('B22').border = cajaCompleta // recuadro de garantía

  // ----- Helpers de contenido -----
  const calibri = (size: number, bold = false) => ({ name: 'Calibri', size, bold })
  const put = (
    addr: string,
    value: ExcelJS.CellValue,
    font: Partial<ExcelJS.Font>,
    align?: Partial<ExcelJS.Alignment>,
  ) => {
    const cell = ws.getCell(addr)
    cell.value = value
    cell.font = font
    if (align) cell.alignment = align
  }
  const conValor = (label: string, value: string, blanco: string) => (value.trim() ? `${label} ${value}` : blanco)

  // ----- Título -----
  put('A1', 'RECEPCION DE EQUIPO/S', calibri(14, true), { horizontal: 'center', vertical: 'middle' })

  // ----- Encabezado (textos; el logo va como imagen) -----
  put('C3', '   ' + EMPRESA.nombre, calibri(16, true), { horizontal: 'left', vertical: 'middle' })
  put('C4', EMPRESA.direccion, calibri(8), { horizontal: 'left', vertical: 'middle' })
  put('C5', `   ${EMPRESA.instagram}      ${EMPRESA.facebook}`, calibri(9), { horizontal: 'left', vertical: 'middle' })
  put('F3', LABELS.cupon, calibri(11), { horizontal: 'center', vertical: 'middle' })
  put('F5', LABELS.fecha, calibri(11), { horizontal: 'center', vertical: 'middle' })

  // Valores de cupón y fecha.
  const center = { horizontal: 'center' as const, vertical: 'middle' as const }
  put('G3', datos.cupon, calibri(11), center)
  put('G5', datos.fechaDia, calibri(11), center)
  put('H5', datos.fechaMes, calibri(11), center)
  put('I5', datos.fechaAnio, calibri(11), center)

  // ----- Renglones -----
  const left = { horizontal: 'left' as const, vertical: 'middle' as const }
  put('B7', conValor(LABELS.recibiDe, datos.recibiDe, LINEAS.recibiDe), calibri(11, true), left)
  put('B8', conValor(LABELS.equipos, datos.equipos, LINEAS.equipos), calibri(11, true), left)
  put('B9', conValor(LABELS.falla, datos.falla, LINEAS.falla), calibri(11, true), left)
  put('B10', datos.fallaExtra.trim() || LINEAS.fallaExtra, calibri(11, true), left)

  // ----- OBS -----
  put('B12', LABELS.obs, calibri(11, true), left)
  put('C12', datos.obs, calibri(11), { horizontal: 'left', vertical: 'top', wrapText: true })

  // ----- Cajas info (etiqueta + valor en la misma celda) -----
  put('B15', conValor(LABELS.recepciono, datos.recepciono, LABELS.recepciono), calibri(11, true), left)
  put('B16', conValor(LABELS.codDesbloqueo, datos.codDesbloqueo, LABELS.codDesbloqueo), calibri(11, true), left)
  put('B17', conValor(LABELS.tel, datos.tel, LABELS.tel), calibri(11, true), left)
  put('F15', conValor(LABELS.presupuesto, datos.presupuesto, LABELS.presupuesto), calibri(11, true), left)
  put('F16', conValor(LABELS.sena, datos.sena, LABELS.sena), calibri(11, true), left)
  put('F17', conValor(LABELS.pendiente, datos.pendiente, LABELS.pendiente), calibri(11, true), left)

  // ----- Diagnóstico -----
  put('B19', LABELS.diagnostico, calibri(11, true), left)
  put('B20', datos.diagnostico, calibri(11), { horizontal: 'left', vertical: 'middle', wrapText: true })

  // ----- Garantía (texto enriquecido, tamaño 7) -----
  ws.getCell('B22').value = {
    richText: GARANTIA_RUNS.map((r) => ({ font: { name: 'Calibri', size: 7, bold: !!r.bold }, text: r.t })),
  }
  ws.getCell('B22').alignment = { horizontal: 'justify', vertical: 'top', wrapText: true }

  // ----- Imágenes (logo + redes) -----
  const addImg = (dataUri: string, ext: 'jpeg' | 'png') => wb.addImage({ base64: dataUri.split(',')[1], extension: ext })
  const logoId = addImg(LOGO_CELTUC, 'jpeg')
  ws.addImage(logoId, { tl: { col: 1.03, row: 1.35 }, ext: { width: 66, height: 66 }, editAs: 'oneCell' })
  const igId = addImg(ICON_INSTAGRAM, 'jpeg')
  ws.addImage(igId, { tl: { col: 1.92, row: 4.35 }, ext: { width: 13, height: 13 }, editAs: 'oneCell' })
  const fbId = addImg(ICON_FACEBOOK, 'jpeg')
  ws.addImage(fbId, { tl: { col: 3.0, row: 4.35 }, ext: { width: 13, height: 13 }, editAs: 'oneCell' })

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
