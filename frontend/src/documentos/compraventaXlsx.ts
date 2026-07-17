import ExcelJS from 'exceljs'
import { ALIGN, Bordes, blobDe, cajaCompletaEn, calibri, ctHeaderXlsx, nuevaHoja, put, setCols, setRows, STD_COLS } from './kitXlsx'
import {
  CV_CARACTERISTICAS,
  CV_CUARTA,
  CV_FIRMAS,
  CV_INTRO,
  CV_PRIMERA,
  CV_QUINTA,
  CV_SEGUNDA,
  CV_SEXTA,
  CV_TERCERA,
  CV_TITULO,
  type Clausula,
  type CompraventaData,
} from './compraventaContent'

/** Cláusula como texto enriquecido: encabezado en negrita + cuerpo con los valores. */
function clausulaRich(c: Clausula, d: CompraventaData): ExcelJS.CellValue {
  const cuerpo = c.segs.map((s) => ('t' in s ? s.t : d[s.f] || '______')).join('')
  return {
    richText: [
      { font: { name: 'Calibri', size: 10, bold: true }, text: c.prefix },
      { font: { name: 'Calibri', size: 10 }, text: cuerpo },
    ],
  }
}

export async function construirCompraventaXlsx(d: CompraventaData, direccion?: string): Promise<Blob> {
  const { wb, ws } = nuevaHoja('COMPRA VENTA')
  setCols(ws, STD_COLS)
  setRows(ws, [
    15, 15, 15, 15, 5.1, // 1-5
    ...Array(36).fill(15), // 6-41
    20.2, // 42
    ...Array(7).fill(15), // 43-49
    15.8, // 50
  ])
  ;[
    'A1:J1',
    'B6:I7',
    'B8:I10',
    'B11:H11',
    'B12:H12',
    'B13:H13',
    'B14:H14',
    'B15:H15',
    'B16:H16',
    'B17:I18',
    'B19:I21',
    'B22:I29',
    'B30:I33',
    'B34:I41',
    'B46:D46',
    'F46:H46',
    'B47:D47',
    'F47:H47',
    'B48:D48',
    'F48:H48',
    'B49:D49',
    'F49:H49',
  ].forEach((m) => ws.mergeCells(m))

  const b = new Bordes()
  b.h(1, 10, 50, 'bottom')
  b.v(1, 2, 50, 'left')
  b.v(10, 2, 50, 'right')
  ctHeaderXlsx(wb, ws, b, { cupon: d.cupon, dia: d.fechaDia, mes: d.fechaMes, anio: d.fechaAnio, direccion })
  b.apply(ws)
  cajaCompletaEn(ws, 'A1')

  const just: Partial<ExcelJS.Alignment> = { horizontal: 'justify', vertical: 'top', wrapText: true }
  const bold10 = calibri(10, true)

  put(ws, 'A1', CV_TITULO, calibri(10, true), ALIGN.center)
  put(ws, 'B6', CV_INTRO, calibri(10), just)

  const clausulas: Array<[string, Clausula]> = [
    ['B8', CV_PRIMERA],
    ['B17', CV_SEGUNDA],
    ['B19', CV_TERCERA],
    ['B22', CV_CUARTA],
    ['B30', CV_QUINTA],
    ['B34', CV_SEXTA],
  ]
  for (const [addr, c] of clausulas) {
    ws.getCell(addr).value = clausulaRich(c, d)
    ws.getCell(addr).alignment = just
  }

  CV_CARACTERISTICAS.forEach((c, i) => {
    const v = d[c.f]
    put(ws, `B${11 + i}`, v.trim() ? `${c.label}${v}` : `${c.label}${'_'.repeat(60)}`, bold10, ALIGN.left)
  })

  // Pie de firmas (tal cual el Excel nuevo).
  const linea = '_____________________________________________'
  const centro = { horizontal: 'center' as const, wrapText: true }
  put(ws, 'B46', linea, calibri(10), centro)
  put(ws, 'F46', linea, calibri(10), centro)
  put(ws, 'B47', CV_FIRMAS.firmaIzq, bold10, centro)
  put(ws, 'F47', CV_FIRMAS.firmaDer, bold10, centro)
  put(ws, 'B48', linea, calibri(10), centro)
  put(ws, 'F48', CV_FIRMAS.aclaracionDerValor, bold10, centro)
  put(ws, 'B49', CV_FIRMAS.aclaracionIzq, bold10, centro)
  put(ws, 'F49', CV_FIRMAS.aclaracionDer, bold10, centro)

  return blobDe(wb)
}
