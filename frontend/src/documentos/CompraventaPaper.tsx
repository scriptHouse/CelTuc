import type { CSSProperties } from 'react'
import { Body, CtHeader, INK, Inline, Paper, TitleBar, UnderlineLine, pt } from './kit'
import {
  CV_CARACTERISTICAS,
  CV_CUARTA,
  CV_H,
  CV_INTRO,
  CV_PRIMERA,
  CV_QUINTA,
  CV_SEGUNDA,
  CV_TERCERA,
  CV_TITULO,
  CV_W,
  type Clausula,
  type CompraventaData,
} from './compraventaContent'
import type { PaperProps } from './types'

const PAD = 24
const CONTENT_W = CV_W - PAD * 2

export function CompraventaPaper({ datos, onChange, readOnly }: PaperProps<CompraventaData>) {
  const set = (k: keyof CompraventaData) => (v: string) => onChange({ [k]: v })

  return (
    <Paper width={CV_W} height={CV_H}>
      <TitleBar>{CV_TITULO}</TitleBar>
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
          socials="simple"
        />

        <p style={parr}>{CV_INTRO}</p>
        <ClausulaView c={CV_PRIMERA} datos={datos} set={set} readOnly={readOnly} />

        <div style={{ marginTop: 4, marginBottom: 4 }}>
          {CV_CARACTERISTICAS.map((c) => (
            <UnderlineLine
              key={c.f}
              label={c.label}
              value={datos[c.f]}
              onChange={set(c.f)}
              readOnly={readOnly}
              height={20}
            />
          ))}
        </div>

        <ClausulaView c={CV_SEGUNDA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_TERCERA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_CUARTA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_QUINTA} datos={datos} set={set} readOnly={readOnly} />

        {/* Firmas (empujadas al pie) */}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'space-around', paddingBottom: 10 }}>
          <Firma caption="VENDEDOR" />
          <Firma caption="COMPRADOR" />
        </div>
      </Body>
    </Paper>
  )
}

const parr: CSSProperties = {
  margin: '6px 0 0',
  fontSize: pt(11),
  lineHeight: 1.25,
  textAlign: 'justify',
}

function ClausulaView({
  c,
  datos,
  set,
  readOnly,
}: {
  c: Clausula
  datos: CompraventaData
  set: (k: keyof CompraventaData) => (v: string) => void
  readOnly?: boolean
}) {
  return (
    <p style={parr}>
      {c.prefix && <span style={{ fontWeight: 700 }}>{c.prefix}</span>}
      {c.segs.map((s, i) =>
        't' in s ? (
          <span key={i}>{s.t}</span>
        ) : (
          <Inline
            key={i}
            value={datos[s.f]}
            onChange={set(s.f)}
            readOnly={readOnly}
            ariaLabel={s.aria}
            width={s.w}
          />
        ),
      )}
    </p>
  )
}

function Firma({ caption }: { caption: string }) {
  return (
    <div style={{ width: 220, textAlign: 'center', fontSize: pt(11) }}>
      <div style={{ borderTop: `1px solid ${INK}`, marginBottom: 3 }} />
      <span style={{ fontWeight: 700 }}>{caption}</span>
    </div>
  )
}
