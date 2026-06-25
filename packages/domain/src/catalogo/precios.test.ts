import { describe, expect, it } from "vitest";

import { ALICUOTAS_IVA } from "../fiscal/alicuota-iva.js";
import { CondicionIva } from "../fiscal/condicion-iva.js";
import { Money } from "../dinero/money.js";
import { crearArticulo } from "./articulo.js";
import { ModoPrecio, type PrecioArticulo } from "./lista-de-precios.js";
import { UnidadDeMedida } from "./unidad-de-medida.js";
import {
  calcularMargen,
  calcularPrecioVenta,
  redondearAMultiploDe,
  resolverPrecioArticulo,
} from "./precios.js";

const RI = { condicionEmisor: CondicionIva.ResponsableInscripto };
const MONO = { condicionEmisor: CondicionIva.Monotributo };
const costo = Money.desde("100.00");

describe("calcularPrecioVenta — Responsable Inscripto", () => {
  const r = calcularPrecioVenta(costo, 50, ALICUOTAS_IVA.VEINTIUNO, RI);

  it("marca sobre el neto y agrega IVA de venta", () => {
    expect(r.precioNetoVenta.aDecimalString()).toBe("150.00");
    expect(r.ivaVenta.aDecimalString()).toBe("31.50");
    expect(r.precioFinal.aDecimalString()).toBe("181.50");
  });

  it("con margen 0 el neto es el costo", () => {
    const sinMargen = calcularPrecioVenta(costo, 0, ALICUOTAS_IVA.VEINTIUNO, RI);
    expect(sinMargen.precioNetoVenta.aDecimalString()).toBe("100.00");
    expect(sinMargen.precioFinal.aDecimalString()).toBe("121.00");
  });
});

describe("calcularPrecioVenta — Monotributo", () => {
  const r = calcularPrecioVenta(costo, 50, ALICUOTAS_IVA.VEINTIUNO, MONO);

  it("marca sobre el costo con IVA y no discrimina IVA", () => {
    expect(r.costoConsiderado.aDecimalString()).toBe("121.00");
    expect(r.ivaVenta.aDecimalString()).toBe("0.00");
    expect(r.precioFinal.aDecimalString()).toBe("181.50");
  });

  it("da el mismo precio final que RI (la multiplicación conmuta)", () => {
    const ri = calcularPrecioVenta(costo, 50, ALICUOTAS_IVA.VEINTIUNO, RI);
    expect(r.precioFinal.igualA(ri.precioFinal)).toBe(true);
  });
});

describe("calcularMargen — operación inversa", () => {
  it("recupera el margen en RI", () => {
    expect(calcularMargen(costo, Money.desde("181.50"), ALICUOTAS_IVA.VEINTIUNO, RI)).toBe(50);
  });

  it("recupera el margen en Monotributo", () => {
    expect(calcularMargen(costo, Money.desde("181.50"), ALICUOTAS_IVA.VEINTIUNO, MONO)).toBe(50);
  });

  it("rechaza costo cero", () => {
    expect(() =>
      calcularMargen(Money.cero(), Money.desde("100"), ALICUOTAS_IVA.VEINTIUNO, RI),
    ).toThrow(/costo cero/i);
  });
});

describe("calcularPrecioVenta — validaciones", () => {
  it("rechaza margen negativo", () => {
    expect(() => calcularPrecioVenta(costo, -10, ALICUOTAS_IVA.VEINTIUNO, RI)).toThrow(/margen/i);
  });
});

describe("resolverPrecioArticulo", () => {
  const articulo = crearArticulo({
    codigoInterno: "A-001",
    descripcion: "Producto",
    unidadDeMedida: UnidadDeMedida.Unidad,
    costoNeto: costo,
    alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
  });

  it("modo manual devuelve el precio cargado", () => {
    const precio: PrecioArticulo = {
      articuloId: articulo.id,
      listaId: "L1",
      modo: ModoPrecio.Manual,
      precioManual: Money.desde("199.99"),
    };
    expect(resolverPrecioArticulo(precio, articulo, RI).aDecimalString()).toBe("199.99");
  });

  it("modo margen deriva el precio final del costo", () => {
    const precio: PrecioArticulo = {
      articuloId: articulo.id,
      listaId: "L1",
      modo: ModoPrecio.Margen,
      margenUtilidad: 50,
    };
    expect(resolverPrecioArticulo(precio, articulo, RI).aDecimalString()).toBe("181.50");
  });

  it("falla si falta el dato del modo", () => {
    const precio: PrecioArticulo = {
      articuloId: articulo.id,
      listaId: "L1",
      modo: ModoPrecio.Margen,
    };
    expect(() => resolverPrecioArticulo(precio, articulo, RI)).toThrow(/margen/i);
  });
});

describe("redondearAMultiploDe — redondeo comercial", () => {
  it("redondea al múltiplo de $0,50", () => {
    expect(redondearAMultiploDe(Money.desde("187.30"), Money.desde("0.50")).aDecimalString()).toBe(
      "187.50",
    );
  });

  it("redondea al múltiplo de $10", () => {
    expect(redondearAMultiploDe(Money.desde("181.50"), Money.desde("10")).aDecimalString()).toBe(
      "180.00",
    );
  });

  it("paso cero deja el monto intacto", () => {
    expect(redondearAMultiploDe(Money.desde("181.53"), Money.cero()).aDecimalString()).toBe(
      "181.53",
    );
  });
});
