import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { consultarDisponibilidad } from '@/services/usuarios'
import type { ChequeoDato } from '@/services/usuarios'

/**
 * Reglas del usuario, el email y la contraseña, iguales a las del backend
 * (`usuarios/identidad.py`), para avisar MIENTRAS se escribe y no recién al
 * guardar. Lo que el front no puede saber (si otra cuenta ya tiene ese dato)
 * lo pregunta al backend, con un respiro para no consultar en cada tecla.
 */

export const MIN_USUARIO = 3
export const MAX_USUARIO = 30
export const MIN_CONTRASENA = 6

export const MSG = {
  usuarioVacio: 'Falta el usuario: es el nombre corto con el que la persona va a entrar (por ejemplo «lgomez»).',
  usuarioCorto: `El usuario es muy corto: tiene que tener al menos ${MIN_USUARIO} letras o números (por ejemplo «lgomez»).`,
  usuarioLargo: `El usuario es muy largo: puede tener hasta ${MAX_USUARIO} letras o números.`,
  usuarioSignos:
    'El usuario va todo junto, sin espacios, tildes ni ñ: solo letras, números y los signos . _ - (por ejemplo «lucas.gomez»).',
  emailVacio: 'Falta el email.',
  emailInvalido: 'Ese email no parece bien escrito: tiene que tener una @ y un punto, por ejemplo «lucas@gmail.com».',
  contrasenaVacia: 'Falta la contraseña: es la clave secreta con la que la persona va a entrar.',
  contrasenaCorta: `La contraseña es muy corta: tiene que tener al menos ${MIN_CONTRASENA} letras o números. Si querés, tocá «Inventar una».`,
} as const

export function problemaUsuario(valor: string): string | null {
  const v = valor.trim().toLowerCase()
  if (!v) return MSG.usuarioVacio
  if (!/^[a-z0-9._-]+$/.test(v)) return MSG.usuarioSignos
  if (v.length < MIN_USUARIO) return MSG.usuarioCorto
  if (v.length > MAX_USUARIO) return MSG.usuarioLargo
  return null
}

export function problemaEmail(valor: string): string | null {
  const v = valor.trim()
  if (!v) return MSG.emailVacio
  // Lo mismo que pide el backend en lo esencial: algo@algo.algo, sin espacios.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return MSG.emailInvalido
  return null
}

export function problemaContrasena(valor: string): string | null {
  if (!valor) return MSG.contrasenaVacia
  if (valor.length < MIN_CONTRASENA) return MSG.contrasenaCorta
  return null
}

/** «Lucas Gómez» -> «lucas.gomez»: lo que se escribió, llevado a un usuario válido. */
export function corregirUsuario(valor: string): string {
  return valor
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, MAX_USUARIO)
}

// --- Contraseñas fáciles de dictar ------------------------------------------

const PALABRAS = [
  'mate', 'sol', 'luna', 'rio', 'pan', 'flor', 'nube', 'mar', 'tren', 'gato', 'lago', 'cielo',
  'roca', 'hoja', 'pino', 'faro', 'nido', 'miel', 'lima', 'coco', 'kiwi', 'puma', 'tango', 'bici',
]

function azar(tope: number): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] % tope
}

/** «sol-mate-47»: segura para empezar y fácil de pasar por teléfono. */
export function inventarContrasena(): string {
  const a = PALABRAS[azar(PALABRAS.length)]
  let b = PALABRAS[azar(PALABRAS.length)]
  while (b === a) b = PALABRAS[azar(PALABRAS.length)]
  return `${a}-${b}-${10 + azar(90)}`
}

// --- Chequeo en vivo ---------------------------------------------------------

function useDemorado<T>(valor: T, ms: number): T {
  const [demorado, setDemorado] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return demorado
}

export type EstadoChequeo =
  | { estado: 'vacio' }
  | { estado: 'revisando' }
  | { estado: 'ok'; mensaje: string }
  | { estado: 'mal'; mensaje: string; usadoPor?: ChequeoDato['usado_por']; sugerencias?: string[] }

/**
 * ¿Sirve este usuario / email? Primero las reglas de formato (al instante);
 * si están bien, pregunta al backend si otra cuenta ya lo tiene.
 *
 * `original`: el dato que la cuenta ya tiene (al editar, no hay nada que revisar).
 */
export function useChequeoDato(
  campo: 'username' | 'email',
  valor: string,
  { excluir = null, original = '' }: { excluir?: number | null; original?: string } = {},
): EstadoChequeo {
  const limpio = valor.trim().toLowerCase()
  const problema = limpio ? (campo === 'username' ? problemaUsuario(limpio) : problemaEmail(limpio)) : null
  const esElMismo = Boolean(original) && limpio === original.trim().toLowerCase()
  const demorado = useDemorado(limpio, 400)
  const consultar = Boolean(limpio) && !problema && !esElMismo && demorado === limpio

  const { data, isFetching } = useQuery({
    queryKey: ['disponibilidad', campo, demorado, excluir],
    queryFn: () => consultarDisponibilidad({ [campo]: demorado, excluir }),
    enabled: consultar,
    staleTime: 15_000,
  })

  if (!limpio) return { estado: 'vacio' }
  if (problema) return { estado: 'mal', mensaje: problema }
  if (esElMismo) return { estado: 'ok', mensaje: campo === 'username' ? 'Es el usuario que ya tiene.' : 'Es el email que ya tiene.' }
  const chequeo = data?.[campo]
  if (demorado !== limpio || isFetching || !chequeo || chequeo.valor !== limpio) return { estado: 'revisando' }
  if (!chequeo.ok) {
    return {
      estado: 'mal',
      mensaje: chequeo.mensaje ?? 'Ese dato no sirve.',
      usadoPor: chequeo.usado_por,
      sugerencias: chequeo.sugerencias ?? [],
    }
  }
  return {
    estado: 'ok',
    mensaje: campo === 'username' ? 'Libre: nadie más tiene este usuario.' : 'Libre: ninguna otra cuenta usa este email.',
  }
}
