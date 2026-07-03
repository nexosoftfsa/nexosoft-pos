import { describe, expect, it } from "vitest";

import type { Comprobante } from "../sync/cliente-ventas";
import {
  esAnulable,
  esNotaCredito,
  etiquetaMedioPago,
  etiquetaTipoComprobante,
  numeroComprobante,
} from "./comprobantes-helpers";

function comprobante(overrides: Partial<Comprobante> = {}): Comprobante {
  return {
    id: "c1",
    estado: "COMPLETADA",
    subtotal: "100",
    descuento: "0",
    total: "100",
    medioPago: "EFECTIVO",
    cae: "1",
    caeFechaVto: null,
    numeroComprobante: 5,
    tipoComprobante: "FacturaB",
    creadaEn: new Date().toISOString(),
    comprobanteAsociadoId: null,
    items: [],
    ...overrides,
  };
}

describe("etiquetaTipoComprobante", () => {
  it("traduce los tipos conocidos", () => {
    expect(etiquetaTipoComprobante("FacturaB")).toBe("Factura B");
    expect(etiquetaTipoComprobante("NotaCreditoA")).toBe("Nota de Crédito A");
  });
  it("devuelve un texto genérico si es null", () => {
    expect(etiquetaTipoComprobante(null)).toBe("Comprobante");
  });
});

describe("etiquetaMedioPago", () => {
  it("traduce el medio de pago", () => {
    expect(etiquetaMedioPago("TARJETA_CREDITO")).toBe("Tarjeta de crédito");
    expect(etiquetaMedioPago("OTRO")).toBe("OTRO");
  });
});

describe("numeroComprobante", () => {
  it("formatea a 8 dígitos", () => {
    expect(numeroComprobante(5)).toBe("N° 00000005");
    expect(numeroComprobante(null)).toBe("—");
  });
});

describe("esNotaCredito", () => {
  it("detecta notas de crédito", () => {
    expect(esNotaCredito("NotaCreditoB")).toBe(true);
    expect(esNotaCredito("FacturaB")).toBe(false);
    expect(esNotaCredito(null)).toBe(false);
  });
});

describe("esAnulable", () => {
  it("una factura completada es anulable", () => {
    expect(esAnulable(comprobante())).toBe(true);
  });
  it("una venta anulada no es anulable", () => {
    expect(esAnulable(comprobante({ estado: "ANULADA" }))).toBe(false);
  });
  it("una nota de crédito no es anulable", () => {
    expect(esAnulable(comprobante({ tipoComprobante: "NotaCreditoB" }))).toBe(false);
  });
});
