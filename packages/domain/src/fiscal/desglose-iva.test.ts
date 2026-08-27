import { describe, expect, it } from "vitest";

import { Money } from "../dinero/money.js";
import { ALICUOTAS_IVA } from "./alicuota-iva.js";
import { desglosarIvaIncluido, desgloseSinDiscriminar } from "./desglose-iva.js";

const m = (v: string) => Money.desde(v);

describe("desglosarIvaIncluido", () => {
  it("separa neto e IVA de un precio final al 21%", () => {
    // 121 finales = 100 de neto + 21 de IVA.
    const r = desglosarIvaIncluido([{ importe: m("121.00"), alicuota: ALICUOTAS_IVA.VEINTIUNO }]);
    expect(r.neto.aDecimalString(2)).toBe("100.00");
    expect(r.iva.aDecimalString(2)).toBe("21.00");
    expect(r.total.aDecimalString(2)).toBe("121.00");
  });

  it("LO MÁS IMPORTANTE: total = neto + iva + exento, siempre", () => {
    // ARCA rechaza el comprobante si las cuentas no cierran al centavo.
    const casos = [
      [m("1234.56"), ALICUOTAS_IVA.VEINTIUNO],
      [m("999.99"), ALICUOTAS_IVA.DIEZ_CON_CINCO],
      [m("0.01"), ALICUOTAS_IVA.VEINTIUNO],
      [m("7777.77"), ALICUOTAS_IVA.VEINTISIETE],
    ] as const;
    for (const [importe, alicuota] of casos) {
      const r = desglosarIvaIncluido([{ importe, alicuota }]);
      expect(r.neto.sumar(r.iva).sumar(r.exento).aDecimalString(2)).toBe(importe.aDecimalString(2));
    }
  });

  it("la suma del detalle por alícuota da exactamente ImpIVA", () => {
    const r = desglosarIvaIncluido([
      { importe: m("121.00"), alicuota: ALICUOTAS_IVA.VEINTIUNO },
      { importe: m("110.50"), alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO },
      { importe: m("242.00"), alicuota: ALICUOTAS_IVA.VEINTIUNO },
    ]);
    const suma = r.porAlicuota.reduce((a, x) => a.sumar(x.importe), Money.cero());
    expect(suma.aDecimalString(2)).toBe(r.iva.aDecimalString(2));
  });

  it("agrupa las líneas de la misma alícuota en un solo renglón", () => {
    // ARCA rechaza si el mismo Id de IVA aparece dos veces.
    const r = desglosarIvaIncluido([
      { importe: m("121.00"), alicuota: ALICUOTAS_IVA.VEINTIUNO },
      { importe: m("242.00"), alicuota: ALICUOTAS_IVA.VEINTIUNO },
    ]);
    expect(r.porAlicuota).toHaveLength(1);
    expect(r.porAlicuota[0]?.codigoArca).toBe(5);
    expect(r.porAlicuota[0]?.base.aDecimalString(2)).toBe("300.00");
  });

  it("agrupa antes de redondear, no después", () => {
    // Tres líneas de 0.10 al 21%: redondeando línea por línea el IVA daría
    // 0.00 tres veces; agrupando da 0.05 sobre 0.30. Esa diferencia es la que
    // hace que ARCA rechace.
    const r = desglosarIvaIncluido([
      { importe: m("0.10"), alicuota: ALICUOTAS_IVA.VEINTIUNO },
      { importe: m("0.10"), alicuota: ALICUOTAS_IVA.VEINTIUNO },
      { importe: m("0.10"), alicuota: ALICUOTAS_IVA.VEINTIUNO },
    ]);
    expect(r.total.aDecimalString(2)).toBe("0.30");
    expect(r.iva.sumar(r.neto).aDecimalString(2)).toBe("0.30");
  });

  it("mezcla varias alícuotas y las ordena por código", () => {
    const r = desglosarIvaIncluido([
      { importe: m("127.00"), alicuota: ALICUOTAS_IVA.VEINTISIETE },
      { importe: m("121.00"), alicuota: ALICUOTAS_IVA.VEINTIUNO },
      { importe: m("110.50"), alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO },
    ]);
    expect(r.porAlicuota.map((x) => x.codigoArca)).toEqual([4, 5, 6]);
  });

  it("las líneas exentas van aparte y no suman IVA", () => {
    const r = desglosarIvaIncluido([
      { importe: m("121.00"), alicuota: ALICUOTAS_IVA.VEINTIUNO },
      { importe: m("500.00"), alicuota: null },
    ]);
    expect(r.exento.aDecimalString(2)).toBe("500.00");
    expect(r.iva.aDecimalString(2)).toBe("21.00");
    expect(r.total.aDecimalString(2)).toBe("621.00");
    expect(r.porAlicuota).toHaveLength(1);
  });

  it("la alícuota 0% aparece con base pero sin IVA", () => {
    // No es lo mismo que exento: ARCA quiere el renglón con Id 3.
    const r = desglosarIvaIncluido([{ importe: m("100.00"), alicuota: ALICUOTAS_IVA.CERO }]);
    expect(r.porAlicuota[0]?.codigoArca).toBe(3);
    expect(r.porAlicuota[0]?.base.aDecimalString(2)).toBe("100.00");
    expect(r.porAlicuota[0]?.importe.aDecimalString(2)).toBe("0.00");
    expect(r.exento.aDecimalString(2)).toBe("0.00");
  });

  it("sin líneas da todo en cero", () => {
    const r = desglosarIvaIncluido([]);
    expect(r.total.aDecimalString(2)).toBe("0.00");
    expect(r.porAlicuota).toEqual([]);
  });
});

describe("desgloseSinDiscriminar", () => {
  it("en un comprobante C el total va entero al neto, sin alícuotas", () => {
    // Mandar IVA discriminado en un comprobante C es un rechazo de ARCA.
    const r = desgloseSinDiscriminar(m("1500.00"));
    expect(r.neto.aDecimalString(2)).toBe("1500.00");
    expect(r.iva.aDecimalString(2)).toBe("0.00");
    expect(r.porAlicuota).toEqual([]);
    expect(r.total.aDecimalString(2)).toBe("1500.00");
  });
});
