# ADR-0016: Capa de aplicación con puertos de repositorio

- **Estado:** Aceptada
- **Fecha:** 2026-06-25
- **Decisores:** Equipo NexoSoft

## Contexto

El dominio (`@nexosoft/domain`) calcula (dinero, IVA, comprobantes, stock) pero no
sabe **persistir** ni **orquestar** un caso de uso completo como "vender": resolver
precios del catálogo, calcular el comprobante, cobrar y descontar stock.

Hace falta una capa por encima del dominio y por debajo de la UI. Además, el POS
guarda en **SQLite** (offline, ADR-0004) y el backend en **PostgreSQL**: la lógica
del caso de uso no debe atarse a ninguna de las dos. Y queremos poder **testear el
flujo de venta sin una base real**.

## Decisión

Nuevo paquete **`@nexosoft/app`** (capa de aplicación) con:

- **Puertos de persistencia** (interfaces `Repositorio*`): el caso de uso depende
  de **contratos**, no de una base. Asincrónicos (la persistencia real lo es).
- **Adaptadores en memoria** (`crearRepositoriosMemoria`) para tests y prototipo.
- **`ServicioDeVenta`** con `previsualizarVenta` (totales para la pantalla) y
  `confirmarVenta` (valida cobro/stock, persiste en `PENDIENTE_CAE`, descuenta
  stock).
- El **esquema SQLite** documentado (`sql/esquema-sqlite.sql`) como contrato del
  adaptador real (Fase 1.4b).

Es una **arquitectura de puertos y adaptadores**: la UI (Tauri) y el backend
(NestJS) reutilizan el mismo servicio; sólo cambia el adaptador de repositorio.

## Consecuencias

### Positivas

- El flujo de venta se **testea sin base** (11 tests con repos en memoria).
- Pasar a SQLite (1.4b) o a PostgreSQL no toca el caso de uso, sólo el adaptador.
- Una sola implementación de "armar/confirmar venta" para POS y backend.

### Negativas / costos

- Un paquete más en el monorepo y una capa de indirección (puertos).
- La **atomicidad** de `confirmarVenta` (venta + movimientos + existencias) la
  garantiza el adaptador: el SQLite/Tauri debe usar una transacción. En memoria se
  valida el stock antes de persistir para no dejar estados a medias.

## Alternativas consideradas

- **Meter la lógica de caso de uso en la UI (Tauri/React)** — descartado: no
  reutilizable por el backend y difícil de testear sin levantar la app.
- **Acceder a SQLite directamente desde el dominio** — descartado: ata el dominio
  a una base y rompe el offline/multi-backend.
- **Repos sincrónicos** — descartado: la persistencia real (SQLite/Tauri, Postgres)
  es asincrónica; mejor que el contrato lo refleje desde el principio.
