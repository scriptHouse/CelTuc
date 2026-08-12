# Desinstala el agente (correr como Administrador).
# Los datos y logs quedan en C:\ProgramData\CelTuc\HikvisionAgent salvo -PurgeData.
param(
    [string]$TaskName = "CelTuc Hikvision Agent",
    [switch]$PurgeData
)

$ErrorActionPreference = "Stop"

try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop
} catch {}
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    Write-Host "[OK] Tarea programada eliminada"
} catch {
    Write-Warning "La tarea '$TaskName' no estaba registrada"
}

Get-Process hikvision-agent -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$installDir = "C:\Program Files\CelTuc\HikvisionAgent"
if (Test-Path $installDir) {
    Remove-Item -Recurse -Force $installDir
    Write-Host "[OK] Binario eliminado"
}

if ($PurgeData) {
    $dataDir = "C:\ProgramData\CelTuc\HikvisionAgent"
    if (Test-Path $dataDir) {
        Remove-Item -Recurse -Force $dataDir
        Write-Host "[OK] Datos, config y logs eliminados"
    }
} else {
    Write-Host "Datos y logs conservados en C:\ProgramData\CelTuc\HikvisionAgent (usar -PurgeData para borrarlos)"
}
