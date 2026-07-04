import { describe, expect, it } from "vitest";

import { estaVencido, fechaVencimiento, validarLinea } from "./presupuestos-helpers";

describe("fechaVencimiento", () => {
  it("suma la validez a la fecha de creación", () => {
    expect(fechaVencimiento("2026-07-01T00:00:00.000Z", 15).getUTCDate()).toBe(16);
  });
});

describe("estaVencido", () => {
  const creado = "2026-07-01T00:00:00.000Z";
  it("VIGENTE y pasada la validez => vencido", () => {
    expect(estaVencido(creado, 10, "VIGENTE", new Date("2026-07-20T00:00:00Z"))).toBe(true);
  });
  it("VIGENTE dentro de la validez => no vencido", () => {
    expect(estaVencido(creado, 10, "VIGENTE", new Date("2026-07-05T00:00:00Z"))).toBe(false);
  });
  it("ANULADO/CONVERTIDO nunca se marca vencido", () => {
    expect(estaVencido(creado, 1, "ANULADO", new Date("2027-01-01T00:00:00Z"))).toBe(false);
  });
});

describe("validarLinea", () => {
  it("acepta una línea válida", () => {
    expect(validarLinea("Yerba", "2", "3800")).toBeNull();
  });
  it("rechaza descripción vacía, cantidad o precio no positivos", () => {
    expect(validarLinea("", "1", "1")).toMatch(/descripción/);
    expect(validarLinea("X", "0", "1")).toMatch(/Cantidad/);
    expect(validarLinea("X", "1", "abc")).toMatch(/Precio/);
  });
});
