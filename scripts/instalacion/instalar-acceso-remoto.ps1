# Acceso remoto al panel: instala y controla el tunel de Cloudflare de este
# comercio (Fase 17.A, ver ADR-0055 y docs/acceso-remoto-cloudflare.md).
#
# Cada comercio tiene un subdominio FIJO bajo nexosoft.com.ar (por ejemplo
# https://lagus.nexosoft.com.ar) atendido por un tunel creado por nosotros en
# la cuenta de Cloudflare de NexoSoft. En la PC del comercio no hay cuenta de
# Cloudflare, ni dominio, ni certificado: solo las credenciales de SU tunel,
# que llegan adentro del "codigo de activacion".
#
# El tunel corre como tarea programada de Windows ("NexoSoft Acceso Remoto"),
# igual que el cloud-api y el PostgreSQL de esta misma instalacion: arranca
# sola al prender la PC y se reinicia sola si se cae. Se usa tarea y no
# `cloudflared service install` para poder apuntar al config.yml con una ruta
# EXPLICITA, sin depender de donde busca cloudflared su configuracion cuando
# corre como SYSTEM.
#
# Corre como Administrador. Lo invocan:
#   - bootstrap-servidor-standalone.ps1 / instalar-servidor-completo.ps1
#     durante la instalacion, si se cargo el codigo,
#   - el POS, elevado con UAC, desde Configuracion > Acceso remoto
#     (ver apps/pos-desktop/src/datos/acceso-remoto.ts y el scope fijo en
#     src-tauri/capabilities/default.json).
#
# Uso:
#   .\instalar-acceso-remoto.ps1 -Accion activar -Codigo "<codigo>"
#   .\instalar-acceso-remoto.ps1 -Accion activar     # reactiva lo ya cargado
#   .\instalar-acceso-remoto.ps1 -Accion desactivar
#   .\instalar-acceso-remoto.ps1 -Accion verificar
#   .\instalar-acceso-remoto.ps1 -Accion estado

param(
    [ValidateSet("activar", "desactivar", "verificar", "estado")]
    [string]$Accion = "activar",
    # Codigo de activacion de ESTE comercio (hostname + credenciales del
    # tunel en base64). Lo genera scripts/release/generar-codigo-acceso-remoto.ps1.
    # Solo hace falta la primera vez: queda guardado.
    [string]$Codigo,
    # Puerto del cloud-api en la LAN. Solo se usa para el mensaje de ayuda:
    # el tunel NO apunta aca (ver -PuertoRemoto).
    [int]$Puerto = 3000,
    # Puerto dedicado al tunel (ADR-0057). El cloud-api lo escucha SOLO en
    # loopback y no se abre en el firewall: que un pedido entre por ahi es la
    # senal de que viene de internet, y es lo que deja el acceso remoto en
    # solo lectura. Tiene que coincidir con PORT_REMOTO del .env del servidor.
    [int]$PuertoRemoto = 3001,
    [string]$RaizDatos = "C:\ProgramData\NexoSoft",
    [string]$CloudflaredExe
)

$ErrorActionPreference = "Stop"

$tunelDir = Join-Path $RaizDatos "cloudflared"
$archivoConfig = Join-Path $tunelDir "config.yml"
# Estado que lee el cloud-api para mostrarlo en el POS. SIN secretos: las
# credenciales viven aparte, en <tunelDir>\<id>.json con ACL cerrada.
$archivoEstado = Join-Path $RaizDatos "acceso-remoto.json"
$archivoHostname = Join-Path $tunelDir "hostname.txt"
$logDir = Join-Path $RaizDatos "logs"
$archivoLog = Join-Path $logDir "acceso-remoto.log"

$URL_CLOUDFLARED = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$NOMBRE_TAREA = "NexoSoft Acceso Remoto"

# Codigos de salida (los interpreta el POS, ver datos/acceso-remoto.ts).
$SALIDA_SIN_CODIGO = 3
$SALIDA_SIN_CLOUDFLARED = 4
$SALIDA_NO_RESPONDE = 5
$SALIDA_CODIGO_INVALIDO = 6

# Subdominio de PRIMER nivel bajo nexosoft.com.ar: es lo que cubre el
# certificado universal gratuito de Cloudflare (nexosoft.com.ar y
# *.nexosoft.com.ar). Un nivel mas (panel.lagus.nexosoft.com.ar) daria error
# de certificado en el celular del dueno.
$PATRON_HOSTNAME = '^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.nexosoft\.com\.ar$'

New-Item -ItemType Directory -Force -Path $RaizDatos, $logDir, $tunelDir | Out-Null

function Registrar([string]$Texto) {
    $linea = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Texto
    Write-Host $linea
    Add-Content -Path $archivoLog -Value $linea -Encoding utf8
}

<#
Publica el estado del acceso remoto para que lo lea el cloud-api.

Estados (contrato con apps/cloud-api/src/acceso-remoto/estado-acceso-remoto.ts):
  activo   - el tunel esta instalado y corriendo
  apagado  - alguien lo desactivo a proposito en esta PC
(sin archivo = nunca se configuro; el cloud-api lo reporta "no-configurado")
#>
function Publicar-Estado {
    param(
        [Parameter(Mandatory = $true)][string]$Estado,
        [string]$Url,
        [string]$Mensaje,
        [System.Nullable[bool]]$Alcanzable = $null
    )
    $datos = [ordered]@{
        estado        = $Estado
        url           = if ($Url) { $Url } else { $null }
        mensaje       = if ($Mensaje) { $Mensaje } else { $null }
        alcanzable    = $Alcanzable
        actualizadoEn = (Get-Date).ToUniversalTime().ToString("o")
    }
    # UTF8 SIN BOM: JSON.parse() de Node falla si el archivo arranca con BOM,
    # y Out-File/Set-Content en PowerShell 5.1 lo agregan.
    [System.IO.File]::WriteAllText($archivoEstado, ($datos | ConvertTo-Json -Compress),
        (New-Object System.Text.UTF8Encoding($false)))
}

function Resolver-Cloudflared {
    if ($CloudflaredExe -and (Test-Path $CloudflaredExe)) { return (Resolve-Path $CloudflaredExe).Path }
    $candidatos = @(
        # Instalacion standalone: viene embebido en el instalador (Fase 13.C).
        (Join-Path $PSScriptRoot "..\cloudflared\cloudflared.exe"),
        (Join-Path $PSScriptRoot "..\..\instalador-servidor\runtime\cloudflared\cloudflared.exe"),
        # Descarga previa de este mismo script.
        (Join-Path $tunelDir "cloudflared.exe")
    )
    foreach ($c in $candidatos) {
        if (Test-Path $c) { return (Resolve-Path $c).Path }
    }
    $enPath = Get-Command "cloudflared.exe" -ErrorAction SilentlyContinue
    if ($enPath) { return $enPath.Source }

    # Ultimo recurso: descargarlo. Queda en ProgramData porque la tarea
    # programada apunta a la ruta del .exe: no puede vivir en una carpeta
    # temporal ni moverse despues.
    $destino = Join-Path $tunelDir "cloudflared.exe"
    Registrar "No encontre cloudflared.exe; descargando de $URL_CLOUDFLARED ..."
    # TLS 1.2 explicito: PowerShell 5.1 negocia TLS 1.0 por defecto y GitHub lo rechaza.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $URL_CLOUDFLARED -OutFile $destino -TimeoutSec 300 -UseBasicParsing
    Registrar "cloudflared descargado en $destino"
    return $destino
}

<#
Deja escritas las credenciales del tunel y su config.yml a partir del codigo
de activacion. Devuelve el hostname publico.
#>
function Aplicar-Codigo([string]$CodigoBase64) {
    try {
        $datos = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($CodigoBase64.Trim())) | ConvertFrom-Json
    } catch {
        Registrar "Codigo de activacion invalido: $($_.Exception.Message)"
        Write-Error "El codigo de activacion no es valido. Pedilo de nuevo a NexoSoft."
        exit $SALIDA_CODIGO_INVALIDO
    }

    # Fase 17.B (ADR-0056 §6): el codigo pasa a ser UNO SOLO por comercio y
    # trae tambien la suscripcion. Antes eran dos pasos separados y olvidarse
    # del segundo dejaba al comercio sin control de suscripcion en silencio.
    #
    # El acceso remoto es opcional: un codigo puede traer solo el comercioId.
    if ($datos.comercioId) {
        Atar-Suscripcion $datos.comercioId
    }

    $tieneTunel = $datos.hostname -or $datos.tunnelId -or $datos.credenciales
    if (-not $tieneTunel) {
        if (-not $datos.comercioId) {
            Registrar "El codigo no trae ni comercio ni tunel."
            Write-Error "El codigo de activacion no es valido. Pedilo de nuevo a NexoSoft."
            exit $SALIDA_CODIGO_INVALIDO
        }
        # Codigo de solo suscripcion: no hay tunel que levantar.
        Registrar "Codigo sin acceso remoto: solo se ato la suscripcion."
        return $null
    }

    if (-not $datos.hostname -or $datos.hostname -notmatch $PATRON_HOSTNAME -or
        -not $datos.tunnelId -or -not $datos.credenciales -or -not $datos.credenciales.TunnelSecret) {
        Registrar "Codigo de activacion mal formado (hostname '$($datos.hostname)')."
        Write-Error "El codigo de activacion no es valido. Pedilo de nuevo a NexoSoft."
        exit $SALIDA_CODIGO_INVALIDO
    }

    $archivoCredenciales = Join-Path $tunelDir "$($datos.tunnelId).json"
    [System.IO.File]::WriteAllText($archivoCredenciales, ($datos.credenciales | ConvertTo-Json -Compress -Depth 5),
        (New-Object System.Text.UTF8Encoding($false)))
    # El secreto del tunel: solo SYSTEM y Administradores. Por SID, no por
    # nombre, porque en Windows en espanol el grupo es "Administradores".
    & icacls $archivoCredenciales /inheritance:r /grant "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" *> $null

    # Ingress minimo: el hostname del comercio al PUERTO REMOTO del cloud-api
    # (no al de la LAN), y 404 para cualquier otra cosa que llegue por el
    # tunel. Ese puerto es el que deja el acceso en solo lectura (ADR-0057).
    $config = @"
tunnel: $($datos.tunnelId)
credentials-file: $archivoCredenciales
no-autoupdate: true
ingress:
  - hostname: $($datos.hostname)
    service: http://localhost:$PuertoRemoto
  - service: http_status:404
"@
    [System.IO.File]::WriteAllText($archivoConfig, $config, (New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::WriteAllText($archivoHostname, $datos.hostname, (New-Object System.Text.UTF8Encoding($false)))
    Registrar "Configuracion del tunel escrita para $($datos.hostname) (tunel $($datos.tunnelId))"
    return $datos.hostname
}

<#
Ata esta PC a la suscripcion del comercio, delegando en el script que ya lo
hace (configurar-suscripcion.ps1). No se duplica la logica del .env ni el
reinicio del servicio: si eso cambia, cambia en un solo lugar.

Best-effort: si falla, se avisa pero NO se corta el alta del tunel. Dejar al
comercio sin acceso remoto porque no se pudo escribir una variable seria peor
que dejarlo sin control de suscripcion, que se puede arreglar despues.
#>
function Atar-Suscripcion([string]$ComercioId) {
    $script = Join-Path $PSScriptRoot "configurar-suscripcion.ps1"
    if (-not (Test-Path $script)) {
        Registrar "No encontre configurar-suscripcion.ps1; la suscripcion queda sin atar."
        Write-Warning "No se pudo atar la suscripcion (falta configurar-suscripcion.ps1). Avisar a NexoSoft."
        return
    }
    Registrar "Atando la suscripcion al comercio '$ComercioId'"
    try {
        & $script -ComercioId $ComercioId -Puerto $Puerto
        Registrar "Suscripcion atada a '$ComercioId'"
    } catch {
        Registrar "No se pudo atar la suscripcion: $($_.Exception.Message)"
        Write-Warning "El acceso remoto se configuro, pero la suscripcion no. Avisar a NexoSoft."
    }
}

function Hostname-Guardado {
    if (Test-Path $archivoHostname) { return (Get-Content $archivoHostname -Raw).Trim() }
    return $null
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
            if (Invoke-RestMethod -Uri "https://$HostnamePublico/api/v1/health" -TimeoutSec 10) { return $true }
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
            $hostnamePublico = Aplicar-Codigo $Codigo
            # Codigo de solo suscripcion: ya quedo todo hecho, no hay tunel.
            if (-not $hostnamePublico) {
                Write-Host "Suscripcion configurada. Este comercio no tiene acceso remoto."
                exit 0
            }
        } else {
            $hostnamePublico = Hostname-Guardado
            if (-not $hostnamePublico -or -not (Test-Path $archivoConfig)) {
                Registrar "No hay codigo cargado en esta PC."
                Write-Error "Esta PC no tiene acceso remoto dado de alta. Pedile el codigo de activacion a NexoSoft."
                exit $SALIDA_SIN_CODIGO
            }
        }

        try {
            $cloudflared = Resolver-Cloudflared
        } catch {
            Registrar "No pude obtener cloudflared: $($_.Exception.Message)"
            Write-Error "No se pudo obtener cloudflared.exe (¿sin internet?). Reintentar cuando haya conexion."
            exit $SALIDA_SIN_CLOUDFLARED
        }

        Registrar "Registrando la tarea del tunel para $hostnamePublico"
        $argumentos = "--config `"$archivoConfig`" --loglevel info --logfile `"$logDir\cloudflared.log`" tunnel run"
        $accionTarea = New-ScheduledTaskAction -Execute $cloudflared -Argument $argumentos
        $disparador = New-ScheduledTaskTrigger -AtStartup
        # Mismo criterio que la tarea del cloud-api: sin limite de tiempo (el
        # tunel no termina nunca) y que se reinicie sola si muere.
        $configuracion = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero)
        $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

        Unregister-ScheduledTask -TaskName $NOMBRE_TAREA -Confirm:$false -ErrorAction SilentlyContinue
        # -ErrorAction Stop: los cmdlets *-ScheduledTask son CIM y un "acceso
        # denegado" queda como error no terminante, dejando la tarea sin
        # registrar mientras el script sigue como si nada.
        Register-ScheduledTask -TaskName $NOMBRE_TAREA -Action $accionTarea -Trigger $disparador `
            -Settings $configuracion -Principal $principal `
            -Description "Tunel de acceso remoto de NexoSoft (Cloudflare). Publica el panel en https://$hostnamePublico. Arranca solo con Windows." `
            -ErrorAction Stop | Out-Null
        Start-ScheduledTask -TaskName $NOMBRE_TAREA -ErrorAction Stop

        $url = "https://$hostnamePublico"
        Publicar-Estado -Estado "activo" -Url $url -Mensaje "Verificando la conexion..."
        Registrar "Tarea registrada; probando $url"
        if (Probar-Hostname $hostnamePublico) {
            Publicar-Estado -Estado "activo" -Url $url -Alcanzable $true
            Registrar "Acceso remoto OK: $url"
            Write-Host "Acceso remoto activo: $url"
        } else {
            Publicar-Estado -Estado "activo" -Url $url -Alcanzable $false `
                -Mensaje "El tunel esta instalado pero todavia no responde desde afuera. Puede tardar unos minutos."
            Registrar "El tunel no respondio todavia en $url"
            Write-Warning "El tunel quedo instalado pero $url no responde todavia. Ver $logDir\cloudflared.log."
            exit $SALIDA_NO_RESPONDE
        }
    }

    "desactivar" {
        Stop-ScheduledTask -TaskName $NOMBRE_TAREA -ErrorAction SilentlyContinue
        # Se deja registrada pero deshabilitada, y la configuracion queda:
        # volver a activarlo despues es un solo clic en el POS.
        Disable-ScheduledTask -TaskName $NOMBRE_TAREA -ErrorAction SilentlyContinue | Out-Null
        Publicar-Estado -Estado "apagado" -Mensaje "El acceso remoto esta desactivado en esta PC."
        Registrar "Acceso remoto desactivado."
        Write-Host "Acceso remoto desactivado. El panel solo se ve desde la red del local."
    }

    "verificar" {
        $hostnamePublico = Hostname-Guardado
        if (-not $hostnamePublico) {
            Write-Error "No hay acceso remoto configurado en esta PC."
            exit $SALIDA_SIN_CODIGO
        }
        $url = "https://$hostnamePublico"
        if (Probar-Hostname $hostnamePublico -SegundosMaximos 20) {
            Publicar-Estado -Estado "activo" -Url $url -Alcanzable $true
            Write-Host "Responde OK: $url"
        } else {
            Publicar-Estado -Estado "activo" -Url $url -Alcanzable $false `
                -Mensaje "No responde desde afuera. Revisar que la PC tenga internet y que la tarea del tunel este corriendo."
            Write-Warning "No responde: $url"
            exit $SALIDA_NO_RESPONDE
        }
    }

    "estado" {
        $tarea = Get-ScheduledTask -TaskName $NOMBRE_TAREA -ErrorAction SilentlyContinue
        if ($tarea) { Write-Host "Tarea '$NOMBRE_TAREA': $($tarea.State)" }
        else { Write-Host "Tarea '$NOMBRE_TAREA' no registrada." }
        $h = Hostname-Guardado
        if ($h) { Write-Host "Hostname: https://$h" } else { Write-Host "Sin hostname configurado." }
        if (Test-Path $archivoEstado) { Get-Content $archivoEstado -Raw } else { Write-Host "Sin archivo de estado." }
    }
}
