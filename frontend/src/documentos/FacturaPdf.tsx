import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { Comprobante } from '@/types'
import { CONDICION_LABEL } from '@/lib/afip'
import { money } from '@/lib/format'
import { LOGO_CELTUC } from './assets'

/* ============================================================================
 * Factura electrónica (PDF) — estilo ARCA/AFIP, monocromático.
 * Incluye letra (A/B/C), datos de emisor y cliente, ítems, totales, CAE con su
 * vencimiento y el código QR oficial. Tipografía Helvetica (sin red).
 *
 * Marca: los emisores Responsables Inscriptos (CelTuc) llevan el logo de CelTuc;
 * los Monotributistas NO llevan marca alguna (facturan como terceros, no tienen
 * nada que ver con CelTuc). Ver `mostrarMarca` abajo.
 * ========================================================================== */

const INK = '#0a0a0b'
const MUTED = '#555'
const REG = 'Helvetica'
const BOLD = 'Helvetica-Bold'

// Código de comprobante según la letra (lo que ARCA imprime bajo la letra).
const COD: Record<string, string> = { A: '01', B: '06', C: '11' }
const DOC: Record<string, string> = { CUIT: 'CUIT', CUIL: 'CUIL', DNI: 'DNI', CF: 'Consumidor Final' }

/** Formatea 'yyyy-mm-dd' como dd/mm/aaaa sin desfase de zona horaria. */
function fmtFecha(s?: string | null): string {
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: REG, color: INK, fontSize: 9 },
  frame: { borderWidth: 1, borderColor: INK },

  head: { flexDirection: 'row' },
  headCol: { width: '46%', padding: 10 },
  letterBox: {
    width: '8%',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
  },
  letter: { fontSize: 30, fontFamily: BOLD, lineHeight: 1 },
  cod: { fontSize: 6, marginTop: 2 },

  logo: { width: 44, height: 44, marginBottom: 6 },
  emisorName: { fontSize: 15, fontFamily: BOLD },
  docTitle: { fontSize: 16, fontFamily: BOLD, marginBottom: 6 },
  line: { marginBottom: 2 },
  label: { fontFamily: BOLD },
  muted: { color: MUTED },

  bandTop: { borderTopWidth: 1, borderColor: INK },
  cliente: { padding: 10, borderTopWidth: 1, borderColor: INK },

  // Tabla de ítems
  table: { marginTop: 6 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#bbb' },
  th: { backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderColor: INK, fontFamily: BOLD },
  cDesc: { width: '52%', padding: 4 },
  cCant: { width: '12%', padding: 4, textAlign: 'right' },
  cPrec: { width: '18%', padding: 4, textAlign: 'right' },
  cSub: { width: '18%', padding: 4, textAlign: 'right' },

  totals: { marginTop: 8, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', width: 220, justifyContent: 'space-between', paddingVertical: 1 },
  totalFinal: { fontSize: 12, fontFamily: BOLD, borderTopWidth: 1, borderColor: INK, marginTop: 2, paddingTop: 3 },

  footer: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 14, paddingHorizontal: 10, paddingBottom: 10 },
  qr: { width: 96, height: 96 },
  caeBox: { flex: 1, alignItems: 'flex-end' },
  cae: { fontSize: 13, fontFamily: BOLD },
})

export function FacturaPdf({ c }: { c: Comprobante }) {
  const conIva = c.tipo !== 'C'
  const alic = Number(c.alicuota_iva ?? 21)
  // La marca se decide por el TIPO del comprobante (dato inmutable guardado al
  // emitir), NO por la condición actual de la cuenta ni el usuario logueado: una
  // Factura C siempre fue de un Monotributista (sin marca) y una A/B siempre de un
  // Responsable Inscripto = CelTuc (con logo). Así los PDFs viejos quedan siempre
  // correctos aunque después se cambie la condición de la cuenta.
  const mostrarMarca = c.tipo !== 'C'
  const condicionEmisor = c.tipo === 'C' ? 'Monotributista' : 'Responsable Inscripto'

  return (
    <Document title={`Factura ${c.tipo} ${c.numero_formateado}`} author={c.emisor_nombre || 'Emisor'}>
      <Page size="A4" style={s.page}>
        <View style={s.frame}>
          {/* Encabezado: emisor | letra | comprobante */}
          <View style={s.head}>
            <View style={s.headCol}>
              {mostrarMarca && <Image src={LOGO_CELTUC} style={s.logo} />}
              <Text style={s.emisorName}>{c.emisor_nombre || 'Emisor'}</Text>
              <Text style={[s.line, s.muted, { marginTop: 4 }]}>{condicionEmisor}</Text>
              <Text style={[s.line, s.muted]}>CUIT {c.emisor_cuit || '—'}</Text>
            </View>

            <View style={s.letterBox}>
              <Text style={s.letter}>{c.tipo}</Text>
              <Text style={s.cod}>COD. {COD[c.tipo] ?? ''}</Text>
            </View>

            <View style={[s.headCol, { width: '46%' }]}>
              <Text style={s.docTitle}>FACTURA</Text>
              <Text style={s.line}>
                <Text style={s.label}>Comprobante N°: </Text>
                {c.numero_formateado}
              </Text>
              <Text style={s.line}>
                <Text style={s.label}>Fecha de Emisión: </Text>
                {fmtFecha(c.fecha)}
              </Text>
              <Text style={[s.line, s.muted]}>ORIGINAL</Text>
            </View>
          </View>

          {/* Cliente */}
          <View style={s.cliente}>
            <Text style={s.line}>
              <Text style={s.label}>Cliente: </Text>
              {c.cliente_nombre}
            </Text>
            <Text style={s.line}>
              <Text style={s.label}>Condición frente al IVA: </Text>
              {CONDICION_LABEL[c.cliente_condicion]}
            </Text>
            <Text style={s.line}>
              <Text style={s.label}>{c.cliente_doc_tipo ? DOC[c.cliente_doc_tipo] : 'Documento'}: </Text>
              {c.cliente_doc_numero || '—'}
            </Text>
          </View>

          {/* Ítems */}
          <View style={[s.bandTop, { paddingHorizontal: 10, paddingTop: 8 }]}>
            <View style={s.table}>
              <View style={[s.tr, s.th]}>
                <Text style={s.cDesc}>Descripción</Text>
                <Text style={s.cCant}>Cant.</Text>
                <Text style={s.cPrec}>P. Unitario</Text>
                <Text style={s.cSub}>Subtotal</Text>
              </View>
              {(c.items ?? []).map((it, i) => (
                <View key={it.id ?? i} style={s.tr}>
                  <Text style={s.cDesc}>{it.descripcion}</Text>
                  <Text style={s.cCant}>{Number(it.cantidad)}</Text>
                  <Text style={s.cPrec}>{money(it.precio_unitario)}</Text>
                  <Text style={s.cSub}>{money(Number(it.cantidad) * Number(it.precio_unitario))}</Text>
                </View>
              ))}
            </View>

            {/* Totales */}
            <View style={s.totals}>
              {conIva && (
                <>
                  <View style={s.totalRow}>
                    <Text>Subtotal (neto):</Text>
                    <Text>{money(c.neto ?? 0)}</Text>
                  </View>
                  <View style={s.totalRow}>
                    <Text>IVA ({alic}%):</Text>
                    <Text>{money(c.iva ?? 0)}</Text>
                  </View>
                </>
              )}
              <View style={[s.totalRow, s.totalFinal]}>
                <Text>TOTAL:</Text>
                <Text>{money(c.total)}</Text>
              </View>
              {!conIva && <Text style={[s.muted, { marginTop: 2 }]}>Comprobante C · no discrimina IVA.</Text>}
            </View>

            {c.observaciones ? (
              <Text style={[s.muted, { marginTop: 8 }]}>{c.observaciones}</Text>
            ) : null}
          </View>

          {/* QR + CAE */}
          <View style={s.footer}>
            {c.qr ? <Image src={c.qr} style={s.qr} /> : <View style={s.qr} />}
            <View style={s.caeBox}>
              <Text style={s.label}>CAE N°</Text>
              <Text style={s.cae}>{c.cae || '—'}</Text>
              <Text style={[s.muted, { marginTop: 2 }]}>Vto. CAE: {fmtFecha(c.cae_vencimiento)}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
