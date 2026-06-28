# `datos/` — Capa de datos del POS

Cablea la persistencia y el arranque del entorno del POS. Hay **dos modos** y la
UI no cambia entre ellos:

- **Navegador (desarrollo):** repos en memoria + cliente de sync simulado
  (`bootstrap.ts` → `crearEntornoPos`). Sirve para iterar la UI sin Tauri.
- **Tauri (producción):** SQLite real + sync HTTP contra el servidor de sucursal.
  Se elige según `estaEnTauri()`.

## Piezas

| Archivo | Rol |
| ------- | --- |
| `ejecutor-sql-tauri.ts` | Adaptador de `EjecutorSql` (@nexosoft/app) sobre `@tauri-apps/plugin-sql`. Reescribe placeholders `?` → `$N` (ADR-0022), activa `foreign_keys`, ofrece `transaccion()` serializada (ADR-0023) e incluye `estaEnTauri()`. |
| `bootstrap.ts` | Fábrica del `EntornoPos` para el navegador (memoria + simulado). Exporta la semilla demo (`construirSemillaDemo`, `CONFIG_DEMO`) que reusa Tauri. |
| `bootstrap-tauri.ts` | Fábrica del `EntornoPos` de producción: SQLite + sync HTTP. Siembra inicial idempotente, lectura de config/catálogo y `ServicioDeVentaTransaccional`. |

`App.tsx` elige el bootstrap con `estaEnTauri()` y muestra estados de carga/error.

## Pendiente (Fase 5)

- **5.2b** — pull de catálogo+stock desde el servidor de sucursal (reemplaza la
  siembra demo de `sembrarSiVacio`).
- **5.3** — login JWT + selección de terminal (hoy `terminalId` y token son fijos/nulos).
- **5.4** — configuración (carpeta de respaldo + datos del comercio).
- **5.5** — instalador NSIS.
