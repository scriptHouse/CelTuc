import { Text, View } from '@react-pdf/renderer'
import { BOLD, PdfDocShell, PdfLine } from './kitPdf'
import { BOX, INK, STD_CONTENT_W, pt } from './kit'
import { MAY_GARANTIA, MAY_LABELS, MAY_TITULO, MAY_H, type MayoristaData } from './mayoristaContent'

const LEFT_W = 298
const GAP_W = 101
const RIGHT_W = STD_CONTENT_W - LEFT_W - GAP_W
const IMEI_H = [21, 21, 20, 20, 20, 21]

export function MayoristaPdf({ datos }: { datos: MayoristaData }) {
  return (
    <PdfDocShell
      titulo={MAY_TITULO}
      height={MAY_H}
      cupon={datos.cupon}
      dia={datos.fechaDia}
      mes={datos.fechaMes}
      anio={datos.fechaAnio}
      garantia={MAY_GARANTIA}
    >
      <PdfLine label={MAY_LABELS.recibiDe} value={`${datos.recibiDe}          ${MAY_LABELS.dni}  ${datos.dni}`} height={20} fontSize={pt(10)} />
      <PdfLine label={MAY_LABELS.celular} value={`${datos.celular}          ${MAY_LABELS.laSuma}  ${datos.laSuma}`} height={20} fontSize={pt(10)} />
      <PdfLine label={MAY_LABELS.concepto} value={datos.concepto} height={30} fontSize={pt(10)} />

      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: LEFT_W, borderWidth: BOX, borderColor: INK }}>
          {IMEI_H.map((h, i) => (
            <PdfImeiRow key={i} h={h} value={datos.imeis[i] ?? ''} divider={i < 5} />
          ))}
        </View>
        <View style={{ width: GAP_W }} />
        <View style={{ width: RIGHT_W }}>
          <View style={{ borderWidth: BOX, borderColor: INK }}>
            {[21, 21, 20, 20].map((h, i) => (
              <PdfImeiRow key={i} h={h} value={datos.imeis[6 + i] ?? ''} divider={i < 3} />
            ))}
          </View>
          <View style={{ height: 20, borderWidth: BOX, borderTopWidth: 0, borderColor: INK, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: pt(11), fontFamily: BOLD }}>{MAY_LABELS.total}</Text>
          </View>
          <View style={{ height: 21, borderWidth: BOX, borderTopWidth: 0, borderColor: INK, justifyContent: 'center' }}>
            <Text style={{ fontSize: pt(12), fontFamily: BOLD, textAlign: 'center' }}>{datos.total}</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 21 }} />
    </PdfDocShell>
  )
}

function PdfImeiRow({ h, value, divider }: { h: number; value: string; divider?: boolean }) {
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
      <Text style={{ fontSize: pt(10), fontFamily: BOLD }}>{MAY_LABELS.imei}</Text>
      <Text style={{ fontSize: pt(10), flex: 1 }}>{value}</Text>
    </View>
  )
}
