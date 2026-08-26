#!/bin/bash
#
# Saca el agente de una Mac. Por defecto CONSERVA los datos (config, secretos,
# base con las fichadas todavía sin subir y logs), porque desinstalar suele ser
# el paso previo a reinstalar y tirar la base sería perder fichadas.
#
#   sudo bash scripts/uninstall_mac.sh            # deja los datos
#   sudo bash scripts/uninstall_mac.sh --todo     # borra también los datos
set -euo pipefail

ETIQUETA="ar.com.scripthouse.celtuc-agente"
DIR_CODIGO="/usr/local/lib/celtuc-agente"
DIR_DATOS="/usr/local/var/celtuc-agente"
PLIST="/Library/LaunchDaemons/${ETIQUETA}.plist"

if [[ "$(id -u)" -ne 0 ]]; then
    echo "Este script tiene que correr como root:  sudo bash scripts/uninstall_mac.sh" >&2
    exit 1
fi

if launchctl print "system/${ETIQUETA}" >/dev/null 2>&1; then
    launchctl bootout "system/${ETIQUETA}" 2>/dev/null || true
    echo "[OK] Daemon detenido"
fi

rm -f "$PLIST"
rm -rf "$DIR_CODIGO"
echo "[OK] Código y daemon eliminados"

if [[ "${1:-}" == "--todo" ]]; then
    rm -rf "$DIR_DATOS"
    echo "[OK] Datos eliminados (config, secretos, base y logs)"
else
    echo "[..] Datos conservados en $DIR_DATOS"
    echo "     Si ahí quedaban fichadas sin subir, se van a mandar al reinstalar."
fi

# La suspensión se deja como estaba: si la Mac vuelve a ser de uso normal,
# conviene que se duerma.
pmset -a disablesleep 0 >/dev/null 2>&1 || true
echo "[OK] Suspensión vuelta a su comportamiento normal"
