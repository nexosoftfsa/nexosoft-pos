import { describe, expect, it } from "vitest";

import { normalizarCantidad, validarLineaRemito } from "./remitos-helpers";

describe("normalizarCantidad", () => {
  it("normaliza el formato es-AR", () => {
    expect(normalizarCantidad("1.250,5")).toBe("1250.5");
    expect(normalizarCantidad("3")).toBe("3");
  });
});

describe("validarLineaRemito", () => {
  it("acepta una línea válida", () => {
    expect(validarLineaRemito("Caja de yerba", "5")).toBeNull();
  });
  it("rechaza descripción vacía o cantidad no positiva", () => {
    expect(validarLineaRemito("", "1")).toMatch(/descripción/);
    expect(validarLineaRemito("X", "0")).toMatch(/Cantidad/);
    expect(validarLineaRemito("X", "abc")).toMatch(/Cantidad/);
  });
});
