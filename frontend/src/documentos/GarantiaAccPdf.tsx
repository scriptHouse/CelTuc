import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { BOLD, PdfBody, PdfGarantia, PdfPaper, PdfTitle } from './kitPdf'
import { pt } from './kit'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA } from './content'
import { GACC_H, GACC_RUNS, GACC_TITULO, GACC_W, type GAccData } from './garantiaAccContent'

const M = 28

export function GarantiaAccPdf(_props: { datos: GAccData }) {
  return (
    <Document title={`${GACC_TITULO} — CelTuc`} author="CelTuc">
      <Page size={[GACC_W + M * 2, GACC_H + M * 2]} style={{ backgroundColor: '#fff', padding: M }}>
        <PdfPaper width={GACC_W} height={GACC_H}>
          <PdfTitle>{GACC_TITULO}</PdfTitle>
          <PdfBody padL={14} padR={14}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
              <Image src={LOGO_CELTUC} style={{ width: 58, height: 58 }} />
              <View>
                <Text style={{ fontSize: pt(16), fontFamily: BOLD, letterSpacing: 0.8 }}>{EMPRESA.nombre}</Text>
                <Text style={{ fontSize: pt(8), marginTop: 3 }}>{EMPRESA.direccion}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <Image src={ICON_INSTAGRAM} style={{ width: 14, height: 14 }} />
                  <Text style={{ fontSize: pt(9) }}>{EMPRESA.instagram}</Text>
                  <Image src={ICON_FACEBOOK} style={{ width: 14, height: 14, marginLeft: 4 }} />
                  <Text style={{ fontSize: pt(9) }}>{EMPRESA.facebook}</Text>
                </View>
              </View>
            </View>

            <PdfGarantia runs={GACC_RUNS} fontSize={pt(8)} />
          </PdfBody>
        </PdfPaper>
      </Page>
    </Document>
  )
}
