import type { CSSProperties, ReactNode } from 'react'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA, GARANTIA_RUNS, LABELS, RECEPCION_TITULO } from './content'
import type { RecepcionData } from './types'
import {
  BOX,
  CONTENT_W,
  DATE_BOX,
  FONT,
  FRAME,
  GAP_W,
  H,
  LABEL_F_W,
  LEFT_BOX_W,
  LOGO,
  NATURAL_W,
  PAD_L,
  PAD_R,
  RIGHT_BOX_W,
  RIGHT_CLUSTER_W,
  SOCIAL_ICON,
} from './layout'

/* ============================================================================
 * Recepción — réplica fiel y rellenable de la hoja de Excel.
 *
 * Se dibuja a tamaño natural (498 px de ancho). El papel es SIEMPRE claro (es
 * un documento, no sigue el tema oscuro de la app). El contenedor que lo usa
 * (PaperScaler en la página) lo escala para ocupar el ancho disponible.
 * ========================================================================== */

const INK = '#0a0a0b' // texto y bordes (negro)
const DATA = '#16161a' // datos cargados por el usuario

type Patch = Partial<RecepcionData>

interface PaperProps {
  datos: RecepcionData
  onChange: (patch: Patch) => void
  readOnly?: boolean
}

export function RecepcionPaper({ datos, onChange, readOnly = false }: PaperProps) {
  const set = (k: keyof RecepcionData) => (v: string) => onChange({ [k]: v } as Patch)

  return (
    <div
      style={{
        width: NATURAL_W,
        boxSizing: 'border-box',
        border: `${FRAME}px solid ${INK}`,
        background: '#fff',
        color: INK,
        fontFamily: "'Inter', system-ui, sans-serif",
        lineHeight: 1.1,
        position: 'relative',
      }}
    >
      {/* ===== Título ===== */}
      <div
        style={{
          height: H.title,
          borderBottom: `${FRAME}px solid ${INK}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: FONT.title,
          fontWeight: 700,
          letterSpacing: '0.01em',
        }}
      >
        {RECEPCION_TITULO}
      </div>

      {/* ===== Cuerpo (con márgenes internos = columnas A y J) ===== */}
      <div style={{ paddingLeft: PAD_L, paddingRight: PAD_R }}>
        <Header datos={datos} set={set} readOnly={readOnly} />

        {/* Renglones rellenables */}
        <Line label={LABELS.recibiDe} value={datos.recibiDe} onChange={set('recibiDe')} readOnly={readOnly} />
        <Line label={LABELS.equipos} value={datos.equipos} onChange={set('equipos')} readOnly={readOnly} />
        <Line label={LABELS.falla} value={datos.falla} onChange={set('falla')} readOnly={readOnly} />
        <Line label="" value={datos.fallaExtra} onChange={set('fallaExtra')} readOnly={readOnly} />

        <Spacer h={H.spacer} />

        {/* OBS */}
        <LabeledBox height={H.obsRow * 2} label={LABELS.obs}>
          <FillArea value={datos.obs} onChange={set('obs')} readOnly={readOnly} ariaLabel="Observaciones" />
        </LabeledBox>

        <Spacer h={H.spacer} />

        {/* Dos cajas: recepción / presupuesto */}
        <div style={{ display: 'flex', gap: GAP_W }}>
          <InfoBox width={LEFT_BOX_W}>
            <InfoRow label={LABELS.recepciono} value={datos.recepciono} onChange={set('recepciono')} readOnly={readOnly} divider />
            <InfoRow label={LABELS.codDesbloqueo} value={datos.codDesbloqueo} onChange={set('codDesbloqueo')} readOnly={readOnly} divider />
            <InfoRow label={LABELS.tel} value={datos.tel} onChange={set('tel')} readOnly={readOnly} />
          </InfoBox>
          <InfoBox width={RIGHT_BOX_W}>
            <InfoRow label={LABELS.presupuesto} value={datos.presupuesto} onChange={set('presupuesto')} readOnly={readOnly} divider />
            <InfoRow label={LABELS.sena} value={datos.sena} onChange={set('sena')} readOnly={readOnly} divider />
            <InfoRow label={LABELS.pendiente} value={datos.pendiente} onChange={set('pendiente')} readOnly={readOnly} />
          </InfoBox>
        </div>

        <Spacer h={H.spacer} />

        {/* Diagnóstico técnico */}
        <div style={{ border: `${BOX}px solid ${INK}`, height: H.diagRow * 2, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              height: H.diagRow,
              borderBottom: `${BOX}px solid ${INK}`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 4px',
              fontSize: FONT.body,
              fontWeight: 700,
            }}
          >
            {LABELS.diagnostico}
          </div>
          <FillArea value={datos.diagnostico} onChange={set('diagnostico')} readOnly={readOnly} ariaLabel="Diagnóstico técnico" />
        </div>

        <Spacer h={H.gSpacer} />

        {/* Garantía (texto fijo) */}
        <Garantia />

        <Spacer h={H.bottom} />
      </div>
    </div>
  )
}

/* ----------------------------- Encabezado --------------------------------- */

function Header({
  datos,
  set,
  readOnly,
}: {
  datos: RecepcionData
  set: (k: keyof RecepcionData) => (v: string) => void
  readOnly: boolean
}) {
  return (
    <div style={{ height: H.header, display: 'flex', alignItems: 'center' }}>
      {/* Identidad: logo + nombre + datos */}
      <div style={{ width: CONTENT_W - RIGHT_CLUSTER_W, display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={LOGO_CELTUC} alt="CelTuc" width={LOGO} height={LOGO} style={{ display: 'block', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: FONT.celtuc, fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1 }}>
            {EMPRESA.nombre}
          </div>
          <div style={{ fontSize: FONT.address, marginTop: 3 }}>{EMPRESA.direccion}</div>
          <div style={{ fontSize: FONT.social, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            <img src={ICON_INSTAGRAM} alt="" width={SOCIAL_ICON} height={SOCIAL_ICON} style={{ display: 'block' }} />
            <span>{EMPRESA.instagram}</span>
            <img src={ICON_FACEBOOK} alt="" width={SOCIAL_ICON} height={SOCIAL_ICON} style={{ display: 'block', marginLeft: 4 }} />
            <span>{EMPRESA.facebook}</span>
          </div>
        </div>
      </div>

      {/* Cupón + Fecha */}
      <div style={{ width: RIGHT_CLUSTER_W, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ width: LABEL_F_W, fontSize: FONT.body, fontWeight: 600 }}>{LABELS.cupon}</span>
          <div style={{ flex: 1, height: 20, border: `${BOX}px solid ${INK}` }}>
            <FillInput value={datos.cupon} onChange={set('cupon')} readOnly={readOnly} align="center" ariaLabel="Número de cupón" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ width: LABEL_F_W, fontSize: FONT.body, fontWeight: 600 }}>{LABELS.fecha}</span>
          <div style={{ display: 'flex', height: 20, border: `${BOX}px solid ${INK}` }}>
            <DateCell width={DATE_BOX[0]} value={datos.fechaDia} onChange={set('fechaDia')} readOnly={readOnly} aria="Día" />
            <DateCell width={DATE_BOX[1]} value={datos.fechaMes} onChange={set('fechaMes')} readOnly={readOnly} aria="Mes" divider />
            <DateCell width={DATE_BOX[2]} value={datos.fechaAnio} onChange={set('fechaAnio')} readOnly={readOnly} aria="Año" divider />
          </div>
        </div>
      </div>
    </div>
  )
}

function DateCell({
  width,
  value,
  onChange,
  readOnly,
  aria,
  divider,
}: {
  width: number
  value: string
  onChange: (v: string) => void
  readOnly: boolean
  aria: string
  divider?: boolean
}) {
  return (
    <div style={{ width, borderLeft: divider ? `${BOX}px solid ${INK}` : undefined }}>
      <FillInput value={value} onChange={onChange} readOnly={readOnly} align="center" ariaLabel={aria} maxLength={4} />
    </div>
  )
}

/* ------------------------- Renglón con subrayado -------------------------- */

function Line({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  readOnly: boolean
}) {
  return (
    <div style={{ height: H.line, display: 'flex', alignItems: 'flex-end', fontSize: FONT.body, gap: 6 }}>
      {label && <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{label}</span>}
      <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
        <FillInput value={value} onChange={onChange} readOnly={readOnly} ariaLabel={label || 'Continuación de la falla'} />
      </div>
    </div>
  )
}

/* ------------------------------ Cajas ------------------------------------- */

function LabeledBox({ height, label, children }: { height: number; label: string; children: ReactNode }) {
  return (
    <div style={{ border: `${BOX}px solid ${INK}`, height, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, minHeight: 0 }}>
        <span style={{ fontSize: FONT.body, fontWeight: 700, padding: '2px 4px', whiteSpace: 'nowrap' }}>{label}</span>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
    </div>
  )
}

function InfoBox({ width, children }: { width: number; children: ReactNode }) {
  return <div style={{ width, border: `${BOX}px solid ${INK}` }}>{children}</div>
}

function InfoRow({
  label,
  value,
  onChange,
  readOnly,
  divider,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  readOnly: boolean
  divider?: boolean
}) {
  return (
    <div
      style={{
        height: H.infoRow,
        display: 'flex',
        alignItems: 'center',
        borderBottom: divider ? `${BOX}px solid ${INK}` : undefined,
        fontSize: FONT.body,
        padding: '0 3px',
        gap: 4,
      }}
    >
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <FillInput value={value} onChange={onChange} readOnly={readOnly} ariaLabel={label} />
      </div>
    </div>
  )
}

function Garantia() {
  return (
    <div
      style={{
        border: `${BOX}px solid ${INK}`,
        height: H.garantiaRow * 9 + H.garantiaLast,
        padding: '3px 4px',
        fontSize: FONT.warranty,
        lineHeight: 1.12,
        textAlign: 'justify',
        overflow: 'hidden',
      }}
    >
      {GARANTIA_RUNS.map((run, i) => (
        <span key={i} style={{ fontWeight: run.bold ? 700 : 400 }}>
          {renderWithBreaks(run.t)}
        </span>
      ))}
    </div>
  )
}

/** Convierte los `\n` del texto en saltos de línea reales. */
function renderWithBreaks(text: string): ReactNode[] {
  return text.split('\n').map((p, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {p}
    </span>
  ))
}

/* ------------------------- Inputs de relleno ------------------------------ */

const fillBase: CSSProperties = {
  font: 'inherit',
  color: DATA,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  width: '100%',
  minWidth: 0,
  padding: 0,
  margin: 0,
  boxSizing: 'border-box',
}

function FillInput({
  value,
  onChange,
  readOnly,
  align = 'left',
  ariaLabel,
  maxLength,
}: {
  value: string
  onChange: (v: string) => void
  readOnly: boolean
  align?: CSSProperties['textAlign']
  ariaLabel: string
  maxLength?: number
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      aria-label={ariaLabel}
      maxLength={maxLength}
      className="ct-doc-field"
      style={{ ...fillBase, textAlign: align, fontWeight: 400, height: '100%' }}
    />
  )
}

function FillArea({
  value,
  onChange,
  readOnly,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  readOnly: boolean
  ariaLabel: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      aria-label={ariaLabel}
      className="ct-doc-field"
      style={{ ...fillBase, height: '100%', resize: 'none', fontWeight: 400, lineHeight: 1.15, padding: '2px 2px' }}
    />
  )
}

function Spacer({ h }: { h: number }) {
  return <div style={{ height: h }} aria-hidden />
}
