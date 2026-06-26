/**
 * @nexosoft/sync
 * Capa de sincronización offline-first entre el SQLite del POS y el cloud-api.
 *
 * Modelo: cola de operaciones (outbox) con identidad de origen (terminal) e
 * idempotencia por `operacionId`. Resolución de conflictos por agregado en el
 * servidor (ver ADR-0005). Ver README del paquete.
 */
export const SYNC_PACKAGE = "@nexosoft/sync";

export type {
  TipoOperacion,
  EstadoOperacion,
  OperacionSync,
  OperacionEnCola,
  ResultadoEnvio,
  ResumenSync,
} from "./tipos";
export type { AlmacenDeOperaciones } from "./almacen-de-operaciones";
export type { ClienteDeSync } from "./cliente-de-sync";
export { AlmacenEnMemoria } from "./almacen-en-memoria";
export { MotorDeSincronizacion, type OpcionesSync } from "./motor-de-sincronizacion";
