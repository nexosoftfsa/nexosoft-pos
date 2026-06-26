import { describe, expect, it } from "vitest";

import { FormaDePago } from "@nexosoft/domain";

import { construirOperacionVenta, mapearMedioPago } from "./mapeo";

describe("mapearMedioPago", () => {
  it("mapea las formas del dominio a los medios del backend", () => {
    expect(mapearMedioPago(FormaDePago.Efectivo)).toBe("EFECTIVO");
    expect(mapearMedioPago(FormaDePago.Tarjeta)).toBe("TARJETA_DEBITO");
    expect(mapearMedioPago(FormaDePago.Billetera)).toBe("MERCADOPAGO_QR");
  });
});

describe("construirOperacionVenta", () => {
  it("arma una operación de venta con operacionId único y payload válido", () => {
    const op = construirOperacionVenta({
      terminalId: "caja-1",
      medioPago: "EFECTIVO",
      items: [{ productoId: "p1", cantidad: 3, precioUnitario: "1850.00" }],
    });

    expect(op.tipo).toBe("venta");
    expect(op.terminalId).toBe("caja-1");
    expect(op.operacionId).toMatch(/[0-9a-f-]{36}/);
    const payload = op.payload as { medioPago: string; items: Array<{ cantidad: string }> };
    expect(payload.medioPago).toBe("EFECTIVO");
    expect(payload.items[0]?.cantidad).toBe("3"); // cantidad como string
  });

  it("genera operacionId distinto en cada venta", () => {
    const a = construirOperacionVenta({ terminalId: "t", medioPago: "EFECTIVO", items: [] });
    const b = construirOperacionVenta({ terminalId: "t", medioPago: "EFECTIVO", items: [] });
    expect(a.operacionId).not.toBe(b.operacionId);
  });
});
