import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronDown,
  Hand,
  Loader2,
  Minus,
  Plus,
  Sparkles,
} from 'lucide-react'
import type { ConfiguracionPreciosService, DolarModo } from '@/types'
import {
  actualizarConfiguracion,
  type ConfiguracionInput,
  type DolarBlue,
} from '@/services/preciosService'
import { ApiError } from '@/lib/api'
import { money0 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ToastProvider'
import {
  REDONDEOS,
  REFERENCIAS,
  calcularDolar,
  describirRegla,
  mismaRegla,
  referenciaDelBlue,
  reglaAInput,
  reglaDeConfig,
  type ReglaDolar,
} from './reglaDolar'

/**
 * Cómo se define el dólar del negocio: a mano, o siguiendo al blue.
 *
 * Dos tarjetas arriba (Manual / Automático), cada una con su explicación de
 * una línea. En automático la regla se lee como una oración con partes
 * editables —«Tomar [Blue venta] y sumar [$] [25], redondear [a $5]»— y abajo
 * se ve en vivo cuánto quedaría. Nada se aplica hasta tocar Guardar; al
 * guardar, el backend calcula con el blue vigente y la respuesta ya trae el
 * dólar nuevo (que recalcula Service y Productos, como siempre).
 */
export function ReglaDolarEditor({
  config,
  blue,
  onGuardado,
}: {
  config: ConfiguracionPreciosService
  /** La cotización a la vista (para la vista previa). Puede faltar. */
  blue: DolarBlue | null | undefined
  onGuardado?: (config: ConfiguracionPreciosService) => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [modo, setModo] = useState<DolarModo>(config.dolar_modo)
  const [regla, setRegla] = useState<ReglaDolar>(() => reglaDeConfig(config))
  // El ajuste se edita como signo + número positivo: «+ $ 25» se lee mejor
  // que un «-10» escondido en un campo.
  const [signo, setSigno] = useState<1 | -1>(config.dolar_ajuste_valor < 0 ? -1 : 1)
  const [ajusteTexto, setAjusteTexto] = useState(String(Math.abs(Number(config.dolar_ajuste_valor))))
  const [cambioMinimoTexto, setCambioMinimoTexto] = useState(String(Number(config.dolar_cambio_minimo)))
  const [afinar, setAfinar] = useState(Number(config.dolar_cambio_minimo) > 0)
  const [valorManual, setValorManual] = useState(String(Number(config.dolar)))
  const [nota, setNota] = useState('')

  // Se vuelve a lo guardado cuando la configuración cambia de verdad (un
  // guardado, o el automático que movió el dólar), no en cada refetch.
  useEffect(() => {
    setModo(config.dolar_modo)
    const guardada = reglaDeConfig(config)
    setRegla(guardada)
    setSigno(guardada.ajusteValor < 0 ? -1 : 1)
    setAjusteTexto(String(Math.abs(guardada.ajusteValor)))
    setCambioMinimoTexto(String(guardada.cambioMinimo))
    setAfinar((previo) => previo || guardada.cambioMinimo > 0)
    setValorManual(String(Number(config.dolar)))
    setNota('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.actualizado, config.dolar, config.dolar_modo])

  // El número del ajuste y el cambio mínimo viajan como texto mientras se
  // escriben; acá se los vuelve regla (inválido = se ignora en la vista previa).
  const ajusteNumero = Number(ajusteTexto.trim().replace(',', '.'))
  const ajusteValido = ajusteTexto.trim() !== '' && Number.isFinite(ajusteNumero) && ajusteNumero >= 0
  const cambioMinimoNumero = Number(cambioMinimoTexto.trim().replace(',', '.'))
  const cambioMinimoValido =
    cambioMinimoTexto.trim() === '' ||
    (Number.isFinite(cambioMinimoNumero) && cambioMinimoNumero >= 0)

  const reglaEditada: ReglaDolar = useMemo(
    () => ({
      ...regla,
      ajusteValor: ajusteValido ? signo * ajusteNumero : regla.ajusteValor,
      cambioMinimo: cambioMinimoValido && cambioMinimoTexto.trim() !== '' ? cambioMinimoNumero : 0,
    }),
    [regla, signo, ajusteNumero, ajusteValido, cambioMinimoNumero, cambioMinimoValido, cambioMinimoTexto],
  )

  const actual = Number(config.dolar)
  const base = referenciaDelBlue(reglaEditada.referencia, blue)
  const previa = calcularDolar(reglaEditada, blue)
  const diferencia = previa !== null ? previa - actual : null

  const valorManualNumero = Number(valorManual.trim().replace(',', '.'))
  const manualValido = Number.isFinite(valorManualNumero) && valorManualNumero > 0

  const cambioDeModo = modo !== config.dolar_modo
  const sucio =
    cambioDeModo ||
    (modo === 'automatico'
      ? !mismaRegla(reglaEditada, reglaDeConfig(config))
      : valorManualNumero !== actual || nota.trim() !== '')
  const puedeGuardar =
    sucio && (modo === 'automatico' ? ajusteValido && cambioMinimoValido : manualValido)

  const guardar = useMutation({
    mutationFn: () => {
      const payload: Partial<ConfiguracionInput> = { dolar_modo: modo }
      if (modo === 'automatico') {
        if (!ajusteValido) throw new ApiError(0, 'El ajuste tiene que ser un número (0 si no querés ajustar).', null)
        if (!cambioMinimoValido) throw new ApiError(0, 'El cambio mínimo tiene que ser un número de 0 o más.', null)
        Object.assign(payload, reglaAInput(reglaEditada))
      } else {
        if (!manualValido) throw new ApiError(0, 'Poné un dólar válido (ej: 1550).', null)
        payload.dolar = valorManualNumero
        if (nota.trim()) payload.dolar_nota = nota.trim()
      }
      return actualizarConfiguracion(payload)
    },
    onSuccess: (guardada) => {
      const nuevo = Number(guardada.dolar)
      if (guardada.dolar_modo === 'automatico') {
        toast.success(
          `Dólar automático: ${money0(nuevo)}`,
          nuevo !== actual
            ? `Se calculó con ${guardada.dolar_regla}. Service y Productos quedaron recalculados.`
            : `Sigue al ${guardada.dolar_regla}. Hoy no cambia: ya estaba en ese valor.`,
        )
      } else {
        toast.success(
          `Dólar del negocio: ${money0(nuevo)}`,
          nuevo !== actual
            ? 'Service y Productos quedaron recalculados.'
            : 'Queda fijo en ese valor hasta que lo cambies.',
        )
      }
      queryClient.invalidateQueries({ queryKey: ['service-config'] })
      queryClient.invalidateQueries({ queryKey: ['service-secciones'] })
      queryClient.invalidateQueries({ queryKey: ['productos-config'] })
      queryClient.invalidateQueries({ queryKey: ['productos-items'] })
      queryClient.invalidateQueries({ queryKey: ['dolar-historial'] })
      onGuardado?.(guardada)
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  return (
    <div className="mt-3 space-y-3">
      {/* ===== Modo: dos tarjetas, cada una explica qué hace ===== */}
      <div role="radiogroup" aria-label="Cómo se define el dólar" className="grid grid-cols-2 gap-2">
        <OpcionModo
          activa={modo === 'manual'}
          icono={Hand}
          titulo="Manual"
          texto="Lo escribís vos y queda fijo hasta que lo cambies."
          onClick={() => setModo('manual')}
        />
        <OpcionModo
          activa={modo === 'automatico'}
          icono={Sparkles}
          titulo="Automático"
          texto="Sigue al dólar blue con el ajuste que elijas."
          onClick={() => setModo('automatico')}
        />
      </div>

      {modo === 'automatico' ? (
        <div className="rounded-2xl border border-line bg-canvas/40 p-3 sm:p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
            Se calcula así
          </p>

          {/* La regla como una oración con partes editables. En pantallas
              angostas las partes se apilan de a renglones. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-ink-700">
            <span>Tomar</span>
            <Select
              options={REFERENCIAS.map((r) => ({ value: r.value, label: r.label }))}
              value={reglaEditada.referencia}
              onChange={(v) => setRegla((r) => ({ ...r, referencia: v as ReglaDolar['referencia'] }))}
              className="w-[9.5rem]"
              triggerClassName="h-10"
            />
            <span className="tnum text-ink-400">
              {base !== null ? `(${money0(base)})` : '(sin cotización ahora)'}
            </span>
            <span>y</span>
            <div className="inline-flex overflow-hidden rounded-xl border border-line-strong bg-surface">
              <button
                type="button"
                onClick={() => setSigno(1)}
                aria-pressed={signo === 1}
                title="Sumar al blue"
                className={cn(
                  'grid h-10 w-10 place-items-center transition-colors',
                  signo === 1 ? 'bg-ink-950 text-on-ink' : 'text-ink-500 hover:bg-ink-50',
                )}
              >
                <Plus className="h-4 w-4" aria-hidden />
                <span className="sr-only">sumar</span>
              </button>
              <button
                type="button"
                onClick={() => setSigno(-1)}
                aria-pressed={signo === -1}
                title="Restar al blue"
                className={cn(
                  'grid h-10 w-10 place-items-center border-l border-line-strong transition-colors',
                  signo === -1 ? 'bg-ink-950 text-on-ink' : 'text-ink-500 hover:bg-ink-50',
                )}
              >
                <Minus className="h-4 w-4" aria-hidden />
                <span className="sr-only">restar</span>
              </button>
            </div>
            <div className="inline-flex overflow-hidden rounded-xl border border-line-strong bg-surface">
              <button
                type="button"
                onClick={() => setRegla((r) => ({ ...r, ajusteTipo: 'monto' }))}
                aria-pressed={reglaEditada.ajusteTipo === 'monto'}
                title="Pesos fijos (ej: + $25)"
                className={cn(
                  'h-10 px-3 text-sm font-semibold transition-colors',
                  reglaEditada.ajusteTipo === 'monto' ? 'bg-ink-950 text-on-ink' : 'text-ink-500 hover:bg-ink-50',
                )}
              >
                $
              </button>
              <button
                type="button"
                onClick={() => setRegla((r) => ({ ...r, ajusteTipo: 'porcentaje' }))}
                aria-pressed={reglaEditada.ajusteTipo === 'porcentaje'}
                title="Porcentaje del blue (ej: + 2 %)"
                className={cn(
                  'h-10 border-l border-line-strong px-3 text-sm font-semibold transition-colors',
                  reglaEditada.ajusteTipo === 'porcentaje' ? 'bg-ink-950 text-on-ink' : 'text-ink-500 hover:bg-ink-50',
                )}
              >
                %
              </button>
            </div>
            <Input
              value={ajusteTexto}
              onChange={(e) => setAjusteTexto(e.target.value)}
              inputMode="decimal"
              aria-label={reglaEditada.ajusteTipo === 'porcentaje' ? 'Porcentaje de ajuste' : 'Pesos de ajuste'}
              aria-invalid={!ajusteValido}
              className={cn('tnum h-10 w-24 px-3', !ajusteValido && 'border-ink-900')}
            />
            <span>redondeando</span>
            <Select
              options={REDONDEOS}
              value={String(reglaEditada.redondeo)}
              onChange={(v) => setRegla((r) => ({ ...r, redondeo: Number(v) }))}
              className="w-[9.5rem]"
              triggerClassName="h-10"
            />
          </div>

          {/* Vista previa en vivo */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-3.5 py-2.5">
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
                Quedaría en
              </p>
              <p className="tnum text-xl font-bold tracking-tight text-ink-950">
                {previa !== null ? money0(previa) : '—'}
              </p>
            </div>
            <p className="text-xs leading-snug text-ink-500">
              {previa === null ? (
                <span className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    Sin cotización del blue a la vista: se calcula con la próxima que llegue.
                  </span>
                </span>
              ) : (
                <>
                  hoy {money0(actual)}
                  {diferencia !== null && diferencia !== 0 && (
                    <>
                      {' · '}
                      <b className="tnum text-ink-900">
                        {diferencia > 0 ? '+' : '−'} {money0(Math.abs(diferencia))}
                      </b>
                    </>
                  )}
                  {diferencia === 0 && ' · sin cambio'}
                  {' · '}
                  <span className="text-ink-400">{describirRegla(reglaEditada)}</span>
                </>
              )}
            </p>
          </div>

          {/* Afinar: lo que casi nunca hace falta tocar, plegado */}
          <button
            type="button"
            onClick={() => setAfinar((v) => !v)}
            aria-expanded={afinar}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', afinar && 'rotate-180')} aria-hidden />
            Afinar
          </button>
          {afinar && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-ink-700">
              <span>No actualizar si el cambio es menor a</span>
              <div className="relative w-24">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                  $
                </span>
                <Input
                  value={cambioMinimoTexto}
                  onChange={(e) => setCambioMinimoTexto(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Cambio mínimo para actualizar"
                  aria-invalid={!cambioMinimoValido}
                  className={cn('tnum h-10 pl-6 pr-2', !cambioMinimoValido && 'border-ink-900')}
                />
              </div>
              <span className="basis-full text-xs leading-snug text-ink-400">
                Para que una oscilación chica del blue no mueva toda la lista. Con 0 se actualiza
                siempre que el resultado cambie.
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-canvas/40 p-3 sm:p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
            Nuevo dólar del negocio
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="relative w-32">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                $
              </span>
              <Input
                value={valorManual}
                onChange={(e) => setValorManual(e.target.value)}
                inputMode="decimal"
                aria-label="Nuevo dólar del negocio"
                aria-invalid={!manualValido}
                className={cn('tnum h-10 pl-6 pr-2', !manualValido && 'border-ink-900')}
              />
            </div>
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={200}
              placeholder="Motivo (opcional): queda en el historial"
              aria-label="Motivo del cambio"
              className="h-10 min-w-[12rem] flex-1"
            />
          </div>
          {config.dolar_modo === 'automatico' && (
            <p className="mt-2 text-xs leading-snug text-ink-500">
              Al guardar deja de seguir al blue: queda fijo en el valor que pongas.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {sucio && (
          <button
            type="button"
            onClick={() => {
              setModo(config.dolar_modo)
              const guardada = reglaDeConfig(config)
              setRegla(guardada)
              setSigno(guardada.ajusteValor < 0 ? -1 : 1)
              setAjusteTexto(String(Math.abs(guardada.ajusteValor)))
              setCambioMinimoTexto(String(guardada.cambioMinimo))
              setValorManual(String(Number(config.dolar)))
              setNota('')
            }}
            className="text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
          >
            Descartar cambios
          </button>
        )}
        <Button size="sm" onClick={() => guardar.mutate()} disabled={!puedeGuardar || guardar.isPending}>
          {guardar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : modo === 'automatico' ? (
            cambioDeModo ? 'Activar automático' : 'Guardar regla'
          ) : cambioDeModo ? (
            'Fijar a mano'
          ) : (
            'Guardar'
          )}
        </Button>
      </div>
    </div>
  )
}

function OpcionModo({
  activa,
  icono: Icono,
  titulo,
  texto,
  onClick,
}: {
  activa: boolean
  icono: typeof Hand
  titulo: string
  texto: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        activa
          ? 'border-ink-950 bg-ink-950 text-on-ink'
          : 'border-line-strong bg-surface text-ink-700 hover:border-ink-300 hover:bg-ink-50',
      )}
    >
      <Icono className={cn('mt-0.5 h-4 w-4 shrink-0', activa ? 'text-on-ink' : 'text-ink-400')} aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className={cn('block text-[0.72rem] leading-snug', activa ? 'text-on-ink/75' : 'text-ink-500')}>
          {texto}
        </span>
      </span>
    </button>
  )
}

/** Chip con el modo vigente, para los gestores compactos (Panel, Service, Productos). */
export function ChipModoDolar({
  config,
  detalle = true,
  className,
}: {
  config: ConfiguracionPreciosService
  /** Con la regla y la última revisión; sin esto, solo «Automático» / «Manual». */
  detalle?: boolean
  className?: string
}): ReactNode {
  const automatico = config.dolar_modo === 'automatico'
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium',
        automatico ? 'border-ink-950 bg-ink-950 text-on-ink' : 'border-line-strong text-ink-600',
        className,
      )}
      title={
        automatico
          ? `Sigue al dólar blue: ${config.dolar_regla}`
          : 'Lo fija una persona y queda fijo hasta que lo cambie'
      }
    >
      {automatico ? <Sparkles className="h-3 w-3 shrink-0" aria-hidden /> : <Hand className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="truncate">
        {automatico ? 'Automático' : 'Manual'}
        {detalle && automatico && config.dolar_regla && (
          <span className={cn('font-normal', automatico ? 'text-on-ink/75' : 'text-ink-400')}>
            {' · '}
            {config.dolar_regla}
          </span>
        )}
      </span>
    </span>
  )
}
