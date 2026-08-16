/**
 * Exportador de Facturación — el dataset.
 *
 * Toma el resumen del backend (`obtenerResumenFacturacion`) más la config del
 * Studio y devuelve UNA estructura ya resuelta: las filas del mes, las columnas
 * en orden con su formato, los totales y los avisos. Es la fuente única: la
 * vista previa y el Excel leen exactamente lo mismo, así lo que se ve es lo que
 * baja.
 *
 * No importa React ni ExcelJS: es dato puro, se puede probar sin navegador.
 */
import type {
  ComprobanteResumen,
  CorteFacturacion,
  MedioResumen,
  ResumenFacturacion,
} from '@/services/facturacion'
import {
  COLUMNAS_POR_ID,
  nombreMes,
  type ConfigFacturacion,
  type DefinicionColumna,
  type TipoColumna,
} from './tipos'

/** Todos los baldes del resumen, en el orden en que se leen. */
export const MEDIOS: MedioResumen[] = [
  'efectivo',
  'transferencia',
  'transf_financiera',
  'tarjeta',
  'otro',
  'sin_medio',
]

export const MEDIO_LABEL: Record<MedioResumen, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  transf_financiera: 'Transferencia financiera',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
  sin_medio: 'Sin informar',
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const

/** Un renglón de la planilla: un día del mes. */
export interface FilaFacturacion extends CorteFacturacion {
  /** `aaaa-mm-dd`. */
  fecha: string
  /** Fecha real para Excel. Al mediodía: nunca se corre de día por zona horaria. */
  date: Date
  diaDelMes: number
  diaSemana: string
  finDeSemana: boolean
  /** True si ese día no se emitió ningún comprobante. */
  vacio: boolean
}

/** Una columna ya resuelta: sabe leer su valor de una fila. */
export interface ColumnaResuelta extends DefinicionColumna {
  align: 'left' | 'center' | 'right'
  valor: (fila: FilaFacturacion) => number | string | Date | null
}

export interface MetaExport {
  titulo: string
  subtitulo: string
  /** «agosto 2026». */
  periodo: string
  /** Las cuentas incluidas, en castellano. */
  cuentasTexto: string
  /** Nombres de las cuentas elegidas (vacío = todas). */
  cuentas: string[]
  usuario: string
  generado: Date
  /** Los filtros aplicados, para la hoja de trazabilidad. */
  filtros: string[]
}

export interface AvisoExport {
  tono: 'info' | 'alerta'
  texto: string
  /** Columnas que agregar para resolverlo (lo usa el botón del Studio). */
  columnasSugeridas?: string[]
}

export interface DatasetFacturacion {
  config: ConfigFacturacion
  columnas: ColumnaResuelta[]
  filas: FilaFacturacion[]
  /** Sólo los días con comprobantes (para los contadores de la pantalla). */
  filasConDatos: FilaFacturacion[]
  totales: CorteFacturacion
  comprobantes: ComprobanteResumen[]
  meta: MetaExport
  /**
   * True si las columnas de medios elegidas cubren TODA la plata del mes sin
   * pisarse: recién entonces el TOTAL puede ir como fórmula sin mentir.
   */
  totalCubierto: boolean
  avisos: AvisoExport[]
  /** Data URI del logo (sólo si la exportación va con logo). */
  logo?: string
}

/** Alineación de cada tipo de dato (misma regla en la pantalla y en el Excel). */
const ALIGN: Record<TipoColumna, 'left' | 'center' | 'right'> = {
  fecha: 'center',
  texto: 'center',
  entero: 'center',
  ars: 'right',
  blanco: 'center',
}

/** Suma los baldes de medios de una fila. */
const sumaMedios = (fila: FilaFacturacion, medios: MedioResumen[]) =>
  medios.reduce((acc, medio) => acc + (fila.porMedio[medio] ?? 0), 0)

function resolverColumna(def: DefinicionColumna): ColumnaResuelta {
  const align = ALIGN[def.tipo]
  if (def.medios) {
    const medios = def.medios
    return { ...def, align, valor: (fila) => sumaMedios(fila, medios) }
  }
  switch (def.id) {
    case 'fecha':
      return { ...def, align, valor: (fila) => fila.date }
    case 'dia_semana':
      return { ...def, align, valor: (fila) => fila.diaSemana }
    case 'total':
      return { ...def, align, valor: (fila) => fila.total }
    case 'cantidad':
      return { ...def, align, valor: (fila) => fila.cantidad }
    case 'ri':
      return { ...def, align, valor: (fila) => fila.ri }
    case 'mono':
      return { ...def, align, valor: (fila) => fila.mono }
    case 'cobrado':
      return { ...def, align, valor: (fila) => fila.cobrado }
    case 'pendiente':
      return { ...def, align, valor: (fila) => fila.pendiente }
    case 'estado':
      // Vacía a propósito: se anota a mano sobre la planilla impresa.
      return { ...def, align, valor: () => null }
    case 'indice':
      return { ...def, align, valor: () => null }
    default:
      return { ...def, align, valor: () => null }
  }
}

/** La definición de una columna por id (o null si el id ya no existe). */
export function definicionDe(id: string): DefinicionColumna | null {
  return COLUMNAS_POR_ID.get(id) ?? null
}

const vacio = (): CorteFacturacion => ({
  cantidad: 0,
  total: 0,
  porMedio: {
    efectivo: 0,
    transferencia: 0,
    transf_financiera: 0,
    tarjeta: 0,
    otro: 0,
    sin_medio: 0,
  },
  ri: 0,
  mono: 0,
  cobrado: 0,
  pendiente: 0,
})

/** Redondeo a centavos: mata el ruido de coma flotante al comparar totales. */
const centavos = (n: number) => Math.round(n * 100)

export interface FuentesExport {
  usuario: string
  /** Las cuentas del negocio, para nombrar las elegidas. */
  emisores: Array<{ id: number; nombre: string }>
}

export function construirDataset(
  config: ConfigFacturacion,
  resumen: ResumenFacturacion,
  fuentes: FuentesExport,
  extras: { logo?: string; generado?: Date } = {},
): DatasetFacturacion {
  const generado = extras.generado ?? new Date()

  /* ---- Filas: un renglón por día ---- */
  const porFecha = new Map(resumen.dias.map((d) => [d.fecha, d]))
  const filas: FilaFacturacion[] = []
  for (let dia = 1; dia <= resumen.diasDelMes; dia++) {
    const clave = `${resumen.anio}-${String(resumen.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    const corte = porFecha.get(clave)
    // Mediodía local: da igual la zona horaria, el día nunca se corre.
    const date = new Date(resumen.anio, resumen.mes - 1, dia, 12, 0, 0)
    const diaSemana = DIAS_SEMANA[date.getDay()]
    filas.push({
      ...(corte ? { ...corte } : vacio()),
      fecha: clave,
      date,
      diaDelMes: dia,
      diaSemana,
      finDeSemana: date.getDay() === 0 || date.getDay() === 6,
      vacio: !corte,
    })
  }
  const filasConDatos = filas.filter((f) => !f.vacio)
  const visibles = config.alcance === 'con_facturacion' ? filasConDatos : filas

  /* ---- Columnas, en el orden elegido ---- */
  const vistas = new Set<string>()
  const columnas = config.columnas
    .filter((id) => {
      if (vistas.has(id)) return false
      vistas.add(id)
      return COLUMNAS_POR_ID.has(id)
    })
    .map((id) => resolverColumna(COLUMNAS_POR_ID.get(id)!))

  /* ---- ¿El TOTAL puede ir como fórmula? ---- */
  // Sí sólo si los baldes de las columnas de medios elegidas cubren toda la
  // plata del mes y ninguno se cuenta dos veces. Si no, el TOTAL va con su
  // valor real y se avisa (una fórmula que no cierra es peor que ningún dato).
  const baldes: MedioResumen[] = []
  let repetido = false
  for (const columna of columnas) {
    for (const medio of columna.medios ?? []) {
      if (baldes.includes(medio)) repetido = true
      else baldes.push(medio)
    }
  }
  const cubiertos = centavos(
    baldes.reduce((acc, medio) => acc + (resumen.totales.porMedio[medio] ?? 0), 0),
  )
  const totalMes = centavos(resumen.totales.total)
  const hayColumnasDeMedios = baldes.length > 0
  const totalCubierto = hayColumnasDeMedios && !repetido && cubiertos === totalMes

  /* ---- Avisos ---- */
  const avisos: AvisoExport[] = []
  // Lo que quedó fuera de las columnas, sin contar lo «sin informar»: eso tiene
  // su propio aviso (es un dato a completar, no una columna que falte).
  const faltantes = MEDIOS.filter(
    (medio) =>
      medio !== 'sin_medio' &&
      !baldes.includes(medio) &&
      centavos(resumen.totales.porMedio[medio] ?? 0) > 0,
  )
  if (hayColumnasDeMedios && faltantes.length) {
    const plata = faltantes.reduce((acc, medio) => acc + (resumen.totales.porMedio[medio] ?? 0), 0)
    avisos.push({
      tono: 'alerta',
      texto:
        `Quedan ${moneda(plata)} fuera de las columnas de medios ` +
        `(${faltantes.map((m) => MEDIO_LABEL[m].toLowerCase()).join(', ')}). ` +
        'El TOTAL igual muestra la cifra correcta del día, pero no cierra con la suma de las columnas.',
      // Sin repetidos: las dos transferencias sugieren la MISMA columna
      // combinada, y si no se deduplica el botón dice «Transferencias y
      // Transferencias».
      columnasSugeridas: [
        ...new Set(
          faltantes
            .map((medio) => sugerenciaDeColumna(medio, baldes))
            .filter((id): id is string => Boolean(id)),
        ),
      ],
    })
  }
  if (repetido) {
    avisos.push({
      tono: 'alerta',
      texto:
        'Hay columnas de medios que se pisan (por ejemplo «Transferencias» junto a «Transferencia»): ' +
        'esa plata aparece dos veces, así que el TOTAL va con su valor real y no como suma de columnas.',
    })
  }
  if (resumen.sinMedio.cantidad > 0) {
    const cuantas = resumen.sinMedio.cantidad
    const una = cuantas === 1
    const sinColumna = hayColumnasDeMedios && !baldes.includes('sin_medio')
    avisos.push({
      tono: sinColumna ? 'alerta' : 'info',
      texto:
        `${una ? '1 factura' : `${cuantas} facturas`} por ${moneda(resumen.sinMedio.total)} ` +
        `${una ? 'todavía no tiene' : 'todavía no tienen'} cargado con qué se cobró` +
        (sinColumna
          ? ', así que esa plata no entra en ninguna columna de medios: el TOTAL muestra igual la ' +
            'cifra correcta del día, pero no cierra con la suma de las columnas. Se completa desde ' +
            'el detalle de cada factura.'
          : '. Se completa desde el detalle de cada factura.'),
      columnasSugeridas: sinColumna ? ['sin_medio'] : undefined,
    })
  }

  /* ---- Meta ---- */
  const elegidas = config.emisores.length
    ? fuentes.emisores.filter((e) => config.emisores.includes(e.id)).map((e) => e.nombre)
    : []
  // OJO: los datos ya vienen filtrados por el backend. Si hay cuentas elegidas
  // pero no se les pudo poner nombre (la lista de cuentas no cargó, o una
  // guardada ya no existe), el encabezado NO puede decir «todas»: estaría
  // mintiendo sobre a qué corresponden los números.
  const sinNombre = config.emisores.length - elegidas.length
  const cuentasTexto = !config.emisores.length
    ? `Todas las cuentas${fuentes.emisores.length ? ` (${fuentes.emisores.length})` : ''}`
    : elegidas.length === 0
      ? `${config.emisores.length} ${config.emisores.length === 1 ? 'cuenta elegida' : 'cuentas elegidas'}`
      : sinNombre > 0
        ? `${elegidas.join(' · ')} y ${sinNombre} más`
        : elegidas.join(' · ')

  const filtros: string[] = []
  filtros.push(`Período: ${nombreMes(config.mes)} ${config.anio}`)
  filtros.push(`Cuentas: ${cuentasTexto}`)
  filtros.push(
    config.alcance === 'mes_completo'
      ? 'Renglones: todos los días del mes'
      : 'Renglones: sólo los días con facturación',
  )
  if (config.incluirOcultos) filtros.push('Incluye los comprobantes ocultados de la lista')
  if (config.xlsx.formulas) {
    filtros.push(
      totalCubierto
        ? 'TOTAL e ÍNDICE con fórmulas vivas'
        : 'ÍNDICE con fórmula viva; el TOTAL va con su valor (las columnas de medios no cubren todo)',
    )
  }
  filtros.push(`Meta diaria del ÍNDICE: ${moneda(config.xlsx.metaDiaria)}`)

  return {
    config,
    columnas,
    filas: visibles,
    filasConDatos,
    totales: resumen.totales,
    comprobantes: resumen.comprobantes,
    totalCubierto,
    avisos,
    logo: config.conLogo ? extras.logo : undefined,
    meta: {
      titulo: config.titulo.trim() || 'Facturación',
      subtitulo: config.subtitulo.trim(),
      periodo: `${nombreMes(config.mes)} ${config.anio}`,
      cuentasTexto,
      cuentas: elegidas,
      usuario: fuentes.usuario,
      generado,
      filtros,
    },
  }
}

/** Qué columna agregar para cubrir un balde que quedó afuera. */
function sugerenciaDeColumna(medio: MedioResumen, yaCubiertos: MedioResumen[]): string | null {
  if (medio === 'transferencia' || medio === 'transf_financiera') {
    // Si ninguna de las dos está, alcanza con la combinada.
    const ningunaTransferencia =
      !yaCubiertos.includes('transferencia') && !yaCubiertos.includes('transf_financiera')
    return ningunaTransferencia ? 'transferencias' : medio
  }
  if (medio === 'tarjeta') return 'tarjetas'
  return medio
}

/** `$ 1.234.567` — sólo para los textos de los avisos y la trazabilidad. */
function moneda(valor: number): string {
  return `$ ${Math.round(valor).toLocaleString('es-AR')}`
}

/** El texto de las cuentas para el nombre del archivo. */
export function cuentaParaNombre(dataset: DatasetFacturacion): string {
  const { cuentas } = dataset.meta
  if (!cuentas.length) return 'todas'
  if (cuentas.length === 1) return cuentas[0]
  return `${cuentas.length}-cuentas`
}
