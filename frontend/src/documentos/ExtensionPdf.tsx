import { Document, Page, Text, View } from '@react-pdf/renderer'
import { BOLD, PdfBody, PdfCtHeader, PdfGarantia, PdfLine, PdfPaper, PdfTitle } from './kitPdf'
import { BOX, INK, pt } from './kit'
import { EXT_GARANTIA, EXT_LABELS, EXT_TITULO, EXT_H, EXT_W, type ExtensionData } from './extensionContent'

const PAD = 11
const CONTENT_W = EXT_W - PAD * 2
const LEFT_W = 235
const MID_W = 118
const RIGHT_W = CONTENT_W - LEFT_W - MID_W
const M = 28

export function ExtensionPdf({ datos }: { datos: ExtensionData }) {
  return (
    <Document title={`${EXT_TITULO} — CelTuc`} author="CelTuc">
      <Page size={[EXT_W + M * 2, EXT_H + M * 2]} style={{ backgroundColor: '#fff', padding: M }}>
        <PdfPaper width={EXT_W} height={EXT_H}>
          <PdfTitle>{EXT_TITULO}</PdfTitle>
          <PdfBody padL={PAD} padR={PAD}>
            <PdfCtHeader cupon={datos.cupon} dia={datos.fechaDia} mes={datos.fechaMes} anio={datos.fechaAnio} contentW={CONTENT_W} />

            <PdfLine label={EXT_LABELS.nombre} value={datos.nombre} />
            <PdfLine label={EXT_LABELS.dni} value={`${datos.dni}        ${EXT_LABELS.tel}  ${datos.tel}`} />
            {/* SE EXTIENDE ... [días] DIAS EN */}
            <View style={{ minHeight: 18, justifyContent: 'flex-end', paddingBottom: 2 }}>
              <Text style={{ fontSize: pt(11), fontFamily: BOLD }}>
                {`${EXT_LABELS.extiende1}  ${datos.dias || '______'}  ${EXT_LABELS.extiende2}`}
              </Text>
            </View>
            <PdfLine label={EXT_LABELS.concepto} value={datos.concepto} />
            <PdfLine label="" value={datos.conceptoExtra} />

            <View style={{ height: 16 }} />

            {/* TOTAL $ etiqueta */}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: LEFT_W + MID_W }} />
              <View style={{ width: RIGHT_W, alignItems: 'center' }}>
                <Text style={{ fontSize: pt(11), fontFamily: BOLD }}>{EXT_LABELS.total}</Text>
              </View>
            </View>
            {/* Cajas */}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: LEFT_W, borderWidth: BOX, borderColor: INK }}>
                <PdfMiniRow label={EXT_LABELS.imei} value={datos.imei} divider />
                <PdfMiniRow label={EXT_LABELS.vendedor} value={datos.vendedor} divider />
                <PdfMiniRow label={EXT_LABELS.formaPago} value={datos.formaPago} />
              </View>
              <View style={{ width: MID_W, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 }}>
                <Text style={{ fontSize: pt(9), letterSpacing: 1 }}>………………………….</Text>
                <Text style={{ fontSize: pt(11), fontFamily: BOLD, marginTop: 2 }}>{EXT_LABELS.firma}</Text>
              </View>
              <View style={{ width: RIGHT_W, borderWidth: BOX, borderColor: INK, height: 54, justifyContent: 'center' }}>
                <Text style={{ fontSize: pt(14), fontFamily: BOLD, textAlign: 'center' }}>{datos.total}</Text>
              </View>
            </View>

            <View style={{ height: 14 }} />

            <PdfGarantia runs={EXT_GARANTIA} fontSize={pt(8)} />
          </PdfBody>
        </PdfPaper>
      </Page>
    </Document>
  )
}

function PdfMiniRow({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View
      style={{
        height: 18,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: divider ? BOX : 0,
        borderColor: INK,
        paddingHorizontal: 3,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: pt(11), fontFamily: BOLD }}>{label}</Text>
      <Text style={{ fontSize: pt(11), flex: 1 }}>{value}</Text>
    </View>
  )
}
