# Verifica que el paquete del servidor ARRANQUE, antes de publicarlo.
#
# Esto faltaba y salio caro. El paquete se compilaba, se empaquetaba y se
# publicaba sin que nadie comprobara que el servidor levanta; el error aparecia
# recien en la PC del cliente, como una actualizacion que se revierte sola o un
# instalador que dice "LA CONFIGURACION NO TERMINO BIEN".
#
# El caso concreto: cloud-api empezo a usar @nexosoft/domain en tiempo de
# ejecucion (hasta ahi lo usaba solo para tipos, que se borran al compilar).
# Ese paquete publicaba su `main` apuntando al TypeScript sin compilar, y Node
# no puede cargar TypeScript desde node_modules. El servidor moria al arrancar.
#
# No se necesita base de datos: alcanza con arrancarlo apuntando a una base que
# no existe. Los errores de EMPAQUETADO (modulo que falta, TypeScript sin
# compilar, ESM/CommonJS mezclados) ocurren al cargar los modulos, ANTES de
# tocar la base. Un error de conexion a la base, en cambio, es esperado y no
# invalida el paquete.
#
# Uso:
#   .\probar-arranque-paquete.ps1 -Destino "E:\...\dist-servidor"

param(
    [string]$Destino = (Join-Path $PSScriptRoot "..\..\dist-servidor"),
    [int]$Segundos = 30
)

$ErrorActionPreference = "Stop"

function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }

$Destino = (Resolve-Path $Destino).Path
$main = Join-Path $Destino "dist\main.js"
if (-not (Test-Path $main)) {
    Write-Host "ERROR: no existe $main" -ForegroundColor Red
    exit 1
}

# El cliente de Prisma se genera en la PC del cliente; aca hace falta para que
# el arranque llegue a cargar los modulos nuestros, que es lo que se prueba.
Push-Location $Destino
try {
    $ErrorActionPreference = "Continue"
    & node "node_modules\prisma\build\index.js" generate --schema=prisma\schema.prisma *> $null
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($codigo -ne 0) {
        Write-Host "ERROR: no se pudo generar el cliente de Prisma en el paquete (exit $codigo)." -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

$log = Join-Path $env:TEMP "nexosoft-arranque-$(Get-Random).log"
$comando = @"
Set-Location '$Destino'
`$env:NODE_ENV = 'production'
`$env:PORT = '39997'
`$env:PORT_REMOTO = '39998'
`$env:DATABASE_URL = 'postgresql://nadie:nadie@localhost:59999/nada'
`$env:JWT_SECRET = 'solo-para-la-prueba-de-arranque'
`$env:JWT_REFRESH_SECRET = 'solo-para-la-prueba-de-arranque-2'
node dist\main.js *> '$log'
"@

Write-Host "Arrancando el paquete (hasta $Segundos segundos)..."
$proceso = Start-Process powershell.exe -ArgumentList "-NoProfile", "-Command", $comando -PassThru -WindowStyle Hidden
Start-Sleep -Seconds $Segundos
if (-not $proceso.HasExited) { Stop-Process -Id $proceso.Id -Force -ErrorAction SilentlyContinue }

$salida = if (Test-Path $log) { Get-Content $log -Raw } else { "" }
Remove-Item $log -Force -ErrorAction SilentlyContinue

# Errores de EMPAQUETADO: el paquete esta mal armado y no hay que publicarlo.
$fatales = @(
    "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING",
    "MODULE_NOT_FOUND",
    "Cannot find module",
    "ERR_REQUIRE_ESM",
    "ERR_PACKAGE_PATH_NOT_EXPORTED",
    "is not defined in ES module scope"
)
$encontrados = @($fatales | Where-Object { $salida -match [regex]::Escape($_) })
if ($encontrados.Count -gt 0) {
    Write-Host "`nEL PAQUETE NO ARRANCA. Errores de empaquetado:" -ForegroundColor Red
    foreach ($e in $encontrados) { Write-Host "  - $e" -ForegroundColor Red }
    Write-Host "`n--- salida del arranque ---"
    Write-Host $salida
    exit 1
}

# Que no haya errores fatales no alcanza: si no arranco nada, la prueba no
# probo nada. Se exige ver que Nest haya empezado a levantar.
if ($salida -notmatch "Nest") {
    Write-Host "`nEl paquete no llego a arrancar Nest y tampoco dio un error conocido." -ForegroundColor Red
    Write-Host "--- salida del arranque ---"
    Write-Host $salida
    exit 1
}

Ok "El paquete arranca (los modulos cargan y Nest levanta)"
exit 0
