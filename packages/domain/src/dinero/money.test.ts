import { describe, expect, it } from "vitest";

import { ErrorMoneda } from "../comun/errores.js";
import { Money } from "./money.js";

describe("Money — construcción", () => {
  it("crea cero por defecto en ARS", () => {
    const m = Money.cero();
    expect(m.esCero()).toBe(true);
    expect(m.moneda).toBe("ARS");
    expect(m.aDecimalString()).toBe("0.00");
  });

  it("construye desde texto decimal sin perder precisión", () => {
    expect(Money.desde("1234.5678").aDecimalString(4)).toBe("1234.5678");
  });

  it("construye desde number tomando su decimal corto (1.005 → 1.005)", () => {
    // Si se usara el binario IEEE-754, 1.005 redondearía mal a 1.00.
    expect(Money.desde(1.005).aDecimalString(3)).toBe("1.005");
  });

  it("construye desde centavos enteros", () => {
    expect(Money.desdeCentavos(123456).aDecimalString()).toBe("1234.56");
    expect(Money.desdeCentavos(0).esCero()).toBe(true);
  });

  it("rechaza centavos no enteros", () => {
    expect(() => Money.desdeCentavos(10.5)).toThrow(ErrorMoneda);
  });

  it("rechaza montos no numéricos o no finitos", () => {
    expect(() => Money.desde("no-es-un-numero")).toThrow(ErrorMoneda);
    expect(() => Money.desde(Number.POSITIVE_INFINITY)).toThrow(ErrorMoneda);
    expect(() => Money.desde(Number.NaN)).toThrow(ErrorMoneda);
  });
});

describe("Money — aritmética exacta", () => {
  it("0.10 + 0.20 = 0.30 (sin error de float)", () => {
    const r = Money.desde("0.10").sumar(Money.desde("0.20"));
    expect(r.aDecimalString()).toBe("0.30");
  });

  it("suma y resta encadenadas", () => {
    const r = Money.desde("100").sumar(Money.desde("50.55")).restar(Money.desde("0.55"));
    expect(r.aDecimalString()).toBe("150.00");
  });

  it("multiplica por cantidad fraccionada (peso)", () => {
    // 1,250 kg × $ 980,00/kg = $ 1225,00
    const r = Money.desde("980").multiplicarPor("1.250");
    expect(r.aDecimalString()).toBe("1225.00");
  });

  it("calcula un porcentaje (IVA 21%)", () => {
    expect(Money.desde("1000").porcentaje(21).aDecimalString()).toBe("210.00");
    expect(Money.desde("1000").porcentaje(10.5).aDecimalString()).toBe("105.00");
  });

  it("divide manteniendo precisión interna", () => {
    expect(Money.desde("121").dividirPor("1.21").aDecimalString()).toBe("100.00");
  });

  it("rechaza división por cero", () => {
    expect(() => Money.desde("10").dividirPor(0)).toThrow(ErrorMoneda);
  });

  it("niega y toma valor absoluto", () => {
    expect(Money.desde("10").negado().aDecimalString()).toBe("-10.00");
    expect(Money.desde("-10").absoluto().aDecimalString()).toBe("10.00");
  });
});

describe("Money — redondeo HALF_UP", () => {
  it("redondea 0.005 hacia arriba", () => {
    expect(Money.desde("0.005").redondear().aDecimalString()).toBe("0.01");
  });

  it("redondea 2.675 → 2.68 (caso clásico que falla con float)", () => {
    expect(Money.desde("2.675").redondear().aDecimalString()).toBe("2.68");
  });

  it("mantiene precisión hasta redondear explícitamente", () => {
    const tercio = Money.desde("10").dividirPor("3"); // 3.3333...
    expect(tercio.redondear(2).aDecimalString()).toBe("3.33");
    expect(tercio.redondear(4).aDecimalString(4)).toBe("3.3333");
  });
});

describe("Money — comparaciones", () => {
  it("igualdad numérica ignora ceros a la derecha", () => {
    expect(Money.desde("1.10").igualA(Money.desde("1.100"))).toBe(true);
  });

  it("ordena montos", () => {
    const a = Money.desde("10");
    const b = Money.desde("20");
    expect(a.menorQue(b)).toBe(true);
    expect(b.mayorQue(a)).toBe(true);
    expect(a.menorOIgualQue(Money.desde("10"))).toBe(true);
    expect(a.mayorOIgualQue(Money.desde("10"))).toBe(true);
  });

  it("clasifica signo", () => {
    expect(Money.desde("5").esPositivo()).toBe(true);
    expect(Money.desde("-5").esNegativo()).toBe(true);
    expect(Money.cero().esCero()).toBe(true);
  });
});

describe("Money — moneda distinta", () => {
  it("falla al operar monedas distintas", () => {
    const ars = Money.desde("10", "ARS");
    // Forzamos otra moneda vía JSON para simular un dato externo inválido.
    const otra = Money.desdeJSON({ moneda: "USD" as "ARS", monto: "10.00" });
    expect(() => ars.sumar(otra)).toThrow(ErrorMoneda);
    expect(ars.igualA(otra)).toBe(false);
  });
});

describe("Money — serialización", () => {
  it("a centavos redondea HALF_UP", () => {
    expect(Money.desde("1234.567").aCentavos()).toBe(123457);
    expect(Money.desde("0.005").aCentavos()).toBe(1);
  });

  it("ida y vuelta por JSON", () => {
    const m = Money.desde("9999.99");
    const r = Money.desdeJSON(m.aJSON());
    expect(r.igualA(m)).toBe(true);
    expect(r.toString()).toBe("ARS 9999.99");
  });

  it("ida y vuelta por centavos", () => {
    const m = Money.desde("1234.56");
    expect(Money.desdeCentavos(m.aCentavos()).igualA(m)).toBe(true);
  });
});
