import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, PackagePlus } from 'lucide-react'
import type { CompraventaData } from '@/documentos/compraventaContent'
import { listarProductos } from '@/services/productos'
import { ingresarCompraventa, listarSucursales } from '@/services/inventario'
import { ApiError } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ToastProvider'

/**
 * Alta en inventario del equipo usado de un contrato de compraventa, vía el
 * endpoint de mostrador (`/inventario/compraventa/ingresar/`): el backend crea
 * el producto en el catálogo (categoría "Equipos usados") con la batería en el
 * nombre y el IMEI en la nota, y suma 1 unidad en la sucursal elegida (Casa
 * Central por defecto). No requiere admin — alcanza con `ver_inventario` — y
 * queda auditado (ModeloBase + registros de la app auditoría). Si el IMEI ya
 * está en el catálogo no se duplica el producto: se le suma 1 unidad.
 */

const CATEGORIA_USADOS = 'Equipos usados'

/** Saca el % de batería de las observaciones del contrato (ej: "batería 99%"). */
function extraerBateria(obs: string): string {
  const m = obs.match(/(\d{1,3})\s*%/)
  return m && Number(m[1]) <= 100 ? m[1] : ''
}

export function SumarCompraventaInventario({
  abierto,
  datos,
  onCerrar,
}: {
  abierto: boolean
  datos: CompraventaData
  onCerrar: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: sucursales = [], isError: sinAccesoInventario } = useQuery({
    queryKey: ['inv-sucursales'],
    queryFn: listarSucursales,
    enabled: abierto,
  })
  // Solo para avisar de antemano si el IMEI ya está cargado (el backend
  // igualmente no duplica, decida lo que decida esta vista previa).
  const { data: productos = [] } = useQuery({
    queryKey: ['productos-items'],
    queryFn: listarProductos,
    enabled: abierto,
  })

  const activas = useMemo(
    () => sucursales.filter((s) => s.activa).sort((a, b) => a.orden - b.orden || a.id - b.id),
    [sucursales],
  )

  const [bateria, setBateria] = useState('')
  const [sucursalSel, setSucursalSel] = useState('')

  useEffect(() => {
    if (abierto) setBateria(extraerBateria(datos.obs))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  // Destino por defecto: Casa Central (la sucursal cuyo nombre dice "central").
  useEffect(() => {
    if (!abierto || sucursalSel !== '' || activas.length === 0) return
    const central = activas.find((s) => /central/i.test(s.nombre)) ?? activas[0]
    setSucursalSel(String(central.id))
  }, [abierto, activas, sucursalSel])

  const marca = datos.marca.trim()
  const modelo = datos.modelo.trim()
  const color = datos.color.trim()
  const imei1 = datos.imei1.trim()
  const imei2 = datos.imei2.trim()
  const cupon = datos.cupon.trim()

  const equipo = [marca, modelo].filter(Boolean).join(' ')
  const batTexto = bateria.trim()
  const batValida = batTexto === '' || (/^\d{1,3}$/.test(batTexto) && Number(batTexto) <= 100)

  // Mismo IMEI ya cargado (por una compra anterior): se reutiliza el producto.
  const existente = useMemo(
    () =>
      imei1.length >= 8
        ? productos.find((p) => p.activo && p.nota.includes(imei1))
        : undefined,
    [productos, imei1],
  )

  const sucursalNombre = activas.find((s) => String(s.id) === sucursalSel)?.nombre ?? ''
  const nombreProducto = existente
    ? existente.nombre
    : `${equipo} (usado)${batTexto ? ` · ${batTexto}% bat.` : ''}`.slice(0, 200)
  const notaProducto = [
    imei1 ? `IMEI ${imei1}${imei2 ? ` / ${imei2}` : ''}` : '',
    color,
    cupon ? `Cupón ${cupon}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 200)

  const sumar = useMutation({
    mutationFn: () =>
      ingresarCompraventa({
        marca,
        modelo,
        color,
        imei1,
        imei2,
        cupon,
        bateria: batTexto === '' ? null : Number(batTexto),
        sucursal: Number(sucursalSel),
      }),
    onSuccess: ({ producto, stock, reutilizado }) => {
      queryClient.invalidateQueries({ queryKey: ['productos-items'] })
      queryClient.invalidateQueries({ queryKey: ['productos-categorias'] })
      queryClient.invalidateQueries({ queryKey: ['inv-stock'] })
      queryClient.invalidateQueries({ queryKey: ['inv-movimientos'] })
      toast.success(
        'Equipo sumado al inventario',
        `${producto.nombre} → ${sucursalNombre} (queda con ${stock.cantidad} u.)${
          reutilizado ? ' — el IMEI ya estaba: se sumó al producto existente.' : ''
        }`,
      )
      onCerrar()
    },
    onError: (e) =>
      toast.error('No se pudo sumar al inventario', e instanceof ApiError ? e.message : undefined),
  })

  const puedeConfirmar = equipo !== '' && sucursalSel !== '' && batValida && !sumar.isPending

  return (
    <Modal open={abierto} onClose={onCerrar} size="lg" labelledBy="sumar-inv-titulo">
      <div className="border-b border-line px-5 py-4">
        <h2 id="sumar-inv-titulo" className="flex items-center gap-2 text-lg font-semibold text-ink-950">
          <PackagePlus className="h-5 w-5 text-ink-400" aria-hidden />
          Sumar al inventario
        </h2>
        <p className="text-xs text-ink-400">
          El equipo del contrato entra al stock como producto del catálogo.
        </p>
      </div>

      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
        {sinAccesoInventario ? (
          <p className="rounded-xl border border-line bg-ink-50 px-3 py-2.5 text-sm text-ink-600">
            Tu cuenta no tiene acceso al módulo de <b>Inventario</b>: pedile a un administrador
            que te dé el permiso (o que sume el equipo por vos).
          </p>
        ) : equipo === '' ? (
          <p className="rounded-xl border border-line bg-ink-50 px-3 py-2.5 text-sm text-ink-600">
            Completá al menos la <b>marca</b> o el <b>modelo</b> del equipo en el contrato para
            poder sumarlo.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-2xl border border-line bg-canvas/40 p-4 sm:grid-cols-2">
              <DatoResumen label="Equipo" valor={equipo} destacado />
              {color && <DatoResumen label="Color" valor={color} />}
              {imei1 && <DatoResumen label="IMEI 1" valor={imei1} mono />}
              {imei2 && <DatoResumen label="IMEI 2" valor={imei2} mono />}
              {cupon && <DatoResumen label="Cupón" valor={cupon} />}
            </dl>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sumar-inv-bateria" className="mb-1.5 block text-xs font-medium text-ink-500">
                  % de batería
                </label>
                <Input
                  id="sumar-inv-bateria"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={bateria}
                  onChange={(e) => setBateria(e.target.value)}
                  placeholder="Ej: 99"
                  data-autofocus
                />
                <p className="mt-1 text-xs text-ink-400">
                  {batValida ? 'Queda en el nombre del producto.' : 'Tiene que ser un número de 0 a 100.'}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">
                  Sucursal de destino
                </label>
                <Select
                  options={activas.map((s) => ({ value: String(s.id), label: s.nombre }))}
                  value={sucursalSel}
                  onChange={setSucursalSel}
                  placeholder="Elegí la sucursal"
                />
                <p className="mt-1 text-xs text-ink-400">Casa Central viene elegida por defecto.</p>
              </div>
            </div>

            {existente ? (
              <p className="rounded-xl border border-line bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
                El IMEI <b className="tnum">{imei1}</b> ya está en el catálogo como{' '}
                <b>{existente.nombre}</b>: no se crea un producto nuevo, se le suma 1 unidad.
              </p>
            ) : (
              <p className="text-xs text-ink-400">
                Se crea en la categoría «{CATEGORIA_USADOS}» como{' '}
                <b className="text-ink-600">{nombreProducto}</b>
                {notaProducto && (
                  <>
                    {' '}con la nota <span className="tnum">«{notaProducto}»</span>
                  </>
                )}
                . El precio de venta se carga después desde Productos.
              </p>
            )}

            <div className="rounded-2xl border border-line-strong bg-surface p-4">
              <p className="text-sm font-medium text-ink-900">
                ¿Deseás agregar <b>{equipo}</b>
                {batTexto && batValida && <> con <b>{batTexto}% de batería</b></>} al inventario
                {sucursalNombre && (
                  <>
                    {' '}de <b>{sucursalNombre}</b>
                  </>
                )}
                ?
              </p>
              <div className="mt-3 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={onCerrar} disabled={sumar.isPending}>
                  Cancelar
                </Button>
                <Button type="button" onClick={() => sumar.mutate()} disabled={!puedeConfirmar}>
                  {sumar.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PackagePlus className="h-4 w-4" />
                  )}
                  Sí, sumar al inventario
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function DatoResumen({
  label,
  valor,
  destacado = false,
  mono = false,
}: {
  label: string
  valor: string
  destacado?: boolean
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-ink-400">{label}</dt>
      <dd
        className={`truncate text-sm ${destacado ? 'font-semibold text-ink-950' : 'text-ink-700'} ${mono ? 'tnum' : ''}`}
        title={valor}
      >
        {valor}
      </dd>
    </div>
  )
}
