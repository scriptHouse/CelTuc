import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { RequireAuth } from '@/components/RequireAuth'
import { RequirePermiso } from '@/components/RequirePermiso'
import { LoginPage } from '@/pages/LoginPage'
import { PanelPage } from '@/pages/PanelPage'
import { InventarioPage } from '@/pages/InventarioPage'
import { FacturacionPage } from '@/pages/FacturacionPage'
import { EmpleadosPage } from '@/pages/EmpleadosPage'
import { SimuladorPage } from '@/pages/SimuladorPage'
import { DocumentosPage } from '@/pages/DocumentosPage'
import { UsuariosPage } from '@/pages/UsuariosPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <RequirePermiso permiso="ver_panel"><PanelPage /></RequirePermiso> },
      { path: '/inventario', element: <RequirePermiso permiso="ver_inventario"><InventarioPage /></RequirePermiso> },
      { path: '/facturacion', element: <RequirePermiso permiso="ver_facturacion"><FacturacionPage /></RequirePermiso> },
      { path: '/empleados', element: <RequirePermiso permiso="ver_empleados"><EmpleadosPage /></RequirePermiso> },
      { path: '/simulador', element: <RequirePermiso permiso="ver_simulador"><SimuladorPage /></RequirePermiso> },
      { path: '/documentos', element: <RequirePermiso><DocumentosPage /></RequirePermiso> },
      { path: '/usuarios', element: <RequirePermiso soloAdmin><UsuariosPage /></RequirePermiso> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
