import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { RequireAuth } from '@/components/RequireAuth'
import { LoginPage } from '@/pages/LoginPage'
import { PanelPage } from '@/pages/PanelPage'
import { InventarioPage } from '@/pages/InventarioPage'
import { FacturacionPage } from '@/pages/FacturacionPage'
import { EmpleadosPage } from '@/pages/EmpleadosPage'
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
      { path: '/', element: <PanelPage /> },
      { path: '/inventario', element: <InventarioPage /> },
      { path: '/facturacion', element: <FacturacionPage /> },
      { path: '/empleados', element: <EmpleadosPage /> },
      { path: '/usuarios', element: <UsuariosPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
