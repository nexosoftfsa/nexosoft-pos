# @nexosoft/pos-desktop

Cliente POS de escritorio. **Offline-first**: una venta se inicia, cobra e
imprime sin internet; el CAE se solicita a ARCA y la venta se sincroniza con el
servidor de sucursal al recuperar conexión.

## Stack

- **Tauri 2** (shell nativo, acceso a USB/serial para periféricos)
- **React + TypeScript + Vite** (UI)
- **SQLite** como fuente de verdad local (vía `@tauri-apps/plugin-sql`)
- `@nexosoft/domain` para tipos y lógica de negocio compartida
- `@nexosoft/hardware` para impresoras ESC/POS, balanzas y lectores
- `@nexosoft/sync` para la cola de operaciones y sincronización

## Sincronización (Fase 4.6)

La venta se cierra contra el SQLite local y se **encola** para subir al servidor
de sucursal ([ADR-0019](../../docs/adr/0019-topologia-servidor-de-sucursal-lan.md)).
La barra superior muestra un **indicador de estado** (Sincronizado / N pendientes
/ Sincronizando… / con error / Sin conexión) que sincroniza al volver la red y
cada cierto intervalo.

Adaptadores (en `src/sync/`):

| Pieza | En el navegador (dev) | En Tauri / producción |
| --- | --- | --- |
| `AlmacenDeOperaciones` (cola) | `AlmacenEnMemoria` | `AlmacenSqlite` (plugin-sql) |
| `ClienteDeSync` (transporte) | `ClienteSyncSimulado` | `ClienteSyncHttp` (servidor LAN) |

Ambos adaptadores reales (`AlmacenSqlite`, `ClienteSyncHttp`) están implementados
y testeados; se enchufan al cambiar la fábrica del entorno, sin tocar la UI.

## Prerrequisitos

- **Rust** (rustup) + toolchain `stable-x86_64-pc-windows-msvc` — instalado
- **WebView2** + **Build Tools de Visual Studio con C++** — instalados
- `corepack enable pnpm`

## Scripts

| Comando             | Descripción                              |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Vite (solo UI web, datos en memoria)     |
| `pnpm tauri:dev`    | App de escritorio en modo desarrollo     |
| `pnpm tauri:build`  | Compila el instalador nativo             |
| `pnpm typecheck`    | Chequeo de tipos                         |
| `pnpm test`         | Tests (Vitest)                           |

## Estado

- ✅ Fases 1-9 (catálogo, stock, fiscal, hardware, sync, shell/gestión completo,
  caja, cuentas corrientes, combos/lotes, promociones, presupuestos/remitos,
  asistente IA, impresión A4 y de etiquetas)
- ✅ Fase 10 (modo sin ARCA / `TicketNoFiscal`, importador de catálogo real,
  padrón multi-comercio, catálogo demo con datos reales del cliente)
- ✅ Fase 11 (instalación del primer cliente, agosto 2026): logo del comercio
  (login/sidebar/impresión/panel), gestión de usuarios desde la app (alta,
  rol, activar/desactivar — ver [ADR-0047](../../docs/adr/0047-registro-cerrado-salvo-alta-de-primer-admin.md)),
  alta de terminal desde la app, renovación periódica del access token
  (antes solo se pedía al loguearse — un turno largo terminaba en 401),
  vista previa imprimible del ticket chico (`ComprobanteTicket`, formato
  térmico ~80mm), reintento manual de operaciones de sync `fallida`
  (antes el botón "Sincronizar" las ignoraba para siempre), compatibilidad
  de esquema SQLite para bases instaladas antes de columnas nuevas.

**208 tests** (cola SQLite, clientes HTTP, sesión/token, mapeo, helpers de
UI). Ver [`docs/instalacion-primer-cliente.md`](../../docs/instalacion-primer-cliente.md)
para el paso a paso de instalación en un comercio nuevo.
