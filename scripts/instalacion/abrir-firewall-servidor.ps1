# Corre esto UNA VEZ en la PC que va a ser el servidor (la de la Caja), como
# Administrador (clic derecho > "Ejecutar como administrador" o desde una
# PowerShell elevada). Abre el puerto (3000 por defecto) solo para la red
# privada/local, para que las PCs de Depósito y Oficina puedan llegar al
# cloud-api por la LAN.
param([int]$Puerto = 3000)

New-NetFirewallRule -DisplayName "NexoSoft cloud-api ($Puerto)" `
  -Direction Inbound -Protocol TCP -LocalPort $Puerto -Action Allow -Profile Private

Write-Host "Regla de firewall creada. IP de esta PC en la red local:"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object InterfaceAlias, IPAddress
Write-Host "`nEsa es la IP que hay que cargar en 'Servidor de sucursal' en Depósito y Oficina:"
Write-Host "  http://<esa-IP>:$Puerto/api/v1"
