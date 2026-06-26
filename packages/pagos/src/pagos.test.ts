import { describe, it, expect, beforeEach } from "vitest";
import { Money } from "@nexosoft/domain";
import { MockPasarelaDePago } from "./mock-pasarela.js";
import { MercadoPagoPoint } from "./mercadopago-point.js";
import { ErrorPasarela, type SolicitudPago } from "./pasarela.js";

function solicitud(id = "intento-1"): SolicitudPago {
  return {
    intencionPagoId: id,
    monto: Money.desde("1850.00"),
    medio: "tarjeta_credito",
    descripcion: "Compra NexoSoft",
  };
}

// ---------------------------------------------------------------------------
// MockPasarelaDePago
// ---------------------------------------------------------------------------
describe("MockPasarelaDePago", () => {
  let pasarela: MockPasarelaDePago;

  beforeEach(() => {
    pasarela = new MockPasarelaDePago();
  });

  it("iniciarPago devuelve estado pendiente", async () => {
    const intento = await pasarela.iniciarPago(solicitud());
    expect(intento.estado).toBe("pendiente");
    expect(intento.intencionPagoId).toBe("intento-1");
  });

  it("consultarEstado devuelve aprobado por defecto", async () => {
    await pasarela.iniciarPago(solicitud());
    const estado = await pasarela.consultarEstado("intento-1");
    expect(estado.estado).toBe("aprobado");
    expect(estado.referenciaExterna).toBeDefined();
  });

  it("resultadoSimulado=rechazado devuelve rechazado con motivo", async () => {
    pasarela.resultadoSimulado = "rechazado";
    await pasarela.iniciarPago(solicitud());
    const estado = await pasarela.consultarEstado("intento-1");
    expect(estado.estado).toBe("rechazado");
    expect(estado.motivoRechazo).toBeTruthy();
  });

  it("resultadoSimulado=timeout devuelve pendiente siempre", async () => {
    pasarela.resultadoSimulado = "timeout";
    await pasarela.iniciarPago(solicitud());
    const e1 = await pasarela.consultarEstado("intento-1");
    const e2 = await pasarela.consultarEstado("intento-1");
    expect(e1.estado).toBe("pendiente");
    expect(e2.estado).toBe("pendiente");
  });

  it("cancelar marca el intento como cancelado", async () => {
    await pasarela.iniciarPago(solicitud());
    await pasarela.cancelar("intento-1");
    const estado = await pasarela.consultarEstado("intento-1");
    expect(estado.estado).toBe("cancelado");
  });

  it("cancelar es idempotente: no lanza si el intento no existe", async () => {
    await expect(pasarela.cancelar("no-existe")).resolves.toBeUndefined();
  });

  it("consultarEstado lanza INTENTO_NO_ENCONTRADO si no se inició", async () => {
    await expect(pasarela.consultarEstado("fantasma")).rejects.toBeInstanceOf(ErrorPasarela);
    try {
      await pasarela.consultarEstado("fantasma");
    } catch (e) {
      expect((e as ErrorPasarela).codigo).toBe("INTENTO_NO_ENCONTRADO");
    }
  });

  it("forzarErrorRed hace rechazar iniciarPago con SIN_CONEXION", async () => {
    pasarela.forzarErrorRed = true;
    try {
      await pasarela.iniciarPago(solicitud());
    } catch (e) {
      expect((e as ErrorPasarela).codigo).toBe("SIN_CONEXION");
    }
  });

  it("múltiples intentos con ids distintos son independientes", async () => {
    await pasarela.iniciarPago(solicitud("A"));
    await pasarela.iniciarPago(solicitud("B"));
    await pasarela.cancelar("A");
    const a = await pasarela.consultarEstado("A");
    const b = await pasarela.consultarEstado("B");
    expect(a.estado).toBe("cancelado");
    expect(b.estado).toBe("aprobado");
  });

  it("resetear limpia todos los intentos y configuraciones", async () => {
    pasarela.forzarErrorRed = true;
    await pasarela.iniciarPago(solicitud()).catch(() => {});
    pasarela.resetear();
    expect(pasarela.forzarErrorRed).toBe(false);
    expect(pasarela.intentos.size).toBe(0);
    const intento = await pasarela.iniciarPago(solicitud());
    expect(intento.estado).toBe("pendiente");
  });
});

// ---------------------------------------------------------------------------
// MercadoPagoPoint (esqueleto)
// ---------------------------------------------------------------------------
describe("MercadoPagoPoint", () => {
  it("lanza CREDENCIALES_INVALIDAS en constructor si no hay accessToken", () => {
    expect(() => new MercadoPagoPoint({ accessToken: "" })).toThrow(ErrorPasarela);
  });

  it("lanza error al intentar usar el adaptador no implementado", async () => {
    const mp = new MercadoPagoPoint({ accessToken: "TEST-token" });
    await expect(mp.iniciarPago(solicitud())).rejects.toBeInstanceOf(ErrorPasarela);
  });
});
