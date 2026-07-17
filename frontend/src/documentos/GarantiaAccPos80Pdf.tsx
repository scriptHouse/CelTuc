import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA } from './content'
import { GACC_RUNS, GACC_TITULO } from './garantiaAccContent'

/* ============================================================================
 * Garantía de accesorios — versión TICKET para impresora térmica POS80 (80mm).
 *
 * La página mide exactamente 80mm de ancho; el contenido vive dentro de los
 * 72mm imprimibles (4mm de margen a cada lado, que es el área no imprimible
 * típica de las térmicas de 80mm). El alto es fijo y ajustado al contenido, así
 * al imprimir a "tamaño real" (100%) en el POS80 sale exacto y sin recortes.
 *
 * Todo en negro sólido (sin grises ni líneas finas grises) para térmica.
 * ========================================================================== */

const MM = 72 / 25.4 // puntos por milímetro (1mm = 2.8346pt)
const W = 80 * MM // 226.77pt (ancho del papel)
const PAD = 4 * MM // 11.34pt de margen lateral → contenido de 72mm

/** Alto del ticket (pt). Ajustado para que el contenido entre justo. */
export const POS80_H = 300

const REG = 'Helvetica'
const BOLD = 'Helvetica-Bold'

export function GarantiaAccPos80Pdf({ direccion = EMPRESA.direccion }: { direccion?: string }) {
  return (
    <Document title="Garantía de accesorios (POS80) — CelTuc" author="CelTuc">
      <Page
        size={[W, POS80_H]}
        style={{ backgroundColor: '#fff', paddingHorizontal: PAD, paddingTop: 8, paddingBottom: 10, fontFamily: REG, color: '#000' }}
      >
        {/* Encabezado centrado */}
        <View style={{ alignItems: 'center' }}>
          <Image src={LOGO_CELTUC} style={{ width: 42, height: 42 }} />
          <Text style={{ fontSize: 13, fontFamily: BOLD, letterSpacing: 1.5, marginTop: 4 }}>{EMPRESA.nombre}</Text>
          <Text style={{ fontSize: 7.5, marginTop: 2 }}>{direccion}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Image src={ICON_INSTAGRAM} style={{ width: 8, height: 8 }} />
            <Text style={{ fontSize: 7.5, marginLeft: 2, marginRight: 6 }}>{EMPRESA.instagram}</Text>
            <Image src={ICON_FACEBOOK} style={{ width: 8, height: 8 }} />
            <Text style={{ fontSize: 7.5, marginLeft: 2 }}>{EMPRESA.facebook}</Text>
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderColor: '#000', marginTop: 6, marginBottom: 6 }} />

        {/* Título */}
        <Text style={{ fontSize: 10.5, fontFamily: BOLD, textAlign: 'center', marginBottom: 5 }}>{GACC_TITULO}</Text>

        {/* Texto de garantía */}
        <Text style={{ fontSize: 8, textAlign: 'justify', lineHeight: 1.35 }}>
          {GACC_RUNS.map((r, i) => (
            <Text key={i} style={{ fontFamily: r.bold ? BOLD : REG }}>
              {r.t}
            </Text>
          ))}
        </Text>

        <View style={{ borderTopWidth: 1, borderColor: '#000', marginTop: 8 }} />
      </Page>
    </Document>
  )
}
