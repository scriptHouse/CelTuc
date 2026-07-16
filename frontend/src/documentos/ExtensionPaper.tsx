import { BOX, DocShell, Field, INK, Inline, STD_CONTENT_W, UnderlineLine, pt } from './kit'
import { EXT_GARANTIA, EXT_LABELS, EXT_TITULO, EXT_H, type ExtensionData } from './extensionContent'
import type { PaperProps } from './types'

const LEFT_W = 298
const GAP_W = 101
const RIGHT_W = STD_CONTENT_W - LEFT_W - GAP_W

export function ExtensionPaper({ datos, onChange, readOnly }: PaperProps<ExtensionData>) {
  const set = (k: keyof ExtensionData) => (v: string) => onChange({ [k]: v })

  return (
    <DocShell
      titulo={EXT_TITULO}
      height={EXT_H}
      cupon={datos.cupon}
      onCupon={set('cupon')}
      dia={datos.fechaDia}
      mes={datos.fechaMes}
      anio={datos.fechaAnio}
      onDia={set('fechaDia')}
      onMes={set('fechaMes')}
      onAnio={set('fechaAnio')}
      readOnly={readOnly}
      garantia={EXT_GARANTIA}
    >
      {/* RECIBI DE + DNI */}
      <div style={{ height: 20, display: 'flex', alignItems: 'flex-end', fontSize: pt(10), gap: 5 }}>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{EXT_LABELS.recibiDe}</span>
        <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
          <Field value={datos.recibiDe} onChange={set('recibiDe')} readOnly={readOnly} ariaLabel="Recibí de" />
        </div>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{EXT_LABELS.dni}</span>
        <div style={{ width: 250, borderBottom: `1px solid ${INK}` }}>
          <Field value={datos.dni} onChange={set('dni')} readOnly={readOnly} ariaLabel="DNI" />
        </div>
      </div>
      <UnderlineLine label={EXT_LABELS.laSuma} value={datos.laSuma} onChange={set('laSuma')} readOnly={readOnly} height={20} fontSize={pt(10)} />
      <UnderlineLine label={EXT_LABELS.concepto} value={datos.concepto} onChange={set('concepto')} readOnly={readOnly} height={30} fontSize={pt(10)} />
      {/* ___ POR Nº ___ MESES A PARTIR DE... */}
      <div style={{ height: 20, display: 'flex', alignItems: 'flex-end', fontSize: pt(10), gap: 5 }}>
        <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
          <Field value={datos.conceptoExtra} onChange={set('conceptoExtra')} readOnly={readOnly} ariaLabel="Concepto (continuación)" />
        </div>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{EXT_LABELS.porN}</span>
        <Inline value={datos.meses} onChange={set('meses')} readOnly={readOnly} ariaLabel="Meses" width={54} />
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{EXT_LABELS.meses}</span>
      </div>

      <div style={{ height: 21 }} />

      <div style={{ display: 'flex' }}>
        <div style={{ width: LEFT_W, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
          <MiniRow label={EXT_LABELS.cel} value={datos.cel} onChange={set('cel')} readOnly={readOnly} divider />
          <MiniRow label={EXT_LABELS.mail} value={datos.mail} onChange={set('mail')} readOnly={readOnly} divider />
          <MiniRow label={EXT_LABELS.condicion} value={datos.condicion} onChange={set('condicion')} readOnly={readOnly} divider />
          <MiniRow label={EXT_LABELS.imei} value={datos.imei} onChange={set('imei')} readOnly={readOnly} h={21} />
        </div>
        <div style={{ width: GAP_W }} />
        <div style={{ width: RIGHT_W }}>
          <div
            style={{
              height: 20,
              border: `${BOX}px solid ${INK}`,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: pt(11),
              fontWeight: 700,
            }}
          >
            {EXT_LABELS.total}
          </div>
          <div style={{ height: 61, border: `${BOX}px solid ${INK}`, borderTop: 'none', boxSizing: 'border-box', display: 'flex', alignItems: 'center' }}>
            <Field value={datos.total} onChange={set('total')} readOnly={readOnly} align="center" ariaLabel="Total" style={{ fontSize: pt(16), fontWeight: 700 }} />
          </div>
        </div>
      </div>

      <div style={{ height: 20 }} />
    </DocShell>
  )
}

function MiniRow({
  label,
  value,
  onChange,
  readOnly,
  divider,
  h = 20,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  divider?: boolean
  h?: number
}) {
  return (
    <div
      style={{
        height: h,
        display: 'flex',
        alignItems: 'center',
        borderBottom: divider ? `${BOX}px solid ${INK}` : undefined,
        fontSize: pt(10),
        padding: '0 4px',
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
