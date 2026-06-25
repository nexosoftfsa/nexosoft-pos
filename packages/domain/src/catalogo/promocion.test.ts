import { describe, expect, it } from "vitest";

import { ErrorDominio } from "../comun/errores.js";
import { Money } from "../dinero/money.js";
import {
  ahorroCombo,
  calcularDescuentoPromocion,
  crearCombo,
  TipoPromocion,
  vigente,
  type Promocion,
} from "./promocion.js";

describe("vigente", () => {
  const v = { desde: new Date("2026-01-01"), hasta: new Date("2026-12-31") };

  it("sin vigencia, siempre vigente", () => {
    expect(vigente(undefined, new Date("2030-01-01"))).toBe(true);
  });

  it("dentro del rango", () => {
    expect(vigente(v, new Date("2026-06-25"))).toBe(true);
  });

  it("fuera del rango", () => {
    expect(vigente(v, new Date("2027-01-01"))).toBe(false);
  });
});

describe("crearCombo + ahorroCombo", () => {
  const combo = crearCombo({
    nombre: "Combo merienda",
    items: [
      { articuloId: "cafe", cantidad: 1 },
      { articuloId: "medialuna", cantidad: 3 },
    ],
    precioCombo: Money.desde("2000.00"),
  });

  const precios = new Map([
    ["cafe", Money.desde("1500.00")],
    ["medialuna", Money.desde("400.00")],
  ]);

  it("calcula el ahorro frente a los sueltos", () => {
    // 1500 + 3×400 = 2700 ; combo 2000 → ahorro 700
    expect(ahorroCombo(combo, precios).aDecimalString()).toBe("700.00");
  });

  it("el ahorro nunca es negativo", () => {
    const caro = crearCombo({
      nombre: "Combo sin gracia",
      items: [{ articuloId: "cafe", cantidad: 1 }],
      precioCombo: Money.desde("5000.00"),
    });
    expect(ahorroCombo(caro, precios).esCero()).toBe(true);
  });

  it("falla si falta un precio", () => {
    expect(() => ahorroCombo(combo, new Map())).toThrow(ErrorDominio);
  });

  it("rechaza combos inválidos", () => {
    expect(() => crearCombo({ nombre: "x", items: [], precioCombo: Money.cero() })).toThrow(
      /ítem/i,
    );
  });
});

describe("calcularDescuentoPromocion", () => {
  const linea = { cantidad: 6, precioUnitario: Money.desde("100.00") };

  it("porcentaje sobre la línea", () => {
    const promo: Promocion = {
      id: "p1",
      nombre: "10% off",
      tipo: TipoPromocion.Porcentaje,
      porcentaje: 10,
    };
    // 6×100 = 600 ; 10% = 60
    expect(calcularDescuentoPromocion(promo, linea).aDecimalString()).toBe("60.00");
  });

  it("monto fijo topeado al total de la línea", () => {
    const promo: Promocion = {
      id: "p2",
      nombre: "$1000 off",
      tipo: TipoPromocion.MontoFijo,
      montoFijo: Money.desde("1000.00"),
    };
    const lineaChica = { cantidad: 1, precioUnitario: Money.desde("100.00") };
    expect(calcularDescuentoPromocion(promo, lineaChica).aDecimalString()).toBe("100.00");
  });

  it("lleva 3 paga 2 (3x2): 6 unidades → 2 gratis", () => {
    const promo: Promocion = {
      id: "p3",
      nombre: "3x2",
      tipo: TipoPromocion.LlevaPaga,
      llevaN: 3,
      pagaM: 2,
    };
    // floor(6/3)=2 grupos × (3−2)=1 → 2 unidades gratis × 100 = 200
    expect(calcularDescuentoPromocion(promo, linea).aDecimalString()).toBe("200.00");
  });

  it("3x2 con 5 unidades → 1 gratis", () => {
    const promo: Promocion = {
      id: "p3",
      nombre: "3x2",
      tipo: TipoPromocion.LlevaPaga,
      llevaN: 3,
      pagaM: 2,
    };
    expect(
      calcularDescuentoPromocion(promo, {
        cantidad: 5,
        precioUnitario: Money.desde("100.00"),
      }).aDecimalString(),
    ).toBe("100.00");
  });

  it("no aplica si no se alcanza la cantidad mínima", () => {
    const promo: Promocion = {
      id: "p4",
      nombre: "10% desde 10u",
      tipo: TipoPromocion.Porcentaje,
      porcentaje: 10,
      cantidadMinima: 10,
    };
    expect(calcularDescuentoPromocion(promo, linea).esCero()).toBe(true);
  });

  it("rechaza configuración lleva/paga inválida", () => {
    const promo: Promocion = {
      id: "p5",
      nombre: "malo",
      tipo: TipoPromocion.LlevaPaga,
      llevaN: 2,
      pagaM: 3,
    };
    expect(() => calcularDescuentoPromocion(promo, linea)).toThrow(ErrorDominio);
  });
});
