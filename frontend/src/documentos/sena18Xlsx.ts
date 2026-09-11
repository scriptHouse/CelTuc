import { ALIGN, Bordes, MEDIUM, blobDe, cajaCompletaEn, calibri, ctHeaderXlsx, firmasXlsx, nuevaHoja, put, setCols, setRows, STD_COLS } from './kitXlsx'
import {
  SENA18_CAMPOS_COLOR,
  SENA18_LABELS,
  SENA18_LINEAS,
  SENA18_NOTAS,
  SENA18_TITULO,
  type Sena18Data,
} from './sena18Content'

/** Filas 11-13 y 26-29: etiqueta en B:C y valor en D:E. */
const FILAS_IMPORTE = [
  { fila: 11, label: SENA18_LABELS.sena, campo: 'sena' },
  { fila: 12, label: SENA18_LABELS.tipoCambio, campo: 'tipoCambio' },
  { fila: 13, label: SENA18_LABELS.saldo, campo: 'saldo' },
] as const

export async function construirSena18Xlsx(d: Sena18Data, direccion?: string): Promise<Blob> {
  const { wb, ws } = nuevaHoja('SEÑA 18')
  setCols(ws, STD_COLS)
  setRows(ws, [
    15, 15, 15, 15, 5.1, // 1-5: título, encabezado y aire
    15, 15, 15, 15, 15, // 6-10: renglones + aire
    15, 15, 15, 15, // 11-14: SEÑA / TIPO DE CAMBIO / SALDO + aire
    15, 15, 15, // 15-17: nota de la cotización + aire
    15, 15, 15, // 18-20: equipo entregado + precio + aire
    15, 15, 15, 15, 15, // 21-25: nota de los colores + aire
    15, 15, 15, 15, 15, // 26-30: COLOR 1-4 + aire
    15, 15, 15, // 31-33: nota del plazo + aire
    15, 15, 15, 15, 16.5, // 34-38: nota del comprobante
    15, 15, 15, 20.25, // 39-42: aire + firmas
  ])
  ;[
    'A1:J1',
    'B6:I6',
    'B7:I7',
    'B8:I8',
    'B9:I9',
    'B15:I16',
    'B18:D18',
    'H18:I18',
    'B19:D19',
    'H19:I19',
    'B21:I24',
    'B31:I32',
    'B34:I38',
    // Etiqueta (B:C) y valor (D:E) de los importes y de los cuatro colores.
    ...[11, 12, 13, 26, 27, 28, 29].flatMap((r) => [`B${r}:C${r}`, `D${r}:E${r}`]),
  ].forEach((m) => ws.mergeCells(m))

  /* Ojo con los bordes de las celdas combinadas: ExcelJS comparte el estilo de
     todo el rango con su celda maestra, así que escribirle a una celda de
     adentro le pisa el borde a la maestra. Por eso acá los rangos combinados se
     bordean con `cajaCompletaEn` (que apunta a la maestra) y del acumulador
     `Bordes` solo salen las celdas sueltas. */
  const b = new Bordes()
  b.h(1, 10, 42, 'bottom')
  b.v(1, 2, 42, 'left')
  b.v(10, 2, 42, 'right')
  ctHeaderXlsx(wb, ws, b, { cupon: d.cupon, dia: d.fechaDia, mes: d.fechaMes, anio: d.fechaAnio, direccion })
  // Renglón del equipo entregado + precio: una sola caja de B a I, sin
  // divisiones. B19:D19 y H19:I19 van combinadas; E, F y G están sueltas.
  b.add(2, 19, { left: MEDIUM, top: MEDIUM, bottom: MEDIUM })
  ;[5, 6, 7].forEach((c) => b.add(c, 19, { top: MEDIUM, bottom: MEDIUM }))
  b.add(8, 19, { right: MEDIUM, top: MEDIUM, bottom: MEDIUM })
  // La nota de los colores no es una caja: solo lleva la regla de arriba.
  b.add(2, 21, { top: MEDIUM })
  b.apply(ws)
  cajaCompletaEn(ws, 'A1')
  cajaCompletaEn(ws, 'B15') // nota de la cotización (combinada B15:I16)
  cajaCompletaEn(ws, 'B31') // nota del plazo (combinada B31:I32)
  cajaCompletaEn(ws, 'B34') // nota del comprobante (combinada B34:I38)
  // SEÑA / TIPO DE CAMBIO / SALDO y COLOR 1-4: etiqueta y valor, cada uno con
  // su caja (como en el Excel, donde los renglones comparten la línea).
  ;[11, 12, 13, 26, 27, 28, 29].forEach((r) => {
    cajaCompletaEn(ws, `B${r}`)
    cajaCompletaEn(ws, `D${r}`)
  })

  const bold10 = calibri(10, true)
  const s11 = calibri(11)
  const nota = calibri(10)
  const con = (label: string, v: string, blanco: string) => (v.trim() ? `${label} ${v}` : blanco)

  put(ws, 'A1', SENA18_TITULO, bold10, ALIGN.center)
  put(
    ws,
    'B6',
    d.recibiDe.trim() || d.dni.trim()
      ? `${SENA18_LABELS.recibiDe} ${d.recibiDe}          ${SENA18_LABELS.dni} ${d.dni}`
      : SENA18_LINEAS.recibiDe,
    bold10,
    ALIGN.left,
  )
  put(ws, 'B7', con(SENA18_LABELS.laSuma, d.laSuma, SENA18_LINEAS.laSuma), bold10, ALIGN.left)
  put(ws, 'B8', con(SENA18_LABELS.concepto, d.concepto, SENA18_LINEAS.concepto), bold10, ALIGN.left)
  put(ws, 'B9', d.conceptoExtra.trim() || SENA18_LINEAS.cont, bold10, ALIGN.left)

  FILAS_IMPORTE.forEach(({ fila, label, campo }) => {
    put(ws, `B${fila}`, label, s11, ALIGN.center)
    put(ws, `D${fila}`, d[campo], s11, ALIGN.center)
  })

  put(ws, 'B15', SENA18_NOTAS.cotizacion, nota, ALIGN.leftTop)

  put(ws, 'B18', SENA18_LABELS.entrega, calibri(11, true), ALIGN.center)
  put(ws, 'H18', SENA18_LABELS.precio, calibri(11, true), ALIGN.center)
  put(ws, 'B19', d.entrega, s11, ALIGN.center)
  put(ws, 'H19', d.entregaPrecio, s11, ALIGN.center)

  put(ws, 'B21', SENA18_NOTAS.colores, nota, ALIGN.leftTop)

  SENA18_CAMPOS_COLOR.forEach(({ campo, label }, i) => {
    const fila = 26 + i
    put(ws, `B${fila}`, label, s11, ALIGN.center)
    put(ws, `D${fila}`, d[campo], s11, ALIGN.center)
  })

  put(ws, 'B31', SENA18_NOTAS.plazo, nota, ALIGN.leftTop)
  put(ws, 'B34', SENA18_NOTAS.comprobante, nota, ALIGN.leftTop)

  firmasXlsx(ws, 41)

  return blobDe(wb)
}
