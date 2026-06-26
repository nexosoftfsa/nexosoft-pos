/**
 * MockPasarelaDePago — implementación de desarrollo y tests.
 *
 * Modos configurables:
 *  - `resultadoSimulado`:
 *      "aprobado"  → iniciarPago devuelve pendiente; consultarEstado devuelve aprobado.
 *      "rechazado" → consultarEstado devuelve rechazado con motivoSimulado.
 *      "timeout"   → consultarEstado devuelve pendiente siempre (simula demora).
 *  - `forzarErrorRed`: iniciarPago lanza ErrorPasarela SIN_CONEXION.
 *  - `demora`: milisegundos de espera artificial en cada llamada (0 por defecto).
 *
 * Todos los intentos quedan en `intentos` para assertion en tests.
 */

import { ErrorPasarela, type IntentoPago, type PasarelaDePago, type SolicitudPago } from "./pasarela.js";

export class MockPasarelaDePago implements PasarelaDePago {
  resultadoSimulado: "aprobado" | "rechazado" | "timeout" = "aprobado";
  motivoRechazoSimulado = "Fondos insuficientes (simulado)";
  forzarErrorRed = false;
  demora = 0;

  readonly intentos = new Map<string, IntentoPago>();

  private async esperar(): Promise<void> {
    if (this.demora > 0) {
      await new Promise((r) => setTimeout(r, this.demora));
    }
  }

  async iniciarPago(solicitud: SolicitudPago): Promise<IntentoPago> {
    await this.esperar();
    if (this.forzarErrorRed) {
      throw new ErrorPasarela("SIN_CONEXION", "MockPasarela: sin red simulada.");
    }
    const intento: IntentoPago = {
      intencionPagoId: solicitud.intencionPagoId,
      estado: "pendiente",
    };
    this.intentos.set(solicitud.intencionPagoId, intento);
    return intento;
  }

  async consultarEstado(intencionPagoId: string): Promise<IntentoPago> {
    await this.esperar();
    const previo = this.intentos.get(intencionPagoId);
    if (!previo) {
      throw new ErrorPasarela(
        "INTENTO_NO_ENCONTRADO",
        `MockPasarela: no existe el intento "${intencionPagoId}".`,
      );
    }
    // Si ya fue cancelado, lo devuelve tal cual.
    if (previo.estado === "cancelado") return previo;

    let actualizado: IntentoPago;
    switch (this.resultadoSimulado) {
      case "aprobado":
        actualizado = {
          ...previo,
          estado: "aprobado",
          referenciaExterna: `MP-MOCK-${intencionPagoId.slice(0, 8).toUpperCase()}`,
        };
        break;
      case "rechazado":
        actualizado = {
          ...previo,
          estado: "rechazado",
          motivoRechazo: this.motivoRechazoSimulado,
        };
        break;
      case "timeout":
        // Permanece pendiente — el POS debe seguir haciendo polling.
        actualizado = { ...previo, estado: "pendiente" };
        break;
    }
    this.intentos.set(intencionPagoId, actualizado);
    return actualizado;
  }

  async cancelar(intencionPagoId: string): Promise<void> {
    await this.esperar();
    const previo = this.intentos.get(intencionPagoId);
    if (!previo) return; // idempotente
    this.intentos.set(intencionPagoId, { ...previo, estado: "cancelado" });
  }

  resetear() {
    this.intentos.clear();
    this.resultadoSimulado = "aprobado";
    this.forzarErrorRed = false;
    this.demora = 0;
  }
}
