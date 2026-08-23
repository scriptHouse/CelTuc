import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { BOLD, PAGINA_ISO_STYLE, PdfPaper, PdfTitle, REG, paginaISO } from './kitPdf'
import { BOX, INK, pt } from './kit'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA, lineaDireccion } from './content'
import {
  CUOTAS_LABELS,
  EQUIPO_H,
  EQUIPO_LABELS,
  EQUIPO_TITULO,
  EQUIPO_W,
  FINANCIACION_TITULO,
  NOTA_EQUIPO,
  NOTA_SERVICE,
  SERVICE_H,
  SERVICE_LABELS,
  SERVICE_TITULO,
  SERVICE_W,
  SIN_PLANES,
  calcularCuotas,
  comoNumero,
  dolares,
  pesos,
  totalesEquipo,
  totalesService,
  type PlanPresupuesto,
  type PresupuestoEquipoData,
  type PresupuestoServiceData,
} from './presupuestoComun'

/**
 * Los dos presupuestos en PDF (vectorial, @react-pdf). Espeja pieza por pieza a
 * `PresupuestoPaper.tsx`: mismas medidas, mismos rótulos y —clave— el MISMO
 * cálculo (`presupuestoComun.ts`), así lo que se ve en pantalla es exactamente
 * lo que se imprime.
 */

const PAD = 14
const M = 28

/**
 * Alto de una celda con texto de 11 pt. @react-pdf RECORTA lo que no entra en
 * una caja de alto fijo (a diferencia del HTML, que lo deja desbordar), y el
 * renglón de 11 pt mide ~17,6 px: con el borde de la caja hacen falta 22.
 * Menos que esto y el valor desaparece sin avisar.
 */
const FILA_H = 22

/* ===================== Piezas compartidas ===================== */

function PdfCabecera({
  filas,
  direccion = EMPRESA.direccion,
}: {
  filas: Array<{ label: string; valor: string }>
  direccion?: string
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Image src={LOGO_CELTUC} style={{ width: 56, height: 56 }} />
        <View>
          <Text style={{ fontSize: pt(16), fontFamily: BOLD, letterSpacing: 0.8 }}>{EMPRESA.nombre}</Text>
          <Text style={{ fontSize: pt(8), marginTop: 2 }}>{lineaDireccion(direccion)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Image src={ICON_INSTAGRAM} style={{ width: 13, height: 13 }} />
            <Text style={{ fontSize: pt(9) }}>{EMPRESA.instagram}</Text>
            <Image src={ICON_FACEBOOK} style={{ width: 13, height: 13, marginLeft: 4 }} />
            <Text style={{ fontSize: pt(9) }}>{EMPRESA.facebook}</Text>
          </View>
        </View>
      </View>
      <View style={{ width: 330 }}>
        {filas.map(({ label, valor }) => (
          <View key={label} style={{ height: FILA_H, flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <Text style={{ width: 118, fontSize: pt(9), fontFamily: BOLD, textAlign: 'right', paddingRight: 6 }}>
              {label}
            </Text>
            <View
              style={{
                flex: 1,
                height: FILA_H,
                borderWidth: BOX,
                borderColor: INK,
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: pt(11), textAlign: 'center' }}>{valor}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function PdfRotulo({ children, align }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <Text style={{ fontSize: pt(9), fontFamily: BOLD, letterSpacing: 0.3, paddingBottom: 2, textAlign: align }}>
      {children}
    </Text>
  )
}

function PdfCaja({
  children,
  width,
  height = 22,
}: {
  children: ReactNode
  width?: number | string
  height?: number
}) {
  return (
    <View
      style={{
        width,
        height,
        borderWidth: BOX,
        borderColor: INK,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 5,
      }}
    >
      {children}
    </View>
  )
}

/**
 * Celda de la tabla de cuotas. El divisor vertical va en la View (que ocupa
 * todo el alto de la fila) y no en el Text: si no, la línea sale del alto de
 * la palabra y la tabla queda con rayitas sueltas en vez de columnas.
 */
function PdfCeldaCuota({
  ancho,
  texto,
  negrita,
  centro,
  divisor,
}: {
  ancho?: number
  texto: string
  negrita?: boolean
  centro?: boolean
  divisor?: boolean
}) {
  return (
    <View
      style={{
        width: ancho,
        flex: ancho ? undefined : 1,
        height: '100%',
        justifyContent: 'center',
        borderLeftWidth: divisor ? BOX : 0,
        borderColor: INK,
      }}
    >
      <Text
        style={{
          fontSize: pt(10),
          fontFamily: negrita ? BOLD : REG,
          textAlign: centro ? 'center' : 'left',
          paddingHorizontal: 6,
        }}
      >
        {texto}
      </Text>
    </View>
  )
}

function PdfTablaCuotas({ base, planes }: { base: number; planes: PlanPresupuesto[] }) {
  const filas = calcularCuotas(base, planes)
  return (
    <View style={{ borderWidth: BOX, borderColor: INK }}>
      <View
        style={{
          flexDirection: 'row',
          height: FILA_H,
          alignItems: 'center',
          borderBottomWidth: BOX,
          borderColor: INK,
        }}
      >
        <PdfCeldaCuota ancho={250} texto={CUOTAS_LABELS.cuota} negrita />
        <PdfCeldaCuota texto={CUOTAS_LABELS.total} negrita centro divisor />
        <PdfCeldaCuota texto={CUOTAS_LABELS.valor} negrita centro divisor />
      </View>
      {filas.length === 0 ? (
        <View style={{ height: 42, justifyContent: 'center' }}>
          <Text style={{ fontSize: pt(9), textAlign: 'center' }}>{SIN_PLANES}</Text>
        </View>
      ) : (
        filas.map((fila, i) => (
          <View
            key={`${fila.etiqueta}-${fila.cuotas}`}
            style={{
              flexDirection: 'row',
              height: FILA_H,
              alignItems: 'center',
              borderTopWidth: i === 0 ? 0 : 1,
              borderColor: INK,
            }}
          >
            <PdfCeldaCuota ancho={250} texto={fila.etiqueta} />
            <PdfCeldaCuota texto={pesos(fila.total)} centro divisor />
            <PdfCeldaCuota texto={pesos(fila.valorCuota)} negrita centro divisor />
          </View>
        ))
      )}
    </View>
  )
}

function PdfFinanciacion({
  base,
  planes,
  tarjeta,
}: {
  base: number
  planes: PlanPresupuesto[]
  tarjeta: string
}) {
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 3 }}>
        <Text style={{ flex: 1, fontSize: pt(9), fontFamily: BOLD, letterSpacing: 0.3 }}>
          {FINANCIACION_TITULO}
        </Text>
        <Text style={{ fontSize: pt(9), fontFamily: BOLD }}>{CUOTAS_LABELS.tarjeta}</Text>
        <PdfCaja width={190} height={FILA_H}>
          <Text style={{ fontSize: pt(11) }}>{tarjeta}</Text>
        </PdfCaja>
      </View>
      <PdfTablaCuotas base={base} planes={planes} />
    </>
  )
}

function PdfNota({ texto }: { texto: string }) {
  return (
    <View style={{ borderWidth: BOX, borderColor: INK, paddingVertical: 5, paddingHorizontal: 7 }}>
      <Text style={{ fontSize: pt(8), lineHeight: 1.3, textAlign: 'justify' }}>{texto}</Text>
    </View>
  )
}

/** Renglón "cosa + precio en dólares" (Equipo y Entrega). */
function PdfFilaEquipo({
  label,
  labelPrecio,
  valor,
  precio,
}: {
  label: string
  labelPrecio: string
  valor: string
  precio: string
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <PdfRotulo>{label}</PdfRotulo>
        <PdfCaja>
          <Text style={{ fontSize: pt(11) }}>{valor}</Text>
        </PdfCaja>
      </View>
      <View style={{ width: 150 }}>
        <PdfRotulo align="right">{labelPrecio}</PdfRotulo>
        <PdfCaja>
          <Text style={{ fontSize: pt(10) }}>US$</Text>
          <Text style={{ flex: 1, fontSize: pt(11), textAlign: 'right' }}>{comoNumero(precio)}</Text>
        </PdfCaja>
      </View>
    </View>
  )
}

function PdfFilaTotal({
  label,
  valor,
  destacado,
  extra,
}: {
  label: string
  valor: string
  destacado?: boolean
  extra?: string
}) {
  return (
    <View style={{ height: 26, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8 }}>
      <Text style={{ fontSize: pt(10), fontFamily: BOLD }}>{label}</Text>
      <View style={{ flex: 1 }} />
      {extra ? <Text style={{ fontSize: pt(9) }}>{extra}</Text> : null}
      <Text
        style={{
          fontSize: destacado ? pt(14) : pt(11),
          fontFamily: BOLD,
          minWidth: 130,
          textAlign: 'right',
        }}
      >
        {valor}
      </Text>
    </View>
  )
}

/* ===================== Presupuesto de equipo ===================== */

export function PresupuestoEquipoPdf({
  datos,
  direccion,
}: {
  datos: PresupuestoEquipoData
  direccion?: string
}) {
  const { totalUsd, totalPesos, cotizacion } = totalesEquipo(datos)
  return (
    <Document title={`Presupuesto de equipo — ${EMPRESA.nombre}`} author={EMPRESA.nombre}>
      <Page size={paginaISO(EQUIPO_W, EQUIPO_H, M)} style={PAGINA_ISO_STYLE}>
        <PdfPaper width={EQUIPO_W} height={EQUIPO_H}>
          <PdfTitle height={20} fontSize={pt(10)}>
            {EQUIPO_TITULO}
          </PdfTitle>
          <View style={{ flex: 1, paddingTop: 8, paddingBottom: 10, paddingHorizontal: PAD }}>
            <PdfCabecera
              direccion={direccion}
              filas={[
                { label: EQUIPO_LABELS.numero, valor: datos.numero },
                { label: EQUIPO_LABELS.fecha, valor: datos.fecha },
                { label: EQUIPO_LABELS.vendedor, valor: datos.vendedor },
              ]}
            />

            <View style={{ height: 8 }} />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <PdfRotulo>{EQUIPO_LABELS.cliente}</PdfRotulo>
                <PdfCaja>
                  <Text style={{ fontSize: pt(11) }}>{datos.cliente}</Text>
                </PdfCaja>
              </View>
              <View style={{ width: 210 }}>
                <PdfRotulo>{EQUIPO_LABELS.telefono}</PdfRotulo>
                <PdfCaja>
                  <Text style={{ fontSize: pt(11) }}>{datos.telefono}</Text>
                </PdfCaja>
              </View>
            </View>

            <View style={{ height: 7 }} />
            <PdfFilaEquipo
              label={EQUIPO_LABELS.equipo}
              labelPrecio={EQUIPO_LABELS.precio}
              valor={datos.equipo}
              precio={datos.precioUsd}
            />

            <View style={{ height: 7 }} />
            <View style={{ width: 220 }}>
              <PdfRotulo>{EQUIPO_LABELS.condicion}</PdfRotulo>
              <PdfCaja>
                <Text style={{ fontSize: pt(11) }}>{datos.condicion}</Text>
              </PdfCaja>
            </View>

            <View style={{ height: 7 }} />
            <PdfFilaEquipo
              label={EQUIPO_LABELS.entrega}
              labelPrecio={EQUIPO_LABELS.precio}
              valor={datos.entrega}
              precio={datos.entregaUsd}
            />

            <View style={{ height: 7 }} />
            <PdfRotulo>{EQUIPO_LABELS.observaciones}</PdfRotulo>
            <View style={{ height: 46, borderWidth: BOX, borderColor: INK, padding: 3 }}>
              <Text style={{ fontSize: pt(10), lineHeight: 1.15 }}>{datos.observaciones}</Text>
            </View>

            <View style={{ height: 10 }} />
            <View style={{ borderWidth: BOX, borderColor: INK }}>
              <View
                style={{
                  height: 20,
                  borderBottomWidth: BOX,
                  borderColor: INK,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: pt(10), fontFamily: BOLD, textAlign: 'center', letterSpacing: 0.5 }}>
                  {EQUIPO_LABELS.totalTitulo}
                </Text>
              </View>
              <PdfFilaTotal label={EQUIPO_LABELS.totalUsd} valor={dolares(totalUsd)} />
              <PdfFilaTotal
                label={EQUIPO_LABELS.totalPesos}
                valor={pesos(totalPesos)}
                destacado
                extra={cotizacion > 0 ? `${EQUIPO_LABELS.dolar} ${datos.dolar}` : undefined}
              />
            </View>

            <View style={{ height: 10 }} />
            <PdfFinanciacion base={totalPesos} planes={datos.planes} tarjeta={datos.tarjeta} />

            <View style={{ flex: 1, minHeight: 6 }} />
            <PdfNota texto={NOTA_EQUIPO} />
          </View>
        </PdfPaper>
      </Page>
    </Document>
  )
}

/* ===================== Presupuesto de service ===================== */

export function PresupuestoServicePdf({
  datos,
  direccion,
}: {
  datos: PresupuestoServiceData
  direccion?: string
}) {
  const { lista } = totalesService(datos)
  return (
    <Document title={`Presupuesto de service — ${EMPRESA.nombre}`} author={EMPRESA.nombre}>
      <Page size={paginaISO(SERVICE_W, SERVICE_H, M)} style={PAGINA_ISO_STYLE}>
        <PdfPaper width={SERVICE_W} height={SERVICE_H}>
          <PdfTitle height={20} fontSize={pt(10)}>
            {SERVICE_TITULO}
          </PdfTitle>
          <View style={{ flex: 1, paddingTop: 8, paddingBottom: 10, paddingHorizontal: PAD }}>
            <PdfCabecera
              direccion={direccion}
              filas={[
                { label: SERVICE_LABELS.numero, valor: datos.numero },
                { label: SERVICE_LABELS.fecha, valor: datos.fecha },
                { label: SERVICE_LABELS.recepciono, valor: datos.recepciono },
              ]}
            />

            <View style={{ height: 8 }} />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <PdfRotulo>{SERVICE_LABELS.cliente}</PdfRotulo>
                <PdfCaja>
                  <Text style={{ fontSize: pt(11) }}>{datos.cliente}</Text>
                </PdfCaja>
              </View>
              <View style={{ width: 210 }}>
                <PdfRotulo>{SERVICE_LABELS.telefono}</PdfRotulo>
                <PdfCaja>
                  <Text style={{ fontSize: pt(11) }}>{datos.telefono}</Text>
                </PdfCaja>
              </View>
            </View>

            <View style={{ height: 7 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <PdfRotulo>{SERVICE_LABELS.equipo}</PdfRotulo>
                <PdfCaja>
                  <Text style={{ fontSize: pt(11) }}>{datos.equipo}</Text>
                </PdfCaja>
              </View>
              <View style={{ width: 210 }}>
                <PdfRotulo>{SERVICE_LABELS.pin}</PdfRotulo>
                <PdfCaja>
                  <Text style={{ fontSize: pt(11) }}>{datos.pin}</Text>
                </PdfCaja>
              </View>
            </View>

            <View style={{ height: 7 }} />
            <PdfRotulo>{SERVICE_LABELS.reparacion}</PdfRotulo>
            <View style={{ height: 52, borderWidth: BOX, borderColor: INK, padding: 3 }}>
              <Text style={{ fontSize: pt(10), lineHeight: 1.15 }}>{datos.reparacion}</Text>
            </View>

            <View style={{ height: 7 }} />
            <PdfRotulo>{SERVICE_LABELS.obs}</PdfRotulo>
            <View style={{ height: 46, borderWidth: BOX, borderColor: INK, padding: 3 }}>
              <Text style={{ fontSize: pt(10), lineHeight: 1.15 }}>{datos.obs}</Text>
            </View>

            <View style={{ height: 10 }} />
            <View style={{ flexDirection: 'row', borderWidth: BOX, borderColor: INK, height: 48 }}>
              <View style={{ width: 190, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ fontSize: pt(11), fontFamily: BOLD }}>{SERVICE_LABELS.total}</Text>
              </View>
              <PdfCeldaPrecio label={SERVICE_LABELS.precioLista} valor={datos.precioLista} />
              <PdfCeldaPrecio label={SERVICE_LABELS.precioContado} valor={datos.precioContado} destacado />
            </View>

            <View style={{ height: 10 }} />
            <PdfFinanciacion base={lista} planes={datos.planes} tarjeta={datos.tarjeta} />

            <View style={{ flex: 1, minHeight: 6 }} />
            <PdfNota texto={NOTA_SERVICE} />
          </View>
        </PdfPaper>
      </Page>
    </Document>
  )
}

function PdfCeldaPrecio({
  label,
  valor,
  destacado,
}: {
  label: string
  valor: string
  destacado?: boolean
}) {
  return (
    <View
      style={{
        flex: 1,
        borderLeftWidth: BOX,
        borderColor: INK,
        justifyContent: 'center',
        paddingHorizontal: 8,
      }}
    >
      <Text style={{ fontSize: pt(8), fontFamily: BOLD, letterSpacing: 0.3 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
        <Text style={{ fontSize: pt(destacado ? 12 : 10), fontFamily: REG }}>$</Text>
        <Text style={{ flex: 1, fontSize: pt(destacado ? 14 : 12), fontFamily: BOLD, textAlign: 'right' }}>
          {comoNumero(valor)}
        </Text>
      </View>
    </View>
  )
}
