import type { CSSProperties } from 'react'
import { Body, CtHeader, Inline, Paper, STD_PAD, STD_W, TitleBar, UnderlineLine, pt } from './kit'
import {
  CV_CARACTERISTICAS,
  CV_CUARTA,
  CV_FIRMAS,
  CV_H,
  CV_INTRO,
  CV_PRIMERA,
  CV_QUINTA,
  CV_SEGUNDA,
  CV_SEXTA,
  CV_TERCERA,
  CV_TITULO,
  type Clausula,
  type CompraventaData,
} from './compraventaContent'
import type { PaperProps } from './types'

export function CompraventaPaper({ datos, onChange, readOnly }: PaperProps<CompraventaData>) {
  const set = (k: keyof CompraventaData) => (v: string) => onChange({ [k]: v })

  return (
    <Paper width={STD_W} height={CV_H}>
      <TitleBar height={20} fontSize={pt(10)}>
        {CV_TITULO}
      </TitleBar>
      <Body padL={STD_PAD} padR={STD_PAD}>
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
        />

        <p style={parr}>{CV_INTRO}</p>
        <ClausulaView c={CV_PRIMERA} datos={datos} set={set} readOnly={readOnly} />

        <div style={{ marginTop: 2 }}>
          {CV_CARACTERISTICAS.map((c) => (
            <UnderlineLine
              key={c.f}
              label={c.label}
              value={datos[c.f]}
              onChange={set(c.f)}
              readOnly={readOnly}
              height={20}
              fontSize={pt(10)}
            />
          ))}
        </div>

        <ClausulaView c={CV_SEGUNDA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_TERCERA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_CUARTA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_QUINTA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_SEXTA} datos={datos} set={set} readOnly={readOnly} />

        {/* Firmas al pie */}
        <div style={{ flex: 1 }} />
        <FirmaFila izq={CV_FIRMAS.firmaIzq} der={CV_FIRMAS.firmaDer} />
        <div style={{ height: 6 }} />
        <FirmaFila izq={CV_FIRMAS.aclaracionIzq} der={CV_FIRMAS.aclaracionDer} valorDer={CV_FIRMAS.aclaracionDerValor} />
        <div style={{ height: 6 }} />
      </Body>
    </Paper>
  )
}

const parr: CSSProperties = {
  margin: '5px 0 0',
  fontSize: pt(10),
  lineHeight: 1.22,
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
      <span style={{ fontWeight: 700 }}>{c.prefix}</span>
      {c.segs.map((s, i) =>
        't' in s ? (
          <span key={i}>{s.t}</span>
        ) : (
          <Inline key={i} value={datos[s.f]} onChange={set(s.f)} readOnly={readOnly} ariaLabel={s.aria} width={s.w} />
        ),
      )}
    </p>
  )
}

/** Fila de firmas: dos columnas con línea y leyenda (la derecha puede venir preimpresa). */
function FirmaFila({ izq, der, valorDer }: { izq: string; der: string; valorDer?: string }) {
  const linea = '_____________________________________________'
  return (
    <div style={{ display: 'flex', fontSize: pt(10) }}>
      <div style={{ width: 298, textAlign: 'center' }}>
        <div>{linea}</div>
        <div style={{ fontWeight: 700, marginTop: 1 }}>{izq}</div>
      </div>
      <div style={{ width: 101 }} />
      <div style={{ width: 277, textAlign: 'center' }}>
        <div style={{ fontWeight: valorDer ? 700 : 400 }}>{valorDer ?? linea}</div>
        <div style={{ fontWeight: 700, marginTop: 1 }}>{der}</div>
      </div>
    </div>
  )
}
