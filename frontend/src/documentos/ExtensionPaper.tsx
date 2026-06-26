import { BOX, Body, CtHeader, Field, GarantiaBox, INK, Inline, Paper, Spacer, TitleBar, UnderlineLine, pt } from './kit'
import { EXT_GARANTIA, EXT_LABELS, EXT_TITULO, EXT_H, EXT_W, type ExtensionData } from './extensionContent'
import type { PaperProps } from './types'

const PAD = 11
const CONTENT_W = EXT_W - PAD * 2
const LEFT_W = 235
const MID_W = 118
const RIGHT_W = CONTENT_W - LEFT_W - MID_W

export function ExtensionPaper({ datos, onChange, readOnly }: PaperProps<ExtensionData>) {
  const set = (k: keyof ExtensionData) => (v: string) => onChange({ [k]: v })

  return (
    <Paper width={EXT_W} height={EXT_H}>
      <TitleBar>{EXT_TITULO}</TitleBar>
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

        <UnderlineLine label={EXT_LABELS.nombre} value={datos.nombre} onChange={set('nombre')} readOnly={readOnly} />
        {/* DNI + N° TEL */}
        <div style={{ height: 18, display: 'flex', alignItems: 'flex-end', fontSize: pt(11), gap: 6 }}>
          <span style={{ fontWeight: 700, paddingBottom: 2 }}>{EXT_LABELS.dni}</span>
          <div style={{ width: 150, borderBottom: `1px solid ${INK}` }}>
            <Field value={datos.dni} onChange={set('dni')} readOnly={readOnly} ariaLabel="DNI" />
          </div>
          <span style={{ fontWeight: 700, paddingBottom: 2, whiteSpace: 'nowrap' }}>{EXT_LABELS.tel}</span>
          <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
            <Field value={datos.tel} onChange={set('tel')} readOnly={readOnly} ariaLabel="Teléfono" />
          </div>
        </div>
        {/* SE EXTIENDE ... [días] DIAS EN */}
        <div style={{ height: 18, display: 'flex', alignItems: 'flex-end', fontSize: pt(11), gap: 6 }}>
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{EXT_LABELS.extiende1}</span>
          <Inline value={datos.dias} onChange={set('dias')} readOnly={readOnly} ariaLabel="Días" width={46} />
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{EXT_LABELS.extiende2}</span>
        </div>
        <UnderlineLine label={EXT_LABELS.concepto} value={datos.concepto} onChange={set('concepto')} readOnly={readOnly} />
        <UnderlineLine label="" value={datos.conceptoExtra} onChange={set('conceptoExtra')} readOnly={readOnly} ariaLabel="Concepto (continuación)" />

        <Spacer h={16} />

        {/* TOTAL $ (etiqueta) */}
        <div style={{ display: 'flex' }}>
          <div style={{ width: LEFT_W + MID_W }} />
          <div style={{ width: RIGHT_W, textAlign: 'center', fontSize: pt(11), fontWeight: 700 }}>{EXT_LABELS.total}</div>
        </div>
        {/* Cajas */}
        <div style={{ display: 'flex' }}>
          <div style={{ width: LEFT_W, border: `${BOX}px solid ${INK}` }}>
            <MiniRow label={EXT_LABELS.imei} value={datos.imei} onChange={set('imei')} readOnly={readOnly} divider />
            <MiniRow label={EXT_LABELS.vendedor} value={datos.vendedor} onChange={set('vendedor')} readOnly={readOnly} divider />
            <MiniRow label={EXT_LABELS.formaPago} value={datos.formaPago} onChange={set('formaPago')} readOnly={readOnly} />
          </div>
          <div style={{ width: MID_W, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 }}>
            <div style={{ fontSize: pt(9), letterSpacing: 1 }}>………………………….</div>
            <div style={{ fontSize: pt(11), fontWeight: 700, marginTop: 2 }}>{EXT_LABELS.firma}</div>
          </div>
          <div style={{ width: RIGHT_W, border: `${BOX}px solid ${INK}`, height: 54, display: 'flex', alignItems: 'center' }}>
            <Field value={datos.total} onChange={set('total')} readOnly={readOnly} align="center" ariaLabel="Total" style={{ fontSize: pt(14), fontWeight: 700 }} />
          </div>
        </div>

        <Spacer h={14} />

        <GarantiaBox runs={EXT_GARANTIA} fontSize={pt(8)} />

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
