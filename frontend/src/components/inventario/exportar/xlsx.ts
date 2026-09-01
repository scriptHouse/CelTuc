/**
 * Exportador de Inventario — generador XLSX (ExcelJS).
 *
 * No escupe una grilla de texto: arma un libro de Excel de verdad.
 *  · Encabezado con logo, título, sucursales, fecha y los filtros aplicados.
 *  · Fila de títulos negra, fijada al scrollear, con autofiltro.
 *  · Números que son NÚMEROS (con su formato de moneda), no cadenas.
 *  · Subtotales por grupo con `SUBTOTAL(109,…)`: filtrás y se recalculan solos.
 *  · Grupos plegables con el +/- del margen (esquema de Excel).
 *  · Barras de datos nativas en la columna de stock y el «bajo mínimo» invertido
 *    en negro, igual que el chip de la pantalla.
 *  · Hojas «Resumen», «Kardex» y «Cómo se generó» opcionales.
 *  · Página lista para imprimir: ajustada al ancho, con la fila de títulos
 *    repetida en cada hoja y el número de página en el pie.
 *
 * Este archivo NO importa nada de la app (solo ExcelJS y el dataset): se puede
 * ejecutar y validar fuera del navegador.
 */
import ExcelJS from 'exceljs'
import { CALIDADES_MODULOS, COLUMNAS_IMPORTADOR, GRUPOS_MODULOS, filasImportador } from './datos'
import type {
  ColumnaResuelta,
  Dataset,
  FilaExport,
  GrupoImportador,
  TotalesExport,
} from './datos'
import type { TipoColumna } from './tipos'

/** Un renglón del kardex ya resuelto (nombres, no ids). */
export interface FilaKardex {
  fecha: string
  producto: string
  sucursal: string
  tipo: string
  delta: number
  resultante: number
  nota: string
  usuario: string
}

const INK_950 = 'FF0A0A0B'
const INK_100 = 'FFECECEE'
const INK_50 = 'FFF6F6F7'
const INK_400 = 'FF8D8D96'
const INK_600 = 'FF51515A'
const BANDA = 'FFFAFAFB'
const BLANCO = 'FFFFFFFF'

const FUENTE = 'Calibri'

const FMT_ENTERO = '#,##0'
const FMT_ARS = '"$"\\ #,##0'
const FMT_USD = '"US$"\\ #,##0.00'

const NUMFMT: Record<TipoColumna, string | undefined> = {
  texto: undefined,
  entero: FMT_ENTERO,
  ars: FMT_ARS,
  usd: FMT_USD,
  pct: '0"%"',
  fecha: 'dd/mm/yyyy',
  blanco: undefined,
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
function valorDeCelda(columna: ColumnaResuelta, fila: FilaExport): ExcelJS.CellValue {
  const crudo = columna.valor(fila)
  if (crudo === null || crudo === '') return null
  if (columna.tipo === 'fecha') {
    const d = new Date(String(crudo))
    return Number.isNaN(d.getTime()) ? null : d
  }
  return crudo as ExcelJS.CellValue
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

export async function construirXlsx(
  dataset: Dataset,
  extras: { movimientos?: FilaKardex[] } = {},
): Promise<Blob> {
  const { config, meta } = dataset
  const op = config.xlsx

  const wb = new ExcelJS.Workbook()
  wb.creator = meta.usuario || 'CelTuc'
  wb.company = 'CelTuc'
  wb.created = meta.generado
  wb.modified = meta.generado
  wb.title = meta.titulo
  wb.description = [meta.subtitulo, meta.sucursalesTexto, ...meta.filtros].filter(Boolean).join(' · ')

  // Modo «mismo formato que el importador»: el archivo es la planilla del
  // negocio y nada más. No lleva las hojas extra (el importador lee la primera
  // hoja y el formato tiene que quedar igual al que se sube).
  if (op.formatoImportador) {
    hojaImportador(wb, dataset)
    const buffer = await wb.xlsx.writeBuffer()
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  }

  hojaInventario(wb, dataset)
  if (op.hojaResumen) hojaResumen(wb, dataset)
  if (op.hojaKardex && extras.movimientos?.length) hojaKardex(wb, extras.movimientos, dataset)
  if (op.hojaFiltros) hojaComoSeGenero(wb, dataset)

  // Que abra siempre en la hoja principal, sin importar cuál se creó última.
  wb.views = [{ activeTab: 0, x: 0, y: 0, width: 20000, height: 20000, firstSheet: 0, visibility: 'visible' }]

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/* ===================== Hoja principal ===================== */

function hojaInventario(wb: ExcelJS.Workbook, dataset: Dataset) {
  const { config, columnas, grupos, totales, meta, logo } = dataset
  const op = config.xlsx
  const nCols = columnas.length
  const ultima = letra(nCols)

  const ws = wb.addWorksheet('Inventario', {
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
  const bandaFilas = meta.filtros.length ? 4 : 3

  for (let r = 1; r <= bandaFilas; r++) ws.mergeCells(`A${r}:${ultima}${r}`)

  const titulo = ws.getCell('A1')
  titulo.value = meta.titulo
  titulo.font = { name: FUENTE, size: 17, bold: true, color: { argb: INK_950 } }
  titulo.alignment = { vertical: 'middle', horizontal: 'left', indent: sangria }
  ws.getRow(1).height = 24

  const linea2 = [meta.subtitulo, meta.sucursalesTexto].filter(Boolean).join(' · ')
  const sub = ws.getCell('A2')
  sub.value = linea2
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

  if (meta.filtros.length) {
    const f = ws.getCell('A4')
    f.value = `Filtros: ${meta.filtros.join(' · ')}`
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
  const indiceCol = new Map(columnas.map((c, i) => [c.id, i + 1]))
  const colTotal = indiceCol.get('total')
  const colConteo = indiceCol.get('conteo')
  const colDiferencia = indiceCol.get('diferencia')
  const colEstado = indiceCol.get('estado')

  let fila = filaTitulos + 1
  const primeraDato = fila
  /** Rangos de filas de datos, por grupo, para los subtotales. */
  const rangosGrupo: Array<{ titulo: string; desde: number; hasta: number; totales: TotalesExport }> = []
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
          indent: c.align === 'left' && c.id === 'producto' ? 1 : 0,
        }
        if (op.bandas && banda) celda.fill = fill(BANDA)
      })

      // «Diferencia» viene con la resta ya escrita: se anota el conteo a mano y
      // Excel canta solo cuánto sobra o falta.
      if (colDiferencia && colConteo && colTotal && op.formulas) {
        const cd = r.getCell(colDiferencia)
        const conteo = `${letra(colConteo)}${fila}`
        cd.value = { formula: `IF(${conteo}="","",${conteo}-${letra(colTotal)}${fila})` }
        cd.numFmt = '#,##0;[Red]-#,##0'
      }

      // «Bajo mínimo» invertido en negro, igual que el chip de la pantalla.
      if (op.resaltarBajoMinimo && item.bajoMinimo) {
        if (op.bandas || banda) {
          for (let c = 1; c <= nCols; c++) r.getCell(c).fill = fill(INK_50)
        }
        if (colTotal) {
          const celda = r.getCell(colTotal)
          celda.fill = fill(INK_950)
          celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: BLANCO } }
        }
        if (colEstado) {
          r.getCell(colEstado).font = { name: FUENTE, size: 10, bold: true, color: { argb: INK_950 } }
        }
      }
      // La columna del conteo físico se imprime enmarcada: es para escribir.
      if (colConteo) {
        r.getCell(colConteo).border = {
          top: { style: 'hair', color: { argb: INK_400 } },
          bottom: { style: 'hair', color: { argb: INK_400 } },
          left: { style: 'hair', color: { argb: INK_400 } },
          right: { style: 'hair', color: { argb: INK_400 } },
        }
      }
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
    rangosGrupo.push({ titulo: grupo.titulo, desde, hasta, totales: grupo.totales })
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

  /* ---- Congelado, autofiltro y formato condicional ---- */
  if (op.congelar) {
    ws.views = [
      {
        state: 'frozen',
        xSplit: columnas[0]?.id === 'producto' ? 1 : 0,
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

  if (op.barrasDatos && colTotal && ultimaDato >= primeraDato) {
    const ref = `${letra(colTotal)}${primeraDato}:${letra(colTotal)}${ultimaDato}`
    ws.addConditionalFormatting({
      ref,
      rules: [
        // `color` no está en los tipos de exceljs pero sí en el generador de
        // XML (databar-xform): sin él la barra sale del color por defecto.
        {
          type: 'dataBar',
          priority: 1,
          minLength: 0,
          maxLength: 100,
          cfvo: [{ type: 'min' }, { type: 'max' }],
          color: { argb: 'FFB9B9C0' },
          gradient: false,
          showValue: true,
          border: false,
        } as ExcelJS.DataBarRuleType & { color: { argb: string } },
      ],
    })
  }

  /* ---- Impresión ---- */
  ws.pageSetup.printTitlesRow = `${filaTitulos}:${filaTitulos}`
  ws.pageSetup.printArea = `A1:${ultima}${Math.max(fila - 1, filaTitulos)}`
  ws.headerFooter = {
    oddFooter: `&L&9${escapar(meta.titulo)} — ${escapar(meta.sucursalesTexto)}&C&9Página &P de &N&R&9${escapar(cuando)}`,
    evenFooter: `&L&9${escapar(meta.titulo)}&C&9Página &P de &N`,
  }
}

/** El `&` es el carácter de control de los encabezados de Excel: se duplica. */
function escapar(texto: string): string {
  return texto.replace(/&/g, '&&')
}

function escribirFilaTotal(
  ws: ExcelJS.Worksheet,
  fila: number,
  columnas: ColumnaResuelta[],
  totales: TotalesExport,
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
    const suma = c.total?.(totales)
    if (suma == null) return
    // SUBTOTAL(109) suma solo lo visible e ignora los subtotales anidados: el
    // total general no cuenta dos veces lo que ya sumó cada grupo.
    celda.value = opciones.formulas
      ? { formula: `SUBTOTAL(109,${letra(i + 1)}${desde}:${letra(i + 1)}${hasta})`, result: suma }
      : suma
    const fmt = NUMFMT[c.tipo]
    if (fmt) celda.numFmt = fmt
  })
}

/* ===================== Hoja «Resumen» ===================== */

function hojaResumen(wb: ExcelJS.Workbook, dataset: Dataset) {
  const { totales, cortes, meta } = dataset
  const ws = wb.addWorksheet('Resumen', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [{ width: 34 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 14 }]

  ws.mergeCells('A1:F1')
  const t = ws.getCell('A1')
  t.value = `${meta.titulo} · Resumen`
  t.font = { name: FUENTE, size: 15, bold: true, color: { argb: INK_950 } }
  t.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 22

  ws.mergeCells('A2:F2')
  const s = ws.getCell('A2')
  s.value = `${meta.sucursalesTexto} · ${meta.generado.toLocaleDateString('es-AR')}`
  s.font = { name: FUENTE, size: 10, color: { argb: INK_400 } }

  let fila = 4
  const kpis: Array<[string, number, TipoColumna]> = [
    ['Productos', totales.productos, 'entero'],
    ['Unidades', totales.unidades, 'entero'],
    ['Valor a lista', totales.valorLista, 'ars'],
    ['Valor a contado', totales.valorCash, 'ars'],
    ['Bajo mínimo', totales.bajoMinimo, 'entero'],
    ['Sin stock', totales.sinStock, 'entero'],
    ['No informados', totales.sinDato, 'entero'],
    ['Unidades faltantes', totales.faltante, 'entero'],
  ]
  for (const [etiqueta, valor, tipo] of kpis) {
    const rotulo = ws.getCell(fila, 1)
    rotulo.value = etiqueta
    rotulo.font = { name: FUENTE, size: 10, color: { argb: INK_600 } }
    const dato = ws.getCell(fila, 2)
    dato.value = valor
    dato.numFmt = tipo === 'ars' ? FMT_ARS : FMT_ENTERO
    dato.font = { name: FUENTE, size: 11, bold: true, color: { argb: INK_950 } }
    dato.alignment = { horizontal: 'right' }
    fila += 1
  }

  fila += 1
  fila = tablaCorte(ws, fila, 'Por categoría', cortes.porCategoria)
  fila += 1
  fila = tablaCorte(ws, fila, 'Por sucursal', cortes.porSucursal)
  fila += 1
  tablaCorte(ws, fila, 'Por marca (top 15)', cortes.porMarca.slice(0, 15))
}

function tablaCorte(
  ws: ExcelJS.Worksheet,
  filaInicial: number,
  titulo: string,
  cortes: Dataset['cortes']['porCategoria'],
): number {
  let fila = filaInicial
  ws.mergeCells(`A${fila}:F${fila}`)
  const t = ws.getCell(fila, 1)
  t.value = titulo
  t.font = { name: FUENTE, size: 11, bold: true, color: { argb: INK_950 } }
  fila += 1

  const titulos = ['', 'Productos', 'Unidades', 'Valor a lista', 'Valor a contado', 'Bajo mín.']
  titulos.forEach((texto, i) => {
    const celda = ws.getCell(fila, i + 1)
    celda.value = texto
    celda.font = { name: FUENTE, size: 9.5, bold: true, color: { argb: BLANCO } }
    celda.fill = fill(INK_950)
    celda.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', indent: i === 0 ? 1 : 0 }
  })
  ws.getRow(fila).height = 18
  fila += 1

  const desde = fila
  cortes.forEach((corte, indice) => {
    const valores: Array<string | number> = [
      corte.nombre, corte.productos, corte.unidades, corte.valorLista, corte.valorCash, corte.bajoMinimo,
    ]
    valores.forEach((valor, i) => {
      const celda = ws.getCell(fila, i + 1)
      celda.value = valor
      celda.font = { name: FUENTE, size: 10 }
      celda.alignment = { horizontal: i === 0 ? 'left' : 'right', indent: i === 0 ? 1 : 0 }
      if (i === 1 || i === 2 || i === 5) celda.numFmt = FMT_ENTERO
      if (i === 3 || i === 4) celda.numFmt = FMT_ARS
      if (indice % 2 === 1) celda.fill = fill(BANDA)
    })
    fila += 1
  })

  if (cortes.length) {
    const totalFila = ws.getRow(fila)
    for (let i = 1; i <= 6; i++) {
      const celda = totalFila.getCell(i)
      celda.font = { name: FUENTE, size: 10, bold: true }
      celda.border = { top: { style: 'thin', color: { argb: INK_950 } } }
      celda.alignment = { horizontal: i === 1 ? 'left' : 'right', indent: i === 1 ? 1 : 0 }
      if (i === 1) {
        celda.value = 'Total'
        continue
      }
      celda.value = { formula: `SUM(${letra(i)}${desde}:${letra(i)}${fila - 1})` }
      celda.numFmt = i === 4 || i === 5 ? FMT_ARS : FMT_ENTERO
    }
    fila += 1
  }
  return fila
}

/* ===================== Hoja «Kardex» ===================== */

function hojaKardex(wb: ExcelJS.Workbook, movimientos: FilaKardex[], dataset: Dataset) {
  const ws = wb.addWorksheet('Kardex', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [
    { width: 17 }, { width: 40 }, { width: 14 }, { width: 15 },
    { width: 10 }, { width: 12 }, { width: 30 }, { width: 18 },
  ]

  ws.mergeCells('A1:H1')
  const t = ws.getCell('A1')
  t.value = `Kardex · últimos ${movimientos.length} movimientos · ${dataset.meta.sucursalesTexto}`
  t.font = { name: FUENTE, size: 12, bold: true, color: { argb: INK_950 } }
  ws.getRow(1).height = 20

  const titulos = ['Fecha', 'Producto', 'Sucursal', 'Tipo', 'Delta', 'Resultante', 'Nota', 'Usuario']
  titulos.forEach((texto, i) => {
    const celda = ws.getCell(2, i + 1)
    celda.value = texto
    celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: BLANCO } }
    celda.fill = fill(INK_950)
    celda.alignment = { vertical: 'middle', horizontal: i >= 4 && i <= 5 ? 'right' : 'left', indent: 1 }
  })
  ws.getRow(2).height = 20

  movimientos.forEach((m, indice) => {
    const fila = 3 + indice
    const fecha = new Date(m.fecha)
    const valores: Array<ExcelJS.CellValue> = [
      Number.isNaN(fecha.getTime()) ? m.fecha : fecha,
      m.producto, m.sucursal, m.tipo, m.delta, m.resultante, m.nota, m.usuario,
    ]
    valores.forEach((valor, i) => {
      const celda = ws.getCell(fila, i + 1)
      celda.value = valor
      celda.font = { name: FUENTE, size: 10 }
      celda.alignment = { horizontal: i >= 4 && i <= 5 ? 'right' : 'left', indent: 1 }
      if (i === 0) celda.numFmt = 'dd/mm/yyyy hh:mm'
      // El signo manda: lo que sale se lee en rojo, como en cualquier kardex.
      if (i === 4) celda.numFmt = '+#,##0;[Red]-#,##0;0'
      if (i === 5) celda.numFmt = '#,##0'
      if (indice % 2 === 1) celda.fill = fill(BANDA)
    })
  })

  if (movimientos.length) {
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + movimientos.length, column: 8 } }
  }
}

/* ===================== Hoja «Cómo se generó» ===================== */

function hojaComoSeGenero(wb: ExcelJS.Workbook, dataset: Dataset) {
  const { config, meta, columnas, sucursales } = dataset
  const ws = wb.addWorksheet('Cómo se generó', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 28 }, { width: 76 }]

  ws.mergeCells('A1:B1')
  const t = ws.getCell('A1')
  t.value = 'Cómo se generó este archivo'
  t.font = { name: FUENTE, size: 14, bold: true, color: { argb: INK_950 } }
  ws.getRow(1).height = 22

  const filas: Array<[string, string]> = [
    ['Título', meta.titulo],
    ['Subtítulo', meta.subtitulo || '—'],
    ['Generado', meta.generado.toLocaleString('es-AR')],
    ['Usuario', meta.usuario || '—'],
    ['Alcance', meta.alcanceTexto],
    ['Sucursales', sucursales.map((s) => s.nombre).join(' · ') || '—'],
    ['Filtros', meta.filtros.join(' · ')],
    ['Disposición', config.disposicion === 'larga' ? 'Larga (una fila por producto y sucursal)' : 'Ancha (una columna por sucursal)'],
    ['Agrupado por', config.agruparPor === 'ninguno' ? 'Sin agrupar' : config.agruparPor],
    ['Orden', config.orden],
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
    'Los precios son los vivos del catálogo al momento de exportar (derivados del dólar del negocio). ' +
    'Las cantidades son las del sistema: si alguien contó después, este archivo no lo sabe.'
  nota.font = { name: FUENTE, size: 9, italic: true, color: { argb: INK_400 } }
  nota.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(fila).height = 30
}

/* ===================== Hoja «formato importador» ===================== */

/* Los colores de la planilla del negocio, resueltos del tema del archivo
   original: las columnas alternan azul (accent1) y blanco, con el título de
   sección en azul fuerte (accent5). */
const PLANILLA_AZUL = 'FF5B9BD5'
const PLANILLA_BLANCO = 'FFFFFFFF'
const PLANILLA_NEGRO = 'FF000000'

/** Formatos de la planilla, columna por columna (los mismos del archivo real). */
const FMT_PLANILLA_ARS = '_-"$"\\ * #,##0.00_-;\\-"$"\\ * #,##0.00_-;_-"$"\\ * "-"??_-;_-@'
const FMT_PLANILLA_USD = '_-[$USD]\\ * #,##0.00_-;\\-[$USD]\\ * #,##0.00_-;_-[$USD]\\ * "-"??_-;_-@_-'
const FMT_PLANILLA_PESOS = '[$$]#,##0'

const BORDE_PLANILLA: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: PLANILLA_NEGRO } },
  left: { style: 'thin', color: { argb: PLANILLA_NEGRO } },
  bottom: { style: 'thin', color: { argb: PLANILLA_NEGRO } },
  right: { style: 'thin', color: { argb: PLANILLA_NEGRO } },
}

/** El fondo de cada columna: impares azul, pares blanco (como el original). */
const fondoPlanilla = (columna: number) => (columna % 2 === 1 ? PLANILLA_AZUL : PLANILLA_BLANCO)

/** La primera columna de datos del bloque de MÓDULOS (C: A es la sección, B el modelo). */
const MODULOS_PRIMERA = 3
/** El bloque ocupa A..T: dos columnas fijas y seis grupos de tres calidades. */
const MODULOS_ULTIMA =
  MODULOS_PRIMERA + GRUPOS_MODULOS.length * CALIDADES_MODULOS.length - 1

/** El formato de cada grupo de MÓDULOS, en el orden de `GRUPOS_MODULOS`. */
const FMT_MODULOS: Record<string, string> = {
  costoUsd: FMT_PLANILLA_USD,
  costoArs: FMT_PLANILLA_ARS,
  listaUsd: FMT_PLANILLA_USD,
  listaArs: FMT_PLANILLA_PESOS,
  stock: FMT_ENTERO,
  minimo: FMT_ENTERO,
}

/** El fondo de cada grupo: alternado, para que se vea dónde empieza y termina. */
const fondoGrupoModulos = (grupo: number) =>
  grupo % 2 === 0 ? PLANILLA_AZUL : PLANILLA_BLANCO

/**
 * El bloque de MÓDULOS: la planilla reparte ahí las calidades EN COLUMNAS
 * (CC / CO / CA) en vez de meterlas en el nombre, y para eso vuelve a escribir
 * el encabezado con las columnas corridas.
 *
 * Se escribe igual que el archivo del negocio —título de grupo combinado sobre
 * sus tres calidades, sub-encabezado con las siglas, un renglón por modelo— y
 * el importador lo entiende porque cada encabezado nuevo manda desde su fila
 * hacia abajo (`_columnas_de` en `backend/inventario/importacion.py`).
 *
 * Devuelve la primera fila libre.
 */
function bloqueModulos(
  ws: ExcelJS.Worksheet,
  filaInicial: number,
  grupo: GrupoImportador,
): number {
  const filas = grupo.matriz ?? []
  if (!filas.length) return filaInicial

  const pintar = (celda: ExcelJS.Cell, fondo: string, negrita = false) => {
    celda.font = { name: FUENTE, size: 10, bold: negrita, color: { argb: PLANILLA_NEGRO } }
    celda.fill = fill(fondo)
    celda.border = BORDE_PLANILLA
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  }

  /* ---- Encabezado propio: PRODUCTOS y un título por grupo ---- */
  const cabecera = ws.getRow(filaInicial)
  cabecera.height = 25.5
  pintar(cabecera.getCell(2), PLANILLA_BLANCO, true)
  cabecera.getCell(2).value = 'PRODUCTOS'
  GRUPOS_MODULOS.forEach((columna, i) => {
    const desde = MODULOS_PRIMERA + i * CALIDADES_MODULOS.length
    const hasta = desde + CALIDADES_MODULOS.length - 1
    ws.mergeCells(filaInicial, desde, filaInicial, hasta)
    const celda = cabecera.getCell(desde)
    celda.value = columna.label
    pintar(celda, fondoGrupoModulos(i), true)
    // El merge deja las otras dos celdas vacías: se pintan igual para que el
    // borde del grupo cierre parejo.
    for (let c = desde + 1; c <= hasta; c++) pintar(cabecera.getCell(c), fondoGrupoModulos(i))
  })

  /* ---- Sub-encabezado: las tres calidades bajo cada grupo ---- */
  const siglas = ws.getRow(filaInicial + 1)
  siglas.height = 15
  pintar(siglas.getCell(2), PLANILLA_BLANCO)
  GRUPOS_MODULOS.forEach((_, i) => {
    CALIDADES_MODULOS.forEach((calidad, j) => {
      const celda = siglas.getCell(MODULOS_PRIMERA + i * CALIDADES_MODULOS.length + j)
      celda.value = calidad.sigla
      pintar(celda, fondoGrupoModulos(i), true)
    })
  })

  /* ---- Un renglón por modelo ---- */
  let fila = filaInicial + 2
  for (const item of filas) {
    const r = ws.getRow(fila)
    r.height = 15
    const nombre = r.getCell(2)
    nombre.value = item.nombre
    pintar(nombre, PLANILLA_BLANCO)
    nombre.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    GRUPOS_MODULOS.forEach((columna, i) => {
      CALIDADES_MODULOS.forEach((_, j) => {
        const celda = r.getCell(MODULOS_PRIMERA + i * CALIDADES_MODULOS.length + j)
        // La calidad que no existe para ese modelo viaja VACÍA, igual que una
        // fila sin contar: el importador la deja como está.
        celda.value = item.celdas[j]?.[columna.id] ?? null
        pintar(celda, fondoGrupoModulos(i))
        celda.numFmt = FMT_MODULOS[columna.id]
      })
    })
    fila += 1
  }

  /* ---- El título de la sección, combinado en vertical como el original ---- */
  const ultima = fila - 1
  if (ultima > filaInicial) ws.mergeCells(`A${filaInicial}:A${ultima}`)
  const titulo = ws.getCell(filaInicial, 1)
  titulo.value = grupo.categoria
  titulo.font = { name: FUENTE, size: 10, bold: true, color: { argb: PLANILLA_NEGRO } }
  titulo.fill = fill(PLANILLA_AZUL)
  titulo.alignment = { vertical: 'middle', horizontal: 'center', textRotation: 90 }
  titulo.border = BORDE_PLANILLA
  return fila
}

/**
 * La planilla tal cual la lee «Importar stock»: encabezado en la fila 1,
 * categoría combinada en la columna A y una fila por producto.
 *
 * Los rótulos y su posición son el CONTRATO con el importador
 * (`backend/inventario/importacion.py` busca «PRODUCTOS» y «STOCK»): no se
 * tocan sin tocar también el parser.
 */
function hojaImportador(wb: ExcelJS.Workbook, dataset: Dataset) {
  const { config, meta } = dataset
  // La sucursal de la columna STOCK: la elegida a mano o la primera del alcance.
  const sucursalId =
    config.xlsx.sucursalImportador ?? dataset.sucursales[0]?.id ?? null
  const sucursal = dataset.sucursales.find((s) => s.id === sucursalId)
  const grupos = filasImportador(dataset, sucursalId)
  // MÓDULOS ensancha la hoja hasta la T: sus calidades van en columnas.
  const conModulos = grupos.some((g) => g.matriz?.length)
  const nCols = conModulos ? MODULOS_ULTIMA : COLUMNAS_IMPORTADOR.length

  const ws = wb.addWorksheet((sucursal?.nombre ?? 'Stock').slice(0, 31), {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  })
  const anchos = COLUMNAS_IMPORTADOR.map((c) => c.ancho)
  // Las columnas de más del bloque de MÓDULOS toman el ancho de las de precio.
  const anchoPrecio = COLUMNAS_IMPORTADOR[2].ancho
  while (anchos.length < nCols) anchos.push(anchoPrecio)
  ws.columns = anchos.map((width) => ({
    width,
    style: { font: { name: FUENTE, size: 10 } },
  }))

  /* ---- Fila 1: los rótulos que busca el importador ----
     Son siempre las diez columnas de la planilla: el bloque de MÓDULOS trae
     después su propio encabezado, con las columnas corridas. */
  const cabecera = ws.getRow(1)
  cabecera.height = 25.5
  COLUMNAS_IMPORTADOR.forEach((columna, i) => {
    const celda = cabecera.getCell(i + 1)
    celda.value = columna.label || null
    celda.font = { name: FUENTE, size: 10, bold: i === 0, color: { argb: PLANILLA_NEGRO } }
    celda.fill = fill(fondoPlanilla(i + 1))
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    celda.border = BORDE_PLANILLA
  })

  /* ---- Datos, agrupados por categoría (la columna A va combinada) ---- */
  let fila = 2
  for (const grupo of grupos) {
    const desde = fila
    for (const item of grupo.filas) {
      const r = ws.getRow(fila)
      r.height = 15
      const valores: Array<number | string | null> = [
        null, // la categoría se escribe una sola vez, al cerrar el grupo
        item.nombre,
        item.costoUsd,
        item.costoArs,
        item.listaUsd,
        item.cashUsd,
        item.listaArs,
        item.cashArs,
        item.stock,
        item.minimo,
      ]
      valores.forEach((valor, i) => {
        const celda = r.getCell(i + 1)
        celda.value = valor
        celda.font = { name: FUENTE, size: 10, color: { argb: PLANILLA_NEGRO } }
        celda.fill = fill(fondoPlanilla(i + 1))
        celda.border = BORDE_PLANILLA
        celda.alignment = {
          vertical: 'middle',
          horizontal: i === 1 ? 'left' : 'center',
          indent: i === 1 ? 1 : 0,
        }
        // Cada columna con el formato que trae la planilla del negocio. El
        // stock y el mínimo van como ENTERO: son unidades contadas, no plata
        // (en la planilla original heredaron un formato de moneda).
        if (i === 2 || i === 3) celda.numFmt = FMT_PLANILLA_ARS
        else if (i === 4 || i === 5) celda.numFmt = FMT_PLANILLA_USD
        else if (i === 6 || i === 7) celda.numFmt = FMT_PLANILLA_PESOS
        else if (i === 8 || i === 9) celda.numFmt = FMT_ENTERO
      })
      fila += 1
    }
    const hasta = fila - 1
    if (hasta >= desde) {
      // El título de la sección: una celda combinada en vertical, como el original.
      if (hasta > desde) ws.mergeCells(`A${desde}:A${hasta}`)
      const titulo = ws.getCell(desde, 1)
      titulo.value = grupo.categoria
      titulo.font = { name: FUENTE, size: 10, bold: true, color: { argb: PLANILLA_NEGRO } }
      titulo.fill = fill(PLANILLA_AZUL)
      // Vertical y centrado, como en la planilla del negocio (la columna A mide 5).
      titulo.alignment = { vertical: 'middle', horizontal: 'center', textRotation: 90 }
      titulo.border = BORDE_PLANILLA
    }
    // MÓDULOS cierra la hoja con su bloque de calidades en columnas. Va al
    // final y con su propio encabezado: de esa fila para abajo el importador
    // lee con ESE mapa, así que no puede quedar nada normal después.
    if (grupo.matriz?.length) fila = bloqueModulos(ws, fila, grupo)
  }

  ws.views = [{ state: 'frozen', ySplit: 1, activeCell: 'B2' }]

  /* ---- La nota va en la columna K, como en la planilla del negocio ----
     Fuera de las columnas que lee el importador: si se escribiera en la de
     PRODUCTOS, la leería como un renglón más. */
  const nota = ws.getCell(1, nCols + 1)
  nota.value =
    `Stock de ${sucursal?.nombre ?? 'la sucursal'} al ${meta.generado.toLocaleDateString('es-AR')}` +
    `${meta.usuario ? ` · exportado por ${meta.usuario}` : ''}. ` +
    'Completá o corregí la columna STOCK y volvé a subir este mismo archivo en ' +
    'Inventario → Importar stock. Una celda vacía NO es cero: esa fila se deja como está.'
  nota.font = { name: FUENTE, size: 9, italic: true, color: { argb: INK_600 } }
  nota.alignment = { vertical: 'middle', wrapText: true }
  ws.getColumn(nCols + 1).width = 54.57
}
