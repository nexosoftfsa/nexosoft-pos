# Acceso remoto al panel: instala y controla el tunel de Cloudflare de este
# comercio (Fase 17.A, ver ADR-0055 y docs/acceso-remoto-cloudflare.md).
#
# Cada comercio tiene un subdominio FIJO bajo nexosoft.com.ar (por ejemplo
# https://lagus.nexosoft.com.ar) atendido por un tunel con nombre creado por
# nosotros en la cuenta de Cloudflare de NexoSoft. En la PC del comercio no
# hay dominio, ni certificado, ni credenciales de Cloudflare: solo el
# "connector token" de SU tunel, que es lo unico que este script necesita.
#
# `cloudflared service install <token>` deja un servicio de Windows real
# (arranca solo al prender la PC, se reinicia solo si se cae), asi que aca
# no hay ningun supervisor propio que mantener.
#
# Corre como Administrador. Lo invocan:
#   - bootstrap-servidor-standalone.ps1 / instalar-servidor-completo.ps1
#     durante la instalacion, si se cargo el token,
#   - el POS, elevado con UAC, desde Configuracion > Acceso remoto
#     (ver apps/pos-desktop/src/datos/acceso-remoto.ts y el scope fijo en
#     src-tauri/capabilities/default.json).
#
# Uso:
#   .\instalar-acceso-remoto.ps1 -Accion activar -Hostname "lagus.nexosoft.com.ar" -Token "eyJhIjoi..."
#   .\instalar-acceso-remoto.ps1 -Accion activar -Codigo "<codigo de activacion>"
#   .\instalar-acceso-remoto.ps1 -Accion activar        # reactiva con lo ya guardado
#   .\instalar-acceso-remoto.ps1 -Accion desactivar
#   .\instalar-acceso-remoto.ps1 -Accion verificar
#   .\instalar-acceso-remoto.ps1 -Accion estado

param(
    [ValidateSet("activar", "desactivar", "verificar", "estado")]
    [string]$Accion = "activar",
    # Connector token del tunel de ESTE comercio (Cloudflare Zero Trust >
    # Networks > Tunnels). Solo hace falta la primera vez: queda guardado.
    [string]$Token,
    # Subdominio publico ya configurado en el tunel, p. ej. lagus.nexosoft.com.ar.
    [string]$Hostname,
    # Hostname + token juntos en un solo string base64 ("codigo de
    # activacion"), que es lo que se le dicta o manda por WhatsApp al
    # comercio para que lo pegue en el POS. Lo genera
    # scripts/release/generar-codigo-acceso-remoto.ps1.
    [string]$Codigo,
    [int]$Puerto = 3000,
    [string]$RaizDatos = "C:\ProgramData\NexoSoft",
    [string]$CloudflaredExe
)

$ErrorActionPreference = "Stop"

# Dos archivos a proposito, con publicos distintos:
#   - config: tiene el TOKEN. Solo lo lee este script (elevado). ACL cerrada.
#   - estado: lo lee el cloud-api para mostrarlo en el POS. Sin secretos.
$archivoConfig = Join-Path $RaizDatos "acceso-remoto-config.json"
$archivoEstado = Join-Path $RaizDatos "acceso-remoto.json"
$logDir = Join-Path $RaizDatos "logs"
$archivoLog = Join-Path $logDir "acceso-remoto.log"

# Binario unico, sin instalador. Solo se descarga si no vino embebido en el
# instalador ni esta ya en la PC.
$URL_CLOUDFLARED = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$NOMBRE_SERVICIO = "Cloudflared"

# Codigos de salida (los interpreta el POS, ver datos/acceso-remoto.ts).
$SALIDA_SIN_TOKEN = 3
$SALIDA_SIN_CLOUDFLARED = 4
$SALIDA_NO_RESPONDE = 5
$SALIDA_CODIGO_INVALIDO = 6

# Un subdominio de PRIMER nivel bajo nexosoft.com.ar: es lo que cubre el
# certificado universal gratuito de Cloudflare (nexosoft.com.ar y *.nexosoft.com.ar).
# Un nivel mas (panel.lagus.nexosoft.com.ar) daria error de certificado.
$PATRON_HOSTNAME = '^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.nexosoft\.com\.ar$'

New-Item -ItemType Directory -Force -Path $RaizDatos, $logDir | Out-Null

function Registrar([string]$Texto) {
    $linea = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Texto
    Write-Host $linea
    Add-Content -Path $archivoLog -Value $linea -Encoding utf8
}

function Escribir-Json([string]$Ruta, $Datos) {
    # UTF8 SIN BOM: JSON.parse() de Node falla si el archivo arranca con BOM,
    # y Out-File/Set-Content en PowerShell 5.1 lo agregan.
    [System.IO.File]::WriteAllText($Ruta, ($Datos | ConvertTo-Json -Compress),
        (New-Object System.Text.UTF8Encoding($false)))
}

<#
Publica el estado del acceso remoto para que lo lea el cloud-api.

Estados (contrato con apps/cloud-api/src/acceso-remoto/estado-acceso-remoto.ts):
  activo   - el tunel esta instalado y corriendo
  apagado  - alguien lo desactivo a proposito en esta PC
(no existe archivo = nunca se configuro; el cloud-api lo reporta como
 "no-configurado")
#>
function Publicar-Estado {
    param(
        [Parameter(Mandatory = $true)][string]$Estado,
        [string]$Url,
        [string]$Mensaje,
        [System.Nullable[bool]]$Alcanzable = $null
    )
    Escribir-Json $archivoEstado ([ordered]@{
            estado        = $Estado
            url           = if ($Url) { $Url } else { $null }
            mensaje       = if ($Mensaje) { $Mensaje } else { $null }
            alcanzable    = $Alcanzable
            actualizadoEn = (Get-Date).ToUniversalTime().ToString("o")
        })
}

function Leer-Config {
    if (-not (Test-Path $archivoConfig)) { return $null }
    try { return (Get-Content $archivoConfig -Raw | ConvertFrom-Json) } catch { return $null }
}

function Guardar-Config([string]$HostnameGuardar, [string]$TokenGuardar) {
    Escribir-Json $archivoConfig ([ordered]@{
            hostname    = $HostnameGuardar
            token       = $TokenGuardar
            guardadoEn  = (Get-Date).ToUniversalTime().ToString("o")
        })
    # El token es un secreto: solo SYSTEM y Administradores. Por SID, no por
    # nombre, porque en Windows en espanol el grupo es "Administradores".
    & icacls $archivoConfig /inheritance:r /grant "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" *> $null
}

function Resolver-Cloudflared {
    if ($CloudflaredExe -and (Test-Path $CloudflaredExe)) { return (Resolve-Path $CloudflaredExe).Path }
    $candidatos = @(
        # Instalacion standalone: viene embebido en el instalador (Fase 13.C).
        (Join-Path $PSScriptRoot "..\cloudflared\cloudflared.exe"),
        (Join-Path $PSScriptRoot "..\..\cloudflared\cloudflared.exe"),
        # Descarga previa de este mismo script.
        (Join-Path $RaizDatos "cloudflared\cloudflared.exe")
    )
    foreach ($c in $candidatos) {
        if (Test-Path $c) { return (Resolve-Path $c).Path }
    }
    $enPath = Get-Command "cloudflared.exe" -ErrorAction SilentlyContinue
    if ($enPath) { return $enPath.Source }

    # Ultimo recurso: descargarlo. Queda en ProgramData porque el servicio de
    # Windows apunta a la ruta del .exe: no puede vivir en una carpeta
    # temporal ni moverse despues.
    $destino = Join-Path $RaizDatos "cloudflared\cloudflared.exe"
    New-Item -ItemType Directory -Force -Path (Split-Path $destino) | Out-Null
    Registrar "No encontre cloudflared.exe; descargando de $URL_CLOUDFLARED ..."
    # TLS 1.2 explicito: PowerShell 5.1 negocia TLS 1.0 por defecto y GitHub lo rechaza.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $URL_CLOUDFLARED -OutFile $destino -TimeoutSec 300 -UseBasicParsing
    Registrar "cloudflared descargado en $destino"
    return $destino
}

<#
Prueba el camino completo desde afuera: la PC sale a internet, llega a
Cloudflare y vuelve por el tunel hasta el cloud-api local. Si esto responde,
el dueno lo va a poder abrir desde el celular.
#>
function Probar-Hostname([string]$HostnamePublico, [int]$SegundosMaximos = 60) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    for ($i = 0; $i -lt $SegundosMaximos; $i += 3) {
        try {
            $r = Invoke-RestMethod -Uri "https://$HostnamePublico/api/v1/health" -TimeoutSec 10
            if ($r) { return $true }
        } catch {
            Start-Sleep -Seconds 3
        }
    }
    return $false
}

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $esAdmin -and $Accion -ne "estado") {
    Write-Error "Corre esto como Administrador (clic derecho > Ejecutar como administrador)."
    exit 1
}

switch ($Accion) {

    "activar" {
        if ($Codigo) {
            # El codigo es solo un envoltorio para que el comercio pegue UNA
            # cosa sola en el POS; no es un secreto cifrado (el token va
            # adentro tal cual, en base64).
            try {
                $datos = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Codigo)) | ConvertFrom-Json
            } catch {
                Registrar "Codigo de activacion invalido: $($_.Exception.Message)"
                Write-Error "El codigo de activacion no es valido. Pedilo de nuevo a NexoSoft."
                exit $SALIDA_CODIGO_INVALIDO
            }
            if (-not $datos.hostname -or -not $datos.token -or $datos.hostname -notmatch $PATRON_HOSTNAME) {
                Registrar "Codigo de activacion mal formado (hostname '$($datos.hostname)')."
                Write-Error "El codigo de activacion no es valido. Pedilo de nuevo a NexoSoft."
                exit $SALIDA_CODIGO_INVALIDO
            }
            $Hostname = $datos.hostname
            $Token = $datos.token
        }

        $config = Leer-Config
        if (-not $Token -and $config) { $Token = $config.token }
        if (-not $Hostname -and $config) { $Hostname = $config.hostname }
        if (-not $Token -or -not $Hostname) {
            Registrar "No hay token/hostname para activar el acceso remoto."
            Write-Error "Falta el token del tunel de este comercio. Pedirlo a NexoSoft y correr: -Accion activar -Hostname <sub>.nexosoft.com.ar -Token <token>"
            exit $SALIDA_SIN_TOKEN
        }

        try {
            $cloudflared = Resolver-Cloudflared
        } catch {
            Registrar "No pude obtener cloudflared: $($_.Exception.Message)"
            Write-Error "No se pudo obtener cloudflared.exe (¿sin internet?). Reintentar cuando haya conexion."
            exit $SALIDA_SIN_CLOUDFLARED
        }

        Guardar-Config -HostnameGuardar $Hostname -TokenGuardar $Token
        Registrar "Instalando el servicio del tunel para $Hostname"

        # Reinstalar de cero: si ya habia un servicio (de otro token, o de una
        # instalacion anterior), `service install` falla en vez de pisarlo.
        & $cloudflared service uninstall *> $null
        $ErrorActionPreference = "Continue"
        & $cloudflared service install $Token *>&1 | ForEach-Object { Registrar $_ }
        $codigo = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
        if ($codigo -ne 0) {
            Registrar "cloudflared service install fallo (exit $codigo)."
            Publicar-Estado -Estado "apagado" -Mensaje "No se pudo instalar el servicio del tunel (codigo $codigo). Ver el log."
            Write-Error "No se pudo instalar el servicio del tunel (codigo $codigo). Log: $archivoLog"
            exit $codigo
        }

        Start-Service -Name $NOMBRE_SERVICIO -ErrorAction SilentlyContinue
        $url = "https://$Hostname"
        Publicar-Estado -Estado "activo" -Url $url -Mensaje "Verificando la conexion..."

        Registrar "Servicio instalado; probando $url"
        if (Probar-Hostname $Hostname) {
            Publicar-Estado -Estado "activo" -Url $url -Alcanzable $true
            Registrar "Acceso remoto OK: $url"
            Write-Host "Acceso remoto activo: $url"
        } else {
            Publicar-Estado -Estado "activo" -Url $url -Alcanzable $false `
                -Mensaje "El tunel esta instalado pero todavia no responde desde afuera. Puede tardar unos minutos, o faltar el hostname publico en Cloudflare."
            Registrar "El tunel no respondio todavia en $url"
            Write-Warning "El tunel quedo instalado pero $url no responde todavia. Revisar en Cloudflare que el hostname publico apunte a http://localhost:$Puerto."
            exit $SALIDA_NO_RESPONDE
        }
    }

    "desactivar" {
        $cloudflared = $null
        try { $cloudflared = Resolver-Cloudflared } catch { $cloudflared = $null }
        if ($cloudflared) { & $cloudflared service uninstall *> $null }
        Stop-Service -Name $NOMBRE_SERVICIO -Force -ErrorAction SilentlyContinue
        # La config (token) se conserva: reactivarlo despues es un solo clic.
        Publicar-Estado -Estado "apagado" -Mensaje "El acceso remoto esta desactivado en esta PC."
        Registrar "Acceso remoto desactivado."
        Write-Host "Acceso remoto desactivado. El panel solo se ve desde la red del local."
    }

    "verificar" {
        $config = Leer-Config
        if (-not $config -or -not $config.hostname) {
            Write-Error "No hay acceso remoto configurado en esta PC."
            exit $SALIDA_SIN_TOKEN
        }
        $url = "https://$($config.hostname)"
        if (Probar-Hostname $config.hostname -SegundosMaximos 20) {
            Publicar-Estado -Estado "activo" -Url $url -Alcanzable $true
            Write-Host "Responde OK: $url"
        } else {
            Publicar-Estado -Estado "activo" -Url $url -Alcanzable $false `
                -Mensaje "No responde desde afuera. Revisar que el servicio del tunel este corriendo y que haya internet en el local."
            Write-Warning "No responde: $url"
            exit $SALIDA_NO_RESPONDE
        }
    }

    "estado" {
        $servicio = Get-Service -Name $NOMBRE_SERVICIO -ErrorAction SilentlyContinue
        if ($servicio) { Write-Host "Servicio $NOMBRE_SERVICIO : $($servicio.Status)" }
        else { Write-Host "Servicio $NOMBRE_SERVICIO no instalado." }
        if (Test-Path $archivoEstado) { Get-Content $archivoEstado -Raw } else { Write-Host "Sin archivo de estado." }
    }
}
