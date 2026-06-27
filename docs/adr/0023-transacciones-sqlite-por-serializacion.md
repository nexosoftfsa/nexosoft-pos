# ADR-0023: Transacciones en el POS por serialización del acceso a SQLite

- **Estado:** Aceptada
- **Fecha:** 2026-06-26
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0017 (puerto `EjecutorSql`), ADR-0022 (adaptador Tauri)

## Contexto

`confirmarVenta` (`ServicioDeVenta`) hace **varias escrituras encadenadas** —
venta + ítems + pagos y, por cada ítem, un movimiento de stock y la
actualización de existencia. El ADR-0017 ya dejó pendiente que el adaptador
SQLite las envuelva en una **transacción** para que se guarden juntas (o ninguna).

Al implementar el adaptador de producción (Tauri) revisamos la **fuente Rust** de
`@tauri-apps/plugin-sql` (`wrapper.rs`): cada `execute`/`select` hace
`pool.acquire()` sobre un `sqlx::Pool` con opciones por defecto (hasta 10
conexiones). Es decir: **`BEGIN` y los `INSERT` siguientes pueden caer en
conexiones distintas del pool**, con lo cual `BEGIN`/`COMMIT` emitidos en llamadas
separadas NO forman una transacción real. El plugin tampoco expone una API de
transacción interactiva ni permite configurar el tamaño del pool desde JS.

## Decisión

Hacer las transacciones **serializando el acceso** a la base en el cliente:

- `EjecutorSqlTauri` mantiene una **cola** (`Promise` encadenada) por la que pasan
  TODAS las operaciones (`ejecutar`, `consultar`, `transaccion`). Así nunca se
  solapan. Bajo acceso estrictamente serial, el pool de `sqlx` reutiliza su
  **única conexión ociosa**, por lo que `BEGIN` … `COMMIT` caen en la misma.
- `transaccion(fn)` reserva **un turno completo** en la cola: emite `BEGIN`,
  ejecuta `fn`, y `COMMIT` (o `ROLLBACK` si `fn` lanza). A `fn` se le pasa un
  ejecutor **directo** (sin cola) para que sus escrituras corran dentro del turno
  ya reservado y no se autobloqueen.
- El `ServicioDeVenta` del dominio **no cambia**. En el bootstrap de Tauri se lo
  envuelve en un decorador (`ServicioDeVentaTransaccional`) que corre
  `confirmarVenta` dentro de `ejecutor.transaccion(...)`, reconstruyendo los repos
  sobre el ejecutor directo de la transacción.

## Consecuencias

### Positivas

- `confirmarVenta` es **atómica**: si algo falla a mitad, ni la venta ni el
  descuento de stock quedan a medias. Probado con SQLite real (node:sqlite):
  COMMIT persiste, ROLLBACK descarta, y una operación externa no se intercala
  entre `BEGIN` y `COMMIT`.
- No requiere tocar el dominio ni escribir comandos Rust nuevos.
- La cola además evita corrupción por escrituras concurrentes (p. ej. el motor de
  sync corriendo mientras se confirma una venta).

### Negativas / costos

- El acceso a la base queda **serializado** (un cajero por terminal: el costo es
  irrelevante; las queries son chicas y locales).
- La atomicidad **depende del comportamiento del pool** (reutilizar la conexión
  ociosa bajo acceso serial). Si una versión futura del plugin precargara varias
  conexiones, habría que revisar. Mitigación: está encapsulado en un solo lugar y
  la verificación end-to-end se hace al correr la app (`tauri dev`/`build`).

## Alternativas consideradas

- **`BEGIN`/`COMMIT` sin serializar** — descartado: el pool no garantiza la misma
  conexión → no es atómico.
- **Una sola sentencia multi-statement** (`BEGIN; …; COMMIT;` en un `execute`) —
  descartado: el binding de parámetros de `sqlx` no es claro entre sentencias y la
  venta tiene forma variable (N ítems / N pagos).
- **Comando Rust dedicado con `pool.begin()`** — descartado por ahora: mueve
  lógica de negocio a Rust y obliga a recompilar; lo reconsideraríamos si la
  serialización resultara insuficiente.
