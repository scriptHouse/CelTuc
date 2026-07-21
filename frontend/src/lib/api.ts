/**
 * Cliente HTTP mínimo sobre `fetch` para hablar con el backend (Django REST).
 *
 * - En desarrollo, Vite hace de proxy de `/api` → http://localhost:8000 (ver
 *   vite.config.ts), así que el front siempre llama a rutas relativas `/api/...`.
 * - En producción, nginx sirve el front y el backend en el mismo origen.
 * - `VITE_API_URL` permite override (por defecto `/api`).
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

/** Error de API con el status HTTP y el cuerpo crudo de la respuesta. */
export class ApiError extends Error {
  status: number
  data: unknown

  constructor(status: number, message: string, data: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

/** Extrae un mensaje legible del cuerpo de error de DRF. */
function messageFromData(data: unknown, fallback: string): string {
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail
    // Errores de validación: { campo: ["mensaje", ...] }.
    const first = Object.values(obj)[0]
    if (Array.isArray(first) && first.length) return String(first[0])
    if (typeof first === 'string') return first
  }
  return fallback
}

interface RequestOptions {
  method?: string
  body?: unknown
  token?: string | null
  signal?: AbortSignal
}

/**
 * Manejador de 401 para peticiones autenticadas. Lo registra el store de sesión:
 * intenta refrescar el token y devuelve uno nuevo (o null si la sesión murió).
 * Vive acá para evitar el ciclo de imports api ↔ store.
 */
type UnauthorizedHandler = () => Promise<string | null>
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler
}

async function request<T>(path: string, opts: RequestOptions = {}, reintento = false): Promise<T> {
  const { method = 'GET', body, token, signal } = opts

  // Con FormData (subida de archivos) el navegador arma solo el multipart y su
  // boundary: no hay que fijar Content-Type ni serializar a JSON.
  const esFormData = typeof FormData !== 'undefined' && body instanceof FormData

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(esFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : esFormData ? (body as FormData) : JSON.stringify(body),
      signal,
    })
  } catch {
    // Red caída, servidor apagado, CORS, etc.
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisá tu conexión.', null)
  }

  // Token vencido en una petición autenticada: intentamos refrescarlo UNA vez y
  // reintentar de forma transparente. Si no se puede, el handler cierra la sesión.
  if (res.status === 401 && token && !reintento && unauthorizedHandler) {
    const nuevoToken = await unauthorizedHandler()
    if (nuevoToken) {
      return request<T>(path, { ...opts, token: nuevoToken }, true)
    }
  }

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json().catch(() => null) : null

  if (!res.ok) {
    throw new ApiError(res.status, messageFromData(data, `Error ${res.status}`), data)
  }
  return data as T
}

/** Descarga un recurso binario autenticado (p. ej. adjuntos) como Blob. */
async function requestBlob(path: string, token?: string | null, reintento = false): Promise<Blob> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisá tu conexión.', null)
  }
  if (res.status === 401 && token && !reintento && unauthorizedHandler) {
    const nuevoToken = await unauthorizedHandler()
    if (nuevoToken) return requestBlob(path, nuevoToken, true)
  }
  if (!res.ok) {
    const isJson = res.headers.get('content-type')?.includes('application/json')
    const data = isJson ? await res.json().catch(() => null) : null
    throw new ApiError(res.status, messageFromData(data, `Error ${res.status}`), data)
  }
  return res.blob()
}

export const api = {
  get: <T>(path: string, token?: string | null, signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', token, signal }),
  getBlob: (path: string, token?: string | null) => requestBlob(path, token),
  post: <T>(path: string, body?: unknown, token?: string | null, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body, token, signal }),
  put: <T>(path: string, body?: unknown, token?: string | null, signal?: AbortSignal) =>
    request<T>(path, { method: 'PUT', body, token, signal }),
  patch: <T>(path: string, body?: unknown, token?: string | null, signal?: AbortSignal) =>
    request<T>(path, { method: 'PATCH', body, token, signal }),
  del: <T>(path: string, token?: string | null, signal?: AbortSignal) =>
    request<T>(path, { method: 'DELETE', token, signal }),
}
