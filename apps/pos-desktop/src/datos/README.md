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
| `bootstrap-tauri.ts` | Fábrica del `EntornoPos` de producción: SQLite + sync HTTP. Asegura maestros, hace el pull del catálogo (o siembra demo de fallback), lee config/catálogo y arma `ServicioDeVentaTransaccional`. |
| `catalogo-pull.ts` | `sincronizarCatalogo`: vuelca el catálogo del servidor en los repos locales (catálogo authoritative; stock que respeta ventas offline). |

El transporte y mapeo del pull viven en `../sync/`: `cliente-catalogo-http.ts`
(`GET /productos`, `GET /stock`) y `mapeo-catalogo.ts` (producto remoto → dominio).
`App.tsx` elige el bootstrap con `estaEnTauri()` y muestra estados de carga/error.

> **Nota 5.2b:** el pull está cableado pero **gated por el token** (`obtenerToken`).
> Hasta el login (5.3) el token es null → corre el fallback demo. Con sesión, el
> pull aprovisiona la terminal y luego refresca el catálogo en cada arranque.

## Pendiente (Fase 5)

- **5.3** — login JWT + selección de terminal (habilita el pull; hoy `terminalId`
  y token son fijos/nulos).
- **5.4** — configuración (carpeta de respaldo + datos del comercio).
- **5.5** — instalador NSIS.
