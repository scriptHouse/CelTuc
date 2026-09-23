import { ApiError, textoDeError } from '@/lib/api'

/**
 * Los errores que devuelve el backend al guardar una persona, una cuenta o un
 * rol, repartidos por campo para mostrarlos AL LADO de lo que hay que corregir
 * (y no en un aviso que se va solo).
 *
 * El backend ya los escribe en palabras simples y dice con quién choca un dato
 * (ver `usuarios/identidad.py`); acá solo se ubican en su lugar.
 */

export interface ErroresFormulario {
  /** Campo -> mensaje (`username`, `email`, `password`, `nombre`, `rol`, ...). */
  campos: Record<string, string>
  /** Lo que no es de un campo (un «no se puede» de permisos, sin conexión, ...). */
  general: string | null
}

/** Nombres del backend -> nombres de los formularios. */
const ALIAS: Record<string, string> = { rol_id: 'rol', non_field_errors: 'general', detail: 'general' }

/** Bloques anidados cuyos campos se aplanan (el acceso de un empleado, el empleado de una cuenta). */
const ANIDADOS = new Set(['acceso', 'empleado'])

export function leerErrores(error: unknown): ErroresFormulario {
  const resultado: ErroresFormulario = { campos: {}, general: null }
  if (!(error instanceof ApiError)) {
    resultado.general = error instanceof Error ? error.message : 'Algo salió mal. Probá de nuevo.'
    return resultado
  }
  if (error.status === 0) {
    resultado.general = error.message
    return resultado
  }

  const recorrer = (datos: unknown) => {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return
    for (const [clave, valor] of Object.entries(datos as Record<string, unknown>)) {
      if (ANIDADOS.has(clave) && valor && typeof valor === 'object' && !Array.isArray(valor)) {
        recorrer(valor)
        continue
      }
      const texto = textoDeError(valor)
      if (!texto) continue
      const campo = ALIAS[clave] ?? clave
      if (campo === 'general') resultado.general ??= texto
      else resultado.campos[campo] ??= texto
    }
  }
  recorrer(error.data)

  if (!resultado.general && Object.keys(resultado.campos).length === 0) {
    resultado.general = error.message || 'Algo salió mal. Probá de nuevo.'
  }
  return resultado
}

/** El primer mensaje para mostrar en un aviso, cuando no hay un campo donde ponerlo. */
export function mensajeDeError(error: unknown): string {
  const { campos, general } = leerErrores(error)
  return general ?? Object.values(campos)[0] ?? 'Algo salió mal. Probá de nuevo.'
}
