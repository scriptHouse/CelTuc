import type { CSSProperties } from 'react'
import { Body, CtHeader, Field, INK, Inline, Paper, STD_CONTENT_W, STD_PAD, STD_W, TitleBar, pt } from './kit'
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

const LH = 1.5 // interlineado holgado y legible (estilo contrato)
const CLAUSE_GAP = 11 // separación entre cláusulas
const LABEL_COL = 58 // ancho de etiqueta alineada en las características

/** Ancho de las columnas de firma (llenan todo el ancho útil, balanceadas). */
const SIGN_COL = 326
const SIGN_GAP = STD_CONTENT_W - SIGN_COL * 2

export function CompraventaPaper({ datos, onChange, readOnly, direccion }: PaperProps<CompraventaData>) {
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
          direccion={direccion}
        />

        <p style={{ ...parr, marginTop: 10 }}>{CV_INTRO}</p>
        <ClausulaView c={CV_PRIMERA} datos={datos} set={set} readOnly={readOnly} />

        {/* Características del equipo: bloque alineado y sangrado */}
        <div style={{ marginTop: 7, marginBottom: 3, paddingLeft: 14 }}>
          {CV_CARACTERISTICAS.map((c, i) => {
            const label = limpiarEtiqueta(c.label)
            const largo = i === CV_CARACTERISTICAS.length - 1 // "Observaciones (…)"
            return (
              <div key={c.f} style={{ height: 21, display: 'flex', alignItems: 'flex-end', fontSize: pt(10) }}>
                <span
                  style={{
                    width: largo ? undefined : LABEL_COL,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    paddingBottom: 2,
                    paddingRight: largo ? 8 : 0,
                  }}
                >
                  {label}
                </span>
                <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
                  <Field value={datos[c.f]} onChange={set(c.f)} readOnly={readOnly} ariaLabel={label} />
                </div>
              </div>
            )
          })}
        </div>

        <ClausulaView c={CV_SEGUNDA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_TERCERA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_CUARTA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_QUINTA} datos={datos} set={set} readOnly={readOnly} />
        <ClausulaView c={CV_SEXTA} datos={datos} set={set} readOnly={readOnly} />

        {/* Firmas al pie (empujadas hacia abajo con aire) */}
        <div style={{ flex: 1, minHeight: 28 }} />
        <FirmaFila izq={CV_FIRMAS.firmaIzq} der={CV_FIRMAS.firmaDer} />
        <div style={{ height: 18 }} />
        <FirmaFila izq={CV_FIRMAS.aclaracionIzq} der={CV_FIRMAS.aclaracionDer} valorDer={CV_FIRMAS.aclaracionDerValor} />
        <div style={{ height: 6 }} />
      </Body>
    </Paper>
  )
}

/** Quita el bullet y los espacios que traen las características desde el Excel. */
function limpiarEtiqueta(label: string): string {
  return label.replace(/^\W+/, '').trim()
}

const parr: CSSProperties = {
  margin: `${CLAUSE_GAP}px 0 0`,
  fontSize: pt(10),
  lineHeight: LH,
  textAlign: 'justify',
  // Respeta los saltos de línea del texto (ej. la lista a)/b)/c)/d) de SEXTA),
  // como en el PDF y el Excel originales.
  whiteSpace: 'pre-line',
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

/** Fila de firmas: dos columnas balanceadas con línea y leyenda. */
function FirmaFila({ izq, der, valorDer }: { izq: string; der: string; valorDer?: string }) {
  const linea = '________________________________________________'
  return (
    <div style={{ display: 'flex', fontSize: pt(10) }}>
      <Columna caption={izq}>{linea}</Columna>
      <div style={{ width: SIGN_GAP }} />
      <Columna caption={der} bold={!!valorDer}>
        {valorDer ?? linea}
      </Columna>
    </div>
  )
}

function Columna({ caption, bold, children }: { caption: string; bold?: boolean; children: string }) {
  return (
    <div style={{ width: SIGN_COL, textAlign: 'center' }}>
      <div style={{ fontWeight: bold ? 700 : 400 }}>{children}</div>
      <div style={{ fontWeight: 700, marginTop: 2, letterSpacing: '0.02em' }}>{caption}</div>
    </div>
  )
}
