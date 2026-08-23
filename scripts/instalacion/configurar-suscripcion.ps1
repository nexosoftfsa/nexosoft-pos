# Deja el servidor de un comercio atado a su suscripcion (Fase 17.B, ADR-0056).
#
# Escribe LICENCIAS_COMERCIO_ID en el .env del servidor y lo reinicia, para
# que empiece a pedirle la licencia al Worker de licencias.nexosoft.com.ar.
#
# La CLAVE PUBLICA no hace falta: viene embebida en el servidor, porque es la
# misma para todos los comercios y no es un secreto.
#
# El comercio tiene que estar dado de alta antes en el panel
# (https://admin.nexosoft.com.ar) con ESE MISMO id.
#
# Corre como Administrador, en la PC que aloja el servidor:
#   .\configurar-suscripcion.ps1 -ComercioId lagus
#
# Para desactivar el control de suscripcion en esa PC:
#   .\configurar-suscripcion.ps1 -Quitar

param(
    # Id del comercio, el mismo que se cargo en el panel.
    [string]$ComercioId,
    # Saca la suscripcion de esta instalacion (vuelve a operar sin control).
    [switch]$Quitar,
    # Carpeta del servidor. Por defecto, la del instalador standalone.
    [string]$ServidorDir = "C:\NexoSoft-Servidor\dist-servidor",
    [string]$TareaCloudApi = "NexoSoft cloud-api",
    [int]$Puerto = 3000
)

$ErrorActionPreference = "Stop"

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $esAdmin) {
    Write-Error "Corre esto como Administrador (clic derecho > Ejecutar como administrador)."
    exit 1
}

if (-not $Quitar -and [string]::IsNullOrWhiteSpace($ComercioId)) {
    Write-Error "Falta -ComercioId. Es el id con el que diste de alta al comercio en el panel."
    exit 1
}

# Instalacion legacy (repo clonado) como alternativa a la standalone.
if (-not (Test-Path $ServidorDir)) {
    $legacy = "C:\NexoSoft\apps\cloud-api"
    if (Test-Path $legacy) {
        $ServidorDir = $legacy
    } else {
        Write-Error "No encontre el servidor. Probe en $ServidorDir y en $legacy. Pasalo con -ServidorDir."
        exit 2
    }
}

$envPath = Join-Path $ServidorDir ".env"
if (-not (Test-Path $envPath)) {
    Write-Error "No existe $envPath. ¿Esta instalado el servidor en esta PC?"
    exit 2
}

# Se reescribe la linea si ya estaba, en vez de acumular duplicados (la ultima
# ganaria, pero el archivo queda sucio y confunde al que lo lea despues).
$lineas = @(Get-Content $envPath | Where-Object { $_ -notmatch '^\s*LICENCIAS_COMERCIO_ID\s*=' })
if (-not $Quitar) {
    $lineas += "LICENCIAS_COMERCIO_ID=$($ComercioId.Trim())"
}
[System.IO.File]::WriteAllLines($envPath, $lineas, (New-Object System.Text.UTF8Encoding($false)))

if ($Quitar) {
    Write-Host "Suscripcion desvinculada de esta PC. El sistema opera sin control."
} else {
    Write-Host "Comercio '$ComercioId' configurado en $envPath"
}

Write-Host "Reiniciando el servidor..."
Stop-ScheduledTask -TaskName $TareaCloudApi -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Start-ScheduledTask -TaskName $TareaCloudApi -ErrorAction Stop

# Verificar que volvio a responder antes de dar el OK: reiniciar el servicio y
# no comprobar es la forma mas facil de irse dejando la caja parada.
$listo = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        Invoke-RestMethod -Uri "http://localhost:$Puerto/api/v1/health" -TimeoutSec 3 | Out-Null
        $listo = $true
        break
    } catch {}
}
if (-not $listo) {
    Write-Error "El servidor no volvio a responder en el puerto $Puerto. Revisar los logs en C:\ProgramData\NexoSoft\logs\."
    exit 3
}
Write-Host "Servidor arriba."

if (-not $Quitar) {
    Write-Host ""
    Write-Host "El servidor va a pedir su licencia enseguida y despues una vez por dia."
    Write-Host "Para ver como quedo, entra al POS y mira Configuracion, o consulta:"
    Write-Host "  Invoke-RestMethod http://localhost:$Puerto/api/v1/health"
}
