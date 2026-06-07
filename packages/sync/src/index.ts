/**
 * @nexosoft/sync
 * Capa de sincronización offline-first entre el SQLite del POS y el cloud-api.
 *
 * Modelo: cola de operaciones (outbox) + log de cambios con marca temporal e
 * identidad de origen (sucursal/terminal). Resolución de conflictos por entidad
 * (ver ADR-0005), no "last-write-wins" ciego.
 *
 * Contenido previsto (Fase 1+):
 *  - Outbox: persistencia y reintento de operaciones locales.
 *  - Pull/push con el backend y reconciliación.
 *  - Políticas de conflicto por agregado (stock, precios, comprobantes).
 *
 * Ver ADR-0005 (estrategia de sincronización).
 */
export const SYNC_PACKAGE = "@nexosoft/sync";
