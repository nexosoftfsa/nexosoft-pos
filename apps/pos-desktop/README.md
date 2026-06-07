# @nexosoft/pos-desktop

Cliente POS de escritorio. **Offline-first**: una venta se inicia, cobra e
imprime sin internet; el CAE se solicita a ARCA al recuperar conexión.

## Stack

- **Tauri 2** (shell nativo, acceso a USB/serial para periféricos)
- **React + TypeScript + Vite** (UI)
- **SQLite** como fuente de verdad local (vía `@tauri-apps/plugin-sql`)
- `@nexosoft/domain` para tipos y lógica de negocio compartida
- `@nexosoft/hardware` para impresoras ESC/POS, balanzas y lectores
- `@nexosoft/sync` para la cola de operaciones y sincronización

## Prerrequisitos (IMPORTANTE)

El cliente Tauri **requiere la toolchain de Rust**, que en este entorno **no
está instalada**. Antes de la Fase 1:

1. Instalar Rust: https://www.rust-lang.org/tools/install (`rustup`)
2. Dependencias de sistema de Tauri (Windows: **WebView2** + **Build Tools de
   Visual Studio con C++**): https://v2.tauri.app/start/prerequisites/
3. Habilitar pnpm: `corepack enable pnpm`

> El proyecto `src-tauri/` (Rust) **todavía no está generado**. Se inicializa al
> comienzo de la Fase 1 con `pnpm dlx @tauri-apps/cli@latest init` para no
> introducir binarios/artefactos antes de tiempo.

## Scripts

| Comando             | Descripción                              |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Vite (solo UI web, sin shell nativo)     |
| `pnpm tauri:dev`    | App de escritorio en modo desarrollo     |
| `pnpm tauri:build`  | Compila el instalador nativo             |
| `pnpm test`         | Tests (Vitest)                           |

## Estado

🔜 Pendiente de Fase 1 (Catálogo + Stock + POS offline).
