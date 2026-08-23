# Da de alta el acceso remoto de un comercio y genera su "codigo de
# activacion" (Fase 17.A, ver ADR-0055 y docs/acceso-remoto-cloudflare.md).
#
# Esto lo corremos NOSOTROS, en nuestra PC, una vez por comercio. Crea el
# tunel en la cuenta de Cloudflare de NexoSoft, le enchufa el subdominio
# (<comercio>.nexosoft.com.ar) y devuelve un solo string para mandarle al
# comercio: lo pega en el POS o en el instalador y queda andando, sin sesion
# remota ni comandos de su lado.
#
# TODO por linea de comandos, a proposito: asi NO hace falta entrar a
# Cloudflare Zero Trust, que para el panel pide cargar una tarjeta aunque el
# plan sea gratuito. Con `cloudflared tunnel login` alcanza una cuenta comun
# de Cloudflare con el dominio adentro.
#
# UNA SOLA VEZ, antes del primer comercio:
#
#   cloudflared tunnel login
#   # abre el navegador, elegir nexosoft.com.ar y autorizar.
#   # Deja %USERPROFILE%\.cloudflared\cert.pem -- ES UN SECRETO, no subirlo
#   # a ningun lado ni copiarlo a la PC de un cliente.
#
# Despues, por cada comercio:
#   .\scripts\release\generar-codigo-acceso-remoto.ps1 -Subdominio lagus

param(
    # Subdominio del comercio, sin puntos: "lagus" da lagus.nexosoft.com.ar
    [Parameter(Mandatory = $true)][string]$Subdominio,
    [string]$Dominio = "nexosoft.com.ar",
    [string]$CloudflaredExe,
    # Carpeta donde cloudflared guarda cert.pem y las credenciales de cada
    # tunel. SON SECRETOS: viven en el perfil de Windows, fuera del repo.
    [string]$CredencialesDir = (Join-Path $env:USERPROFILE ".cloudflared"),
    # Si el CNAME del subdominio ya existe apuntando a otro lado, lo pisa.
    [switch]$PisarDns
)

$ErrorActionPreference = "Stop"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }

$sub = $Subdominio.Trim().ToLowerInvariant()
if ($sub -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$') {
    Write-Error "El subdominio solo puede tener letras, numeros y guiones (sin puntos): '$Subdominio'."
    exit 1
}
$hostnamePublico = "$sub.$Dominio"
$nombreTunel = "nexosoft-$sub"

if (-not $CloudflaredExe) {
    $candidatos = @(
        (Join-Path $PSScriptRoot "..\..\instalador-servidor\runtime\cloudflared\cloudflared.exe"),
        (Get-Command "cloudflared.exe" -ErrorAction SilentlyContinue).Source
    ) | Where-Object { $_ -and (Test-Path $_) }
    $CloudflaredExe = $candidatos | Select-Object -First 1
}
if (-not $CloudflaredExe) {
    Write-Error "No encontre cloudflared.exe. Corre antes: .\scripts\release\preparar-runtimes-instalador.ps1"
    exit 1
}

$cert = Join-Path $CredencialesDir "cert.pem"
if (-not (Test-Path $cert)) {
    Write-Error @"
Falta el certificado de tu cuenta de Cloudflare ($cert).

Corre una sola vez (abre el navegador, elegi $Dominio y autoriza):

    cloudflared tunnel login
"@
    exit 1
}

# cloudflared escribe sus logs por stderr; se valida con $LASTEXITCODE en vez
# de confiar en $ErrorActionPreference, igual que el resto de scripts/release.
function CorrerCloudflared([string]$Descripcion, [string[]]$Argumentos) {
    $ErrorActionPreference = "Continue"
    $salida = & $CloudflaredExe @Argumentos 2>&1 | Out-String
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($codigo -ne 0) {
        Write-Host $salida
        Write-Error "$Descripcion fallo (exit $codigo)."
        exit 1
    }
    return $salida
}

<# Devuelve el id del tunel con ese nombre, o $null si no existe. #>
function IdDelTunel([string]$Nombre) {
    $ErrorActionPreference = "Continue"
    $json = & $CloudflaredExe tunnel list --name $Nombre --output json 2>$null | Out-String
    $ErrorActionPreference = "Stop"
    try {
        $lista = $json | ConvertFrom-Json
    } catch {
        return $null
    }
    if (-not $lista) { return $null }
    return ($lista | Select-Object -First 1).id
}

Titulo "Tunel de $hostnamePublico"
$idTunel = IdDelTunel $nombreTunel
if ($idTunel) {
    Write-Host "El tunel '$nombreTunel' ya existia (id $idTunel) -- lo reuso." -ForegroundColor Yellow
} else {
    CorrerCloudflared "tunnel create" @("tunnel", "create", $nombreTunel) | Out-Null
    $idTunel = IdDelTunel $nombreTunel
    if (-not $idTunel) {
        Write-Error "Cree el tunel pero no lo encuentro despues en 'tunnel list'. Revisar a mano."
        exit 1
    }
    Ok "Tunel '$nombreTunel' creado (id $idTunel)"
}

$archivoCredenciales = Join-Path $CredencialesDir "$idTunel.json"
if (-not (Test-Path $archivoCredenciales)) {
    Write-Error @"
El tunel existe pero no encuentro sus credenciales en:
    $archivoCredenciales

Pasa cuando el tunel se creo desde otra PC o se borro el archivo. El secreto
del tunel no se puede volver a pedir: hay que borrar el tunel y rehacerlo.

    cloudflared tunnel delete $nombreTunel
    (y volve a correr este script)
"@
    exit 1
}

Titulo "DNS"
$argsDns = @("tunnel", "route", "dns")
if ($PisarDns) { $argsDns += "--overwrite-dns" }
$argsDns += @($nombreTunel, $hostnamePublico)
$salidaDns = CorrerCloudflared "tunnel route dns" $argsDns
Write-Host $salidaDns.Trim()
Ok "$hostnamePublico apunta al tunel"

Titulo "Codigo de activacion"
# El codigo lleva las credenciales del tunel adentro (base64, sin cifrar):
# es lo que la PC del comercio necesita para levantar SU tunel. Se empaqueta
# todo junto para que el dueno copie una sola cosa.
# Las credenciales viajan TAL CUAL las escribio cloudflared, sin elegir
# campos a mano: si alguna version agrega uno, llega igual a la PC del
# comercio en vez de perderse en silencio.
$credenciales = Get-Content $archivoCredenciales -Raw | ConvertFrom-Json
$datos = [ordered]@{
    hostname     = $hostnamePublico
    tunnelId     = $idTunel
    credenciales = $credenciales
}
# -Depth explicito: el default de ConvertTo-Json es 2 y aca hay un objeto
# anidado.
$codigo = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(($datos | ConvertTo-Json -Compress -Depth 5)))

Write-Host ""
Write-Host "Comercio:  https://$hostnamePublico" -ForegroundColor Cyan
Write-Host ""
Write-Host "Codigo de activacion (el comercio lo pega en el POS, Configuracion > Acceso remoto):" -ForegroundColor Cyan
Write-Host ""
Write-Host $codigo
Write-Host ""
Write-Host "Mandaselo SOLO a este comercio: quien lo tenga puede levantar su tunel." -ForegroundColor Yellow
Write-Host "Para dar de baja el acceso remoto de este comercio, algun dia:" -ForegroundColor Yellow
Write-Host "  cloudflared tunnel delete $nombreTunel" -ForegroundColor Yellow
