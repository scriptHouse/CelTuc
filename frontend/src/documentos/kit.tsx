import type { CSSProperties, ReactNode } from 'react'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA } from './content'

/* ============================================================================
 * Kit de primitivas para los documentos de CelTuc (preview HTML rellenable).
 * El papel es SIEMPRE claro (es un documento). Lo comparten todos los formularios
 * salvo Recepción/Reparación, que quedaron con su implementación original.
 * ========================================================================== */

export const INK = '#0a0a0b' // texto y bordes
export const DATA = '#16161a' // datos cargados
export const SANS = "'Inter', system-ui, sans-serif"
/** Puntos del Excel → px a 96 dpi. */
export const pt = (n: number) => (n * 4) / 3
export const FRAME = 2
export const BOX = 1.5

export type Setter = (v: string) => void

/* ----------------------------- Inputs ------------------------------------- */

const fieldBase: CSSProperties = {
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
  fontWeight: 400,
}

export function Field({
  value,
  onChange,
  readOnly,
  align = 'left',
  ariaLabel,
  maxLength,
  style,
}: {
  value: string
  onChange: Setter
  readOnly?: boolean
  align?: CSSProperties['textAlign']
  ariaLabel: string
  maxLength?: number
  style?: CSSProperties
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
      style={{ ...fieldBase, textAlign: align, height: '100%', ...style }}
    />
  )
}

export function Area({
  value,
  onChange,
  readOnly,
  ariaLabel,
  style,
}: {
  value: string
  onChange: Setter
  readOnly?: boolean
  ariaLabel: string
  style?: CSSProperties
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      aria-label={ariaLabel}
      className="ct-doc-field"
      style={{ ...fieldBase, height: '100%', resize: 'none', lineHeight: 1.15, padding: '2px 2px', ...style }}
    />
  )
}

/** Input en línea (para blancos dentro de un párrafo), con subrayado propio. */
export function Inline({
  value,
  onChange,
  readOnly,
  ariaLabel,
  width,
}: {
  value: string
  onChange: Setter
  readOnly?: boolean
  ariaLabel: string
  width: number | string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      aria-label={ariaLabel}
      className="ct-doc-field"
      style={{
        ...fieldBase,
        display: 'inline',
        width,
        borderBottom: `1px solid ${INK}`,
        textAlign: 'center',
        color: DATA,
      }}
    />
  )
}

/* ----------------------------- Estructura --------------------------------- */

export function Paper({ width, height, children }: { width: number; height?: number; children: ReactNode }) {
  return (
    <div
      style={{
        width,
        height,
        boxSizing: 'border-box',
        border: `${FRAME}px solid ${INK}`,
        background: '#fff',
        color: INK,
        fontFamily: SANS,
        lineHeight: 1.1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  )
}

export function TitleBar({ children, height = 26.8, fontSize = pt(14) }: { children: ReactNode; height?: number; fontSize?: number }) {
  return (
    <div
      style={{
        height,
        borderBottom: `${FRAME}px solid ${INK}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 700,
        letterSpacing: '0.01em',
        textAlign: 'center',
        padding: '0 6px',
      }}
    >
      {children}
    </div>
  )
}

export function Body({ padL, padR, children }: { padL: number; padR: number; children: ReactNode }) {
  return (
    <div
      style={{ paddingLeft: padL, paddingRight: padR, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      {children}
    </div>
  )
}

export function Spacer({ h }: { h: number }) {
  return <div style={{ height: h }} aria-hidden />
}

/* ------------------------ Encabezado CelTuc ------------------------------- */

/* ===== Geometría del formato estándar (Excel nuevo): 776 px de ancho ===== */
export const STD_W = 776
export const STD_PAD = 11
export const STD_CONTENT_W = STD_W - STD_PAD * 2 // 754 (columnas B…I)
const HDR_LEFT_W = 399 // columnas B…E
const HDR_LABEL_W = 85 // columna F
const HDR_BOX_W = 270 // columnas G…I

/**
 * Encabezado CelTuc del formato nuevo: logo + identidad (filas 2-4) y, a la
 * derecha, CUPON N° (fila 2) y FECHA en tres cajas (fila 3).
 */
export function CtHeader({
  cupon,
  onCupon,
  dia,
  mes,
  anio,
  onDia,
  onMes,
  onAnio,
  readOnly,
  socials = 'redes',
  direccion = EMPRESA.direccion,
}: {
  cupon: string
  onCupon: Setter
  dia: string
  mes: string
  anio: string
  onDia: Setter
  onMes: Setter
  onAnio: Setter
  readOnly?: boolean
  /** 'redes' = @CelTuc /CelTuc ; 'simple' = CelTuc CelTuc. */
  socials?: 'redes' | 'simple'
  /** Dirección configurable del encabezado. */
  direccion?: string
}) {
  return (
    <div style={{ height: 60, display: 'flex' }}>
      <div style={{ width: HDR_LEFT_W, display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={LOGO_CELTUC} alt="CelTuc" width={56} height={56} style={{ display: 'block', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: pt(16), fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1 }}>{EMPRESA.nombre}</div>
          <div style={{ fontSize: pt(8), marginTop: 2 }}>{direccion}</div>
          <div style={{ fontSize: pt(9), marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <img src={ICON_INSTAGRAM} alt="" width={13} height={13} style={{ display: 'block' }} />
            <span>{socials === 'simple' ? 'CelTuc' : EMPRESA.instagram}</span>
            <img src={ICON_FACEBOOK} alt="" width={13} height={13} style={{ display: 'block', marginLeft: 4 }} />
            <span>{socials === 'simple' ? 'CelTuc' : EMPRESA.facebook}</span>
          </div>
        </div>
      </div>

      <div style={{ width: STD_CONTENT_W - HDR_LEFT_W }}>
        <div style={{ height: 20, display: 'flex', alignItems: 'center' }}>
          <span style={{ width: HDR_LABEL_W, fontSize: pt(11), textAlign: 'center' }}>CUPON N°</span>
          <div style={{ width: HDR_BOX_W, height: 20, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
            <Field value={cupon} onChange={onCupon} readOnly={readOnly} align="center" ariaLabel="Número de cupón" />
          </div>
        </div>
        <div style={{ height: 20, display: 'flex', alignItems: 'center' }}>
          <span style={{ width: HDR_LABEL_W, fontSize: pt(11), textAlign: 'center' }}>FECHA</span>
          <div style={{ width: HDR_BOX_W, display: 'flex', height: 20, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
            <div style={{ flex: 96 }}>
              <Field value={dia} onChange={onDia} readOnly={readOnly} align="center" ariaLabel="Día" maxLength={2} />
            </div>
            <div style={{ flex: 96, borderLeft: `${BOX}px solid ${INK}` }}>
              <Field value={mes} onChange={onMes} readOnly={readOnly} align="center" ariaLabel="Mes" maxLength={2} />
            </div>
            <div style={{ flex: 78, borderLeft: `${BOX}px solid ${INK}` }}>
              <Field value={anio} onChange={onAnio} readOnly={readOnly} align="center" ariaLabel="Año" maxLength={4} />
            </div>
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>
    </div>
  )
}

/** Ancho de las columnas de firma: llenan el ancho útil, balanceadas. */
const SIGN_COL = 326
const SIGN_GAP = STD_CONTENT_W - SIGN_COL * 2 // 102
const SIGN_LINE = '________________________________________________'

/** Bloque de firmas al pie: dos columnas balanceadas (línea + leyenda). */
export function FirmaBlock({ izq = 'FIRMA', der = 'ACLARACION' }: { izq?: string; der?: string }) {
  return (
    <div style={{ display: 'flex', paddingBottom: 2 }}>
      <FirmaCol caption={izq} />
      <div style={{ width: SIGN_GAP }} />
      <FirmaCol caption={der} />
    </div>
  )
}

function FirmaCol({ caption }: { caption: string }) {
  return (
    <div style={{ width: SIGN_COL, textAlign: 'center' }}>
      <div style={{ fontSize: pt(8) }}>{SIGN_LINE}</div>
      <div style={{ fontSize: pt(8), fontWeight: 700, marginTop: 2, letterSpacing: '0.02em' }}>{caption}</div>
    </div>
  )
}

/**
 * Esqueleto de los documentos estándar (Compra, Reparación, Extensión,
 * Compra mayorista): marco + título + encabezado + [contenido] + garantía + firmas.
 */
export function DocShell({
  titulo,
  height,
  cupon,
  onCupon,
  dia,
  mes,
  anio,
  onDia,
  onMes,
  onAnio,
  readOnly,
  garantia,
  firmaIzq,
  firmaDer,
  direccion,
  children,
}: {
  titulo: string
  height: number
  cupon: string
  onCupon: Setter
  dia: string
  mes: string
  anio: string
  onDia: Setter
  onMes: Setter
  onAnio: Setter
  readOnly?: boolean
  garantia: Run[]
  firmaIzq?: string
  firmaDer?: string
  direccion?: string
  children: ReactNode
}) {
  return (
    <Paper width={STD_W} height={height}>
      <TitleBar height={20} fontSize={pt(10)}>
        {titulo}
      </TitleBar>
      <Body padL={STD_PAD} padR={STD_PAD}>
        <CtHeader
          cupon={cupon}
          onCupon={onCupon}
          dia={dia}
          mes={mes}
          anio={anio}
          onDia={onDia}
          onMes={onMes}
          onAnio={onAnio}
          readOnly={readOnly}
          direccion={direccion}
        />
        <Spacer h={7} />
        {children}
        <Spacer h={10} />
        <GarantiaBox runs={garantia} fontSize={pt(7)} />
        <Spacer h={8} />
        <FirmaBlock izq={firmaIzq} der={firmaDer} />
      </Body>
    </Paper>
  )
}

/* --------------------------- Renglón con línea ---------------------------- */

export function UnderlineLine({
  label,
  value,
  onChange,
  readOnly,
  height = 18.8,
  fontSize = pt(11),
  ariaLabel,
}: {
  label: string
  value: string
  onChange: Setter
  readOnly?: boolean
  height?: number
  fontSize?: number
  ariaLabel?: string
}) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'flex-end', fontSize, gap: 6 }}>
      {label && <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{label}</span>}
      <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
        <Field value={value} onChange={onChange} readOnly={readOnly} ariaLabel={ariaLabel || label || 'Campo'} />
      </div>
    </div>
  )
}

/* -------------------------------- Cajas ----------------------------------- */

export function Box({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ border: `${BOX}px solid ${INK}`, ...style }}>{children}</div>
}

/** Caja con etiqueta en negrita arriba a la izquierda y un área de texto. */
export function LabeledBox({
  label,
  height,
  children,
  fontSize = pt(11),
}: {
  label: string
  height: number
  children: ReactNode
  fontSize?: number
}) {
  return (
    <div style={{ border: `${BOX}px solid ${INK}`, height, display: 'flex' }}>
      <span style={{ fontSize, fontWeight: 700, padding: '2px 4px', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

/** Línea de firma: subrayado de puntos + leyenda centrada. */
export function SignBox({ caption, width }: { caption: string; width?: number | string }) {
  return (
    <div style={{ width, textAlign: 'center', fontSize: pt(10) }}>
      <div style={{ borderTop: `1px solid ${INK}`, marginTop: 14 }} />
      <div style={{ fontWeight: 700, marginTop: 2 }}>{caption}</div>
    </div>
  )
}

/* ------------------------ Texto de garantía ------------------------------- */

export interface Run {
  t: string
  bold?: boolean
}

export function GarantiaBox({
  runs,
  height,
  fontSize = pt(7),
}: {
  runs: Run[]
  /** Alto fijo; si se omite, ocupa el espacio restante (flex). */
  height?: number
  fontSize?: number
}) {
  return (
    <div
      style={{
        border: `${BOX}px solid ${INK}`,
        height,
        flex: height === undefined ? 1 : undefined,
        minHeight: 0,
        padding: '5px 7px',
        fontSize,
        lineHeight: 1.28,
        textAlign: 'justify',
        overflow: 'hidden',
      }}
    >
      {runs.map((run, i) => (
        <span key={i} style={{ fontWeight: run.bold ? 700 : 400 }}>
          {withBreaks(run.t)}
        </span>
      ))}
    </div>
  )
}

export function withBreaks(text: string): ReactNode[] {
  return text.split('\n').map((p, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {p}
    </span>
  ))
}
