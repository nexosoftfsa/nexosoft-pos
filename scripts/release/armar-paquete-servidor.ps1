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
# El cliente de Prisma generado (`prisma generate`) no se re-genera en el
# destino -- se copia el que ya existe en el repo, porque el schema es el
# mismo y evita depender de tener el CLI de Prisma en el paquete final.
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
Correr "pnpm deploy" { corepack pnpm --filter @nexosoft/cloud-api deploy --prod "$Destino" }
Ok "dependencias de produccion instaladas"

Titulo "Copiando cliente Prisma ya generado"
$origenPrisma = Get-ChildItem "$raiz\node_modules\.pnpm" -Directory -Filter "@prisma+client@*" | Select-Object -First 1
$destinoPrisma = Get-ChildItem "$Destino\node_modules\.pnpm" -Directory -Filter "@prisma+client@*" | Select-Object -First 1
if (-not $origenPrisma -or -not $destinoPrisma) {
    Write-Error "No encontre la carpeta de @prisma/client para copiar el cliente generado. Corre 'pnpm --filter @nexosoft/cloud-api prisma:generate' primero."
    exit 1
}
Copy-Item "$($origenPrisma.FullName)\node_modules\.prisma" "$($destinoPrisma.FullName)\node_modules\.prisma" -Recurse -Force
Ok "cliente Prisma copiado"

Titulo "Copiando panel compilado"
New-Item -ItemType Directory -Force "$Destino\panel" | Out-Null
Copy-Item "apps\admin-web\dist\*" "$Destino\panel" -Recurse -Force
Ok "panel copiado"

Titulo "Copiando script de alta de sucursal"
New-Item -ItemType Directory -Force "$Destino\scripts" | Out-Null
Copy-Item "apps\cloud-api\scripts\crear-sucursal.mjs" "$Destino\scripts\crear-sucursal.mjs" -Force
Ok "script de alta copiado"

Titulo "Listo"
$tamanioMB = [Math]::Round((Get-ChildItem $Destino -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host "Paquete armado en: $Destino ($tamanioMB MB)"
Write-Host "Contiene: dist/, prisma/ (schema+migraciones), node_modules/ (produccion), panel/, scripts/crear-sucursal.mjs"
Write-Host "NO contiene: codigo fuente (src/, test/), .env, devDependencies."
Write-Host "`nPara probarlo standalone: copiar un .env a `"$Destino\.env`" y correr 'node dist\main.js' parado ahi."
