# Descarga y prepara los runtimes portables (Node.js y PostgreSQL) que el
# instalador de servidor (Fase 13.C, instalador-servidor/) embebe. Se corre
# una sola vez por PC de build, o cuando se quiere bumpear la version de
# Node/Postgres: el resultado queda cacheado en instalador-servidor/.cache/
# (gitignorado, pesa varios cientos de MB) y no hace falta repetir la
# descarga en cada compilacion del instalador.
#
# Postgres se descarga como el zip de "binarios" de EnterpriseDB, que trae
# de yapa pgAdmin 4 y StackBuilder (600+ MB que no hacen falta para correr
# un Postgres headless): se recortan, dejando solo bin/lib/share/include.
#
# Uso: parado en la raiz del repo:
#   .\scripts\release\preparar-runtimes-instalador.ps1

param(
    [string]$NodeVersion = "v24.19.0",
    # PostgreSQL 16.15 Windows x64 "binaries" -- ver
    # https://www.enterprisedb.com/download-postgresql-binaries. Actualizar
    # este fileid a mano cuando se quiera bumpear la version (EDB no tiene
    # una URL estable de "ultima version", hay que ir a buscarlo ahi).
    [string]$PostgresFileId = "1260422",
    [string]$PostgresVersion = "16.15"
)

$ErrorActionPreference = "Stop"
$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$instaladorDir = Join-Path $raiz "instalador-servidor"
$cacheDir = Join-Path $instaladorDir ".cache"
$runtimeDir = Join-Path $instaladorDir "runtime"
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }

Titulo "Node.js portable $NodeVersion"
$nodeZip = Join-Path $cacheDir "node-$NodeVersion-win-x64.zip"
if (-not (Test-Path $nodeZip)) {
    Write-Host "Descargando..."
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip" -OutFile $nodeZip -TimeoutSec 180
} else {
    Write-Host "Ya estaba en cache: $nodeZip"
}
$nodeDestino = Join-Path $runtimeDir "node-portable"
if (Test-Path $nodeDestino) { Remove-Item -Recurse -Force $nodeDestino }
New-Item -ItemType Directory -Force -Path $nodeDestino | Out-Null
tar -xf $nodeZip -C $nodeDestino
# El zip trae una carpeta node-vX-win-x64/ adentro; aplanarla.
$nodeExtraido = Get-ChildItem $nodeDestino -Directory | Select-Object -First 1
Get-ChildItem $nodeExtraido.FullName | Move-Item -Destination $nodeDestino -Force
Remove-Item $nodeExtraido.FullName -Recurse -Force
if (-not (Test-Path (Join-Path $nodeDestino "node.exe"))) {
    Write-Error "No quedo node.exe en $nodeDestino tras extraer."
    exit 1
}
Ok "Node portable listo en $nodeDestino"

Titulo "PostgreSQL portable $PostgresVersion"
$pgZip = Join-Path $cacheDir "postgres-$PostgresVersion-win-x64.zip"
if (-not (Test-Path $pgZip)) {
    Write-Host "Descargando (300+ MB, puede tardar)..."
    Invoke-WebRequest -Uri "https://sbp.enterprisedb.com/getfile.jsp?fileid=$PostgresFileId" -OutFile $pgZip -TimeoutSec 600
} else {
    Write-Host "Ya estaba en cache: $pgZip"
}
$pgExtraidoTmp = Join-Path $cacheDir "postgres-extract-tmp"
if (Test-Path $pgExtraidoTmp) { Remove-Item -Recurse -Force $pgExtraidoTmp }
# tar (no Expand-Archive): el zip de EDB trae rutas muy largas (pgAdmin,
# locales) que Expand-Archive trunca en silencio sin avisar del error.
tar -xf $pgZip -C (New-Item -ItemType Directory -Force -Path $pgExtraidoTmp).FullName
$pgDestino = Join-Path $runtimeDir "postgres-portable"
if (Test-Path $pgDestino) { Remove-Item -Recurse -Force $pgDestino }
New-Item -ItemType Directory -Force -Path $pgDestino | Out-Null
# Solo lo que hace falta para correr Postgres headless -- pgAdmin 4 y
# StackBuilder son ~680 MB que este instalador no necesita.
foreach ($sub in @("bin", "lib", "share", "include")) {
    Copy-Item (Join-Path $pgExtraidoTmp "pgsql\$sub") (Join-Path $pgDestino $sub) -Recurse -Force
}
Remove-Item $pgExtraidoTmp -Recurse -Force
if (-not (Test-Path (Join-Path $pgDestino "bin\initdb.exe"))) {
    Write-Error "No quedo bin\initdb.exe en $pgDestino tras recortar."
    exit 1
}
Ok "PostgreSQL portable (recortado) listo en $pgDestino"

Titulo "cloudflared (acceso remoto, Fase 17.A)"
# Binario unico, sin instalador: es el conector del tunel de Cloudflare que
# le da al comercio su direccion fija (ver ADR-0055). Va embebido para que
# el alta del acceso remoto no dependa de bajar nada en la PC del cliente,
# que muchas veces se instala con internet malo o sin internet.
$cloudflaredDestino = Join-Path $runtimeDir "cloudflared"
$cloudflaredExe = Join-Path $cloudflaredDestino "cloudflared.exe"
New-Item -ItemType Directory -Force -Path $cloudflaredDestino | Out-Null
if (-not (Test-Path $cloudflaredExe)) {
    Write-Host "Descargando..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
        -OutFile $cloudflaredExe -TimeoutSec 300 -UseBasicParsing
} else {
    Write-Host "Ya estaba: $cloudflaredExe"
}
Ok "cloudflared listo en $cloudflaredDestino"

Titulo "Listo"
$tamanioNode = [Math]::Round((Get-ChildItem $nodeDestino -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
$tamanioPg = [Math]::Round((Get-ChildItem $pgDestino -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
$tamanioCf = [Math]::Round((Get-Item $cloudflaredExe).Length / 1MB, 1)
Write-Host "node-portable: $tamanioNode MB"
Write-Host "postgres-portable: $tamanioPg MB"
Write-Host "cloudflared: $tamanioCf MB"
