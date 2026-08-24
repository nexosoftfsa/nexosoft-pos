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
# fallar por la mitad). Deja siempre un log en <RaizDatos>\logs.

param(
    [string]$RaizInstalacion = "C:\NexoSoft-Servidor",
    [string]$RaizDatos = "C:\ProgramData\NexoSoft",
    [int]$SegundosEspera = 45
)

$ErrorActionPreference = "Continue"

$logDir = Join-Path $RaizDatos "logs"
try {
    New-Item -ItemType Directory -Force -Path $logDir -ErrorAction Stop | Out-Null
    Start-Transcript -Path (Join-Path $logDir "detener-servidor.log") -Force | Out-Null
} catch {
    # Sin log se sigue igual: detener el servidor importa mas que registrarlo.
}

function Aviso($t) { Write-Host $t -ForegroundColor Yellow }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }

$raiz = $RaizInstalacion.TrimEnd('\')
$dataDir = (Join-Path $RaizDatos "postgres-data").TrimEnd('\')
Write-Host "Deteniendo el servidor NexoSoft"
Write-Host "  Instalacion: $raiz"
Write-Host "  Datos:       $dataDir"

# Los procesos de ESTA instalacion.
#
# Se usa CIM y no Get-Process: la propiedad .Path de Get-Process abre un handle
# al proceso y tira "Acceso denegado" con los que corren como SYSTEM -- que son
# exactamente los nuestros, porque las tareas programadas se registran con ese
# usuario. El filtro los descartaba en silencio, el script decia que no quedaba
# nada vivo y el instalador se estrellaba igual contra el .dll de postgres.
#
# Se mira tambien la linea de comandos: un postgres arrancado desde una carpeta
# vieja pero sirviendo NUESTRO directorio de datos tiene igual tomados los
# archivos que nos importan.
function ProcesosDeLaInstalacion {
    $nombres = @("node.exe", "postgres.exe", "pg_ctl.exe", "cloudflared.exe")
    $todos = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $nombres -contains $_.Name })
    return @($todos | Where-Object {
        ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($raiz, [System.StringComparison]::OrdinalIgnoreCase)) -or
        ($_.CommandLine -and $_.CommandLine.IndexOf($dataDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
    })
}

# Ojo: `return @(...)` NO garantiza un array del otro lado -- PowerShell
# desenvuelve las colecciones de un solo elemento al devolverlas. Cada llamada
# se vuelve a envolver con @() porque de ese conteo depende el codigo de salida,
# y confundir "uno" con "ninguno" haria que el instalador siga de largo con
# PostgreSQL vivo, que es el bug que estamos arreglando.
function Inventario($titulo) {
    $vivos = @(ProcesosDeLaInstalacion)
    Write-Host "$titulo ($($vivos.Count)):"
    foreach ($p in $vivos) { Write-Host "  PID $($p.ProcessId)  $($p.Name)  $($p.ExecutablePath)" }
    return $vivos
}

Inventario "Procesos de la instalacion al empezar" | Out-Null

foreach ($tarea in @("NexoSoft cloud-api", "NexoSoft Actualizador", "NexoSoft PostgreSQL")) {
    try { Stop-ScheduledTask -TaskName $tarea -ErrorAction Stop; Write-Host "Tarea detenida: $tarea" }
    catch { Write-Host "Tarea no encontrada o ya detenida: $tarea" }
}

# PostgreSQL no se apaga parando la tarea: esa tarea corre `pg_ctl start` y
# termina enseguida, dejando al postmaster vivo por su cuenta. Hay que pedirle
# el apagado a el. En modo "fast" corta las conexiones abiertas pero cierra
# limpio, sin dejar la base para recuperar.
$pgCtl = Join-Path $raiz "postgres-portable\bin\pg_ctl.exe"
if ((Test-Path $pgCtl) -and (Test-Path $dataDir)) {
    Write-Host "Apagando PostgreSQL (pg_ctl stop -m fast)..."
    & $pgCtl stop -D $dataDir -m fast -w -t 30 2>&1 | ForEach-Object { Write-Host "  $_" }
} else {
    Write-Host "No hay pg_ctl.exe o directorio de datos en estas rutas; se pasa al cierre por proceso."
}

for ($i = 0; $i -lt $SegundosEspera; $i++) {
    $vivos = @(ProcesosDeLaInstalacion)
    if ($vivos.Count -eq 0) {
        Ok "No queda ningun proceso de la instalacion corriendo."
        try { Stop-Transcript | Out-Null } catch {}
        exit 0
    }
    # Primero se les da tiempo a cerrar solos; recien despues se los baja a la
    # fuerza. Un postgres matado a lo bruto arranca haciendo recuperacion, que
    # es molesto pero no pierde datos confirmados.
    if ($i -ge 10) {
        foreach ($p in $vivos) {
            Aviso "No cerro solo, lo bajo a la fuerza: $($p.Name) (PID $($p.ProcessId))"
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 1
}

$quedan = @(Inventario "Siguen vivos despues de esperar")
try { Stop-Transcript | Out-Null } catch {}
if ($quedan.Count -eq 0) { exit 0 }
exit 1
