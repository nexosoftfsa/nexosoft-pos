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
| `sesion-sqlite.ts` | Tabla `sesion` (fila única): persiste tokens + terminal elegida. |
| `sesion.ts` | `SesionManager`: login, refresh (lee el `exp` del JWT), elegir terminal, `obtenerToken`/`terminalId`. |

El transporte y mapeo viven en `../sync/`: `cliente-catalogo-http.ts`, `mapeo-catalogo.ts`,
`cliente-auth-http.ts` (`POST /auth/login`,`/refresh`) y `cliente-terminales-http.ts`
(`GET /terminales`). `App.tsx` elige el bootstrap con `estaEnTauri()`: en el navegador
es demo en memoria sin login; en Tauri es una máquina de fases **login → terminal → POS**,
y ahí el pull y la sync corren con el token real.

## Pendiente (Fase 5)

- **5.4** — configuración (carpeta de respaldo + datos del comercio; hoy `BASE_URL`
  del servidor está fija en `App.tsx`).
- **5.5** — instalador NSIS.
