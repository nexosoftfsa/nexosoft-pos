/**
 * Tipos de la capa de sincronización (outbox). Ver ADR-0005.
 */

/** Tipos de operación sincronizable. Extensible (alta de producto, ajuste, etc.). */
export type TipoOperacion = "venta";

export type EstadoOperacion = "pendiente" | "enviando" | "completada" | "fallida";

/** Operación local pendiente de subir al servidor de sucursal. */
export interface OperacionSync {
  /** UUID generado en el POS: garantiza idempotencia en el servidor. */
  readonly operacionId: string;
  readonly tipo: TipoOperacion;
  /** Datos de la operación (p. ej. el cuerpo de la venta). */
  readonly payload: unknown;
  /** Caja que originó la operación. */
  readonly terminalId: string;
  /** Marca temporal lógica (ISO). */
  readonly creadaEn: string;
}

/** Operación tal como vive en la cola, con su estado de sincronización. */
export interface OperacionEnCola extends OperacionSync {
  estado: EstadoOperacion;
  intentos: number;
  ultimoError?: string;
}

/** Resultado del envío de UNA operación, devuelto por el servidor. */
export type ResultadoEnvio =
  | { readonly ok: true; readonly idRemoto?: string }
  | { readonly ok: false; readonly error: string; readonly reintentable: boolean };

/** Resumen de una corrida de sincronización. */
export interface ResumenSync {
  readonly enviadas: number;
  readonly completadas: number;
  readonly fallidas: number;
  readonly pendientes: number;
}
