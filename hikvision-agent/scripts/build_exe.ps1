# Empaqueta el agente como hikvision-agent.exe (PyInstaller, un solo archivo).
# Correr desde la carpeta hikvision-agent en la máquina de desarrollo:
#   powershell -ExecutionPolicy Bypass -File scripts\build_exe.ps1
param(
    [string]$Python = "py"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path ".venv-build")) {
    & $Python -3 -m venv .venv-build
}
& ".venv-build\Scripts\python.exe" -m pip install --upgrade pip | Out-Null
& ".venv-build\Scripts\python.exe" -m pip install ".[dev]"

# Se apunta a `launcher.py`, NO a src\hikvision_agent\main.py: PyInstaller
# corre el script objetivo como `__main__` y los imports relativos del modulo
# fallan. El launcher importa el paquete de forma absoluta.
& ".venv-build\Scripts\pyinstaller.exe" --onefile --console --name hikvision-agent `
    --paths src `
    --collect-data tzdata `
    launcher.py

Write-Host ""
Write-Host "Listo: dist\hikvision-agent.exe"
Write-Host "Siguiente paso: copiarlo a la notebook junto con config.toml y correr scripts\install_task.ps1"
