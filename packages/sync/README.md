# @nexosoft/sync

Sincronización **offline-first**: el POS opera 100% contra su SQLite local y esta
capa concilia con el backend cuando hay conexión.

## Diseño

- **Outbox / cola de operaciones**: cada operación local se persiste y se
  reintenta hasta confirmarse (idempotencia por `operacionId`).
- **Resolución de conflictos por agregado**, no genérica: el stock se concilia
  distinto que un precio o un comprobante (ver ADR-0005).
- Identidad de origen (sucursal + terminal) y reloj lógico para ordenar cambios.

## Decisión pendiente (ADR-0005)

Implementación propia vs. **PowerSync / ElectricSQL / RxDB**. En Fase 0 se deja
la interfaz y la evaluación; la elección se confirma con tus respuestas (sobre
todo multi-sucursal sí/no).

## Estado

🔜 Fase 1 (outbox básico para ventas/stock) y se profundiza en Fase 6.
