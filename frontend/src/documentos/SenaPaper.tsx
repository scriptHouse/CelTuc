import type { ReactNode } from 'react'
import { BOX, Field, INK, Paper, pt } from './kit'
import { LOGO_CELTUC } from './assets'
import { SENA, SENA_H, SENA_W, type SenaData } from './senaContent'
import type { PaperProps } from './types'

export function SenaPaper({ datos, onChange, readOnly, direccion = SENA.direccion }: PaperProps<SenaData>) {
  const set = (k: keyof SenaData) => (v: string) => onChange({ [k]: v })

  return (
    <Paper width={SENA_W} height={SENA_H}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '7px 16px 7px 21px', fontSize: pt(10) }}>
        {/* Encabezado: logo + dirección | N° RECIBO + FECHA + leyenda */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <img src={LOGO_CELTUC} alt="CelTuc" width={54} height={54} style={{ display: 'block' }} />
            <div style={{ fontSize: pt(8), marginTop: 3 }}>{direccion}</div>
          </div>
          <div style={{ width: 226, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* N° RECIBO y FECHA: dos cajas lado a lado (formato nuevo) */}
            <div style={{ display: 'flex', gap: 5 }}>
              <StackBox label={SENA.numeroRecibo} width={118}>
                <Field value={datos.numeroRecibo} onChange={set('numeroRecibo')} readOnly={readOnly} align="center" ariaLabel="N° de recibo" />
              </StackBox>
              <StackBox label={SENA.fecha} width={103}>
                <Field value={datos.fecha} onChange={set('fecha')} readOnly={readOnly} align="center" ariaLabel="Fecha" />
              </StackBox>
            </div>
            <div style={{ fontSize: pt(8), textAlign: 'center' }}>{SENA.noFactura}</div>
          </div>
        </div>

        {/* Renglones */}
        <div style={{ marginTop: 6 }}>
          <div style={{ height: 20, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{SENA.recibiDe}</span>
            <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
              <Field value={datos.recibiDe} onChange={set('recibiDe')} readOnly={readOnly} ariaLabel="Recibí de" />
            </div>
            <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{SENA.tel}</span>
            <div style={{ width: 120, borderBottom: `1px solid ${INK}` }}>
              <Field value={datos.tel} onChange={set('tel')} readOnly={readOnly} ariaLabel="Teléfono" />
            </div>
          </div>
          <SenaLine label={SENA.laSuma} value={datos.laSuma} onChange={set('laSuma')} readOnly={readOnly} />
          <SenaLine label={SENA.concepto} value={datos.concepto} onChange={set('concepto')} readOnly={readOnly} />
        </div>

        {/* Pie: VALOR TOTAL + disclaimer | TOTAL + firma */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flex: 1 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <SenaLine label={SENA.valorTotal} value={datos.valorTotal} onChange={set('valorTotal')} readOnly={readOnly} />
            <div style={{ fontSize: pt(8), fontWeight: 700, marginTop: 5, lineHeight: 1.15 }}>{SENA.disclaimer}</div>
          </div>
          <div style={{ width: 150, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <StackBox label={SENA.total} width="100%" valueHeight={24}>
              <Field value={datos.total} onChange={set('total')} readOnly={readOnly} align="center" ariaLabel="Total" style={{ fontWeight: 700, fontSize: pt(12) }} />
            </StackBox>
            <div style={{ marginTop: 12, textAlign: 'center', width: '100%' }}>
              <div style={{ fontSize: pt(10) }}>{SENA.lineaFirma}</div>
              <div style={{ fontSize: pt(8), fontWeight: 700 }}>{SENA.firma}</div>
            </div>
          </div>
        </div>
      </div>
    </Paper>
  )
}

/** Caja con etiqueta arriba (centrada) y un valor debajo. */
function StackBox({
  label,
  width,
  valueHeight = 20,
  children,
}: {
  label: string
  width: number | string
  valueHeight?: number
  children: ReactNode
}) {
  return (
    <div style={{ width, border: `${BOX}px solid ${INK}` }}>
      <div style={{ fontSize: pt(10), textAlign: 'center', fontWeight: 700, borderBottom: `${BOX}px solid ${INK}`, padding: '1px 0' }}>{label}</div>
      <div style={{ height: valueHeight, display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  )
}

function SenaLine({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
}) {
  return (
    <div style={{ height: 20, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{label}</span>
      <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
        <Field value={value} onChange={onChange} readOnly={readOnly} ariaLabel={label} />
      </div>
    </div>
  )
}
