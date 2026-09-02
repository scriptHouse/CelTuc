import { Body, Field, GarantiaBox, INK, Paper, TitleBar, pt } from './kit'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA, lineaDireccion } from './content'
import { GACC_FECHA_LABEL, GACC_H, GACC_RUNS, GACC_TITULO, GACC_W, type GAccData } from './garantiaAccContent'
import type { PaperProps } from './types'

export function GarantiaAccPaper({ datos, onChange, readOnly, direccion = EMPRESA.direccion }: PaperProps<GAccData>) {
  return (
    <Paper width={GACC_W} height={GACC_H}>
      <TitleBar>{GACC_TITULO}</TitleBar>
      <Body padL={14} padR={14}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, paddingBottom: 10 }}>
          <img src={LOGO_CELTUC} alt="CelTuc" width={58} height={58} style={{ display: 'block', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: pt(16), fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1 }}>{EMPRESA.nombre}</div>
            <div style={{ fontSize: pt(8), marginTop: 3 }}>{lineaDireccion(direccion)}</div>
            <div style={{ fontSize: pt(9), marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
              <img src={ICON_INSTAGRAM} alt="" width={14} height={14} style={{ display: 'block' }} />
              <span>{EMPRESA.instagram}</span>
              <img src={ICON_FACEBOOK} alt="" width={14} height={14} style={{ display: 'block', marginLeft: 4 }} />
              <span>{EMPRESA.facebook}</span>
            </div>
          </div>
        </div>

        <GarantiaBox runs={GACC_RUNS} fontSize={pt(8)} />

        {/* Pie: fecha y hora de emisión, abajo a la derecha. Un solo renglón de
            18px (antes había 8px de aire), así casi no le come espacio al
            texto de la garantía. */}
        <div
          style={{
            height: 18,
            paddingTop: 5,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'flex-end',
            gap: 4,
            fontSize: pt(8),
          }}
        >
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 1 }}>{GACC_FECHA_LABEL}</span>
          <div style={{ width: 104, borderBottom: `1px solid ${INK}` }}>
            <Field
              value={datos.fechaHora}
              onChange={(v) => onChange({ fechaHora: v })}
              readOnly={readOnly}
              align="center"
              ariaLabel="Fecha y hora de emisión"
            />
          </div>
        </div>
      </Body>
    </Paper>
  )
}
