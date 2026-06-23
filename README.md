# CelTuc · Software de gestión

Aplicación web de gestión para **CelTuc** (tienda de celulares y accesorios, Tucumán).

El **frontend** (React + Vite) todavía guarda los datos en el navegador (localStorage) y
sus servicios devuelven promesas, así que migrarlo al backend será cambiar la carpeta
`services/` sin tocar las pantallas.

El **backend** (Django + DRF, en `backend/`) ya está iniciado con lo mínimo: las tablas
propias de Django y una tabla de **usuarios** (login por email, JWT). Misma arquitectura
que GLUNOT: un solo contenedor donde **nginx** sirve el frontend y hace de proxy del
**gunicorn/Django** en `/api/` y `/admin/`.

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

## Backend (Django + DRF)

Vive en `backend/`. Stack: **Django 6**, **Django REST Framework**, **JWT** (PyJWT),
**Postgres** en producción (SQLite en local), admin con **django-unfold**.

```
backend/
├── celtuc/            # proyecto Django (settings, urls, wsgi/asgi)
├── usuarios/          # app de usuarios: modelo Usuario, auth JWT, admin
│   ├── models.py      # Usuario (tabla `usuarios`)
│   ├── managers.py    # alta por email + nombre de usuario
│   ├── tokens.py      # emisión/validación de JWT
│   ├── authentication.py / serializers.py / views.py / urls.py
│   └── migrations/
├── manage.py
└── requirements.txt
```

Por ahora solo hay **dos grupos de tablas**: las que necesita Django (auth, sesiones,
permisos, migraciones, log del admin) y la tabla **`usuarios`**. La identidad es mínima:
**email + nombre de usuario + contraseña** (más los flags de Django: activo, acceso al
panel, superusuario). El **login se puede hacer con el email O con el nombre de usuario**
(ambos se guardan en minúscula, así es insensible a mayúsculas). Las cuentas las crea un
administrador (no hay autoregistro).

### Endpoints

- `POST /api/auth/login/` — body `{ identifier, password }` (identifier = email **o** usuario) → `{ access, refresh, user }`
- `POST /api/auth/refresh/` → renueva los tokens
- `GET /api/auth/me/` → datos del usuario autenticado (token Bearer)
- `GET /api/health/` → estado del contenedor
- `/admin/` → panel de administración (gestión de usuarios)

Buenas prácticas del login: error **genérico** ante credenciales inválidas (no revela si
la cuenta existe), mitigación de **timing**, chequeo de cuenta **activa** y **throttling**
(10 intentos/min) contra fuerza bruta.

### Correr el login completo en local (back + front)

**1) Backend** (API en http://127.0.0.1:8000):

```bash
cd backend
py -3.13 -m venv .venv
.venv\Scripts\activate          # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env           # opcional; sin DATABASE_URL usa SQLite
python manage.py migrate
python manage.py createsuperuser  # te pide email, nombre de usuario y contraseña
python manage.py runserver
```

**2) Frontend** (en otra terminal): `npm run dev`. Vite hace de **proxy de `/api`** al
backend (ver `vite.config.ts`), así que el login funciona sin tocar nada. Entrá con el
email **o** el nombre de usuario que creaste.

### Despliegue

Igual que el frontend: `git push` a `main` dispara GitHub Actions → `deploy.sh` en el VPS.
Antes del **primer** deploy con backend hay que crear la base `celtuc` en el Postgres
central y dejar el `.env` (con `DATABASE_URL`) en `/var/www/celtuc/` del servidor. El
`entrypoint.sh` corre `migrate` y `collectstatic` solo en cada arranque.
