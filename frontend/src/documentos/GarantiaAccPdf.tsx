import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { BOLD, PAGINA_ISO_STYLE, PdfBody, PdfGarantia, PdfPaper, PdfTitle, paginaISO } from './kitPdf'
import { INK, pt } from './kit'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA, lineaDireccion } from './content'
import { GACC_FECHA_LABEL, GACC_H, GACC_RUNS, GACC_TITULO, GACC_W, type GAccData } from './garantiaAccContent'

const M = 28

export function GarantiaAccPdf({ datos, direccion = EMPRESA.direccion }: { datos: GAccData; direccion?: string }) {
  return (
    <Document title={`${GACC_TITULO} — CelTuc`} author="CelTuc">
      <Page size={paginaISO(GACC_W, GACC_H, M)} style={PAGINA_ISO_STYLE}>
        <PdfPaper width={GACC_W} height={GACC_H}>
          <PdfTitle>{GACC_TITULO}</PdfTitle>
          <PdfBody padL={14} padR={14}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
              <Image src={LOGO_CELTUC} style={{ width: 58, height: 58 }} />
              <View>
                <Text style={{ fontSize: pt(16), fontFamily: BOLD, letterSpacing: 0.8 }}>{EMPRESA.nombre}</Text>
                <Text style={{ fontSize: pt(8), marginTop: 3 }}>{lineaDireccion(direccion)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <Image src={ICON_INSTAGRAM} style={{ width: 14, height: 14 }} />
                  <Text style={{ fontSize: pt(9) }}>{EMPRESA.instagram}</Text>
                  <Image src={ICON_FACEBOOK} style={{ width: 14, height: 14, marginLeft: 4 }} />
                  <Text style={{ fontSize: pt(9) }}>{EMPRESA.facebook}</Text>
                </View>
              </View>
            </View>

            <PdfGarantia runs={GACC_RUNS} fontSize={pt(8)} />

            {/* Pie: fecha y hora de emision, abajo a la derecha (espeja al Paper). */}
            <View
              style={{
                height: 18,
                paddingTop: 5,
                flexDirection: 'row',
                justifyContent: 'flex-end',
                alignItems: 'flex-end',
                gap: 4,
              }}
            >
              <Text style={{ fontSize: pt(8), fontFamily: BOLD, paddingBottom: 1 }}>{GACC_FECHA_LABEL}</Text>
              <View style={{ width: 104, borderBottomWidth: 1, borderColor: INK }}>
                <Text style={{ fontSize: pt(8), textAlign: 'center' }}>{datos.fechaHora}</Text>
              </View>
            </View>
          </PdfBody>
        </PdfPaper>
      </Page>
    </Document>
  )
}
