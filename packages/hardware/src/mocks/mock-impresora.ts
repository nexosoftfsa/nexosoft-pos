import type { DatosTicket, EstadoImpresora, ImpresoraTermica } from "../impresora.js";

/**
 * Mock de ImpresoraTermica para desarrollo y tests.
 *
 * Comportamiento configurable:
 *  - `forzarError`: hace que imprimirTicket/abrirCajon rechacen.
 *  - `sinPapel`: verificarEstado devuelve { ok: false, razon: "sin_papel" }.
 *  - `sinConexion`: verificarEstado devuelve { ok: false, razon: "sin_conexion" }.
 *
 * Todos los tickets impresos quedan en `ticketsImpresos` para assertion en tests.
 */
export class MockImpresoraTermica implements ImpresoraTermica {
  readonly ticketsImpresos: DatosTicket[] = [];
  cajonesAbiertos = 0;

  forzarError = false;
  sinPapel = false;
  sinConexion = false;

  async imprimirTicket(datos: DatosTicket): Promise<void> {
    if (this.forzarError) throw new Error("MockImpresora: error simulado al imprimir.");
    this.ticketsImpresos.push(datos);
  }

  async abrirCajon(): Promise<void> {
    if (this.forzarError) throw new Error("MockImpresora: error simulado al abrir cajón.");
    this.cajonesAbiertos++;
  }

  async verificarEstado(): Promise<EstadoImpresora> {
    if (this.sinConexion) return { ok: false, razon: "sin_conexion" };
    if (this.sinPapel) return { ok: false, razon: "sin_papel" };
    return { ok: true };
  }

  /** Limpia el historial entre tests. */
  resetear() {
    this.ticketsImpresos.length = 0;
    this.cajonesAbiertos = 0;
    this.forzarError = false;
    this.sinPapel = false;
    this.sinConexion = false;
  }
}
