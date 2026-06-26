import type { EstadoOperacion, OperacionEnCola, OperacionSync } from "./tipos";

/**
 * Puerto de persistencia de la cola (outbox).
 *
 * En el POS lo implementa un adaptador sobre SQLite (la cola sobrevive a cierres
 * y cortes de luz). En tests/dev se usa `AlmacenEnMemoria`.
 */
export interface AlmacenDeOperaciones {
  /** Encola una operación nueva como `pendiente`. Idempotente por `operacionId`. */
  encolar(op: OperacionSync): Promise<void>;

  /** Operaciones en estado `pendiente`, de la más vieja a la más nueva. */
  pendientes(limite?: number): Promise<OperacionEnCola[]>;

  /** Cambia el estado (y, opcionalmente, intentos/último error) de una operación. */
  marcar(
    operacionId: string,
    estado: EstadoOperacion,
    datos?: { readonly intentos?: number; readonly ultimoError?: string },
  ): Promise<void>;

  obtener(operacionId: string): Promise<OperacionEnCola | undefined>;

  todas(): Promise<OperacionEnCola[]>;
}
