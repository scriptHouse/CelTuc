import { ALIGN, Bordes, blobDe, cajaCompletaEn, calibri, ctHeaderXlsx, firmasXlsx, nuevaHoja, put, richGarantia, setCols, setRows, STD_COLS } from './kitXlsx'
import { COMPRA_GARANTIA, COMPRA_LABELS, COMPRA_LINEAS, COMPRA_TITULO, type CompraData } from './compraContent'

export async function construirCompraXlsx(d: CompraData, direccion?: string): Promise<Blob> {
  const { wb, ws } = nuevaHoja('COMPRA')
  setCols(ws, STD_COLS)
  setRows(ws, [
    15, 15, 15, 15, 5.1, // 1-5
    15, 15, 22.5, 15, 15.8, // 6-10
    15, 15, 15, 15.8, 15.8, // 11-15
    ...Array(29).fill(15), // 16-44
    15.8, 15, 25.5, 20.2, // 45-48
  ])
  ;['A1:J1', 'B6:I6', 'B7:I7', 'B8:I8', 'B9:I9', 'F11:I11', 'F12:I14', 'B16:I45'].forEach((m) => ws.mergeCells(m))

  const b = new Bordes()
  b.h(1, 10, 48, 'bottom')
  b.v(1, 2, 48, 'left')
  b.v(10, 2, 48, 'right')
  ctHeaderXlsx(wb, ws, b, { cupon: d.cupon, dia: d.fechaDia, mes: d.fechaMes, anio: d.fechaAnio, direccion })
  b.caja(2, 11, 4, 14, [11, 12, 13]) // CEL / MAIL / CONDICION / IMEI
  b.apply(ws)
  cajaCompletaEn(ws, 'A1')
  cajaCompletaEn(ws, 'F11') // etiqueta TOTAL (combinada)
  cajaCompletaEn(ws, 'F12') // importe TOTAL (combinada F12:I14)
  cajaCompletaEn(ws, 'B16') // garantía (combinada)

  const bold10 = calibri(10, true)
  const con = (label: string, v: string, blanco: string) => (v.trim() ? `${label} ${v}` : blanco)

  put(ws, 'A1', COMPRA_TITULO, calibri(10, true), ALIGN.center)
  put(
    ws,
    'B6',
    d.recibiDe.trim() || d.dni.trim() ? `RECIBI DE ${d.recibiDe}          DNI ${d.dni}` : COMPRA_LINEAS.recibiDe,
    bold10,
    ALIGN.left,
  )
  put(ws, 'B7', con('LA SUMA DE ', d.laSuma, COMPRA_LINEAS.laSuma), bold10, ALIGN.left)
  put(ws, 'B8', con(COMPRA_LABELS.concepto, d.concepto, COMPRA_LINEAS.concepto), bold10, ALIGN.left)
  put(ws, 'B9', d.conceptoExtra.trim() || COMPRA_LINEAS.cont, bold10, ALIGN.left)

  put(ws, 'B11', con(COMPRA_LABELS.cel, d.cel, COMPRA_LABELS.cel), bold10, ALIGN.left)
  put(ws, 'B12', con(COMPRA_LABELS.mail, d.mail, COMPRA_LABELS.mail), bold10, ALIGN.left)
  put(ws, 'B13', con(COMPRA_LABELS.condicion, d.condicion, COMPRA_LABELS.condicion), bold10, ALIGN.left)
  put(ws, 'B14', con(COMPRA_LABELS.imei, d.imei, COMPRA_LABELS.imei), bold10, ALIGN.left)
  put(ws, 'F11', COMPRA_LABELS.total, calibri(11, true), ALIGN.center)
  put(ws, 'F12', d.total, calibri(16, true), ALIGN.center)

  ws.getCell('B16').value = richGarantia(COMPRA_GARANTIA, 7)
  ws.getCell('B16').alignment = { horizontal: 'left', vertical: 'top', wrapText: true }

  firmasXlsx(ws, 47)

  return blobDe(wb)
}
