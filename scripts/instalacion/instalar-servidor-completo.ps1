# Deja el servidor completo funcionando de una sola corrida: dependencias,
# base de datos, .env, build, panel web, servicio de Windows y firewall.
# Reemplaza los pasos 1-6 sueltos de docs/instalacion-primer-cliente.md.
#
# Requisitos previos (una sola vez en la PC, antes de esto):
#   - Node.js, Git, PostgreSQL 16 y WebView2 instalados.
#   - El repo YA CLONADO con `git clone` (NUNCA copiar la carpeta completa
#     por USB: node_modules tiene decenas de miles de archivos chiquitos,
#     tarda muchisimo copiarlo y sus rutas superan el limite de Windows).
#
# Uso: parado en la carpeta del repo, en PowerShell COMO ADMINISTRADOR:
#   .\scripts\instalacion\instalar-servidor-completo.ps1 -NombreComercio "Minimarket X" -AdminUsuario "admin" -AdminPassword "unaBuenaClave123"

param(
    [Parameter(Mandatory = $true)][string]$NombreComercio,
    [Parameter(Mandatory = $true)][string]$AdminUsuario,
    [Parameter(Mandatory = $true)][string]$AdminPassword,
    [string]$PostgresBin = "C:\Program Files\PostgreSQL\16\bin"
)

$ErrorActionPreference = "Stop"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $esAdmin) {
    Write-Error "Corré esto como Administrador (clic derecho sobre PowerShell > Ejecutar como administrador)."
    exit 1
}

$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $raiz

Titulo "Prerrequisitos"
foreach ($cmd in @("node", "git")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "Falta $cmd en el PATH. Instalalo y volvé a correr este script."
        exit 1
    }
}
corepack enable
Ok "Node, Git y corepack listos"

Titulo "Habilitando rutas largas de Windows (evita errores de node_modules)"
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
    -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force | Out-Null
git config --system core.longpaths true
Ok "Rutas largas habilitadas"

Titulo "Instalando dependencias (pnpm install) — puede tardar unos minutos"
corepack pnpm install
Ok "Dependencias instaladas"

Titulo "Base de datos"
$psql = Join-Path $PostgresBin "psql.exe"
if (-not (Test-Path $psql)) {
    Write-Error "No encontré psql.exe en $PostgresBin. Pasá la ruta correcta con -PostgresBin."
    exit 1
}
$pgPassword = Read-Host "Contraseña del superusuario 'postgres' de PostgreSQL (la que pusiste al instalarlo)" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassword))

$nexosoftPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })

$rolExiste = & $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname='nexosoft'" 2>$null
if ($rolExiste -ne "1") {
    & $psql -U postgres -h localhost -c "CREATE ROLE nexosoft WITH LOGIN PASSWORD '$nexosoftPassword';" | Out-Null
    Ok "Rol 'nexosoft' creado"
} else {
    Write-Host "El rol 'nexosoft' ya existía — no toco su password. Si el .env ya tiene la contraseña correcta, seguí normal." -ForegroundColor Yellow
}
$dbExiste = & $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='nexosoft'" 2>$null
if ($dbExiste -ne "1") {
    & $psql -U postgres -h localhost -c "CREATE DATABASE nexosoft OWNER nexosoft;" | Out-Null
    Ok "Base 'nexosoft' creada"
} else {
    Write-Host "La base 'nexosoft' ya existía." -ForegroundColor Yellow
}
$env:PGPASSWORD = $null

Titulo "Configurando .env"
$envPath = "apps\cloud-api\.env"
if (-not (Test-Path $envPath)) {
    $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
    $jwtRefresh = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
    @"
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://nexosoft:$nexosoftPassword@localhost:5432/nexosoft
JWT_SECRET=$jwtSecret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_SECRET=$jwtRefresh
JWT_REFRESH_EXPIRY=30d
JWT_REFRESH_DAYS=30
ARCA_ENV=homologacion
SYNC_BACKEND=custom
RESPALDO_RUTA=./respaldos
RESPALDO_RETENER=7
"@ | Out-File -FilePath $envPath -Encoding utf8
    Ok "apps\cloud-api\.env generado (secretos aleatorios, listo para usar)"
} else {
    Write-Host "apps\cloud-api\.env ya existía — no lo toco." -ForegroundColor Yellow
}

Titulo "Migraciones y build del servidor"
Set-Location apps\cloud-api
corepack pnpm prisma:generate
corepack pnpm exec prisma migrate deploy
corepack pnpm build
Set-Location $raiz
Ok "cloud-api compilado"

Titulo "Panel web"
$env:VITE_API_URL = "/api/v1"
corepack pnpm --filter @nexosoft/admin-web build
New-Item -ItemType Directory -Force apps\cloud-api\panel | Out-Null
Copy-Item apps\admin-web\dist\* apps\cloud-api\panel -Recurse -Force
Ok "Panel compilado y copiado"

Titulo "Servicio de Windows + firewall"
& "$PSScriptRoot\instalar-servicio-servidor.ps1"
& "$PSScriptRoot\abrir-firewall-servidor.ps1"
Start-ScheduledTask -TaskName "NexoSoft cloud-api"
Start-Sleep -Seconds 8

Titulo "Verificando"
try {
    $salud = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/health" -TimeoutSec 10
    Ok "Servidor respondiendo: $($salud.status)"
} catch {
    Write-Error "El servidor no responde todavía. Esperá unos segundos más y probá a mano: http://localhost:3000/api/v1/health"
    exit 1
}

Titulo "Sucursal y primer ADMIN"
$sucursal = corepack pnpm --filter @nexosoft/cloud-api crear:sucursal -- --nombre "$NombreComercio" 2>&1 | Out-String
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
        Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/register" -Method Post -Body $body -ContentType "application/json" | Out-Null
        Ok "ADMIN '$AdminUsuario' creado"
    } catch {
        Write-Host "No se pudo crear el ADMIN automáticamente (¿ya existía?). Revisá a mano si hace falta." -ForegroundColor Yellow
    }
}

Titulo "Listo"
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
Write-Host "Servidor arriba y anda solo con Windows."
Write-Host "Panel: http://localhost:3000/  (o http://$ip:3000/ desde otra PC/celular)"
Write-Host "Usuario ADMIN: $AdminUsuario"
Write-Host "IP de esta PC para configurar Depósito/Oficina: $ip"
Write-Host "`nSiguiente paso: importar el catálogo real (ver docs/instalacion-primer-cliente.md, paso 7) e instalar el POS."
