# Publica una actualización nueva del POS: compila, firma, arma el
# manifiesto y la sube como GitHub Release al repo público de releases.
# Todos los POS instalados en clientes la van a detectar solos la próxima
# vez que abran "Configuración > Actualizaciones" (o al iniciar, si en el
# futuro se agrega el chequeo automático al arranque).
#
# Requisitos:
#   - gh CLI instalado y logueado (`gh auth login`).
#   - La clave de firma en C:\Users\<vos>\.tauri\nexosoft-pos-updater.key
#     (y su .key.password.txt al lado) — la misma que generamos la primera
#     vez. NO se versiona, NO se pierde: sin ella no se pueden firmar más
#     actualizaciones para los clientes ya instalados.
#
# Uso: parado en la raíz del repo:
#   .\scripts\release\publicar-actualizacion.ps1 -Version "0.1.1" -Notas "Arreglo del ticket chico"

param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Notas,
    [string]$RepoReleases = "nexosoftfsa/nexosoft-pos-releases"
)

$ErrorActionPreference = "Stop"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $raiz

$keyPath = "$env:USERPROFILE\.tauri\nexosoft-pos-updater.key"
$keyPasswordPath = "$env:USERPROFILE\.tauri\nexosoft-pos-updater.key.password.txt"
if (-not (Test-Path $keyPath) -or -not (Test-Path $keyPasswordPath)) {
    Write-Error "No encontré la clave de firma en $keyPath. Sin ella no se puede publicar."
    exit 1
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "Falta GitHub CLI (gh). Instalalo con: winget install --id GitHub.cli"
    exit 1
}

Titulo "Actualizando la version en tauri.conf.json"
$confPath = "apps\pos-desktop\src-tauri\tauri.conf.json"
$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$conf.version = $Version
# ConvertTo-Json + Set-Content por defecto en PS5.1 mete BOM; evitarlo.
$json = $conf | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText((Resolve-Path $confPath), $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Version -> $Version"

Titulo "Compilando y firmando"
Set-Location apps\pos-desktop
$env:TAURI_SIGNING_PRIVATE_KEY = [System.IO.File]::ReadAllText($keyPath)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [System.IO.File]::ReadAllText($keyPasswordPath)
corepack pnpm tauri:build
Set-Location $raiz

$bundleDir = "apps\pos-desktop\src-tauri\target\release\bundle\nsis"
# Match EXACTO por la version que se acaba de compilar (no "el mas nuevo" ni
# "el que no matchee tal patron": el directorio de bundle no se limpia entre
# builds y queda con instaladores de versiones viejas — un filtro ambiguo
# termina agarrando el archivo equivocado, como paso la primera vez.
$exeOriginal = Get-Item "$bundleDir\NexoSoft POS_${Version}_x64-setup.exe" -ErrorAction SilentlyContinue
if (-not $exeOriginal) {
    Write-Error "No encontré 'NexoSoft POS_${Version}_x64-setup.exe' recien compilado en $bundleDir"
    exit 1
}
$exeSinEspacios = "$bundleDir\NexoSoft-POS_${Version}_x64-setup.exe"
Copy-Item $exeOriginal.FullName $exeSinEspacios -Force

Titulo "Armando el manifiesto (latest.json)"
$firma = ([System.IO.File]::ReadAllText("$($exeOriginal.FullName).sig")).Trim()
$fecha = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$manifest = @{
    version   = $Version
    notes     = $Notas
    pub_date  = $fecha
    platforms = @{
        "windows-x86_64" = @{
            signature = $firma
            url       = "https://github.com/$RepoReleases/releases/download/v$Version/$(Split-Path $exeSinEspacios -Leaf)"
        }
    }
} | ConvertTo-Json -Depth 5
$manifestPath = "$bundleDir\latest.json"
[System.IO.File]::WriteAllText($manifestPath, $manifest, (New-Object System.Text.UTF8Encoding $false))

Titulo "Publicando el release v$Version"
& gh release create "v$Version" $exeSinEspacios $manifestPath `
    --repo $RepoReleases --title "v$Version" --notes "$Notas"

Titulo "Listo"
Write-Host "Publicado: https://github.com/$RepoReleases/releases/tag/v$Version"
Write-Host "`nFalta commitear y subir el cambio de version en el repo de codigo:"
Write-Host "  git add apps\pos-desktop\src-tauri\tauri.conf.json"
Write-Host "  git commit -m `"chore(pos): version $Version`""
Write-Host "  git push"
