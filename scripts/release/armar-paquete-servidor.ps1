# Arma un paquete standalone del cloud-api, listo para copiar a la PC de un
# comercio SIN el resto del monorepo (Fase 13.A): sin codigo fuente, sin
# devDependencies, sin .env. Es la base sobre la que se arma despues el
# instalador de servidor (Fase 13.C) y el paquete liviano de actualizacion
# (Fase 13.E).
#
# Usa `pnpm deploy` (resuelve las dependencias "workspace:*" del monorepo a
# archivos reales, no symlinks) mas un `files` allowlist en
# apps/cloud-api/package.json para que copie solo dist/ + prisma/ y nunca
# .env, src/, test/ ni logs/.
#
# --config.node-linker=hoisted: por defecto pnpm arma node_modules con una
# "virtual store" (node_modules/.pnpm/paquete@version_peer@version.../...)
# para poder tener varias versiones de un mismo paquete a la vez -- pero
# genera rutas larguisimas (paquete+peers en un solo nombre de carpeta) que
# superan el limite de Windows (260 caracteres) apenas se anida un poco, y
# eso rompe la compilacion del instalador (Fase 13.C, Inno Setup no es
# "long path aware" aunque LongPathsEnabled este prendido). Con node-linker
# hoisted, node_modules queda plano (como npm/yarn clasico), muchisimo mas
# corto.
#
# El cliente de Prisma (`prisma generate`) NO se genera aca: el paquete
# viaja sin generar y `bootstrap-servidor-standalone.ps1` lo genera de
# verdad en la PC del cliente, ya con el DATABASE_URL real -- el CLI de
# prisma viaja en node_modules porque es dependency (no devDependency) de
# cloud-api, ver apps/cloud-api/package.json.
#
# Uso: parado en la raiz del repo:
#   .\scripts\release\armar-paquete-servidor.ps1 [-Destino "C:\ruta\dist-servidor"]

param(
    [string]$Destino = (Join-Path $PSScriptRoot "..\..\dist-servidor")
)

$ErrorActionPreference = "Stop"
$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Destino = [System.IO.Path]::GetFullPath($Destino)
Set-Location $raiz

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }

# corepack/pnpm escriben lineas informativas por stderr; con
# $ErrorActionPreference = "Stop" (global, arriba) eso corta el script aunque
# el comando haya salido bien. Se baja la preferencia solo alrededor de cada
# comando nativo y se valida con $LASTEXITCODE, que es lo confiable (mismo
# patron que scripts\release\publicar-actualizacion.ps1).
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

Titulo "Compilando cloud-api"
Correr "Build de cloud-api" { corepack pnpm --filter @nexosoft/cloud-api build }
Ok "cloud-api compilado"

Titulo "Compilando panel (admin-web)"
$env:VITE_API_URL = "/api/v1"
Correr "Build de admin-web" { corepack pnpm --filter @nexosoft/admin-web build }
Ok "panel compilado"

Titulo "Armando $Destino (sin codigo fuente, sin devDependencies)"
if (Test-Path $Destino) { Remove-Item -Recurse -Force $Destino }
Correr "pnpm deploy" { corepack pnpm --filter @nexosoft/cloud-api deploy --prod --config.node-linker=hoisted "$Destino" }
Ok "dependencias de produccion instaladas"

Titulo "Copiando panel compilado"
New-Item -ItemType Directory -Force "$Destino\panel" | Out-Null
Copy-Item "apps\admin-web\dist\*" "$Destino\panel" -Recurse -Force
Ok "panel copiado"

Titulo "Copiando scripts de alta"
New-Item -ItemType Directory -Force "$Destino\scripts" | Out-Null
foreach ($s in @("crear-sucursal.mjs", "asegurar-admin.mjs")) {
    Copy-Item "apps\cloud-api\scripts\$s" "$Destino\scripts\$s" -Force
}
Ok "scripts de alta copiados"

Titulo "Listo"
$tamanioMB = [Math]::Round((Get-ChildItem $Destino -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host "Paquete armado en: $Destino ($tamanioMB MB)"
Write-Host "Contiene: dist/, prisma/ (schema+migraciones), node_modules/ (produccion), panel/, scripts/ (crear-sucursal.mjs, asegurar-admin.mjs)"
Write-Host "NO contiene: codigo fuente (src/, test/), .env, devDependencies, cliente Prisma generado."
Write-Host "`nPara probarlo standalone: copiar un .env, correr 'node node_modules\prisma\build\index.js generate --schema=prisma\schema.prisma', y recien ahi 'node dist\main.js' parado en $Destino."
