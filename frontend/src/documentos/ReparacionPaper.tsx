import { BOX, DocShell, Field, INK, STD_CONTENT_W, UnderlineLine, pt } from './kit'
import { REP_GARANTIA, REP_LABELS, REP_TITULO, REP_H, type ReparacionData } from './reparacionContent'
import type { PaperProps } from './types'

const LEFT_W = 298 // columnas B–D
const GAP_W = 101 // columna E
const RIGHT_W = STD_CONTENT_W - LEFT_W - GAP_W // columnas F–I

export function ReparacionPaper({ datos, onChange, readOnly, direccion }: PaperProps<ReparacionData>) {
  const set = (k: keyof ReparacionData) => (v: string) => onChange({ [k]: v })

  return (
    <DocShell
      titulo={REP_TITULO}
      height={REP_H}
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
      garantia={REP_GARANTIA}
    >
      <UnderlineLine label={REP_LABELS.recibiDe} value={datos.recibiDe} onChange={set('recibiDe')} readOnly={readOnly} height={20} fontSize={pt(10)} />
      <UnderlineLine label={REP_LABELS.equipos} value={datos.equipos} onChange={set('equipos')} readOnly={readOnly} height={20} fontSize={pt(10)} />
      <UnderlineLine label={REP_LABELS.falla} value={datos.falla} onChange={set('falla')} readOnly={readOnly} height={20} fontSize={pt(10)} />

      <div style={{ height: 14 }} />

      <div style={{ display: 'flex' }}>
        <div style={{ width: LEFT_W, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
          <MiniRow label={REP_LABELS.cel} value={datos.cel} onChange={set('cel')} readOnly={readOnly} divider />
          <MiniRow label={REP_LABELS.mail} value={datos.mail} onChange={set('mail')} readOnly={readOnly} divider />
          <MiniRow label={REP_LABELS.imei} value={datos.imei} onChange={set('imei')} readOnly={readOnly} />
        </div>
        <div style={{ width: GAP_W }} />
        <div style={{ width: RIGHT_W, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
          <MiniRow label={REP_LABELS.presupuesto} value={datos.presupuesto} onChange={set('presupuesto')} readOnly={readOnly} divider />
          <MiniRow label={REP_LABELS.sena} value={datos.sena} onChange={set('sena')} readOnly={readOnly} divider />
          <MiniRow label={REP_LABELS.pendiente} value={datos.pendiente} onChange={set('pendiente')} readOnly={readOnly} />
        </div>
      </div>

      <div style={{ height: 7 }} />
    </DocShell>
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
        height: 20,
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
