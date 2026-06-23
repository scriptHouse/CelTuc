#!/usr/bin/env bash
# Deploy de CelTuc (solo frontend estático servido por nginx detrás de Traefik).
set -Eeuo pipefail

cd "$(dirname "$0")"

echo "==> Compilando imagen celtuc…"
# Progreso "plain": salida línea a línea. Hace más legible el build por SSH y
# evita tramos mudos largos (p. ej. en `npm install`) que terminan cortando la
# conexión. Es una variable de entorno: si la versión de Compose no la soporta,
# simplemente se ignora (no rompe el build).
export BUILDKIT_PROGRESS=plain
docker compose build celtuc

echo "==> Levantando contenedor…"
docker compose up -d celtuc

echo "==> Estado:"
docker compose ps celtuc
