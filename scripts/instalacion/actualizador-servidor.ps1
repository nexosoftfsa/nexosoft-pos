# Actualizador automatico del servidor (Fase 13.E). Corre periodicamente
# como tarea programada propia ("NexoSoft Actualizador", registrada por
# bootstrap-servidor-standalone.ps1): consulta si hay una version nueva de
# "servidor-vX.Y.Z" publicada, y si la hay, la baja y la aplica sin
# intervencion humana.
#
# A diferencia de instalar/actualizar el POS (que el usuario dispara con un
# clic desde la app), esto corre solo, sin nadie mirando -- por eso, si la
# actualizacion falla el chequeo de salud, se revierte sola (vuelve a la
# version anterior) en vez de dejar el comercio sin servidor.
#
# Uso (normalmente disparado por la tarea programada, pero corre igual a mano):
#   .\actualizador-servidor.ps1 -ServidorDir "C:\NexoSoft-Servidor\dist-servidor" -NodeDir "C:\NexoSoft-Servidor\node-portable"

param(
    [string]$ServidorDir = (Join-Path $PSScriptRoot "..\..\dist-servidor"),
    [string]$NodeDir = (Join-Path $PSScriptRoot "..\..\node-portable"),
    [string]$RepoReleases = "nexosoftfsa/nexosoft-pos-releases",
    [string]$TareaCloudApi = "NexoSoft cloud-api",
    [int]$Puerto = 3000,
    [int]$RetenerBackups = 2
)

$ErrorActionPreference = "Stop"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }
function Correr([string]$Descripcion, [scriptblock]$Comando) {
    $ErrorActionPreference = "Continue"
    & $Comando
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($codigo -ne 0) { throw "$Descripcion fallo (exit $codigo)." }
}

$ServidorDir = Resolve-Path $ServidorDir -ErrorAction Stop
$NodeDir = Resolve-Path $NodeDir -ErrorAction Stop
$nodeExe = Join-Path $NodeDir "node.exe"
$raizInstalacion = Split-Path $ServidorDir -Parent
$logDir = Join-Path $raizInstalacion "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "actualizador.log") -Force | Out-Null

function EsperarSalud([int]$Intentos = 15) {
    for ($i = 0; $i -lt $Intentos; $i++) {
        Start-Sleep -Seconds 1
        try { return Invoke-RestMethod -Uri "http://localhost:$Puerto/api/v1/health" -TimeoutSec 3 } catch {}
    }
    return $null
}

try {
    Titulo "Version instalada"
    $versionPath = Join-Path $ServidorDir "VERSION"
    $versionLocal = if (Test-Path $versionPath) { (Get-Content $versionPath -Raw).Trim() } else { "0.0.0" }
    Write-Host "Version local: $versionLocal"

    Titulo "Buscando versiones nuevas en GitHub"
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$RepoReleases/releases" `
        -Headers @{ "User-Agent" = "NexoSoft-Actualizador" } -TimeoutSec 30
    $candidatos = $releases | Where-Object { $_.tag_name -like "servidor-v*" -and -not $_.draft -and -not $_.prerelease }
    if (-not $candidatos) {
        Write-Host "No hay releases de servidor publicados."
        Stop-Transcript | Out-Null
        exit 0
    }

    $masNueva = $candidatos | ForEach-Object {
        $v = $_.tag_name.Substring("servidor-v".Length)
        try { [PSCustomObject]@{ Release = $_; Version = [version]$v } } catch { $null }
    } | Where-Object { $_ } | Sort-Object Version -Descending | Select-Object -First 1

    if (-not $masNueva -or $masNueva.Version -le [version]$versionLocal) {
        Write-Host "Ya estas al dia (ultima disponible: $($masNueva.Version))."
        Stop-Transcript | Out-Null
        exit 0
    }

    $versionNueva = $masNueva.Version.ToString()
    Titulo "Hay una version nueva: $versionNueva (tenes $versionLocal)"
    $asset = $masNueva.Release.assets | Where-Object { $_.name -like "NexoSoft-Servidor-Update-*.zip" } | Select-Object -First 1
    if (-not $asset) { throw "El release servidor-v$versionNueva no tiene el asset de actualizacion (.zip)." }

    $zipDescarga = Join-Path $env:TEMP "nexosoft-actualizacion-$versionNueva.zip"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipDescarga -TimeoutSec 300 -Headers @{ "User-Agent" = "NexoSoft-Actualizador" }
    Ok "Descargado ($([Math]::Round((Get-Item $zipDescarga).Length/1MB,1)) MB)"

    Titulo "Aplicando la actualizacion"
    Stop-ScheduledTask -TaskName $TareaCloudApi -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = "$ServidorDir.bak-$timestamp"
    Rename-Item -Path $ServidorDir -NewName (Split-Path $backupDir -Leaf) -ErrorAction Stop

    $exitoso = $false
    try {
        Expand-Archive -Path $zipDescarga -DestinationPath $ServidorDir -Force
        # El .env es especifico de esta PC (DATABASE_URL con la password real,
        # secretos JWT) -- no viaja en el paquete de actualizacion, se
        # conserva el de la instalacion anterior.
        Copy-Item (Join-Path $backupDir ".env") (Join-Path $ServidorDir ".env") -Force

        Push-Location $ServidorDir
        Correr "prisma generate" { & $nodeExe "node_modules\prisma\build\index.js" generate --schema=prisma\schema.prisma }
        Correr "prisma migrate deploy" { & $nodeExe "node_modules\prisma\build\index.js" migrate deploy --schema=prisma\schema.prisma }
        Pop-Location

        & (Join-Path $PSScriptRoot "instalar-servicio-servidor.ps1") -CloudApiDir $ServidorDir -NodeExe $nodeExe
        Start-ScheduledTask -TaskName $TareaCloudApi -ErrorAction Stop

        $salud = EsperarSalud
        if (-not $salud -or $salud.status -ne "ok") {
            throw "El servidor no respondio bien despues de actualizar (status: $($salud.status))."
        }
        $exitoso = $true
        Ok "Actualizado a $versionNueva y respondiendo bien"

        # Los scripts de <raiz>\scripts los escribia SOLO el instalador
        # completo, asi que una PC que se actualiza con el boton nunca recibia
        # uno nuevo. Ahora viajan en el paquete y se copian aca.
        #
        # Best-effort y archivo por archivo: este mismo script vive en esa
        # carpeta y puede estar tomado por PowerShell mientras corre. Si uno
        # falla, se copia en la proxima actualizacion; que no se copie un
        # script no justifica revertir un servidor que ya quedo funcionando.
        $scriptsNuevos = Join-Path $ServidorDir "scripts-instalacion"
        if (Test-Path $scriptsNuevos) {
            $scriptsDestino = Join-Path $raizInstalacion "scripts"
            New-Item -ItemType Directory -Force -Path $scriptsDestino | Out-Null
            $copiados = 0
            foreach ($s in Get-ChildItem $scriptsNuevos -File) {
                try {
                    Copy-Item $s.FullName $scriptsDestino -Force -ErrorAction Stop
                    $copiados += 1
                } catch {
                    Write-Host "No se pudo actualizar $($s.Name) (en uso). Se reintenta en la proxima." -ForegroundColor Yellow
                }
            }
            Ok "$copiados scripts de instalacion actualizados"
        }
    } catch {
        Titulo "Algo fallo -- revirtiendo a $versionLocal"
        Write-Host $_.Exception.Message -ForegroundColor Yellow
        Stop-ScheduledTask -TaskName $TareaCloudApi -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Remove-Item $ServidorDir -Recurse -Force -ErrorAction SilentlyContinue
        Rename-Item -Path $backupDir -NewName (Split-Path $ServidorDir -Leaf) -ErrorAction Stop
        & (Join-Path $PSScriptRoot "instalar-servicio-servidor.ps1") -CloudApiDir $ServidorDir -NodeExe $nodeExe
        Start-ScheduledTask -TaskName $TareaCloudApi -ErrorAction Stop
        $saludRollback = EsperarSalud
        if ($saludRollback -and $saludRollback.status -eq "ok") {
            Write-Host "Reversion OK: sigue en $versionLocal, funcionando." -ForegroundColor Yellow
        } else {
            Write-Error "La reversion tampoco respondio bien. Revisar a mano en $raizInstalacion."
        }
    }

    if ($exitoso) {
        Titulo "Limpiando backups viejos (conservando los ultimos $RetenerBackups)"
        Get-ChildItem -Path $raizInstalacion -Directory -Filter "dist-servidor.bak-*" |
            Sort-Object Name -Descending | Select-Object -Skip $RetenerBackups |
            ForEach-Object {
                Write-Host "Borrando $($_.Name)"
                Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
    }
    Remove-Item $zipDescarga -Force -ErrorAction SilentlyContinue
} finally {
    Stop-Transcript | Out-Null
}
