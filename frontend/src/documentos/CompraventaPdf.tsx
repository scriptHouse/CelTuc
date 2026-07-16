import { Document, Page, Text, View } from '@react-pdf/renderer'
import { BOLD, PdfBody, PdfCtHeader, PdfLine, PdfPaper, PdfTitle, REG } from './kitPdf'
import { STD_PAD, STD_W, pt } from './kit'
import {
  CV_CARACTERISTICAS,
  CV_CUARTA,
  CV_FIRMAS,
  CV_H,
  CV_INTRO,
  CV_PRIMERA,
  CV_QUINTA,
  CV_SEGUNDA,
  CV_SEXTA,
  CV_TERCERA,
  CV_TITULO,
  type Clausula,
  type CompraventaData,
} from './compraventaContent'

const M = 28

export function CompraventaPdf({ datos }: { datos: CompraventaData }) {
  return (
    <Document title={`${CV_TITULO} — CelTuc`} author="CelTuc">
      <Page size={[STD_W + M * 2, CV_H + M * 2]} style={{ backgroundColor: '#fff', padding: M }}>
        <PdfPaper width={STD_W} height={CV_H}>
          <PdfTitle height={20} fontSize={pt(10)}>
            {CV_TITULO}
          </PdfTitle>
          <PdfBody padL={STD_PAD} padR={STD_PAD}>
            <PdfCtHeader cupon={datos.cupon} dia={datos.fechaDia} mes={datos.fechaMes} anio={datos.fechaAnio} />

            <Text style={parr}>{CV_INTRO}</Text>
            <ClausulaPdf c={CV_PRIMERA} datos={datos} />

            <View style={{ marginTop: 2 }}>
              {CV_CARACTERISTICAS.map((c) => (
                <PdfLine key={c.f} label={c.label} value={datos[c.f]} height={20} fontSize={pt(10)} />
              ))}
            </View>

            <ClausulaPdf c={CV_SEGUNDA} datos={datos} />
            <ClausulaPdf c={CV_TERCERA} datos={datos} />
            <ClausulaPdf c={CV_CUARTA} datos={datos} />
            <ClausulaPdf c={CV_QUINTA} datos={datos} />
            <ClausulaPdf c={CV_SEXTA} datos={datos} />

            <View style={{ flex: 1 }} />
            <FirmaFilaPdf izq={CV_FIRMAS.firmaIzq} der={CV_FIRMAS.firmaDer} />
            <View style={{ height: 6 }} />
            <FirmaFilaPdf izq={CV_FIRMAS.aclaracionIzq} der={CV_FIRMAS.aclaracionDer} valorDer={CV_FIRMAS.aclaracionDerValor} />
            <View style={{ height: 6 }} />
          </PdfBody>
        </PdfPaper>
      </Page>
    </Document>
  )
}

const parr = { marginTop: 5, fontSize: pt(10), lineHeight: 1.22, textAlign: 'justify' as const }

function ClausulaPdf({ c, datos }: { c: Clausula; datos: CompraventaData }) {
  return (
    <Text style={parr}>
      <Text style={{ fontFamily: BOLD }}>{c.prefix}</Text>
      {c.segs.map((s, i) => (
        <Text key={i} style={{ fontFamily: REG }}>
          {'t' in s ? s.t : datos[s.f] || '______'}
        </Text>
      ))}
    </Text>
  )
}

function FirmaFilaPdf({ izq, der, valorDer }: { izq: string; der: string; valorDer?: string }) {
  const linea = '_____________________________________________'
  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ width: 298 }}>
        <Text style={{ fontSize: pt(10), textAlign: 'center' }}>{linea}</Text>
        <Text style={{ fontSize: pt(10), fontFamily: BOLD, textAlign: 'center', marginTop: 1 }}>{izq}</Text>
      </View>
      <View style={{ width: 101 }} />
      <View style={{ width: 277 }}>
        <Text style={{ fontSize: pt(10), fontFamily: valorDer ? BOLD : REG, textAlign: 'center' }}>{valorDer ?? linea}</Text>
        <Text style={{ fontSize: pt(10), fontFamily: BOLD, textAlign: 'center', marginTop: 1 }}>{der}</Text>
      </View>
    </View>
  )
}
