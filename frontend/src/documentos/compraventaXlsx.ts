import ExcelJS from 'exceljs'
import { ALIGN, Bordes, blobDe, cajaCompletaEn, calibri, ctHeaderXlsx, nuevaHoja, put, setCols, setRows } from './kitXlsx'
import { CV_CUARTA, CV_INTRO, CV_PRIMERA, CV_QUINTA, CV_SEGUNDA, CV_TERCERA, CV_TITULO, type Clausula, type CompraventaData } from './compraventaContent'

const LINEAS: Record<string, string> = {
  marca: 'MARCA:__________________________________________________________________',
  modelo: 'MODELO:_________________________________________________________________',
  color: 'COLOR:____________________________________________________________________',
  imei1: 'IMEI 1:___________________________________________________________________',
  imei2: 'IMEI 2:___________________________________________________________________',
  obs: 'OBS:______________________________________________________________________',
  cont: '__________________________________________________________________________',
}

function clausulaRich(c: Clausula, d: CompraventaData): ExcelJS.CellValue {
  const cuerpo = c.segs.map((s) => ('t' in s ? s.t : d[s.f] || '______')).join('')
  const runs = []
  if (c.prefix) runs.push({ font: { name: 'Calibri', size: 11, bold: true }, text: c.prefix })
  runs.push({ font: { name: 'Calibri', size: 11 }, text: cuerpo })
  return { richText: runs }
}

export async function construirCompraventaXlsx(d: CompraventaData): Promise<Blob> {
  const { wb, ws } = nuevaHoja('COMPRAVENTA')
  setCols(ws, [2.71, 10.71, 10.71, 13, 13, 13, 6.71, 13, 13, 2.71])
  setRows(ws, [
    20.1, 9.9, 15, 9.9, 15, 9.9, 13.5, 13.5, 6, 13.5, 13.5, 7.9, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 7.9,
    13.5, 13.5, 13.5, 7.9, 15, 15, 15, 7.9, 15, 15, 15, 15, 14.4, 14.4, 14.4, 14.4, 14.4, 15, 15, 15, 15, 15, 15, 15.8,
  ])
  ;['A1:J1', 'B7:I8', 'B10:I11', 'B21:I23', 'B25:I27', 'B29:I34', 'B36:I38'].forEach((m) => ws.mergeCells(m))

  const b = new Bordes()
  b.h(1, 10, 44, 'bottom')
  b.v(1, 2, 44, 'left')
  b.v(10, 2, 44, 'right')
  ctHeaderXlsx(wb, ws, b, { socials: 'simple', cupon: d.cupon, dia: d.fechaDia, mes: d.fechaMes, anio: d.fechaAnio })
  b.apply(ws)
  cajaCompletaEn(ws, 'A1')

  const s11 = calibri(11)
  const bold = calibri(11, true)
  const con = (label: string, v: string, blanco: string) => (v.trim() ? `${label} ${v}` : blanco)

  put(ws, 'A1', CV_TITULO, calibri(14, true), ALIGN.center)
  put(ws, 'B7', CV_INTRO, s11, ALIGN.justify)
  ws.getCell('B10').value = clausulaRich(CV_PRIMERA, d)
  ws.getCell('B10').alignment = ALIGN.justify

  put(ws, 'B13', con('MARCA:', d.marca, LINEAS.marca), bold, ALIGN.left)
  put(ws, 'B14', con('MODELO:', d.modelo, LINEAS.modelo), bold, ALIGN.left)
  put(ws, 'B15', con('COLOR:', d.color, LINEAS.color), bold, ALIGN.left)
  put(ws, 'B16', con('IMEI 1:', d.imei1, LINEAS.imei1), bold, ALIGN.left)
  put(ws, 'B17', con('IMEI 2:', d.imei2, LINEAS.imei2), bold, ALIGN.left)
  put(ws, 'B18', con('OBS:', d.obs, LINEAS.obs), bold, ALIGN.left)
  if (!d.obs.trim()) put(ws, 'B19', LINEAS.cont, bold, ALIGN.left)

  for (const [addr, cl] of [
    ['B21', CV_SEGUNDA],
    ['B25', CV_TERCERA],
    ['B29', CV_CUARTA],
    ['B36', CV_QUINTA],
  ] as const) {
    ws.getCell(addr).value = clausulaRich(cl, d)
    ws.getCell(addr).alignment = ALIGN.justify
  }

  put(ws, 'C42', '__________________', s11, ALIGN.center)
  put(ws, 'F42', '__________________', s11, ALIGN.center)
  put(ws, 'C43', 'VENDEDOR', bold, ALIGN.center)
  put(ws, 'F43', 'COMPRADOR', bold, ALIGN.center)

  return blobDe(wb)
}
