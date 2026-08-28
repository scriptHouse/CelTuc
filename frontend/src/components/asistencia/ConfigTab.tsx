import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Copy,
  Download,
  KeyRound,
  Laptop,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Watch,
} from 'lucide-react'
import type { AgenteAsistencia, RelojAsistencia } from '@/types'
import {
  actualizarAgente,
  actualizarReloj,
  crearAgente,
  crearReloj,
  descargarArchivo,
  eliminarAgente,
  eliminarReloj,
  generarConfigToml,
  listarAgentes,
  listarRelojes,
  regenerarTokenAgente,
  type AgenteConToken,
} from '@/services/asistencia'
import { listarSucursales } from '@/services/sucursales'
import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CampoBooleano } from '@/components/ui/CampoBooleano'
import { Card } from '@/components/ui/Card'
import { ControlSucursalesSeccion } from '@/components/asistencia/ControlSucursalesSeccion'
import { EmptyState } from '@/components/ui/EmptyState'
import { EnLineaDot } from '@/components/ui/StatusBadge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { tiempoRelativo } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

/** Datos del token recién creado/regenerado (se muestra una sola vez). */
interface TokenNuevo {
  token: string
  agenteNombre: string
  reloj: RelojAsistencia | null
}

export function ConfigTab() {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const { data: relojes = [], isLoading: cargandoRelojes } = useQuery({
    queryKey: ['asistencia', 'relojes'],
    queryFn: listarRelojes,
  })
  const { data: agentes = [], isLoading: cargandoAgentes } = useQuery({
    queryKey: ['asistencia', 'agentes'],
    queryFn: listarAgentes,
  })

  const [relojEditando, setRelojEditando] = useState<RelojAsistencia | null | 'nuevo'>(null)
  const [agenteEditando, setAgenteEditando] = useState<AgenteAsistencia | null | 'nuevo'>(null)
  const [tokenNuevo, setTokenNuevo] = useState<TokenNuevo | null>(null)

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['asistencia'] })

  const borrarReloj = useMutation({
    mutationFn: (id: number) => eliminarReloj(id),
    onSuccess: () => {
      invalidar()
      toast.success('Reloj eliminado', 'El histórico de fichadas se conserva.')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  const borrarAgente = useMutation({
    mutationFn: (id: number) => eliminarAgente(id),
    onSuccess: () => {
      invalidar()
      toast.success('Agente eliminado', 'Su token dejó de funcionar.')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  const regenerar = useMutation({
    mutationFn: (agente: AgenteAsistencia) => regenerarTokenAgente(agente.id),
    onSuccess: (r, agente) => {
      invalidar()
      setTokenNuevo({
        token: r.token,
        agenteNombre: agente.nombre,
        reloj: relojes.find((d) => d.id === agente.dispositivo) ?? null,
      })
    },
    onError: (e: Error) => toast.error('No se pudo regenerar el token', e.message),
  })

  return (
    <div className="space-y-6">
      {/* --- Relojes --------------------------------------------------------- */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Relojes por sucursal
          </h3>
          <Button size="sm" onClick={() => setRelojEditando('nuevo')}>
            <Plus className="h-4 w-4" />
            Nuevo reloj
          </Button>
        </div>
        {cargandoRelojes ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : relojes.length === 0 ? (
          <EmptyState
            icon={Watch}
            title="Sin relojes todavía"
            description="Cargá el reloj de la primera sucursal: su IP en la red local y listo. Los intervalos ya vienen con valores recomendados."
            action={
              <Button onClick={() => setRelojEditando('nuevo')}>
                <Plus className="h-4 w-4" />
                Cargar el primero
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {relojes.map((reloj, i) => (
              <Card key={reloj.id} className="ct-stagger-item p-4" style={ctStagger(i)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-ink-400">
                      {reloj.sucursal_nombre}
                    </p>
                    <h4 className="mt-0.5 font-semibold text-ink-950">{reloj.nombre}</h4>
                    <p className="tnum mt-0.5 text-xs text-ink-400">
                      {reloj.host}:{reloj.puerto} · consulta cada {reloj.poll_seconds} s ·{' '}
                      {reloj.backfill_dias} días de arranque
                    </p>
                    {reloj.numero_serie && (
                      <p className="tnum mt-0.5 text-xs text-ink-400">
                        {reloj.modelo} · serie {reloj.numero_serie}
                        {reloj.firmware ? ` · ${reloj.firmware}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!reloj.activo && <Badge tone="outline">Inactivo</Badge>}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${reloj.nombre}`}
                      onClick={() => setRelojEditando(reloj)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar ${reloj.nombre}`}
                      onClick={async () => {
                        const ok = await confirm({
                          title: `¿Eliminar «${reloj.nombre}»?`,
                          description:
                            'Sus agentes dejan de sincronizar. Las fichadas ya recibidas se conservan.',
                          confirmLabel: 'Eliminar',
                          tone: 'danger',
                        })
                        if (ok === true) borrarReloj.mutate(reloj.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* --- Agentes --------------------------------------------------------- */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Agentes (notebooks)
          </h3>
          <Button size="sm" onClick={() => setAgenteEditando('nuevo')} disabled={relojes.length === 0}>
            <Plus className="h-4 w-4" />
            Nuevo agente
          </Button>
        </div>
        {cargandoAgentes ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : agentes.length === 0 ? (
          <EmptyState
            icon={Laptop}
            title="Sin agentes todavía"
            description="El agente es el programita que corre solo en la notebook de la sucursal. Crealo acá: te da el token y el archivo de configuración listos."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-4 py-2.5 font-semibold">Agente</th>
                    <th className="px-4 py-2.5 font-semibold">Reloj</th>
                    <th className="px-4 py-2.5 font-semibold">Token</th>
                    <th className="px-4 py-2.5 font-semibold">Estado</th>
                    <th className="w-32 px-2 py-2.5" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {agentes.map((agente, i) => (
                    <tr key={agente.id} className="ct-stagger-fade" style={ctStagger(i)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-950">{agente.nombre}</p>
                        <p className="tnum text-xs text-ink-400">
                          {agente.hostname || 'sin reportar'}
                          {agente.version ? ` · v${agente.version}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-ink-600">
                        {agente.dispositivo_nombre} · {agente.sucursal_nombre}
                      </td>
                      <td className="tnum px-4 py-3 text-ink-600">{agente.token_prefijo}…</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <EnLineaDot enLinea={agente.en_linea} />
                          <span className={cn('text-xs', agente.en_linea ? 'text-ink-900' : 'text-ink-400')}>
                            {agente.en_linea
                              ? 'En línea'
                              : agente.ultimo_heartbeat
                                ? `Visto ${tiempoRelativo(agente.ultimo_heartbeat)}`
                                : 'Nunca conectó'}
                          </span>
                          {!agente.activo && <Badge tone="outline">Desactivado</Badge>}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Regenerar token de ${agente.nombre}`}
                            title="Regenerar token"
                            onClick={async () => {
                              const ok = await confirm({
                                title: '¿Regenerar el token?',
                                description:
                                  'El token actual deja de funcionar al instante: habrá que actualizar la config de la notebook.',
                                confirmLabel: 'Regenerar',
                                tone: 'warning',
                              })
                              if (ok === true) regenerar.mutate(agente)
                            }}
                          >
                            <RefreshCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${agente.nombre}`}
                            onClick={() => setAgenteEditando(agente)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Eliminar ${agente.nombre}`}
                            onClick={async () => {
                              const ok = await confirm({
                                title: `¿Eliminar «${agente.nombre}»?`,
                                description: 'Su token deja de funcionar y la notebook no podrá sincronizar más.',
                                confirmLabel: 'Eliminar',
                                tone: 'danger',
                              })
                              if (ok === true) borrarAgente.mutate(agente.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <ControlSucursalesSeccion />

      <GuiaInstalacion />

      <RelojModal
        reloj={relojEditando === 'nuevo' ? null : relojEditando}
        abierto={relojEditando !== null}
        onClose={() => setRelojEditando(null)}
      />
      <AgenteModal
        agente={agenteEditando === 'nuevo' ? null : agenteEditando}
        abierto={agenteEditando !== null}
        relojes={relojes}
        onClose={() => setAgenteEditando(null)}
        onToken={setTokenNuevo}
      />
      <TokenModal datos={tokenNuevo} onClose={() => setTokenNuevo(null)} />
    </div>
  )
}

// --- Modal de reloj ----------------------------------------------------------

function RelojModal({
  reloj,
  abierto,
  onClose,
}: {
  reloj: RelojAsistencia | null
  abierto: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: sucursales = [] } = useQuery({
    queryKey: ['sucursales'],
    queryFn: listarSucursales,
    enabled: abierto,
  })

  const [sucursal, setSucursal] = useState('')
  const [nombre, setNombre] = useState('')
  const [host, setHost] = useState('')
  const [puerto, setPuerto] = useState('80')
  const [usuario, setUsuario] = useState('admin')
  const [activo, setActivo] = useState(true)
  const [avanzado, setAvanzado] = useState(false)
  const [poll, setPoll] = useState('20')
  const [overlap, setOverlap] = useState('180')
  const [timeout_, setTimeout_] = useState('10')
  const [backfill, setBackfill] = useState('90')
  const [usarHttps, setUsarHttps] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setSucursal(reloj ? String(reloj.sucursal) : '')
    setNombre(reloj?.nombre ?? '')
    setHost(reloj?.host ?? '')
    setPuerto(String(reloj?.puerto ?? 80))
    setUsuario(reloj?.usuario_isapi ?? 'admin')
    setActivo(reloj?.activo ?? true)
    setPoll(String(reloj?.poll_seconds ?? 20))
    setOverlap(String(reloj?.overlap_seconds ?? 180))
    setTimeout_(String(reloj?.timeout_seconds ?? 10))
    setBackfill(String(reloj?.backfill_dias ?? 90))
    setUsarHttps(reloj?.usar_https ?? false)
    setAvanzado(false)
  }, [abierto, reloj])

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        sucursal: Number(sucursal),
        nombre: nombre.trim(),
        host: host.trim(),
        puerto: Number(puerto) || 80,
        usuario_isapi: usuario.trim() || 'admin',
        activo,
        poll_seconds: Number(poll) || 20,
        overlap_seconds: Number(overlap) || 180,
        timeout_seconds: Number(timeout_) || 10,
        backfill_dias: Number(backfill) || 90,
        usar_https: usarHttps,
      }
      return reloj ? actualizarReloj(reloj.id, cuerpo) : crearReloj(cuerpo)
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success(
        reloj ? 'Reloj actualizado' : 'Reloj creado',
        reloj
          ? 'El agente aplica los cambios solo en el próximo heartbeat (~1 min).'
          : `«${r.nombre}» listo. Ahora creá su agente para conectar la notebook.`,
      )
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo guardar el reloj', e.message),
  })

  const valido = sucursal !== '' && nombre.trim() !== '' && host.trim() !== ''

  return (
    <Modal open={abierto} onClose={onClose} size="lg">
      <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">
          {reloj ? `Editar «${reloj.nombre}»` : 'Nuevo reloj'}
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Todo lo que cambies acá llega solo a la notebook: no hay que tocar nada en la sucursal.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Select
            label="Sucursal"
            placeholder="Elegir sucursal…"
            value={sucursal}
            onChange={setSucursal}
            options={sucursales.map((s) => ({ value: String(s.id), label: s.nombre }))}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Nombre</label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Reloj Salta" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              IP del reloj en la sucursal
            </label>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.50"
              className="tnum"
            />
            <p className="mt-1 text-xs text-ink-400">
              Conviene reservarle esta IP en el router (reserva DHCP por MAC).
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Usuario ISAPI</label>
            <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="admin" />
            <p className="mt-1 text-xs text-ink-400">
              La contraseña se carga en la notebook, nunca acá.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="mt-4 text-sm font-medium text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
          onClick={() => setAvanzado(!avanzado)}
        >
          {avanzado ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas'}
        </button>
        {avanzado && (
          <div className="mt-3 grid gap-4 rounded-xl border border-line bg-ink-50 p-4 sm:grid-cols-2">
            <CampoNumero etiqueta="Consultar el reloj cada (seg)" valor={poll} onChange={setPoll} />
            <CampoNumero etiqueta="Solapamiento anti-pérdida (seg)" valor={overlap} onChange={setOverlap} />
            <CampoNumero etiqueta="Timeout de red (seg)" valor={timeout_} onChange={setTimeout_} />
            <CampoNumero
              etiqueta="Días a recuperar en la primera sync"
              valor={backfill}
              onChange={setBackfill}
            />
            <CampoNumero etiqueta="Puerto" valor={puerto} onChange={setPuerto} />
            <div className="flex items-end gap-4 pb-1.5">
              <CampoBooleano etiqueta="HTTPS hacia el reloj" valor={usarHttps} onChange={setUsarHttps} />
              <CampoBooleano etiqueta="Activo" valor={activo} onChange={setActivo} />
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {reloj ? 'Guardar cambios' : 'Crear reloj'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function CampoNumero({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string
  valor: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink-700">{etiqueta}</label>
      <Input
        type="number"
        inputMode="numeric"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="tnum"
      />
    </div>
  )
}

// --- Modal de agente ---------------------------------------------------------

function AgenteModal({
  agente,
  abierto,
  relojes,
  onClose,
  onToken,
}: {
  agente: AgenteAsistencia | null
  abierto: boolean
  relojes: RelojAsistencia[]
  onClose: () => void
  onToken: (t: TokenNuevo) => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [dispositivo, setDispositivo] = useState('')
  const [nombre, setNombre] = useState('')
  const [activo, setActivo] = useState(true)
  const [sync, setSync] = useState('10')
  const [batch, setBatch] = useState('200')
  const [heartbeat, setHeartbeat] = useState('60')
  const [nivelLog, setNivelLog] = useState('INFO')

  useEffect(() => {
    if (!abierto) return
    setDispositivo(agente ? String(agente.dispositivo) : (relojes[0] ? String(relojes[0].id) : ''))
    setNombre(agente?.nombre ?? '')
    setActivo(agente?.activo ?? true)
    setSync(String(agente?.sync_seconds ?? 10))
    setBatch(String(agente?.batch_size ?? 200))
    setHeartbeat(String(agente?.heartbeat_seconds ?? 60))
    setNivelLog(agente?.nivel_log ?? 'INFO')
  }, [abierto, agente, relojes])

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        dispositivo: Number(dispositivo),
        nombre: nombre.trim(),
        activo,
        sync_seconds: Number(sync) || 10,
        batch_size: Number(batch) || 200,
        heartbeat_seconds: Number(heartbeat) || 60,
        nivel_log: nivelLog,
      }
      return agente ? actualizarAgente(agente.id, cuerpo) : crearAgente(cuerpo)
    },
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      if (agente) {
        toast.success('Agente actualizado', 'Aplica los cambios en el próximo heartbeat (~1 min).')
      } else {
        onToken({
          token: (resultado as AgenteConToken).token,
          agenteNombre: resultado.nombre,
          reloj: relojes.find((d) => d.id === resultado.dispositivo) ?? null,
        })
      }
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo guardar el agente', e.message),
  })

  const valido = dispositivo !== '' && nombre.trim() !== ''

  return (
    <Modal open={abierto} onClose={onClose} size="md">
      <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">
          {agente ? `Editar «${agente.nombre}»` : 'Nuevo agente'}
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          {agente
            ? 'Los intervalos llegan solos a la notebook: no hay que reinstalar nada.'
            : 'Al crearlo te damos el token y el config.toml para instalar en la notebook.'}
        </p>

        <div className="mt-5 space-y-4">
          <Select
            label="Reloj que sincroniza"
            placeholder="Elegir reloj…"
            value={dispositivo}
            onChange={setDispositivo}
            options={relojes.map((r) => ({
              value: String(r.id),
              label: `${r.nombre} · ${r.sucursal_nombre}`,
            }))}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Nombre del agente</label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="salta-notebook-01"
            />
          </div>
          {agente && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoNumero etiqueta="Subir fichadas cada (seg)" valor={sync} onChange={setSync} />
              <CampoNumero etiqueta="Heartbeat cada (seg)" valor={heartbeat} onChange={setHeartbeat} />
              <CampoNumero etiqueta="Fichadas por envío (máx 500)" valor={batch} onChange={setBatch} />
              <Select
                label="Nivel de log"
                value={nivelLog}
                onChange={setNivelLog}
                options={[
                  { value: 'INFO', label: 'INFO (normal)' },
                  { value: 'DEBUG', label: 'DEBUG (diagnóstico)' },
                  { value: 'WARNING', label: 'WARNING (mínimo)' },
                ]}
              />
              <div className="sm:col-span-2">
                <CampoBooleano etiqueta="Agente activo (puede sincronizar)" valor={activo} onChange={setActivo} />
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {agente ? 'Guardar cambios' : 'Crear y generar token'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// --- Modal del token (se muestra UNA sola vez) -------------------------------

function TokenModal({ datos, onClose }: { datos: TokenNuevo | null; onClose: () => void }) {
  const toast = useToast()

  const copiar = async () => {
    if (!datos) return
    try {
      await navigator.clipboard.writeText(datos.token)
      toast.success('Token copiado')
    } catch {
      toast.error('No se pudo copiar', 'Seleccionalo y copialo a mano.')
    }
  }

  const descargarConfig = () => {
    if (!datos) return
    const contenido = generarConfigToml({
      agenteNombre: datos.agenteNombre,
      relojNombre: datos.reloj?.nombre ?? '',
      sucursalNombre: datos.reloj?.sucursal_nombre ?? '',
      host: datos.reloj?.host ?? '192.168.1.50',
      usuarioIsapi: datos.reloj?.usuario_isapi ?? 'admin',
      tokenAgente: datos.token,
    })
    descargarArchivo('config.toml', contenido)
  }

  return (
    <Modal open={datos !== null} onClose={onClose} size="md" dismissable={false}>
      <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-950 text-on-ink">
            <KeyRound className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-ink-950">Token de «{datos?.agenteNombre}»</h3>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Guardalo ahora: no se vuelve a mostrar.
            </p>
          </div>
        </div>

        <div className="tnum mt-4 select-all break-all rounded-xl border border-line bg-ink-50 p-3.5 text-sm text-ink-900">
          {datos?.token}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={copiar}>
            <Copy className="h-4 w-4" />
            Copiar token
          </Button>
          <Button onClick={descargarConfig}>
            <Download className="h-4 w-4" />
            Descargar config.toml
          </Button>
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs text-ink-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          El config.toml ya trae la URL del sistema, este token y la IP del reloj. Solo falta
          copiarlo a la notebook y correr el instalador (ver la guía de abajo).
        </p>

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Listo, lo guardé
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// --- Guía de instalación -----------------------------------------------------

const PASOS: { titulo: string; detalle: React.ReactNode }[] = [
  {
    titulo: 'Preparar el reloj (una sola vez)',
    detalle: (
      <>
        Encendelo, configurale fecha/hora y zona horaria de Argentina, conectalo al Wi-Fi de la
        sucursal y registrá los rostros de los empleados con su número. Después, en el router,
        reservale la IP (reserva DHCP) para que no cambie.
      </>
    ),
  },
  {
    titulo: 'Crear el reloj y su agente en esta pantalla',
    detalle: (
      <>
        Arriba: «Nuevo reloj» con la IP reservada, y «Nuevo agente» para la notebook. Al crear el
        agente descargá el <code className="tnum">config.toml</code> (incluye el token).
      </>
    ),
  },
  {
    titulo: 'Probar la conexión con el reloj (opcional pero recomendado)',
    detalle: (
      <>
        En la notebook, con el ejecutable ya copiado:
        <Comando texto={'hikvision-agent.exe diag --host 192.168.1.50 --username admin --password ****'} />
        Tiene que decir <code className="tnum">[OK] Model / Firmware / Events query</code>. La
        primera vez, guardá también un payload real con{' '}
        <code className="tnum">--save-fixture</code> (ver README del agente).
      </>
    ),
  },
  {
    titulo: 'Instalar el agente en la notebook',
    detalle: (
      <>
        Copiá a una carpeta <code className="tnum">hikvision-agent.exe</code>,{' '}
        <code className="tnum">config.toml</code> e <code className="tnum">install_task.ps1</code>{' '}
        (están en <code className="tnum">hikvision-agent/</code> del proyecto; el .exe se genera con{' '}
        <code className="tnum">scripts\build_exe.ps1</code>). En PowerShell como Administrador:
        <Comando texto={'powershell -ExecutionPolicy Bypass -File install_task.ps1'} />
        El instalador pide la contraseña del reloj (queda cifrada en la notebook) y deja el servicio
        arrancando solo con Windows, invisible y con reintentos automáticos.
      </>
    ),
  },
  {
    titulo: 'Verificar y asignar empleados',
    detalle: (
      <>
        En 1–2 minutos el equipo aparece «En línea» en la pestaña Panel. Hacé una fichada de prueba:
        cuando llegue, vas a ver el número del reloj en la pestaña Empleados para vincularlo con el
        empleado del sistema (las fichadas anteriores se reasignan solas).
      </>
    ),
  },
  {
    titulo: 'Prueba de fuego (criterio de aceptación)',
    detalle: (
      <>
        Apagá la notebook, hacé 2 o 3 fichadas con la notebook apagada y volvé a prenderla sin
        tocar nada: en unos minutos las fichadas tienen que aparecer acá, sin duplicados. Si eso
        funciona, la sucursal queda en modo «prender y olvidarse».
      </>
    ),
  },
]

function Comando({ texto }: { texto: string }) {
  return (
    <pre className="tnum my-2 overflow-x-auto rounded-lg border border-line bg-ink-950 px-3 py-2 text-xs text-on-ink dark:bg-ink-100">
      {texto}
    </pre>
  )
}

function GuiaInstalacion() {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Guía de instalación en la sucursal
      </h3>
      <Card className="p-5">
        <ol className="space-y-4">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo} className="flex gap-3.5">
              <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-950 text-xs font-semibold text-on-ink">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-ink-950">{paso.titulo}</p>
                <div className="mt-1 text-sm leading-relaxed text-ink-600">{paso.detalle}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-t border-line pt-4 text-xs text-ink-400">
          Reglas de oro: el reloj nunca se publica a Internet (todo sale de la notebook hacia
          afuera), la contraseña del reloj vive solo en la notebook, y si se corta Internet o se
          apaga el equipo no se pierde nada: el agente recupera todo al volver.
        </p>
      </Card>
    </section>
  )
}
