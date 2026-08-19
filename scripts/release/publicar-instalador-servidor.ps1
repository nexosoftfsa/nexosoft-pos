# Publica una version nueva del instalador de servidor (Fase 13.D): arma el
# paquete standalone (13.A), prepara los runtimes portables si hace falta
# (13.C, se cachean y no se vuelven a descargar), compila el instalador con
# Inno Setup, arma tambien un .zip liviano SIN los runtimes (lo que va a
# bajar la auto-actualizacion de los servidores ya instalados, Fase 13.E:
# no hace falta reinstalar Node/Postgres para actualizar el codigo), y
# publica los dos como GitHub Release.
#
# Va a un tag propio "servidor-vX.Y.Z" en el mismo repo de releases del POS
# (nexosoftfsa/nexosoft-pos-releases) para no mezclarse con el latest.json
# del autoupdate del POS.
#
# Requisitos:
#   - gh CLI instalado y logueado (gh auth login).
#   - Inno Setup 6 instalado (winget install --id JRSoftware.InnoSetup).
#
# Uso: parado en la raiz del repo:
#   .\scripts\release\publicar-instalador-servidor.ps1 -Version "0.1.0" -Notas "Primera version"

param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Notas,
    [string]$RepoReleases = "nexosoftfsa/nexosoft-pos-releases"
)

$ErrorActionPreference = "Stop"
$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $raiz

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }
# Mismo patron que publicar-actualizacion.ps1: corepack/ISCC/gh escriben
# lineas informativas por stderr que no son errores; con
# $ErrorActionPreference = "Stop" global eso cortaria el script aunque el
# comando haya salido bien. Se valida con $LASTEXITCODE, que es confiable.
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

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "Falta GitHub CLI (gh). Instalalo con: winget install --id GitHub.cli"
    exit 1
}
$iscc = Get-ChildItem -Path @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
) -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $iscc) {
    Write-Error "No encontre ISCC.exe (Inno Setup 6). Instalalo con: winget install --id JRSoftware.InnoSetup"
    exit 1
}

Titulo "Armando el paquete del servidor (dist-servidor)"
Correr "armar-paquete-servidor" { & "$raiz\scripts\release\armar-paquete-servidor.ps1" }
[System.IO.File]::WriteAllText((Join-Path $raiz "dist-servidor\VERSION"), $Version)
Ok "dist-servidor listo, VERSION = $Version"

Titulo "Runtimes portables (Node y PostgreSQL)"
$runtimeDir = Join-Path $raiz "instalador-servidor\runtime"
$nodePortableOk = Test-Path (Join-Path $runtimeDir "node-portable\node.exe")
$pgPortableOk = Test-Path (Join-Path $runtimeDir "postgres-portable\bin\initdb.exe")
if ($nodePortableOk -and $pgPortableOk) {
    Write-Host "Ya estaban preparados (cacheados) -- no los vuelvo a descargar."
} else {
    Correr "preparar-runtimes-instalador" { & "$raiz\scripts\release\preparar-runtimes-instalador.ps1" }
}
Ok "Runtimes listos"

Titulo "Compilando el instalador (Inno Setup)"
Correr "ISCC" { & $iscc "/DMyAppVersion=$Version" "instalador-servidor\NexoSoftServidor.iss" }
$exeInstalador = Get-Item "instalador-servidor\Output\NexoSoft-Servidor-$Version-Setup.exe" -ErrorAction SilentlyContinue
if (-not $exeInstalador) {
    Write-Error "No encontre el instalador recien compilado en instalador-servidor\Output\."
    exit 1
}
Ok "Instalador compilado: $($exeInstalador.Name) ($([Math]::Round($exeInstalador.Length/1MB,1)) MB)"

Titulo "Armando el paquete liviano de actualizacion (sin runtimes)"
$zipActualizacion = "instalador-servidor\Output\NexoSoft-Servidor-Update-$Version.zip"
if (Test-Path $zipActualizacion) { Remove-Item $zipActualizacion -Force }
Compress-Archive -Path "dist-servidor\*" -DestinationPath $zipActualizacion -CompressionLevel Optimal
Ok "Paquete de actualizacion: $([Math]::Round((Get-Item $zipActualizacion).Length/1MB,1)) MB"

Titulo "Publicando servidor-v$Version"
# --latest=false es NO NEGOCIABLE: este release comparte repo con las
# publicaciones del POS (mismo $RepoReleases), y el updater del POS
# (@tauri-apps/plugin-updater) apunta a ".../releases/latest/download/latest.json".
# Sin este flag, "gh release create" marca este release de SERVIDOR como
# el "Latest" del repo (por fecha), y el POS deja de poder chequear
# actualizaciones -- paso exactamente esto una vez, rompiendo el update
# check en la PC de un cliente real.
Correr "gh release create" {
    & gh release create "servidor-v$Version" $exeInstalador.FullName $zipActualizacion `
        --repo $RepoReleases --title "Servidor v$Version" --notes "$Notas" --latest=false
}

Titulo "Listo"
Write-Host "Publicado: https://github.com/$RepoReleases/releases/tag/servidor-v$Version"
Write-Host "Instalador (primera instalacion): $($exeInstalador.Name)"
Write-Host "Paquete de actualizacion (solo codigo, sin runtimes): $(Split-Path $zipActualizacion -Leaf)"
