import { Document, Page, Text, View } from '@react-pdf/renderer'
import { BOLD, PdfBody, PdfCtHeader, PdfLine, PdfPaper, PdfTitle, REG } from './kitPdf'
import { INK, pt } from './kit'
import {
  CV_CARACTERISTICAS,
  CV_CUARTA,
  CV_H,
  CV_INTRO,
  CV_PRIMERA,
  CV_QUINTA,
  CV_SEGUNDA,
  CV_TERCERA,
  CV_TITULO,
  CV_W,
  type Clausula,
  type CompraventaData,
} from './compraventaContent'

const PAD = 24
const CONTENT_W = CV_W - PAD * 2
const M = 28

export function CompraventaPdf({ datos }: { datos: CompraventaData }) {
  return (
    <Document title={`${CV_TITULO} — CelTuc`} author="CelTuc">
      <Page size={[CV_W + M * 2, CV_H + M * 2]} style={{ backgroundColor: '#fff', padding: M }}>
        <PdfPaper width={CV_W} height={CV_H}>
          <PdfTitle>{CV_TITULO}</PdfTitle>
          <PdfBody padL={PAD} padR={PAD}>
            <PdfCtHeader cupon={datos.cupon} dia={datos.fechaDia} mes={datos.fechaMes} anio={datos.fechaAnio} contentW={CONTENT_W} socials="simple" />

            <Text style={parr}>{CV_INTRO}</Text>
            <ClausulaPdf c={CV_PRIMERA} datos={datos} />

            <View style={{ marginTop: 4, marginBottom: 4 }}>
              {CV_CARACTERISTICAS.map((c) => (
                <PdfLine key={c.f} label={c.label} value={datos[c.f]} height={20} />
              ))}
            </View>

            <ClausulaPdf c={CV_SEGUNDA} datos={datos} />
            <ClausulaPdf c={CV_TERCERA} datos={datos} />
            <ClausulaPdf c={CV_CUARTA} datos={datos} />
            <ClausulaPdf c={CV_QUINTA} datos={datos} />

            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 10 }}>
              <FirmaPdf caption="VENDEDOR" />
              <FirmaPdf caption="COMPRADOR" />
            </View>
          </PdfBody>
        </PdfPaper>
      </Page>
    </Document>
  )
}

const parr = { marginTop: 6, fontSize: pt(11), lineHeight: 1.25, textAlign: 'justify' as const }

function ClausulaPdf({ c, datos }: { c: Clausula; datos: CompraventaData }) {
  return (
    <Text style={parr}>
      {c.prefix ? <Text style={{ fontFamily: BOLD }}>{c.prefix}</Text> : null}
      {c.segs.map((s, i) => (
        <Text key={i} style={{ fontFamily: REG }}>
          {'t' in s ? s.t : datos[s.f] || '______'}
        </Text>
      ))}
    </Text>
  )
}

function FirmaPdf({ caption }: { caption: string }) {
  return (
    <View style={{ width: 220, alignItems: 'center' }}>
      <View style={{ borderTopWidth: 1, borderColor: INK, width: '100%', marginBottom: 3 }} />
      <Text style={{ fontSize: pt(11), fontFamily: BOLD }}>{caption}</Text>
    </View>
  )
}
