import { Document, Page, Text, View } from '@react-pdf/renderer'
import { BOLD, PdfBody, PdfCtHeader, PdfGarantia, PdfLine, PdfPaper, PdfTitle } from './kitPdf'
import { BOX, INK, pt } from './kit'
import { COMPRA_GARANTIA, COMPRA_LABELS, COMPRA_TITULO, COMPRA_H, COMPRA_W, type CompraData } from './compraContent'

const PAD = 11
const CONTENT_W = COMPRA_W - PAD * 2
const LEFT_W = 235
const MID_W = 118
const RIGHT_W = CONTENT_W - LEFT_W - MID_W
const M = 28

export function CompraPdf({ datos }: { datos: CompraData }) {
  return (
    <Document title={`${COMPRA_TITULO} — CelTuc`} author="CelTuc">
      <Page size={[COMPRA_W + M * 2, COMPRA_H + M * 2]} style={{ backgroundColor: '#fff', padding: M }}>
        <PdfPaper width={COMPRA_W} height={COMPRA_H}>
          <PdfTitle>{COMPRA_TITULO}</PdfTitle>
          <PdfBody padL={PAD} padR={PAD}>
            <PdfCtHeader cupon={datos.cupon} dia={datos.fechaDia} mes={datos.fechaMes} anio={datos.fechaAnio} contentW={CONTENT_W} />

            <PdfLine label={COMPRA_LABELS.recibiDe} value={datos.recibiDe} />
            {/* DNI + N° TEL */}
            <PdfLine label={COMPRA_LABELS.dni} value={`${datos.dni}        ${COMPRA_LABELS.tel}  ${datos.tel}`} />
            <PdfLine label={COMPRA_LABELS.laSuma} value={datos.laSuma} />
            <PdfLine label={COMPRA_LABELS.concepto} value={datos.concepto} />
            <PdfLine label="" value={datos.conceptoExtra} />
            <PdfLine label="" value={datos.conceptoExtra2} />

            <View style={{ height: 12 }} />

            {/* Sección media */}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: LEFT_W, borderWidth: BOX, borderColor: INK }}>
                <PdfMiniRow label={COMPRA_LABELS.condicion} value={datos.condicion} divider />
                <PdfMiniRow label={COMPRA_LABELS.imei} value={datos.imei} divider />
                <PdfMiniRow label={COMPRA_LABELS.garantia} value={datos.garantia} divider />
                <PdfMiniRow label={COMPRA_LABELS.formaPago} value={datos.formaPago} />
              </View>
              <View style={{ width: MID_W }}>
                <View style={{ height: 18 }} />
                <View style={{ height: 54, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 }}>
                  <Text style={{ fontSize: pt(9), letterSpacing: 1 }}>………………………….</Text>
                  <Text style={{ fontSize: pt(11), fontFamily: BOLD, marginTop: 2 }}>{COMPRA_LABELS.firma}</Text>
                </View>
              </View>
              <View style={{ width: RIGHT_W }}>
                <View style={{ height: 18, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: pt(11), fontFamily: BOLD }}>{COMPRA_LABELS.total}</Text>
                </View>
                <View style={{ height: 54, borderWidth: BOX, borderColor: INK, justifyContent: 'center' }}>
                  <Text style={{ fontSize: pt(14), fontFamily: BOLD, textAlign: 'center' }}>{datos.total}</Text>
                </View>
              </View>
            </View>

            <View style={{ height: 12 }} />

            {/* OBS */}
            <View style={{ borderWidth: BOX, borderColor: INK, minHeight: 36, flexDirection: 'row' }}>
              <Text style={{ fontSize: pt(11), fontFamily: BOLD, paddingVertical: 2, paddingHorizontal: 4 }}>{COMPRA_LABELS.obs}</Text>
              <Text style={{ fontSize: pt(11), flex: 1, paddingTop: 2 }}>{datos.obs}</Text>
            </View>

            <View style={{ height: 12 }} />

            <PdfGarantia runs={COMPRA_GARANTIA} fontSize={pt(6)} />
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
