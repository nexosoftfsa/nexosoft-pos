# ADR-0022: Adaptador `EjecutorSql` sobre `@tauri-apps/plugin-sql` y reescritura de placeholders

- **Estado:** Aceptada
- **Fecha:** 2026-06-26
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0004 (SQLite offline), ADR-0017 (puerto `EjecutorSql`)

## Contexto

En Fase 5 llevamos el POS de la demo-en-navegador a la **app Tauri instalable**.
El puerto `EjecutorSql` (ADR-0017) ya tiene dos consumidores —los repositorios
SQLite y la cola de sync (`AlmacenSqlite`)— y un adaptador de **tests** sobre
`node:sqlite`. Faltaba el adaptador de **producción**: el que corre dentro de
Tauri sobre `@tauri-apps/plugin-sql`.

Al implementarlo aparecieron dos incompatibilidades del plugin contra el SQL que
ya escribimos:

1. **Placeholders.** Todo nuestro SQL (esquema y repos) usa placeholders
   posicionales **`?`** (estilo SQLite nativo, el que entiende `node:sqlite` de
   los tests). Pero `@tauri-apps/plugin-sql` se apoya en **`sqlx`**, que para el
   driver SQLite espera la sintaxis **`$1, $2, …`** (su README es explícito:
   *"sqlite and postgres use the `$#` syntax"*). Pasar `?` falla o liga mal.
2. **Claves foráneas.** SQLite abre cada conexión con `foreign_keys = OFF`. El
   esquema (`esquema.ts`) delega explícitamente en el adaptador activarlas.

## Decisión

- Un adaptador **`EjecutorSqlTauri`** (en `apps/pos-desktop/src/datos/`) que
  implementa `EjecutorSql` sobre el `Database` del plugin.
- **Reescribir los placeholders** `?` → `$1, $2, …` en una función pura
  (`reescribirPlaceholders`), por número de aparición, antes de delegar en
  `execute`/`select`. Así los repos y el esquema siguen escribiéndose **una sola
  vez** con `?` y sirven igual en tests (`node:sqlite`) y producción (Tauri).
  - **Supuesto:** el SQL del proyecto no contiene `?` dentro de literales de
    texto. Se cumple hoy (revisado en `esquema.ts` y los repos); si en el futuro
    hiciera falta, el reemplazo debería saltar literales entre comillas.
- **Activar `PRAGMA foreign_keys = ON`** al abrir (`EjecutorSqlTauri.abrir`).
- El **cargador de la base es inyectable** (`CargadorSql`); por defecto hace un
  `import()` **dinámico** del plugin (para no cargar `@tauri-apps/plugin-sql`
  fuera de la app nativa) y en los tests se pasa un doble. Así el adaptador se
  prueba sin Tauri.
- Detección de entorno **`estaEnTauri()`** (presencia de `__TAURI_INTERNALS__`)
  para que el bootstrap elija SQLite+HTTP en Tauri y memoria+simulado en el
  navegador (se usa en 5.2).

## Consecuencias

### Positivas

- El mismo SQL corre en tests y en producción; cero reescritura de los repos.
- El adaptador es testeable sin Tauri (9 tests: reescritura de placeholders,
  PRAGMA al abrir, reenvío de params, cierre, detección de entorno).
- La diferencia de sintaxis de `sqlx` queda **encapsulada en un solo lugar**.

### Negativas / costos

- La reescritura de placeholders es un punto a recordar: SQL con `?` literal en
  un string rompería el supuesto (mitigado: documentado y cubierto por tests).
- El plugin usa un **pool de conexiones**: las transacciones multi-sentencia
  (p. ej. `confirmarVenta`: venta + ítems + pagos + movimientos) no son atómicas
  con `execute` sueltos. Se aborda al cablear el `ServicioDeVenta` en **5.2**.

## Alternativas consideradas

- **Cambiar todos los repos a `$1`** — descartado: rompería el adaptador de tests
  `node:sqlite` (que usa `?`) y acoplaría el SQL del dominio a `sqlx`.
- **Usar las migraciones del plugin** (`add_migrations` en Rust) en vez de correr
  `esquema.ts` desde JS — descartado por ahora: queremos una sola fuente de verdad
  del esquema en TS y poder sembrar/migrar desde la capa de aplicación.
