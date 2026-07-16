import { Text, View } from '@react-pdf/renderer'
import { BOLD, PdfDocShell, PdfLine } from './kitPdf'
import { BOX, INK, STD_CONTENT_W, pt } from './kit'
import { EXT_GARANTIA, EXT_LABELS, EXT_TITULO, EXT_H, type ExtensionData } from './extensionContent'

const LEFT_W = 298
const GAP_W = 101
const RIGHT_W = STD_CONTENT_W - LEFT_W - GAP_W

export function ExtensionPdf({ datos }: { datos: ExtensionData }) {
  return (
    <PdfDocShell
      titulo={EXT_TITULO}
      height={EXT_H}
      cupon={datos.cupon}
      dia={datos.fechaDia}
      mes={datos.fechaMes}
      anio={datos.fechaAnio}
      garantia={EXT_GARANTIA}
    >
      <PdfLine label={EXT_LABELS.recibiDe} value={`${datos.recibiDe}          ${EXT_LABELS.dni}  ${datos.dni}`} height={20} fontSize={pt(10)} />
      <PdfLine label={EXT_LABELS.laSuma} value={datos.laSuma} height={20} fontSize={pt(10)} />
      <PdfLine label={EXT_LABELS.concepto} value={datos.concepto} height={30} fontSize={pt(10)} />
      <PdfLine
        label=""
        value={`${datos.conceptoExtra}   ${EXT_LABELS.porN} ${datos.meses || '______'} ${EXT_LABELS.meses}`}
        height={20}
        fontSize={pt(10)}
      />

      <View style={{ height: 21 }} />

      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: LEFT_W, borderWidth: BOX, borderColor: INK }}>
          <PdfMiniRow label={EXT_LABELS.cel} value={datos.cel} divider />
          <PdfMiniRow label={EXT_LABELS.mail} value={datos.mail} divider />
          <PdfMiniRow label={EXT_LABELS.condicion} value={datos.condicion} divider />
          <PdfMiniRow label={EXT_LABELS.imei} value={datos.imei} h={21} />
        </View>
        <View style={{ width: GAP_W }} />
        <View style={{ width: RIGHT_W }}>
          <View style={{ height: 20, borderWidth: BOX, borderColor: INK, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: pt(11), fontFamily: BOLD }}>{EXT_LABELS.total}</Text>
          </View>
          <View style={{ height: 61, borderWidth: BOX, borderTopWidth: 0, borderColor: INK, justifyContent: 'center' }}>
            <Text style={{ fontSize: pt(16), fontFamily: BOLD, textAlign: 'center' }}>{datos.total}</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 20 }} />
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
