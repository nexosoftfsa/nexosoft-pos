# Actualiza el servidor de sucursal (cloud-api + panel web) a la ultima
# version del codigo: respalda la base, trae el codigo nuevo, migra,
# compila, y reinicia la tarea programada. Corre elevado (Administrador)
# porque reiniciar la tarea programada del servidor lo requiere.
#
# Lo dispara el boton "Actualizar servidor" del POS (Configuracion >
# Actualizaciones), visible solo en la terminal que ademas es el servidor
# (ver apps/pos-desktop/src/datos/actualizar-servidor.ts). Tambien se puede
# correr a mano, parado en la raiz del repo o desde cualquier lado (se
# autolocaliza con $PSScriptRoot):
#   .\scripts\actualizacion\actualizar-servidor.ps1
#
# Asume la convencion de instalacion documentada en
# docs/instalacion-primer-cliente.md: repo clonado en C:\NexoSoft.

$ErrorActionPreference = "Stop"

$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $raiz

$logDir = Join-Path $raiz "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir "actualizacion-servidor-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
Start-Transcript -Path $logPath | Out-Null

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

try {
    Titulo "Verificando el estado del repo"
    $sucio = git status --porcelain
    if ($sucio) {
        throw "El repo tiene cambios sin commitear. Aborto para no pisar nada:`n$sucio"
    }

    $cloudApiDir = Join-Path $raiz "apps\cloud-api"
    $envPath = Join-Path $cloudApiDir ".env"
    if (-not (Test-Path $envPath)) { throw "No encontre $envPath" }

    Titulo "Respaldo de la base antes de migrar"
    $dbUrlLinea = (Get-Content $envPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1)
    $dbUrl = $dbUrlLinea -replace '^DATABASE_URL=', ''
    $respaldoDir = Join-Path $raiz "respaldos\pre-actualizacion"
    New-Item -ItemType Directory -Force -Path $respaldoDir | Out-Null
    $respaldoPath = Join-Path $respaldoDir "pre-actualizacion-$(Get-Date -Format 'yyyyMMdd-HHmmss').sql"
    $pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($pgDump -and $dbUrl) {
        & $pgDump.Source $dbUrl -f $respaldoPath
        if ($LASTEXITCODE -ne 0) { throw "pg_dump fallo (exit $LASTEXITCODE) -- no sigo sin poder respaldar." }
        Write-Host "Respaldo SQL en: $respaldoPath"
    } else {
        Write-Warning "pg_dump no disponible o DATABASE_URL vacio -- sigo sin respaldo SQL adicional (queda el respaldo periodico de la app si RESPALDO_CRON esta configurado, ver ADR-0020)."
    }

    Titulo "Trayendo el codigo nuevo"
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "git pull fallo (exit $LASTEXITCODE)" }

    Titulo "Instalando dependencias"
    corepack pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install fallo (exit $LASTEXITCODE)" }

    Titulo "Generando Prisma Client"
    corepack pnpm --filter @nexosoft/cloud-api prisma:generate
    if ($LASTEXITCODE -ne 0) { throw "prisma generate fallo (exit $LASTEXITCODE)" }

    Titulo "Migrando la base de datos"
    corepack pnpm --filter @nexosoft/cloud-api exec prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        throw "prisma migrate deploy fallo (exit $LASTEXITCODE) -- la base puede haber quedado a mitad de migrar. Si hace falta, restaurar desde $respaldoPath."
    }

    Titulo "Compilando el servidor"
    corepack pnpm --filter @nexosoft/cloud-api build
    if ($LASTEXITCODE -ne 0) { throw "build de cloud-api fallo (exit $LASTEXITCODE)" }

    Titulo "Compilando el panel web"
    Push-Location (Join-Path $raiz "apps\admin-web")
    $env:VITE_API_URL = "/api/v1"
    corepack pnpm build
    $codigoAdminWeb = $LASTEXITCODE
    Pop-Location
    if ($codigoAdminWeb -ne 0) { throw "build de admin-web fallo (exit $codigoAdminWeb)" }
    Copy-Item (Join-Path $raiz "apps\admin-web\dist\*") (Join-Path $cloudApiDir "panel") -Recurse -Force

    Titulo "Reiniciando el servidor"
    $tarea = "NexoSoft cloud-api"
    Stop-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName $tarea

    Titulo "Verificando que responda"
    $ok = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 2
        try {
            $r = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/health" -TimeoutSec 3
            if ($r.status -eq "ok") { $ok = $true; break }
        } catch {}
    }
    if (-not $ok) {
        throw "El servidor no respondio 'ok' en /health despues de reiniciar. Revisa 'Get-ScheduledTask -TaskName ''$tarea'' | Get-ScheduledTaskInfo' y este log."
    }

    Titulo "Listo"
    Write-Host "Servidor actualizado y respondiendo OK."
    Stop-Transcript | Out-Null
    exit 0
} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Stop-Transcript | Out-Null
    exit 1
}
