# Levanta el servidor de NexoSoft en ESTA PC de desarrollo, en una ventana
# visible. Es lo que abre el acceso directo del escritorio.
#
# A diferencia de iniciar-cloud-api.ps1 (que corre oculto, via tarea
# programada, y manda todo a un log), este es para cuando uno esta sentado
# adelante: dice que esta pasando, avisa si falta algo antes de intentar
# arrancar, y deja la ventana abierta para poder leer el error.
#
# Cerrar la ventana detiene el servidor.
#
# Uso:  .\levantar-servidor.ps1

$ErrorActionPreference = "Stop"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }
function Feo($t) { Write-Host $t -ForegroundColor Red }

$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$api = Join-Path $raiz "apps\cloud-api"
Set-Location $api

$Host.UI.RawUI.WindowTitle = "Servidor NexoSoft - NO CERRAR mientras se usa el POS"

Titulo "Revisando"

# 1. El .env, que trae el puerto y la conexion a la base.
$envPath = Join-Path $api ".env"
if (-not (Test-Path $envPath)) {
    Feo "Falta $envPath. Sin eso el servidor no sabe con que base hablar."
    Read-Host "`nENTER para cerrar"
    exit 1
}
$lineas = Get-Content $envPath
function ValorEnv([string]$clave, $porDefecto) {
    $l = $lineas | Select-String "^$clave="
    if ($null -eq $l) { return $porDefecto }
    return ($l.ToString()).Substring("$clave=".Length).Trim()
}
$puerto = ValorEnv "PORT" "3000"
$dbUrl = ValorEnv "DATABASE_URL" ""
$puertoDb = if ($dbUrl -match ':(\d+)/') { $Matches[1] } else { "5432" }

# 2. PostgreSQL. Es el motivo mas comun de que el POS diga "error de servidor":
#    el cloud-api arranca, no puede conectarse y se cae solo.
if (-not (Get-NetTCPConnection -LocalPort $puertoDb -State Listen -ErrorAction SilentlyContinue)) {
    Feo "PostgreSQL no esta escuchando en el puerto $puertoDb."
    Write-Host "Arranca PostgreSQL primero (servicio de Windows o pgAdmin) y volve a intentar."
    Read-Host "`nENTER para cerrar"
    exit 1
}
Ok "PostgreSQL responde en el puerto $puertoDb"

# 3. Migraciones sin aplicar. Es el otro motivo silencioso de "Internal server
#    error": el servidor levanta perfecto y recien falla cuando alguien abre la
#    pantalla que usa la columna nueva. El 09/09/2026 costo cinco dias darse
#    cuenta de que la caja tiraba 500 y que las ventas no llegaban a los
#    reportes por esto. En un comercio las corre el actualizador; aca, nadie.
Titulo "Migraciones de la base"
$ErrorActionPreference = "Continue"
$estado = & corepack pnpm exec prisma migrate status 2>&1 | Out-String
$hayPendientes = $LASTEXITCODE -ne 0 -and $estado -match "have not yet been applied"
$ErrorActionPreference = "Stop"

if ($hayPendientes) {
    # Los nombres salen del bloque que imprime prisma, una por linea.
    $nombres = ($estado -split "`n") | Where-Object { $_ -match "^\d{14}_" } | ForEach-Object { $_.Trim() }
    Feo "La base esta atras del codigo: hay $($nombres.Count) migracion(es) sin aplicar."
    foreach ($n in $nombres) { Write-Host "  - $n" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "Si arranco asi, el servidor va a levantar igual pero las pantallas que usen" -ForegroundColor Yellow
    Write-Host "lo nuevo van a fallar con 'Internal server error', y las ventas pueden no" -ForegroundColor Yellow
    Write-Host "llegar a los reportes." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Aplicarlas solo agrega lo que falta hacia adelante: no borra datos ni resetea nada."
    $r = Read-Host "Las aplico ahora? (S/N)"
    if ($r -match '^[SsYy]') {
        Titulo "Aplicando migraciones"
        $ErrorActionPreference = "Continue"
        & corepack pnpm exec prisma migrate deploy
        $codigo = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
        if ($codigo -ne 0) {
            Feo "`nNo se pudieron aplicar (exit $codigo). El error esta arriba."
            Read-Host "`nENTER para cerrar"
            exit 1
        }
        Ok "Base al dia"
    } else {
        Write-Host "Sigo sin aplicarlas. Acordate de esto si algo tira 500." -ForegroundColor Yellow
    }
} else {
    Ok "La base esta al dia"
}

# 4. Que no haya otro servidor ya arriba: dos procesos en el mismo puerto es
#    un rato de confusion garantizado.
if (Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "Ya hay algo escuchando en el puerto $puerto." -ForegroundColor Yellow
    try {
        $salud = Invoke-RestMethod -Uri "http://localhost:$puerto/api/v1/health" -TimeoutSec 3
        Ok "Es el servidor de NexoSoft y esta funcionando (version $($salud.version))."
        Write-Host "`nNo hace falta hacer nada. El POS deberia andar." -ForegroundColor Green
    } catch {
        Feo "Pero no contesta como NexoSoft. Fijate que no sea otro programa."
    }
    Read-Host "`nENTER para cerrar"
    exit 0
}

# 5. Compilar si el codigo cambio despues del ultimo build. Arrancar un dist
#    viejo despues de tocar el backend es una forma silenciosa de perder media
#    hora.
$main = Join-Path $api "dist\main.js"
$hayQueCompilar = $true
if (Test-Path $main) {
    $buildEn = (Get-Item $main).LastWriteTime
    $fuenteMasNueva = Get-ChildItem (Join-Path $api "src") -Recurse -File -Include *.ts |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $hayQueCompilar = $null -ne $fuenteMasNueva -and $fuenteMasNueva.LastWriteTime -gt $buildEn
    if ($hayQueCompilar) { Write-Host "El codigo cambio despues del ultimo build." }
} else {
    Write-Host "No hay build todavia."
}

if ($hayQueCompilar) {
    Titulo "Compilando (tarda un minuto)"
    $ErrorActionPreference = "Continue"
    & corepack pnpm build
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($codigo -ne 0) {
        Feo "`nNo compilo (exit $codigo). El error esta arriba."
        Read-Host "`nENTER para cerrar"
        exit 1
    }
    Ok "Compilado"
} else {
    Ok "El build esta al dia"
}

Titulo "Arrancando el servidor"
Write-Host "Panel:  http://localhost:$puerto/" -ForegroundColor Green
Write-Host "Salud:  http://localhost:$puerto/api/v1/health" -ForegroundColor Green
Write-Host "`nDEJA ESTA VENTANA ABIERTA. Cerrarla detiene el servidor.`n" -ForegroundColor Yellow

& node dist\main.js

# Si llega aca es que el servidor se cayo: la ventana NO se cierra sola, para
# que se pueda leer por que.
Feo "`nEl servidor se detuvo (exit $LASTEXITCODE)."
Read-Host "ENTER para cerrar"
