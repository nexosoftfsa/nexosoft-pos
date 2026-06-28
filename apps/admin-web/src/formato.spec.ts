import { describe, it, expect } from "vitest";
import {
  formatearMoneda,
  formatearCantidad,
  fechaCorta,
  etiquetaMedioPago,
} from "./formato";

describe("formatearMoneda", () => {
  it("formatea un importe string como pesos argentinos", () => {
    // Se normalizan los espacios (Intl puede usar NBSP/narrow NBSP entre $ y numero).
    const normalizado = formatearMoneda("187540.50").replace(/\s/g, "");
    expect(normalizado).toBe("$187.540,50");
  });

  it("devuelve el valor original si no es numerico", () => {
    expect(formatearMoneda("n/a")).toBe("n/a");
  });
});

describe("formatearCantidad", () => {
  it("usa separador de miles", () => {
    expect(formatearCantidad(1420)).toBe("1.420");
  });
});

describe("fechaCorta", () => {
  it("convierte YYYY-MM-DD en DD/MM", () => {
    expect(fechaCorta("2026-06-28")).toBe("28/06");
  });
});

describe("etiquetaMedioPago", () => {
  it("traduce los codigos del enum", () => {
    expect(etiquetaMedioPago("TARJETA_DEBITO")).toBe("Tarjeta débito");
    expect(etiquetaMedioPago("MERCADOPAGO_QR")).toBe("MercadoPago QR");
  });

  it("devuelve el codigo si no lo conoce", () => {
    expect(etiquetaMedioPago("OTRO")).toBe("OTRO");
  });
});
