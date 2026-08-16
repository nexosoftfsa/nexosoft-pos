# Arranca el cloud-api en modo produccion (dist/ ya compilado) y lo deja
# corriendo. Pensado para ejecutarse solo (sin ventana visible) via la
# tarea programada "NexoSoft Cloud API" (ver scripts\servidor\instalar-tarea.ps1),
# para que el servidor de la sucursal (ADR-0019) este siempre arriba sin que
# haya que abrir una consola a mano cada vez que se prende la PC.
#
# Si reinicia solo (crash, corte de luz, etc.) el propio Task Scheduler lo
# vuelve a levantar segun la configuracion de reintentos de la tarea.

$ErrorActionPreference = "Stop"
$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..\apps\cloud-api")
Set-Location $raiz

$logDir = Join-Path $raiz "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir "cloud-api.log"

if (-not (Test-Path "dist\main.js")) {
    "$(Get-Date -Format o) No existe dist\main.js, compilando..." | Out-File $logFile -Append
    & corepack pnpm build *>> $logFile
}

"$(Get-Date -Format o) Iniciando cloud-api" | Out-File $logFile -Append
& node dist\main.js *>> $logFile
"$(Get-Date -Format o) cloud-api se detuvo (exit $LASTEXITCODE)" | Out-File $logFile -Append
