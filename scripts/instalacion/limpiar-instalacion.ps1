# Borra TODO rastro de NexoSoft de esta PC, para poder simular la instalación
# de un cliente nuevo.
#
# Por qué hace falta un script y no alcanza con desinstalar: el desinstalador
# saca C:\NexoSoft-Servidor pero deja a propósito C:\ProgramData\NexoSoft, que
# es donde viven los datos del comercio (la base de PostgreSQL, los
# certificados de ARCA, los respaldos). Eso está bien para un cliente real —
# sus datos no se tocan— pero significa que reinstalar encima NO es una
# instalación limpia: el bootstrap encuentra el cluster, lo reusa, y el
# comercio "nuevo" arranca con la sucursal, los artículos y las ventas del
# anterior. Tampoco se dan de baja las tareas programadas, que quedan
# apuntando a carpetas que ya no existen.
#
# ESTO BORRA DATOS Y NO SE PUEDE DESHACER. Por eso exige -SiEstoySeguro y por
# eso, salvo que se pida lo contrario, deja un respaldo antes de borrar.
#
# Uso (PowerShell como administrador):
#   .\limpiar-instalacion.ps1 -SiEstoySeguro
#   .\limpiar-instalacion.ps1 -SiEstoySeguro -SinRespaldo

param(
    [string]$RaizInstalacion = "C:\NexoSoft-Servidor",
    [string]$RaizDatos = "C:\ProgramData\NexoSoft",
    [string]$CarpetaRespaldo = "$env:USERPROFILE\Desktop",
    [switch]$SiEstoySeguro,
    [switch]$SinRespaldo
)

$ErrorActionPreference = "Stop"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }
function Aviso($t) { Write-Host $t -ForegroundColor Yellow }

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $esAdmin) {
    Write-Host "ERROR: corre esto como Administrador." -ForegroundColor Red
    exit 1
}

# Red de seguridad. Este script borra carpetas enteras, así que antes de tocar
# nada verifica que la carpeta EXISTENTE tenga adentro lo que tendría una
# instalación nuestra.
#
# El primer intento miraba si la ruta contenía la palabra "NexoSoft", y en la
# propia prueba borró una carpeta ajena: estaba dentro de un directorio que
# tenía "Nexosoft" en el nombre, unos niveles más arriba. Un nombre de carpeta
# no prueba nada; el contenido sí.
function TieneAlgunaDe([string]$ruta, [string[]]$marcas) {
    foreach ($m in $marcas) { if (Test-Path (Join-Path $ruta $m)) { return $true } }
    return $false
}

$MARCAS = @{
    $RaizInstalacion = @("dist-servidor", "node-portable", "postgres-portable")
    $RaizDatos       = @("postgres-data", "postgres-superuser.txt", "logs", "secrets")
}
foreach ($ruta in @($RaizInstalacion, $RaizDatos)) {
    if ($ruta -match '^[A-Za-z]:\\?$') {
        Write-Host "ERROR: '$ruta' es la raiz de un disco. No borro nada." -ForegroundColor Red
        exit 1
    }
    # Que no exista está bien: no hay nada que borrar ahí.
    if (-not (Test-Path $ruta)) { continue }
    if (-not (TieneAlgunaDe $ruta $MARCAS[$ruta])) {
        Write-Host "ERROR: '$ruta' existe pero no tiene adentro nada de NexoSoft." -ForegroundColor Red
        Write-Host "       Esperaba encontrar alguna de: $($MARCAS[$ruta] -join ', ')" -ForegroundColor Red
        Write-Host "       No borro nada." -ForegroundColor Red
        exit 1
    }
}

Titulo "Lo que se va a borrar"
Write-Host "  $RaizInstalacion   (programa)"
Write-Host "  $RaizDatos   (base de datos, certificados de ARCA, respaldos)"
Write-Host "  Tareas programadas: NexoSoft cloud-api, NexoSoft PostgreSQL, NexoSoft Actualizador"
Write-Host ""
Aviso "Se pierden las ventas, los articulos, los usuarios y el certificado de ARCA."
Aviso "Si el certificado de ARCA ya estaba cargado, hay que rehacer el tramite."

if (-not $SiEstoySeguro) {
    Write-Host ""
    Write-Host "No se borro nada. Para hacerlo de verdad, volve a correrlo con -SiEstoySeguro" -ForegroundColor Red
    exit 2
}

# --- Respaldo ----------------------------------------------------------------
if (-not $SinRespaldo -and (Test-Path $RaizDatos)) {
    Titulo "Respaldo antes de borrar"
    $zip = Join-Path $CarpetaRespaldo ("nexosoft-antes-de-limpiar-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".zip")
    try {
        # -Force en el destino, no en el origen: comprimir una base en uso
        # puede fallar, y si falla NO se sigue adelante a ciegas.
        Compress-Archive -Path (Join-Path $RaizDatos "*") -DestinationPath $zip -Force -ErrorAction Stop
        Ok "Respaldo: $zip"
    } catch {
        Write-Host "ERROR: no se pudo respaldar ($($_.Exception.Message))." -ForegroundColor Red
        Write-Host "No borro nada. Si igual queres seguir, corre con -SinRespaldo." -ForegroundColor Red
        exit 1
    }
}

# --- Detener -----------------------------------------------------------------
Titulo "Deteniendo el servidor"
$detener = Join-Path $PSScriptRoot "detener-servidor.ps1"
if (Test-Path $detener) {
    & $detener -RaizInstalacion $RaizInstalacion -RaizDatos $RaizDatos
} else {
    Aviso "No esta detener-servidor.ps1; se paran las tareas nomas."
    foreach ($t in @("NexoSoft cloud-api", "NexoSoft Actualizador", "NexoSoft PostgreSQL")) {
        Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 3
}

# --- Tareas ------------------------------------------------------------------
Titulo "Dando de baja las tareas programadas"
foreach ($t in @("NexoSoft cloud-api", "NexoSoft PostgreSQL", "NexoSoft Actualizador")) {
    try {
        Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction Stop
        Ok "Baja: $t"
    } catch {
        Write-Host "  (no existia: $t)"
    }
}

# --- Carpetas ----------------------------------------------------------------
Titulo "Borrando carpetas"
foreach ($ruta in @($RaizInstalacion, $RaizDatos)) {
    if (-not (Test-Path $ruta)) { Write-Host "  (no existia: $ruta)"; continue }
    try {
        Remove-Item -LiteralPath $ruta -Recurse -Force -ErrorAction Stop
        Ok "Borrada: $ruta"
    } catch {
        Write-Host "ERROR: no se pudo borrar $ruta ($($_.Exception.Message))." -ForegroundColor Red
        Write-Host "Suele ser un proceso todavia vivo. Reinicia la PC y corre esto de nuevo." -ForegroundColor Red
        exit 1
    }
}

# --- POS ---------------------------------------------------------------------
# El POS guarda SU propia base (sesion, terminal elegida, configuracion del
# comercio y la cola de ventas por sincronizar). Borrar el servidor y dejarla
# no simula un cliente nuevo: simula un cliente al que le reinstalaron el
# servidor por atras. Y rompe de una forma fea -- la terminal guardada ya no
# existe del otro lado, no se puede abrir la caja, y toda la cola pendiente
# rebota contra datos que ya no estan.
Titulo "Base local del POS"
$carpetasPos = @(
    (Join-Path $env:APPDATA "ar.nexosoft.pos"),
    (Join-Path $env:LOCALAPPDATA "ar.nexosoft.pos")
)
$encontradas = @($carpetasPos | Where-Object { Test-Path $_ })
if ($encontradas.Count -eq 0) {
    Write-Host "  (no hay base local del POS en este usuario de Windows)"
    Aviso "  OJO: si el POS lo usa otro usuario de Windows, corre esto tambien con SU sesion."
} else {
    foreach ($c in $encontradas) {
        if (Get-Process -Name "NexoSoft POS" -ErrorAction SilentlyContinue) {
            Write-Host "ERROR: el POS esta abierto. Cerralo y volve a correr esto." -ForegroundColor Red
            exit 1
        }
        try {
            Remove-Item -LiteralPath $c -Recurse -Force -ErrorAction Stop
            Ok "Borrada: $c"
        } catch {
            Write-Host "ERROR: no se pudo borrar $c ($($_.Exception.Message))." -ForegroundColor Red
            exit 1
        }
    }
    Aviso "El POS va a arrancar sin configurar: hay que cargarle de nuevo la direccion"
    Aviso "del servidor, los datos del comercio y el logo."
}

Titulo "Listo"
Write-Host "La PC quedo como si NexoSoft nunca hubiera estado instalado."
Write-Host "Ahora si, correr el instalador simula un cliente nuevo de verdad."
