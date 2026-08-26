# Genera la clave privada y el CSR (PKCS#10) para pedirle a ARCA el
# certificado de facturación electrónica.
#
# El CSR es un "pedido de certificado": lleva los datos del contribuyente y la
# clave PÚBLICA. Se sube a ARCA, ARCA lo firma y devuelve un .crt. La clave
# PRIVADA nunca sale de esta máquina — es lo que después demuestra que somos
# nosotros al pedir el ticket de acceso (WSAA).
#
# Lo que hace fallar a casi todos es el "subject": ARCA exige un formato
# exacto, con la palabra CUIT adelante del número y sin guiones. Por eso esto
# es un script y no un comando para copiar y pegar.
#
# Uso:
#   .\generar-csr-arca.ps1 -Cuit "20-35678007-9" -RazonSocial "Rivarola Sergio Sebastian" -Alias "NexoSoft-Prueba"
#
# No pisa nada: si ya hay una clave en el destino, se planta. Regenerar la
# clave invalida el certificado que ARCA ya haya emitido para la anterior.

param(
    [Parameter(Mandatory = $true)][string]$Cuit,
    [Parameter(Mandatory = $true)][string]$RazonSocial,
    [string]$Alias = "nexosoft",
    [ValidateSet("homologacion", "produccion")][string]$Entorno = "homologacion",
    [string]$Destino
)

$ErrorActionPreference = "Stop"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "OK: $t" -ForegroundColor Green }
function Aviso($t) { Write-Host $t -ForegroundColor Yellow }

# --- openssl -----------------------------------------------------------------
# En Windows no suele estar en el PATH, pero viene adentro de Git for Windows,
# que en esta casa siempre está instalado.
function BuscarOpenssl {
    $enPath = Get-Command openssl.exe -ErrorAction SilentlyContinue
    if ($enPath) { return $enPath.Source }
    $candidatos = @()
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($git) {
        $raizGit = Split-Path (Split-Path $git.Source -Parent) -Parent
        $candidatos += (Join-Path $raizGit "mingw64\bin\openssl.exe")
        $candidatos += (Join-Path $raizGit "usr\bin\openssl.exe")
    }
    $candidatos += "C:\Program Files\Git\mingw64\bin\openssl.exe"
    $candidatos += "C:\Program Files\Git\usr\bin\openssl.exe"
    $candidatos += "C:\Program Files\OpenSSL-Win64\bin\openssl.exe"
    foreach ($c in $candidatos) { if (Test-Path $c) { return $c } }
    return $null
}

# --- CUIT --------------------------------------------------------------------
# Se valida el dígito verificador acá y no en ARCA: un CUIT mal tipeado da un
# certificado que autentica contra nada, y eso se descubre recién al primer
# intento de facturar.
function CuitValido([string]$digitos) {
    if ($digitos -notmatch '^\d{11}$') { return $false }
    $pesos = @(5, 4, 3, 2, 7, 6, 5, 4, 3, 2)
    $suma = 0
    for ($i = 0; $i -lt 10; $i++) { $suma += [int]::Parse($digitos[$i]) * $pesos[$i] }
    $resto = $suma % 11
    $verificador = 11 - $resto
    if ($verificador -eq 11) { $verificador = 0 }
    if ($verificador -eq 10) { $verificador = 9 }
    return ([int]::Parse($digitos[10]) -eq $verificador)
}

$openssl = BuscarOpenssl
if (-not $openssl) {
    Write-Host "ERROR: no encontré openssl.exe. Instalá Git for Windows (lo trae adentro) o OpenSSL." -ForegroundColor Red
    exit 1
}

$cuitDigitos = ($Cuit -replace '[^\d]', '')
if (-not (CuitValido $cuitDigitos)) {
    Write-Host "ERROR: '$Cuit' no es un CUIT válido (11 dígitos y dígito verificador correcto)." -ForegroundColor Red
    exit 1
}

if (-not $Destino) { $Destino = Join-Path $env:USERPROFILE ".nexosoft\arca\$Alias" }
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$claveePath = Join-Path $Destino "$Alias.key"
$csrPath = Join-Path $Destino "$Alias.csr"

if (Test-Path $claveePath) {
    Write-Host "ERROR: ya existe $claveePath." -ForegroundColor Red
    Write-Host "Generar una clave nueva invalida el certificado que ARCA haya emitido para la anterior." -ForegroundColor Red
    Write-Host "Si de verdad querés empezar de cero, movelo a otro lado primero." -ForegroundColor Red
    exit 1
}

Titulo "Datos del pedido"
# El formato del subject lo fija ARCA: O = razón social del contribuyente,
# CN = un nombre para identificar el sistema, y serialNumber con la palabra
# CUIT, un espacio y los 11 dígitos SIN guiones.
$subject = "/C=AR/O=$RazonSocial/CN=$Alias/serialNumber=CUIT $cuitDigitos"
Write-Host "  openssl : $openssl"
Write-Host "  CUIT    : $cuitDigitos"
Write-Host "  Subject : $subject"
Write-Host "  Entorno : $Entorno"
Write-Host "  Destino : $Destino"

Titulo "Generando la clave privada (RSA 2048)"
& $openssl genrsa -out $claveePath 2048
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: falló la generación de la clave." -ForegroundColor Red; exit 1 }
Ok "Clave privada: $claveePath"

Titulo "Generando el CSR"
& $openssl req -new -key $claveePath -subj $subject -out $csrPath
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: falló la generación del CSR." -ForegroundColor Red; exit 1 }
Ok "CSR: $csrPath"

Titulo "Verificando lo que quedó"
& $openssl req -in $csrPath -noout -subject

Titulo "Qué sigue"
Write-Host "1. Subí este archivo a ARCA, en 'Administración de Certificados Digitales':"
Write-Host "     $csrPath" -ForegroundColor Green
if ($Entorno -eq "homologacion") {
    Aviso "   OJO: para PROBAR (homologación) el certificado NO se pide por Clave Fiscal,"
    Aviso "   se pide en WSASS: https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx"
    Aviso "   El de Clave Fiscal es el de PRODUCCION, y no sirve contra los servidores de prueba."
}
Write-Host "2. Guardá el .crt que te devuelve ARCA al lado de la clave, en $Destino"
Write-Host "3. En ARCA, 'Administrador de Relaciones': asociá el servicio de"
Write-Host "   Facturación Electrónica (WSFEv1) a ESE certificado. Sin este paso el"
Write-Host "   certificado autentica pero no puede facturar."
Write-Host ""
Aviso "La clave privada ($Alias.key) es irreemplazable: si se pierde hay que pedir"
Aviso "un certificado nuevo. Guardala fuera de esta PC tambien. NUNCA va al repo."
