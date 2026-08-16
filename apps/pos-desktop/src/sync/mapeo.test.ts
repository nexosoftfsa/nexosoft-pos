import { describe, expect, it } from "vitest";

import { FormaDePago } from "@nexosoft/domain";

import { construirOperacionVenta, mapearMedioPago, resumenMedioPago } from "./mapeo";

describe("mapearMedioPago", () => {
  it("mapea las formas del dominio a los medios del backend", () => {
    expect(mapearMedioPago(FormaDePago.Efectivo)).toBe("EFECTIVO");
    expect(mapearMedioPago(FormaDePago.Tarjeta)).toBe("TARJETA_DEBITO");
    expect(mapearMedioPago(FormaDePago.Billetera)).toBe("MERCADOPAGO_QR");
  });

  it("Transferencia mapea a TRANSFERENCIA, no a EFECTIVO", () => {
    // Bug real: antes mapeaba a "EFECTIVO", lo que hacía que un pago combinado
    // Efectivo+Transferencia se viera como "todo efectivo" (resumenMedioPago
    // agrupaba ambos medios en uno solo, sin distinguirlos).
    expect(mapearMedioPago(FormaDePago.Transferencia)).toBe("TRANSFERENCIA");
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

  it("incluye el costoUnitario del ítem cuando viene el snapshot (ADR-0048)", () => {
    const op = construirOperacionVenta({
      terminalId: "caja-1",
      medioPago: "EFECTIVO",
      items: [{ productoId: "p1", cantidad: 1, precioUnitario: "1850.00", costoUnitario: "900.00" }],
    });
    const payload = op.payload as { items: Array<{ costoUnitario?: string }> };
    expect(payload.items[0]?.costoUnitario).toBe("900.00");
  });

  it("genera operacionId distinto en cada venta", () => {
    const a = construirOperacionVenta({ terminalId: "t", medioPago: "EFECTIVO", items: [] });
    const b = construirOperacionVenta({ terminalId: "t", medioPago: "EFECTIVO", items: [] });
    expect(a.operacionId).not.toBe(b.operacionId);
  });

  it("incluye el desglose de pagos en el payload cuando hay pago combinado", () => {
    const op = construirOperacionVenta({
      terminalId: "t",
      medioPago: "COMBINADO",
      items: [],
      pagos: [
        { medioPago: "EFECTIVO", monto: "140.00" },
        { medioPago: "TARJETA_CREDITO", monto: "100.00" },
      ],
    });
    const payload = op.payload as { pagos?: Array<{ medioPago: string; monto: string }> };
    expect(payload.pagos).toHaveLength(2);
    expect(payload.pagos?.[0]?.monto).toBe("140.00");
  });

  it("no incluye pagos en el payload si no hay desglose", () => {
    const op = construirOperacionVenta({ terminalId: "t", medioPago: "EFECTIVO", items: [] });
    expect((op.payload as { pagos?: unknown }).pagos).toBeUndefined();
  });

  it("incluye clienteId en el payload al vender a cuenta corriente (fiado)", () => {
    const op = construirOperacionVenta({
      terminalId: "t",
      medioPago: "CUENTA_CORRIENTE",
      items: [],
      clienteId: "cli1",
    });
    expect((op.payload as { clienteId?: string }).clienteId).toBe("cli1");
  });

  it("incluye tipoComprobante en el payload (Fase 10.1: TicketNoFiscal viaja al servidor)", () => {
    const op = construirOperacionVenta({
      terminalId: "t",
      medioPago: "EFECTIVO",
      items: [],
      tipoComprobante: "TicketNoFiscal",
    });
    expect((op.payload as { tipoComprobante?: string }).tipoComprobante).toBe("TicketNoFiscal");
  });

  it("no incluye tipoComprobante si no se pasa", () => {
    const op = construirOperacionVenta({ terminalId: "t", medioPago: "EFECTIVO", items: [] });
    expect((op.payload as { tipoComprobante?: string }).tipoComprobante).toBeUndefined();
  });
});

describe("resumenMedioPago", () => {
  it("sin pagos usa el fallback", () => {
    expect(resumenMedioPago([], "EFECTIVO")).toBe("EFECTIVO");
  });
  it("un solo medio devuelve ese medio", () => {
    expect(resumenMedioPago([{ medioPago: "EFECTIVO", monto: "100" }], "TARJETA_DEBITO")).toBe("EFECTIVO");
  });
  it("varios medios distintos devuelve COMBINADO", () => {
    expect(
      resumenMedioPago(
        [
          { medioPago: "EFECTIVO", monto: "50" },
          { medioPago: "MERCADOPAGO_QR", monto: "50" },
        ],
        "EFECTIVO",
      ),
    ).toBe("COMBINADO");
  });
  it("Efectivo + Transferencia da COMBINADO (no se funden en un solo medio)", () => {
    expect(
      resumenMedioPago(
        [
          { medioPago: "EFECTIVO", monto: "140" },
          { medioPago: "TRANSFERENCIA", monto: "100" },
        ],
        "EFECTIVO",
      ),
    ).toBe("COMBINADO");
  });
});
