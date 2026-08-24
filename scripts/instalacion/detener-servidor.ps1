# Detiene TODO el servidor NexoSoft de esta PC: cloud-api, el actualizador
# automatico y PostgreSQL. Lo corre el instalador ANTES de reemplazar archivos,
# y el desinstalador antes de borrarlos.
#
# Por que hace falta: Windows no deja borrar ni reemplazar un archivo que un
# proceso vivo tiene abierto. Reinstalar sobre una instalacion andando moria
# con "Ocurrio un error al intentar reemplazar el archivo existente:
# DeleteFile fallo; codigo 5. Acceso denegado" sobre
# postgres-portable\bin\icudt67.dll -- que es justamente un archivo que
# postgres.exe mantiene cargado mientras corre.
#
# OJO con la diferencia respecto de actualizador-servidor.ps1, que tambien
# detiene cosas: ese solo baja el cloud-api y deja PostgreSQL PRENDIDO, porque
# lo necesita para correr las migraciones de Prisma. Aca hay que apagar
# Postgres tambien, porque el instalador reemplaza sus binarios.
#
# Uso:
#   .\detener-servidor.ps1 -RaizInstalacion "C:\NexoSoft-Servidor"
#
# Sale 0 si no quedo ningun proceso de la instalacion vivo, 1 si alguno
# sobrevivio (en ese caso el instalador aborta antes de tocar nada, en vez de
# fallar por la mitad).

param(
    [string]$RaizInstalacion = "C:\NexoSoft-Servidor",
    [string]$RaizDatos = "C:\ProgramData\NexoSoft",
    [int]$SegundosEspera = 45
)

$ErrorActionPreference = "Continue"

function Aviso($t) { Write-Host $t -ForegroundColor Yellow }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }

Write-Host "Deteniendo el servidor NexoSoft en $RaizInstalacion"

# Los procesos de ESTA instalacion. Se filtra por ruta y no por nombre: en la
# PC puede haber otro node.exe o hasta otro PostgreSQL (el instalador avisa de
# esa posibilidad al preguntar el puerto) y no es asunto nuestro.
function ProcesosDeLaInstalacion {
    $raiz = $RaizInstalacion.TrimEnd('\')
    return @(Get-Process -Name node, postgres, pg_ctl, cloudflared -ErrorAction SilentlyContinue | Where-Object {
        $ruta = $null
        try { $ruta = $_.Path } catch { $ruta = $null }
        $ruta -and $ruta.StartsWith($raiz, [System.StringComparison]::OrdinalIgnoreCase)
    })
}

foreach ($tarea in @("NexoSoft cloud-api", "NexoSoft Actualizador", "NexoSoft PostgreSQL")) {
    try { Stop-ScheduledTask -TaskName $tarea -ErrorAction Stop; Write-Host "Tarea detenida: $tarea" }
    catch { Write-Host "Tarea no encontrada o ya detenida: $tarea" }
}

# PostgreSQL no se apaga parando la tarea: esa tarea corre `pg_ctl start` y
# termina enseguida, dejando al postmaster vivo por su cuenta. Hay que pedirle
# el apagado a el. En modo "fast" corta las conexiones abiertas pero cierra
# limpio, sin dejar la base para recuperar.
$pgCtl = Join-Path $RaizInstalacion "postgres-portable\bin\pg_ctl.exe"
$dataDir = Join-Path $RaizDatos "postgres-data"
if ((Test-Path $pgCtl) -and (Test-Path $dataDir)) {
    Write-Host "Apagando PostgreSQL (pg_ctl stop -m fast)..."
    & $pgCtl stop -D $dataDir -m fast -w -t 30 | Out-Null
} else {
    Write-Host "No hay PostgreSQL portable en esta ruta; nada que apagar."
}

for ($i = 0; $i -lt $SegundosEspera; $i++) {
    $vivos = ProcesosDeLaInstalacion
    if ($vivos.Count -eq 0) {
        Ok "No queda ningun proceso de la instalacion corriendo."
        exit 0
    }
    # Primero se les da tiempo a cerrar solos; recien despues se los baja a la
    # fuerza. Un postgres matado a lo bruto arranca haciendo recuperacion, que
    # es molesto pero no pierde datos confirmados.
    if ($i -ge 15) {
        foreach ($p in $vivos) {
            Aviso "No cerro solo, lo bajo a la fuerza: $($p.ProcessName) (PID $($p.Id))"
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 1
}

$quedan = ProcesosDeLaInstalacion
if ($quedan.Count -eq 0) {
    Ok "No queda ningun proceso de la instalacion corriendo."
    exit 0
}
Aviso "Siguen vivos: $(($quedan | ForEach-Object { $_.ProcessName + ' (PID ' + $_.Id + ')' }) -join ', ')"
exit 1
