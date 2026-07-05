import { describe, expect, it } from "vitest";
import { Money, TipoPromocion, type Promocion } from "@nexosoft/domain";

import {
  descuentoDeLinea,
  descuentoPorcentajeLinea,
  PROMOS_DEMO,
  promoAplicable,
} from "./promos";

const ahora = new Date();

describe("promoAplicable", () => {
  it("encuentra la promo del artículo por su ámbito", () => {
    const p = promoAplicable(PROMOS_DEMO, "alfajor", undefined, ahora);
    expect(p?.nombre).toBe("3x2 en Alfajores");
  });

  it("devuelve undefined si ningún ámbito matchea", () => {
    expect(promoAplicable(PROMOS_DEMO, "yerba", undefined, ahora)).toBeUndefined();
  });

  it("respeta la vigencia", () => {
    const vencida: Promocion = {
      id: "x",
      nombre: "Vieja",
      tipo: TipoPromocion.Porcentaje,
      porcentaje: 50,
      articuloIds: ["yerba"],
      vigencia: { desde: new Date("2020-01-01"), hasta: new Date("2020-12-31") },
    };
    expect(promoAplicable([vencida], "yerba", undefined, ahora)).toBeUndefined();
  });
});

describe("descuentoDeLinea", () => {
  it("3x2: al llevar 3, una unidad gratis", () => {
    const promo = PROMOS_DEMO.find((p) => p.id === "promo-alfajor-3x2")!;
    const d = descuentoDeLinea(promo, 3, Money.desde("1200"));
    expect(d.aDecimalString(2)).toBe("1200.00");
  });

  it("3x2: con 2 unidades todavía no hay descuento", () => {
    const promo = PROMOS_DEMO.find((p) => p.id === "promo-alfajor-3x2")!;
    expect(descuentoDeLinea(promo, 2, Money.desde("1200")).esCero()).toBe(true);
  });

  it("porcentaje: 15% sobre la línea", () => {
    const promo = PROMOS_DEMO.find((p) => p.id === "promo-gaseosa-15")!;
    const d = descuentoDeLinea(promo, 2, Money.desde("1000"));
    expect(d.aDecimalString(2)).toBe("300.00"); // 15% de 2000
  });
});

describe("descuentoPorcentajeLinea", () => {
  it("convierte el descuento a porcentaje del total de la línea", () => {
    const promo = PROMOS_DEMO.find((p) => p.id === "promo-gaseosa-15")!;
    expect(descuentoPorcentajeLinea(promo, 2, Money.desde("1000"))).toBeCloseTo(15);
  });

  it("3x2 sobre 3 unidades equivale a ~33,33%", () => {
    const promo = PROMOS_DEMO.find((p) => p.id === "promo-alfajor-3x2")!;
    expect(descuentoPorcentajeLinea(promo, 3, Money.desde("1200"))).toBeCloseTo(33.33, 1);
  });
});
