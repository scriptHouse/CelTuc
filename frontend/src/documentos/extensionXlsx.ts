import { ALIGN, Bordes, blobDe, cajaCompletaEn, calibri, ctHeaderXlsx, firmasXlsx, nuevaHoja, put, richGarantia, setCols, setRows, STD_COLS } from './kitXlsx'
import { EXT_GARANTIA, EXT_LABELS, EXT_LINEAS, EXT_TITULO, type ExtensionData } from './extensionContent'

export async function construirExtensionXlsx(d: ExtensionData, direccion?: string): Promise<Blob> {
  const { wb, ws } = nuevaHoja('EXTENCION GARANTIA')
  setCols(ws, STD_COLS)
  setRows(ws, [
    15, 15, 15, 15, 5.1, // 1-5
    15, 15, 22.5, 15, 15.8, // 6-10
    15, 15, 15, 15.8, 15, // 11-15
    ...Array(26).fill(15), // 16-41
    15, 15, 15, // 42-44
    15.8, 15.8, // 45-46
  ])
  ;['A1:J1', 'B6:I6', 'B7:I7', 'B8:I8', 'B9:I9', 'F11:I11', 'F12:I14', 'B16:I41'].forEach((m) => ws.mergeCells(m))

  const b = new Bordes()
  b.h(1, 10, 46, 'bottom')
  b.v(1, 2, 46, 'left')
  b.v(10, 2, 46, 'right')
  ctHeaderXlsx(wb, ws, b, { cupon: d.cupon, dia: d.fechaDia, mes: d.fechaMes, anio: d.fechaAnio, direccion })
  b.caja(2, 11, 4, 14, [11, 12, 13])
  b.apply(ws)
  cajaCompletaEn(ws, 'A1')
  cajaCompletaEn(ws, 'F11')
  cajaCompletaEn(ws, 'F12')
  cajaCompletaEn(ws, 'B16')

  const bold10 = calibri(10, true)
  const con = (label: string, v: string, blanco: string) => (v.trim() ? `${label} ${v}` : blanco)

  put(ws, 'A1', EXT_TITULO, calibri(10, true), ALIGN.center)
  put(
    ws,
    'B6',
    d.recibiDe.trim() || d.dni.trim() ? `RECIBI DE ${d.recibiDe}          DNI ${d.dni}` : EXT_LINEAS.recibiDe,
    bold10,
    ALIGN.left,
  )
  put(ws, 'B7', con('LA SUMA DE ', d.laSuma, EXT_LINEAS.laSuma), bold10, ALIGN.left)
  put(ws, 'B8', con(EXT_LABELS.concepto, d.concepto, EXT_LINEAS.concepto), bold10, ALIGN.left)
  put(
    ws,
    'B9',
    `${d.conceptoExtra.trim() || '___________________________________'}POR Nº${d.meses.trim() || '________'}MESES A PARTIR DE LA FECHA QUE SE MUESTA EN ESTE RECIBO.`,
    bold10,
    ALIGN.left,
  )

  put(ws, 'B11', con(EXT_LABELS.cel, d.cel, EXT_LABELS.cel), bold10, ALIGN.left)
  put(ws, 'B12', con(EXT_LABELS.mail, d.mail, EXT_LABELS.mail), bold10, ALIGN.left)
  put(ws, 'B13', con(EXT_LABELS.condicion, d.condicion, EXT_LABELS.condicion), bold10, ALIGN.left)
  put(ws, 'B14', con(EXT_LABELS.imei, d.imei, EXT_LABELS.imei), bold10, ALIGN.left)
  put(ws, 'F11', EXT_LABELS.total, calibri(11, true), ALIGN.center)
  put(ws, 'F12', d.total, calibri(16, true), ALIGN.center)

  ws.getCell('B16').value = richGarantia(EXT_GARANTIA, 7)
  ws.getCell('B16').alignment = { horizontal: 'left', vertical: 'top', wrapText: true }

  firmasXlsx(ws, 45)

  return blobDe(wb)
}
