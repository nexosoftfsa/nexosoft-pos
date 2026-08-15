# Instalación en el primer cliente — guía paso a paso

Checklist para instalar NexoSoft en la PC de Caja del cliente (que además
hace de servidor — ver [ADR-0019](adr/0019-topologia-servidor-de-sucursal-lan.md)).

## 0. Prerrequisitos en la PC de Caja

Instalar (en este orden, next-next salvo donde se aclara):

1. **Node.js LTS** — https://nodejs.org
2. **Git para Windows** — https://git-scm.com/download/win
3. **PostgreSQL 16** — https://www.postgresql.org/download/windows/
   **Anotar la contraseña del superusuario `postgres`** que se define durante
   la instalación — hace falta más abajo.
4. **WebView2 Runtime** (si Windows no lo trae ya) — https://developer.microsoft.com/microsoft-edge/webview2/

Si no hay internet en el local, usar los instaladores del pendrive.

## 1. Traer el código

Abrir PowerShell y correr:

```powershell
corepack enable
git clone https://github.com/nexosoftfsa/nexosoft-pos.git C:\NexoSoft
cd C:\NexoSoft
corepack pnpm install
```

## 2. Configurar `.env`

```powershell
Copy-Item .env.example apps\cloud-api\.env
notepad apps\cloud-api\.env
```

Completar como mínimo:
- `DATABASE_URL=postgresql://postgres:<password-que-pusiste>@localhost:5432/nexosoft`
  (o crear un rol dedicado `nexosoft`, como se hizo en las pruebas — ver
  `git log` del commit `8b47f8b` para el procedimiento si hace falta).
- `JWT_SECRET` y `JWT_REFRESH_SECRET`: cualquier cadena larga random (no
  usar las de `.env.example`). Se pueden generar así:
  ```powershell
  -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
  ```
- El resto (`ARCA_ENV`, `GEMINI_API_KEY`, `PAGOS_PROVIDER`, etc.) puede
  quedar como está en `.env.example` — no hace falta para vender hoy.

## 3. Base de datos

```powershell
cd C:\NexoSoft\apps\cloud-api
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE nexosoft;"
corepack pnpm prisma:generate
corepack pnpm exec prisma migrate deploy
corepack pnpm build
```

## 4. Servidor como servicio de Windows (arranca solo, se reinicia solo)

**Como Administrador:**

```powershell
cd C:\NexoSoft
.\scripts\instalacion\instalar-servicio-servidor.ps1
.\scripts\instalacion\abrir-firewall-servidor.ps1
```

El segundo script muestra la IP de esta PC en la red local — **anotarla**,
hace falta para configurar Depósito/Oficina.

Verificar que responda: abrir `http://localhost:3000/api/v1/health` en el
navegador — tiene que decir `{"status":"ok"}`.

## 5. Dar de alta el comercio

```powershell
cd C:\NexoSoft\apps\cloud-api
corepack pnpm crear:sucursal -- --nombre "Nombre real del comercio"
```

Copiar el `id` que devuelve, y con eso el primer ADMIN:

```powershell
$body = @{
  email = "admin"          # o el usuario que prefieran, sin @ (no hace falta)
  nombreDisplay = "Nombre del dueño"
  password = "elegir-una-buena"
  rol = "ADMIN"
  sucursalId = "PEGAR_EL_ID_DE_ARRIBA"
} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/register" -Method Post -Body $body -ContentType "application/json"
```

## 6. Catálogo real

```powershell
corepack pnpm importar:catalogo -- --archivo "RUTA\AL\Migrar Articulos.xlsx" --email admin --password "la-de-arriba" --dry-run
```

Revisar que no haya sorpresas y correr de nuevo **sin** `--dry-run`.

## 7. Instalar el POS

Copiar `NexoSoft POS_0.1.0_x64-setup.exe` a la PC (ya viene compilado, no
hace falta Rust ni nada acá) e instalarlo. Repetir en Depósito y Oficina si
corresponde hoy.

En cada instalación, al loguearse por primera vez:
- **Configuración del servidor**: `http://localhost:3000/api/v1` en la
  Caja, `http://<IP-de-la-caja>:3000/api/v1` en Depósito/Oficina.
- Cargar razón social, CUIT, condición IVA, punto de venta, **logo**.
- **Dejar destildado** "Ya está de alta en ARCA".
- Elegir/crear la terminal ("Caja 1", "Depósito", "Oficina" — el botón
  "+ Agregar" en esa pantalla lo hace sin volver a Postman/curl).

## 8. Prueba final

Una venta de prueba, imprimir A4 y ticket chico, confirmar que el catálogo
completo está (711 artículos), y que el panel (`http://localhost:3000/`)
muestra el logo y los reportes.
