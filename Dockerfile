# ---- Build del frontend (Vite) ----
FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend
# Usamos `npm install` (no `npm ci`) a propósito: el lockfile se genera en
# Windows y sólo fija los binarios nativos de win32. Al compilar en Alpine
# (Linux musl), npm install resuelve los binarios correctos de rollup /
# @tailwindcss/oxide / lightningcss para esta plataforma.
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend ./
RUN npm run build

# ---- Runtime: Django (gunicorn) + nginx en un solo contenedor ----
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx curl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./
# El build del frontend queda como sitio estático que sirve nginx.
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://127.0.0.1/api/health/ >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
