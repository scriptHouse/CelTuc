#!/bin/bash
#
# Instala el agente en una Mac de sucursal:
#  - crea un entorno de Python propio en /usr/local/lib/celtuc-agente
#  - deja config, secretos, base y logs en /usr/local/var/celtuc-agente
#  - guarda la contraseña del reloj con permisos solo para root
#  - registra un LaunchDaemon: arranca al PRENDER la Mac, antes de que nadie
#    inicie sesión, y se reinicia solo si se cae
#  - desactiva la suspensión, que en una Mac es lo que más rompe esto
#
# Correr como root, desde la carpeta del proyecto, con el config.toml al lado:
#   sudo bash scripts/install_mac.sh
#
# El equivalente de Windows es install_task.ps1; los nombres de los mensajes
# se mantienen parecidos a propósito para que el manual sirva para las dos.
set -euo pipefail

ETIQUETA="ar.com.scripthouse.celtuc-agente"
DIR_CODIGO="/usr/local/lib/celtuc-agente"
DIR_DATOS="/usr/local/var/celtuc-agente"
PLIST="/Library/LaunchDaemons/${ETIQUETA}.plist"

# La carpeta del proyecto es la que contiene a scripts/
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_ORIGEN="${1:-$RAIZ/config.toml}"

# --- Comprobaciones previas --------------------------------------------------

if [[ "$(id -u)" -ne 0 ]]; then
    echo "Este script tiene que correr como root:  sudo bash scripts/install_mac.sh" >&2
    exit 1
fi

if [[ ! -f "$RAIZ/pyproject.toml" ]]; then
    echo "No encuentro pyproject.toml en $RAIZ" >&2
    echo "Corré el script desde la carpeta del proyecto hikvision-agent." >&2
    exit 1
fi

# Python 3.11 o mayor: el agente lee el config con tomllib, que es de la
# biblioteca estándar recién desde esa versión. La que trae macOS de fábrica
# es más vieja, así que casi seguro haya que instalar una.
PYTHON=""
for candidato in python3.13 python3.12 python3.11 python3; do
    if command -v "$candidato" >/dev/null 2>&1; then
        if "$candidato" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
            PYTHON="$(command -v "$candidato")"
            break
        fi
    fi
done

if [[ -z "$PYTHON" ]]; then
    echo "No encontré Python 3.11 o mayor." >&2
    echo "" >&2
    echo "Instalalo de alguna de estas dos formas y volvé a correr el script:" >&2
    echo "  - Descarga oficial: https://www.python.org/downloads/macos/" >&2
    echo "  - Con Homebrew:     brew install python@3.12" >&2
    exit 1
fi
echo "[OK] Python: $PYTHON ($("$PYTHON" --version))"

# --- FileVault: la advertencia más importante de todas -----------------------
#
# Con FileVault prendido, después de un corte de luz la Mac no bootea sola: se
# queda en la pantalla de desbloqueo del disco, y hasta que alguien escriba la
# contraseña NO corre ningún LaunchDaemon. O sea que el agente no arranca y la
# sucursal deja de sincronizar sin que nadie se entere. Es el único caso en que
# «prender y olvidarse» deja de ser cierto.

FILEVAULT="$(fdesetup status 2>/dev/null || echo desconocido)"
if [[ "$FILEVAULT" == *"FileVault is On"* ]]; then
    echo ""
    echo "  ====================================================================="
    echo "   ATENCIÓN: FileVault está ACTIVADO en esta Mac."
    echo ""
    echo "   Tras un corte de luz, la Mac queda esperando la clave del disco y"
    echo "   el agente NO arranca hasta que alguien la escriba. La sucursal deja"
    echo "   de sincronizar sin aviso."
    echo ""
    echo "   Si esta Mac queda sola en la sucursal, conviene desactivarlo:"
    echo "     Ajustes del Sistema > Privacidad y seguridad > FileVault"
    echo "   (tarda un rato en descifrar el disco)."
    echo "  ====================================================================="
    echo ""
    read -r -p "  ¿Seguir igual con la instalación? [s/N] " SEGUIR </dev/tty || SEGUIR="n"
    if [[ ! "$SEGUIR" =~ ^[sS]$ ]]; then
        echo "Instalación cancelada. Desactivá FileVault y volvé a correr esto."
        exit 1
    fi
else
    echo "[OK] FileVault desactivado: la Mac puede bootear sola tras un corte"
fi

# --- 0. Si ya estaba instalado, frenarlo -------------------------------------

if launchctl print "system/${ETIQUETA}" >/dev/null 2>&1; then
    echo "==> Ya estaba instalado: deteniéndolo para actualizar..."
    launchctl bootout "system/${ETIQUETA}" 2>/dev/null || true
    sleep 2
fi

# --- 1. Código y entorno de Python -------------------------------------------

mkdir -p "$DIR_CODIGO"
"$PYTHON" -m venv "$DIR_CODIGO/venv"
"$DIR_CODIGO/venv/bin/python" -m pip install --upgrade pip >/dev/null
echo "==> Instalando el agente y sus dependencias (necesita Internet)..."
"$DIR_CODIGO/venv/bin/pip" install --quiet "$RAIZ"
AGENTE="$DIR_CODIGO/venv/bin/hikvision-agent"

if [[ ! -x "$AGENTE" ]]; then
    echo "La instalación no dejó el ejecutable en $AGENTE" >&2
    exit 1
fi
echo "[OK] Agente instalado en $AGENTE"

# --- 2. Carpeta de datos, solo para root -------------------------------------
#
# En Windows los secretos se cifran con DPAPI. Acá no hay equivalente directo,
# así que el archivo queda en texto codificado: lo que lo protege son los
# permisos. Por eso 700 en la carpeta y dueño root.

mkdir -p "$DIR_DATOS/data" "$DIR_DATOS/logs"
chown -R root:wheel "$DIR_DATOS"
chmod 700 "$DIR_DATOS"
echo "[OK] Carpeta de datos $DIR_DATOS (acceso restringido)"

# --- 3. Config descargada desde CelTuc ---------------------------------------

if [[ -f "$CONFIG_ORIGEN" ]]; then
    cp "$CONFIG_ORIGEN" "$DIR_DATOS/config.toml"
    chown root:wheel "$DIR_DATOS/config.toml"
    chmod 600 "$DIR_DATOS/config.toml"
    echo "[OK] config.toml instalado"
else
    echo "[!!] No hay config.toml en $CONFIG_ORIGEN"
    echo "     Descargalo desde CelTuc -> Asistencia -> Configuración y volvé a correr esto."
fi

# --- 4. Secretos --------------------------------------------------------------

echo ""
echo "Carga de secretos (quedan en $DIR_DATOS, solo legibles por root):"
HIKAGENT_HOME="$DIR_DATOS" "$AGENTE" secrets set || \
    echo "[!!] Los secretos no quedaron guardados; repetir con:
     sudo HIKAGENT_HOME=$DIR_DATOS $AGENTE secrets set"

if [[ -f "$DIR_DATOS/secrets.dat" ]]; then
    chown root:wheel "$DIR_DATOS/secrets.dat"
    chmod 600 "$DIR_DATOS/secrets.dat"
fi

# --- 5. LaunchDaemon: arranca al prender la Mac ------------------------------
#
# Va en /Library/LaunchDaemons (no en LaunchAgents) para que corra al bootear,
# sin que nadie tenga que iniciar sesión. launchd exige que el plist sea de
# root:wheel y no escribible por el grupo, o se niega a cargarlo.

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${ETIQUETA}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${AGENTE}</string>
        <string>run</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HIKAGENT_HOME</key>
        <string>${DIR_DATOS}</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>ThrottleInterval</key>
    <integer>60</integer>

    <key>StandardOutPath</key>
    <string>${DIR_DATOS}/logs/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>${DIR_DATOS}/logs/launchd.err.log</string>
</dict>
</plist>
PLISTEOF

chown root:wheel "$PLIST"
chmod 644 "$PLIST"

launchctl bootstrap system "$PLIST"
launchctl enable "system/${ETIQUETA}"
echo "[OK] Daemon '${ETIQUETA}' registrado y arrancado"

# --- 6. Que la Mac no se duerma ----------------------------------------------
#
# Una MacBook con la tapa cerrada se suspende aunque esté enchufada, y
# suspendida no sincroniza nada. Esto es lo que más rompe la instalación.

pmset -c sleep 0 disksleep 0 displaysleep 10 womp 1 >/dev/null 2>&1 || true
pmset -a disablesleep 1 >/dev/null 2>&1 || \
    echo "[!!] No se pudo desactivar la suspensión; hacelo a mano:
     sudo pmset -a disablesleep 1"
# Que se prenda sola cuando vuelve la luz: es el equivalente del «Restore on AC
# power loss» de la BIOS en una PC. Sin esto, un corte deja la sucursal muda
# hasta que alguien vaya a apretar el botón.
pmset -a autorestart 1 >/dev/null 2>&1 || true

echo "[OK] Suspensión desactivada y arranque automático tras un corte de luz"

# --- Verificación -------------------------------------------------------------

echo ""
echo "Verificación rápida:"
echo "  - Estado:  sudo launchctl print system/${ETIQUETA} | head -20"
echo "  - Log:     sudo tail -20 $DIR_DATOS/logs/agent.log"
echo "  - Diag:    sudo HIKAGENT_HOME=$DIR_DATOS $AGENTE diag"
echo "  - Panel:   CelTuc -> Asistencia -> Panel (heartbeat en ~1 minuto)"
echo ""
echo "Para desinstalar:  sudo bash scripts/uninstall_mac.sh"
