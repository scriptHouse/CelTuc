import type { ReactNode } from 'react'
import { BOX, DATA, DocShell, Field, INK, STD_CONTENT_W, UnderlineLine, pt } from './kit'
import {
  SENA18_CAMPOS_COLOR,
  SENA18_COLORES,
  SENA18_EQUIPOS,
  SENA18_H,
  SENA18_LABELS,
  SENA18_NOTAS,
  SENA18_RUNS_COMPROBANTE,
  SENA18_TITULO,
  type Sena18Data,
} from './sena18Content'
import type { PaperProps } from './types'

/* Anchos tomados de la grilla del Excel (ver `STD_COLS` en `kitXlsx`). */
const ETQ_W = 181 // columnas B–C: las etiquetas de los renglones con caja
const VAL_W = 220 // columnas D–E: sus valores
const CAJA_W = ETQ_W + VAL_W // 401
const ENTREGA_W = 298 // columnas B–D: el equipo que se entrega
const PRECIO_W = 173 // columnas H–I: su precio
const ENTREGA_GAP = STD_CONTENT_W - ENTREGA_W - PRECIO_W // 283 (columnas E–G)

/** Alto de una fila del Excel (15 pt) en px. */
const FILA = 20

export function Sena18Paper({ datos, onChange, readOnly, direccion }: PaperProps<Sena18Data>) {
  const set = (k: keyof Sena18Data) => (v: string) => onChange({ [k]: v })

  return (
    <DocShell
      titulo={SENA18_TITULO}
      height={SENA18_H}
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
      garantia={SENA18_RUNS_COMPROBANTE}
      // Las cuatro notas van al mismo cuerpo que en el Excel (10 pt), más
      // grande que el de los otros documentos porque el texto es más corto.
      garantiaFontSize={pt(10)}
    >
      {/* Renglones */}
      <div style={{ height: FILA, display: 'flex', alignItems: 'flex-end', fontSize: pt(10), gap: 5 }}>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{SENA18_LABELS.recibiDe}</span>
        <div style={{ flex: 1, borderBottom: `1px solid ${INK}`, minWidth: 0 }}>
          <Field value={datos.recibiDe} onChange={set('recibiDe')} readOnly={readOnly} ariaLabel="Recibí de" />
        </div>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingBottom: 2 }}>{SENA18_LABELS.dni}</span>
        <div style={{ width: 250, borderBottom: `1px solid ${INK}` }}>
          <Field value={datos.dni} onChange={set('dni')} readOnly={readOnly} ariaLabel="DNI" />
        </div>
      </div>
      <UnderlineLine label={SENA18_LABELS.laSuma} value={datos.laSuma} onChange={set('laSuma')} readOnly={readOnly} height={FILA} fontSize={pt(10)} />
      <UnderlineLine label={SENA18_LABELS.concepto} value={datos.concepto} onChange={set('concepto')} readOnly={readOnly} height={FILA} fontSize={pt(10)} />
      <UnderlineLine label="" value={datos.conceptoExtra} onChange={set('conceptoExtra')} readOnly={readOnly} height={FILA} fontSize={pt(10)} ariaLabel="Concepto (continuación)" />

      <div style={{ height: FILA }} />

      {/* SEÑA / TIPO DE CAMBIO / SALDO */}
      <div style={{ width: CAJA_W, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
        <FilaConCaja label={SENA18_LABELS.sena} divider>
          <Field value={datos.sena} onChange={set('sena')} readOnly={readOnly} align="center" ariaLabel={SENA18_LABELS.sena} />
        </FilaConCaja>
        <FilaConCaja label={SENA18_LABELS.tipoCambio} divider>
          <Field value={datos.tipoCambio} onChange={set('tipoCambio')} readOnly={readOnly} align="center" ariaLabel={SENA18_LABELS.tipoCambio} />
        </FilaConCaja>
        <FilaConCaja label={SENA18_LABELS.saldo}>
          <Field value={datos.saldo} onChange={set('saldo')} readOnly={readOnly} align="center" ariaLabel={SENA18_LABELS.saldo} />
        </FilaConCaja>
      </div>

      <div style={{ height: FILA }} />
      <NotaBox texto={SENA18_NOTAS.cotizacion} />
      <div style={{ height: FILA }} />

      {/* Equipo que entrega en parte de pago + su precio */}
      <div style={{ height: FILA, display: 'flex', alignItems: 'center', fontSize: pt(11), fontWeight: 700 }}>
        <span style={{ width: ENTREGA_W, textAlign: 'center' }}>{SENA18_LABELS.entrega}</span>
        <span style={{ width: ENTREGA_GAP }} />
        <span style={{ width: PRECIO_W, textAlign: 'center' }}>{SENA18_LABELS.precio}</span>
      </div>
      <div style={{ height: FILA, display: 'flex', border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
        <div style={{ width: ENTREGA_W, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Desplegable
            value={datos.entrega}
            onChange={set('entrega')}
            opciones={SENA18_EQUIPOS}
            readOnly={readOnly}
            ariaLabel="Equipo que entrega en parte de pago"
            placeholder="— elegir equipo —"
          />
        </div>
        <div style={{ width: ENTREGA_GAP }} />
        <div style={{ width: PRECIO_W, display: 'flex', alignItems: 'center' }}>
          <Field value={datos.entregaPrecio} onChange={set('entregaPrecio')} readOnly={readOnly} align="center" ariaLabel="Precio del equipo que entrega" />
        </div>
      </div>

      <div style={{ height: FILA }} />

      {/* Nota de los colores: en el Excel no es una caja, solo una regla arriba */}
      <NotaBox texto={SENA18_NOTAS.colores} soloRegla />

      <div style={{ height: FILA }} />

      {/* COLOR 1 … COLOR 4, por orden de preferencia */}
      <div style={{ width: CAJA_W, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
        {SENA18_CAMPOS_COLOR.map(({ campo, label }, i) => (
          <FilaConCaja key={campo} label={label} divider={i < SENA18_CAMPOS_COLOR.length - 1}>
            <Desplegable
              value={datos[campo]}
              onChange={set(campo)}
              opciones={SENA18_COLORES}
              readOnly={readOnly}
              ariaLabel={label}
              placeholder="— elegir color —"
              align="center"
            />
          </FilaConCaja>
        ))}
      </div>

      <div style={{ height: FILA }} />
      <NotaBox texto={SENA18_NOTAS.plazo} />
      {/* Cierra la fila de aire que el `DocShell` arranca con sus 10 px. */}
      <div style={{ height: 10 }} />
    </DocShell>
  )
}

/**
 * Una de las notas del papel. Crece con su contenido (no lleva alto fijo): así
 * ninguna se recorta si la tipografía de pantalla parte el texto en un renglón
 * más que la del PDF, y la diferencia la absorbe la caja del pie.
 *
 * `soloRegla` es la nota de los colores: en el Excel no está encajada, solo
 * tiene una línea arriba que la separa de lo anterior.
 */
function NotaBox({ texto, soloRegla }: { texto: string; soloRegla?: boolean }) {
  return (
    <div
      style={{
        border: soloRegla ? undefined : `${BOX}px solid ${INK}`,
        borderTop: soloRegla ? `1px solid ${INK}` : undefined,
        padding: soloRegla ? '5px 0 0' : '5px 7px',
        fontSize: pt(10),
        lineHeight: 1.28,
        textAlign: 'justify',
        whiteSpace: 'pre-line',
      }}
    >
      {texto}
    </div>
  )
}

/** Renglón de una caja: etiqueta a la izquierda y el valor a la derecha. */
function FilaConCaja({
  label,
  divider,
  children,
}: {
  label: string
  divider?: boolean
  children: ReactNode
}) {
  return (
    <div
      style={{
        height: FILA,
        display: 'flex',
        alignItems: 'center',
        borderBottom: divider ? `${BOX}px solid ${INK}` : undefined,
        fontSize: pt(11),
      }}
    >
      <span
        style={{
          width: ETQ_W,
          alignSelf: 'stretch',
          borderRight: `${BOX}px solid ${INK}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', padding: '0 4px' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * Desplegable con la pinta de un campo del documento (sin bordes ni flecha
 * nativa). El Excel resuelve el equipo entregado y los colores con listas: acá
 * se hace igual, y al exportar salen como texto plano.
 */
function Desplegable({
  value,
  onChange,
  opciones,
  readOnly,
  ariaLabel,
  placeholder,
  align = 'left',
}: {
  value: string
  onChange: (v: string) => void
  opciones: readonly string[]
  readOnly?: boolean
  ariaLabel: string
  placeholder?: string
  align?: 'left' | 'center'
}) {
  if (readOnly) {
    return <span style={{ display: 'block', width: '100%', fontSize: pt(11), color: DATA, textAlign: align }}>{value}</span>
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="ct-doc-field"
      style={{
        font: 'inherit',
        fontSize: pt(11),
        color: DATA,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        width: '100%',
        textAlign: align,
        padding: 0,
        margin: 0,
        appearance: 'none',
        cursor: 'pointer',
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {opciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}
