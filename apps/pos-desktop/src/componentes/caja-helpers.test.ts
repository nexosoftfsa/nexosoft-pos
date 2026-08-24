import { describe, expect, it } from "vitest";

import {
  importeNoNegativo,
  importePositivo,
  leerDiferencia,
  normalizarImporte,
  puedeVenderConCaja,
} from "./caja-helpers";

describe("normalizarImporte", () => {
  it("convierte el formato es-AR a punto decimal", () => {
    expect(normalizarImporte("1.500,50")).toBe("1500.50");
    expect(normalizarImporte("2000")).toBe("2000");
  });
});

describe("importeNoNegativo", () => {
  it("acepta cero y positivos, rechaza negativos y basura", () => {
    expect(importeNoNegativo("0")).toBe(true);
    expect(importeNoNegativo("1500,50")).toBe(true);
    expect(importeNoNegativo("-1")).toBe(false);
    expect(importeNoNegativo("abc")).toBe(false);
  });
});

describe("importePositivo", () => {
  it("exige mayor a cero", () => {
    expect(importePositivo("0")).toBe(false);
    expect(importePositivo("0,01")).toBe(true);
  });
});

describe("leerDiferencia", () => {
  it("interpreta sobrante / faltante / exacto", () => {
    expect(leerDiferencia("0.00")?.signo).toBe("exacto");
    expect(leerDiferencia("50.00")?.signo).toBe("sobrante");
    expect(leerDiferencia("-50.00")?.signo).toBe("faltante");
  });

  it("devuelve null si no hay diferencia (turno abierto)", () => {
    expect(leerDiferencia(null)).toBeNull();
  });
});

describe("puedeVenderConCaja", () => {
  it("con la caja abierta se vende", () => {
    expect(puedeVenderConCaja("abierta")).toBe(true);
  });

  it("con la caja cerrada NO se vende", () => {
    expect(puedeVenderConCaja("cerrada")).toBe(false);
  });

  it("si no se pudo consultar, se vende igual", () => {
    // Offline-first (ADR-0004): un corte de red no puede frenar la venta. El
    // bloqueo es por caja cerrada, no por falta de servidor.
    expect(puedeVenderConCaja("desconocida")).toBe(true);
  });
});
