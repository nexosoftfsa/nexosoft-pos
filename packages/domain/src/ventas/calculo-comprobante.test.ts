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

/**
 * Exento NO es la alícuota del 0%.
 *
 * Ante ARCA el 0% lleva renglón en el detalle de IVA con Id 3, y lo exento va a
 * `ImpOpEx` sin renglón. Mientras `Articulo.alicuotaIva` no admitió `null`, el
 * POS mapeaba EXENTO al 0% y el ticket imprimía una línea "IVA 0%" que el
 * comprobante fiscal no tenía: el papel y lo declarado decían cosas distintas.
 */
describe("calcularComprobante — exento", () => {
  const EXENTO = (precio: string): LineaVenta => ({
    descripcion: "Producto exento",
    cantidad: 1,
    precioUnitario: Money.desde(precio),
    alicuota: null,
  });

  it("una línea exenta no paga IVA y su neto es el importe entero", () => {
    const r = calcularComprobante([EXENTO("1000.00")], { tipo: TipoComprobante.FacturaA });

    const exento = r.subtotalesPorAlicuota.find((s) => s.alicuota === null);
    expect(exento?.neto.aDecimalString(2)).toBe("1000.00");
    expect(exento?.iva.aDecimalString(2)).toBe("0.00");
    expect(r.iva.aDecimalString(2)).toBe("0.00");
  });

  it("NO se mezcla con el 0%: son dos renglones distintos", () => {
    const cero: LineaVenta = {
      descripcion: "Producto 0%",
      cantidad: 1,
      precioUnitario: Money.desde("500.00"),
      alicuota: ALICUOTAS_IVA.CERO,
    };

    const r = calcularComprobante([EXENTO("1000.00"), cero], { tipo: TipoComprobante.FacturaA });

    expect(r.subtotalesPorAlicuota).toHaveLength(2);
    expect(r.subtotalesPorAlicuota.filter((s) => s.alicuota === null)).toHaveLength(1);
    expect(
      r.subtotalesPorAlicuota.filter((s) => s.alicuota?.codigoArca === 3),
    ).toHaveLength(1);
  });

  it("convive con una línea gravada sin ensuciarle el IVA", () => {
    const r = calcularComprobante([ITEM_21("1210.00"), EXENTO("1000.00")], {
      tipo: TipoComprobante.FacturaA,
    });

    // El IVA sale sólo de la línea gravada: 1210 × 21 / 121 = 210.
    expect(r.iva.aDecimalString(2)).toBe("210.00");
    expect(r.total.aDecimalString(2)).toBe("2210.00");
  });

  it("dos líneas exentas se agrupan en un solo renglón", () => {
    const r = calcularComprobante([EXENTO("1000.00"), EXENTO("500.00")], {
      tipo: TipoComprobante.FacturaA,
    });

    const exentos = r.subtotalesPorAlicuota.filter((s) => s.alicuota === null);
    expect(exentos).toHaveLength(1);
    expect(exentos[0]?.neto.aDecimalString(2)).toBe("1500.00");
  });
});

/**
 * El neto por línea, que es lo que tiene que imprimir una Factura A.
 *
 * La norma pide precios unitarios **netos de impuestos** y el precio neto de la
 * línea como cantidad × precio unitario neto. Hasta el 23/9/2026 la A salía con
 * el precio final por renglón y el IVA recién al pie: el renglón decía
 * $ 10.000 y abajo aparecía un neto de $ 8.264,46 que no salía de ningún lado.
 */
describe("calcularComprobante — neto por línea", () => {
  it("descompone el IVA de cada línea", () => {
    const r = calcularComprobante([ITEM_21("1210.00")], { tipo: TipoComprobante.FacturaA });
    expect(r.lineas[0]?.neto.aDecimalString(2)).toBe("1000.00");
    expect(r.lineas[0]?.netoUnitario.aDecimalString(2)).toBe("1000.00");
  });

  it("con cantidad, el unitario es el neto dividido por la cantidad", () => {
    const r = calcularComprobante([ITEM_21("1210.00", 3)], { tipo: TipoComprobante.FacturaA });
    expect(r.lineas[0]?.neto.aDecimalString(2)).toBe("3000.00");
    expect(r.lineas[0]?.netoUnitario.aDecimalString(2)).toBe("1000.00");
  });

  /**
   * LA invariante. Calcular cada línea por separado —dividiéndola por
   * (1 + tasa)— redondea una vez por renglón y la suma queda a centavos del
   * neto declarado a ARCA. Una Factura A cuyos renglones no suman su propio
   * neto es peor que una con renglones brutos.
   */
  it("la suma de los netos da EXACTAMENTE el neto del grupo", () => {
    // Tres líneas de 0,10: cada una por separado daría 0,08 (0,0826 redondeado)
    // y sumarían 0,24, cuando el neto del grupo es 0,25.
    const r = calcularComprobante([ITEM_21("0.10"), ITEM_21("0.10"), ITEM_21("0.10")], {
      tipo: TipoComprobante.FacturaA,
    });
    const suma = r.lineas.reduce((a, l) => a.sumar(l.neto), Money.cero());
    expect(suma.aDecimalString(2)).toBe(r.netoGravado.aDecimalString(2));
    expect(suma.aDecimalString(2)).toBe("0.25");
  });

  it("cierra exacto también con varias alícuotas mezcladas", () => {
    const r = calcularComprobante(
      [
        ITEM_21("333.33"),
        ITEM_21("333.33"),
        {
          descripcion: "Alimento 10,5%",
          cantidad: 1,
          precioUnitario: Money.desde("221.11"),
          alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO,
        },
        {
          descripcion: "Exento",
          cantidad: 1,
          precioUnitario: Money.desde("99.99"),
          alicuota: null,
        },
      ],
      { tipo: TipoComprobante.FacturaA },
    );

    for (const grupo of r.subtotalesPorAlicuota) {
      const deEsteGrupo = r.lineas.filter((l) => l.alicuota?.porcentaje === grupo.alicuota?.porcentaje);
      const suma = deEsteGrupo.reduce((a, l) => a.sumar(l.neto), Money.cero());
      expect(suma.aDecimalString(2)).toBe(grupo.neto.aDecimalString(2));
    }
  });

  it("una línea exenta tiene neto igual a su importe: no hay IVA que sacarle", () => {
    const r = calcularComprobante(
      [{ descripcion: "Exento", cantidad: 1, precioUnitario: Money.desde("1450"), alicuota: null }],
      { tipo: TipoComprobante.FacturaA },
    );
    expect(r.lineas[0]?.neto.aDecimalString(2)).toBe("1450.00");
  });

  it("con precios ya netos (mayorista) el neto es el importe", () => {
    const r = calcularComprobante([ITEM_21("1000.00")], {
      tipo: TipoComprobante.FacturaA,
      preciosIncluyenIva: false,
    });
    expect(r.lineas[0]?.neto.aDecimalString(2)).toBe("1000.00");
  });

  /** En una C no hay IVA que descomponer: el precio ES el neto. */
  it("en Factura C el neto es el importe", () => {
    const r = calcularComprobante([ITEM_21("1000.00")], { tipo: TipoComprobante.FacturaC });
    expect(r.lineas[0]?.neto.aDecimalString(2)).toBe("1000.00");
  });
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
