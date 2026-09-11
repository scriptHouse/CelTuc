import { Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { BOLD, PdfDocShell, PdfLine } from './kitPdf'
import { BOX, INK, STD_CONTENT_W, pt } from './kit'
import {
  SENA18_CAMPOS_COLOR,
  SENA18_H,
  SENA18_LABELS,
  SENA18_NOTAS,
  SENA18_RUNS_COMPROBANTE,
  SENA18_TITULO,
  type Sena18Data,
} from './sena18Content'

/* Los mismos anchos y altos que `Sena18Paper`: el PDF espeja el preview. */
const ETQ_W = 181
const VAL_W = 220
const CAJA_W = ETQ_W + VAL_W
const ENTREGA_W = 298
const PRECIO_W = 173
const ENTREGA_GAP = STD_CONTENT_W - ENTREGA_W - PRECIO_W
const FILA = 20

export function Sena18Pdf({ datos, direccion }: { datos: Sena18Data; direccion?: string }) {
  return (
    <PdfDocShell
      titulo={SENA18_TITULO}
      height={SENA18_H}
      cupon={datos.cupon}
      dia={datos.fechaDia}
      mes={datos.fechaMes}
      anio={datos.fechaAnio}
      direccion={direccion}
      garantia={SENA18_RUNS_COMPROBANTE}
      garantiaFontSize={pt(10)}
    >
      <PdfLine label={SENA18_LABELS.recibiDe} value={`${datos.recibiDe}          ${SENA18_LABELS.dni}  ${datos.dni}`} height={FILA} fontSize={pt(10)} />
      <PdfLine label={SENA18_LABELS.laSuma} value={datos.laSuma} height={FILA} fontSize={pt(10)} />
      <PdfLine label={SENA18_LABELS.concepto} value={datos.concepto} height={FILA} fontSize={pt(10)} />
      <PdfLine label="" value={datos.conceptoExtra} height={FILA} fontSize={pt(10)} />

      <View style={{ height: FILA }} />

      {/* SEÑA / TIPO DE CAMBIO / SALDO */}
      <View style={{ width: CAJA_W, borderWidth: BOX, borderColor: INK }}>
        <PdfFilaConCaja label={SENA18_LABELS.sena} divider>
          <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{datos.sena}</Text>
        </PdfFilaConCaja>
        <PdfFilaConCaja label={SENA18_LABELS.tipoCambio} divider>
          <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{datos.tipoCambio}</Text>
        </PdfFilaConCaja>
        <PdfFilaConCaja label={SENA18_LABELS.saldo}>
          <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{datos.saldo}</Text>
        </PdfFilaConCaja>
      </View>

      <View style={{ height: FILA }} />
      <PdfNotaBox texto={SENA18_NOTAS.cotizacion} />
      <View style={{ height: FILA }} />

      {/* Equipo que entrega en parte de pago + su precio */}
      <View style={{ height: FILA, flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ width: ENTREGA_W, fontSize: pt(11), fontFamily: BOLD, textAlign: 'center' }}>{SENA18_LABELS.entrega}</Text>
        <View style={{ width: ENTREGA_GAP }} />
        <Text style={{ width: PRECIO_W, fontSize: pt(11), fontFamily: BOLD, textAlign: 'center' }}>{SENA18_LABELS.precio}</Text>
      </View>
      <View style={{ height: FILA, flexDirection: 'row', borderWidth: BOX, borderColor: INK }}>
        <View style={{ width: ENTREGA_W, justifyContent: 'center' }}>
          <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{datos.entrega}</Text>
        </View>
        <View style={{ width: ENTREGA_GAP }} />
        <View style={{ width: PRECIO_W, justifyContent: 'center' }}>
          <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{datos.entregaPrecio}</Text>
        </View>
      </View>

      <View style={{ height: FILA }} />

      {/* Nota de los colores: en el Excel no es una caja, solo una regla arriba */}
      <PdfNotaBox texto={SENA18_NOTAS.colores} soloRegla />

      <View style={{ height: FILA }} />

      {/* COLOR 1 … COLOR 4, por orden de preferencia */}
      <View style={{ width: CAJA_W, borderWidth: BOX, borderColor: INK }}>
        {SENA18_CAMPOS_COLOR.map(({ campo, label }, i) => (
          <PdfFilaConCaja key={campo} label={label} divider={i < SENA18_CAMPOS_COLOR.length - 1}>
            <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{datos[campo]}</Text>
          </PdfFilaConCaja>
        ))}
      </View>

      <View style={{ height: FILA }} />
      <PdfNotaBox texto={SENA18_NOTAS.plazo} />
      {/* Cierra la fila de aire que el `PdfDocShell` arranca con sus 10 px. */}
      <View style={{ height: 10 }} />
    </PdfDocShell>
  )
}

/** Una de las notas del papel. Espeja `NotaBox` del preview (alto automático). */
function PdfNotaBox({ texto, soloRegla }: { texto: string; soloRegla?: boolean }) {
  return (
    <View
      style={
        soloRegla
          ? { borderTopWidth: 1, borderColor: INK, paddingTop: 5 }
          : { borderWidth: BOX, borderColor: INK, paddingVertical: 5, paddingHorizontal: 7 }
      }
    >
      <Text style={{ fontSize: pt(10), lineHeight: 1.28, textAlign: 'justify' }}>{texto}</Text>
    </View>
  )
}

function PdfFilaConCaja({ label, divider, children }: { label: string; divider?: boolean; children: ReactNode }) {
  return (
    <View
      style={{
        height: FILA,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: divider ? BOX : 0,
        borderColor: INK,
      }}
    >
      <View style={{ width: ETQ_W, height: '100%', justifyContent: 'center', borderRightWidth: BOX, borderColor: INK }}>
        <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{label}</Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 4 }}>{children}</View>
    </View>
  )
}
