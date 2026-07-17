import { BOX, DocShell, Field, INK, STD_CONTENT_W, UnderlineLine, pt } from './kit'
import { MAY_GARANTIA, MAY_LABELS, MAY_TITULO, MAY_H, type MayoristaData } from './mayoristaContent'
import type { PaperProps } from './types'

const LEFT_W = 298
const GAP_W = 101
const RIGHT_W = STD_CONTENT_W - LEFT_W - GAP_W
/** Alto de cada renglón de IMEI (filas 9-14 del Excel). */
const IMEI_H = [21, 21, 20, 20, 20, 21]

export function MayoristaPaper({ datos, onChange, readOnly, direccion }: PaperProps<MayoristaData>) {
  const set = (k: keyof MayoristaData) => (v: string) => onChange({ [k]: v })
  const setImei = (i: number) => (v: string) => {
    const imeis = [...datos.imeis]
    imeis[i] = v
    onChange({ imeis })
  }

  return (
    <DocShell
      titulo={MAY_TITULO}
      height={MAY_H}
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
      garantia={MAY_GARANTIA}
    >
      {/* RECIBI DE + DNI */}
      <div style={{ height: 20, display: 'flex', alignItems: 'flex-end', fontSize: pt(10), gap: 5 }}>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{MAY_LABELS.recibiDe}</span>
        <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
          <Field value={datos.recibiDe} onChange={set('recibiDe')} readOnly={readOnly} ariaLabel="Recibí de" />
        </div>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{MAY_LABELS.dni}</span>
        <div style={{ width: 250, borderBottom: `1px solid ${INK}` }}>
          <Field value={datos.dni} onChange={set('dni')} readOnly={readOnly} ariaLabel="DNI" />
        </div>
      </div>
      {/* CELULAR + LA SUMA DE */}
      <div style={{ height: 20, display: 'flex', alignItems: 'flex-end', fontSize: pt(10), gap: 5 }}>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{MAY_LABELS.celular}</span>
        <div style={{ width: 140, borderBottom: `1px solid ${INK}` }}>
          <Field value={datos.celular} onChange={set('celular')} readOnly={readOnly} ariaLabel="Celular" />
        </div>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{MAY_LABELS.laSuma}</span>
        <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
          <Field value={datos.laSuma} onChange={set('laSuma')} readOnly={readOnly} ariaLabel="La suma de" />
        </div>
      </div>
      <UnderlineLine label={MAY_LABELS.concepto} value={datos.concepto} onChange={set('concepto')} readOnly={readOnly} height={30} fontSize={pt(10)} />

      {/* IMEIs + TOTAL */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: LEFT_W, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
          {IMEI_H.map((h, i) => (
            <ImeiRow key={i} h={h} value={datos.imeis[i] ?? ''} onChange={setImei(i)} readOnly={readOnly} divider={i < 5} n={i + 1} />
          ))}
        </div>
        <div style={{ width: GAP_W }} />
        <div style={{ width: RIGHT_W }}>
          <div style={{ border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
            {[21, 21, 20, 20].map((h, i) => (
              <ImeiRow key={i} h={h} value={datos.imeis[6 + i] ?? ''} onChange={setImei(6 + i)} readOnly={readOnly} divider={i < 3} n={7 + i} />
            ))}
          </div>
          <div
            style={{
              height: 20,
              border: `${BOX}px solid ${INK}`,
              borderTop: 'none',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: pt(11),
              fontWeight: 700,
            }}
          >
            {MAY_LABELS.total}
          </div>
          <div style={{ height: 21, border: `${BOX}px solid ${INK}`, borderTop: 'none', boxSizing: 'border-box', display: 'flex', alignItems: 'center' }}>
            <Field value={datos.total} onChange={set('total')} readOnly={readOnly} align="center" ariaLabel="Total" style={{ fontSize: pt(12), fontWeight: 700 }} />
          </div>
        </div>
      </div>

      <div style={{ height: 21 }} />
    </DocShell>
  )
}

function ImeiRow({
  h,
  value,
  onChange,
  readOnly,
  divider,
  n,
}: {
  h: number
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  divider?: boolean
  n: number
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
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{MAY_LABELS.imei}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Field value={value} onChange={onChange} readOnly={readOnly} ariaLabel={`IMEI ${n}`} />
      </div>
    </div>
  )
}
