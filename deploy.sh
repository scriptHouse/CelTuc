#!/usr/bin/env bash
# Deploy de CelTuc (solo frontend estático servido por nginx detrás de Traefik).
set -Eeuo pipefail

cd "$(dirname "$0")"

echo "==> Compilando imagen celtuc…"
docker compose build celtuc

echo "==> Levantando contenedor…"
docker compose up -d celtuc

echo "==> Estado:"
docker compose ps celtuc
