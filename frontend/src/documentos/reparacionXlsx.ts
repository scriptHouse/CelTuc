import { ALIGN, Bordes, blobDe, cajaCompletaEn, calibri, ctHeaderXlsx, firmasXlsx, nuevaHoja, put, richGarantia, setCols, setRows, STD_COLS } from './kitXlsx'
import { REP_GARANTIA, REP_LABELS, REP_LINEAS, REP_TITULO, type ReparacionData } from './reparacionContent'

export async function construirReparacionXlsx(d: ReparacionData, direccion?: string): Promise<Blob> {
  const { wb, ws } = nuevaHoja('REPARACION')
  setCols(ws, STD_COLS)
  setRows(ws, [
    15, 15, 15, 15, 5.1, // 1-5
    15, 15, 15, 5.1, 5.1, // 6-10
    15, 15, 15, 5.1, 21, // 11-15
    39, // 16
    ...Array(29).fill(15), // 17-45
    15.8, 15, 25.5, 20.2, // 46-49
  ])
  ;['A1:J1', 'B6:I6', 'B7:I7', 'B8:I8', 'B15:I46'].forEach((m) => ws.mergeCells(m))

  const b = new Bordes()
  b.h(1, 10, 49, 'bottom')
  b.v(1, 2, 49, 'left')
  b.v(10, 2, 49, 'right')
  ctHeaderXlsx(wb, ws, b, { cupon: d.cupon, dia: d.fechaDia, mes: d.fechaMes, anio: d.fechaAnio, direccion })
  b.caja(2, 11, 4, 13, [11, 12]) // CEL / MAIL / IMEI
  b.caja(6, 11, 9, 13, [11, 12]) // PRESUPUESTO / SEÑA / PENDIENTE
  b.apply(ws)
  cajaCompletaEn(ws, 'A1')
  cajaCompletaEn(ws, 'B15') // condiciones (combinada)

  const bold10 = calibri(10, true)
  const con = (label: string, v: string, blanco: string) => (v.trim() ? `${label} ${v}` : blanco)

  put(ws, 'A1', REP_TITULO, calibri(10, true), ALIGN.center)
  put(ws, 'B6', con(REP_LABELS.recibiDe, d.recibiDe, REP_LINEAS.recibiDe), bold10, ALIGN.left)
  put(ws, 'B7', con(REP_LABELS.equipos, d.equipos, REP_LINEAS.equipos), bold10, ALIGN.left)
  put(ws, 'B8', con(REP_LABELS.falla, d.falla, REP_LINEAS.falla), bold10, ALIGN.left)

  put(ws, 'B11', con(REP_LABELS.cel, d.cel, REP_LABELS.cel), bold10, ALIGN.left)
  put(ws, 'B12', con(REP_LABELS.mail, d.mail, REP_LABELS.mail), bold10, ALIGN.left)
  put(ws, 'B13', con(REP_LABELS.imei, d.imei, REP_LABELS.imei), bold10, ALIGN.left)
  put(ws, 'F11', con(REP_LABELS.presupuesto, d.presupuesto, REP_LABELS.presupuesto), bold10, ALIGN.left)
  put(ws, 'F12', con(REP_LABELS.sena, d.sena, REP_LABELS.sena), bold10, ALIGN.left)
  put(ws, 'F13', con(REP_LABELS.pendiente, d.pendiente, REP_LABELS.pendiente), bold10, ALIGN.left)

  ws.getCell('B15').value = richGarantia(REP_GARANTIA, 7)
  ws.getCell('B15').alignment = { horizontal: 'left', vertical: 'top', wrapText: true }

  firmasXlsx(ws, 48)

  return blobDe(wb)
}
