import { Area, BOX, Body, CtHeader, Field, GarantiaBox, INK, LabeledBox, Paper, Spacer, TitleBar, UnderlineLine, pt } from './kit'
import { COMPRA_GARANTIA, COMPRA_LABELS, COMPRA_TITULO, COMPRA_H, COMPRA_W, type CompraData } from './compraContent'
import type { PaperProps } from './types'

const PAD = 11
const CONTENT_W = COMPRA_W - PAD * 2 // 576
const LEFT_W = 235 // B–D
const MID_W = 118 // E–F
const RIGHT_W = CONTENT_W - LEFT_W - MID_W // G–I

export function CompraPaper({ datos, onChange, readOnly }: PaperProps<CompraData>) {
  const set = (k: keyof CompraData) => (v: string) => onChange({ [k]: v })

  return (
    <Paper width={COMPRA_W} height={COMPRA_H}>
      <TitleBar>{COMPRA_TITULO}</TitleBar>
      <Body padL={PAD} padR={PAD}>
        <CtHeader
          cupon={datos.cupon}
          onCupon={set('cupon')}
          dia={datos.fechaDia}
          mes={datos.fechaMes}
          anio={datos.fechaAnio}
          onDia={set('fechaDia')}
          onMes={set('fechaMes')}
          onAnio={set('fechaAnio')}
          readOnly={readOnly}
          contentW={CONTENT_W}
        />

        <UnderlineLine label={COMPRA_LABELS.recibiDe} value={datos.recibiDe} onChange={set('recibiDe')} readOnly={readOnly} />
        {/* DNI + N° TEL en un mismo renglón */}
        <div style={{ height: 18, display: 'flex', alignItems: 'flex-end', fontSize: pt(11), gap: 6 }}>
          <span style={{ fontWeight: 700, paddingBottom: 2 }}>{COMPRA_LABELS.dni}</span>
          <div style={{ width: 150, borderBottom: `1px solid ${INK}` }}>
            <Field value={datos.dni} onChange={set('dni')} readOnly={readOnly} ariaLabel="DNI" />
          </div>
          <span style={{ fontWeight: 700, paddingBottom: 2, whiteSpace: 'nowrap' }}>{COMPRA_LABELS.tel}</span>
          <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
            <Field value={datos.tel} onChange={set('tel')} readOnly={readOnly} ariaLabel="Teléfono" />
          </div>
        </div>
        <UnderlineLine label={COMPRA_LABELS.laSuma} value={datos.laSuma} onChange={set('laSuma')} readOnly={readOnly} />
        <UnderlineLine label={COMPRA_LABELS.concepto} value={datos.concepto} onChange={set('concepto')} readOnly={readOnly} />
        <UnderlineLine label="" value={datos.conceptoExtra} onChange={set('conceptoExtra')} readOnly={readOnly} ariaLabel="Concepto (continuación)" />
        <UnderlineLine label="" value={datos.conceptoExtra2} onChange={set('conceptoExtra2')} readOnly={readOnly} ariaLabel="Concepto (continuación)" />

        <Spacer h={12} />

        {/* Sección media: condición/IMEI/garantía/forma de pago + firma + TOTAL */}
        <div style={{ display: 'flex' }}>
          {/* Caja izquierda (4 filas) */}
          <div style={{ width: LEFT_W, border: `${BOX}px solid ${INK}` }}>
            <MiniRow label={COMPRA_LABELS.condicion} value={datos.condicion} onChange={set('condicion')} readOnly={readOnly} divider />
            <MiniRow label={COMPRA_LABELS.imei} value={datos.imei} onChange={set('imei')} readOnly={readOnly} divider />
            <MiniRow label={COMPRA_LABELS.garantia} value={datos.garantia} onChange={set('garantia')} readOnly={readOnly} divider />
            <MiniRow label={COMPRA_LABELS.formaPago} value={datos.formaPago} onChange={set('formaPago')} readOnly={readOnly} />
          </div>
          {/* Firma */}
          <div style={{ width: MID_W, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 18 }} />
            <div style={{ height: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 }}>
              <div style={{ fontSize: pt(9), letterSpacing: 1 }}>………………………….</div>
              <div style={{ fontSize: pt(11), fontWeight: 700, marginTop: 2 }}>{COMPRA_LABELS.firma}</div>
            </div>
          </div>
          {/* TOTAL */}
          <div style={{ width: RIGHT_W, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: pt(11), fontWeight: 700 }}>
              {COMPRA_LABELS.total}
            </div>
            <div style={{ height: 54, border: `${BOX}px solid ${INK}`, display: 'flex', alignItems: 'center' }}>
              <Field value={datos.total} onChange={set('total')} readOnly={readOnly} align="center" ariaLabel="Total" style={{ fontSize: pt(14), fontWeight: 700 }} />
            </div>
          </div>
        </div>

        <Spacer h={12} />

        <LabeledBox label={COMPRA_LABELS.obs} height={36}>
          <Area value={datos.obs} onChange={set('obs')} readOnly={readOnly} ariaLabel="Observaciones" />
        </LabeledBox>

        <Spacer h={12} />

        <GarantiaBox runs={COMPRA_GARANTIA} fontSize={pt(6)} />

        <Spacer h={8} />
      </Body>
    </Paper>
  )
}

function MiniRow({
  label,
  value,
  onChange,
  readOnly,
  divider,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  divider?: boolean
}) {
  return (
    <div
      style={{
        height: 18,
        display: 'flex',
        alignItems: 'center',
        borderBottom: divider ? `${BOX}px solid ${INK}` : undefined,
        fontSize: pt(11),
        padding: '0 3px',
        gap: 4,
      }}
    >
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Field value={value} onChange={onChange} readOnly={readOnly} ariaLabel={label} />
      </div>
    </div>
  )
}
