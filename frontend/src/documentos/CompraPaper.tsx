import { BOX, DocShell, Field, INK, STD_CONTENT_W, UnderlineLine, pt } from './kit'
import { COMPRA_GARANTIA, COMPRA_LABELS, COMPRA_TITULO, COMPRA_H, type CompraData } from './compraContent'
import type { PaperProps } from './types'

const LEFT_W = 298 // columnas B–D
const GAP_W = 101 // columna E
const RIGHT_W = STD_CONTENT_W - LEFT_W - GAP_W // columnas F–I (355)

export function CompraPaper({ datos, onChange, readOnly, direccion }: PaperProps<CompraData>) {
  const set = (k: keyof CompraData) => (v: string) => onChange({ [k]: v })

  return (
    <DocShell
      titulo={COMPRA_TITULO}
      height={COMPRA_H}
      cupon={datos.cupon}
      onCupon={set('cupon')}
      dia={datos.fechaDia}
      mes={datos.fechaMes}
      anio={datos.fechaAnio}
      onDia={set('fechaDia')}
      onMes={set('fechaMes')}
      onAnio={set('fechaAnio')}
      readOnly={readOnly}
      direccion={direccion}
      garantia={COMPRA_GARANTIA}
    >
      {/* Renglones */}
      <div style={{ height: 20, display: 'flex', alignItems: 'flex-end', fontSize: pt(10), gap: 5 }}>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{COMPRA_LABELS.recibiDe}</span>
        <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
          <Field value={datos.recibiDe} onChange={set('recibiDe')} readOnly={readOnly} ariaLabel="Recibí de" />
        </div>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{COMPRA_LABELS.dni}</span>
        <div style={{ width: 250, borderBottom: `1px solid ${INK}` }}>
          <Field value={datos.dni} onChange={set('dni')} readOnly={readOnly} ariaLabel="DNI" />
        </div>
      </div>
      <UnderlineLine label={COMPRA_LABELS.laSuma} value={datos.laSuma} onChange={set('laSuma')} readOnly={readOnly} height={20} fontSize={pt(10)} />
      <UnderlineLine label={COMPRA_LABELS.concepto} value={datos.concepto} onChange={set('concepto')} readOnly={readOnly} height={30} fontSize={pt(10)} />
      <UnderlineLine label="" value={datos.conceptoExtra} onChange={set('conceptoExtra')} readOnly={readOnly} height={20} fontSize={pt(10)} ariaLabel="Concepto (continuación)" />

      <div style={{ height: 21 }} />

      {/* Datos + TOTAL */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: LEFT_W, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
          <MiniRow label={COMPRA_LABELS.cel} value={datos.cel} onChange={set('cel')} readOnly={readOnly} divider />
          <MiniRow label={COMPRA_LABELS.mail} value={datos.mail} onChange={set('mail')} readOnly={readOnly} divider />
          <MiniRow label={COMPRA_LABELS.condicion} value={datos.condicion} onChange={set('condicion')} readOnly={readOnly} divider />
          <MiniRow label={COMPRA_LABELS.imei} value={datos.imei} onChange={set('imei')} readOnly={readOnly} h={21} />
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
            {COMPRA_LABELS.total}
          </div>
          <div
            style={{
              height: 61,
              border: `${BOX}px solid ${INK}`,
              borderTop: 'none',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Field value={datos.total} onChange={set('total')} readOnly={readOnly} align="center" ariaLabel="Total" style={{ fontSize: pt(16), fontWeight: 700 }} />
          </div>
        </div>
      </div>

      <div style={{ height: 21 }} />
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
