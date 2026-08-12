/**
 * Exportador de Inventario — generador CSV.
 *
 * Un CSV mal hecho es un archivo que abre mal: acentos rotos, todo en una
 * columna o los números convertidos en fechas. Acá se puede elegir lo que
 * realmente importa para que eso no pase:
 *
 *  · **Delimitador**: el Excel en español espera `;`; una herramienta, `,`.
 *  · **Separador decimal**: coma (Excel es-AR) o punto (pandas, Sheets, SQL).
 *  · **Firma UTF-8 (BOM)**: sin ella Excel abre «Batería» como «BaterÃ­a».
 *  · **Comillas**: las mínimas (RFC 4180) o todas, para parsers estrictos.
 *  · **Fin de línea**: CRLF (Windows/Excel) o LF (todo lo demás).
 *  · **Crudo**: `1234.5` en vez de `$ 1.234,50`, que es lo que quiere un script.
 *
 * Con el modo crudo, delimitador `,` y punto decimal se obtiene un CSV canónico
 * que entra derecho en cualquier análisis.
 */
import { textoCelda, type ColumnaResuelta, type Dataset, type FilaExport } from './datos'
import type { OpcionesCsv } from './tipos'

/* Formateadores del modo legible. El es-AR usa coma decimal y punto de miles;
 * el en-US, al revés. Se elige uno u otro según el separador pedido, en vez de
 * reemplazar caracteres a mano (que daría vuelta también los miles). */
/** Firma UTF-8. Se arma por codigo para que ningun editor la borre al guardar. */
const BOM_UTF8 = String.fromCharCode(0xfeff)

const NUM_EN = new Intl.NumberFormat('en-US')
const ARS_EN = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const USD_EN = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

function textoConPunto(valor: string | number, tipo: ColumnaResuelta['tipo']): string {
  const n = Number(valor)
  if (Number.isNaN(n)) return String(valor)
  if (tipo === 'entero') return NUM_EN.format(n)
  if (tipo === 'ars') return ARS_EN.format(n)
  if (tipo === 'usd') return USD_EN.format(n)
  if (tipo === 'pct') return `${NUM_EN.format(Math.round(n))}%`
  return String(valor)
}

/** Convierte un valor crudo al texto que va a ir en la celda del CSV. */
function celda(columna: ColumnaResuelta, fila: FilaExport, op: OpcionesCsv): string {
  const crudo = columna.valor(fila)
  if (crudo === null || crudo === '') return ''

  if (!op.crudo) {
    const numerica = columna.tipo !== 'texto' && columna.tipo !== 'fecha' && columna.tipo !== 'blanco'
    if (op.decimal === '.' && numerica) return textoConPunto(crudo, columna.tipo)
    return textoCelda(crudo, columna.tipo)
  }

  if (columna.tipo === 'fecha') {
    const d = new Date(String(crudo))
    return Number.isNaN(d.getTime()) ? String(crudo) : d.toISOString()
  }
  if (typeof crudo === 'number') {
    // Sin separador de miles y con el decimal que se pidió: así se parsea solo.
    const texto = Number.isInteger(crudo) ? String(crudo) : String(Number(crudo.toFixed(4)))
    return op.decimal === ',' ? texto.replace('.', ',') : texto
  }
  return String(crudo)
}

/** Escapa un campo según RFC 4180 (comillas dobles, duplicadas adentro). */
function escapar(valor: string, op: OpcionesCsv): string {
  const necesita =
    op.comillas === 'todas' ||
    valor.includes(op.delimitador) ||
    valor.includes('"') ||
    valor.includes('\n') ||
    valor.includes('\r') ||
    // Un espacio al borde se pierde sin comillas.
    valor !== valor.trim()
  if (!necesita) return valor
  return `"${valor.replace(/"/g, '""')}"`
}

/**
 * Arma el texto del CSV. Cuando la exportación está agrupada, cada grupo entra
 * con su fila de título: es lo que hace que el archivo se lea igual que la
 * pantalla. En modo crudo NO se agrupa —una fila de título rompería el parseo—:
 * ahí el grupo viaja como una columna más.
 */
export function construirTextoCsv(dataset: Dataset, opciones?: Partial<OpcionesCsv>): string {
  const op: OpcionesCsv = { ...dataset.config.csv, ...opciones }
  const { columnas } = dataset
  const salto = op.finLinea === 'lf' ? '\n' : '\r\n'
  const lineas: string[] = []

  const agrupar = dataset.agrupado && !op.crudo
  const columnaGrupo = dataset.agrupado && op.crudo

  const fila = (valores: string[]) => valores.map((v) => escapar(v, op)).join(op.delimitador)

  if (op.encabezados) {
    const titulos = columnas.map((c) => c.label)
    if (columnaGrupo) titulos.unshift(etiquetaGrupo(dataset))
    lineas.push(fila(titulos))
  }

  for (const grupo of dataset.grupos) {
    if (agrupar && grupo.titulo) {
      lineas.push(fila([`${grupo.titulo} (${grupo.filas.length})`]))
    }
    for (const item of grupo.filas) {
      const valores = columnas.map((c) => celda(c, item, op))
      if (columnaGrupo) valores.unshift(grupo.titulo)
      lineas.push(fila(valores))
    }
  }

  // El total va al pie y solo en el modo legible: en el crudo ensuciaría los datos.
  if (!op.crudo && dataset.config.xlsx.totalGeneral && dataset.filas.length) {
    const valores = columnas.map((c) => {
      const suma = c.total?.(dataset.totales)
      return suma == null ? '' : textoCelda(suma, c.tipo)
    })
    valores[0] = `TOTAL (${dataset.filas.length} filas)`
    if (columnaGrupo) valores.unshift('')
    lineas.push(fila(valores))
  }

  return lineas.join(salto) + salto
}

function etiquetaGrupo(dataset: Dataset): string {
  if (dataset.config.agruparPor === 'marca') return 'Marca (grupo)'
  if (dataset.config.agruparPor === 'sucursal') return 'Sucursal (grupo)'
  return 'Categoría (grupo)'
}

export function construirCsv(dataset: Dataset): Blob {
  const op = dataset.config.csv
  const texto = construirTextoCsv(dataset)
  // La firma UTF-8 (U+FEFF) va como texto: el Blob la codifica a EF BB BF y
  // Excel la reconoce. Sin ella, «Batería» abre como «BaterÃ­a».
  const contenido = op.bom ? BOM_UTF8 + texto : texto
  return new Blob([contenido], { type: 'text/csv;charset=utf-8' })
}

/**
 * La misma tabla pero separada por tabuladores, para pegar directo en Excel o
 * Google Sheets desde el portapapeles (que es lo que ambos esperan).
 */
export function construirTsvParaPortapapeles(dataset: Dataset): string {
  return construirTextoCsv(dataset, {
    delimitador: '\t',
    comillas: 'minimas',
    bom: false,
    finLinea: 'lf',
  })
}
