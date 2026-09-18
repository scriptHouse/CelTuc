#!/usr/bin/env bash
# ======================================================================
# scriptHouse — deploy generico de proyecto.
# ----------------------------------------------------------------------
# Un solo flujo para los ~30 proyectos de la flota: lo invoca
# templates/deploy/deploy.yml desde el runner self-hosted del proyecto,
# despues de actualizar /var/www/<proyecto> con git.
#
# Cada proyecto solo aporta deploy.conf (junto a docker-compose.yml, en
# la raiz del repo) con el nombre del proyecto, que servicios se
# compilan aca, cuales son runtime-only, el mapeo servicio->contenedor
# y (opcional) triggers por ruta, tests y healthcheck. Ver
# templates/deploy/deploy.conf.example.
#
# Estrategia (igual espiritu que pipa-web/scripts/deploy.sh, generalizada):
#   1. Compara HEAD vs .last-deploy-sha para decidir QUE reconstruir.
#   2. Un cambio en archivos de infraestructura (compose raiz, workflow,
#      deploy.sh, deploy.conf) o la ausencia de sentinel fuerza --all.
#   3. Build secuencial (nunca en paralelo: evita OOM en VPS sin swap).
#   4. TESTS_CMD corre sobre la imagen recien construida, ANTES de tocar
#      lo que esta corriendo: si falla, no se levanta nada nuevo.
#   5. Se recrean solo los servicios afectados; los RUNTIME_SERVICES se
#      aseguran arriba pero NUNCA se compilan aca.
#   6. Healthcheck acotado por contenedor (running + Docker healthcheck
#      si lo tiene) y, opcional, HEALTH_CMD de aplicacion.
#   7. Si algo fallo despues de reemplazar imagenes: rollback automatico
#      a las imagenes taggeadas antes del build.
#   8. Reporte en vivo al panel interno durante todo el proceso.
#
# Uso:
#   cd /var/www/<proyecto> && scripts/deploy.sh           # auto-detect
#   cd /var/www/<proyecto> && scripts/deploy.sh --all     # forzar todo
# ======================================================================
set -Eeuo pipefail

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
export BUILDKIT_PROGRESS=plain

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FORCE_ALL=0
[[ "${1:-}" == "--all" ]] && FORCE_ALL=1

# ----------------------------------------------------------------------
# Config: valores por defecto, despues deploy.conf los pisa.
# ----------------------------------------------------------------------
PROJECT=""
declare -a BUILD_SERVICES=()
declare -a RUNTIME_SERVICES=()
declare -A CONTAINER_OF=()
declare -A TRIGGERS=()
HEALTH_WAIT_SECONDS=90
HEALTH_CMD=""
TESTS_CMD=""
DB_NAME=""
RETAIN=3
PRUNE_AFTER=1
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

CONF="$ROOT/deploy.conf"
[[ -f "$CONF" ]] || { echo "Falta deploy.conf junto a docker-compose.yml (ver deploy.conf.example)." >&2; exit 1; }
# shellcheck source=/dev/null
source "$CONF"

[[ -n "$PROJECT" ]] || { echo "deploy.conf debe definir PROJECT." >&2; exit 1; }
[[ ${#BUILD_SERVICES[@]} -gt 0 || ${#RUNTIME_SERVICES[@]} -gt 0 ]] || { echo "deploy.conf debe definir BUILD_SERVICES y/o RUNTIME_SERVICES." >&2; exit 1; }
[[ -f "$COMPOSE_FILE" ]] || { echo "No se encuentra $COMPOSE_FILE en $ROOT." >&2; exit 1; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

SENTINEL="$ROOT/.last-deploy-sha"

# Hooks opcionales de deploy.conf (strings, se corren con eval):
#   PRE_DEPLOY_CMD    antes del respaldo; si falla no se toca nada
#                     (p. ej. validar el .env del servidor).
#   BACKUP_EXTRA_CMD  al final del respaldo, con $BACKUP_DIR definido
#                     (p. ej. tar de un volumen chico que no es la base).
PRE_DEPLOY_CMD="${PRE_DEPLOY_CMD:-}"
BACKUP_EXTRA_CMD="${BACKUP_EXTRA_CMD:-}"

# ----------------------------------------------------------------------
# Reporte de progreso al panel interno (best-effort: nunca rompe el
# deploy). Streamea el log cada 4s; external_id = run de GitHub Actions,
# asi un solo deploy evoluciona pending -> success/failed.
# ----------------------------------------------------------------------
PANEL_INGEST_URL="${PANEL_INGEST_URL:-https://api.panel.scripthouse.com.ar/api/deploys/ingest/}"
PANEL_INGEST_TOKEN="${PANEL_INGEST_TOKEN:-}"
PANEL_REPO="$(basename -s .git "$(git remote get-url origin 2>/dev/null || echo "$PROJECT")" 2>/dev/null || echo "$PROJECT")"
[[ -z "$PANEL_REPO" ]] && PANEL_REPO="$PROJECT"

if [[ -n "${GITHUB_RUN_ID:-}" ]]; then
  DEPLOY_RUN_ID="$GITHUB_RUN_ID"
  DEPLOY_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/$GITHUB_RUN_ID"
else
  DEPLOY_RUN_ID="local-$(date +%s)"
  DEPLOY_URL=""
fi

LOG_FILE="$(mktemp 2>/dev/null || echo /tmp/panel-deploy.log)"
: > "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

panel_report() {  # $1 = pending|success|failed
  [[ -z "${PANEL_INGEST_TOKEN:-}" ]] && return 0
  command -v curl >/dev/null 2>&1 || return 0
  local st="$1" ref tailfile
  ref="$(git rev-parse --short HEAD 2>/dev/null || echo "")"
  tailfile="$(mktemp 2>/dev/null || echo /tmp/panel-deploy-tail.log)"
  tail -c 16000 "$LOG_FILE" > "$tailfile" 2>/dev/null || true
  curl -sS -m 8 -X POST "$PANEL_INGEST_URL" \
    -H "X-Ingest-Token: $PANEL_INGEST_TOKEN" \
    --data-urlencode "repo=$PANEL_REPO" \
    --data-urlencode "external_id=$DEPLOY_RUN_ID" \
    --data-urlencode "status=$st" \
    --data-urlencode "environment=produccion" \
    --data-urlencode "ref=$ref" \
    --data-urlencode "notes=Deploy en $(hostname)" \
    --data-urlencode "url=$DEPLOY_URL" \
    --data-urlencode "log@$tailfile" \
    >/dev/null 2>&1 || true
  rm -f "$tailfile" 2>/dev/null || true
  return 0
}

# ----------------------------------------------------------------------
# Rollback: se completa durante el backup (tags de las imagenes actuales)
# y se ejecuta desde el trap de salida si algo falla despues de haber
# reemplazado imagenes en uso.
# ----------------------------------------------------------------------
declare -A ROLLBACK_TAG=()       # servicio -> "repo:rollback-<stamp>"
declare -A ROLLBACK_ORIGINAL=()  # servicio -> "repo:tag" (el que usa el compose)
IMAGES_REPLACED=0

rollback_images() {
  [[ ${#ROLLBACK_TAG[@]} -eq 0 ]] && { echo ">> No hay imagenes previas taggeadas: no se puede revertir." ; return 0; }
  echo ""
  echo ">> Revirtiendo a las imagenes anteriores al deploy..."
  local svc
  for svc in "${!ROLLBACK_TAG[@]}"; do
    local tag="${ROLLBACK_TAG[$svc]}" original="${ROLLBACK_ORIGINAL[$svc]}"
    if docker image inspect "$tag" >/dev/null 2>&1; then
      docker image tag "$tag" "$original"
      echo "   $svc: $original <- $tag"
    else
      echo "   $svc: no hay tag de rollback ($tag), se omite"
    fi
  done
  compose up -d --no-deps "${!ROLLBACK_TAG[@]}" 2>&1 || true
}

REPORTER_PID=""
_deploy_finish() {
  local ec=$?
  trap - EXIT
  [[ -n "$REPORTER_PID" ]] && kill "$REPORTER_PID" 2>/dev/null || true
  if [[ $ec -ne 0 ]]; then
    if [[ "$IMAGES_REPLACED" -eq 1 ]]; then
      rollback_images
      echo ""
      echo ">> Logs de contenedores que no llegaron a estar sanos:"
      local svc cname running health
      for svc in "${!CONTAINER_OF[@]}"; do
        cname="${CONTAINER_OF[$svc]}"
        running="$(docker inspect --format='{{.State.Running}}' "$cname" 2>/dev/null || echo false)"
        health="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cname" 2>/dev/null || echo "")"
        if [[ "$running" != "true" || ( -n "$health" && "$health" != "healthy" ) ]]; then
          echo "   --- $cname ---"
          docker logs --tail=50 "$cname" 2>&1 | sed 's/^/    /'
        fi
      done
    fi
    panel_report failed
  else
    panel_report success
  fi
  [[ -n "${LOG_FILE:-}" ]] && rm -f "$LOG_FILE" 2>/dev/null || true
}
trap _deploy_finish EXIT

panel_report pending
( while sleep 4; do panel_report pending || true; done ) &
REPORTER_PID=$!

echo "=========================================="
echo "$PROJECT - deploy en $(hostname) - $(date -Iseconds)"
echo "=========================================="

T0=$(date +%s)
PHASE_T=$T0
phase_time() {  # $1 = etiqueta de la fase que termino
  local now=$(date +%s)
  echo "   [t] $1: $((now - PHASE_T))s (total $((now - T0))s)"
  PHASE_T=$now
}

# Asegurar la red externa 'web' (idempotente): todos los stacks de la
# plantilla la comparten con Traefik.
if ! docker network ls --format '{{.Name}}' | grep -qx 'web'; then
  echo ">> Creando red docker externa 'web'..."
  docker network create web >/dev/null
fi

# ----------------------------------------------------------------------
# [1/6] Respaldo previo: .env, estado de contenedores, tags de rollback
# de las imagenes de BUILD_SERVICES y (si DB_NAME) dump de la base.
# ----------------------------------------------------------------------
if [[ -n "$PRE_DEPLOY_CMD" ]]; then
  echo ""
  echo ">> [0/6] Verificacion previa (PRE_DEPLOY_CMD)..."
  if ! eval "$PRE_DEPLOY_CMD"; then
    echo "   PRE_DEPLOY_CMD fallo: no se toca nada." >&2
    exit 1
  fi
  phase_time "verificacion previa"
fi

echo ""
echo ">> [1/6] Respaldo previo..."
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/var/backups/$PROJECT/$STAMP"
mkdir -p "$BACKUP_DIR"

[[ -f .env ]] && cp .env "$BACKUP_DIR/environment.env" 2>/dev/null || true

if [[ ${#CONTAINER_OF[@]} -gt 0 ]]; then
  docker inspect "${CONTAINER_OF[@]}" > "$BACKUP_DIR/containers.json" 2>/dev/null || true
fi

for svc in "${BUILD_SERVICES[@]}"; do
  image_ref="$(compose config --images "$svc" 2>/dev/null | head -n1)"
  [[ -n "$image_ref" ]] || continue
  if docker image inspect "$image_ref" >/dev/null 2>&1; then
    rollback_tag="${image_ref%:*}:rollback-$STAMP"
    docker image tag "$image_ref" "$rollback_tag"
    ROLLBACK_TAG["$svc"]="$rollback_tag"
    ROLLBACK_ORIGINAL["$svc"]="$image_ref"
    echo "   $svc: $rollback_tag"
  else
    echo "   $svc: sin imagen previa (primer deploy), no hay nada que taggear"
  fi
done

if [[ -n "$DB_NAME" ]]; then
  if docker exec postgres pg_dump -U root -d "$DB_NAME" -Fc > "$BACKUP_DIR/database.dump" 2>/dev/null; then
    echo "   dump de $DB_NAME -> $BACKUP_DIR/database.dump"
  else
    echo "   AVISO: no se pudo volcar $DB_NAME (contenedor 'postgres' ausente o primer deploy)"
    rm -f "$BACKUP_DIR/database.dump"
  fi
fi
if [[ -n "$BACKUP_EXTRA_CMD" ]]; then
  export BACKUP_DIR
  if ! eval "$BACKUP_EXTRA_CMD"; then
    echo "   BACKUP_EXTRA_CMD fallo: no se sigue sin respaldo completo." >&2
    exit 1
  fi
fi
phase_time "respaldo"

# ----------------------------------------------------------------------
# [2/6] Decidir que reconstruir
# ----------------------------------------------------------------------
echo ""
echo ">> [2/6] Decidiendo que reconstruir..."
CURRENT_SHA="$(git rev-parse HEAD)"
LAST_SHA=""
[[ -f "$SENTINEL" ]] && LAST_SHA="$(cat "$SENTINEL" 2>/dev/null || true)"

declare -a SERVICES_TO_BUILD=()
declare -a REASONS=()

mark_all() {
  SERVICES_TO_BUILD=("${BUILD_SERVICES[@]}")
  REASONS+=("$1")
}

if [[ "$FORCE_ALL" -eq 1 ]]; then
  mark_all "--all"
elif [[ -z "$LAST_SHA" ]]; then
  mark_all "sin sentinel (.last-deploy-sha ausente) -> primer deploy"
elif ! git cat-file -e "${LAST_SHA}^{commit}" 2>/dev/null; then
  mark_all "el sha del sentinel ya no existe en el repo -> rebuild defensivo"
elif [[ "$LAST_SHA" == "$CURRENT_SHA" ]]; then
  echo "   sin cambios nuevos desde $LAST_SHA"
else
  echo "   comparando $LAST_SHA..$CURRENT_SHA"
  CHANGED_FILES="$(git diff --name-only "$LAST_SHA" "$CURRENT_SHA")"
  echo "$CHANGED_FILES" | sed 's/^/    /'

  # Solo lo que puede cambiar la imagen o el servicio fuerza rebuild total.
  # scripts/deploy.sh y el workflow se actualizan desde la plantilla de
  # scripthouse-infra en toda la flota a la vez: no tiene sentido que cada
  # propagacion recompile todos los proyectos.
  if echo "$CHANGED_FILES" | grep -qE '^(docker-compose\.yml|deploy\.conf)$'; then
    mark_all "cambio en archivo de infraestructura (compose / deploy.conf)"
  else
    for svc in "${BUILD_SERVICES[@]}"; do
      if [[ -n "${TRIGGERS[$svc]+x}" ]]; then
        if echo "$CHANGED_FILES" | grep -qE "${TRIGGERS[$svc]}"; then
          SERVICES_TO_BUILD+=("$svc")
          REASONS+=("$svc: coincide con ${TRIGGERS[$svc]}")
        fi
      else
        # Sin trigger definido: se reconstruye en cada deploy a proposito.
        SERVICES_TO_BUILD+=("$svc")
        REASONS+=("$svc: sin trigger, se reconstruye siempre")
      fi
    done
  fi
fi

if [[ ${#SERVICES_TO_BUILD[@]} -gt 0 ]]; then
  readarray -t SERVICES_TO_BUILD < <(printf '%s\n' "${SERVICES_TO_BUILD[@]}" | awk '!seen[$0]++')
fi

echo "   servicios a reconstruir: ${#SERVICES_TO_BUILD[@]} (${SERVICES_TO_BUILD[*]:-ninguno})"
[[ ${#REASONS[@]} -gt 0 ]] && printf '     - %s\n' "${REASONS[@]}"
phase_time "decision"

# ----------------------------------------------------------------------
# [3/6] Build secuencial
# ----------------------------------------------------------------------
echo ""
if [[ ${#SERVICES_TO_BUILD[@]} -gt 0 ]]; then
  echo ">> [3/6] Build secuencial..."
  for svc in "${SERVICES_TO_BUILD[@]}"; do
    echo "   --- build: $svc ---"
    compose build "$svc"
    phase_time "build $svc"
  done
else
  echo ">> [3/6] Sin builds pendientes."
fi

# ----------------------------------------------------------------------
# [4/6] Tests (sobre la imagen recien construida, antes de tocar lo que
# esta corriendo). Si falla, `set -e` corta aca y no se levanta nada nuevo.
# ----------------------------------------------------------------------
echo ""
if [[ -n "$TESTS_CMD" && ${#SERVICES_TO_BUILD[@]} -gt 0 ]]; then
  echo ">> [4/6] Tests..."
  eval "$TESTS_CMD"
  phase_time "tests"
elif [[ -n "$TESTS_CMD" ]]; then
  echo ">> [4/6] Sin builds nuevos: se omiten los tests."
else
  echo ">> [4/6] TESTS_CMD no definido: se omiten los tests."
fi

# ----------------------------------------------------------------------
# [5/6] Levantar: solo los servicios reconstruidos (--no-deps), asegurar
# los RUNTIME_SERVICES (nunca se compilan aca) y cualquier otro servicio
# declarado que no este corriendo.
# ----------------------------------------------------------------------
echo ""
echo ">> [5/6] Recreando servicios..."
if [[ ${#SERVICES_TO_BUILD[@]} -gt 0 ]]; then
  IMAGES_REPLACED=1
  compose up -d --no-deps "${SERVICES_TO_BUILD[@]}"
fi
if [[ ${#RUNTIME_SERVICES[@]} -gt 0 ]]; then
  compose up -d --no-deps "${RUNTIME_SERVICES[@]}"
fi
# Cualquier otro servicio del compose (fuera de profiles) que haya quedado
# caido se levanta aca con --no-recreate: lo que ya corre no se toca. Los
# runners quedan excluidos siempre: recrear al runner desde adentro del
# runner cancela el job de GitHub a mitad del deploy.
OTHER_SERVICES=()
while IFS= read -r svc; do
  [[ -n "$svc" ]] || continue
  [[ "$svc" == *runner* ]] && continue
  OTHER_SERVICES+=("$svc")
done < <(compose config --services 2>/dev/null)
if [[ ${#OTHER_SERVICES[@]} -gt 0 ]]; then
  compose up -d --no-recreate --no-build "${OTHER_SERVICES[@]}"
fi
phase_time "up"

# ----------------------------------------------------------------------
# [6/6] Healthcheck
# ----------------------------------------------------------------------
echo ""
echo ">> [6/6] Healthcheck (maximo ${HEALTH_WAIT_SECONDS}s)..."

all_healthy() {
  local svc cname running health
  for svc in "${!CONTAINER_OF[@]}"; do
    cname="${CONTAINER_OF[$svc]}"
    running="$(docker inspect --format='{{.State.Running}}' "$cname" 2>/dev/null || echo false)"
    [[ "$running" == "true" ]] || return 1
    health="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cname" 2>/dev/null || echo "")"
    # Contenedor sin healthcheck propio (cadena vacia): alcanza con "running".
    [[ -z "$health" || "$health" == "healthy" ]] || return 1
  done
  return 0
}

WAITED=0
INTERVAL=3
HEALTHY=0
while [[ "$WAITED" -lt "$HEALTH_WAIT_SECONDS" ]]; do
  if all_healthy; then HEALTHY=1; break; fi
  sleep "$INTERVAL"
  WAITED=$((WAITED + INTERVAL))
done

for svc in "${!CONTAINER_OF[@]}"; do
  cname="${CONTAINER_OF[$svc]}"
  running="$(docker inspect --format='{{.State.Running}}' "$cname" 2>/dev/null || echo false)"
  if [[ "$running" == "true" ]]; then
    echo "   OK $cname running"
  else
    echo "   FAIL $cname no esta running"
  fi
done

if [[ "$HEALTHY" -ne 1 ]]; then
  echo "" >&2
  echo "ERROR: no todos los contenedores llegaron a estar sanos en ${HEALTH_WAIT_SECONDS}s." >&2
  exit 1
fi

if [[ -n "$HEALTH_CMD" ]]; then
  echo "   healthcheck de aplicacion: $HEALTH_CMD"
  if ! eval "$HEALTH_CMD"; then
    echo "ERROR: HEALTH_CMD fallo." >&2
    exit 1
  fi
fi
phase_time "healthcheck"

echo ""
compose ps

# ----------------------------------------------------------------------
# Cierre: sentinel, retencion de rollbacks/respaldos, limpieza de imagenes.
# ----------------------------------------------------------------------
echo "$CURRENT_SHA" > "$SENTINEL"

if [[ "$RETAIN" -gt 0 ]]; then
  for svc in "${!ROLLBACK_ORIGINAL[@]}"; do
    repo="${ROLLBACK_ORIGINAL[$svc]%:*}"
    docker image ls --format '{{.CreatedAt}}|{{.Repository}}:{{.Tag}}' "$repo" \
      | awk -F'|' '$2 ~ /:rollback-/' | sort -r | tail -n +"$((RETAIN + 1))" \
      | cut -d'|' -f2 | xargs -r docker image rm -f >/dev/null 2>&1 || true
  done
  (cd "/var/backups/$PROJECT" 2>/dev/null && ls -t | tail -n +"$((RETAIN + 1))" | xargs -r rm -rf) || true
fi

if [[ "$PRUNE_AFTER" -eq 1 ]]; then
  docker image prune -f >/dev/null
fi
phase_time "cierre"

echo ""
echo "=========================================="
echo "DEPLOY OK - $(date -Iseconds)"
echo "  HEAD: $CURRENT_SHA"
[[ -n "$LAST_SHA" ]] && echo "  desde: $LAST_SHA"
echo "=========================================="
