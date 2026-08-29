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

  /**
   * Vuelve a poner en `pendiente` (intentos en 0) las operaciones `fallida`
   * — las que agotaron los reintentos automáticos y quedaron sin ninguna
   * forma de reintentarse. Pensado para un reintento MANUAL (botón
   * "Sincronizar"), no automático: una operación rota de verdad (ej. un
   * conflicto de datos) volvería a fallar sola en la próxima corrida
   * periódica si esto se llamara automáticamente, sin que nadie se entere.
   * Devuelve cuántas operaciones se reactivaron.
   */
  reintentarFallidas(): Promise<number>;

  /**
   * Saca de la cola las operaciones `fallida`. Devuelve cuántas sacó.
   *
   * Para las que **no pueden entrar nunca**: su payload es una foto del momento
   * de la venta, y si apunta a datos que el servidor ya no tiene (un catálogo
   * reemplazado, un servidor reinstalado), reintentarlas da siempre el mismo
   * rechazo. Mientras siguen ahí, el contador de errores queda encendido para
   * siempre y **tapa cualquier falla nueva**: pasa de 1167 a 1168 y nadie lo ve.
   *
   * Sólo saca la copia encolada. **La venta sigue guardada en la terminal**: lo
   * que se pierde es el intento de subirla, no la venta.
   */
  descartarFallidas(): Promise<number>;
}
