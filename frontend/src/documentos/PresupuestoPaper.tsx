import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import type { CategoriaTarjeta, Tarjeta } from '@/types'
import { listarTarjetas } from '@/services/simulador'
import { obtenerConfiguracion } from '@/services/preciosService'
import { Area, BOX, DATA, Field, INK, Paper, Spacer, TitleBar, pt } from './kit'
import { LOGO_CELTUC, ICON_FACEBOOK, ICON_INSTAGRAM } from './assets'
import { EMPRESA, lineaDireccion } from './content'
import {
  CONDICIONES,
  CUOTAS_LABELS,
  EQUIPO_H,
  EQUIPO_LABELS,
  EQUIPO_TITULO,
  EQUIPO_W,
  FINANCIACION_TITULO,
  NOTA_EQUIPO,
  NOTA_SERVICE,
  SERVICE_H,
  SERVICE_LABELS,
  SERVICE_TITULO,
  SERVICE_W,
  SIN_PLANES,
  calcularCuotas,
  contadoDesdeLista,
  sinOcultos,
  dolares,
  pesos,
  totalesEquipo,
  totalesService,
  type PlanPresupuesto,
  type PresupuestoEquipoData,
  type PresupuestoServiceData,
} from './presupuestoComun'
import type { PaperProps } from './types'

/**
 * Los dos presupuestos (Equipo y Service) en su versión rellenable.
 *
 * A diferencia del resto de los documentos, estos no son 100 % texto libre: los
 * totales y la tabla de cuotas se CALCULAN. Los recargos salen del simulador y
 * el dólar/descuento cash, de Precios Service; los dos se cargan solos la
 * primera vez y quedan guardados en el documento (ver `presupuestoComun.ts`),
 * así el PDF y el Excel muestran exactamente lo mismo sin volver a consultar.
 *
 * Todo lo prellenado se puede pisar a mano: el papel manda.
 */

const PAD = 14
/** Mismo alto de celda que el PDF (ver `PresupuestoPdf.tsx`): así el preview
 *  y el papel impreso miden exactamente lo mismo. */
const FILA_H = 22

/* ===================== Piezas compartidas ===================== */

/** Encabezado: identidad a la izquierda y los datos del presupuesto a la derecha. */
function Cabecera({
  filas,
  direccion = EMPRESA.direccion,
}: {
  filas: Array<{ label: string; nodo: ReactNode }>
  direccion?: string
}) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <img src={LOGO_CELTUC} alt="CelTuc" width={56} height={56} style={{ display: 'block', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: pt(16), fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1 }}>
            {EMPRESA.nombre}
          </div>
          <div style={{ fontSize: pt(8), marginTop: 2 }}>{lineaDireccion(direccion)}</div>
          <div style={{ fontSize: pt(9), marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <img src={ICON_INSTAGRAM} alt="" width={13} height={13} style={{ display: 'block' }} />
            <span>{EMPRESA.instagram}</span>
            <img src={ICON_FACEBOOK} alt="" width={13} height={13} style={{ display: 'block', marginLeft: 4 }} />
            <span>{EMPRESA.facebook}</span>
          </div>
        </div>
      </div>
      <div style={{ width: 330 }}>
        {filas.map(({ label, nodo }) => (
          <div key={label} style={{ height: FILA_H, display: 'flex', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ width: 118, fontSize: pt(9), fontWeight: 700, textAlign: 'right', paddingRight: 6 }}>
              {label}
            </span>
            <div
              style={{
                flex: 1,
                height: FILA_H,
                border: `${BOX}px solid ${INK}`,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {nodo}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Rótulo de sección: negrita, chico y en versalitas, como en la planilla. */
function Rotulo({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: pt(9), fontWeight: 700, letterSpacing: '0.03em', paddingBottom: 2, ...style }}>
      {children}
    </div>
  )
}

/** Caja con un campo adentro (el gris rellenable del Excel). */
function CajaCampo({
  children,
  width,
  height = 22,
}: {
  children: ReactNode
  width?: number | string
  height?: number
}) {
  return (
    <div
      style={{
        width,
        height,
        border: `${BOX}px solid ${INK}`,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        padding: '0 5px',
      }}
    >
      {children}
    </div>
  )
}

/**
 * Desplegable con la pinta de un campo del documento (sin bordes ni flecha
 * nativa). El Excel resuelve Condición y Tarjeta con listas: acá se hace igual,
 * y al exportar sale como texto plano.
 */
function Desplegable({
  value,
  onChange,
  opciones,
  readOnly,
  ariaLabel,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  opciones: string[]
  readOnly?: boolean
  ariaLabel: string
  placeholder?: string
}) {
  if (readOnly) {
    return <span style={{ fontSize: pt(11), color: DATA }}>{value}</span>
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

/**
 * Tabla de financiación: una fila por plan del simulador.
 *
 * En edición, cada fila trae un tacho para sacarla del papel (`onQuitar`). El
 * botón vive SOLO acá: el PDF y el Excel se arman con `datos.planes`, así que
 * lo que se quita no sale impreso.
 */
function TablaCuotas({
  base,
  planes,
  onQuitar,
  vacioTexto = SIN_PLANES,
}: {
  base: number
  planes: PlanPresupuesto[]
  onQuitar?: (indice: number) => void
  /** Qué decir cuando no hay ninguna fila. */
  vacioTexto?: string
}) {
  const filas = calcularCuotas(base, planes)
  const col = { cuota: 250, total: 1, valor: 1 }
  return (
    <div style={{ border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', height: FILA_H, borderBottom: `${BOX}px solid ${INK}`, fontSize: pt(10), fontWeight: 700 }}>
        <div style={{ width: col.cuota, display: 'flex', alignItems: 'center', padding: '0 6px' }}>
          {CUOTAS_LABELS.cuota}
        </div>
        <div
          style={{
            flex: col.total,
            borderLeft: `${BOX}px solid ${INK}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {CUOTAS_LABELS.total}
        </div>
        <div
          style={{
            flex: col.valor,
            borderLeft: `${BOX}px solid ${INK}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {CUOTAS_LABELS.valor}
        </div>
      </div>
      {filas.length === 0 ? (
        <div style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: pt(9) }}>
          {vacioTexto}
        </div>
      ) : (
        filas.map((fila, i) => (
          <div
            key={`${fila.etiqueta}-${fila.cuotas}`}
            style={{
              display: 'flex',
              height: FILA_H,
              fontSize: pt(10),
              borderTop: i === 0 ? undefined : `1px solid ${INK}`,
              position: 'relative',
            }}
          >
            <div style={{ width: col.cuota, display: 'flex', alignItems: 'center', padding: '0 6px' }}>
              {fila.etiqueta}
            </div>
            <div
              style={{
                flex: col.total,
                borderLeft: `${BOX}px solid ${INK}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: DATA,
              }}
            >
              {pesos(fila.total)}
            </div>
            <div
              style={{
                flex: col.valor,
                borderLeft: `${BOX}px solid ${INK}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: DATA,
              }}
            >
              {pesos(fila.valorCuota)}
            </div>
            {onQuitar && (
              <button
                type="button"
                onClick={() => onQuitar(i)}
                title={`Quitar «${fila.etiqueta}» de este presupuesto`}
                aria-label={`Quitar la opción ${fila.etiqueta}`}
                className="ct-quitar-cuota"
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 18,
                  height: 18,
                  display: 'grid',
                  placeItems: 'center',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#9A9AA2',
                  padding: 0,
                  lineHeight: 0,
                }}
              >
                <Trash2 style={{ width: 12, height: 12 }} aria-hidden />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  )
}

/**
 * Bloque de financiación completo: título, selector de tarjeta y tabla.
 *
 * Las filas son SIEMPRE las de la tarjeta elegida en el simulador; cambiar de
 * tarjeta recarga sus planes. En edición se puede sacar del papel las que no se
 * le muestran al cliente, y el aviso de abajo deja volver a traerlas.
 */
function Financiacion({
  base,
  planes,
  tarjeta,
  tarjetas,
  onTarjeta,
  onQuitarPlan,
  onRestaurarPlanes,
  faltan,
  readOnly,
}: {
  base: number
  planes: PlanPresupuesto[]
  tarjeta: string
  tarjetas: Tarjeta[]
  onTarjeta: (nombre: string) => void
  onQuitarPlan?: (indice: number) => void
  onRestaurarPlanes?: () => void
  /** Cuántos planes de la tarjeta no están en el papel. */
  faltan?: number
  readOnly?: boolean
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 3 }}>
        <Rotulo style={{ paddingBottom: 0, flex: 1 }}>{FINANCIACION_TITULO}</Rotulo>
        <span style={{ fontSize: pt(9), fontWeight: 700 }}>{CUOTAS_LABELS.tarjeta}</span>
        <CajaCampo width={190} height={FILA_H}>
          <Desplegable
            value={tarjeta}
            onChange={onTarjeta}
            opciones={tarjetas.map((t) => t.nombre)}
            readOnly={readOnly}
            ariaLabel="Tarjeta"
            placeholder="Elegir tarjeta"
          />
        </CajaCampo>
      </div>
      <TablaCuotas
        base={base}
        planes={planes}
        onQuitar={readOnly ? undefined : onQuitarPlan}
        // Con tarjeta elegida y sin filas, el problema no es la tarjeta: se
        // sacaron todas (el aviso de abajo ofrece traerlas de vuelta).
        vacioTexto={tarjeta ? 'Sin opciones de financiación en este presupuesto.' : SIN_PLANES}
      />
      {!readOnly && !!faltan && onRestaurarPlanes && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingTop: 3,
            fontSize: pt(8),
            color: '#6B6B74',
          }}
        >
          <span>
            {faltan === 1
              ? '1 opción de esta tarjeta no se muestra en el presupuesto.'
              : `${faltan} opciones de esta tarjeta no se muestran en el presupuesto.`}
          </span>
          <button
            type="button"
            onClick={onRestaurarPlanes}
            className="ct-restaurar-cuotas"
            style={{
              border: '1px solid #C9C9D0',
              background: 'transparent',
              borderRadius: 6,
              padding: '1px 7px',
              fontSize: pt(8),
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            Restaurar del simulador
          </button>
        </div>
      )}
    </>
  )
}

function Nota({ texto }: { texto: string }) {
  return (
    <div
      style={{
        border: `${BOX}px solid ${INK}`,
        padding: '5px 7px',
        fontSize: pt(8),
        lineHeight: 1.3,
        textAlign: 'justify',
      }}
    >
      {texto}
    </div>
  )
}

/* ===================== Datos del simulador ===================== */

/** Los planes activos de una tarjeta, en su orden, listos para el documento. */
function planesDe(tarjeta: Tarjeta | undefined): PlanPresupuesto[] {
  if (!tarjeta) return []
  return tarjeta.planes
    .filter((p) => p.activo)
    .sort((a, b) => a.orden - b.orden || a.cuotas - b.cuotas)
    .map((p) => ({ etiqueta: p.etiqueta, cuotas: p.cuotas, interes: p.interes }))
}

/* ---------- Filas que no se quieren imprimir ----------
 *
 * La tabla del presupuesto sale del simulador, pero no todo lo que se simula se
 * le muestra al cliente: hay planes internos (Z, Prepaga, 3 Sucredito…) que
 * conviene dejar afuera del papel. Cada uno se quita con el tacho de su fila y
 * la decisión se RECUERDA por tarjeta, así no hay que repetirla en cada
 * presupuesto. El simulador no se toca: esto vive solo en este navegador y se
 * revierte con «Restaurar del simulador».
 */

const CLAVE_OCULTOS = 'celtuc:presupuesto:planes-ocultos:v1'

type PlanesOcultos = Record<string, string[]>

/**
 * La clave con la que se recuerda. Lleva la CATEGORÍA porque el mismo nombre de
 * tarjeta existe en las dos («NARANJA, VISA y MASTERCARD BANCARIZADA» está en
 * equipos y en accesorios, con planes distintos): sin esto, ocultar una fila en
 * el presupuesto de equipo se la ocultaría también al de service.
 */
const claveTarjeta = (categoria: CategoriaTarjeta, tarjeta: string) => `${categoria}:${tarjeta}`

/**
 * Con qué arranca una tarjeta que todavía nadie configuró: las opciones que no
 * se le muestran al cliente en el papel. «1 pago» no es financiación (ya es el
 * total) y Z / Prepaga / 3 Sucredito son planes internos del mostrador.
 *
 * Es sólo el punto de partida, no una regla: cualquiera se recupera con
 * «Restaurar del simulador», y a partir de ahí manda lo que se haya elegido.
 * Las etiquetas que una tarjeta no tenga se ignoran solas.
 */
const OCULTOS_INICIALES = ['1 pago', 'Z', 'Prepaga', '3 Sucredito']

function leerOcultos(): PlanesOcultos {
  try {
    const crudo = localStorage.getItem(CLAVE_OCULTOS)
    const datos = crudo ? (JSON.parse(crudo) as PlanesOcultos) : {}
    return datos && typeof datos === 'object' ? datos : {}
  } catch {
    return {}
  }
}

function guardarOcultos(datos: PlanesOcultos) {
  try {
    localStorage.setItem(CLAVE_OCULTOS, JSON.stringify(datos))
  } catch {
    /* sin localStorage la fila se quita igual: sólo no se recuerda */
  }
}

/**
 * Las etiquetas que esa tarjeta tiene ocultas hoy. Una tarjeta que nunca se
 * tocó arranca con `OCULTOS_INICIALES`; una que se restauró queda guardada con
 * la lista VACÍA, que es distinto de «sin configurar» (si no, restaurar y
 * volver a entrar traería de nuevo los iniciales).
 */
function ocultosDe(clave: string): string[] {
  const guardado = leerOcultos()[clave]
  return guardado ?? OCULTOS_INICIALES
}

function recordarOculto(clave: string, etiqueta: string) {
  const datos = leerOcultos()
  const actuales = datos[clave] ?? []
  if (!actuales.includes(etiqueta)) datos[clave] = [...actuales, etiqueta]
  guardarOcultos(datos)
}

/** «Esta tarjeta va completa»: lista vacía, no ausencia de configuración. */
function olvidarOcultos(clave: string) {
  const datos = leerOcultos()
  datos[clave] = []
  guardarOcultos(datos)
}

/** Los planes de la tarjeta, sin los que se hayan quitado antes. */
function planesVisiblesDe(
  tarjeta: Tarjeta | undefined,
  categoria: CategoriaTarjeta,
): PlanPresupuesto[] {
  const todos = planesDe(tarjeta)
  return tarjeta ? sinOcultos(todos, ocultosDe(claveTarjeta(categoria, tarjeta.nombre))) : todos
}

/**
 * Todo lo que el papel necesita para manejar la financiación: la lista de
 * tarjetas, elegir una (que recarga sus planes), quitar una fila y volver a
 * traer lo que dice el simulador.
 */
function useFinanciacion(
  categoria: CategoriaTarjeta,
  datos: { tarjeta: string; planes: PlanPresupuesto[] },
  onChange: (patch: { tarjeta?: string; planes?: PlanPresupuesto[] }) => void,
) {
  const tarjetas = useTarjetas(categoria)
  const eligioTarjeta = useRef(false)

  // La primera tarjeta se elige sola SOLO hasta que alguien toque el selector:
  // después manda la persona, incluso si deja el presupuesto sin financiación.
  useEffect(() => {
    if (eligioTarjeta.current || datos.tarjeta || !tarjetas.length) return
    onChange({
      tarjeta: tarjetas[0].nombre,
      planes: planesVisiblesDe(tarjetas[0], categoria),
    })
  }, [tarjetas, datos.tarjeta, onChange, categoria])

  const elegirTarjeta = (nombre: string) => {
    eligioTarjeta.current = true
    onChange({
      tarjeta: nombre,
      planes: planesVisiblesDe(tarjetas.find((t) => t.nombre === nombre), categoria),
    })
  }

  /** Saca una fila del papel (y se acuerda para los próximos presupuestos). */
  const quitarPlan = (indice: number) => {
    const plan = datos.planes[indice]
    if (!plan) return
    if (datos.tarjeta) recordarOculto(claveTarjeta(categoria, datos.tarjeta), plan.etiqueta)
    onChange({ planes: datos.planes.filter((_, i) => i !== indice) })
  }

  /** Vuelve a poner TODOS los planes vigentes de la tarjeta elegida. */
  const restaurarPlanes = () => {
    if (datos.tarjeta) olvidarOcultos(claveTarjeta(categoria, datos.tarjeta))
    onChange({ planes: planesDe(tarjetas.find((t) => t.nombre === datos.tarjeta)) })
  }

  // Cuántas filas de la tarjeta no están en el papel (quitadas a mano o porque
  // el simulador sumó planes después de armar este presupuesto).
  const enSimulador = planesDe(tarjetas.find((t) => t.nombre === datos.tarjeta)).length
  const faltan = Math.max(0, enSimulador - datos.planes.length)

  return { tarjetas, elegirTarjeta, quitarPlan, restaurarPlanes, faltan }
}

/**
 * Trae las tarjetas del simulador de una categoría. Si la cuenta no tiene
 * permiso para verlas, la consulta falla en silencio y el presupuesto se puede
 * completar igual a mano: nunca bloquea el documento.
 */
function useTarjetas(categoria: CategoriaTarjeta) {
  const { data = [] } = useQuery({
    queryKey: ['tarjetas'],
    queryFn: listarTarjetas,
    retry: false,
    staleTime: 5 * 60_000,
  })
  return useMemo(
    () =>
      data
        .filter((t) => t.activa && t.categoria === categoria)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [data, categoria],
  )
}

/** Configuración de Precios Service (dólar, descuento cash y redondeo). */
function useConfiguracion() {
  const { data } = useQuery({
    queryKey: ['precios-service-configuracion'],
    queryFn: obtenerConfiguracion,
    retry: false,
    staleTime: 5 * 60_000,
  })
  return data
}

/* ===================== Presupuesto de equipo ===================== */

export function PresupuestoEquipoPaper({
  datos,
  onChange,
  readOnly,
  direccion,
}: PaperProps<PresupuestoEquipoData>) {
  const set = (k: keyof PresupuestoEquipoData) => (v: string) => onChange({ [k]: v })
  const config = useConfiguracion()
  const { totalUsd, totalPesos } = totalesEquipo(datos)
  // Las opciones de financiación salen del simulador (categoría «equipos») y se
  // recargan al cambiar de tarjeta; el tacho de cada fila la saca del papel.
  const { tarjetas, elegirTarjeta, quitarPlan, restaurarPlanes, faltan } = useFinanciacion(
    'equipos',
    datos,
    onChange,
  )

  // El dólar del negocio se completa siempre que el campo esté vacío: sin
  // cotización el total en pesos daría $ 0, que nunca es lo que se quiere.
  useEffect(() => {
    if (!datos.dolar && config?.dolar) onChange({ dolar: String(config.dolar) })
  }, [config, datos.dolar, onChange])

  return (
    <Paper width={EQUIPO_W} height={EQUIPO_H}>
      <TitleBar height={20} fontSize={pt(10)}>
        {EQUIPO_TITULO}
      </TitleBar>
      <div style={{ padding: `8px ${PAD}px 10px`, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Cabecera
          direccion={direccion}
          filas={[
            {
              label: EQUIPO_LABELS.numero,
              nodo: (
                <Field value={datos.numero} onChange={set('numero')} readOnly={readOnly} align="center" ariaLabel="N° de presupuesto" />
              ),
            },
            {
              label: EQUIPO_LABELS.fecha,
              nodo: <Field value={datos.fecha} onChange={set('fecha')} readOnly={readOnly} align="center" ariaLabel="Fecha" />,
            },
            {
              label: EQUIPO_LABELS.vendedor,
              nodo: <Field value={datos.vendedor} onChange={set('vendedor')} readOnly={readOnly} align="center" ariaLabel="Vendedor" />,
            },
          ]}
        />

        <Spacer h={8} />

        {/* Cliente */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Rotulo>{EQUIPO_LABELS.cliente}</Rotulo>
            <CajaCampo>
              <Field value={datos.cliente} onChange={set('cliente')} readOnly={readOnly} ariaLabel="Cliente" style={{ fontSize: pt(11) }} />
            </CajaCampo>
          </div>
          <div style={{ width: 210 }}>
            <Rotulo>{EQUIPO_LABELS.telefono}</Rotulo>
            <CajaCampo>
              <Field value={datos.telefono} onChange={set('telefono')} readOnly={readOnly} ariaLabel="Teléfono" style={{ fontSize: pt(11) }} />
            </CajaCampo>
          </div>
        </div>

        <Spacer h={7} />

        {/* Equipo + precio */}
        <FilaEquipo
          label={EQUIPO_LABELS.equipo}
          labelPrecio={EQUIPO_LABELS.precio}
          valor={datos.equipo}
          onValor={set('equipo')}
          precio={datos.precioUsd}
          onPrecio={set('precioUsd')}
          readOnly={readOnly}
        />

        <Spacer h={7} />

        {/* Condición */}
        <div style={{ width: 220 }}>
          <Rotulo>{EQUIPO_LABELS.condicion}</Rotulo>
          <CajaCampo>
            <Desplegable
              value={datos.condicion}
              onChange={set('condicion')}
              opciones={[...CONDICIONES]}
              readOnly={readOnly}
              ariaLabel="Condición"
            />
          </CajaCampo>
        </div>

        <Spacer h={7} />

        {/* Entrega (parte de pago) */}
        <FilaEquipo
          label={EQUIPO_LABELS.entrega}
          labelPrecio={EQUIPO_LABELS.precio}
          valor={datos.entrega}
          onValor={set('entrega')}
          precio={datos.entregaUsd}
          onPrecio={set('entregaUsd')}
          readOnly={readOnly}
        />

        <Spacer h={7} />

        {/* Observaciones */}
        <Rotulo>{EQUIPO_LABELS.observaciones}</Rotulo>
        <div style={{ height: 46, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
          <Area value={datos.observaciones} onChange={set('observaciones')} readOnly={readOnly} ariaLabel="Observaciones" style={{ fontSize: pt(10) }} />
        </div>

        <Spacer h={10} />

        {/* TOTAL A PAGAR */}
        <div style={{ border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
          <div
            style={{
              height: 20,
              borderBottom: `${BOX}px solid ${INK}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: pt(10),
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            {EQUIPO_LABELS.totalTitulo}
          </div>
          <FilaTotal label={EQUIPO_LABELS.totalUsd} valor={dolares(totalUsd)} />
          <FilaTotal
            label={EQUIPO_LABELS.totalPesos}
            valor={pesos(totalPesos)}
            destacado
            extra={
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: pt(9) }}>{EQUIPO_LABELS.dolar}</span>
                <div style={{ width: 80, borderBottom: `1px solid ${INK}` }}>
                  <Field value={datos.dolar} onChange={set('dolar')} readOnly={readOnly} align="center" ariaLabel="Cotización del dólar" style={{ fontSize: pt(10) }} />
                </div>
              </div>
            }
          />
        </div>

        <Spacer h={10} />

        <Financiacion
          base={totalPesos}
          planes={datos.planes}
          tarjeta={datos.tarjeta}
          tarjetas={tarjetas}
          onTarjeta={elegirTarjeta}
          onQuitarPlan={quitarPlan}
          onRestaurarPlanes={restaurarPlanes}
          faltan={faltan}
          readOnly={readOnly}
        />

        <div style={{ flex: 1, minHeight: 6 }} />
        <Nota texto={NOTA_EQUIPO} />
      </div>
    </Paper>
  )
}

/** Renglón "cosa + precio en dólares" (Equipo y Entrega comparten forma). */
function FilaEquipo({
  label,
  labelPrecio,
  valor,
  onValor,
  precio,
  onPrecio,
  readOnly,
}: {
  label: string
  labelPrecio: string
  valor: string
  onValor: (v: string) => void
  precio: string
  onPrecio: (v: string) => void
  readOnly?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Rotulo>{label}</Rotulo>
        <CajaCampo>
          <Field value={valor} onChange={onValor} readOnly={readOnly} ariaLabel={label} style={{ fontSize: pt(11) }} />
        </CajaCampo>
      </div>
      <div style={{ width: 150 }}>
        <Rotulo style={{ textAlign: 'right' }}>{labelPrecio}</Rotulo>
        <CajaCampo>
          <span style={{ fontSize: pt(10), paddingRight: 3 }}>US$</span>
          <Field value={precio} onChange={onPrecio} readOnly={readOnly} align="right" ariaLabel={`${label} — precio en dólares`} style={{ fontSize: pt(11) }} />
        </CajaCampo>
      </div>
    </div>
  )
}

function FilaTotal({
  label,
  valor,
  destacado,
  extra,
}: {
  label: string
  valor: string
  destacado?: boolean
  extra?: ReactNode
}) {
  return (
    <div style={{ height: 26, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 8 }}>
      <span style={{ fontSize: pt(10), fontWeight: 700 }}>{label}</span>
      <div style={{ flex: 1 }} />
      {extra}
      <span style={{ fontSize: destacado ? pt(14) : pt(11), fontWeight: 700, color: DATA, minWidth: 130, textAlign: 'right' }}>
        {valor}
      </span>
    </div>
  )
}

/* ===================== Presupuesto de service ===================== */

export function PresupuestoServicePaper({
  datos,
  onChange,
  readOnly,
  direccion,
}: PaperProps<PresupuestoServiceData>) {
  const set = (k: keyof PresupuestoServiceData) => (v: string) => onChange({ [k]: v })
  const config = useConfiguracion()
  const { lista, contado } = totalesService(datos)
  // El service es "accesorios" en el simulador: esa tabla cubre accesorios y taller.
  const { tarjetas, elegirTarjeta, quitarPlan, restaurarPlanes, faltan } = useFinanciacion(
    'accesorios',
    datos,
    onChange,
  )

  /** Sugerencia de contado con el descuento cash del negocio (se puede pisar). */
  const sugerido =
    lista > 0 && config
      ? contadoDesdeLista(lista, config.descuento_cash_pct, config.redondeo_ars)
      : 0
  const mostrarSugerencia = sugerido > 0 && contado !== sugerido

  return (
    <Paper width={SERVICE_W} height={SERVICE_H}>
      <TitleBar height={20} fontSize={pt(10)}>
        {SERVICE_TITULO}
      </TitleBar>
      <div style={{ padding: `8px ${PAD}px 10px`, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Cabecera
          direccion={direccion}
          filas={[
            {
              label: SERVICE_LABELS.numero,
              nodo: <Field value={datos.numero} onChange={set('numero')} readOnly={readOnly} align="center" ariaLabel="N° de presupuesto" />,
            },
            {
              label: SERVICE_LABELS.fecha,
              nodo: <Field value={datos.fecha} onChange={set('fecha')} readOnly={readOnly} align="center" ariaLabel="Fecha" />,
            },
            {
              label: SERVICE_LABELS.recepciono,
              nodo: <Field value={datos.recepciono} onChange={set('recepciono')} readOnly={readOnly} align="center" ariaLabel="Quién recepcionó" />,
            },
          ]}
        />

        <Spacer h={8} />

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Rotulo>{SERVICE_LABELS.cliente}</Rotulo>
            <CajaCampo>
              <Field value={datos.cliente} onChange={set('cliente')} readOnly={readOnly} ariaLabel="Cliente" style={{ fontSize: pt(11) }} />
            </CajaCampo>
          </div>
          <div style={{ width: 210 }}>
            <Rotulo>{SERVICE_LABELS.telefono}</Rotulo>
            <CajaCampo>
              <Field value={datos.telefono} onChange={set('telefono')} readOnly={readOnly} ariaLabel="Teléfono" style={{ fontSize: pt(11) }} />
            </CajaCampo>
          </div>
        </div>

        <Spacer h={7} />

        {/* El PIN va al lado del equipo y con el mismo ancho que el TEL de
            arriba: las dos cajas de la derecha quedan alineadas. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Rotulo>{SERVICE_LABELS.equipo}</Rotulo>
            <CajaCampo>
              <Field value={datos.equipo} onChange={set('equipo')} readOnly={readOnly} ariaLabel="Equipo" style={{ fontSize: pt(11) }} />
            </CajaCampo>
          </div>
          <div style={{ width: 210 }}>
            <Rotulo>{SERVICE_LABELS.pin}</Rotulo>
            <CajaCampo>
              <Field value={datos.pin} onChange={set('pin')} readOnly={readOnly} ariaLabel="PIN del equipo" style={{ fontSize: pt(11) }} />
            </CajaCampo>
          </div>
        </div>

        <Spacer h={7} />

        <Rotulo>{SERVICE_LABELS.reparacion}</Rotulo>
        <div style={{ height: 52, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
          <Area value={datos.reparacion} onChange={set('reparacion')} readOnly={readOnly} ariaLabel="Reparación a realizar" style={{ fontSize: pt(10) }} />
        </div>

        <Spacer h={7} />

        <Rotulo>{SERVICE_LABELS.obs}</Rotulo>
        <div style={{ height: 46, border: `${BOX}px solid ${INK}`, boxSizing: 'border-box' }}>
          <Area value={datos.obs} onChange={set('obs')} readOnly={readOnly} ariaLabel="Observaciones" style={{ fontSize: pt(10) }} />
        </div>

        <Spacer h={10} />

        {/* TOTAL: precio de lista y precio de contado, lado a lado */}
        <div style={{ display: 'flex', border: `${BOX}px solid ${INK}`, boxSizing: 'border-box', height: 48 }}>
          <div style={{ width: 190, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: pt(11), fontWeight: 700 }}>
            {SERVICE_LABELS.total}
          </div>
          <CeldaPrecio
            label={SERVICE_LABELS.precioLista}
            value={datos.precioLista}
            onChange={set('precioLista')}
            readOnly={readOnly}
          />
          <CeldaPrecio
            label={SERVICE_LABELS.precioContado}
            value={datos.precioContado}
            onChange={set('precioContado')}
            readOnly={readOnly}
            destacado
            pie={
              mostrarSugerencia && !readOnly ? (
                <button
                  type="button"
                  onClick={() => onChange({ precioContado: String(sugerido) })}
                  style={{
                    font: 'inherit',
                    fontSize: pt(7.5),
                    color: '#51515a',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  usar {pesos(sugerido)}
                </button>
              ) : null
            }
          />
        </div>

        <Spacer h={10} />

        {/* Las cuotas van sobre el precio de LISTA (como en la planilla). */}
        <Financiacion
          base={lista}
          planes={datos.planes}
          tarjeta={datos.tarjeta}
          tarjetas={tarjetas}
          onTarjeta={elegirTarjeta}
          onQuitarPlan={quitarPlan}
          onRestaurarPlanes={restaurarPlanes}
          faltan={faltan}
          readOnly={readOnly}
        />

        <div style={{ flex: 1, minHeight: 6 }} />
        <Nota texto={NOTA_SERVICE} />
      </div>
    </Paper>
  )
}

/** Celda de precio del service: rótulo arriba y el importe grande abajo. */
function CeldaPrecio({
  label,
  value,
  onChange,
  readOnly,
  destacado,
  pie,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  destacado?: boolean
  pie?: ReactNode
}) {
  return (
    <div
      style={{
        flex: 1,
        borderLeft: `${BOX}px solid ${INK}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: pt(8), fontWeight: 700, letterSpacing: '0.03em' }}>{label}</span>
        {pie}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: pt(destacado ? 12 : 10) }}>$</span>
        <Field
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          align="right"
          ariaLabel={label}
          style={{ fontSize: pt(destacado ? 14 : 12), fontWeight: 700 }}
        />
      </div>
    </div>
  )
}
