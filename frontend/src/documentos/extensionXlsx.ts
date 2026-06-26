import { ALIGN, Bordes, blobDe, cajaCompletaEn, calibri, ctHeaderXlsx, MEDIUM, nuevaHoja, put, richGarantia, setCols, setRows } from './kitXlsx'
import { EXT_GARANTIA, EXT_TITULO, type ExtensionData } from './extensionContent'

const LINEAS = {
  nombre: 'NOMBRE ___________________________________________________________________________',
  dni: 'DNI ________________________________N° TEL________________________________________________',
  concepto: 'COCEPTO DE COMPRA DEL EQUIPO____________________________',
  c1: '___________________________________________________________________________________________',
}

export async function construirExtensionXlsx(d: ExtensionData): Promise<Blob> {
  const { wb, ws } = nuevaHoja('Extencion Garantia')
  setCols(ws, [0.86, 10.71, 7.71, 13, 4.71, 10.71, 3.71, 13, 13, 0.86])
  setRows(ws, [
    20.1, 9.9, 15, 9.9, 15, 9.9,
    13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5,
    15, 15, 15, 15, 15, 15, 15, 15, 13.2, 14.4, 9, 7.2,
  ])
  ;['A1:J1', 'B7:I7', 'B8:I8', 'B9:I9', 'B10:I10', 'B11:I11', 'B12:I12', 'B18:I32', 'E14:F14', 'E15:F15', 'E16:F16'].forEach((m) =>
    ws.mergeCells(m),
  )

  const b = new Bordes()
  b.h(1, 10, 33, 'bottom')
  b.v(1, 2, 33, 'left')
  b.v(10, 2, 33, 'right')
  ctHeaderXlsx(wb, ws, b, { cupon: d.cupon, dia: d.fechaDia, mes: d.fechaMes, anio: d.fechaAnio })
  b.caja(2, 14, 4, 16, [14, 15])
  b.add(5, 14, { left: MEDIUM })
  b.add(5, 15, { left: MEDIUM })
  b.add(5, 16, { left: MEDIUM, right: MEDIUM })
  b.add(6, 16, { right: MEDIUM })
  b.caja(7, 14, 9, 16)
  b.apply(ws)
  cajaCompletaEn(ws, 'A1')
  cajaCompletaEn(ws, 'B18')

  const bold = calibri(11, true)
  const con = (label: string, v: string, blanco: string) => (v.trim() ? `${label} ${v}` : blanco)

  put(ws, 'A1', EXT_TITULO, calibri(14, true), ALIGN.center)
  put(ws, 'B7', con('NOMBRE', d.nombre, LINEAS.nombre), bold, ALIGN.left)
  put(ws, 'B8', d.dni.trim() || d.tel.trim() ? `DNI ${d.dni}          N° TEL ${d.tel}` : LINEAS.dni, bold, ALIGN.left)
  put(ws, 'B9', `SE EXTIENDE LA GARANTIA POR UN PLAZO DE ${d.dias.trim() || '______'} DIAS EN`, bold, ALIGN.left)
  put(ws, 'B10', con('COCEPTO DE COMPRA DEL EQUIPO', d.concepto, LINEAS.concepto), bold, ALIGN.left)
  put(ws, 'B11', d.conceptoExtra.trim() || LINEAS.c1, bold, ALIGN.left)

  put(ws, 'H13', 'TOTAL $', calibri(11, true), ALIGN.center)
  put(ws, 'H15', d.total, calibri(14, true), ALIGN.center)
  put(ws, 'B14', con('IMEI:', d.imei, 'IMEI:'), bold, ALIGN.left)
  put(ws, 'B15', con('VENDEDOR:', d.vendedor, 'VENDEDOR:'), bold, ALIGN.left)
  put(ws, 'B16', con('FORMA DE PAGO', d.formaPago, 'FORMA DE PAGO'), bold, ALIGN.left)
  put(ws, 'E15', '…………………………….', calibri(9), ALIGN.center)
  put(ws, 'E16', 'Firma', calibri(11, true), ALIGN.center)

  ws.getCell('B18').value = richGarantia(EXT_GARANTIA, 8)
  ws.getCell('B18').alignment = ALIGN.justify

  return blobDe(wb)
}
