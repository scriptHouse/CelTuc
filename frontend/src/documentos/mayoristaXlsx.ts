import { ALIGN, Bordes, blobDe, cajaCompletaEn, calibri, ctHeaderXlsx, firmasXlsx, nuevaHoja, put, richGarantia, setCols, setRows, STD_COLS } from './kitXlsx'
import { MAY_GARANTIA, MAY_LABELS, MAY_LINEAS, MAY_TITULO, type MayoristaData } from './mayoristaContent'

export async function construirMayoristaXlsx(d: MayoristaData): Promise<Blob> {
  const { wb, ws } = nuevaHoja('COMPRA MAYORISTA')
  setCols(ws, STD_COLS)
  setRows(ws, [
    15, 15, 15, 15, 5.1, // 1-5
    15, 15, 22.5, 15.8, 15.8, // 6-10
    15, 15, 15, 15.8, 15.8, // 11-15
    ...Array(29).fill(15), // 16-44
    15.8, 15, 25.5, 20.2, // 45-48
  ])
  ;['A1:J1', 'B6:I6', 'B7:I7', 'B8:I8', 'F13:I13', 'F14:I14', 'B16:I44'].forEach((m) => ws.mergeCells(m))

  const b = new Bordes()
  b.h(1, 10, 48, 'bottom')
  b.v(1, 2, 48, 'left')
  b.v(10, 2, 48, 'right')
  ctHeaderXlsx(wb, ws, b, { cupon: d.cupon, dia: d.fechaDia, mes: d.fechaMes, anio: d.fechaAnio })
  b.caja(2, 9, 4, 14, [9, 10, 11, 12, 13]) // 6 IMEI a la izquierda
  b.caja(6, 9, 9, 12, [9, 10, 11]) // 4 IMEI a la derecha
  b.apply(ws)
  cajaCompletaEn(ws, 'A1')
  cajaCompletaEn(ws, 'F13') // etiqueta TOTAL (combinada)
  cajaCompletaEn(ws, 'F14') // importe TOTAL (combinada)
  cajaCompletaEn(ws, 'B16') // garantía (combinada)

  const bold10 = calibri(10, true)

  put(ws, 'A1', MAY_TITULO, calibri(10, true), ALIGN.center)
  put(
    ws,
    'B6',
    d.recibiDe.trim() || d.dni.trim() ? `RECIBI DE ${d.recibiDe}          DNI ${d.dni}` : MAY_LINEAS.recibiDe,
    bold10,
    ALIGN.left,
  )
  put(
    ws,
    'B7',
    d.celular.trim() || d.laSuma.trim() ? `CELULAR ${d.celular}     LA SUMA DE ${d.laSuma}` : MAY_LINEAS.celSuma,
    bold10,
    ALIGN.left,
  )
  put(ws, 'B8', d.concepto.trim() ? `${MAY_LABELS.concepto} ${d.concepto}` : MAY_LINEAS.concepto, bold10, ALIGN.left)

  // 6 IMEI izquierda (filas 9-14) y 4 IMEI derecha (filas 9-12)
  for (let i = 0; i < 6; i++) {
    const v = d.imeis[i] ?? ''
    put(ws, `B${9 + i}`, v.trim() ? `IMEI: ${v}` : 'IMEI:', bold10, ALIGN.left)
  }
  for (let i = 0; i < 4; i++) {
    const v = d.imeis[6 + i] ?? ''
    put(ws, `F${9 + i}`, v.trim() ? `IMEI: ${v}` : 'IMEI:', bold10, ALIGN.left)
  }
  put(ws, 'F13', MAY_LABELS.total, calibri(11, true), ALIGN.center)
  put(ws, 'F14', d.total, calibri(12, true), ALIGN.center)

  ws.getCell('B16').value = richGarantia(MAY_GARANTIA, 7)
  ws.getCell('B16').alignment = { horizontal: 'left', vertical: 'top', wrapText: true }

  firmasXlsx(ws, 47)

  return blobDe(wb)
}
