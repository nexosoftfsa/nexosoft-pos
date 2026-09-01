# Excluye las carpetas de NexoSoft del antivirus, y recupera lo que ya se haya
# llevado a cuarentena.
#
# POR QUE HACE FALTA
# El ejecutable del POS no esta firmado con un certificado de codigo. Un .exe
# sin firma, recien descargado y que ademas vive en AppData\Local (donde suele
# esconderse el malware), es exactamente el perfil que los antivirus marcan por
# heuristica. Paso de verdad: Defender se llevo nexosoft-pos.exe a cuarentena y
# la terminal dejo de abrir.
#
# QUE HACE Y QUE NO
# Automatiza SOLO Windows Defender: es el unico que expone una forma soportada
# de agregar exclusiones desde afuera. Si la PC tiene otro antivirus, lo detecta
# y lo nombra, pero la exclusion hay que hacerla a mano en ese producto.
#
# ESTO ABRE UN AGUJERO, Y CHICO A PROPOSITO
# Excluir una carpeta del antivirus baja la proteccion de esa carpeta. Por eso
# se excluyen unicamente las dos carpetas de NexoSoft, nunca el disco ni el
# perfil del usuario, y todo queda registrado en el log.
#
# Uso (elevado):
#   .\excluir-antivirus.ps1 -CarpetaPos "C:\Users\juan\AppData\Local\NexoSoft POS"

param(
    [string]$CarpetaPos = "",
    [string]$CarpetaServidor = "C:\NexoSoft-Servidor"
)

$ErrorActionPreference = "Stop"

# Codigos de salida. El POS los traduce a un mensaje en castellano, ver
# apps/pos-desktop/src/datos/excluir-antivirus.ts -- si se agrega o cambia uno
# hay que tocar los dos lados.
$SALIDA_SIN_ADMIN = 2
$SALIDA_SIN_DEFENDER = 4
$SALIDA_ERROR = 5

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }
function Aviso($t) { Write-Host $t -ForegroundColor Yellow }

$logDir = Join-Path $env:ProgramData "NexoSoft\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "antivirus.log") -Append | Out-Null

try {
    $identidad = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $identidad.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Aviso "Hay que correr esto como administrador."
        exit $SALIDA_SIN_ADMIN
    }

    Titulo "Carpetas a proteger"
    $carpetas = @()
    if ($CarpetaPos -ne "" -and (Test-Path $CarpetaPos)) { $carpetas += (Resolve-Path $CarpetaPos).Path }
    if (Test-Path $CarpetaServidor) { $carpetas += (Resolve-Path $CarpetaServidor).Path }
    if ($carpetas.Count -eq 0) {
        Aviso "No se encontro ninguna carpeta de NexoSoft en esta PC."
        exit $SALIDA_ERROR
    }
    $carpetas | ForEach-Object { Write-Host "  $_" }

    Titulo "Otros antivirus instalados"
    # SecurityCenter2 lista lo que Windows reconoce como antivirus registrado.
    # Es la unica forma generica de saber si hay otro producto en juego.
    $otros = @()
    try {
        $otros = @(Get-CimInstance -Namespace "root\SecurityCenter2" -ClassName AntiVirusProduct -ErrorAction Stop |
            Where-Object { $_.displayName -and $_.displayName -notmatch "Windows Defender|Microsoft Defender" })
    } catch {
        Aviso "No se pudo consultar la lista de antivirus instalados."
    }
    if ($otros.Count -gt 0) {
        Aviso "ATENCION: esta PC tiene otro antivirus y hay que excluir las carpetas A MANO ahi:"
        $otros | ForEach-Object { Aviso ("  - " + $_.displayName) }
    } else {
        Write-Host "No se detecto otro antivirus."
    }

    Titulo "Windows Defender"
    if (-not (Get-Command Add-MpPreference -ErrorAction SilentlyContinue)) {
        Aviso "Defender no esta disponible en esta PC."
        if ($otros.Count -gt 0) { Aviso "Hace la exclusion a mano en el antivirus de arriba." }
        exit $SALIDA_SIN_DEFENDER
    }

    # Add-MpPreference es idempotente: agregar dos veces la misma ruta no
    # duplica ni falla. Igual se listan las que ya estaban, para que el log
    # muestre que quedo.
    foreach ($c in $carpetas) {
        Add-MpPreference -ExclusionPath $c -ErrorAction Stop
        Ok "Excluida: $c"
    }
    # El ejecutable tambien por nombre de proceso: algunas detecciones son por
    # comportamiento del proceso y no por la ruta del archivo.
    try {
        Add-MpPreference -ExclusionProcess "nexosoft-pos.exe" -ErrorAction Stop
        Ok "Excluido el proceso nexosoft-pos.exe"
    } catch {
        Aviso ("No se pudo excluir el proceso: " + $_.Exception.Message)
    }

    Titulo "Recuperando lo que ya estaba en cuarentena"
    # Una exclusion NO devuelve lo que el antivirus ya se llevo: si el .exe
    # esta en cuarentena, la terminal sigue sin abrir hasta restaurarlo.
    $restaurados = 0
    try {
        $amenazas = @(Get-MpThreatDetection -ErrorAction SilentlyContinue)
        if ($amenazas.Count -gt 0) {
            $mpcmd = Join-Path $env:ProgramFiles "Windows Defender\MpCmdRun.exe"
            if (Test-Path $mpcmd) {
                & $mpcmd -Restore -All | Out-Null
                $restaurados = 1
                Ok "Se pidio restaurar los archivos en cuarentena."
            }
        } else {
            Write-Host "No hay nada en cuarentena."
        }
    } catch {
        Aviso ("No se pudo revisar la cuarentena: " + $_.Exception.Message)
    }

    Titulo "Listo"
    Write-Host "Exclusiones activas de NexoSoft:"
    (Get-MpPreference).ExclusionPath | Where-Object { $_ -like "*NexoSoft*" } | ForEach-Object { Write-Host "  $_" }

    if ($otros.Count -gt 0) { exit $SALIDA_SIN_DEFENDER }
    exit 0
} catch {
    Aviso ("Fallo: " + $_.Exception.Message)
    exit $SALIDA_ERROR
} finally {
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
