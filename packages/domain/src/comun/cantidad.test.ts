import { describe, expect, it } from "vitest";

import { Cantidad } from "./cantidad.js";
import { ErrorDominio } from "./errores.js";

describe("Cantidad — construcción y validación", () => {
  it("cero por defecto", () => {
    expect(Cantidad.cero().esCero()).toBe(true);
  });

  it("desde texto/numero sin perder precisión", () => {
    expect(Cantidad.de("1.250").aDecimalString()).toBe("1.250");
    expect(Cantidad.de(0.5).aDecimalString()).toBe("0.500");
  });

  it("rechaza valores no finitos", () => {
    expect(() => Cantidad.de(Number.NaN)).toThrow(ErrorDominio);
    expect(() => Cantidad.de("abc")).toThrow(ErrorDominio);
  });
});

describe("Cantidad — aritmética exacta", () => {
  it("0,1 + 0,2 = 0,3 (sin deriva de float)", () => {
    expect(Cantidad.de("0.1").sumar(Cantidad.de("0.2")).aDecimalString(1)).toBe("0.3");
  });

  it("suma de muchos movimientos no deriva", () => {
    let total = Cantidad.cero();
    for (let i = 0; i < 10; i++) total = total.sumar(Cantidad.de("0.1"));
    expect(total.aDecimalString(1)).toBe("1.0");
  });

  it("resta y negación", () => {
    expect(Cantidad.de("5").restar(Cantidad.de("8")).aDecimalString(0)).toBe("-3");
    expect(Cantidad.de("5").negada().esNegativa()).toBe(true);
  });

  it("multiplica por un factor (unidades por bulto)", () => {
    expect(Cantidad.de("6").multiplicarPor("4").aDecimalString(0)).toBe("24");
  });
});

describe("Cantidad — comparaciones y clasificación", () => {
  it("ordena y compara", () => {
    expect(Cantidad.de("2").mayorQue(Cantidad.de("1"))).toBe(true);
    expect(Cantidad.de("1").menorOIgualQue(Cantidad.de("1"))).toBe(true);
    expect(Cantidad.de("1.5").igualA(Cantidad.de("1.500"))).toBe(true);
  });

  it("detecta enteros (para artículos por unidad)", () => {
    expect(Cantidad.de("3").esEntera()).toBe(true);
    expect(Cantidad.de("3.5").esEntera()).toBe(false);
  });
});
