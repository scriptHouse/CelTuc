# CelTuc · Software de gestión

Aplicación web de gestión para **CelTuc** (tienda de celulares y accesorios, Tucumán).
Por ahora es **solo frontend**: los datos viven en el navegador (localStorage) y los
servicios devuelven promesas, así que cuando exista un backend solo cambia la carpeta
`services/` sin tocar las pantallas.

## Stack

Mismas tecnologías que el proyecto GLUNOT:

- **React 19** + **TypeScript** + **Vite 6**
- **Tailwind CSS v4** (sin archivo de config, tokens en `@theme`)
- **React Router 7**, **TanStack Query 5**, **Zustand** (sesión)
- **React Hook Form** + **Zod** (formularios)
- **lucide-react** (íconos)

Paleta **estrictamente monocromática** (negro / gris / blanco) y animaciones suaves
(familia `ct-*`) que respetan `prefers-reduced-motion`.

## Módulos

- **Panel** — KPIs, facturación de los últimos 6 meses, comparativa por cuenta,
  últimos comprobantes y reposición de stock.
- **Inventario** — alta/edición/borrado de productos, búsqueda y filtro por categoría,
  ajuste rápido de stock y alertas de stock bajo.
- **Facturación** — N cuentas con su condición fiscal (Responsable Inscripto /
  Monotributista). Emite comprobantes **A / B / C** automáticamente según la condición
  del emisor y del cliente, con cálculo de IVA (21%) y numeración tipo AFIP.
- **Empleados** — equipo, honorarios (mensual / por hora / comisión), registro de pagos
  y masa salarial estimada.

El **login es de demostración**: no pide credenciales, solo se toca *Ingresar*.

## Cómo correrlo en local

```bash
# desde la raíz del proyecto
npm run dev          # levanta el frontend (Vite)

# o directamente dentro de frontend/
cd frontend
npm install
npm run dev
```

Vite imprime la URL local (por defecto http://localhost:5173).

Otros scripts (desde la raíz):

```bash
npm run build        # type-check + build de producción
npm run preview      # sirve el build
npm run lint         # ESLint
```

## Datos de demostración

Al abrir la app por primera vez se siembran datos de ejemplo (productos, dos cuentas,
facturas, empleados y pagos). Desde **Panel → Restaurar demo** se pueden volver a cargar.
Para empezar de cero, borrá la clave `celtuc-db-v1` del localStorage.

## Estructura

```
frontend/src
├── components/        # Layout, providers y librería UI (components/ui)
├── pages/             # Login, Panel, Inventario, Facturación, Empleados
├── services/          # "API" sobre localStorage (inventario, facturación, ...)
├── store/             # sesión (Zustand)
├── lib/               # utils, formato, lógica fiscal (afip), repositorio (db)
├── types/             # tipos del dominio
└── index.css          # tokens (@theme) + animaciones ct-*
```
