# Levanta un servidor NexoSoft que quedo caido, sin reinstalar nada.
#
# Para que existe: si el bootstrap del instalador se corta a la mitad, deja la
# PC con los archivos nuevos pero sin PostgreSQL y sin cloud-api corriendo. El
# sintoma es el POS diciendo "No se pudo conectar con el servidor". Volver a
# correr el instalador entero para eso es desproporcionado y arriesgado.
#
# Es idempotente: se puede correr las veces que haga falta. No toca los datos,
# no pisa el .env y no reinicializa el cluster.
#
# Uso (PowerShell como administrador):
#   .\reparar-servidor.ps1
#   .\reparar-servidor.ps1 -AdminUsuario "admin" -AdminPassword "una-clave-larga"
#
# Con -AdminUsuario/-AdminPassword ademas asegura ese usuario ADMIN, que es la
# via de recuperacion cuando nadie se acuerda de la contrasena.

param(
    [string]$RaizInstalacion = "C:\NexoSoft-Servidor",
    [string]$RaizDatos = "C:\ProgramData\NexoSoft",
    [int]$Puerto = 3000,
    [int]$PuertoPostgres = 5432,
    [string]$AdminUsuario,
    [string]$AdminPassword,
    [string]$NombreComercio
)

$ErrorActionPreference = "Stop"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }
function Aviso($t) { Write-Host $t -ForegroundColor Yellow }
function Correr([string]$Descripcion, [scriptblock]$Comando) {
    $ErrorActionPreference = "Continue"
    & $Comando
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($codigo -ne 0) { throw ($Descripcion + " fallo (exit " + $codigo + ").") }
}

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $esAdmin) {
    Write-Error "Corre esto como Administrador (clic derecho > Ejecutar como administrador)."
    exit 1
}

$servidorDir = Join-Path $RaizInstalacion "dist-servidor"
$nodeExe = Join-Path $RaizInstalacion "node-portable\node.exe"
$pgBin = Join-Path $RaizInstalacion "postgres-portable\bin"
$dataDir = Join-Path $RaizDatos "postgres-data"
$logDir = Join-Path $RaizDatos "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "reparar-servidor.log") -Force | Out-Null

try {
    Titulo "Revisando la instalacion"
    foreach ($ruta in @($servidorDir, $nodeExe, $pgBin, $dataDir)) {
        if (-not (Test-Path $ruta)) { throw "Falta $ruta. La instalacion esta incompleta: hay que correr el instalador." }
    }
    $envPath = Join-Path $servidorDir ".env"
    if (-not (Test-Path $envPath)) { throw "Falta $envPath. Sin el no se sabe con que usuario conectarse a la base." }
    Ok "Estan las carpetas y el .env"

    Titulo "PostgreSQL"
    Start-ScheduledTask -TaskName "NexoSoft PostgreSQL" -ErrorAction SilentlyContinue
    $listo = $false
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 1
        $ErrorActionPreference = "Continue"
        & "$pgBin\pg_isready.exe" -h localhost -p $PuertoPostgres -U postgres *> $null
        $codigo = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
        if ($codigo -eq 0) { $listo = $true; break }
        if ($i -eq 20) {
            Aviso "Sigue sin responder; lo arranco directo con pg_ctl."
            $ErrorActionPreference = "Continue"
            & "$pgBin\pg_ctl.exe" start -D $dataDir -l (Join-Path $logDir "postgres.log") -w -t 30 2>&1 |
                ForEach-Object { Write-Host "  $_" }
            $ErrorActionPreference = "Stop"
        }
    }
    if (-not $listo) { throw "PostgreSQL no acepta conexiones en el puerto $PuertoPostgres. Mira $logDir\postgres.log." }
    Ok "PostgreSQL respondiendo en el puerto $PuertoPostgres"

    Titulo "Cliente Prisma y migraciones"
    $env:DATABASE_URL = ((Get-Content $envPath | Select-String "^DATABASE_URL=").ToString()).Substring("DATABASE_URL=".Length)
    Push-Location $servidorDir
    try {
        Correr "prisma generate" { & $nodeExe "node_modules\prisma\build\index.js" generate --schema=prisma\schema.prisma }
        Correr "prisma migrate deploy" { & $nodeExe "node_modules\prisma\build\index.js" migrate deploy --schema=prisma\schema.prisma }
    } finally {
        Pop-Location
    }
    Ok "Base al dia"

    Titulo "Servicio del cloud-api"
    $instalarServicio = Join-Path $PSScriptRoot "instalar-servicio-servidor.ps1"
    if (Test-Path $instalarServicio) {
        & $instalarServicio -CloudApiDir $servidorDir -NodeExe $nodeExe
    } else {
        Aviso "No esta instalar-servicio-servidor.ps1 al lado; se reusa la tarea ya registrada."
    }
    Stop-ScheduledTask -TaskName "NexoSoft cloud-api" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName "NexoSoft cloud-api" -ErrorAction Stop

    $salud = $null
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 1
        try { $salud = Invoke-RestMethod -Uri "http://localhost:$Puerto/api/v1/health" -TimeoutSec 3; break } catch {}
    }
    if (-not $salud) { throw "El servidor no respondio en el puerto $Puerto. Revisa el visor de eventos y $logDir." }
    Ok "Servidor respondiendo: $($salud.status), version $($salud.version)"

    if ($AdminUsuario -and $AdminPassword) {
        Titulo "Usuario administrador"
        $comercio = if ($NombreComercio) { $NombreComercio } else { "NexoSoft" }
        Push-Location $servidorDir
        try {
            Correr "asegurar-admin" {
                & $nodeExe "scripts\asegurar-admin.mjs" --comercio "$comercio" --usuario "$AdminUsuario" --password "$AdminPassword"
            }
        } finally {
            Pop-Location
        }
        Ok "Usuario '$AdminUsuario' listo para entrar"
    }

    Titulo "Listo"
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
    Write-Host "En el POS de ESTA PC, la direccion del servidor va:"
    Write-Host "    http://localhost:$Puerto/api/v1" -ForegroundColor Green
    Write-Host "En las otras terminales (Deposito, Oficina):"
    Write-Host "    http://${ip}:$Puerto/api/v1" -ForegroundColor Green
    [System.IO.File]::WriteAllText((Join-Path $RaizDatos "instalacion-ok.txt"), "reparado`n$(Get-Date -Format o)")
} catch {
    Write-Host "`nNo se pudo reparar: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Mandale a NexoSoft este archivo: $logDir\reparar-servidor.log" -ForegroundColor Red
    Stop-Transcript | Out-Null
    exit 1
} finally {
    try { Stop-Transcript | Out-Null } catch {}
}
