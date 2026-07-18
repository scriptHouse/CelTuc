import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { BOLD, PAGINA_ISO_STYLE, PdfLine, PdfPaper, paginaISO } from './kitPdf'
import { BOX, INK, pt } from './kit'
import { LOGO_CELTUC } from './assets'
import { SENA, SENA_H, SENA_W, type SenaData } from './senaContent'

const M = 28

export function SenaPdf({ datos, direccion = SENA.direccion }: { datos: SenaData; direccion?: string }) {
  return (
    <Document title="Comprobante de seña — CelTuc" author="CelTuc">
      <Page size={paginaISO(SENA_W, SENA_H, M)} style={PAGINA_ISO_STYLE}>
        <PdfPaper width={SENA_W} height={SENA_H}>
          <View style={{ flex: 1, padding: '7 16 7 21' }}>
            {/* Encabezado */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Image src={LOGO_CELTUC} style={{ width: 54, height: 54 }} />
                <Text style={{ fontSize: pt(8), marginTop: 3 }}>{direccion}</Text>
              </View>
              <View style={{ width: 226, gap: 5 }}>
                {/* N° RECIBO y FECHA: dos cajas lado a lado (formato nuevo) */}
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  <PdfStackBox label={SENA.numeroRecibo} width={118}>
                    <Text style={{ fontSize: pt(10), textAlign: 'center' }}>{datos.numeroRecibo}</Text>
                  </PdfStackBox>
                  <PdfStackBox label={SENA.fecha} width={103}>
                    <Text style={{ fontSize: pt(10), textAlign: 'center' }}>{datos.fecha}</Text>
                  </PdfStackBox>
                </View>
                <Text style={{ fontSize: pt(8), textAlign: 'center' }}>{SENA.noFactura}</Text>
              </View>
            </View>

            {/* Renglones */}
            <View style={{ marginTop: 6 }}>
              <PdfLine label={SENA.recibiDe} value={`${datos.recibiDe}          ${SENA.tel}  ${datos.tel}`} />
              <PdfLine label={SENA.laSuma} value={datos.laSuma} />
              <PdfLine label={SENA.concepto} value={datos.concepto} />
            </View>

            {/* Pie */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, flex: 1 }}>
              <View style={{ flex: 1 }}>
                <PdfLine label={SENA.valorTotal} value={datos.valorTotal} />
                <Text style={{ fontSize: pt(8), fontFamily: BOLD, marginTop: 5, lineHeight: 1.28 }}>{SENA.disclaimer}</Text>
              </View>
              <View style={{ width: 150, alignItems: 'center' }}>
                <PdfStackBox label={SENA.total} width="100%" valueHeight={24}>
                  <Text style={{ fontSize: pt(12), fontFamily: BOLD, textAlign: 'center' }}>{datos.total}</Text>
                </PdfStackBox>
                <View style={{ marginTop: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: pt(10) }}>{SENA.lineaFirma}</Text>
                  <Text style={{ fontSize: pt(8), fontFamily: BOLD }}>{SENA.firma}</Text>
                </View>
              </View>
            </View>
          </View>
        </PdfPaper>
      </Page>
    </Document>
  )
}

function PdfStackBox({ label, width, valueHeight = 20, children }: { label: string; width: number | string; valueHeight?: number; children: ReactNode }) {
  return (
    <View style={{ width, borderWidth: BOX, borderColor: INK }}>
      <View style={{ borderBottomWidth: BOX, borderColor: INK, paddingVertical: 1 }}>
        <Text style={{ fontSize: pt(10), fontFamily: BOLD, textAlign: 'center' }}>{label}</Text>
      </View>
      <View style={{ height: valueHeight, justifyContent: 'center' }}>{children}</View>
    </View>
  )
}
