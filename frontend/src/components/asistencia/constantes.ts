import {
  AlarmClock,
  Building2,
  CalendarOff,
  Clock4,
  DoorOpen,
  Hourglass,
  MapPinOff,
  CircleCheck,
  CircleX,
  Coffee,
  CreditCard,
  Fingerprint,
  HelpCircle,
  KeyRound,
  LogIn,
  LogOut,
  MonitorSmartphone,
  PartyPopper,
  Palmtree,
  ScanFace,
  ShieldQuestion,
  Timer,
  TriangleAlert,
  Undo2,
  UserX,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  EstadoDiaCalendario,
  EstadoJornada,
  MetodoFichada,
  SeveridadInconsistencia,
  TipoFeriado,
  TipoFichada,
  TipoInconsistencia,
  TipoLicencia,
} from '@/types'

/** Etiquetas e iconos de los estados de asistencia del reloj (serie MinMoe). */
export const TIPO_FICHADA: Record<TipoFichada, { label: string; icon: LucideIcon }> = {
  check_in: { label: 'Entrada', icon: LogIn },
  check_out: { label: 'Salida', icon: LogOut },
  break_out: { label: 'Salida a descanso', icon: Coffee },
  break_in: { label: 'Vuelta de descanso', icon: Undo2 },
  overtime_in: { label: 'Entrada extra', icon: Timer },
  overtime_out: { label: 'Salida extra', icon: Timer },
  unknown: { label: 'Fichada', icon: Fingerprint },
}

export const METODO_FICHADA: Record<MetodoFichada, { label: string; icon: LucideIcon }> = {
  face: { label: 'Rostro', icon: ScanFace },
  card: { label: 'Tarjeta', icon: CreditCard },
  fingerprint: { label: 'Huella', icon: Fingerprint },
  password: { label: 'Clave', icon: KeyRound },
  remote: { label: 'Remoto', icon: MonitorSmartphone },
  // El DS-K1A340WX informa los métodos habilitados en el lector, no el usado.
  multiple: { label: 'Rostro/tarjeta/huella', icon: ScanFace },
  unknown: { label: 'Otro', icon: HelpCircle },
}

export function tipoDe(valor: string) {
  return TIPO_FICHADA[(valor as TipoFichada) in TIPO_FICHADA ? (valor as TipoFichada) : 'unknown']
}

export function metodoDe(valor: string) {
  return METODO_FICHADA[
    (valor as MetodoFichada) in METODO_FICHADA ? (valor as MetodoFichada) : 'unknown'
  ]
}

/** Cómo se ve cada estado de una jornada. `tono` son clases Tailwind del chip. */
export const ESTADO_JORNADA: Record<
  EstadoJornada,
  { label: string; icon: LucideIcon; tono: string; punto: string }
> = {
  ok: {
    label: 'Presente',
    icon: CircleCheck,
    tono: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
    punto: 'bg-emerald-500',
  },
  tarde: {
    label: 'Llegó tarde',
    icon: AlarmClock,
    tono: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
    punto: 'bg-amber-500',
  },
  salida_temprana: {
    label: 'Se retiró antes',
    icon: LogOut,
    tono: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
    punto: 'bg-amber-500',
  },
  incompleta: {
    label: 'Falta fichar salida',
    icon: TriangleAlert,
    tono: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300',
    punto: 'bg-orange-500',
  },
  ausente: {
    label: 'Ausente',
    icon: UserX,
    tono: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
    punto: 'bg-red-500',
  },
  licencia: {
    label: 'Licencia',
    icon: Palmtree,
    tono: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
    punto: 'bg-sky-500',
  },
  feriado: {
    label: 'Feriado',
    icon: PartyPopper,
    tono: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
    punto: 'bg-violet-500',
  },
  no_laborable: {
    label: 'No laborable',
    icon: CalendarOff,
    tono: 'border-line bg-ink-50 text-ink-500',
    punto: 'bg-ink-300',
  },
  sin_turno: {
    label: 'Sin turno',
    icon: ShieldQuestion,
    tono: 'border-line bg-surface text-ink-500',
    punto: 'bg-ink-300',
  },
  sin_reloj: {
    label: 'Sucursal sin reloj',
    icon: MapPinOff,
    tono: 'border-line bg-surface text-ink-500',
    punto: 'bg-ink-300',
  },
}

export function estadoDe(valor: string) {
  return ESTADO_JORNADA[
    (valor as EstadoJornada) in ESTADO_JORNADA ? (valor as EstadoJornada) : 'sin_turno'
  ]
}

/** Icono de cada tipo de inconsistencia. */
export const TIPO_INCONSISTENCIA: Record<TipoInconsistencia, LucideIcon> = {
  llegada_tarde: AlarmClock,
  salida_temprana: LogOut,
  falta_entrada: DoorOpen,
  falta_salida: TriangleAlert,
  ausencia: UserX,
  pausa_excesiva: Coffee,
  jornada_incompleta: Hourglass,
  exceso_jornada: Clock4,
  sucursal_incorrecta: Building2,
  trabajo_en_feriado: PartyPopper,
  dia_no_laborable: CalendarOff,
}

export function iconoInconsistencia(tipo: string): LucideIcon {
  return TIPO_INCONSISTENCIA[tipo as TipoInconsistencia] ?? TriangleAlert
}

/** Cómo se pinta cada severidad. */
export const SEVERIDAD: Record<SeveridadInconsistencia, { label: string; tono: string; punto: string }> = {
  grave: {
    label: 'Grave',
    tono: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
    punto: 'bg-red-500',
  },
  moderada: {
    label: 'Moderada',
    tono: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
    punto: 'bg-amber-500',
  },
  leve: {
    label: 'Leve',
    tono: 'border-line bg-ink-50 text-ink-600',
    punto: 'bg-ink-300',
  },
}

export function severidadDe(valor: string) {
  return SEVERIDAD[(valor as SeveridadInconsistencia) in SEVERIDAD ? (valor as SeveridadInconsistencia) : 'leve']
}

/** Cómo se pinta el estado de una inconsistencia. */
export const ESTADO_INCONSISTENCIA = {
  pendiente: {
    label: 'Pendiente',
    tono: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  },
  justificada: {
    label: 'Justificada',
    tono: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  },
  rechazada: {
    label: 'Sin justificar',
    tono: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  },
} as const

export const TIPOS_LICENCIA: { value: TipoLicencia; label: string }[] = [
  { value: 'vacaciones', label: 'Vacaciones' },
  { value: 'enfermedad', label: 'Enfermedad' },
  { value: 'especial', label: 'Licencia especial' },
  { value: 'franco', label: 'Franco / día libre' },
  { value: 'suspension', label: 'Suspensión' },
  { value: 'otro', label: 'Otro' },
]

export const TIPOS_FERIADO: { value: TipoFeriado; label: string }[] = [
  { value: 'nacional', label: 'Nacional' },
  { value: 'provincial', label: 'Provincial' },
  { value: 'puente', label: 'Puente turístico' },
  { value: 'propio', label: 'Cierre propio' },
]

export const DIAS_SEMANA = [
  { valor: 0, corto: 'Lun', largo: 'Lunes' },
  { valor: 1, corto: 'Mar', largo: 'Martes' },
  { valor: 2, corto: 'Mié', largo: 'Miércoles' },
  { valor: 3, corto: 'Jue', largo: 'Jueves' },
  { valor: 4, corto: 'Vie', largo: 'Viernes' },
  { valor: 5, corto: 'Sáb', largo: 'Sábado' },
  { valor: 6, corto: 'Dom', largo: 'Domingo' },
]

/** `465` → `7 h 45 m`. Devuelve `—` si no hay nada que mostrar. */
export function duracion(minutos: number): string {
  if (!minutos || minutos <= 0) return '—'
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (!horas) return `${resto} m`
  return resto ? `${horas} h ${String(resto).padStart(2, '0')} m` : `${horas} h`
}

/** `"09:00:00"` → `"09:00"`. */
export function hhmm(hora: string): string {
  return (hora || '').slice(0, 5)
}

/** Hora local de un ISO: `"14:30"`. */
export function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

/** Fecha local `aaaa-mm-dd` para los filtros del backend. */
export function fechaLocalISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function haceDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return fechaLocalISO(d)
}

/** `"2026-08-17"` (fecha LOCAL, no UTC) → `"Lunes 17 de agosto"`. */
export function etiquetaFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number)
  const fecha = new Date(anio, mes - 1, dia)
  const texto = fecha.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * El semáforo del calendario mensual.
 *
 * Cada estado trae SIEMPRE un ícono además del color. No es adorno: rojo y
 * verde son justo el par que el daltonismo más común no distingue, así que el
 * color no puede ser lo único que lleva el dato. La forma sí se ve siempre.
 */
export const ESTADO_DIA: Record<
  EstadoDiaCalendario,
  { label: string; ayuda: string; icon: LucideIcon; celda: string; punto: string }
> = {
  verde: {
    label: 'Todo en orden',
    ayuda: 'Fichó todo el mundo y no quedó nada por revisar.',
    icon: CircleCheck,
    celda:
      'border-emerald-200 bg-emerald-50/70 hover:border-emerald-300 dark:border-emerald-900 dark:bg-emerald-950/40',
    punto: 'bg-emerald-500',
  },
  amarillo: {
    label: 'Con novedades',
    ayuda: 'Hubo ausencias o inconsistencias sin justificar.',
    icon: TriangleAlert,
    celda:
      'border-amber-200 bg-amber-50/70 hover:border-amber-300 dark:border-amber-900 dark:bg-amber-950/40',
    punto: 'bg-amber-500',
  },
  rojo: {
    label: 'Sin marcaciones',
    ayuda: 'Se esperaba gente y no fichó nadie. Suele ser el reloj, no el equipo.',
    icon: CircleX,
    celda:
      'border-red-200 bg-red-50/70 hover:border-red-300 dark:border-red-900 dark:bg-red-950/40',
    punto: 'bg-red-500',
  },
  sin_actividad: {
    label: 'Sin actividad',
    ayuda: 'Nadie tenía que trabajar y nadie fichó.',
    icon: CalendarOff,
    celda: 'border-line bg-surface hover:border-line-strong',
    punto: 'bg-ink-300',
  },
  futuro: {
    label: 'Todavía no pasó',
    ayuda: 'Es un día que no llegó: no hay nada que juzgar.',
    icon: CalendarOff,
    celda: 'border-dashed border-line bg-transparent',
    punto: 'bg-ink-200',
  },
}

export function estadoDiaDe(valor: string) {
  return ESTADO_DIA[
    (valor as EstadoDiaCalendario) in ESTADO_DIA
      ? (valor as EstadoDiaCalendario)
      : 'sin_actividad'
  ]
}

/** `"2026-08-17"` → `"Lunes 17"`. Para el encabezado del día elegido. */
export function diaYNumero(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number)
  const fecha = new Date(anio, mes - 1, dia)
  const nombre = fecha.toLocaleDateString('es-AR', { weekday: 'long' })
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${dia}`
}
