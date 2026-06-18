# ---- Build del frontend (Vite) ----
FROM node:22-alpine AS build

WORKDIR /app/frontend
# Usamos `npm install` (no `npm ci`) a propósito: el lockfile se genera en
# Windows y sólo fija los binarios nativos de win32. Al compilar en Alpine
# (Linux musl), npm install resuelve los binarios correctos de rollup /
# @tailwindcss/oxide / lightningcss para esta plataforma.
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend ./
RUN npm run build

# ---- Runtime: nginx sirve el dist estático ----
FROM nginx:1.27-alpine AS runtime

RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
