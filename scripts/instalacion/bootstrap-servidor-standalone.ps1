# Deja un cloud-api standalone (Fase 13, ver dist-servidor/ armado con
# scripts/release/armar-paquete-servidor.ps1) funcionando de punta a punta
# en una PC nueva, SIN pedir nada interactivo y SIN necesitar Node,
# PostgreSQL, Git ni pnpm ya instalados en esa PC: usa un Node y un
# PostgreSQL portables (zip, no instalados en el sistema) dedicados a
# NexoSoft, para no tocar ni compartir con ningun otro Postgres/Node que ya
# pueda existir en esa maquina.
#
# Pensado para ser invocado por el instalador de servidor (Fase 13.C, Inno
# Setup) al final de la instalacion, pero corre igual de bien a mano.
#
# Idempotente: si ya corrio antes en esta PC (mismo -RaizDatos), no
# reinicializa Postgres ni pisa el .env — solo se asegura de que el
# servicio este registrado y arriba, corre migraciones nuevas si las hay, y
# reintenta el alta de sucursal/ADMIN (que ya son no-op si existen).
#
# Uso: como Administrador, parado en la carpeta que tiene node-portable/,
# postgres-portable/ y dist-servidor/ (mismos nombres de subcarpeta que
# arma el instalador):
#   .\bootstrap-servidor-standalone.ps1 -NombreComercio "Minimarket X" -AdminUsuario "admin" -AdminPassword "unaBuenaClave123"

param(
    [Parameter(Mandatory = $true)][string]$NombreComercio,
    [Parameter(Mandatory = $true)][string]$AdminUsuario,
    [Parameter(Mandatory = $true)][string]$AdminPassword,

    [string]$NodeDir = (Join-Path $PSScriptRoot "..\..\node-portable"),
    [string]$PostgresDir = (Join-Path $PSScriptRoot "..\..\postgres-portable"),
    [string]$ServidorDir = (Join-Path $PSScriptRoot "..\..\dist-servidor"),
    [string]$RaizDatos = "C:\ProgramData\NexoSoft",

    [int]$Puerto = 3000,
    # Puerto dedicado al tunel de acceso remoto (ADR-0057): el cloud-api lo
    # escucha solo en loopback y NO se abre en el firewall. Es lo que permite
    # que lo que entra de internet quede en solo lectura.
    [int]$PuertoRemoto = 3001,
    [int]$PuertoPostgres = 5432,

    # Opcional (Fase 17.A, ADR-0055): codigo de activacion del acceso remoto
    # de ESTE comercio. Si viene, se deja el tunel de Cloudflare andando y el
    # panel queda accesible en https://<comercio>.nexosoft.com.ar. Si no
    # viene, todo funciona igual, solo que el panel se ve nada mas que desde
    # la red del local.
    [string]$CodigoAccesoRemoto
)

$ErrorActionPreference = "Stop"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }
function NuevaClave($largo = 24) {
    -join ((48..57) + (65..90) + (97..122) | Get-Random -Count $largo | ForEach-Object { [char]$_ })
}
# Igual que el patron en scripts/release/*.ps1: corepack/node/postgres
# escriben lineas por stderr que no son errores; se valida con
# $LASTEXITCODE en vez de confiar en $ErrorActionPreference para nativos.
function Correr([string]$Descripcion, [scriptblock]$Comando) {
    $ErrorActionPreference = "Continue"
    & $Comando
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($codigo -ne 0) {
        Write-Error "$Descripcion fallo (exit $codigo)."
        exit 1
    }
}

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $esAdmin) {
    Write-Error "Corre esto como Administrador (clic derecho > Ejecutar como administrador)."
    exit 1
}

$NodeDir = Resolve-Path $NodeDir -ErrorAction SilentlyContinue
$PostgresDir = Resolve-Path $PostgresDir -ErrorAction SilentlyContinue
$ServidorDir = Resolve-Path $ServidorDir -ErrorAction SilentlyContinue
if (-not $NodeDir -or -not $PostgresDir -or -not $ServidorDir) {
    Write-Error "Falta node-portable/, postgres-portable/ o dist-servidor/ junto a este script. Pasalos con -NodeDir/-PostgresDir/-ServidorDir si tienen otro nombre."
    exit 1
}
$nodeExe = Join-Path $NodeDir "node.exe"
$pgBin = Join-Path $PostgresDir "bin"
if (-not (Test-Path $nodeExe)) { Write-Error "No encontre node.exe en $NodeDir"; exit 1 }
if (-not (Test-Path (Join-Path $pgBin "initdb.exe"))) { Write-Error "No encontre initdb.exe en $pgBin"; exit 1 }

New-Item -ItemType Directory -Force -Path $RaizDatos | Out-Null
$dataDir = Join-Path $RaizDatos "postgres-data"
$logDir = Join-Path $RaizDatos "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
# Registro permanente de esta corrida (instalacion o reinstalacion), para
# poder ver que paso si algo falla en la PC del cliente sin tener que
# reproducirlo. Se pisa en cada corrida (Force): el historico no importa,
# solo la ultima.
Start-Transcript -Path (Join-Path $logDir "bootstrap.log") -Force | Out-Null

Titulo "PostgreSQL portable dedicado"
$primeraVez = -not (Test-Path (Join-Path $dataDir "PG_VERSION"))
if ($primeraVez) {
    if (Get-NetTCPConnection -LocalPort $PuertoPostgres -State Listen -ErrorAction SilentlyContinue) {
        Write-Error "El puerto $PuertoPostgres ya esta en uso (¿hay otro PostgreSQL en esta PC?). Reintenta con -PuertoPostgres <otro>."
        exit 1
    }
    $pgSuperPassword = NuevaClave 24
    $nexosoftPassword = NuevaClave 24
    $pwFile = Join-Path $env:TEMP "nexosoft-pg-pw-$(Get-Random).txt"
    [System.IO.File]::WriteAllText($pwFile, $pgSuperPassword, (New-Object System.Text.ASCIIEncoding))
    try {
        Correr "initdb" { & "$pgBin\initdb.exe" -D $dataDir -U postgres --pwfile="$pwFile" -A scram-sha-256 -E UTF8 }
    } finally {
        Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
    }
    Add-Content (Join-Path $dataDir "postgresql.conf") "`nport = $PuertoPostgres`nlisten_addresses = 'localhost'`n"
    # Password del superusuario 'postgres', solo para uso administrativo
    # manual (psql -U postgres) si hiciera falta alguna vez. cloud-api nunca
    # la usa: se conecta siempre con el rol 'nexosoft' de abajo.
    [System.IO.File]::WriteAllText((Join-Path $RaizDatos "postgres-superuser.txt"),
        "Usuario: postgres`nPassword: $pgSuperPassword`nPuerto: $PuertoPostgres`n(Solo para psql -U postgres manual. cloud-api usa el rol 'nexosoft'.)")
    Ok "Cluster inicializado"

    Titulo "Registrando PostgreSQL como tarea programada"
    $argumentoPg = "start -D ""$dataDir"" -l ""$logDir\postgres.log"" -w"
    $accionPg = New-ScheduledTaskAction -Execute (Join-Path $pgBin "pg_ctl.exe") -Argument $argumentoPg
    $disparadorPg = New-ScheduledTaskTrigger -AtStartup
    $configPg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    $principalPg = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Unregister-ScheduledTask -TaskName "NexoSoft PostgreSQL" -Confirm:$false -ErrorAction SilentlyContinue
    # Los cmdlets *-ScheduledTask son CIM y no siempre respetan
    # $ErrorActionPreference = "Stop" del script: sin -ErrorAction Stop acá,
    # un "Acceso denegado" (por ej. si esto no corrio como Administrador)
    # queda como error no terminante y el script sigue de largo creyendo
    # que la tarea quedo armada.
    Register-ScheduledTask -TaskName "NexoSoft PostgreSQL" -Action $accionPg -Trigger $disparadorPg `
        -Settings $configPg -Principal $principalPg `
        -Description "PostgreSQL dedicado de NexoSoft (instancia propia, puerto $PuertoPostgres). Arranca solo con Windows." `
        -ErrorAction Stop | Out-Null
    Start-ScheduledTask -TaskName "NexoSoft PostgreSQL" -ErrorAction Stop
    Ok "Tarea 'NexoSoft PostgreSQL' registrada y arrancada"

    Titulo "Esperando a que PostgreSQL acepte conexiones"
    $env:PGPASSWORD = $pgSuperPassword
    $listo = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        & "$pgBin\pg_isready.exe" -h localhost -p $PuertoPostgres -U postgres *> $null
        if ($LASTEXITCODE -eq 0) { $listo = $true; break }
    }
    if (-not $listo) { Write-Error "PostgreSQL no respondio a tiempo."; exit 1 }
    Ok "PostgreSQL respondiendo"

    Titulo "Rol y base 'nexosoft'"
    & "$pgBin\psql.exe" -U postgres -h localhost -p $PuertoPostgres -c "CREATE ROLE nexosoft WITH LOGIN PASSWORD '$nexosoftPassword';" | Out-Null
    & "$pgBin\psql.exe" -U postgres -h localhost -p $PuertoPostgres -c "CREATE DATABASE nexosoft OWNER nexosoft;" | Out-Null
    $env:PGPASSWORD = $null
    Ok "Rol y base creados"
} else {
    Write-Host "Ya estaba inicializado — no toco el cluster." -ForegroundColor Yellow
    $tarea = Get-ScheduledTask -TaskName "NexoSoft PostgreSQL" -ErrorAction SilentlyContinue
    if (-not $tarea -or $tarea.State -ne "Running") {
        Start-ScheduledTask -TaskName "NexoSoft PostgreSQL" -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
}

Titulo "Configurando .env"
$envPath = Join-Path $ServidorDir ".env"
if (-not (Test-Path $envPath)) {
    if (-not $nexosoftPassword) {
        Write-Error "El cluster ya existia pero falta apps\.env — no tengo la password del rol 'nexosoft' para generarlo. Completalo a mano."
        exit 1
    }
    $jwtSecret = NuevaClave 48
    $jwtRefresh = NuevaClave 48
    @"
NODE_ENV=production
PORT=$Puerto
PORT_REMOTO=$PuertoRemoto
DATABASE_URL=postgresql://nexosoft:$nexosoftPassword@localhost:$PuertoPostgres/nexosoft
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
    Ok ".env generado (secretos aleatorios)"
} else {
    Write-Host ".env ya existia — no lo toco." -ForegroundColor Yellow
}
# DATABASE_URL para las migraciones de abajo (mismo valor que el .env).
$dbUrlLinea = (Get-Content $envPath | Select-String "^DATABASE_URL=").ToString()
$env:DATABASE_URL = $dbUrlLinea.Substring("DATABASE_URL=".Length)

Titulo "Cliente Prisma y migraciones"
Push-Location $ServidorDir
Correr "prisma generate" { & $nodeExe "node_modules\prisma\build\index.js" generate --schema=prisma\schema.prisma }
Correr "prisma migrate deploy" { & $nodeExe "node_modules\prisma\build\index.js" migrate deploy --schema=prisma\schema.prisma }
Pop-Location
Ok "Base migrada"

Titulo "Servicio de Windows del cloud-api"
& (Join-Path $PSScriptRoot "instalar-servicio-servidor.ps1") -CloudApiDir $ServidorDir -NodeExe $nodeExe
& (Join-Path $PSScriptRoot "abrir-firewall-servidor.ps1") -Puerto $Puerto
Start-ScheduledTask -TaskName "NexoSoft cloud-api" -ErrorAction Stop

Titulo "Actualizador automatico (Fase 13.E)"
# Tarea aparte de la del cloud-api: revisa a diario (y tambien al prender
# la PC, por si queda apagada a la hora fija) si hay una version nueva de
# servidor-vX.Y.Z publicada, y si la hay la aplica sola -- con reversion
# automatica si algo sale mal. Ver actualizador-servidor.ps1.
$actualizadorScript = Join-Path $PSScriptRoot "actualizador-servidor.ps1"
if (Test-Path $actualizadorScript) {
    $argumentoActualizador = "-NoProfile -ExecutionPolicy Bypass -File ""$actualizadorScript"" -ServidorDir ""$ServidorDir"" -NodeDir ""$NodeDir"" -Puerto $Puerto"
    $accionAct = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argumentoActualizador
    $disparadorInicio = New-ScheduledTaskTrigger -AtStartup
    $disparadorDiario = New-ScheduledTaskTrigger -Daily -At "04:00"
    $configAct = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principalAct = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Unregister-ScheduledTask -TaskName "NexoSoft Actualizador" -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName "NexoSoft Actualizador" -Action $accionAct -Trigger @($disparadorInicio, $disparadorDiario) `
        -Settings $configAct -Principal $principalAct `
        -Description "Busca y aplica solo actualizaciones del servidor NexoSoft (a diario y al prender la PC)." `
        -ErrorAction Stop | Out-Null
    Ok "Tarea 'NexoSoft Actualizador' registrada (corre a diario a las 04:00 y al prender la PC)"
} else {
    Write-Host "No encontre actualizador-servidor.ps1 al lado de este script -- se omite el auto-update." -ForegroundColor Yellow
}

Titulo "Verificando"
$salud = $null
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try { $salud = Invoke-RestMethod -Uri "http://localhost:$Puerto/api/v1/health" -TimeoutSec 3; break } catch {}
}
if (-not $salud) { Write-Error "El servidor no respondio a tiempo en el puerto $Puerto."; exit 1 }
Ok "Servidor respondiendo: $($salud.status)"

Titulo "Sucursal y primer ADMIN"
Push-Location $ServidorDir
$sucursal = & $nodeExe "scripts\crear-sucursal.mjs" --nombre "$NombreComercio" 2>&1 | Out-String
Pop-Location
Write-Host $sucursal
$sucursalId = ($sucursal | Select-String -Pattern 'id:\s*(\S+)').Matches.Groups[1].Value
if ($sucursalId) {
    $body = @{
        email         = $AdminUsuario
        nombreDisplay = $NombreComercio
        password      = $AdminPassword
        rol           = "ADMIN"
        sucursalId    = $sucursalId
    } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri "http://localhost:$Puerto/api/v1/auth/register" -Method Post -Body $body -ContentType "application/json" | Out-Null
        Ok "ADMIN '$AdminUsuario' creado"
    } catch {
        Write-Host "No se pudo crear el ADMIN automaticamente (¿ya existia?). Revisar a mano si hace falta." -ForegroundColor Yellow
    }
}

if ($CodigoAccesoRemoto) {
    Titulo "Acceso remoto (Fase 17.A)"
    $scriptAcceso = Join-Path $PSScriptRoot "instalar-acceso-remoto.ps1"
    if (Test-Path $scriptAcceso) {
        # No corta la instalacion si falla: el POS y el panel en la LAN andan
        # igual sin acceso remoto, y se puede reintentar despues desde el POS
        # (Configuracion > Acceso remoto).
        try {
            & $scriptAcceso -Accion activar -Codigo $CodigoAccesoRemoto -Puerto $Puerto -PuertoRemoto $PuertoRemoto -RaizDatos $RaizDatos
            Ok "Acceso remoto configurado"
        } catch {
            Write-Host "No se pudo configurar el acceso remoto: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "Se puede reintentar desde el POS: Configuracion > Acceso remoto." -ForegroundColor Yellow
        }
    } else {
        Write-Host "No encontre instalar-acceso-remoto.ps1 -- se omite el acceso remoto." -ForegroundColor Yellow
    }
}

Titulo "Listo"
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
Write-Host "Servidor arriba y anda solo con Windows (PostgreSQL y cloud-api son tareas programadas propias)."
Write-Host "Panel: http://localhost:$Puerto/  (o http://${ip}:$Puerto/ desde otra PC/celular)"
Write-Host "Usuario ADMIN: $AdminUsuario"
Write-Host "IP de esta PC para configurar Deposito/Oficina: $ip"
# El instalador (Fase 13.C) lee este archivo para mostrar la IP en la
# pantalla final del wizard.
[System.IO.File]::WriteAllText((Join-Path $RaizDatos "ip-servidor.txt"), "$ip`n$Puerto")
Stop-Transcript | Out-Null
