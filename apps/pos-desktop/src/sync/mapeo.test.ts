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

  it("con tarjeta CREDITO configurada mapea a TARJETA_CREDITO (Fase 12.E)", () => {
    expect(mapearMedioPago(FormaDePago.Tarjeta, "CREDITO")).toBe("TARJETA_CREDITO");
  });

  it("con tarjeta DEBITO configurada, o sin tarjeta, sigue mandando TARJETA_DEBITO", () => {
    expect(mapearMedioPago(FormaDePago.Tarjeta, "DEBITO")).toBe("TARJETA_DEBITO");
    expect(mapearMedioPago(FormaDePago.Tarjeta)).toBe("TARJETA_DEBITO");
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

  it("manda la fecha de la venta, que es la que salió impresa en el ticket", () => {
    const vendida = new Date("2026-09-02T14:00:00.000Z");
    const op = construirOperacionVenta({
      terminalId: "caja-1",
      medioPago: "EFECTIVO",
      items: [{ productoId: "p1", cantidad: 1, precioUnitario: "10.00" }],
      fecha: vendida,
    });

    // En el payload, porque es la fecha DE LA VENTA (el servidor la usa como
    // `creadaEn` y como `CbteFch`), y en el sobre por consistencia.
    expect((op.payload as { fecha: string }).fecha).toBe(vendida.toISOString());
    expect(op.creadaEn).toBe(vendida.toISOString());
  });

  it("sin fecha explícita usa la de ahora", () => {
    const antes = Date.now();
    const op = construirOperacionVenta({
      terminalId: "caja-1",
      medioPago: "EFECTIVO",
      items: [{ productoId: "p1", cantidad: 1, precioUnitario: "10.00" }],
    });
    const enviada = new Date((op.payload as { fecha: string }).fecha).getTime();
    expect(enviada).toBeGreaterThanOrEqual(antes);
    expect(enviada).toBeLessThanOrEqual(Date.now());
  });

  it("incluye tarjetaConfigId/cuotas/recargo por pago cuando viene una tarjeta configurada (Fase 12.E)", () => {
    const op = construirOperacionVenta({
      terminalId: "t",
      medioPago: "TARJETA_CREDITO",
      items: [],
      pagos: [
        {
          medioPago: "TARJETA_CREDITO",
          monto: "110.00",
          tarjetaConfigId: "tar-1",
          cuotas: 6,
          recargo: "10.00",
        },
      ],
    });
    const payload = op.payload as {
      pagos: Array<{ tarjetaConfigId?: string; cuotas?: number; recargo?: string }>;
    };
    expect(payload.pagos[0]?.tarjetaConfigId).toBe("tar-1");
    expect(payload.pagos[0]?.cuotas).toBe(6);
    expect(payload.pagos[0]?.recargo).toBe("10.00");
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
