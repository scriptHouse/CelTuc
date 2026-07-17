import { ALIGN, Bordes, blobDe, cajaCompletaEn, calibri, nuevaHoja, put, richGarantia, setCols, setRows } from './kitXlsx'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA } from './content'
import { GACC_RUNS, GACC_TITULO, type GAccData } from './garantiaAccContent'

export async function construirGarantiaAccXlsx(_d: GAccData, direccion: string = EMPRESA.direccion): Promise<Blob> {
  const { wb, ws } = nuevaHoja('Garantia Accesorios')
  setCols(ws, [2.5, 11, 9, 11, 11, 11, 2.5])
  setRows(ws, [20.1, 9.9, 15, 15, 9.9, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 9])

  ws.mergeCells('A1:G1')
  ws.mergeCells('B6:F18')

  const b = new Bordes()
  // Marco
  b.h(1, 7, 18, 'bottom')
  b.v(1, 2, 18, 'left')
  b.v(7, 2, 18, 'right')
  b.apply(ws)
  cajaCompletaEn(ws, 'A1')

  put(ws, 'A1', GACC_TITULO, calibri(14, true), ALIGN.center)
  put(ws, 'C3', '   ' + EMPRESA.nombre, calibri(16, true), ALIGN.left)
  put(ws, 'C4', direccion, calibri(8), ALIGN.left)
  put(ws, 'C5', `   ${EMPRESA.instagram}      ${EMPRESA.facebook}`, calibri(9), ALIGN.left)
  ws.getCell('B6').value = richGarantia(GACC_RUNS, 8)
  ws.getCell('B6').alignment = ALIGN.justify

  // Logo + redes
  const logoId = wb.addImage({ base64: LOGO_CELTUC.split(',')[1], extension: 'jpeg' })
  ws.addImage(logoId, { tl: { col: 1.05, row: 1.7 }, ext: { width: 60, height: 60 }, editAs: 'oneCell' })
  const igId = wb.addImage({ base64: ICON_INSTAGRAM.split(',')[1], extension: 'jpeg' })
  ws.addImage(igId, { tl: { col: 2.1, row: 4.2 }, ext: { width: 12, height: 12 }, editAs: 'oneCell' })
  const fbId = wb.addImage({ base64: ICON_FACEBOOK.split(',')[1], extension: 'jpeg' })
  ws.addImage(fbId, { tl: { col: 3.1, row: 4.2 }, ext: { width: 12, height: 12 }, editAs: 'oneCell' })

  return blobDe(wb)
}
