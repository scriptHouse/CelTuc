import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA } from './content'
import { BOX, FRAME, INK, STD_CONTENT_W, STD_PAD, STD_W, pt, type Run } from './kit'

/* ============================================================================
 * Kit de primitivas para el PDF (vectorial, @react-pdf). Espeja `kit.tsx`.
 * Tipografía Helvetica (built-in, sin red). ✦
 * ========================================================================== */

export const REG = 'Helvetica'
export const BOLD = 'Helvetica-Bold'

/**
 * Tamaño de página (en pt) con la proporción ISO √2 —la misma de A4 y A5— que
 * contiene un contenido de `w × h` con un margen mínimo `m` alrededor.
 *
 * Como A4 y A5 comparten exactamente esta proporción (A5 es una A4 partida al
 * medio), un PDF con esta página sale idéntico y sin deformarse en ambos
 * tamaños: alcanza con imprimir "Ajustar a la página". Elige orientación
 * vertical u horizontal según la forma del contenido.
 */
export function paginaISO(w: number, h: number, m: number): [number, number] {
  const SQRT2 = Math.SQRT2
  const minW = w + 2 * m
  const minH = h + 2 * m
  if (w >= h) {
    // Apaisado: ancho / alto = √2
    const pageH = Math.max(minH, minW / SQRT2)
    return [pageH * SQRT2, pageH]
  }
  // Vertical: alto / ancho = √2
  const pageW = Math.max(minW, minH / SQRT2)
  return [pageW, pageW * SQRT2]
}

/** Estilo de página que centra el contenido dentro de la hoja ISO. */
export const PAGINA_ISO_STYLE = {
  backgroundColor: '#fff',
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
}

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

const HDR_LEFT_W = 399
const HDR_LABEL_W = 85
const HDR_BOX_W = 270

/** Encabezado CelTuc del formato nuevo (filas 2-4). Espeja `CtHeader` del kit HTML. */
export function PdfCtHeader({
  cupon,
  dia,
  mes,
  anio,
  socials = 'redes',
  direccion = EMPRESA.direccion,
}: {
  cupon: string
  dia: string
  mes: string
  anio: string
  socials?: 'redes' | 'simple'
  direccion?: string
}) {
  return (
    <View style={{ height: 60, flexDirection: 'row' }}>
      <View style={{ width: HDR_LEFT_W, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Image src={LOGO_CELTUC} style={{ width: 56, height: 56 }} />
        <View>
          <Text style={{ fontSize: pt(16), fontFamily: BOLD, letterSpacing: 0.8 }}>{EMPRESA.nombre}</Text>
          <Text style={{ fontSize: pt(8), marginTop: 2 }}>{direccion}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Image src={ICON_INSTAGRAM} style={{ width: 13, height: 13 }} />
            <Text style={{ fontSize: pt(9) }}>{socials === 'simple' ? 'CelTuc' : EMPRESA.instagram}</Text>
            <Image src={ICON_FACEBOOK} style={{ width: 13, height: 13, marginLeft: 4 }} />
            <Text style={{ fontSize: pt(9) }}>{socials === 'simple' ? 'CelTuc' : EMPRESA.facebook}</Text>
          </View>
        </View>
      </View>

      <View style={{ width: STD_CONTENT_W - HDR_LEFT_W }}>
        <View style={{ height: 20, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ width: HDR_LABEL_W, fontSize: pt(11), textAlign: 'center' }}>CUPON N°</Text>
          <View style={{ width: HDR_BOX_W, height: 20, borderWidth: BOX, borderColor: INK, justifyContent: 'center' }}>
            <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{cupon}</Text>
          </View>
        </View>
        <View style={{ height: 20, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ width: HDR_LABEL_W, fontSize: pt(11), textAlign: 'center' }}>FECHA</Text>
          <View style={{ width: HDR_BOX_W, flexDirection: 'row', height: 20, borderWidth: BOX, borderColor: INK }}>
            <PdfDateCell flex={96} value={dia} />
            <PdfDateCell flex={96} value={mes} divider />
            <PdfDateCell flex={78} value={anio} divider />
          </View>
        </View>
        <View style={{ height: 20 }} />
      </View>
    </View>
  )
}

function PdfDateCell({ flex, value, divider }: { flex: number; value: string; divider?: boolean }) {
  return (
    <View style={{ flex, justifyContent: 'center', borderLeftWidth: divider ? BOX : 0, borderColor: INK }}>
      <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{value}</Text>
    </View>
  )
}

const SIGN_COL = 326
const SIGN_GAP = STD_CONTENT_W - SIGN_COL * 2
const SIGN_LINE = '________________________________________________'

/** Bloque de firmas al pie: dos columnas balanceadas (línea + leyenda). */
export function PdfFirmaBlock({ izq = 'FIRMA', der = 'ACLARACION' }: { izq?: string; der?: string }) {
  return (
    <View style={{ flexDirection: 'row', paddingBottom: 2 }}>
      <PdfFirmaCol caption={izq} />
      <View style={{ width: SIGN_GAP }} />
      <PdfFirmaCol caption={der} />
    </View>
  )
}

function PdfFirmaCol({ caption }: { caption: string }) {
  return (
    <View style={{ width: SIGN_COL }}>
      <Text style={{ fontSize: pt(8), textAlign: 'center' }}>{SIGN_LINE}</Text>
      <Text style={{ fontSize: pt(8), fontFamily: BOLD, textAlign: 'center', marginTop: 2, letterSpacing: 0.2 }}>{caption}</Text>
    </View>
  )
}

/** Esqueleto PDF de los documentos estándar. Espeja `DocShell` del kit HTML. */
export function PdfDocShell({
  titulo,
  height,
  cupon,
  dia,
  mes,
  anio,
  garantia,
  firmaIzq,
  firmaDer,
  direccion,
  children,
}: {
  titulo: string
  height: number
  cupon: string
  dia: string
  mes: string
  anio: string
  garantia: Run[]
  firmaIzq?: string
  firmaDer?: string
  direccion?: string
  children: ReactNode
}) {
  const M = 28
  return (
    <Document title={`${titulo} — CelTuc`} author="CelTuc">
      <Page size={paginaISO(STD_W, height, M)} style={PAGINA_ISO_STYLE}>
        <PdfPaper width={STD_W} height={height}>
          <PdfTitle height={20} fontSize={pt(10)}>
            {titulo}
          </PdfTitle>
          <PdfBody padL={STD_PAD} padR={STD_PAD}>
            <PdfCtHeader cupon={cupon} dia={dia} mes={mes} anio={anio} direccion={direccion} />
            <PdfGap h={7} />
            {children}
            <PdfGap h={10} />
            <PdfGarantia runs={garantia} fontSize={pt(7)} />
            <PdfGap h={8} />
            <PdfFirmaBlock izq={firmaIzq} der={firmaDer} />
          </PdfBody>
        </PdfPaper>
      </Page>
    </Document>
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
        paddingVertical: 5,
        paddingHorizontal: 7,
      }}
    >
      <Text style={{ fontSize, textAlign: 'justify', lineHeight: 1.28 }}>
        {runs.map((run, i) => (
          <Text key={i} style={{ fontFamily: run.bold ? BOLD : REG }}>
            {run.t}
          </Text>
        ))}
      </Text>
    </View>
  )
}
