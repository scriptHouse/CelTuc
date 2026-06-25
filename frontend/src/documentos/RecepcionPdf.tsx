import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA, GARANTIA_RUNS, LABELS, RECEPCION_TITULO } from './content'
import type { RecepcionData } from './types'
import {
  BOX,
  CONTENT_W,
  DATE_BOX,
  FONT,
  FRAME,
  GAP_W,
  H,
  LABEL_F_W,
  LEFT_BOX_W,
  LOGO,
  NATURAL_W,
  PAD_L,
  PAD_R,
  RIGHT_BOX_W,
  RIGHT_CLUSTER_W,
  SOCIAL_ICON,
} from './layout'

/* ============================================================================
 * Recepción — PDF vectorial (1 px natural = 1 pt). El formulario entra
 * centrado en una hoja A4. Misma estructura que el preview HTML.
 * Tipografía: Helvetica (built-in, sin dependencias de red). ✦
 * ========================================================================== */

const INK = '#0a0a0b'
const REG = 'Helvetica'
const BOLD = 'Helvetica-Bold'

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', paddingHorizontal: (595.28 - NATURAL_W) / 2, paddingVertical: 96 },
  paper: { width: NATURAL_W, borderWidth: FRAME, borderColor: INK, color: INK, fontFamily: REG },
  title: {
    height: H.title,
    borderBottomWidth: FRAME,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  titleText: { fontSize: FONT.title, fontFamily: BOLD, letterSpacing: 0.3 },
  body: { paddingLeft: PAD_L, paddingRight: PAD_R },
  row: { flexDirection: 'row' },
})

export function RecepcionPdf({ datos }: { datos: RecepcionData }) {
  return (
    <Document title="Recepción de equipos — CelTuc" author="CelTuc">
      <Page size="A4" style={s.page}>
        <View style={s.paper}>
          {/* Título */}
          <View style={s.title}>
            <Text style={s.titleText}>{RECEPCION_TITULO}</Text>
          </View>

          <View style={s.body}>
            <Header datos={datos} />

            {/* Renglones */}
            <Line label={LABELS.recibiDe} value={datos.recibiDe} />
            <Line label={LABELS.equipos} value={datos.equipos} />
            <Line label={LABELS.falla} value={datos.falla} />
            <Line label="" value={datos.fallaExtra} />

            <View style={{ height: H.spacer }} />

            {/* OBS */}
            <View style={{ borderWidth: BOX, borderColor: INK, minHeight: H.obsRow * 2, flexDirection: 'row' }}>
              <Text style={{ fontSize: FONT.body, fontFamily: BOLD, paddingVertical: 2, paddingHorizontal: 4 }}>{LABELS.obs}</Text>
              <Text style={{ fontSize: FONT.body, flex: 1, paddingTop: 2, paddingRight: 2 }}>{datos.obs}</Text>
            </View>

            <View style={{ height: H.spacer }} />

            {/* Dos cajas */}
            <View style={{ flexDirection: 'row', gap: GAP_W }}>
              <View style={{ width: LEFT_BOX_W, borderWidth: BOX, borderColor: INK }}>
                <InfoRow label={LABELS.recepciono} value={datos.recepciono} divider />
                <InfoRow label={LABELS.codDesbloqueo} value={datos.codDesbloqueo} divider />
                <InfoRow label={LABELS.tel} value={datos.tel} />
              </View>
              <View style={{ width: RIGHT_BOX_W, borderWidth: BOX, borderColor: INK }}>
                <InfoRow label={LABELS.presupuesto} value={datos.presupuesto} divider />
                <InfoRow label={LABELS.sena} value={datos.sena} divider />
                <InfoRow label={LABELS.pendiente} value={datos.pendiente} />
              </View>
            </View>

            <View style={{ height: H.spacer }} />

            {/* Diagnóstico */}
            <View style={{ borderWidth: BOX, borderColor: INK, minHeight: H.diagRow * 2 }}>
              <View style={{ borderBottomWidth: BOX, borderColor: INK, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ fontSize: FONT.body, fontFamily: BOLD }}>{LABELS.diagnostico}</Text>
              </View>
              <Text style={{ fontSize: FONT.body, paddingHorizontal: 4, paddingTop: 2 }}>{datos.diagnostico}</Text>
            </View>

            <View style={{ height: H.gSpacer }} />

            {/* Garantía */}
            <View style={{ borderWidth: BOX, borderColor: INK, height: H.garantiaRow * 9 + H.garantiaLast, paddingVertical: 3, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: FONT.warranty, textAlign: 'justify', lineHeight: 1.12 }}>
                {GARANTIA_RUNS.map((run, i) => (
                  <Text key={i} style={{ fontFamily: run.bold ? BOLD : REG }}>
                    {run.t}
                  </Text>
                ))}
              </Text>
            </View>

            <View style={{ height: H.bottom }} />
          </View>
        </View>
      </Page>
    </Document>
  )
}

function Header({ datos }: { datos: RecepcionData }) {
  return (
    <View style={{ height: H.header, flexDirection: 'row', alignItems: 'center' }}>
      {/* Identidad */}
      <View style={{ width: CONTENT_W - RIGHT_CLUSTER_W, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Image src={LOGO_CELTUC} style={{ width: LOGO, height: LOGO }} />
        <View>
          <Text style={{ fontSize: FONT.celtuc, fontFamily: BOLD, letterSpacing: 0.8 }}>{EMPRESA.nombre}</Text>
          <Text style={{ fontSize: FONT.address, marginTop: 3 }}>{EMPRESA.direccion}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Image src={ICON_INSTAGRAM} style={{ width: SOCIAL_ICON, height: SOCIAL_ICON }} />
            <Text style={{ fontSize: FONT.social }}>{EMPRESA.instagram}</Text>
            <Image src={ICON_FACEBOOK} style={{ width: SOCIAL_ICON, height: SOCIAL_ICON, marginLeft: 4 }} />
            <Text style={{ fontSize: FONT.social }}>{EMPRESA.facebook}</Text>
          </View>
        </View>
      </View>

      {/* Cupón + Fecha */}
      <View style={{ width: RIGHT_CLUSTER_W, justifyContent: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ width: LABEL_F_W, fontSize: FONT.body }}>{LABELS.cupon}</Text>
          <View style={{ flex: 1, height: 20, borderWidth: BOX, borderColor: INK, justifyContent: 'center' }}>
            <Text style={{ fontSize: FONT.body, textAlign: 'center' }}>{datos.cupon}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ width: LABEL_F_W, fontSize: FONT.body }}>{LABELS.fecha}</Text>
          <View style={{ flexDirection: 'row', height: 20, borderWidth: BOX, borderColor: INK }}>
            <DateCell width={DATE_BOX[0]} value={datos.fechaDia} />
            <DateCell width={DATE_BOX[1]} value={datos.fechaMes} divider />
            <DateCell width={DATE_BOX[2]} value={datos.fechaAnio} divider />
          </View>
        </View>
      </View>
    </View>
  )
}

function DateCell({ width, value, divider }: { width: number; value: string; divider?: boolean }) {
  return (
    <View style={{ width, justifyContent: 'center', borderLeftWidth: divider ? BOX : 0, borderColor: INK }}>
      <Text style={{ fontSize: FONT.body, textAlign: 'center' }}>{value}</Text>
    </View>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ height: H.line, flexDirection: 'row', alignItems: 'flex-end' }}>
      {label ? <Text style={{ fontSize: FONT.body, fontFamily: BOLD, paddingBottom: 2, paddingRight: 6 }}>{label}</Text> : null}
      <View style={{ flex: 1, borderBottomWidth: 1, borderColor: INK }}>
        <Text style={{ fontSize: FONT.body, paddingBottom: 1 }}>{value}</Text>
      </View>
    </View>
  )
}

function InfoRow({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View
      style={{
        height: H.infoRow,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: divider ? BOX : 0,
        borderColor: INK,
        paddingHorizontal: 3,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: FONT.body, fontFamily: BOLD }}>{label}</Text>
      <Text style={{ fontSize: FONT.body, flex: 1 }}>{value}</Text>
    </View>
  )
}
