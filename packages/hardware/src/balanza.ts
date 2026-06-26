/**
 * Puerto Balanza.
 *
 * Los protocolos varían por marca (Toledo, Dibal, Mettler, etc.): la mayoría
 * usan RS-232 o USB-serial con tramas propietarias. Hasta conocer el modelo
 * que comprará el cliente, solo existe el mock.
 *
 * Para producción habrá que implementar:
 *  - Un plugin Tauri que abra el puerto serie y envíe/reciba tramas.
 *  - Un adaptador que parsee la trama del modelo concreto y devuelva Cantidad.
 */

import type { Cantidad } from "@nexosoft/domain";

// ---------------------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------------------

export interface Balanza {
  /**
   * Lee el peso estabilizado de la balanza.
   * Resuelve con la Cantidad medida o rechaza si hay un error de comunicación.
   * @throws {ErrorBalanza} si la balanza no responde o el peso es inestable.
   */
  leerPeso(): Promise<Cantidad>;

  /** Tara: pone el peso actual a cero. */
  tarar(): Promise<void>;

  /** Verifica si la balanza está conectada y responde. */
  verificarEstado(): Promise<EstadoBalanza>;
}

export type EstadoBalanza =
  | { ok: true }
  | { ok: false; razon: "sin_conexion" | "inestable" | "error" };

export class ErrorBalanza extends Error {
  constructor(
    public readonly codigo: "SIN_CONEXION" | "PESO_INESTABLE" | "TIMEOUT",
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorBalanza";
  }
}
