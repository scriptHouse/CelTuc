import {
  Coffee,
  CreditCard,
  Fingerprint,
  HelpCircle,
  KeyRound,
  LogIn,
  LogOut,
  MonitorSmartphone,
  ScanFace,
  Timer,
  Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MetodoFichada, TipoFichada } from '@/types'

/** Etiquetas e iconos de los estados de asistencia del reloj (serie MinMoe). */
export const TIPO_FICHADA: Record<TipoFichada, { label: string; icon: LucideIcon }> = {
  check_in: { label: 'Entrada', icon: LogIn },
  check_out: { label: 'Salida', icon: LogOut },
  break_out: { label: 'Salida a descanso', icon: Coffee },
  break_in: { label: 'Vuelta de descanso', icon: Undo2 },
  overtime_in: { label: 'Entrada extra', icon: Timer },
  overtime_out: { label: 'Salida extra', icon: Timer },
  unknown: { label: 'Fichada', icon: HelpCircle },
}

export const METODO_FICHADA: Record<MetodoFichada, { label: string; icon: LucideIcon }> = {
  face: { label: 'Rostro', icon: ScanFace },
  card: { label: 'Tarjeta', icon: CreditCard },
  fingerprint: { label: 'Huella', icon: Fingerprint },
  password: { label: 'Clave', icon: KeyRound },
  remote: { label: 'Remoto', icon: MonitorSmartphone },
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
