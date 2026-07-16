import { ALIGN, Bordes, blobDe, calibri, nuevaHoja, put, setCols, setRows } from './kitXlsx'
import { LOGO_CELTUC } from './assets'
import { SENA, type SenaData } from './senaContent'

const LINEAS = {
  recibiDe: 'RECIBI DE:_____________________________TEL:_______________________________',
  laSuma: 'LA SUMA DE:___________________________________________________________',
  concepto: 'EN CONCEPTO DE:_____________________________',
  conceptoC: '_________________________________________________________',
  valorTotal: 'VALOR TOTAL:______________________',
}

export async function construirSenaXlsx(d: SenaData): Promise<Blob> {
  const { wb, ws } = nuevaHoja('Seña')
  setCols(ws, [2.29, 11.57, 13, 9.86, 16.29, 14.43, 1.57])
  setRows(ws, [13.5, 15, 13.5, 14.4, 15, 15, 15, 9, 15, 21.6, 15, 10.9])
  ws.mergeCells('E4:F4')
  ws.mergeCells('B10:D11')
  ws.mergeCells('C2:D2')

  const b = new Bordes()
  b.h(1, 7, 1, 'top')
  b.h(1, 7, 12, 'bottom')
  b.v(1, 1, 12, 'left')
  b.v(7, 1, 12, 'right')
  b.caja(5, 1, 5, 2) // N° RECIBO (etiqueta + valor)
  b.caja(6, 1, 6, 2) // FECHA (etiqueta + valor)
  b.caja(6, 9, 6, 10) // TOTAL
  b.apply(ws)

  const s10 = calibri(10)
  const con = (label: string, v: string, blanco: string) => (v.trim() ? `${label}${v}` : blanco)

  put(ws, 'E1', SENA.numeroRecibo, calibri(10, true), ALIGN.center)
  put(ws, 'E2', d.numeroRecibo, s10, ALIGN.center)
  put(ws, 'F1', SENA.fecha, calibri(10, true), ALIGN.center)
  put(ws, 'F2', d.fecha, s10, ALIGN.center)
  put(ws, 'C3', SENA.direccion, calibri(8), ALIGN.left)
  put(ws, 'E4', SENA.noFactura, calibri(8), ALIGN.center)

  put(ws, 'B5', d.recibiDe.trim() || d.tel.trim() ? `RECIBI DE:${d.recibiDe}          TEL:${d.tel}` : LINEAS.recibiDe, s10, ALIGN.left)
  put(ws, 'B6', con('LA SUMA DE:', d.laSuma, LINEAS.laSuma), s10, ALIGN.left)
  put(ws, 'B7', con('EN CONCEPTO DE:', d.concepto, LINEAS.concepto), s10, ALIGN.left)
  if (!d.concepto.trim()) put(ws, 'C7', LINEAS.conceptoC, s10, ALIGN.left)
  put(ws, 'B9', con('VALOR TOTAL:', d.valorTotal, LINEAS.valorTotal), s10, ALIGN.left)

  put(ws, 'F9', SENA.total, calibri(10, true), ALIGN.center)
  put(ws, 'F10', d.total, calibri(11, true), ALIGN.center)

  put(ws, 'B10', SENA.disclaimer, calibri(8, true), { horizontal: 'left', vertical: 'top', wrapText: true })
  put(ws, 'E11', SENA.lineaFirma, s10, ALIGN.center)
  put(ws, 'E12', SENA.firma, calibri(8), ALIGN.center)

  const logoId = wb.addImage({ base64: LOGO_CELTUC.split(',')[1], extension: 'jpeg' })
  ws.addImage(logoId, { tl: { col: 0.7, row: 0.15 }, ext: { width: 52, height: 52 }, editAs: 'oneCell' })

  return blobDe(wb)
}
