/**
 * Exportador genérico de gestores — generador XLSX (ExcelJS).
 *
 * El mismo estándar del Excel de Inventario, para cualquier gestor:
 *  · Encabezado con logo, título, fecha y los filtros aplicados.
 *  · Fila de títulos negra, fijada al scrollear, con autofiltro.
 *  · Números que son NÚMEROS (con su formato de moneda), no cadenas.
 *  · Subtotales por grupo con `SUBTOTAL(109,…)`: filtrás y se recalculan solos.
 *  · Grupos plegables con el +/- del margen (esquema de Excel).
 *  · Hoja «Cómo se generó» opcional, para dejar trazabilidad.
 *  · Página lista para imprimir: ajustada al ancho, con la fila de títulos
 *    repetida en cada hoja y el número de página en el pie.
 *
 * Este archivo NO importa nada de la app (solo ExcelJS y el dataset): se puede
 * ejecutar y validar fuera del navegador.
 */
import ExcelJS from 'exceljs'
import type { ColumnaResueltaTabla, DatasetTabla, TotalesTabla } from './datos'
import type { TipoColumnaTabla } from './tipos'

const INK_950 = 'FF0A0A0B'
const INK_100 = 'FFECECEE'
const INK_50 = 'FFF6F6F7'
const INK_400 = 'FF8D8D96'
const INK_600 = 'FF51515A'
const BANDA = 'FFFAFAFB'
const BLANCO = 'FFFFFFFF'

const FUENTE = 'Calibri'

const FMT_ENTERO = '#,##0'
const FMT_DECIMAL = '#,##0.00'
const FMT_ARS = '"$"\\ #,##0'
const FMT_USD = '"US$"\\ #,##0.00'

const NUMFMT: Record<TipoColumnaTabla, string | undefined> = {
  texto: undefined,
  entero: FMT_ENTERO,
  decimal: FMT_DECIMAL,
  ars: FMT_ARS,
  usd: FMT_USD,
  pct: '0"%"',
  fecha: 'dd/mm/yyyy',
  fechahora: 'dd/mm/yyyy hh:mm',
}

/** A, B, … Z, AA, AB … */
function letra(col: number): string {
  let n = col
  let out = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    out = String.fromCharCode(65 + resto) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** El valor que va a la celda: fecha real para las fechas, número para el resto. */
function valorDeCelda<T>(columna: ColumnaResueltaTabla<T>, fila: T): ExcelJS.CellValue {
  const crudo = columna.valor(fila)
  if (crudo === null || crudo === '') return null
  if (columna.tipo === 'fecha' || columna.tipo === 'fechahora') {
    const d = new Date(String(crudo))
    return Number.isNaN(d.getTime()) ? String(crudo) : d
  }
  return crudo as ExcelJS.CellValue
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

/** El `&` es el carácter de control de los pies de página de Excel: se duplica. */
function escaparPie(texto: string): string {
  return texto.replace(/&/g, '&&')
}

/** Nombre de hoja válido: sin caracteres prohibidos y de 31 como máximo. */
function nombreDeHoja(titulo: string): string {
  const limpio = titulo.replace(/[\\/*?:[\]]/g, ' ').replace(/\s+/g, ' ').trim()
  return (limpio || 'Datos').slice(0, 31)
}

export async function construirXlsxTabla<T>(dataset: DatasetTabla<T>): Promise<Blob> {
  const { meta } = dataset

  const wb = new ExcelJS.Workbook()
  wb.creator = meta.usuario || 'CelTuc'
  wb.company = 'CelTuc'
  wb.created = meta.generado
  wb.modified = meta.generado
  wb.title = meta.titulo
  wb.description = [meta.subtitulo, ...meta.contexto].filter(Boolean).join(' · ')

  hojaPrincipal(wb, dataset)
  if (dataset.config.xlsx.hojaFicha) hojaComoSeGenero(wb, dataset)

  // Que abra siempre en la hoja principal, sin importar cuál se creó última.
  wb.views = [{ activeTab: 0, x: 0, y: 0, width: 20000, height: 20000, firstSheet: 0, visibility: 'visible' }]

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/* ===================== Hoja principal ===================== */

function hojaPrincipal<T>(wb: ExcelJS.Workbook, dataset: DatasetTabla<T>) {
  const { config, columnas, grupos, totales, meta, logo } = dataset
  const op = config.xlsx
  const nCols = columnas.length
  const ultima = letra(nCols)

  const ws = wb.addWorksheet(nombreDeHoja(meta.titulo), {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 16, outlineLevelRow: op.agrupable && dataset.agrupado ? 1 : 0 },
    pageSetup: {
      paperSize: 9,
      orientation: nCols > 7 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })
  ws.properties.outlineProperties = { summaryBelow: true, summaryRight: false }

  // Anchos: el peso de cada columna es su ancho en caracteres, con un piso que
  // garantiza que el título quepa (si no, Excel corta el rótulo).
  ws.columns = columnas.map((c) => ({
    width: Math.max(c.peso, c.label.length + 3),
    style: { font: { name: FUENTE, size: 10 } },
  }))

  /* ---- Encabezado ---- */
  const conLogo = Boolean(logo)
  const sangria = conLogo ? 7 : 0
  const bandaFilas = meta.contexto.length ? 4 : 3

  for (let r = 1; r <= bandaFilas; r++) ws.mergeCells(`A${r}:${ultima}${r}`)

  const titulo = ws.getCell('A1')
  titulo.value = meta.titulo
  titulo.font = { name: FUENTE, size: 17, bold: true, color: { argb: INK_950 } }
  titulo.alignment = { vertical: 'middle', horizontal: 'left', indent: sangria }
  ws.getRow(1).height = 24

  const sub = ws.getCell('A2')
  sub.value = meta.subtitulo
  sub.font = { name: FUENTE, size: 10.5, color: { argb: INK_600 } }
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: sangria }
  ws.getRow(2).height = 15

  const cuando = meta.generado.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const meta3 = ws.getCell('A3')
  meta3.value = `Generado el ${cuando}${meta.usuario ? ` por ${meta.usuario}` : ''} · ${meta.alcanceTexto} · ${dataset.filas.length} filas`
  meta3.font = { name: FUENTE, size: 9, color: { argb: INK_400 } }
  meta3.alignment = { vertical: 'middle', horizontal: 'left', indent: sangria }
  ws.getRow(3).height = 14

  if (meta.contexto.length) {
    const f = ws.getCell('A4')
    f.value = `Filtros: ${meta.contexto.join(' · ')}`
    f.font = { name: FUENTE, size: 9, italic: true, color: { argb: INK_400 } }
    f.alignment = { vertical: 'middle', horizontal: 'left', indent: sangria }
    ws.getRow(4).height = 14
  }

  if (logo) {
    const id = wb.addImage({ base64: logo.split(',')[1], extension: 'jpeg' })
    ws.addImage(id, {
      tl: { col: 0.12, row: 0.25 },
      ext: { width: 46, height: 46 },
      editAs: 'oneCell',
    })
  }

  // Regla fina que cierra la banda.
  const filaRegla = bandaFilas + 1
  ws.getRow(filaRegla).height = 6
  for (let c = 1; c <= nCols; c++) {
    ws.getCell(filaRegla, c).border = { bottom: { style: 'thin', color: { argb: INK_950 } } }
  }

  /* ---- Fila de títulos ---- */
  const filaTitulos = filaRegla + 1
  const cabecera = ws.getRow(filaTitulos)
  cabecera.height = 24
  columnas.forEach((c, i) => {
    const celda = cabecera.getCell(i + 1)
    celda.value = c.label
    celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: BLANCO } }
    celda.fill = fill(INK_950)
    celda.alignment = {
      vertical: 'middle',
      horizontal: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left',
      wrapText: true,
    }
    celda.border = { bottom: { style: 'thin', color: { argb: INK_950 } } }
  })

  /* ---- Datos ---- */
  let fila = filaTitulos + 1
  const primeraDato = fila
  let banda = false

  for (const grupo of grupos) {
    if (dataset.agrupado) {
      ws.mergeCells(`A${fila}:${ultima}${fila}`)
      const celda = ws.getCell(fila, 1)
      celda.value = `${grupo.titulo}  (${grupo.filas.length})`
      celda.font = { name: FUENTE, size: 10.5, bold: true, color: { argb: INK_950 } }
      celda.fill = fill(INK_100)
      celda.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      ws.getRow(fila).height = 19
      for (let c = 1; c <= nCols; c++) {
        ws.getCell(fila, c).border = { top: { style: 'thin', color: { argb: 'FFD9D9DD' } } }
      }
      fila += 1
      banda = false
    }

    const desde = fila
    for (const item of grupo.filas) {
      const r = ws.getRow(fila)
      if (op.agrupable && dataset.agrupado) r.outlineLevel = 1
      columnas.forEach((c, i) => {
        const celda = r.getCell(i + 1)
        celda.value = valorDeCelda(c, item)
        const fmt = NUMFMT[c.tipo]
        if (fmt) celda.numFmt = fmt
        celda.alignment = {
          vertical: 'middle',
          horizontal: c.align,
          wrapText: false,
          indent: c.align === 'left' && i === 0 ? 1 : 0,
        }
        if (op.bandas && banda) celda.fill = fill(BANDA)
      })
      banda = !banda
      fila += 1
    }
    const hasta = fila - 1

    if (dataset.agrupado && op.subtotales && hasta >= desde) {
      escribirFilaTotal(ws, fila, columnas, grupo.totales, {
        etiqueta: `Subtotal ${grupo.titulo}`,
        rango: [desde, hasta],
        formulas: op.formulas,
        fondo: INK_50,
        doble: false,
      })
      if (op.agrupable) ws.getRow(fila).outlineLevel = 1
      fila += 1
    }
    // Un renglón de aire entre grupos, para que la hoja respire.
    if (dataset.agrupado) fila += 1
  }

  const ultimaDato = fila - 1

  if (op.totalGeneral && dataset.filas.length) {
    escribirFilaTotal(ws, fila, columnas, totales, {
      etiqueta: `TOTAL · ${dataset.filas.length} filas`,
      rango: [primeraDato, ultimaDato],
      formulas: op.formulas,
      fondo: INK_100,
      doble: true,
    })
    fila += 1
  }

  /* ---- Congelado y autofiltro ---- */
  if (op.congelar) {
    ws.views = [
      {
        state: 'frozen',
        xSplit: 1,
        ySplit: filaTitulos,
        showGridLines: false,
        activeCell: `A${filaTitulos + 1}`,
      },
    ]
  }

  if (op.autofiltro && ultimaDato >= primeraDato) {
    ws.autoFilter = {
      from: { row: filaTitulos, column: 1 },
      to: { row: ultimaDato, column: nCols },
    }
  }

  /* ---- Impresión ---- */
  ws.pageSetup.printTitlesRow = `${filaTitulos}:${filaTitulos}`
  ws.pageSetup.printArea = `A1:${ultima}${Math.max(fila - 1, filaTitulos)}`
  ws.headerFooter = {
    oddFooter: `&L&9${escaparPie(meta.titulo)}&C&9Página &P de &N&R&9${escaparPie(cuando)}`,
    evenFooter: `&L&9${escaparPie(meta.titulo)}&C&9Página &P de &N`,
  }
}

function escribirFilaTotal<T>(
  ws: ExcelJS.Worksheet,
  fila: number,
  columnas: ColumnaResueltaTabla<T>[],
  totales: TotalesTabla,
  opciones: {
    etiqueta: string
    rango: [number, number]
    formulas: boolean
    fondo: string
    doble: boolean
  },
) {
  const r = ws.getRow(fila)
  r.height = 18
  const [desde, hasta] = opciones.rango
  columnas.forEach((c, i) => {
    const celda = r.getCell(i + 1)
    celda.fill = fill(opciones.fondo)
    celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: INK_950 } }
    celda.border = {
      top: { style: opciones.doble ? 'double' : 'thin', color: { argb: INK_950 } },
    }
    celda.alignment = { vertical: 'middle', horizontal: c.align, indent: i === 0 ? 1 : 0 }

    if (i === 0) {
      celda.value = opciones.etiqueta
      celda.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      return
    }
    if (!(c.id in totales.sumas)) return
    const suma = totales.sumas[c.id]
    // SUBTOTAL(109) suma solo lo visible e ignora los subtotales anidados: el
    // total general no cuenta dos veces lo que ya sumó cada grupo.
    celda.value = opciones.formulas
      ? { formula: `SUBTOTAL(109,${letra(i + 1)}${desde}:${letra(i + 1)}${hasta})`, result: suma }
      : suma
    const fmt = NUMFMT[c.tipo]
    if (fmt) celda.numFmt = fmt
  })
}

/* ===================== Hoja «Cómo se generó» ===================== */

function hojaComoSeGenero<T>(wb: ExcelJS.Workbook, dataset: DatasetTabla<T>) {
  const { config, meta, columnas } = dataset
  const ws = wb.addWorksheet('Cómo se generó', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 28 }, { width: 76 }]

  ws.mergeCells('A1:B1')
  const t = ws.getCell('A1')
  t.value = 'Cómo se generó este archivo'
  t.font = { name: FUENTE, size: 14, bold: true, color: { argb: INK_950 } }
  ws.getRow(1).height = 22

  const porId = new Map(columnas.map((c) => [c.id, c.label]))
  const filas: Array<[string, string]> = [
    ['Título', meta.titulo],
    ['Subtítulo', meta.subtitulo || '—'],
    ['Generado', meta.generado.toLocaleString('es-AR')],
    ['Usuario', meta.usuario || '—'],
    ['Alcance', meta.alcanceTexto],
    ['Filtros', meta.contexto.join(' · ')],
    ['Agrupado por', dataset.agrupado ? dataset.grupoLabel : 'Sin agrupar'],
    [
      'Orden',
      config.ordenCol
        ? `${porId.get(config.ordenCol) ?? config.ordenCol} (${config.ordenDir === 'desc' ? 'descendente' : 'ascendente'})`
        : 'El del gestor',
    ],
    ['Columnas', columnas.map((c) => c.label).join(' · ')],
    ['Filas exportadas', String(dataset.filas.length)],
  ]

  let fila = 3
  for (const [rotulo, valor] of filas) {
    const a = ws.getCell(fila, 1)
    a.value = rotulo
    a.font = { name: FUENTE, size: 10, bold: true, color: { argb: INK_600 } }
    a.alignment = { vertical: 'top' }
    const b = ws.getCell(fila, 2)
    b.value = valor
    b.font = { name: FUENTE, size: 10, color: { argb: INK_950 } }
    b.alignment = { vertical: 'top', wrapText: true }
    fila += 1
  }

  fila += 1
  ws.mergeCells(`A${fila}:B${fila}`)
  const nota = ws.getCell(fila, 1)
  nota.value =
    'Los datos son los del sistema al momento de exportar: si alguien cargó o corrigió algo después, este archivo no lo sabe.'
  nota.font = { name: FUENTE, size: 9, italic: true, color: { argb: INK_400 } }
  nota.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(fila).height = 30
}
