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

# Codigos de salida. Cada uno corresponde a una accion distinta de quien esta
# adelante de la maquina, y el POS los traduce a un mensaje en castellano
# (apps/pos-desktop/src/datos/actualizar-servidor.ts) -- si se agrega o cambia
# uno hay que tocar los dos lados.
$SALIDA_CARPETA_TOMADA = 4    # no se pudo apartar dist-servidor; NADA cambio
$SALIDA_SERVIDOR_CAIDO = 5    # fallo y la reversion tambien: hay que ir a la PC
$SALIDA_SIN_RED = 6           # no se pudo consultar/bajar el paquete
$SALIDA_INSTALACION_ROTA = 7  # falta dist-servidor
$SALIDA_REVERTIDA = 8         # fallo, pero quedo andando la version anterior

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }
function Aviso($t) { Write-Host $t -ForegroundColor Yellow }
function Correr([string]$Descripcion, [scriptblock]$Comando) {
    $ErrorActionPreference = "Continue"
    & $Comando
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($codigo -ne 0) { throw ($Descripcion + " fallo (exit " + $codigo + ").") }
}

# El log se abre lo antes posible: hasta que el transcript no esta andando, un
# error no queda registrado en ningun lado y del otro lado solo se ve un
# numero. Por eso la raiz se deduce del padre de -ServidorDir (que existe
# aunque dist-servidor no) antes de validar nada mas.
$raizInstalacion = (Resolve-Path (Split-Path $ServidorDir -Parent) -ErrorAction Stop).Path
$logDir = Join-Path $raizInstalacion "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "actualizador.log") -Force | Out-Null

# Trae TODOS los releases "servidor-v*", recorriendo las paginas de la API.
#
# Esto fue un bug caro: la API devuelve 30 releases por pagina y no los ordena
# por fecha de publicacion. Como el POS y el servidor comparten repo de
# releases, apenas el POS paso los 30 tags (v0.1.30) todos los "servidor-v*"
# quedaron fuera de la primera pagina. El actualizador entonces contestaba "no
# hay releases de servidor publicados" y se iba en silencio: la tarea nocturna
# dejo de actualizar a TODOS los comercios sin avisar, y una PC quedo clavada
# en 0.9.1 habiendo 0.9.2 publicada hacia horas.
function BuscarReleasesDeServidor([int]$PaginasMaximas = 10) {
    $encontrados = @()
    for ($pagina = 1; $pagina -le $PaginasMaximas; $pagina++) {
        # Ojo con envolver la llamada en @(...) directamente: Invoke-RestMethod
        # emite el array JSON como UN solo objeto, asi que @(Invoke-RestMethod)
        # da una lista de un elemento que contiene la lista. Primero se asigna
        # y despues se normaliza.
        $respuesta = Invoke-RestMethod -Uri "https://api.github.com/repos/$RepoReleases/releases?per_page=100&page=$pagina" `
            -Headers @{ "User-Agent" = "NexoSoft-Actualizador" } -TimeoutSec 30
        $tanda = @($respuesta)
        if ($tanda.Count -eq 0) { break }
        $encontrados += @($tanda | Where-Object { $_.tag_name -like "servidor-v*" -and -not $_.draft -and -not $_.prerelease })
        if ($tanda.Count -lt 100) { break }
    }
    return $encontrados
}

function EsperarSalud([int]$Intentos = 40) {
    # Un arranque en frio de Nest + Prisma en una PC de comercio tarda bastante
    # mas que en una de desarrollo. Ser impaciente aca sale caro: se revierte
    # una actualizacion que estaba perfecta solo porque tardo en levantar.
    for ($i = 0; $i -lt $Intentos; $i++) {
        Start-Sleep -Seconds 1
        try { return Invoke-RestMethod -Uri "http://localhost:$Puerto/api/v1/health" -TimeoutSec 3 } catch {}
    }
    return $null
}

# Devuelve los node.exe que esten corriendo desde ESTA instalacion (el node
# portable vive adentro de la raiz). Filtrar por ruta y no por nombre evita
# matar un node ajeno que la persona tenga abierto por otra cosa.
function NodesDeLaInstalacion {
    return @(Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
        $ruta = $null
        try { $ruta = $_.Path } catch { $ruta = $null }
        $ruta -and $ruta.StartsWith($raizInstalacion, [System.StringComparison]::OrdinalIgnoreCase)
    })
}

# Detiene el servidor de verdad, no solo la tarea programada. Stop-ScheduledTask
# le avisa al programador de tareas y vuelve enseguida, pero el node.exe puede
# seguir vivo unos segundos -- y si alguien levanto el servidor a mano, no hay
# ninguna tarea que parar y el proceso queda igual. Mientras ese proceso viva
# tiene tomada dist-servidor (es su working directory) y la carpeta no se puede
# ni renombrar ni borrar: ahi es donde la actualizacion moria con un error
# generico.
function DetenerServidor([int]$Segundos = 20) {
    Stop-ScheduledTask -TaskName $TareaCloudApi -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt $Segundos; $i++) {
        $vivos = NodesDeLaInstalacion
        if ($vivos.Count -eq 0) { return $true }
        # Primero se le da tiempo a que cierre solo; recien despues se lo baja
        # a la fuerza.
        if ($i -ge 5) { $vivos | Stop-Process -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 1
    }
    return $false
}

# Windows suelta los handles con retraso (antivirus, indexador, un explorador
# parado en la carpeta), asi que un solo intento no alcanza.
function RenombrarConReintento([string]$Origen, [string]$NombreNuevo, [int]$Intentos = 5) {
    for ($i = 0; $i -lt $Intentos; $i++) {
        try {
            Rename-Item -Path $Origen -NewName $NombreNuevo -ErrorAction Stop
            return $true
        } catch {
            if ($i -eq ($Intentos - 1)) { Aviso $_.Exception.Message }
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

$codigoSalida = 0
try {
    if (-not (Test-Path $ServidorDir)) {
        $sobrantes = @(Get-ChildItem -Path $raizInstalacion -Directory -Filter "dist-servidor.bak-*" -ErrorAction SilentlyContinue)
        Aviso "No existe $ServidorDir."
        if ($sobrantes.Count -gt 0) {
            Aviso "Hay copias de seguridad de una actualizacion que quedo por la mitad:"
            $sobrantes | ForEach-Object { Aviso ("  " + $_.Name) }
            Aviso "Renombra la mas nueva a 'dist-servidor' y arranca la tarea 'NexoSoft cloud-api'."
        }
        exit $SALIDA_INSTALACION_ROTA
    }
    $ServidorDir = (Resolve-Path $ServidorDir -ErrorAction Stop).Path
    $NodeDir = (Resolve-Path $NodeDir -ErrorAction Stop).Path
    $nodeExe = Join-Path $NodeDir "node.exe"

    Titulo "Version instalada"
    $versionPath = Join-Path $ServidorDir "VERSION"
    $versionLocal = if (Test-Path $versionPath) { (Get-Content $versionPath -Raw).Trim() } else { "0.0.0" }
    Write-Host "Version local: $versionLocal"

    Titulo "Buscando versiones nuevas en GitHub"
    try {
        $candidatos = @(BuscarReleasesDeServidor)
    } catch {
        Aviso ("No se pudo consultar GitHub: " + $_.Exception.Message)
        exit $SALIDA_SIN_RED
    }
    if ($candidatos.Count -eq 0) {
        Write-Host "No hay releases de servidor publicados."
        exit 0
    }

    $masNueva = $candidatos | ForEach-Object {
        $v = $_.tag_name.Substring("servidor-v".Length)
        try { [PSCustomObject]@{ Release = $_; Version = [version]$v } } catch { $null }
    } | Where-Object { $_ } | Sort-Object Version -Descending | Select-Object -First 1

    if (-not $masNueva -or $masNueva.Version -le [version]$versionLocal) {
        Write-Host "Ya estas al dia (ultima disponible: $($masNueva.Version))."
        exit 0
    }

    $versionNueva = $masNueva.Version.ToString()
    Titulo "Hay una version nueva: $versionNueva (tenes $versionLocal)"
    $asset = $masNueva.Release.assets | Where-Object { $_.name -like "NexoSoft-Servidor-Update-*.zip" } | Select-Object -First 1
    if (-not $asset) { throw "El release servidor-v$versionNueva no tiene el asset de actualizacion (.zip)." }

    $zipDescarga = Join-Path $env:TEMP "nexosoft-actualizacion-$versionNueva.zip"
    try {
        # Son mas de 100 MB: en una conexion de comercio esto tarda, y cortar
        # por impaciencia deja la PC sin actualizar sin decir por que.
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipDescarga -TimeoutSec 1800 -Headers @{ "User-Agent" = "NexoSoft-Actualizador" }
    } catch {
        Aviso ("No se pudo bajar el paquete: " + $_.Exception.Message)
        Remove-Item $zipDescarga -Force -ErrorAction SilentlyContinue
        exit $SALIDA_SIN_RED
    }
    Ok "Descargado ($([Math]::Round((Get-Item $zipDescarga).Length/1MB,1)) MB)"

    Titulo "Aplicando la actualizacion"
    if (-not (DetenerServidor)) {
        Aviso "El servidor sigue corriendo y no se pudo cerrar. No se toca nada: sigue funcionando en $versionLocal."
        Remove-Item $zipDescarga -Force -ErrorAction SilentlyContinue
        exit $SALIDA_CARPETA_TOMADA
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = "$ServidorDir.bak-$timestamp"
    if (-not (RenombrarConReintento $ServidorDir (Split-Path $backupDir -Leaf))) {
        Aviso "No se pudo apartar la carpeta del servidor: algo la tiene tomada (un explorador de archivos abierto ahi, el antivirus, una consola)."
        Aviso "No se cambio nada. Se vuelve a arrancar el servidor en $versionLocal."
        Start-ScheduledTask -TaskName $TareaCloudApi -ErrorAction SilentlyContinue
        Remove-Item $zipDescarga -Force -ErrorAction SilentlyContinue
        exit $SALIDA_CARPETA_TOMADA
    }

    $exitoso = $false
    try {
        Expand-Archive -Path $zipDescarga -DestinationPath $ServidorDir -Force
        # El .env es especifico de esta PC (DATABASE_URL con la password real,
        # secretos JWT) -- no viaja en el paquete de actualizacion, se
        # conserva el de la instalacion anterior.
        Copy-Item (Join-Path $backupDir ".env") (Join-Path $ServidorDir ".env") -Force

        Push-Location $ServidorDir
        try {
            Correr "prisma generate" { & $nodeExe "node_modules\prisma\build\index.js" generate --schema=prisma\schema.prisma }
            Correr "prisma migrate deploy" { & $nodeExe "node_modules\prisma\build\index.js" migrate deploy --schema=prisma\schema.prisma }
        } finally {
            Pop-Location
        }

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
                    Aviso "No se pudo actualizar $($s.Name) (en uso). Se reintenta en la proxima."
                }
            }
            Ok "$copiados scripts de instalacion actualizados"
        }
    } catch {
        Titulo "Algo fallo -- revirtiendo a $versionLocal"
        Aviso $_.Exception.Message
        $codigoSalida = $SALIDA_REVERTIDA
        DetenerServidor | Out-Null
        Remove-Item $ServidorDir -Recurse -Force -ErrorAction SilentlyContinue
        if (-not (RenombrarConReintento $backupDir (Split-Path $ServidorDir -Leaf))) {
            Write-Error "No se pudo restaurar la version anterior. El servidor esta CAIDO. Revisar a mano en $raizInstalacion." -ErrorAction Continue
            exit $SALIDA_SERVIDOR_CAIDO
        }
        & (Join-Path $PSScriptRoot "instalar-servicio-servidor.ps1") -CloudApiDir $ServidorDir -NodeExe $nodeExe
        Start-ScheduledTask -TaskName $TareaCloudApi -ErrorAction SilentlyContinue
        $saludRollback = EsperarSalud
        if ($saludRollback -and $saludRollback.status -eq "ok") {
            Aviso "Reversion OK: sigue en $versionLocal, funcionando."
        } else {
            Write-Error "La reversion tampoco respondio bien. Revisar a mano en $raizInstalacion." -ErrorAction Continue
            exit $SALIDA_SERVIDOR_CAIDO
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
    exit $codigoSalida
} catch {
    # Sin este catch, cualquier error inesperado salia como un "codigo 1" pelado
    # y el motivo quedaba solo adentro del log. Ahora al menos se nombra.
    Titulo "La actualizacion no se pudo completar"
    Aviso $_.Exception.Message
    exit 1
} finally {
    # Un solo Stop-Transcript, y aca. Cuando ademas se llamaba antes de cada
    # `exit 0`, el de este finally fallaba con "el host no esta transcribiendo"
    # y -- por $ErrorActionPreference = "Stop" -- convertia un chequeo exitoso
    # en exit 1: el POS mostraba "el script termino con error" cuando en
    # realidad estaba todo al dia.
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
