# Levanta una demo de NexoSoft POS en esta PC, autocontenida: base de datos
# de prueba (PostgreSQL embebido, no hace falta instalar nada aparte) con
# catalogo, ventas y usuarios ya cargados. Pensado para que alguien que NO
# es programador pueda mostrar el sistema sin tener que configurar nada a
# mano.
#
# Que hace, en orden:
#   1. Chequea que este Node.js instalado (si no, avisa donde bajarlo y para).
#   2. Instala las dependencias del proyecto (la primera vez tarda unos
#      minutos; las siguientes es casi instantaneo).
#   3. Levanta el backend con datos de demo y lo deja corriendo en esta
#      ventana hasta que la cierres.
#
# Despues, instalar "NexoSoft POS...setup.exe" (aparte, te lo pasan por
# separado) y abrirlo: ya se conecta solo a esta demo.
#
# Uso: doble click en iniciar-demo.cmd (que llama a este script), o:
#   .\scripts\servidor\iniciar-demo.ps1

$ErrorActionPreference = "Stop"
function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $raiz

Titulo "Verificando Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "No encontre Node.js instalado en esta PC." -ForegroundColor Red
    Write-Host "Instalalo desde https://nodejs.org (version LTS, el boton grande verde) y volve a correr este script."
    Read-Host "Presiona Enter para cerrar"
    exit 1
}
Write-Host "OK: $(node --version)"

Titulo "Instalando dependencias (la primera vez tarda varios minutos)"
corepack enable *> $null
corepack pnpm install

Titulo "Preparando la demo"
Write-Host "Se va a abrir el sistema con datos de prueba (productos, ventas, usuarios)."
Write-Host "Cuando instales y abras el POS, entra con:"
Write-Host "  Usuario:  duenio@nexo.com" -ForegroundColor Yellow
Write-Host "  Clave:    demo1234" -ForegroundColor Yellow
Write-Host "`nDejá esta ventana abierta mientras uses el POS. Para cerrar la demo, cerrá esta ventana."
Write-Host ""

$env:DEMO_KEEPALIVE = "1"
Set-Location "apps\cloud-api"
corepack pnpm seed:demo
