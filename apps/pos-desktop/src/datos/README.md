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
| `ejecutor-sql-tauri.ts` | Adaptador de `EjecutorSql` (@nexosoft/app) sobre `@tauri-apps/plugin-sql`. Reescribe placeholders `?` → `$N` (ver ADR-0022), activa `foreign_keys`, e incluye `estaEnTauri()`. |
| `bootstrap.ts` | Fábrica del `EntornoPos` para el navegador (memoria + simulado). |

## Pendiente (Fase 5)

- **5.2** — `bootstrap-tauri.ts`: `EjecutorSqlTauri` → repos SQLite + `AlmacenSqlite`
  + `ClienteSyncHttp`, con transacción real en `confirmarVenta`.
- **5.2b** — pull de catálogo+stock desde el servidor de sucursal.
- **5.3** — login JWT + selección de terminal.
- **5.4** — configuración (carpeta de respaldo + datos del comercio).
