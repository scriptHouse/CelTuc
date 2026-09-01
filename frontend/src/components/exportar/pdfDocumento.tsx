/**
 * Exportador genérico de gestores — generador PDF (@react-pdf, vectorial).
 *
 * Un informe para imprimir y firmar, no una captura de pantalla:
 *  · Portada con logo, título, fecha, usuario y los filtros usados.
 *  · Banda de indicadores (filas + columnas totalizables).
 *  · Tabla agrupada con la fila de títulos REPETIDA en cada hoja y renglones
 *    que nunca se parten al medio.
 *  · Subtotales por grupo y total general.
 *  · Marca de agua opcional (BORRADOR / CONFIDENCIAL), «Página X de Y» al pie.
 *
 * Tipografía Helvetica (built-in): no baja fuentes de la red, así que el PDF se
 * genera igual sin internet.
 */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { EMPRESA } from '@/documentos/content'
import { textoCeldaTabla, type ColumnaResueltaTabla, type DatasetTabla, type TotalesTabla } from './datos'

const INK = '#0A0A0B'
const INK_600 = '#51515A'
const INK_400 = '#8D8D96'
const INK_200 = '#D9D9DD'
const INK_100 = '#ECECEE'
const BANDA = '#FAFAFB'
const BLANCO = '#FFFFFF'

const REG = 'Helvetica'
const BOLD = 'Helvetica-Bold'

const NUM = new Intl.NumberFormat('es-AR')

interface Metrica {
  fuente: number
  fuenteTitulo: number
  padY: number
}

function metricasDe(densidad: 'compacta' | 'comoda'): Metrica {
  return densidad === 'compacta'
    ? { fuente: 6.8, fuenteTitulo: 6.6, padY: 2.2 }
    : { fuente: 8, fuenteTitulo: 7.4, padY: 3.8 }
}

const s = StyleSheet.create({
  page: { fontFamily: REG, color: INK, paddingTop: 22, paddingBottom: 34, paddingHorizontal: 24 },
  runningHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 0.5,
    borderBottomColor: INK_200,
    paddingBottom: 3,
    marginBottom: 10,
  },
  runningTexto: { fontSize: 6.5, color: INK_400, letterSpacing: 0.4 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  titulo: { fontSize: 17, fontFamily: BOLD, letterSpacing: -0.2 },
  subtitulo: { fontSize: 8.5, color: INK_600, marginTop: 2 },
  metaLinea: { fontSize: 7, color: INK_400, marginTop: 3 },
  filtros: { fontSize: 6.8, color: INK_400, marginTop: 1.5 },
  kpis: { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 10 },
  kpi: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 0.5,
    borderColor: INK_200,
    borderRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  kpiLabel: { fontSize: 5.8, color: INK_400, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValor: { fontSize: 10.5, fontFamily: BOLD, marginTop: 1.5 },
  thead: { flexDirection: 'row', backgroundColor: INK, paddingVertical: 4 },
  th: { color: BLANCO, fontFamily: BOLD, paddingHorizontal: 3 },
  grupo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: INK_100,
    paddingVertical: 3,
    paddingHorizontal: 4,
    marginTop: 6,
  },
  grupoTitulo: { fontSize: 8, fontFamily: BOLD, textTransform: 'uppercase', letterSpacing: 0.4 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: INK_100 },
  td: { paddingHorizontal: 3 },
  totalFila: { flexDirection: 'row', borderTopWidth: 0.8, borderTopColor: INK, backgroundColor: BANDA },
  totalGeneral: { flexDirection: 'row', borderTopWidth: 1.4, borderTopColor: INK, backgroundColor: INK_100 },
  pie: {
    position: 'absolute',
    bottom: 14,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: INK_200,
    paddingTop: 4,
  },
  pieTexto: { fontSize: 6.5, color: INK_400 },
  marcaAgua: {
    position: 'absolute',
    top: '42%',
    left: 0,
    right: 0,
    alignItems: 'center',
    transform: 'rotate(-28deg)',
  },
  marcaAguaTexto: { fontSize: 76, fontFamily: BOLD, color: INK, opacity: 0.06, letterSpacing: 4 },
})

/* ===================== Piezas ===================== */

function MarcaAgua({ texto }: { texto: string }) {
  return (
    <View style={s.marcaAgua} fixed>
      <Text style={s.marcaAguaTexto}>{texto.toUpperCase()}</Text>
    </View>
  )
}

function RunningHead<T>({ dataset }: { dataset: DatasetTabla<T> }) {
  const { meta } = dataset
  return (
    <View style={s.runningHead} fixed>
      <Text style={s.runningTexto}>
        {EMPRESA.nombre} · {meta.titulo.toUpperCase()}
      </Text>
      <Text style={s.runningTexto}>{meta.alcanceTexto}</Text>
    </View>
  )
}

function Pie<T>({ dataset }: { dataset: DatasetTabla<T> }) {
  const { config, meta } = dataset
  return (
    <View style={s.pie} fixed>
      <Text style={s.pieTexto}>
        {config.pdf.pie ? `${EMPRESA.nombre} · ${EMPRESA.direccion} · ${EMPRESA.instagram}` : ' '}
      </Text>
      {config.pdf.numeroPagina && (
        <Text
          style={s.pieTexto}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      )}
      <Text style={s.pieTexto}>{meta.generado.toLocaleDateString('es-AR')}</Text>
    </View>
  )
}

function Hero<T>({ dataset }: { dataset: DatasetTabla<T> }) {
  const { meta, logo, filas } = dataset
  const cuando = meta.generado.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return (
    <View style={s.hero}>
      {logo ? <Image src={logo} style={{ width: 40, height: 40 }} /> : null}
      <View style={{ flexGrow: 1 }}>
        <Text style={s.titulo}>{meta.titulo}</Text>
        {meta.subtitulo ? <Text style={s.subtitulo}>{meta.subtitulo}</Text> : null}
        <Text style={s.metaLinea}>
          {meta.alcanceTexto} · {NUM.format(filas.length)} filas · generado el {cuando}
          {meta.usuario ? ` por ${meta.usuario}` : ''}
        </Text>
        <Text style={s.filtros}>Filtros: {meta.contexto.join(' · ')}</Text>
      </View>
    </View>
  )
}

/** Filas + hasta cuatro columnas totalizables, formateadas por su tipo. */
function Kpis<T>({ dataset }: { dataset: DatasetTabla<T> }) {
  const { totales, columnas } = dataset
  const items: Array<[string, string]> = [['Filas', NUM.format(totales.n)]]
  for (const c of columnas) {
    if (items.length >= 5) break
    if (!(c.id in totales.sumas)) continue
    items.push([c.label, textoCeldaTabla(totales.sumas[c.id], c.tipo)])
  }
  return (
    <View style={s.kpis}>
      {items.map(([label, valor]) => (
        <View key={label} style={s.kpi}>
          <Text style={s.kpiLabel}>{label}</Text>
          <Text style={s.kpiValor}>{valor}</Text>
        </View>
      ))}
    </View>
  )
}

/** Anchos en porcentaje: el peso de cada columna repartido sobre el total. */
function anchosDe<T>(columnas: ColumnaResueltaTabla<T>[]): string[] {
  const total = columnas.reduce((acc, c) => acc + c.peso, 0) || 1
  return columnas.map((c) => `${((c.peso / total) * 100).toFixed(3)}%`)
}

function FilaTabla<T>({
  fila,
  columnas,
  anchos,
  metrica,
  banda,
}: {
  fila: T
  columnas: ColumnaResueltaTabla<T>[]
  anchos: string[]
  metrica: Metrica
  banda: boolean
}) {
  return (
    <View style={[s.tr, banda ? { backgroundColor: BANDA } : {}]} wrap={false}>
      {columnas.map((c, i) => (
        <Text
          key={c.id}
          style={[
            s.td,
            {
              width: anchos[i],
              fontSize: metrica.fuente,
              textAlign: c.align,
              paddingVertical: metrica.padY,
            },
          ]}
        >
          {textoCeldaTabla(c.valor(fila), c.tipo)}
        </Text>
      ))}
    </View>
  )
}

function FilaTotal<T>({
  etiqueta,
  totales,
  columnas,
  anchos,
  metrica,
  general,
}: {
  etiqueta: string
  totales: TotalesTabla
  columnas: ColumnaResueltaTabla<T>[]
  anchos: string[]
  metrica: Metrica
  general?: boolean
}) {
  return (
    <View style={general ? s.totalGeneral : s.totalFila} wrap={false}>
      {columnas.map((c, i) => {
        const suma = i === 0 || !(c.id in totales.sumas) ? null : totales.sumas[c.id]
        return (
          <Text
            key={c.id}
            style={[
              s.td,
              {
                width: anchos[i],
                fontSize: metrica.fuente,
                fontFamily: BOLD,
                textAlign: i === 0 ? 'left' : c.align,
                paddingVertical: metrica.padY,
              },
            ]}
          >
            {i === 0 ? etiqueta : suma == null ? '' : textoCeldaTabla(suma, c.tipo)}
          </Text>
        )
      })}
    </View>
  )
}

/* ===================== Documento ===================== */

export function TablaPdf<T>({ dataset }: { dataset: DatasetTabla<T> }) {
  const { config, columnas, grupos, totales, meta } = dataset
  const op = config.pdf
  const metrica = metricasDe(op.densidad)
  const anchos = anchosDe(columnas)

  // Apaisado cuando la tabla es ancha: más de seis columnas en vertical entran
  // apretadas y la primera columna se corta.
  const orientacion =
    op.orientacion === 'auto'
      ? columnas.length > 6
        ? 'landscape'
        : 'portrait'
      : op.orientacion === 'apaisado'
        ? 'landscape'
        : 'portrait'

  const cuando = meta.generado.toLocaleDateString('es-AR')

  return (
    <Document
      title={`${meta.titulo} · ${cuando}`}
      author={meta.usuario || EMPRESA.nombre}
      subject={[meta.subtitulo, ...meta.contexto].filter(Boolean).join(' · ')}
      creator={`${EMPRESA.nombre} · Sistema de gestión`}
      producer={`${EMPRESA.nombre} · Sistema de gestión`}
    >
      <Page size={op.tamano} orientation={orientacion} style={s.page}>
        {op.marcaAgua.trim() ? <MarcaAgua texto={op.marcaAgua.trim()} /> : null}
        <RunningHead dataset={dataset} />
        <Hero dataset={dataset} />
        {op.kpis && <Kpis dataset={dataset} />}

        <View>
          <View style={s.thead} fixed>
            {columnas.map((c, i) => (
              <Text
                key={c.id}
                style={[
                  s.th,
                  { width: anchos[i], fontSize: metrica.fuenteTitulo, textAlign: c.align },
                ]}
              >
                {c.corto}
              </Text>
            ))}
          </View>

          {grupos.map((grupo, indice) => (
            <View key={grupo.clave || 'todo'} break={op.saltoPorGrupo && indice > 0}>
              {dataset.agrupado && (
                <View style={s.grupo} wrap={false}>
                  <Text style={s.grupoTitulo}>{grupo.titulo}</Text>
                  <Text style={{ fontSize: 7.5, color: INK_600 }}>
                    {NUM.format(grupo.filas.length)} filas
                  </Text>
                </View>
              )}
              {grupo.filas.map((fila, i) => (
                <FilaTabla
                  key={i}
                  fila={fila}
                  columnas={columnas}
                  anchos={anchos}
                  metrica={metrica}
                  banda={op.bandas && i % 2 === 1}
                />
              ))}
              {dataset.agrupado && op.subtotales && (
                <FilaTotal
                  etiqueta={`Subtotal ${grupo.titulo}`}
                  totales={grupo.totales}
                  columnas={columnas}
                  anchos={anchos}
                  metrica={metrica}
                />
              )}
            </View>
          ))}

          {op.totalGeneral && dataset.filas.length > 0 && (
            <FilaTotal
              etiqueta={`TOTAL · ${NUM.format(dataset.filas.length)} filas`}
              totales={totales}
              columnas={columnas}
              anchos={anchos}
              metrica={metrica}
              general
            />
          )}
        </View>

        {dataset.filas.length === 0 && (
          <Text style={{ fontSize: 9, color: INK_400, marginTop: 20, textAlign: 'center' }}>
            No hay filas para exportar.
          </Text>
        )}

        <Pie dataset={dataset} />
      </Page>
    </Document>
  )
}
