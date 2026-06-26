import { Cantidad } from "@nexosoft/domain";
import { ErrorBalanza, type EstadoBalanza, type Balanza } from "../balanza.js";

/**
 * Mock de Balanza para desarrollo y tests.
 *
 * Configuración:
 *  - `pesoSimulado`: Cantidad que devuelve leerPeso() (default: "1.000" kg).
 *  - `forzarError`: leerPeso() rechaza con ErrorBalanza "SIN_CONEXION".
 *  - `forzarInestable`: leerPeso() rechaza con ErrorBalanza "PESO_INESTABLE".
 */
export class MockBalanza implements Balanza {
  pesoSimulado: Cantidad = Cantidad.de("1.000");
  forzarError = false;
  forzarInestable = false;
  tarados = 0;

  async leerPeso(): Promise<Cantidad> {
    if (this.forzarError) {
      throw new ErrorBalanza("SIN_CONEXION", "MockBalanza: sin conexión simulada.");
    }
    if (this.forzarInestable) {
      throw new ErrorBalanza("PESO_INESTABLE", "MockBalanza: peso inestable simulado.");
    }
    return this.pesoSimulado;
  }

  async tarar(): Promise<void> {
    this.tarados++;
  }

  async verificarEstado(): Promise<EstadoBalanza> {
    if (this.forzarError) return { ok: false, razon: "sin_conexion" };
    if (this.forzarInestable) return { ok: false, razon: "inestable" };
    return { ok: true };
  }

  resetear() {
    this.pesoSimulado = Cantidad.de("1.000");
    this.forzarError = false;
    this.forzarInestable = false;
    this.tarados = 0;
  }
}
