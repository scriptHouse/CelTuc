import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { RequireAuth } from '@/components/RequireAuth'
import { RequirePermiso } from '@/components/RequirePermiso'
import { LoginPage } from '@/pages/LoginPage'
import { ImpersonarPage } from '@/pages/ImpersonarPage'
import { PanelPage } from '@/pages/PanelPage'
import { DolarPage } from '@/pages/DolarPage'
import { InventarioPage } from '@/pages/InventarioPage'
import { FacturacionPage } from '@/pages/FacturacionPage'
import { ClientesPage } from '@/pages/ClientesPage'
import { CajaPage } from '@/pages/CajaPage'
import { EmpleadosPage } from '@/pages/EmpleadosPage'
import { SimuladorPage } from '@/pages/SimuladorPage'
import { CotizacionesPage } from '@/pages/CotizacionesPage'
import { PreciosServicePage } from '@/pages/PreciosServicePage'
import { ProductosPage } from '@/pages/ProductosPage'
import { FichaEquipoPage } from '@/pages/FichaEquipoPage'
import { DocumentosPage } from '@/pages/DocumentosPage'
import { UsuariosPage } from '@/pages/UsuariosPage'
import { RolesPage } from '@/pages/RolesPage'
import { AuditoriaPage } from '@/pages/AuditoriaPage'
import { AsistenciaPage } from '@/pages/AsistenciaPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // Aterrizaje del botón «Impersonar» del admin de Django: canjea el pase y
  // deja la sesión de esa cuenta lista (fuera de RequireAuth, todavía no hay).
  { path: '/impersonar', element: <ImpersonarPage /> },
  {
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <RequirePermiso permiso="ver_panel"><PanelPage /></RequirePermiso> },
      { path: '/dolar', element: <RequirePermiso permiso="ver_dolar"><DolarPage /></RequirePermiso> },
      { path: '/inventario', element: <RequirePermiso permiso="ver_inventario"><InventarioPage /></RequirePermiso> },
      { path: '/facturacion', element: <RequirePermiso permiso="ver_facturacion"><FacturacionPage /></RequirePermiso> },
      { path: '/clientes', element: <RequirePermiso permiso="ver_facturacion"><ClientesPage /></RequirePermiso> },
      { path: '/caja', element: <RequirePermiso permiso="ver_caja"><CajaPage /></RequirePermiso> },
      { path: '/empleados', element: <RequirePermiso permiso="ver_empleados"><EmpleadosPage /></RequirePermiso> },
      { path: '/simulador', element: <RequirePermiso permiso="ver_simulador"><SimuladorPage /></RequirePermiso> },
      { path: '/cotizaciones', element: <RequirePermiso permiso="ver_cotizaciones"><CotizacionesPage /></RequirePermiso> },
      { path: '/service', element: <RequirePermiso permiso="ver_precios_service"><PreciosServicePage /></RequirePermiso> },
      { path: '/productos', element: <RequirePermiso permiso="ver_productos"><ProductosPage /></RequirePermiso> },
      { path: '/equipos', element: <RequirePermiso permiso="ver_equipos"><FichaEquipoPage /></RequirePermiso> },
      { path: '/documentos', element: <RequirePermiso><DocumentosPage /></RequirePermiso> },
      { path: '/usuarios', element: <RequirePermiso soloAdmin><UsuariosPage /></RequirePermiso> },
      { path: '/usuarios/roles', element: <RequirePermiso soloAdmin><RolesPage /></RequirePermiso> },
      { path: '/auditoria', element: <RequirePermiso soloSuper><AuditoriaPage /></RequirePermiso> },
      { path: '/asistencia', element: <RequirePermiso soloSuper><AsistenciaPage /></RequirePermiso> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
