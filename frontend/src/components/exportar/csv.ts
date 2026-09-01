/**
 * Exportador genérico de gestores — generador CSV.
 *
 * Las mismas decisiones que el CSV de Inventario, porque son las que hacen que
 * el archivo abra bien:
 *  · **Delimitador**: el Excel en español espera `;`; una herramienta, `,`.
 *  · **Separador decimal**: coma (Excel es-AR) o punto (pandas, Sheets, SQL).
 *  · **Firma UTF-8 (BOM)**: sin ella Excel abre «Batería» como «BaterÃ­a».
 *  · **Comillas**: las mínimas (RFC 4180) o todas, para parsers estrictos.
 *  · **Fin de línea**: CRLF (Windows/Excel) o LF (todo lo demás).
 *  · **Crudo**: `1234.5` y fechas ISO, que es lo que quiere un script.
 *
 * En modo crudo NO se agrupan las filas (una fila de título rompería el
 * parseo): el grupo viaja como una columna más.
 */
import { textoCeldaTabla, type ColumnaResueltaTabla, type DatasetTabla } from './datos'
import type { OpcionesCsvTabla } from './tipos'

/** Firma UTF-8. Se arma por código para que ningún editor la borre al guardar. */
const BOM_UTF8 = String.fromCharCode(0xfeff)

const NUM_EN = new Intl.NumberFormat('en-US')
const DEC_EN = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ARS_EN = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const USD_EN = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

function textoConPunto(valor: string | number, tipo: ColumnaResueltaTabla['tipo']): string {
  const n = Number(valor)
  if (Number.isNaN(n)) return String(valor)
  if (tipo === 'entero') return NUM_EN.format(n)
  if (tipo === 'decimal') return DEC_EN.format(n)
  if (tipo === 'ars') return ARS_EN.format(n)
  if (tipo === 'usd') return USD_EN.format(n)
  if (tipo === 'pct') return `${NUM_EN.format(Math.round(n))}%`
  return String(valor)
}

/** Convierte un valor crudo al texto que va a ir en la celda del CSV. */
function celda<T>(columna: ColumnaResueltaTabla<T>, fila: T, op: OpcionesCsvTabla): string {
  const crudo = columna.valor(fila)
  if (crudo === null || crudo === '') return ''

  if (!op.crudo) {
    const numerica =
      columna.tipo !== 'texto' && columna.tipo !== 'fecha' && columna.tipo !== 'fechahora'
    if (op.decimal === '.' && numerica) return textoConPunto(crudo, columna.tipo)
    return textoCeldaTabla(crudo, columna.tipo)
  }

  if (columna.tipo === 'fecha' || columna.tipo === 'fechahora') {
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
function escapar(valor: string, op: OpcionesCsvTabla): string {
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
 * con su fila de título (así el archivo se lee igual que la pantalla); en modo
 * crudo el grupo viaja como una columna más.
 */
export function construirTextoCsvTabla<T>(
  dataset: DatasetTabla<T>,
  opciones?: Partial<OpcionesCsvTabla>,
): string {
  const op: OpcionesCsvTabla = { ...dataset.config.csv, ...opciones }
  const { columnas } = dataset
  const salto = op.finLinea === 'lf' ? '\n' : '\r\n'
  const lineas: string[] = []

  const agrupar = dataset.agrupado && !op.crudo
  const columnaGrupo = dataset.agrupado && op.crudo

  const fila = (valores: string[]) => valores.map((v) => escapar(v, op)).join(op.delimitador)

  if (op.encabezados) {
    const titulos = columnas.map((c) => c.label)
    if (columnaGrupo) titulos.unshift(dataset.grupoLabel || 'Grupo')
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

  return lineas.join(salto) + salto
}

export function construirCsvTabla<T>(dataset: DatasetTabla<T>): Blob {
  const op = dataset.config.csv
  const texto = construirTextoCsvTabla(dataset)
  // La firma UTF-8 (U+FEFF) va como texto: el Blob la codifica a EF BB BF y
  // Excel la reconoce. Sin ella, «Batería» abre como «BaterÃ­a».
  const contenido = op.bom ? BOM_UTF8 + texto : texto
  return new Blob([contenido], { type: 'text/csv;charset=utf-8' })
}

/**
 * La misma tabla pero separada por tabuladores, para pegar directo en Excel o
 * Google Sheets desde el portapapeles (que es lo que ambos esperan).
 */
export function construirTsvTabla<T>(dataset: DatasetTabla<T>): string {
  return construirTextoCsvTabla(dataset, {
    delimitador: '\t',
    comillas: 'minimas',
    bom: false,
    finLinea: 'lf',
  })
}
