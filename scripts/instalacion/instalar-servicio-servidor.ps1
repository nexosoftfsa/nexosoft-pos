# Corre esto UNA VEZ en la PC que va a ser el servidor (la de la Caja), como
# Administrador, DESPUES de:
#   1. Copiar/clonar el repo ahi.
#   2. corepack pnpm install
#   3. Completar apps/cloud-api/.env (DATABASE_URL, JWT_SECRET, etc. - ver
#      .env.example en la raiz del repo)
#   4. corepack pnpm --filter @nexosoft/cloud-api prisma:generate
#   5. corepack pnpm --filter @nexosoft/cloud-api exec prisma migrate deploy
#   6. corepack pnpm --filter @nexosoft/cloud-api build   (genera dist/, produccion)
#
# Registra el servidor como tarea programada de Windows que arranca SOLO al
# prender la PC (antes de que nadie inicie sesion) y se reinicia sola si se
# cae. Asi el cliente no depende de acordarse de abrir nada.

$ErrorActionPreference = "Stop"

$cloudApiDir = Resolve-Path (Join-Path $PSScriptRoot "..\..\apps\cloud-api")
$nodeExe = (Get-Command node.exe).Source

if (-not (Test-Path (Join-Path $cloudApiDir "dist\main.js"))) {
    Write-Error "No existe dist/main.js. Corre antes: corepack pnpm --filter @nexosoft/cloud-api build"
    exit 1
}
if (-not (Test-Path (Join-Path $cloudApiDir ".env"))) {
    Write-Error "Falta apps\cloud-api\.env. Completalo antes de instalar el servicio."
    exit 1
}

$nombreTarea = "NexoSoft cloud-api"

$accion = New-ScheduledTaskAction -Execute $nodeExe -Argument "dist\main.js" -WorkingDirectory $cloudApiDir
$disparador = New-ScheduledTaskTrigger -AtStartup
$configuracion = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Unregister-ScheduledTask -TaskName $nombreTarea -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $nombreTarea -Action $accion -Trigger $disparador `
    -Settings $configuracion -Principal $principal `
    -Description "Backend NexoSoft (cloud-api). Arranca solo con Windows, se reinicia si se cae." | Out-Null

Write-Host "Tarea '$nombreTarea' registrada. Arranca sola en el proximo inicio de Windows."
Write-Host "Para arrancarla ahora mismo sin reiniciar:"
Write-Host "  Start-ScheduledTask -TaskName '$nombreTarea'"
Write-Host "Para ver el estado:"
Write-Host "  Get-ScheduledTask -TaskName '$nombreTarea' | Get-ScheduledTaskInfo"
