# Alta completa de un comercio, en un solo comando (Fase 17.B, ADR-0056).
#
# Reemplaza a generar-codigo-acceso-remoto.ps1, que solo hacia la parte del
# tunel. Tenerlo separado era una falla SILENCIOSA: si uno se olvidaba de
# atar la suscripcion, el comercio quedaba sin control y nadie se enteraba --
# el sistema andaba perfecto y recien se descubria el dia que se queria
# bloquear y no pasaba nada.
#
# Este script hace, de una:
#   1. Da de alta el comercio en el panel de clientes.
#   2. Si se pide, crea su tunel y el subdominio del comercio.
#   3. Emite UN SOLO codigo con todo adentro, para pegar en el POS.
#
# El acceso remoto es OPCIONAL: sin -ConAccesoRemoto sale un codigo que solo
# ata la suscripcion. La suscripcion, en cambio, va siempre.
#
# Requisitos: el token del panel en %USERPROFILE%\.nexosoft\panel-admin-token.txt
# y, solo si se usa -ConAccesoRemoto, haber corrido una vez:
#   cloudflared tunnel login
#
# Uso:
#   .\scripts\release\generar-codigo-cliente.ps1 -ComercioId lagus -Nombre "Lagus Minimarket" -Plan PLUS -ConAccesoRemoto
#   .\scripts\release\generar-codigo-cliente.ps1 -ComercioId kiosco -Nombre "Kiosco 24hs" -Plan BASICA -Precio 50

param(
    # Identificador del comercio: minusculas, sin espacios. Es tambien el
    # subdominio si se pide acceso remoto.
    [Parameter(Mandatory = $true)][string]$ComercioId,
    [Parameter(Mandatory = $true)][string]$Nombre,
    # Plan contratado (ADR-0067). Es OBLIGATORIO a proposito: si tuviera un
    # valor por defecto, un alta apurada dejaria al comercio en un plan que
    # nadie eligio, y nos enterariamos el dia que reclame una funcion que
    # pago. Mismo criterio que hizo juntar la suscripcion y el tunel acá.
    [Parameter(Mandatory = $true)][ValidateSet("BASICA", "PLUS", "PREMIUM")][string]$Plan,
    # Lo acordado por mes. Se registra en el panel, no se cobra solo.
    # Importe en texto decimal, nunca con coma: 50, 85, 62000.50
    [ValidatePattern('^\d{1,9}(\.\d{1,2})?$')][string]$Precio,
    [ValidateSet("USD", "ARS")][string]$Moneda = "USD",
    # Fecha del proximo pago (YYYY-MM-DD). Por defecto, un mes desde hoy.
    [string]$VencePagoEl,
    # Crea ademas el tunel para ver el panel de reportes desde afuera.
    [switch]$ConAccesoRemoto,
    [string]$Dominio = "nexosoft.com.ar",
    [string]$UrlPanel = "https://admin.nexosoft.com.ar",
    [string]$CloudflaredExe,
    [string]$CredencialesDir,
    [switch]$PisarDns
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $CredencialesDir) { $CredencialesDir = Join-Path $env:USERPROFILE ".cloudflared" }

function Titulo([string]$t) {
    Write-Host ""
    Write-Host ("=== " + $t + " ===") -ForegroundColor Cyan
}
function Ok([string]$t) {
    Write-Host ("OK: " + $t) -ForegroundColor Green
}

$comercio = $ComercioId.Trim().ToLowerInvariant()
if ($comercio -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$') {
    Write-Error "El id del comercio solo admite letras, numeros y guiones, sin espacios ni puntos"
    exit 1
}
if (-not $VencePagoEl) { $VencePagoEl = (Get-Date).AddMonths(1).ToString("yyyy-MM-dd") }

$archivoToken = Join-Path $env:USERPROFILE ".nexosoft\panel-admin-token.txt"
if (-not (Test-Path $archivoToken)) {
    Write-Error ("Falta el token del panel. Se esperaba en: " + $archivoToken)
    exit 1
}
$token = (Get-Content $archivoToken -Raw).Trim()

# --- 1. Alta en el panel de clientes ---------------------------------------

Titulo "Alta en el panel de clientes"
$alta = @{ comercioId = $comercio; nombre = $Nombre; vencePagoEl = $VencePagoEl; plan = $Plan }
if ($Precio) { $alta.precioMensual = @{ moneda = $Moneda; importe = $Precio } }
$cuerpo = $alta | ConvertTo-Json -Compress
try {
    $cliente = Invoke-RestMethod -Uri ($UrlPanel + "/api/clientes") -Method Post `
        -Headers @{ Authorization = ("Bearer " + $token) } -ContentType "application/json" `
        -Body $cuerpo -TimeoutSec 30
} catch {
    Write-Error ("No se pudo dar de alta el comercio en el panel: " + $_.Exception.Message)
    exit 1
}
$linea = $cliente.nombre + " - plan " + $cliente.plan + ", estado " + $cliente.estado +
    ", proximo pago " + $cliente.vencePagoEl
if ($cliente.precioMensual) {
    $linea += ", " + $cliente.precioMensual.moneda + " " + $cliente.precioMensual.importe + " por mes"
} else {
    $linea += ", sin precio cargado"
}
Ok $linea

# --- 2. Tunel de acceso remoto (opcional) ----------------------------------

# cloudflared escribe TODOS sus logs por stderr, incluso los informativos, asi
# que no se redirige nada: en PowerShell 5.1 eso los convertiria en errores
# rojos. Se valida con el codigo de salida, que es lo confiable.
function CorrerCloudflared([string]$Exe, [string]$Descripcion, [string[]]$Argumentos) {
    $ErrorActionPreference = "Continue"
    & $Exe @Argumentos
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($codigo -ne 0) {
        Write-Error ($Descripcion + " fallo con codigo " + $codigo)
        exit 1
    }
}

function IdDelTunel([string]$Exe, [string]$NombreTunel) {
    $ErrorActionPreference = "Continue"
    $json = & $Exe tunnel list --name $NombreTunel --output json 2>$null | Out-String
    $ErrorActionPreference = "Stop"
    try {
        $lista = $json | ConvertFrom-Json
    } catch {
        return $null
    }
    if (-not $lista) { return $null }
    return ($lista | Select-Object -First 1).id
}

$datos = [ordered]@{ comercioId = $comercio }

if ($ConAccesoRemoto) {
    $hostnamePublico = $comercio + "." + $Dominio
    $nombreTunel = "nexosoft-" + $comercio

    if (-not $CloudflaredExe) {
        $candidatos = @(
            (Join-Path $PSScriptRoot "..\..\instalador-servidor\runtime\cloudflared\cloudflared.exe"),
            (Get-Command "cloudflared.exe" -ErrorAction SilentlyContinue).Source
        ) | Where-Object { $_ -and (Test-Path $_) }
        $CloudflaredExe = $candidatos | Select-Object -First 1
    }
    if (-not $CloudflaredExe) {
        Write-Error "No encontre cloudflared.exe. Corre antes: preparar-runtimes-instalador.ps1"
        exit 1
    }
    $cert = Join-Path $CredencialesDir "cert.pem"
    if (-not (Test-Path $cert)) {
        Write-Error "Falta el certificado de Cloudflare. Corre una sola vez: cloudflared tunnel login"
        exit 1
    }

    Titulo ("Tunel de " + $hostnamePublico)
    $idTunel = IdDelTunel $CloudflaredExe $nombreTunel
    if ($idTunel) {
        Write-Host ("El tunel " + $nombreTunel + " ya existia con id " + $idTunel + ", lo reuso") -ForegroundColor Yellow
    } else {
        CorrerCloudflared $CloudflaredExe "tunnel create" @("tunnel", "create", $nombreTunel)
        $idTunel = IdDelTunel $CloudflaredExe $nombreTunel
        if (-not $idTunel) {
            Write-Error "Cree el tunel pero no aparece despues en tunnel list"
            exit 1
        }
        Ok ("Tunel creado con id " + $idTunel)
    }

    $archivoCredenciales = Join-Path $CredencialesDir ($idTunel + ".json")
    if (-not (Test-Path $archivoCredenciales)) {
        Write-Host "El tunel existe pero no encuentro sus credenciales en:" -ForegroundColor Red
        Write-Host $archivoCredenciales -ForegroundColor Red
        Write-Host "El secreto del tunel no se puede volver a pedir. Hay que borrarlo y rehacerlo:" -ForegroundColor Red
        Write-Host ("  cloudflared tunnel delete " + $nombreTunel) -ForegroundColor Red
        exit 1
    }

    Titulo "DNS"
    $argsDns = @("tunnel", "route", "dns")
    if ($PisarDns) { $argsDns += "--overwrite-dns" }
    $argsDns += @($nombreTunel, $hostnamePublico)
    CorrerCloudflared $CloudflaredExe "tunnel route dns" $argsDns
    Ok ($hostnamePublico + " apunta al tunel")

    $datos.hostname = $hostnamePublico
    $datos.tunnelId = $idTunel
    $datos.credenciales = (Get-Content $archivoCredenciales -Raw | ConvertFrom-Json)
}

# --- 3. El codigo unico ----------------------------------------------------

Titulo "Codigo de activacion"
$jsonDatos = $datos | ConvertTo-Json -Compress -Depth 5
$codigo = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($jsonDatos))

Write-Host ""
Write-Host ("Comercio:  " + $Nombre + "  (id: " + $comercio + ")") -ForegroundColor Cyan
if ($ConAccesoRemoto) {
    Write-Host ("Panel:     https://" + $datos.hostname) -ForegroundColor Cyan
} else {
    Write-Host "Panel:     sin acceso remoto, solo desde la red del local" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "Codigo unico, se pega en el POS (Configuracion, Acceso remoto):" -ForegroundColor Cyan
Write-Host ""
Write-Host $codigo
Write-Host ""
Write-Host "Ese codigo ata la suscripcion y, si corresponde, levanta el acceso remoto." -ForegroundColor Yellow
Write-Host "Mandaselo SOLO a este comercio." -ForegroundColor Yellow
