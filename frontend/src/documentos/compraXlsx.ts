import { ALIGN, Bordes, blobDe, cajaCompletaEn, calibri, ctHeaderXlsx, MEDIUM, nuevaHoja, put, richGarantia, setCols, setRows } from './kitXlsx'
import { COMPRA_GARANTIA, COMPRA_TITULO, type CompraData } from './compraContent'

const LINEAS = {
  recibiDe: 'RECIBI DE ___________________________________________________________________________',
  dni: 'DNI ________________________________N° TEL________________________________________________',
  laSuma: 'LA SUMA DE _________________________________________________________________________________',
  concepto: 'EN CONCEPTO DE LA COMPRA DE EQUIPO/S____________________________________________________',
  c1: '___________________________________________________________________________________________',
  c2: '____________________________________________________________________________________',
}

export async function construirCompraXlsx(d: CompraData): Promise<Blob> {
  const { wb, ws } = nuevaHoja('Compra')
  setCols(ws, [0.86, 10.71, 7.71, 13, 4.71, 10.71, 3.71, 13, 13, 0.86])
  setRows(ws, [
    20.1, 9.9, 15, 9.9, 15, 9.9,
    13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5,
    15, 15, 15, 15, 15, 15, 15, 15, 13.2, 15, 9, 7.2,
  ])
  ;['A1:J1', 'B7:I7', 'B8:I8', 'B9:I9', 'B10:I10', 'B11:I11', 'B12:I12', 'E15:F15', 'E16:F16', 'E17:F17', 'B22:I32'].forEach((m) =>
    ws.mergeCells(m),
  )

  const b = new Bordes()
  // Marco
  b.h(1, 10, 33, 'bottom')
  b.v(1, 2, 33, 'left')
  b.v(10, 2, 33, 'right')
  // Encabezado (cupón/fecha) + textos + imágenes
  ctHeaderXlsx(wb, ws, b, { cupon: d.cupon, dia: d.fechaDia, mes: d.fechaMes, anio: d.fechaAnio })
  // Caja izquierda (CONDICION/IMEI/GARANTIA/FORMA)
  b.caja(2, 14, 4, 17, [14, 15, 16])
  // Firma (E15:F17): borde izquierdo + cierre inferior
  b.add(5, 15, { left: MEDIUM })
  b.add(5, 16, { left: MEDIUM })
  b.add(5, 17, { left: MEDIUM, right: MEDIUM })
  b.add(6, 17, { right: MEDIUM })
  // Caja TOTAL (G15:I17)
  b.caja(7, 15, 9, 17)
  // Caja OBS (B19:I20)
  b.caja(2, 19, 9, 20, [19])
  b.apply(ws)
  cajaCompletaEn(ws, 'A1')
  cajaCompletaEn(ws, 'B22')

  const bold = (_s?: string) => calibri(11, true)
  const con = (label: string, v: string, blanco: string) => (v.trim() ? `${label} ${v}` : blanco)

  put(ws, 'A1', COMPRA_TITULO, calibri(14, true), ALIGN.center)
  put(ws, 'B7', con('RECIBI DE', d.recibiDe, LINEAS.recibiDe), bold('B7'), ALIGN.left)
  put(ws, 'B8', d.dni.trim() || d.tel.trim() ? `DNI ${d.dni}          N° TEL ${d.tel}` : LINEAS.dni, bold('B8'), ALIGN.left)
  put(ws, 'B9', con('LA SUMA DE', d.laSuma, LINEAS.laSuma), bold('B9'), ALIGN.left)
  put(ws, 'B10', con('EN CONCEPTO DE LA COMPRA DE EQUIPO/S', d.concepto, LINEAS.concepto), bold('B10'), ALIGN.left)
  put(ws, 'B11', d.conceptoExtra.trim() || LINEAS.c1, bold('B11'), ALIGN.left)
  put(ws, 'B12', d.conceptoExtra2.trim() || LINEAS.c2, bold('B12'), ALIGN.left)

  put(ws, 'B14', con('CONDICION:', d.condicion, 'CONDICION:'), bold('B14'), ALIGN.left)
  put(ws, 'B15', con('IMEI:', d.imei, 'IMEI:'), bold('B15'), ALIGN.left)
  put(ws, 'B16', con('GARANTIA:', d.garantia, 'GARANTIA:'), bold('B16'), ALIGN.left)
  put(ws, 'B17', con('FORMA DE PAGO', d.formaPago, 'FORMA DE PAGO'), bold('B17'), ALIGN.left)
  put(ws, 'H14', 'TOTAL $', calibri(11, true), ALIGN.center)
  put(ws, 'H16', d.total, calibri(14, true), ALIGN.center)
  put(ws, 'E16', '…………………………….', calibri(9), ALIGN.center)
  put(ws, 'E17', 'Firma', calibri(11, true), ALIGN.center)

  put(ws, 'B19', 'OBS:', calibri(11, true), ALIGN.left)
  put(ws, 'B20', d.obs, calibri(11), ALIGN.leftTop)

  ws.getCell('B22').value = richGarantia(COMPRA_GARANTIA, 6)
  ws.getCell('B22').alignment = ALIGN.justify

  return blobDe(wb)
}
