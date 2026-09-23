import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CirclePause, Download, Plus, ShieldCheck, UserCog, UserPlus, Wifi } from 'lucide-react'
import type { UsuarioAdmin } from '@/types'
import { listarUsuarios } from '@/services/usuarios'
import { listarEmpleados } from '@/services/empleados'
import { listarRoles } from '@/services/roles'
import { listarSucursales } from '@/services/sucursales'
import { useAuth } from '@/store/auth'
import { ctStagger, normalizarBusqueda } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ExportarTablaModal, type GestorExport } from '@/components/exportar/ExportarTablaModal'
import { AltaWizard, type ModoAlta } from '@/components/equipo/AltaWizard'
import { ComoFunciona, GuiaEquipo } from '@/components/equipo/ComoFunciona'
import { FichaIntegrante } from '@/components/equipo/FichaIntegrante'
import { desdeCuenta } from '@/components/equipo/integrante'
import { BarraFiltros, SinResultados, TarjetaIntegrante } from '@/components/equipo/TarjetaIntegrante'

function esAdmin(u: UsuarioAdmin): boolean {
  return u.es_administrador ?? (u.is_superuser || u.is_staff)
}

function nivelDe(u: UsuarioAdmin): string {
  if (u.is_superuser) return 'Superadmin'
  return esAdmin(u) ? 'Admin' : 'Empleado'
}

/** Qué se puede exportar de las cuentas (botón «Exportar»). */
const GESTOR_EXPORT_USUARIOS: GestorExport<UsuarioAdmin> = {
  id: 'usuarios',
  titulo: 'Usuarios',
  nombreArchivo: 'usuarios-{fecha}',
  columnas: [
    { id: 'username', label: 'Usuario', tipo: 'texto', peso: 20, valor: (u) => u.username },
    { id: 'email', label: 'Email', tipo: 'texto', peso: 26, valor: (u) => u.email },
    { id: 'nivel', label: 'Nivel', tipo: 'texto', peso: 12, valor: nivelDe },
    { id: 'rol', label: 'Rol', tipo: 'texto', peso: 18, valor: (u) => u.rol?.nombre ?? '' },
    {
      id: 'empleado',
      label: 'Empleado vinculado',
      corto: 'Empleado',
      tipo: 'texto',
      peso: 22,
      valor: (u) => u.empleado?.nombre_completo ?? '',
    },
    { id: 'activa', label: 'Activa', tipo: 'texto', peso: 8, valor: (u) => (u.is_active ? 'Sí' : 'No') },
    {
      id: 'ultimo_ingreso',
      label: 'Último ingreso',
      corto: 'Últ. ingreso',
      tipo: 'fechahora',
      peso: 17,
      valor: (u) => u.last_login,
    },
    { id: 'alta', label: 'Alta', tipo: 'fecha', peso: 12, valor: (u) => u.date_joined },
    {
      id: 'en_linea',
      label: 'En línea ahora',
      corto: 'En línea',
      tipo: 'texto',
      peso: 9,
      opcional: true,
      valor: (u) => (u.en_linea ? 'Sí' : 'No'),
    },
    {
      id: 'id',
      label: 'ID interno',
      corto: 'ID',
      tipo: 'entero',
      peso: 8,
      opcional: true,
      valor: (u) => u.id,
    },
  ],
  grupos: [
    { id: 'nivel', label: 'Nivel', valor: nivelDe },
    { id: 'rol', label: 'Rol', valor: (u) => u.rol?.nombre ?? (esAdmin(u) ? 'Administradores' : 'Sin rol') },
  ],
}

type Filtro = 'todas' | 'admins' | 'pausadas' | 'sin_rol' | 'sueltas'

/**
 * Usuarios: las CUENTAS para entrar al sistema (la «llave» de cada persona, y
 * las que no son de nadie del equipo). Se abre la misma ficha que en
 * Empleados, así que todo se puede hacer desde cualquiera de las dos.
 */
export function UsuariosPage() {
  const navigate = useNavigate()
  const yo = useAuth((s) => s.usuario)

  const { data: usuarios = [], isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: listarUsuarios })
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: listarRoles })
  const { data: empleados = [] } = useQuery({ queryKey: ['empleados'], queryFn: listarEmpleados })
  const { data: sucursales = [] } = useQuery({ queryKey: ['sucursales'], queryFn: listarSucursales })

  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [exportarAbierto, setExportarAbierto] = useState(false)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [modoAlta, setModoAlta] = useState<ModoAlta>({ tipo: 'cuenta' })
  const [fichaId, setFichaId] = useState<number | null>(null)
  const [fichaAbierta, setFichaAbierta] = useState(false)

  const integrantes = useMemo(() => usuarios.map(desdeCuenta), [usuarios])

  const cuenta = useMemo(
    () => ({
      todas: usuarios.length,
      enLinea: usuarios.filter((u) => u.en_linea).length,
      admins: usuarios.filter(esAdmin).length,
      pausadas: usuarios.filter((u) => !u.is_active).length,
      sinRol: usuarios.filter((u) => !esAdmin(u) && !u.rol).length,
      sueltas: usuarios.filter((u) => !u.empleado).length,
    }),
    [usuarios],
  )

  const visibles = useMemo(() => {
    const termino = normalizarBusqueda(busqueda.trim())
    return integrantes.filter((i) => {
      const c = i.cuenta!
      if (filtro === 'admins' && !c.es_administrador) return false
      if (filtro === 'pausadas' && c.is_active) return false
      if (filtro === 'sin_rol' && (c.es_administrador || c.rol)) return false
      if (filtro === 'sueltas' && i.empleado) return false
      if (!termino) return true
      const texto = [c.username, c.email, i.empleado?.nombre_completo, c.rol?.nombre].filter(Boolean).join(' ')
      return normalizarBusqueda(texto).includes(termino)
    })
  }, [integrantes, filtro, busqueda])

  const fichaCuenta = fichaId !== null ? usuarios.find((u) => u.id === fichaId) ?? null : null
  const fichaIntegrante = fichaCuenta ? desdeCuenta(fichaCuenta) : null

  // Si la cuenta deja de estar (se eliminó o se le quitó el acceso), la ficha se cierra.
  useEffect(() => {
    if (fichaAbierta && fichaId !== null && !isLoading && !fichaCuenta) setFichaAbierta(false)
  }, [fichaAbierta, fichaId, fichaCuenta, isLoading])

  function nueva() {
    setModoAlta({ tipo: 'cuenta' })
    setAltaAbierta(true)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={UserCog}
        eyebrow="Accesos"
        title="Usuarios"
        subtitle="Las cuentas para entrar al sistema. Tocá una para cambiar su usuario, su contraseña o qué puede ver."
        className="ct-rise"
        actions={
          <>
            <GuiaEquipo />
            <Button variant="outline" onClick={() => setExportarAbierto(true)} disabled={usuarios.length === 0}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            <Button variant="outline" onClick={() => navigate('/usuarios/roles', { state: { desde: '/usuarios' } })}>
              <ShieldCheck className="h-4 w-4" />
              Roles y permisos
            </Button>
            <Button onClick={nueva} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Nueva cuenta
            </Button>
          </>
        }
      />

      <ComoFunciona resaltar={2} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard className="ct-stagger-item" style={ctStagger(0)} label="Cuentas" value={String(cuenta.todas)} icon={UserCog} />
        <StatCard className="ct-stagger-item" style={ctStagger(1)} label="En línea" value={String(cuenta.enLinea)} hint="Usando el sistema ahora" icon={Wifi} />
        <StatCard className="ct-stagger-item" style={ctStagger(2)} label="Administradores" value={String(cuenta.admins)} hint="Ven y manejan todo" icon={ShieldCheck} />
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(3)}
          label="Pausadas"
          value={String(cuenta.pausadas)}
          hint="No pueden entrar por ahora"
          icon={CirclePause}
        />
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : usuarios.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Sin cuentas"
          description="Creá la primera cuenta: un asistente te guía paso a paso."
          action={
            <Button onClick={nueva}>
              <Plus className="h-4 w-4" />
              Nueva cuenta
            </Button>
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
              { id: 'todas', label: 'Todas', cantidad: cuenta.todas },
              { id: 'admins', label: 'Administradores', cantidad: cuenta.admins },
              { id: 'pausadas', label: 'Pausadas', cantidad: cuenta.pausadas, oculto: cuenta.pausadas === 0 },
              { id: 'sin_rol', label: 'Sin rol', cantidad: cuenta.sinRol, oculto: cuenta.sinRol === 0 },
              { id: 'sueltas', label: 'Sin empleado', cantidad: cuenta.sueltas, oculto: cuenta.sueltas === 0 },
            ]}
          />
          {visibles.length === 0 ? (
            <SinResultados>{busqueda ? `Ninguna cuenta coincide con «${busqueda}».` : 'No hay cuentas en este grupo.'}</SinResultados>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibles.map((i, n) => (
                <TarjetaIntegrante
                  key={`u-${i.cuenta!.id}`}
                  integrante={i}
                  roles={roles}
                  yoId={yo?.id}
                  mostrarEmail
                  onAbrir={() => {
                    setFichaId(i.cuenta!.id)
                    setFichaAbierta(true)
                  }}
                  className="ct-stagger-item"
                  style={ctStagger(n)}
                />
              ))}
            </div>
          )}
        </>
      )}

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
      />
      <ExportarTablaModal
        abierto={exportarAbierto}
        onCerrar={() => setExportarAbierto(false)}
        gestor={GESTOR_EXPORT_USUARIOS}
        filasVista={usuarios}
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
