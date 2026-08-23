# Genera el "codigo de activacion" del acceso remoto de un comercio
# (Fase 17.A, ver ADR-0055 y docs/acceso-remoto-cloudflare.md).
#
# Esto lo corremos NOSOTROS, en nuestra PC, despues de crear el tunel del
# comercio en Cloudflare. El resultado es un solo string para mandarle por
# WhatsApp al dueno: lo pega en el POS (Configuracion > Acceso remoto) y
# queda andando, sin sesion remota ni comandos.
#
# El codigo NO es un secreto cifrado: es el hostname + el connector token
# del tunel en base64, empaquetados juntos para que sea una sola cosa que
# copiar. Tratalo como lo que es -- quien lo tenga puede levantar el tunel
# de ese comercio -- y mandalo solo al comercio que corresponde.
#
# Uso:
#   .\scripts\release\generar-codigo-acceso-remoto.ps1 -Subdominio lagus -Token "eyJhIjoi..."

param(
    # Subdominio del comercio bajo nexosoft.com.ar, sin puntos: "lagus" da
    # https://lagus.nexosoft.com.ar
    [Parameter(Mandatory = $true)][string]$Subdominio,
    # Connector token del tunel, de Cloudflare Zero Trust > Networks >
    # Tunnels > (el tunel) > Configure.
    [Parameter(Mandatory = $true)][string]$Token
)

$ErrorActionPreference = "Stop"

$sub = $Subdominio.Trim().ToLowerInvariant()
if ($sub -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$') {
    Write-Error "El subdominio solo puede tener letras, numeros y guiones (sin puntos): '$Subdominio'."
    exit 1
}
$hostnamePublico = "$sub.nexosoft.com.ar"

$json = ([ordered]@{ hostname = $hostnamePublico; token = $Token.Trim() } | ConvertTo-Json -Compress)
$codigo = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))

Write-Host ""
Write-Host "Comercio:  https://$hostnamePublico" -ForegroundColor Cyan
Write-Host ""
Write-Host "Codigo de activacion (pegarlo en el POS, Configuracion > Acceso remoto):" -ForegroundColor Cyan
Write-Host ""
Write-Host $codigo
Write-Host ""
Write-Host "Antes de mandarlo, verifica en Cloudflare que el tunel tenga un public" -ForegroundColor Yellow
Write-Host "hostname '$hostnamePublico' apuntando a http://localhost:3000." -ForegroundColor Yellow
