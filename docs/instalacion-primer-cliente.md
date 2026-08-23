# Instalación en el primer cliente — guía paso a paso

Checklist para instalar NexoSoft en la PC de Caja del cliente (que además
hace de servidor — ver [ADR-0019](adr/0019-topologia-servidor-de-sucursal-lan.md)).

## Dos lecciones de la primera instalación (no repetir)

- **Nunca copiar la carpeta del proyecto completa por USB.** `node_modules`
  tiene decenas de miles de archivos chiquitos: copiarlo por USB tarda
  muchísimo (casi una hora para "solo" 2GB la primera vez) y sus rutas
  superan el límite de Windows, lo que hace fallar la copia de subcarpetas
  a mitad de camino y deja una instalación a medio armar. **Siempre `git
  clone`** (paso 1) — el código fuente son unos pocos MB, `node_modules` se
  reinstala fresco en cada máquina con `pnpm install`. El pendrive es solo
  para los instaladores de Node/Git/PostgreSQL/WebView2 y el `.exe` del
  POS ya compilado — nunca para el código.
- **Los comandos sueltos, bajo presión de tiempo, se pierden.** Por eso los
  pasos 2 a 6 de abajo ahora son **un solo script**
  (`instalar-servidor-completo.ps1`) en vez de ~20 comandos a mano.

## 0. Prerrequisitos en la PC de Caja

Instalar (en este orden, next-next salvo donde se aclara):

1. **Node.js LTS** — https://nodejs.org
2. **Git para Windows** — https://git-scm.com/download/win
3. **PostgreSQL 16** — https://www.postgresql.org/download/windows/
   **Anotar la contraseña del superusuario `postgres`** que se define durante
   la instalación — el script del paso 2 la va a pedir.
4. **WebView2 Runtime** (si Windows no lo trae ya) — https://developer.microsoft.com/microsoft-edge/webview2/

Si no hay internet en el local, usar los instaladores del pendrive.

## 1. Traer el código

```powershell
git clone https://github.com/nexosoftfsa/nexosoft-pos.git C:\NexoSoft
cd C:\NexoSoft
```

(Nada de copiar carpetas — ver la lección de arriba.)

## 2. Servidor completo, en un solo comando

**Como Administrador** (clic derecho sobre PowerShell → Ejecutar como
administrador), parado en `C:\NexoSoft`:

```powershell
.\scripts\instalacion\instalar-servidor-completo.ps1 -NombreComercio "Nombre real del comercio" -AdminUsuario "admin" -AdminPassword "elegir-una-buena"
```

Va a pedir la contraseña de `postgres` una vez, y de ahí en más hace todo
solo: habilita rutas largas de Windows, `pnpm install`, crea el rol/base
`nexosoft`, genera `.env` con secretos aleatorios, migra, compila
`cloud-api` y el panel web, registra el servicio de Windows (arranca solo,
se reinicia solo), abre el firewall, y da de alta la sucursal + el primer
ADMIN. Al final imprime la IP de la PC (hace falta para Depósito/Oficina).

**Verificar**: abrir `http://localhost:3000/api/v1/health` — tiene que
decir `{"status":"ok"}`.

### Si el script falla a mitad de camino

Es más o menos idempotente: se puede volver a correr y salta lo que ya
esté hecho (rol/base existentes, `.env` existente). Si hay que hacer algo
suelto a mano, esto es lo que hace por dentro, en orden:

```powershell
corepack enable
corepack pnpm install
# crear rol+base "nexosoft" en Postgres, completar apps\cloud-api\.env
corepack pnpm --filter @nexosoft/cloud-api prisma:generate
corepack pnpm --filter @nexosoft/cloud-api exec prisma migrate deploy
corepack pnpm --filter @nexosoft/cloud-api build
$env:VITE_API_URL = "/api/v1"
corepack pnpm --filter @nexosoft/admin-web build
Copy-Item apps\admin-web\dist\* apps\cloud-api\panel -Recurse -Force
.\scripts\instalacion\instalar-servicio-servidor.ps1
.\scripts\instalacion\abrir-firewall-servidor.ps1
corepack pnpm --filter @nexosoft/cloud-api crear:sucursal -- --nombre "..."
# POST /auth/register con el id de la sucursal (ver el script para el body exacto)
```

## 3. Catálogo real

**Desde el POS**: Catálogo → **"Importar artículos"** → elegir el Excel, con
la opción de prueba (dry-run) tildada primero; revisar el resumen y recién
ahí confirmar. Es el único camino que funciona en las dos formas de
instalación (ADR-0042).

El comando de abajo **solo existe si el servidor se instaló clonando el
repo**: el paquete standalone (`C:\NexoSoft-Servidor`) no incluye
`importar-catalogo.mjs`.

```powershell
cd C:\NexoSoft\apps\cloud-api
corepack pnpm importar:catalogo -- --archivo "RUTA\AL\Migrar Articulos.xlsx" --email admin --password "la-de-arriba" --dry-run
```

## 4. Instalar el POS

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

## 5. Prueba final

Una venta de prueba, imprimir A4 y ticket chico, confirmar que el catálogo
completo está (711 artículos), y que el panel (`http://localhost:3000/`)
muestra el logo y los reportes.

## 6. Actualizar el servidor más adelante

Cuando salga una versión nueva del POS que dependa de código de servidor
nuevo (endpoints nuevos, etc.), hace falta actualizar también `cloud-api`.
Desde la v0.1.13 en adelante esto se puede hacer con un botón: en el POS de
la PC de Caja, **Configuración → Actualizaciones → "Actualizar servidor"**
(solo aparece en esa terminal, no en Depósito/Oficina). Pide confirmación,
Windows va a pedir permiso de administrador (UAC), y hace todo solo: respaldo
de la base, `git pull`, migración, recompilación y reinicio del servicio —
ver [ADR-0053](adr/0053-actualizacion-del-servidor-desde-el-pos.md). Hacerlo
con el negocio cerrado o sin ventas activas.

Si preferís hacerlo a mano (o estás en una versión anterior a la 0.1.13),
correr `scripts\actualizacion\actualizar-servidor.ps1` como Administrador
hace lo mismo.

## 7. (Opcional) Acceso al panel desde fuera de la LAN

Si el dueño quiere ver el panel de reportes desde el celular fuera del
local, cada comercio tiene su propia dirección fija
(`https://<comercio>.nexosoft.com.ar`) atendida por un túnel de Cloudflare.
El alta se hace con un **código de activación** que generamos nosotros: se
pega en la pantalla "Acceso remoto (opcional)" del instalador, o después
desde el POS (Configuración → Acceso remoto). Ver
[acceso-remoto-cloudflare.md](acceso-remoto-cloudflare.md) (Fase 17.A /
[ADR-0055](adr/0055-acceso-remoto-tunel-con-nombre-por-comercio.md)).
No es necesario para que el resto del sistema funcione.
