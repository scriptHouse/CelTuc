# Instala el agente en la notebook de la sucursal:
#  - copia el .exe a Program Files
#  - crea C:\ProgramData\CelTuc\HikvisionAgent (config, datos, logs) con ACL restringida
#  - guarda los secretos cifrados (DPAPI)
#  - registra una Tarea Programada que arranca con Windows como SYSTEM,
#    invisible para el usuario y con reinicio automático ante fallas
#
# Correr como ADMINISTRADOR, con hikvision-agent.exe y config.toml en la misma carpeta:
#   powershell -ExecutionPolicy Bypass -File install_task.ps1
param(
    [string]$ExeSource = ".\hikvision-agent.exe",
    [string]$ConfigSource = ".\config.toml",
    [string]$TaskName = "CelTuc Hikvision Agent"
)

$ErrorActionPreference = "Stop"

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) { throw "Este script debe correr como Administrador." }
if (-not (Test-Path $ExeSource)) { throw "No se encontró $ExeSource (copiarlo junto a este script)." }

$installDir = "C:\Program Files\CelTuc\HikvisionAgent"
$dataDir    = "C:\ProgramData\CelTuc\HikvisionAgent"
$exe        = Join-Path $installDir "hikvision-agent.exe"

# 0. Si ya estaba instalado, frenarlo antes de reemplazar el .exe. Windows
#    bloquea el archivo mientras corre, y reinstalar es el camino NORMAL de
#    actualizacion: sin esto, el Copy-Item falla con "esta siendo utilizado
#    en otro proceso".
$yaInstalado = $null
try { $yaInstalado = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {}
if ($yaInstalado) {
    Write-Host "==> Ya estaba instalado: deteniendolo para actualizar..."
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {}
    Get-Process hikvision-agent -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    # El sistema tarda un instante en soltar el archivo.
    Start-Sleep -Seconds 2
}

# 1. Binario
New-Item -ItemType Directory -Force $installDir | Out-Null
try {
    Copy-Item $ExeSource $exe -Force -ErrorAction Stop
} catch {
    throw ("No se pudo reemplazar $exe (sigue en uso). Cerra el agente con " +
           "`"Stop-ScheduledTask -TaskName '$TaskName'`" y volve a intentar. Detalle: $_")
}
Write-Host "[OK] Ejecutable en $exe"

# 2. Carpeta de datos con permisos solo para SYSTEM y Administradores (por SID,
#    independiente del idioma de Windows)
New-Item -ItemType Directory -Force $dataDir | Out-Null
New-Item -ItemType Directory -Force (Join-Path $dataDir "data") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $dataDir "logs") | Out-Null
icacls $dataDir /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null
Write-Host "[OK] Carpeta de datos $dataDir (acceso restringido)"

# 3. Config descargada desde CelTuc
if (Test-Path $ConfigSource) {
    Copy-Item $ConfigSource (Join-Path $dataDir "config.toml") -Force
    Write-Host "[OK] config.toml instalado"
} else {
    Write-Warning "No hay config.toml junto al script: descargarlo desde CelTuc -> Asistencia -> Configuracion"
}

# 4. Secretos (contraseña del reloj; el token puede venir en config.toml)
Write-Host ""
Write-Host "Carga de secretos (se guardan cifrados con DPAPI):"
& $exe secrets set
if ($LASTEXITCODE -ne 0) { Write-Warning "Los secretos no quedaron guardados; repetir luego con: `"$exe`" secrets set" }

# 5. Tarea programada: arranca con Windows, sin sesión, sin ventana, se reinicia sola
$accion    = New-ScheduledTaskAction -Execute $exe -Argument "run"
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "S-1-5-18" -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $accion -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "[OK] Tarea programada '$TaskName' registrada y arrancada"

Write-Host ""
Write-Host "Verificación rápida:"
Write-Host "  - Log:    Get-Content '$dataDir\logs\agent.log' -Tail 20"
Write-Host "  - Diag:   & '$exe' diag"
Write-Host "  - Estado: CelTuc -> Asistencia -> Panel (heartbeat en ~1 minuto)"
