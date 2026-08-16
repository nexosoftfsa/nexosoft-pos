# Registra una tarea programada de Windows para que el cloud-api arranque
# solo al iniciar sesion (ADR-0019: esta PC es el "servidor de sucursal").
# Correr una sola vez en la PC que hace de servidor. Requiere PowerShell
# como administrador la primera vez (Register-ScheduledTask lo pide).
#
# Uso: parado en la raiz del repo, en una consola de PowerShell ABIERTA
# COMO ADMINISTRADOR (click derecho > Ejecutar como administrador):
#   .\scripts\servidor\instalar-tarea.ps1

$ErrorActionPreference = "Stop"

$esAdmin = ([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
    Write-Error "Este script necesita PowerShell como Administrador (Register-ScheduledTask lo exige). Volve a abrir PowerShell con 'Ejecutar como administrador' y corre el script de nuevo."
    exit 1
}

$nombreTarea = "NexoSoft Cloud API"
$scriptIniciar = Resolve-Path (Join-Path $PSScriptRoot "iniciar-cloud-api.ps1")

$accion = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptIniciar`""

$disparador = New-ScheduledTaskTrigger -AtLogOn
$config = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

if (Get-ScheduledTask -TaskName $nombreTarea -ErrorAction SilentlyContinue) {
    Write-Host "Ya existe la tarea '$nombreTarea', la reemplazo..."
    Unregister-ScheduledTask -TaskName $nombreTarea -Confirm:$false
}

Register-ScheduledTask -TaskName $nombreTarea -Action $accion -Trigger $disparador `
    -Settings $config -Description "Arranca @nexosoft/cloud-api al iniciar sesion (servidor de sucursal, ADR-0019)." `
    -ErrorAction Stop | Out-Null

if (-not (Get-ScheduledTask -TaskName $nombreTarea -ErrorAction SilentlyContinue)) {
    Write-Error "Algo fallo: la tarea no quedo registrada."
    exit 1
}

Write-Host "Tarea '$nombreTarea' instalada: se va a iniciar sola la proxima vez que inicies sesion en Windows."
Start-ScheduledTask -TaskName $nombreTarea
Write-Host "Tambien la arranque ahora. Probala en unos segundos: http://localhost:3000/api/v1/health"
