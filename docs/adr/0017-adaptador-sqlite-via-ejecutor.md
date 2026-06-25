# ADR-0017: Adaptador SQLite detrás de un ejecutor, testeable sin Tauri

- **Estado:** Aceptada
- **Fecha:** 2026-06-25
- **Decisores:** Equipo NexoSoft

## Contexto

El POS persiste en **SQLite** (ADR-0004), pero la base la provee
`@tauri-apps/plugin-sql`, que **solo corre dentro de Tauri** (necesita Rust + VS
Build Tools para compilar). Queríamos:

1. Escribir el SQL **una sola vez** y que sirva igual en el POS (Tauri) y en los
   tests.
2. Poder **testear la persistencia de verdad** (que el esquema y las queries
   funcionan) **sin** Tauri ni Rust.

## Decisión

- Un puerto mínimo **`EjecutorSql`** (`ejecutar` / `consultar`, placeholders `?`).
  Los repositorios SQLite (`RepositorioArticulosSqlite`, etc.) dependen solo de
  ese puerto.
- **Dos adaptadores del ejecutor**:
  - en el POS, sobre `@tauri-apps/plugin-sql` (parte UI de 1.4b);
  - en los tests, sobre **`node:sqlite`** (SQLite real embebido en Node 24, con el
    flag `--experimental-sqlite` que Vitest pasa a los workers).
- El **esquema** vive en TS (`sqlite/esquema.ts`, sentencias ejecutables) con copia
  legible en `sql/esquema-sqlite.sql`. Dinero en **centavos** (enteros), cantidades
  en **texto** decimal (ADR-0007 / ADR-0015).

## Consecuencias

### Positivas

- La persistencia se prueba contra **SQLite real** sin Tauri (4 tests: round-trip
  de catálogo + `ServicioDeVenta` guardando venta/ítems/pagos y descontando stock).
- El mismo SQL corre en producción (Tauri) y en tests; bajo riesgo al cablear la UI.
- Avanzamos 1.4b aunque falten los VS Build Tools (bloqueo de disco).

### Negativas / costos

- `node:sqlite` es **experimental**: se usa **solo en tests**, no en producción.
- `vite@5` todavía no reconoce `node:sqlite` como módulo nativo; en el test se carga
  por `createRequire` para que Vite no intente resolverlo en build.
- La **transacción** de `confirmarVenta` la debe abrir el adaptador del ejecutor
  (Tauri/`plugin-sql`); el puerto no la impone (se aborda al cablear la UI).

## Alternativas consideradas

- **`better-sqlite3`** para tests — descartado: dependencia nativa que necesita
  compilar (node-gyp / MSVC), justo lo que estamos evitando.
- **Solo repos en memoria** — descartado: no valida el SQL ni el esquema reales.
- **Acoplar los repos a `plugin-sql`** — descartado: no se podrían testear sin Tauri.
