import { describe, expect, it } from "vitest";

import { Money } from "@nexosoft/domain";

import { importeParaEditar, importeTecleado, pesos } from "./formato";

describe("pesos", () => {
  it("formatea al estilo argentino", () => {
    expect(pesos(Money.desde("1850"))).toBe("$ 1.850,00");
    expect(pesos(Money.desde("11450.5"))).toBe("$ 11.450,50");
    expect(pesos(Money.desde("-741.14"))).toBe("-$ 741,14");
  });
});

/**
 * El campo de monto del asistente mostraba el saldo crudo —"11450.00"— y a
 * simple vista 10000 y 1000 se parecen demasiado. Sebastián tuvo que contar
 * los ceros para no errarle, en el campo donde el cajero confirma cuánta plata
 * entra.
 */
describe("importeParaEditar", () => {
  it("lleva separadores de miles y coma decimal, sin el signo", () => {
    expect(importeParaEditar(Money.desde("11450"))).toBe("11.450,00");
    expect(importeParaEditar(Money.desde("1000"))).toBe("1.000,00");
    expect(importeParaEditar(Money.desde("10000"))).toBe("10.000,00");
  });

  it("un importe chico sale sin puntos", () => {
    expect(importeParaEditar(Money.desde("850.5"))).toBe("850,50");
  });
});

describe("importeTecleado", () => {
  /** Lo que devuelve `importeParaEditar` tiene que poder volver a entrar. */
  it("entiende el formato es-AR que muestra el campo", () => {
    expect(importeTecleado("11.450,00")).toBe("11450.00");
    expect(Money.desde(importeTecleado("11.450,00")).aDecimalString(2)).toBe("11450.00");
  });

  it("sigue aceptando lo crudo, que es lo que teclea la mayoría", () => {
    expect(importeTecleado("11450.00")).toBe("11450.00");
    expect(importeTecleado(" 850 ")).toBe("850");
  });

  /**
   * Sin coma, un punto es el separador decimal y NO se toca. Sacarlo siempre
   * convertiría "1.50" en 150: cien veces de más en la caja.
   */
  it("sin coma, el punto es decimal y se respeta", () => {
    expect(Money.desde(importeTecleado("1.50")).aDecimalString(2)).toBe("1.50");
  });

  it("con coma, los puntos son de miles", () => {
    expect(Money.desde(importeTecleado("1.234.567,89")).aDecimalString(2)).toBe("1234567.89");
  });
});
