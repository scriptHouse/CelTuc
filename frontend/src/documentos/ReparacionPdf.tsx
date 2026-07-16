import { Text, View } from '@react-pdf/renderer'
import { BOLD, PdfDocShell, PdfLine } from './kitPdf'
import { BOX, INK, STD_CONTENT_W, pt } from './kit'
import { REP_GARANTIA, REP_LABELS, REP_TITULO, REP_H, type ReparacionData } from './reparacionContent'

const LEFT_W = 298
const GAP_W = 101
const RIGHT_W = STD_CONTENT_W - LEFT_W - GAP_W

export function ReparacionPdf({ datos }: { datos: ReparacionData }) {
  return (
    <PdfDocShell
      titulo={REP_TITULO}
      height={REP_H}
      cupon={datos.cupon}
      dia={datos.fechaDia}
      mes={datos.fechaMes}
      anio={datos.fechaAnio}
      garantia={REP_GARANTIA}
    >
      <PdfLine label={REP_LABELS.recibiDe} value={datos.recibiDe} height={20} fontSize={pt(10)} />
      <PdfLine label={REP_LABELS.equipos} value={datos.equipos} height={20} fontSize={pt(10)} />
      <PdfLine label={REP_LABELS.falla} value={datos.falla} height={20} fontSize={pt(10)} />

      <View style={{ height: 14 }} />

      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: LEFT_W, borderWidth: BOX, borderColor: INK }}>
          <PdfMiniRow label={REP_LABELS.cel} value={datos.cel} divider />
          <PdfMiniRow label={REP_LABELS.mail} value={datos.mail} divider />
          <PdfMiniRow label={REP_LABELS.imei} value={datos.imei} />
        </View>
        <View style={{ width: GAP_W }} />
        <View style={{ width: RIGHT_W, borderWidth: BOX, borderColor: INK }}>
          <PdfMiniRow label={REP_LABELS.presupuesto} value={datos.presupuesto} divider />
          <PdfMiniRow label={REP_LABELS.sena} value={datos.sena} divider />
          <PdfMiniRow label={REP_LABELS.pendiente} value={datos.pendiente} />
        </View>
      </View>

      <View style={{ height: 7 }} />
    </PdfDocShell>
  )
}

function PdfMiniRow({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View
      style={{
        height: 20,
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
