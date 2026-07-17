import { Document, Page, Text, View } from '@react-pdf/renderer'
import { BOLD, PdfBody, PdfCtHeader, PdfPaper, PdfTitle, REG } from './kitPdf'
import { INK, STD_CONTENT_W, STD_PAD, STD_W, pt } from './kit'
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
const LH = 1.5
const CLAUSE_GAP = 11
const LABEL_COL = 58
const SIGN_COL = 326
const SIGN_GAP = STD_CONTENT_W - SIGN_COL * 2

export function CompraventaPdf({ datos, direccion }: { datos: CompraventaData; direccion?: string }) {
  return (
    <Document title={`${CV_TITULO} — CelTuc`} author="CelTuc">
      <Page size={[STD_W + M * 2, CV_H + M * 2]} style={{ backgroundColor: '#fff', padding: M }}>
        <PdfPaper width={STD_W} height={CV_H}>
          <PdfTitle height={20} fontSize={pt(10)}>
            {CV_TITULO}
          </PdfTitle>
          <PdfBody padL={STD_PAD} padR={STD_PAD}>
            <PdfCtHeader cupon={datos.cupon} dia={datos.fechaDia} mes={datos.fechaMes} anio={datos.fechaAnio} direccion={direccion} />

            <Text style={{ ...parr, marginTop: 10 }}>{CV_INTRO}</Text>
            <ClausulaPdf c={CV_PRIMERA} datos={datos} />

            {/* Características del equipo: bloque alineado y sangrado */}
            <View style={{ marginTop: 7, marginBottom: 3, paddingLeft: 14 }}>
              {CV_CARACTERISTICAS.map((c, i) => {
                const label = limpiarEtiqueta(c.label)
                const largo = i === CV_CARACTERISTICAS.length - 1
                return (
                  <View key={c.f} style={{ height: 21, flexDirection: 'row', alignItems: 'flex-end' }}>
                    <Text
                      style={{
                        width: largo ? undefined : LABEL_COL,
                        fontFamily: BOLD,
                        fontSize: pt(10),
                        paddingBottom: 2,
                        paddingRight: largo ? 8 : 0,
                      }}
                    >
                      {label}
                    </Text>
                    <View style={{ flex: 1, borderBottomWidth: 1, borderColor: INK }}>
                      <Text style={{ fontSize: pt(10), paddingBottom: 1 }}>{datos[c.f]}</Text>
                    </View>
                  </View>
                )
              })}
            </View>

            <ClausulaPdf c={CV_SEGUNDA} datos={datos} />
            <ClausulaPdf c={CV_TERCERA} datos={datos} />
            <ClausulaPdf c={CV_CUARTA} datos={datos} />
            <ClausulaPdf c={CV_QUINTA} datos={datos} />
            <ClausulaPdf c={CV_SEXTA} datos={datos} />

            <View style={{ flex: 1, minHeight: 28 }} />
            <FirmaFilaPdf izq={CV_FIRMAS.firmaIzq} der={CV_FIRMAS.firmaDer} />
            <View style={{ height: 18 }} />
            <FirmaFilaPdf izq={CV_FIRMAS.aclaracionIzq} der={CV_FIRMAS.aclaracionDer} valorDer={CV_FIRMAS.aclaracionDerValor} />
            <View style={{ height: 6 }} />
          </PdfBody>
        </PdfPaper>
      </Page>
    </Document>
  )
}

function limpiarEtiqueta(label: string): string {
  return label.replace(/^\W+/, '').trim()
}

const parr = { marginTop: CLAUSE_GAP, fontSize: pt(10), lineHeight: LH, textAlign: 'justify' as const }

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
  const linea = '________________________________________________'
  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ width: SIGN_COL }}>
        <Text style={{ fontSize: pt(10), textAlign: 'center' }}>{linea}</Text>
        <Text style={{ fontSize: pt(10), fontFamily: BOLD, textAlign: 'center', marginTop: 2 }}>{izq}</Text>
      </View>
      <View style={{ width: SIGN_GAP }} />
      <View style={{ width: SIGN_COL }}>
        <Text style={{ fontSize: pt(10), fontFamily: valorDer ? BOLD : REG, textAlign: 'center' }}>{valorDer ?? linea}</Text>
        <Text style={{ fontSize: pt(10), fontFamily: BOLD, textAlign: 'center', marginTop: 2 }}>{der}</Text>
      </View>
    </View>
  )
}
