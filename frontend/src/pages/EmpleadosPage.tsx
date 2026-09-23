import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Building2, Download, KeyRound, Plus, ShieldCheck, UserPlus, UserRoundX, Users } from 'lucide-react'
import type { Empleado } from '@/types'
import { listarEmpleados } from '@/services/empleados'
import { listarRoles } from '@/services/roles'
import { listarSucursales } from '@/services/sucursales'
import { useAuth } from '@/store/auth'
import { esAdmin } from '@/lib/permisos'
import { ctStagger, normalizarBusqueda } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { SucursalesManager } from '@/components/SucursalesManager'
import { ExportarTablaModal, type GestorExport } from '@/components/exportar/ExportarTablaModal'
import { AltaWizard, type ModoAlta } from '@/components/equipo/AltaWizard'
import { ComoFunciona, GuiaEquipo } from '@/components/equipo/ComoFunciona'
import { FichaIntegrante } from '@/components/equipo/FichaIntegrante'
import { desdeEmpleado, estadoAcceso } from '@/components/equipo/integrante'
import { BarraFiltros, SinResultados, TarjetaIntegrante } from '@/components/equipo/TarjetaIntegrante'

/** Qué se puede exportar del equipo (botón «Exportar»). */
const GESTOR_EXPORT_EMPLEADOS: GestorExport<Empleado> = {
  id: 'empleados',
  titulo: 'Empleados',
  nombreArchivo: 'empleados-{fecha}',
  columnas: [
    { id: 'nombre', label: 'Empleado', tipo: 'texto', peso: 28, valor: (e) => e.nombre_completo },
    { id: 'sucursal', label: 'Sucursal', tipo: 'texto', peso: 18, valor: (e) => e.sucursal?.nombre ?? '' },
    {
      id: 'usuario',
      label: 'Usuario',
      tipo: 'texto',
      peso: 16,
      valor: (e) => e.usuario?.username ?? '',
    },
    { id: 'email', label: 'Email', tipo: 'texto', peso: 24, valor: (e) => e.usuario?.email ?? '' },
    { id: 'rol', label: 'Rol', tipo: 'texto', peso: 16, valor: (e) => e.usuario?.rol?.nombre ?? '' },
    {
      id: 'acceso',
      label: 'Acceso al sistema',
      corto: 'Acceso',
      tipo: 'texto',
      peso: 10,
      valor: (e) => (e.puede_loguear ? 'Sí' : e.usuario ? 'Pausado' : 'No'),
    },
    { id: 'alta', label: 'Alta', tipo: 'fecha', peso: 12, valor: (e) => e.creado },
    {
      id: 'id',
      label: 'ID interno',
      corto: 'ID',
      tipo: 'entero',
      peso: 8,
      opcional: true,
      valor: (e) => e.id,
    },
  ],
  grupos: [
    { id: 'sucursal', label: 'Sucursal', valor: (e) => e.sucursal?.nombre ?? 'Sin sucursal' },
    { id: 'rol', label: 'Rol', valor: (e) => e.usuario?.rol?.nombre ?? 'Sin rol' },
  ],
}

type Filtro = 'todos' | 'con_acceso' | 'sin_acceso' | 'pausados'

/**
 * Empleados: las PERSONAS del equipo. Desde acá se suma gente (con un asistente
 * paso a paso que también le da acceso, si hace falta) y cada tarjeta abre la
 * ficha de la persona, donde se cambia todo lo demás. Quien no administra ve la
 * lista sola, de lectura.
 */
export function EmpleadosPage() {
  const navigate = useNavigate()
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)

  const { data: empleados = [], isLoading } = useQuery({
    queryKey: ['empleados'],
    queryFn: listarEmpleados,
  })
  // Roles y sucursales: solo los necesita (y puede leer) un administrador.
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: listarRoles, enabled: admin })
  const { data: sucursales = [] } = useQuery({ queryKey: ['sucursales'], queryFn: listarSucursales, enabled: admin })

  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [sucursalesOpen, setSucursalesOpen] = useState(false)
  const [exportarAbierto, setExportarAbierto] = useState(false)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [modoAlta, setModoAlta] = useState<ModoAlta>({ tipo: 'empleado' })
  const [fichaId, setFichaId] = useState<number | null>(null)
  const [fichaAbierta, setFichaAbierta] = useState(false)

  const integrantes = useMemo(() => empleados.map(desdeEmpleado), [empleados])

  const cuenta = useMemo(() => {
    const c = { todos: integrantes.length, con_acceso: 0, sin_acceso: 0, pausados: 0 }
    integrantes.forEach((i) => {
      const e = estadoAcceso(i)
      if (e === 'activo') c.con_acceso++
      else if (e === 'pausado') c.pausados++
      else c.sin_acceso++
    })
    return c
  }, [integrantes])

  const visibles = useMemo(() => {
    const termino = normalizarBusqueda(busqueda.trim())
    return integrantes.filter((i) => {
      const e = estadoAcceso(i)
      if (filtro === 'con_acceso' && e !== 'activo') return false
      if (filtro === 'sin_acceso' && e !== 'sin_acceso') return false
      if (filtro === 'pausados' && e !== 'pausado') return false
      if (!termino) return true
      const texto = [i.empleado?.nombre_completo, i.empleado?.sucursal?.nombre, i.cuenta?.username, i.cuenta?.email, i.cuenta?.rol?.nombre]
        .filter(Boolean)
        .join(' ')
      return normalizarBusqueda(texto).includes(termino)
    })
  }, [integrantes, filtro, busqueda])

  const fichaEmpleado = fichaId !== null ? empleados.find((e) => e.id === fichaId) ?? null : null
  const fichaIntegrante = fichaEmpleado ? desdeEmpleado(fichaEmpleado) : null

  // Si la persona deja de estar (la sacaron del equipo), la ficha se cierra.
  useEffect(() => {
    if (fichaAbierta && fichaId !== null && !isLoading && !fichaEmpleado) setFichaAbierta(false)
  }, [fichaAbierta, fichaId, fichaEmpleado, isLoading])

  function nuevo() {
    setModoAlta({ tipo: 'empleado' })
    setAltaAbierta(true)
  }
  function darAcceso(empleadoId: number) {
    const e = empleados.find((x) => x.id === empleadoId)
    if (!e) return
    setModoAlta({ tipo: 'acceso', empleado: e })
    setAltaAbierta(true)
  }
  function abrirFicha(id: number) {
    setFichaId(id)
    setFichaAbierta(true)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={Users}
        eyebrow="Equipo"
        title="Empleados"
        subtitle={
          admin
            ? 'Las personas del equipo. Tocá a alguien para ver y cambiar sus datos, su acceso y qué puede ver.'
            : 'Las personas del equipo y su sucursal.'
        }
        className="ct-rise"
        actions={
          <>
            {admin && <GuiaEquipo />}
            <Button variant="outline" onClick={() => setExportarAbierto(true)} disabled={empleados.length === 0}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            {admin && (
              <>
                <Button variant="outline" onClick={() => setSucursalesOpen(true)}>
                  <Building2 className="h-4 w-4" />
                  Sucursales
                </Button>
                <Button variant="outline" onClick={() => navigate('/usuarios/roles', { state: { desde: '/empleados' } })}>
                  <ShieldCheck className="h-4 w-4" />
                  Roles y permisos
                </Button>
                <Button onClick={nuevo} className="w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  Nuevo empleado
                </Button>
              </>
            )}
          </>
        }
      />

      {admin && <ComoFunciona resaltar={1} />}

      {/* En el celular los filtros de abajo ya muestran estas cantidades. */}
      <div className="mb-5 hidden grid-cols-3 gap-3 sm:grid">
        <StatCard className="ct-stagger-item" style={ctStagger(0)} label="En el equipo" value={String(cuenta.todos)} icon={Users} />
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(1)}
          label="Pueden entrar"
          value={String(cuenta.con_acceso)}
          hint="Tienen acceso"
          icon={KeyRound}
        />
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(2)}
          label="Sin acceso"
          value={String(cuenta.sin_acceso + cuenta.pausados)}
          hint={cuenta.pausados ? `${cuenta.pausados} pausado${cuenta.pausados === 1 ? '' : 's'}` : 'No entran al sistema'}
          icon={UserRoundX}
        />
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : empleados.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Todavía no hay nadie en el equipo"
          description={
            admin
              ? 'Sumá a la primera persona: un asistente te guía paso a paso y, si va a usar el sistema, le da su acceso.'
              : 'Todavía no hay empleados cargados.'
          }
          action={
            admin ? (
              <Button onClick={nuevo}>
                <Plus className="h-4 w-4" />
                Nuevo empleado
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <BarraFiltros<Filtro>
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            placeholder="Buscar por nombre o usuario"
            filtro={filtro}
            onFiltro={setFiltro}
            filtros={[
              { id: 'todos', label: 'Todos', cantidad: cuenta.todos },
              { id: 'con_acceso', label: 'Pueden entrar', cantidad: cuenta.con_acceso },
              { id: 'sin_acceso', label: 'Sin acceso', cantidad: cuenta.sin_acceso },
              { id: 'pausados', label: 'Pausados', cantidad: cuenta.pausados, oculto: cuenta.pausados === 0 },
            ]}
          />
          {visibles.length === 0 ? (
            <SinResultados>
              {busqueda ? `Nadie coincide con «${busqueda}».` : 'No hay nadie en este grupo.'}
            </SinResultados>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibles.map((i, n) => (
                <TarjetaIntegrante
                  key={i.clave}
                  integrante={i}
                  roles={roles}
                  yoId={usuario?.id}
                  onAbrir={admin ? () => abrirFicha(i.empleado!.id) : undefined}
                  onDarAcceso={admin ? () => darAcceso(i.empleado!.id) : undefined}
                  className="ct-stagger-item"
                  style={ctStagger(n)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {admin && (
        <>
          <AltaWizard
            abierto={altaAbierta}
            modo={modoAlta}
            empleados={empleados}
            roles={roles}
            sucursales={sucursales}
            onCerrar={() => setAltaAbierta(false)}
          />
          <FichaIntegrante
            integrante={fichaIntegrante}
            abierto={fichaAbierta && fichaIntegrante !== null}
            onCerrar={() => setFichaAbierta(false)}
            roles={roles}
            sucursales={sucursales}
            onDarAcceso={darAcceso}
          />
        </>
      )}
      <SucursalesManager open={sucursalesOpen} onClose={() => setSucursalesOpen(false)} />
      <ExportarTablaModal
        abierto={exportarAbierto}
        onCerrar={() => setExportarAbierto(false)}
        gestor={GESTOR_EXPORT_EMPLEADOS}
        filasVista={empleados}
      />
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="mt-4 h-14 w-full" />
        </div>
      ))}
    </div>
  )
}
