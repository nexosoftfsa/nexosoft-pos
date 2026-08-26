# Deja el .env del servidor en su lugar, incluso si se perdio.
#
# El .env vive en C:\NexoSoft-Servidor\dist-servidor y tiene la password del
# rol 'nexosoft' con la que el cloud-api se conecta a la base. Esa password se
# genera al azar en la primera instalacion y NO se guarda en ningun otro lado.
#
# El problema: desinstalar borra C:\NexoSoft-Servidor pero deja
# C:\ProgramData\NexoSoft, que es donde estan los datos del comercio (a
# proposito: son del cliente). O sea que desinstalar y volver a instalar
# dejaba la base intacta y la llave para abrirla en la basura. El bootstrap
# cortaba ahi con "no tengo la password del rol 'nexosoft'", el instalador se
# frenaba antes de arrancar el servidor, y el POS terminaba diciendo "no se
# pudo conectar". Le paso a un usuario real y costo medio dia.
#
# Se recupera porque la password del SUPERUSUARIO sí queda del lado de los
# datos (postgres-superuser.txt): con ella se le pone una password nueva al
# rol 'nexosoft' y se escribe un .env nuevo.
#
# Idempotente: si el .env ya existe, no toca nada.
#
# Uso:
#   .\asegurar-env.ps1 -ServidorDir "C:\NexoSoft-Servidor\dist-servidor" `
#                      -PostgresDir "C:\NexoSoft-Servidor\postgres-portable"

param(
    [Parameter(Mandatory = $true)][string]$ServidorDir,
    [Parameter(Mandatory = $true)][string]$PostgresDir,
    [string]$RaizDatos = "C:\ProgramData\NexoSoft",
    [int]$Puerto = 3000,
    [int]$PuertoRemoto = 3001,
    [int]$PuertoPostgres = 5432,
    # La sabe el bootstrap la primera vez, cuando acaba de crear el rol.
    [string]$PasswordNexosoft
)

$ErrorActionPreference = "Stop"

function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }
function Aviso($t) { Write-Host $t -ForegroundColor Yellow }

function NuevaClave($largo = 24) {
    -join ((48..57) + (65..90) + (97..122) | Get-Random -Count $largo | ForEach-Object { [char]$_ })
}

$envPath = Join-Path $ServidorDir ".env"
if (Test-Path $envPath) {
    Write-Host ".env ya existia — no lo toco."
    exit 0
}

$pgBin = Join-Path $PostgresDir "bin"
$password = $PasswordNexosoft

if (-not $password) {
    Aviso "Falta el .env y la base ya existe: recuperando el acceso al rol 'nexosoft'."
    $superPath = Join-Path $RaizDatos "postgres-superuser.txt"
    # Write-Error con ErrorActionPreference en Stop corta el script antes del
    # `exit 1` y PowerShell termina con -1, que en un log no dice nada. Se
    # avisa y se sale con el codigo que corresponde.
    if (-not (Test-Path $superPath)) {
        Write-Host ("ERROR: no esta $superPath, que es lo unico que permite recuperar el acceso a la base. " +
            "Los datos siguen ahi, pero hay que recuperarlos a mano: avisale a NexoSoft ANTES de borrar nada.") -ForegroundColor Red
        exit 1
    }
    $lineaPassword = (Get-Content $superPath | Select-String "^Password:")
    if (-not $lineaPassword) {
        Write-Host "ERROR: no encontre la linea 'Password:' en $superPath." -ForegroundColor Red
        exit 1
    }
    $superPassword = ($lineaPassword.ToString() -replace "^Password:\s*", "").Trim()

    $password = NuevaClave 24
    $env:PGPASSWORD = $superPassword
    # ALTER si el rol existe, CREATE si no. Se ignora el codigo de salida de
    # los dos: el que manda es el chequeo de conexion de abajo, que prueba lo
    # que de verdad importa.
    $ErrorActionPreference = "Continue"
    & "$pgBin\psql.exe" -U postgres -h localhost -p $PuertoPostgres `
        -c "ALTER ROLE nexosoft WITH LOGIN PASSWORD '$password';" *> $null
    & "$pgBin\psql.exe" -U postgres -h localhost -p $PuertoPostgres `
        -c "CREATE ROLE nexosoft WITH LOGIN PASSWORD '$password';" *> $null
    & "$pgBin\psql.exe" -U postgres -h localhost -p $PuertoPostgres `
        -c "CREATE DATABASE nexosoft OWNER nexosoft;" *> $null

    $env:PGPASSWORD = $password
    & "$pgBin\psql.exe" -U nexosoft -h localhost -p $PuertoPostgres -d nexosoft -c "SELECT 1;" *> $null
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    $env:PGPASSWORD = $null
    if ($codigo -ne 0) {
        Write-Host "ERROR: le puse una password nueva al rol 'nexosoft' pero no logro conectarme con ella. Avisale a NexoSoft." -ForegroundColor Red
        exit 1
    }
    Ok "Acceso a la base recuperado (los datos del comercio no se tocaron)"
}

# Los secretos de JWT se generan nuevos: no se pueden recuperar y no hace
# falta. La consecuencia es que las sesiones abiertas dejan de valer y todos
# vuelven a loguearse, que es exactamente lo que pasa despues de reinstalar.
$jwtSecret = NuevaClave 48
$jwtRefresh = NuevaClave 48
@"
NODE_ENV=production
PORT=$Puerto
PORT_REMOTO=$PuertoRemoto
DATABASE_URL=postgresql://nexosoft:$password@localhost:$PuertoPostgres/nexosoft
JWT_SECRET=$jwtSecret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_SECRET=$jwtRefresh
JWT_REFRESH_EXPIRY=30d
JWT_REFRESH_DAYS=30
ARCA_ENV=homologacion
SYNC_BACKEND=custom
RESPALDO_RUTA=$RaizDatos\respaldos
RESPALDO_RETENER=7
"@ | Out-File -FilePath $envPath -Encoding utf8
Ok ".env generado"
exit 0
