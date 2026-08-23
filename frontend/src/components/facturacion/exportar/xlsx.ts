/**
 * Exportador de Facturación — generador XLSX (ExcelJS).
 *
 * Calca la planilla que ya usa el negocio y la llena sola con lo facturado
 * (facturas electrónicas con CAE) del mes:
 *  · Fila de títulos con los medios en azul, el ÍNDICE en rojo y el resto gris.
 *  · Un renglón por día del mes, con formato Contabilidad ($ y guión en el cero).
 *  · TOTAL en verde, como fórmula viva (`=B5+C5+D5`) cuando las columnas de
 *    medios cubren toda la plata; si no, con su valor real (nunca miente).
 *  · ÍNDICE con la fórmula GANANCIA / PERDIDA contra la meta diaria, pintado
 *    con formato condicional nativo (verde / rojo), igual que el original.
 *  · Columna ESTADO en blanco a propósito: es para anotar a mano.
 *  · Hojas opcionales: «Por cuenta» (una fila por CUIT con lo que entró por
 *    cada medio), «Comprobantes» y «Cómo se generó».
 *
 * Este archivo NO importa nada de la app (sólo ExcelJS y el dataset): se puede
 * ejecutar y validar fuera del navegador.
 */
import ExcelJS from 'exceljs'
import { MEDIO_LABEL, type ColumnaResuelta, type DatasetFacturacion, type FilaFacturacion } from './datos'
import { nombreMes, type TipoColumna } from './tipos'

/* ---- La paleta de la planilla original ---- */
const GRIS = 'FFD8D8D8'
const AZUL = 'FF0070C0'
const VERDE = 'FF92D050'
const ROJO = 'FFFF0000'
const NEGRO = 'FF000000'
const BLANCO = 'FFFFFFFF'
const FIN_DE_SEMANA = 'FFF4F4F6'
const INK_950 = 'FF0A0A0B'
const INK_100 = 'FFECECEE'
const INK_400 = 'FF8D8D96'
const INK_600 = 'FF51515A'

const FUENTE = 'Calibri'
const CUERPO = 9

/** Formato "Contabilidad" con $: el mismo de la planilla del negocio. */
const FMT_ARS = '_-"$"\\ * #,##0.00_-;\\-"$"\\ * #,##0.00_-;_-"$"\\ * "-"??_-;_-@_-'
const FMT_ENTERO = '#,##0'
const FMT_FECHA = 'dd/mm/yyyy'

const NUMFMT: Record<TipoColumna, string | undefined> = {
  fecha: FMT_FECHA,
  texto: undefined,
  entero: FMT_ENTERO,
  ars: FMT_ARS,
  blanco: undefined,
}

/** Las etiquetas del ÍNDICE. Son las MISMAS de la planilla original (sin tilde):
 *  el formato condicional las busca por texto y así los archivos se mezclan. */
const GANANCIA = 'GANANCIA'
const PERDIDA = 'PERDIDA'

const BORDE_FINO: ExcelJS.Borders = {
  top: { style: 'thin', color: { argb: NEGRO } },
  left: { style: 'thin', color: { argb: NEGRO } },
  bottom: { style: 'thin', color: { argb: NEGRO } },
  right: { style: 'thin', color: { argb: NEGRO } },
  diagonal: {},
}

/**
 * La fecha que va a la celda. ExcelJS pasa el Date a serial POR UTC, así que
 * hay que darle la medianoche UTC del mismo día: si no, la celda queda con una
 * fracción de día colgada (visible al ordenar o al usarla en una fórmula).
 */
function fechaDeCelda(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()))
}

/** A, B, … Z, AA, AB … */
export function letra(col: number): string {
  let n = col
  let out = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    out = String.fromCharCode(65 + resto) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

/** El color del título de cada columna, según qué muestra. */
function fondoTitulo(columna: ColumnaResuelta): string {
  if (columna.id === 'indice') return ROJO
  return columna.familia === 'medios' ? AZUL : GRIS
}

export async function construirXlsx(dataset: DatasetFacturacion): Promise<Blob> {
  const { config, meta } = dataset

  const wb = new ExcelJS.Workbook()
  wb.creator = meta.usuario || 'CelTuc'
  wb.company = 'CelTuc'
  wb.created = meta.generado
  wb.modified = meta.generado
  wb.title = `${meta.titulo} · ${meta.periodo}`
  wb.description = [meta.subtitulo, meta.cuentasTexto].filter(Boolean).join(' · ')

  hojaPlanilla(wb, dataset)
  if (config.xlsx.hojaCuentas && dataset.porCuenta.length) hojaCuentas(wb, dataset)
  if (config.xlsx.hojaComprobantes && dataset.comprobantes.length) hojaComprobantes(wb, dataset)
  if (config.xlsx.hojaComoSeGenero) hojaComoSeGenero(wb, dataset)

  wb.views = [
    { activeTab: 0, x: 0, y: 0, width: 20000, height: 20000, firstSheet: 0, visibility: 'visible' },
  ]

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/* ===================== Hoja principal ===================== */

function hojaPlanilla(wb: ExcelJS.Workbook, dataset: DatasetFacturacion) {
  const { config, columnas, filas, meta, logo } = dataset
  const op = config.xlsx
  const nCols = columnas.length
  const ultima = letra(nCols)

  const nombreHoja = `${capitalizar(nombreMes(config.mes))} ${config.anio}`.slice(0, 31)
  const ws = wb.addWorksheet(nombreHoja, {
    views: [{ showGridLines: !config.banda }],
    properties: { defaultRowHeight: 15 },
    pageSetup: {
      paperSize: 9,
      orientation: nCols > 8 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })

  ws.columns = columnas.map((c) => ({
    width: Math.max(c.ancho, c.label.length + 2),
    style: { font: { name: FUENTE, size: CUERPO } },
  }))

  /* ---- Banda de encabezado (opcional: sin ella la tabla arranca en A1) ---- */
  let fila = 1
  if (config.banda) {
    const sangria = logo ? 7 : 0
    const lineas: Array<{ texto: string; alto: number; font: Partial<ExcelJS.Font> }> = [
      {
        texto: meta.titulo,
        alto: 24,
        font: { name: FUENTE, size: 17, bold: true, color: { argb: INK_950 } },
      },
      {
        texto: [meta.periodo, meta.subtitulo, meta.cuentasTexto].filter(Boolean).join(' · '),
        alto: 15,
        font: { name: FUENTE, size: 10.5, color: { argb: INK_600 } },
      },
      {
        texto:
          `Generado el ${formatoFechaHora(meta.generado)}` +
          `${meta.usuario ? ` por ${meta.usuario}` : ''} · Facturas electrónicas con CAE`,
        alto: 14,
        font: { name: FUENTE, size: 9, color: { argb: INK_400 } },
      },
    ]
    for (const linea of lineas) {
      if (nCols > 1) ws.mergeCells(`A${fila}:${ultima}${fila}`)
      const celda = ws.getCell(fila, 1)
      celda.value = linea.texto
      celda.font = linea.font
      celda.alignment = { vertical: 'middle', horizontal: 'left', indent: sangria }
      ws.getRow(fila).height = linea.alto
      fila += 1
    }

    if (logo) {
      const id = wb.addImage({ base64: logo.split(',')[1], extension: 'jpeg' })
      ws.addImage(id, {
        tl: { col: 0.12, row: 0.25 },
        ext: { width: 46, height: 46 },
        editAs: 'oneCell',
      })
    }

    // Aire entre la banda y la tabla.
    ws.getRow(fila).height = 6
    fila += 1
  }

  /* ---- Fila de títulos ---- */
  const filaTitulos = fila
  const cabecera = ws.getRow(filaTitulos)
  cabecera.height = 26
  columnas.forEach((c, i) => {
    const celda = cabecera.getCell(i + 1)
    celda.value = c.label
    celda.font = { name: FUENTE, size: CUERPO, bold: true, color: { argb: NEGRO } }
    celda.fill = fill(fondoTitulo(c))
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    celda.border = BORDE_FINO
  })
  fila += 1

  /* ---- Datos ---- */
  const indiceCol = new Map(columnas.map((c, i) => [c.id, i + 1]))
  const colTotal = indiceCol.get('total')
  const colIndice = indiceCol.get('indice')
  // Las columnas que suman plata: son las que arma la fórmula del TOTAL.
  const colsDeMedios = columnas
    .map((c, i) => (c.medios?.length ? i + 1 : 0))
    .filter((n) => n > 0)
  const conFormulaTotal = op.formulas && dataset.totalCubierto && colsDeMedios.length > 0

  const primeraDato = fila
  for (const item of filas) {
    const r = ws.getRow(fila)
    columnas.forEach((c, i) => {
      const celda = r.getCell(i + 1)
      celda.value = valorDeCelda(c, item)
      const fmt = NUMFMT[c.tipo]
      if (fmt) celda.numFmt = fmt
      celda.alignment = { vertical: 'middle', horizontal: c.align }
      celda.border = BORDE_FINO
      // Sábados y domingos apenas sombreados: se leen los picos del fin de semana.
      if (op.finesDeSemana && item.finDeSemana) celda.fill = fill(FIN_DE_SEMANA)
    })

    // El TOTAL siempre en verde, como en la planilla del negocio.
    if (colTotal) {
      const celda = r.getCell(colTotal)
      celda.fill = fill(VERDE)
      if (conFormulaTotal) {
        // Sin el "=" adelante: ExcelJS lo agrega solo al escribir la celda.
        const suma = colsDeMedios.map((col) => `${letra(col)}${fila}`).join('+')
        celda.value = { formula: suma, result: item.vacio ? 0 : item.total }
      }
    }

    // El ÍNDICE: la fórmula de siempre contra la meta diaria.
    if (colIndice) {
      const celda = r.getCell(colIndice)
      const texto = indiceDe(item.total, op.metaDiaria)
      if (op.formulas && colTotal) {
        const ref = `${letra(colTotal)}${fila}`
        celda.value = {
          formula: `IF(${ref}>${op.metaDiaria},"${GANANCIA}",IF(${ref}>0,"${PERDIDA}",0))`,
          result: texto,
        }
      } else {
        celda.value = texto
      }
      celda.alignment = { vertical: 'middle', horizontal: 'center' }
    }

    fila += 1
  }
  const ultimaDato = fila - 1

  /* ---- Fila TOTAL del mes ---- */
  if (op.totalGeneral && filas.length) {
    const r = ws.getRow(fila)
    r.height = 18
    columnas.forEach((c, i) => {
      const celda = r.getCell(i + 1)
      celda.font = { name: FUENTE, size: CUERPO, bold: true, color: { argb: INK_950 } }
      celda.fill = fill(INK_100)
      celda.border = {
        ...BORDE_FINO,
        top: { style: 'double', color: { argb: NEGRO } },
      }
      celda.alignment = { vertical: 'middle', horizontal: c.align }

      if (i === 0) {
        celda.value = `TOTAL ${nombreMes(config.mes)}`
        celda.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
        return
      }
      if (c.tipo !== 'ars' && c.tipo !== 'entero') return

      const letraCol = letra(i + 1)
      const rango = `${letraCol}${primeraDato}:${letraCol}${ultimaDato}`
      const total = sumaColumna(c, dataset)
      celda.numFmt = c.tipo === 'ars' ? FMT_ARS : FMT_ENTERO
      celda.value = op.formulas ? { formula: `SUBTOTAL(109,${rango})`, result: total } : total
    })
    fila += 1
  }

  /* ---- Congelado, autofiltro y formato condicional ---- */
  if (op.congelar) {
    ws.views = [
      {
        state: 'frozen',
        ySplit: filaTitulos,
        showGridLines: !config.banda,
        activeCell: `A${filaTitulos + 1}`,
      },
    ]
  }
  if (op.autofiltro && filas.length) {
    ws.autoFilter = {
      from: { row: filaTitulos, column: 1 },
      to: { row: ultimaDato, column: nCols },
    }
  }
  // GANANCIA en verde y PERDIDA en rojo, con las reglas nativas de Excel: si se
  // edita un importe, el color se actualiza solo.
  if (op.resaltarIndice && colIndice && filas.length) {
    const ref = `${letra(colIndice)}${primeraDato}:${letra(colIndice)}${ultimaDato}`
    ws.addConditionalFormatting({
      ref,
      rules: [
        {
          type: 'containsText',
          operator: 'containsText',
          text: GANANCIA,
          priority: 1,
          style: {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE }, bgColor: { argb: VERDE } },
            font: { bold: true, color: { argb: NEGRO } },
          },
        },
        {
          type: 'containsText',
          operator: 'containsText',
          text: PERDIDA,
          priority: 2,
          style: {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO }, bgColor: { argb: ROJO } },
            font: { bold: true, color: { argb: BLANCO } },
          },
        },
      ],
    })
  }

  // Al imprimir, la fila de títulos se repite en todas las hojas.
  ws.pageSetup.printTitlesRow = `${filaTitulos}:${filaTitulos}`
  ws.headerFooter = {
    oddFooter: `&L&"Calibri,Regular"&8${meta.titulo} · ${meta.periodo}&R&"Calibri,Regular"&8Página &P de &N`,
  }
}

/** El valor que va a la celda (la fecha, un número, o nada en los días vacíos). */
function valorDeCelda(columna: ColumnaResuelta, fila: FilaFacturacion): ExcelJS.CellValue {
  if (columna.tipo === 'blanco') return null
  const crudo = columna.valor(fila)
  if (crudo === null) return null
  if (crudo instanceof Date) return fechaDeCelda(crudo)
  // Los días sin facturación quedan VACÍOS (como en la planilla, para anotar
  // a mano encima); un día con actividad muestra sus ceros como «$ -».
  if (typeof crudo === 'number' && fila.vacio) return null
  return crudo as ExcelJS.CellValue
}

/** GANANCIA / PERDIDA / 0, con el mismo criterio que la fórmula. */
function indiceDe(total: number, meta: number): string | number {
  if (total > meta) return GANANCIA
  if (total > 0) return PERDIDA
  return 0
}

/** El total del mes de una columna (para la fila TOTAL y su `result`). */
function sumaColumna(columna: ColumnaResuelta, dataset: DatasetFacturacion): number {
  return dataset.filas.reduce((acc, fila) => {
    const valor = columna.valor(fila)
    return acc + (typeof valor === 'number' ? valor : 0)
  }, 0)
}

/* ===================== Hoja «Por cuenta» ===================== */

/**
 * Una fila por cuenta (CUIT) con lo que entró por cada medio de cobro.
 *
 * Es el corte de conciliación: cada CUIT rinde por separado, así que interesa
 * ver cuánto de lo suyo fue efectivo, transferencia, financiera o tarjeta. Los
 * totales de la última fila cierran con el TOTAL del mes de la planilla.
 */
function hojaCuentas(wb: ExcelJS.Workbook, dataset: DatasetFacturacion) {
  const { porCuenta, meta } = dataset
  const ws = wb.addWorksheet('Por cuenta', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 2 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })

  const titulos: Array<{ label: string; ancho: number; tipo: 'texto' | 'entero' | 'ars' }> = [
    { label: 'Cuenta', ancho: 26, tipo: 'texto' },
    { label: 'CUIT', ancho: 14, tipo: 'texto' },
    { label: 'Condición', ancho: 18, tipo: 'texto' },
    { label: 'PV', ancho: 6, tipo: 'entero' },
    { label: 'Facturas', ancho: 10, tipo: 'entero' },
    { label: 'Efectivo', ancho: 15, tipo: 'ars' },
    { label: 'Transferencia', ancho: 15, tipo: 'ars' },
    { label: 'Transf. financiera', ancho: 16, tipo: 'ars' },
    { label: 'Tarjeta', ancho: 15, tipo: 'ars' },
    { label: 'Otro', ancho: 13, tipo: 'ars' },
    { label: 'Sin informar', ancho: 14, tipo: 'ars' },
    { label: 'TOTAL', ancho: 16, tipo: 'ars' },
    { label: 'Cobrado', ancho: 15, tipo: 'ars' },
    { label: 'Pendiente', ancho: 15, tipo: 'ars' },
  ]

  ws.getCell('A1').value = `Facturación por cuenta · ${meta.periodo}`
  ws.getCell('A1').font = { name: FUENTE, size: 12, bold: true, color: { argb: INK_950 } }
  ws.mergeCells(`A1:${letra(titulos.length)}1`)
  ws.getRow(1).height = 20

  ws.columns = titulos.map((t) => ({
    width: t.ancho,
    style: { font: { name: FUENTE, size: CUERPO } },
  }))

  const cabecera = ws.getRow(2)
  cabecera.height = 24
  titulos.forEach((t, i) => {
    const celda = cabecera.getCell(i + 1)
    celda.value = t.label
    celda.font = { name: FUENTE, size: CUERPO, bold: true, color: { argb: BLANCO } }
    // Los medios de cobro en azul, como en la planilla; el resto en negro.
    celda.fill = fill(i >= 5 && i <= 10 ? AZUL : INK_950)
    celda.alignment = {
      vertical: 'middle',
      horizontal: t.tipo === 'texto' ? 'left' : 'right',
      wrapText: true,
    }
  })

  const CONDICION: Record<string, string> = {
    responsable_inscripto: 'Responsable Inscripto',
    monotributista: 'Monotributista',
  }

  let fila = 3
  const primera = fila
  for (const cuenta of porCuenta) {
    const r = ws.getRow(fila)
    const valores: Array<string | number> = [
      cuenta.nombre,
      cuenta.cuit,
      CONDICION[cuenta.condicion] ?? cuenta.condicion,
      cuenta.punto_venta,
      cuenta.cantidad,
      cuenta.porMedio.efectivo ?? 0,
      cuenta.porMedio.transferencia ?? 0,
      cuenta.porMedio.transf_financiera ?? 0,
      cuenta.porMedio.tarjeta ?? 0,
      cuenta.porMedio.otro ?? 0,
      cuenta.porMedio.sin_medio ?? 0,
      cuenta.total,
      cuenta.cobrado,
      cuenta.pendiente,
    ]
    valores.forEach((valor, i) => {
      const celda = r.getCell(i + 1)
      const tipo = titulos[i].tipo
      celda.value = valor
      if (tipo === 'ars') celda.numFmt = FMT_ARS
      if (tipo === 'entero') celda.numFmt = FMT_ENTERO
      celda.alignment = { vertical: 'middle', horizontal: tipo === 'texto' ? 'left' : 'right' }
      celda.border = { bottom: { style: 'hair', color: { argb: INK_100 } } }
      // El CUIT es un identificador, no un número: se muestra tal cual.
      if (i === 1) celda.numFmt = '@'
      // El TOTAL de la cuenta, en verde como en la planilla.
      if (i === 11) celda.fill = fill(VERDE)
    })
    fila += 1
  }

  /* ---- Fila TOTAL: tiene que cerrar con el total del mes ---- */
  const r = ws.getRow(fila)
  r.height = 18
  titulos.forEach((t, i) => {
    const celda = r.getCell(i + 1)
    celda.font = { name: FUENTE, size: CUERPO, bold: true, color: { argb: INK_950 } }
    celda.fill = fill(INK_100)
    celda.border = { top: { style: 'double', color: { argb: NEGRO } } }
    celda.alignment = { vertical: 'middle', horizontal: t.tipo === 'texto' ? 'left' : 'right' }
    if (i === 0) {
      celda.value = `TOTAL · ${porCuenta.length} ${porCuenta.length === 1 ? 'cuenta' : 'cuentas'}`
      return
    }
    if (t.tipo === 'texto') return
    const col = letra(i + 1)
    const total = porCuenta.reduce((acc, cuenta) => {
      const valores: Record<number, number> = {
        3: cuenta.punto_venta,
        4: cuenta.cantidad,
        5: cuenta.porMedio.efectivo ?? 0,
        6: cuenta.porMedio.transferencia ?? 0,
        7: cuenta.porMedio.transf_financiera ?? 0,
        8: cuenta.porMedio.tarjeta ?? 0,
        9: cuenta.porMedio.otro ?? 0,
        10: cuenta.porMedio.sin_medio ?? 0,
        11: cuenta.total,
        12: cuenta.cobrado,
        13: cuenta.pendiente,
      }
      return acc + (valores[i] ?? 0)
    }, 0)
    // El punto de venta no se suma: es un identificador.
    if (i === 3) return
    celda.numFmt = t.tipo === 'ars' ? FMT_ARS : FMT_ENTERO
    celda.value = { formula: `SUM(${col}${primera}:${col}${fila - 1})`, result: total }
  })
}

/* ===================== Hoja «Comprobantes» ===================== */

function hojaComprobantes(wb: ExcelJS.Workbook, dataset: DatasetFacturacion) {
  const { comprobantes, meta, config } = dataset
  const ws = wb.addWorksheet('Comprobantes', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 2 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  const titulos = [
    { label: 'Fecha', ancho: 12, tipo: 'fecha' as const },
    { label: 'Tipo', ancho: 7, tipo: 'texto' as const },
    { label: 'Número', ancho: 15, tipo: 'texto' as const },
    { label: 'Cuenta', ancho: 24, tipo: 'texto' as const },
    { label: 'CUIT', ancho: 14, tipo: 'texto' as const },
    { label: 'Cliente', ancho: 30, tipo: 'texto' as const },
    { label: 'Medio de cobro', ancho: 18, tipo: 'texto' as const },
    { label: 'Total', ancho: 15, tipo: 'ars' as const },
    { label: 'Estado', ancho: 12, tipo: 'texto' as const },
    { label: 'CAE', ancho: 18, tipo: 'texto' as const },
  ]

  ws.getCell('A1').value = `Comprobantes · ${meta.periodo}`
  ws.getCell('A1').font = { name: FUENTE, size: 12, bold: true, color: { argb: INK_950 } }
  ws.mergeCells(`A1:${letra(titulos.length)}1`)
  ws.getRow(1).height = 20

  ws.columns = titulos.map((t) => ({
    width: t.ancho,
    style: { font: { name: FUENTE, size: CUERPO } },
  }))

  const cabecera = ws.getRow(2)
  cabecera.height = 20
  titulos.forEach((t, i) => {
    const celda = cabecera.getCell(i + 1)
    celda.value = t.label
    celda.font = { name: FUENTE, size: CUERPO, bold: true, color: { argb: BLANCO } }
    celda.fill = fill(INK_950)
    celda.alignment = { vertical: 'middle', horizontal: t.tipo === 'ars' ? 'right' : 'left' }
  })

  let fila = 3
  for (const c of comprobantes) {
    const r = ws.getRow(fila)
    const [anio, mes, dia] = c.fecha.split('-').map(Number)
    const valores: ExcelJS.CellValue[] = [
      new Date(Date.UTC(anio, mes - 1, dia)),
      // Las notas de crédito se marcan («NC B»): su importe va en negativo y
      // sin la marca la columna diría lo mismo que una factura de esa letra.
      c.clase === 'nota_credito' ? `NC ${c.tipo}` : c.tipo,
      c.numero_formateado,
      c.emisor_nombre,
      c.emisor_cuit,
      c.cliente_nombre,
      etiquetaMedio(c),
      c.total,
      c.estado_cobro === 'pagada' ? 'Cobrada' : 'Pendiente',
      c.cae || '—',
    ]
    valores.forEach((valor, i) => {
      const celda = r.getCell(i + 1)
      celda.value = valor
      const tipo = titulos[i].tipo
      if (tipo === 'ars') celda.numFmt = FMT_ARS
      if (tipo === 'fecha') celda.numFmt = FMT_FECHA
      celda.alignment = { vertical: 'middle', horizontal: tipo === 'ars' ? 'right' : 'left' }
      celda.border = { bottom: { style: 'hair', color: { argb: INK_100 } } }
      if (titulos[i].label === 'CUIT') celda.numFmt = '@'
      // Los ocultados de la lista se marcan en gris: el CAE existe igual.
      if (c.oculto) celda.font = { name: FUENTE, size: CUERPO, italic: true, color: { argb: INK_400 } }
    })
    fila += 1
  }

  if (comprobantes.length) {
    // La columna del total es la que dice «Total» en `titulos` (así no se
    // desacopla si mañana se agrega o saca una columna).
    const colTotal = titulos.findIndex((t) => t.label === 'Total') + 1
    const r = ws.getRow(fila)
    r.getCell(1).value = `${comprobantes.length} comprobantes`
    r.getCell(colTotal - 1).value = 'TOTAL'
    const letraTotal = letra(colTotal)
    r.getCell(colTotal).value = {
      formula: `SUM(${letraTotal}3:${letraTotal}${fila - 1})`,
      result: comprobantes.reduce((acc, c) => acc + c.total, 0),
    }
    r.getCell(colTotal).numFmt = FMT_ARS
    for (let i = 1; i <= titulos.length; i++) {
      const celda = r.getCell(i)
      celda.font = { name: FUENTE, size: CUERPO, bold: true, color: { argb: INK_950 } }
      celda.fill = fill(INK_100)
      celda.alignment = { vertical: 'middle', horizontal: i === colTotal ? 'right' : 'left' }
    }
  }

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(2, fila - 1), column: titulos.length } }
  if (config.incluirOcultos) {
    ws.getCell(`A${fila + 2}`).value =
      'Los comprobantes en gris están ocultos de la lista de Facturación; su CAE existe igual.'
    ws.getCell(`A${fila + 2}`).font = { name: FUENTE, size: 8, italic: true, color: { argb: INK_400 } }
  }
}

/**
 * Con qué se cobró, en castellano: «Efectivo» si se informó en la factura,
 * «Efectivo + Tarjeta (de la venta)» si se dedujo del cobro de mostrador, o
 * «Sin informar» si no hay ningún dato.
 */
function etiquetaMedio(c: DatasetFacturacion['comprobantes'][number]): string {
  if (c.medio_pago) return MEDIO_LABEL[c.medio_pago] ?? c.medio_pago
  const medios = Object.entries(c.porMedio)
    .filter(([medio, monto]) => medio !== 'sin_medio' && (monto ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([medio]) => MEDIO_LABEL[medio as keyof typeof MEDIO_LABEL] ?? medio)
  if (!medios.length) return 'Sin informar'
  return `${medios.join(' + ')} (de la venta)`
}

/* ===================== Hoja «Cómo se generó» ===================== */

function hojaComoSeGenero(wb: ExcelJS.Workbook, dataset: DatasetFacturacion) {
  const { meta, columnas, filas, totales } = dataset
  const ws = wb.addWorksheet('Cómo se generó', { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 26, style: { font: { name: FUENTE, size: 10 } } },
    { width: 62, style: { font: { name: FUENTE, size: 10 } } },
  ]

  ws.getCell('A1').value = 'Cómo se generó este archivo'
  ws.getCell('A1').font = { name: FUENTE, size: 13, bold: true, color: { argb: INK_950 } }
  ws.getRow(1).height = 22

  const lineas: Array<[string, string]> = [
    ['Documento', `${meta.titulo} · ${meta.periodo}`],
    ['Generado', formatoFechaHora(meta.generado)],
    ['Por', meta.usuario || '—'],
    ['Cuentas', meta.cuentasTexto],
    ['Renglones', `${filas.length} días`],
    ['Comprobantes', `${totales.cantidad} facturas electrónicas`],
    ['Total del mes', `$ ${Math.round(totales.total).toLocaleString('es-AR')}`],
    ['Columnas', columnas.map((c) => c.label).join(' · ')],
    ...dataset.meta.filtros.map((f): [string, string] => {
      const [clave, ...resto] = f.split(':')
      return resto.length ? [clave.trim(), resto.join(':').trim()] : ['Nota', f]
    }),
  ]

  let fila = 3
  for (const [clave, valor] of lineas) {
    ws.getCell(`A${fila}`).value = clave
    ws.getCell(`A${fila}`).font = { name: FUENTE, size: 10, bold: true, color: { argb: INK_600 } }
    ws.getCell(`A${fila}`).alignment = { vertical: 'top' }
    ws.getCell(`B${fila}`).value = valor
    ws.getCell(`B${fila}`).alignment = { vertical: 'top', wrapText: true }
    fila += 1
  }

  fila += 1
  ws.getCell(`A${fila}`).value =
    'Los importes salen de las facturas electrónicas emitidas con CAE. El medio de cobro es el ' +
    'informado en cada factura; si no se informó, se deduce del cobro real de la venta de ' +
    'mostrador ligada, y si tampoco, queda como «sin informar».'
  ws.mergeCells(`A${fila}:B${fila}`)
  ws.getCell(`A${fila}`).alignment = { wrapText: true, vertical: 'top' }
  ws.getCell(`A${fila}`).font = { name: FUENTE, size: 9, italic: true, color: { argb: INK_400 } }
  ws.getRow(fila).height = 44
}

/* ===================== Utilidades ===================== */

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function formatoFechaHora(fecha: Date): string {
  return fecha.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
