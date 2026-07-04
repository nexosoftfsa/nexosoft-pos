import { describe, expect, it } from "vitest";

import { ALICUOTAS_IVA } from "../fiscal/alicuota-iva.js";
import { TipoComprobante } from "../fiscal/tipo-comprobante.js";
import { Money } from "../dinero/money.js";
import { calcularComprobante, type LineaVenta } from "./calculo-comprobante.js";

const ITEM_21 = (precio: string, cantidad: number | string = 1): LineaVenta => ({
  descripcion: "Producto 21%",
  cantidad,
  precioUnitario: Money.desde(precio),
  alicuota: ALICUOTAS_IVA.VEINTIUNO,
});

describe("calcularComprobante — Factura B (IVA incluido, no discrimina)", () => {
  const r = calcularComprobante([ITEM_21("1210.00")], {
    tipo: TipoComprobante.FacturaB,
  });

  it("descompone el IVA incluido", () => {
    expect(r.netoGravado.aDecimalString()).toBe("1000.00");
    expect(r.iva.aDecimalString()).toBe("210.00");
    expect(r.total.aDecimalString()).toBe("1210.00");
  });

  it("no discrimina IVA (es letra B)", () => {
    expect(r.discriminaIva).toBe(false);
  });

  it("cumple netoGravado + iva = total", () => {
    expect(r.netoGravado.sumar(r.iva).igualA(r.total)).toBe(true);
  });
});

describe("calcularComprobante — recargo global", () => {
  it("aplica el recargo por encima del total y lo reporta, manteniendo el IVA consistente", () => {
    const r = calcularComprobante([ITEM_21("1000.00")], {
      tipo: TipoComprobante.FacturaB,
      recargoPorcentaje: 10,
    });
    expect(r.total.aDecimalString()).toBe("1100.00"); // 1000 + 10%
    expect(r.recargo.aDecimalString()).toBe("100.00");
    expect(r.descuento.aDecimalString()).toBe("0.00");
    expect(r.netoGravado.sumar(r.iva).igualA(r.total)).toBe(true);
  });

  it("sin recargo el campo queda en 0,00", () => {
    const r = calcularComprobante([ITEM_21("1000.00")], { tipo: TipoComprobante.FacturaB });
    expect(r.recargo.aDecimalString()).toBe("0.00");
  });
});

describe("calcularComprobante — Factura A discrimina IVA", () => {
  const r = calcularComprobante([ITEM_21("1210.00")], {
    tipo: TipoComprobante.FacturaA,
  });

  it("muestra neto e IVA y marca discriminaIva", () => {
    expect(r.discriminaIva).toBe(true);
    expect(r.subtotalesPorAlicuota).toHaveLength(1);
    const [grupo] = r.subtotalesPorAlicuota;
    expect(grupo?.neto.aDecimalString()).toBe("1000.00");
    expect(grupo?.iva.aDecimalString()).toBe("210.00");
  });
});

describe("calcularComprobante — Factura C (Monotributo, sin IVA)", () => {
  const r = calcularComprobante([ITEM_21("1000.00")], {
    tipo: TipoComprobante.FacturaC,
  });

  it("no calcula IVA: el precio es el total", () => {
    expect(r.iva.aDecimalString()).toBe("0.00");
    expect(r.netoGravado.aDecimalString()).toBe("1000.00");
    expect(r.total.aDecimalString()).toBe("1000.00");
  });
});

describe("calcularComprobante — multi-alícuota", () => {
  const r = calcularComprobante(
    [
      {
        descripcion: "Bebida 21%",
        cantidad: 1,
        precioUnitario: Money.desde("1210.00"),
        alicuota: ALICUOTAS_IVA.VEINTIUNO,
      },
      {
        descripcion: "Alimento 10,5%",
        cantidad: 1,
        precioUnitario: Money.desde("1105.00"),
        alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO,
      },
    ],
    { tipo: TipoComprobante.FacturaA },
  );

  it("agrupa el IVA por alícuota", () => {
    expect(r.subtotalesPorAlicuota).toHaveLength(2);
    const g21 = r.subtotalesPorAlicuota.find((s) => s.alicuota.porcentaje === 21);
    const g105 = r.subtotalesPorAlicuota.find((s) => s.alicuota.porcentaje === 10.5);
    expect(g21?.iva.aDecimalString()).toBe("210.00");
    expect(g105?.iva.aDecimalString()).toBe("105.00");
  });

  it("totaliza correctamente", () => {
    expect(r.netoGravado.aDecimalString()).toBe("2000.00");
    expect(r.iva.aDecimalString()).toBe("315.00");
    expect(r.total.aDecimalString()).toBe("2315.00");
  });
});

describe("calcularComprobante — descuentos de línea y global", () => {
  const r = calcularComprobante([{ ...ITEM_21("1000.00", 2), descuentoPorcentaje: 10 }], {
    tipo: TipoComprobante.FacturaB,
    descuentoPorcentaje: 5,
  });

  it("aplica descuento de línea (10%) y global (5%)", () => {
    // 2000 − 10% = 1800 ; 1800 − 5% = 1710
    expect(r.total.aDecimalString()).toBe("1710.00");
    expect(r.brutoSinDescuento.aDecimalString()).toBe("2000.00");
    expect(r.descuento.aDecimalString()).toBe("290.00");
  });

  it("mantiene brutoSinDescuento − descuento = total", () => {
    expect(r.brutoSinDescuento.restar(r.descuento).igualA(r.total)).toBe(true);
  });

  it("descompone el IVA del importe ya descontado", () => {
    // 1710 × 100/121 = 1413,22 ; IVA = 296,78
    expect(r.netoGravado.aDecimalString()).toBe("1413.22");
    expect(r.iva.aDecimalString()).toBe("296.78");
    expect(r.netoGravado.sumar(r.iva).igualA(r.total)).toBe(true);
  });
});

describe("calcularComprobante — precios netos (Factura A mayorista)", () => {
  const r = calcularComprobante([ITEM_21("1000.00")], {
    tipo: TipoComprobante.FacturaA,
    preciosIncluyenIva: false,
  });

  it("suma el IVA por encima del neto", () => {
    expect(r.netoGravado.aDecimalString()).toBe("1000.00");
    expect(r.iva.aDecimalString()).toBe("210.00");
    expect(r.total.aDecimalString()).toBe("1210.00");
  });
});

describe("calcularComprobante — conciliación de redondeo", () => {
  it("3 líneas con centavos: neto + iva = total sin desfasaje", () => {
    const r = calcularComprobante([ITEM_21("0.10"), ITEM_21("0.10"), ITEM_21("0.10")], {
      tipo: TipoComprobante.FacturaB,
    });
    expect(r.total.aDecimalString()).toBe("0.30");
    expect(r.netoGravado.aDecimalString()).toBe("0.25");
    expect(r.iva.aDecimalString()).toBe("0.05");
    expect(r.netoGravado.sumar(r.iva).igualA(r.total)).toBe(true);
  });

  it("cantidad fraccionada (peso)", () => {
    // 1,250 kg × $968,00/kg = $1210,00 (IVA incl. 21%)
    const r = calcularComprobante([ITEM_21("968.00", "1.250")], {
      tipo: TipoComprobante.FacturaB,
    });
    expect(r.total.aDecimalString()).toBe("1210.00");
    expect(r.lineas[0]?.cantidad).toBe("1.250");
  });
});

describe("calcularComprobante — validaciones", () => {
  it("rechaza comprobante sin líneas", () => {
    expect(() => calcularComprobante([], { tipo: TipoComprobante.FacturaB })).toThrow(
      /al menos una línea/i,
    );
  });

  it("rechaza cantidad no positiva", () => {
    expect(() =>
      calcularComprobante([ITEM_21("100", 0)], {
        tipo: TipoComprobante.FacturaB,
      }),
    ).toThrow(/cantidad/i);
  });

  it("rechaza descuento fuera de rango", () => {
    expect(() =>
      calcularComprobante([{ ...ITEM_21("100"), descuentoPorcentaje: 150 }], {
        tipo: TipoComprobante.FacturaB,
      }),
    ).toThrow(/descuento/i);
  });
});
