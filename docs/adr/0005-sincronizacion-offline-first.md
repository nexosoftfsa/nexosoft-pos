# ADR-0005: Estrategia de sincronización offline-first

- **Estado:** Aceptada (MVP de **una sola sucursal** — confirmado 2026-06-07)
- **Fecha:** 2026-06-07

## Contexto

El POS opera offline y debe conciliar con el backend al recuperar conexión.
Necesitamos orden de cambios, idempotencia y **resolución de conflictos** que
respete la semántica del negocio (el stock no se concilia igual que un precio o
un comprobante). El alcance multi-sucursal cambia fuerte la complejidad.

## Decisión

Para el MVP, **implementación propia** basada en:
- **Outbox / cola de operaciones** con `operacionId` (idempotencia) y reintentos.
- **Resolución de conflictos por agregado**:
  - *Comprobantes*: inmutables una vez emitidos; nunca se sobrescriben.
  - *Stock*: se concilia como **delta/movimientos**, no como valor absoluto.
  - *Precios/Catálogo*: autoridad del backend (last-write del backend gana).
- Identidad de origen (sucursal/terminal) y marca temporal lógica.

Se **reevalúa** adoptar **PowerSync / ElectricSQL / RxDB** si el alcance
multi-sucursal con sincronización en tiempo real lo justifica.

## Consecuencias

### Positivas
- Control total de la semántica de conflictos (clave en lo fiscal/stock).
- Sin acoplarse tempranamente a un servicio de sync externo.

### Negativas / costos
- Más código propio que mantener y testear.
- Si luego se adopta una solución dedicada, hay costo de migración.

## Alternativas consideradas

- **PowerSync / ElectricSQL** — sync SQLite↔Postgres muy potente, pero agregan
  infraestructura y "magia" de conflictos genérica que puede chocar con reglas
  fiscales/stock; reservadas para escalar multi-sucursal.
- **RxDB** — buena para web/PWA replicada, menos alineada con SQLite nativo+Tauri.
- **Last-write-wins global** — simple pero inseguro para stock y comprobantes.
