import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA } from './content'
import { BOX, FRAME, INK, pt, type Run } from './kit'

/* ============================================================================
 * Kit de primitivas para el PDF (vectorial, @react-pdf). Espeja `kit.tsx`.
 * Tipografía Helvetica (built-in, sin red). ✦
 * ========================================================================== */

export const REG = 'Helvetica'
export const BOLD = 'Helvetica-Bold'

const s = StyleSheet.create({
  paper: { borderWidth: FRAME, borderColor: INK, color: INK, fontFamily: REG },
  title: {
    borderBottomWidth: FRAME,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
})

export function PdfPaper({ width, height, children }: { width: number; height?: number; children: ReactNode }) {
  return <View style={[s.paper, { width, height }]}>{children}</View>
}

export function PdfTitle({ children, height = 26.8, fontSize = pt(14) }: { children: ReactNode; height?: number; fontSize?: number }) {
  return (
    <View style={[s.title, { height }]}>
      <Text style={{ fontSize, fontFamily: BOLD, letterSpacing: 0.3, textAlign: 'center' }}>{children}</Text>
    </View>
  )
}

export function PdfBody({ padL, padR, children }: { padL: number; padR: number; children: ReactNode }) {
  return <View style={{ paddingLeft: padL, paddingRight: padR, flexGrow: 1, flexDirection: 'column' }}>{children}</View>
}

export function PdfGap({ h }: { h: number }) {
  return <View style={{ height: h }} />
}

export function PdfCtHeader({
  cupon,
  dia,
  mes,
  anio,
  contentW,
  socials = 'redes',
  height = 79.8,
}: {
  cupon: string
  dia: string
  mes: string
  anio: string
  contentW: number
  socials?: 'redes' | 'simple'
  height?: number
}) {
  const clusterW = 190
  const labelW = 86
  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: contentW - clusterW, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Image src={LOGO_CELTUC} style={{ width: 64, height: 64 }} />
        <View>
          <Text style={{ fontSize: pt(16), fontFamily: BOLD, letterSpacing: 0.8 }}>{EMPRESA.nombre}</Text>
          <Text style={{ fontSize: pt(8), marginTop: 3 }}>{EMPRESA.direccion}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Image src={ICON_INSTAGRAM} style={{ width: 14, height: 14 }} />
            <Text style={{ fontSize: pt(9) }}>{socials === 'simple' ? 'CelTuc' : EMPRESA.instagram}</Text>
            <Image src={ICON_FACEBOOK} style={{ width: 14, height: 14, marginLeft: 4 }} />
            <Text style={{ fontSize: pt(9) }}>{socials === 'simple' ? 'CelTuc' : EMPRESA.facebook}</Text>
          </View>
        </View>
      </View>

      <View style={{ width: clusterW, justifyContent: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ width: labelW, fontSize: pt(11) }}>CUPON N°</Text>
          <View style={{ flex: 1, height: 20, borderWidth: BOX, borderColor: INK, justifyContent: 'center' }}>
            <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{cupon}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ width: labelW, fontSize: pt(11) }}>FECHA</Text>
          <View style={{ flexDirection: 'row', height: 20, borderWidth: BOX, borderColor: INK }}>
            <PdfDateCell width={30} value={dia} />
            <PdfDateCell width={34} value={mes} divider />
            <PdfDateCell width={34} value={anio} divider />
          </View>
        </View>
      </View>
    </View>
  )
}

function PdfDateCell({ width, value, divider }: { width: number; value: string; divider?: boolean }) {
  return (
    <View style={{ width, justifyContent: 'center', borderLeftWidth: divider ? BOX : 0, borderColor: INK }}>
      <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{value}</Text>
    </View>
  )
}

export function PdfLine({
  label,
  value,
  height = 18.8,
  fontSize = pt(11),
}: {
  label: string
  value: string
  height?: number
  fontSize?: number
}) {
  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end' }}>
      {label ? <Text style={{ fontSize, fontFamily: BOLD, paddingBottom: 2, paddingRight: 6 }}>{label}</Text> : null}
      <View style={{ flex: 1, borderBottomWidth: 1, borderColor: INK }}>
        <Text style={{ fontSize, paddingBottom: 1 }}>{value}</Text>
      </View>
    </View>
  )
}

export function PdfSign({ caption, width }: { caption: string; width?: number }) {
  return (
    <View style={{ width }}>
      <View style={{ borderTopWidth: 1, borderColor: INK, marginTop: 14 }} />
      <Text style={{ fontSize: pt(10), fontFamily: BOLD, textAlign: 'center', marginTop: 2 }}>{caption}</Text>
    </View>
  )
}

export function PdfGarantia({ runs, height, fontSize = pt(7) }: { runs: Run[]; height?: number; fontSize?: number }) {
  return (
    <View
      style={{
        borderWidth: BOX,
        borderColor: INK,
        minHeight: height,
        flexGrow: height === undefined ? 1 : undefined,
        paddingVertical: 3,
        paddingHorizontal: 4,
      }}
    >
      <Text style={{ fontSize, textAlign: 'justify', lineHeight: 1.12 }}>
        {runs.map((run, i) => (
          <Text key={i} style={{ fontFamily: run.bold ? BOLD : REG }}>
            {run.t}
          </Text>
        ))}
      </Text>
    </View>
  )
}
