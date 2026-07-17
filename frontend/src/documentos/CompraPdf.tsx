import { Text, View } from '@react-pdf/renderer'
import { BOLD, PdfDocShell, PdfLine } from './kitPdf'
import { BOX, INK, STD_CONTENT_W, pt } from './kit'
import { COMPRA_GARANTIA, COMPRA_LABELS, COMPRA_TITULO, COMPRA_H, type CompraData } from './compraContent'

const LEFT_W = 298
const GAP_W = 101
const RIGHT_W = STD_CONTENT_W - LEFT_W - GAP_W

export function CompraPdf({ datos, direccion }: { datos: CompraData; direccion?: string }) {
  return (
    <PdfDocShell
      titulo={COMPRA_TITULO}
      height={COMPRA_H}
      cupon={datos.cupon}
      dia={datos.fechaDia}
      mes={datos.fechaMes}
      anio={datos.fechaAnio}
      direccion={direccion}
      garantia={COMPRA_GARANTIA}
    >
      <PdfLine label={COMPRA_LABELS.recibiDe} value={`${datos.recibiDe}          ${COMPRA_LABELS.dni}  ${datos.dni}`} height={20} fontSize={pt(10)} />
      <PdfLine label={COMPRA_LABELS.laSuma} value={datos.laSuma} height={20} fontSize={pt(10)} />
      <PdfLine label={COMPRA_LABELS.concepto} value={datos.concepto} height={30} fontSize={pt(10)} />
      <PdfLine label="" value={datos.conceptoExtra} height={20} fontSize={pt(10)} />

      <View style={{ height: 21 }} />

      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: LEFT_W, borderWidth: BOX, borderColor: INK }}>
          <PdfMiniRow label={COMPRA_LABELS.cel} value={datos.cel} divider />
          <PdfMiniRow label={COMPRA_LABELS.mail} value={datos.mail} divider />
          <PdfMiniRow label={COMPRA_LABELS.condicion} value={datos.condicion} divider />
          <PdfMiniRow label={COMPRA_LABELS.imei} value={datos.imei} h={21} />
        </View>
        <View style={{ width: GAP_W }} />
        <View style={{ width: RIGHT_W }}>
          <View style={{ height: 20, borderWidth: BOX, borderColor: INK, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: pt(11), fontFamily: BOLD }}>{COMPRA_LABELS.total}</Text>
          </View>
          <View style={{ height: 61, borderWidth: BOX, borderTopWidth: 0, borderColor: INK, justifyContent: 'center' }}>
            <Text style={{ fontSize: pt(16), fontFamily: BOLD, textAlign: 'center' }}>{datos.total}</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 21 }} />
    </PdfDocShell>
  )
}

function PdfMiniRow({ label, value, divider, h = 20 }: { label: string; value: string; divider?: boolean; h?: number }) {
  return (
    <View
      style={{
        height: h,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: divider ? BOX : 0,
        borderColor: INK,
        paddingHorizontal: 4,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: pt(10), fontFamily: BOLD }}>{label}</Text>
      <Text style={{ fontSize: pt(10), flex: 1 }}>{value}</Text>
    </View>
  )
}
