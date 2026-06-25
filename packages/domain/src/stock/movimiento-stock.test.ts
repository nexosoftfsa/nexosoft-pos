import { describe, expect, it } from "vitest";

import { Cantidad } from "../comun/cantidad.js";
import { ErrorStock } from "../comun/errores.js";
import { crearExistencia } from "./existencia.js";
import {
  aplicarMovimiento,
  calcularExistencia,
  crearMovimiento,
  esIngreso,
  TipoMovimiento,
} from "./movimiento-stock.js";

const mov = (tipo: (typeof TipoMovimiento)[keyof typeof TipoMovimiento], cant: string) =>
  crearMovimiento({
    articuloId: "A",
    depositoId: "D",
    tipo,
    cantidad: Cantidad.de(cant),
  });

describe("esIngreso", () => {
  it("clasifica ingresos y egresos", () => {
    expect(esIngreso(TipoMovimiento.Compra)).toBe(true);
    expect(esIngreso(TipoMovimiento.Devolucion)).toBe(true);
    expect(esIngreso(TipoMovimiento.AjustePositivo)).toBe(true);
    expect(esIngreso(TipoMovimiento.Venta)).toBe(false);
    expect(esIngreso(TipoMovimiento.Merma)).toBe(false);
    expect(esIngreso(TipoMovimiento.AjusteNegativo)).toBe(false);
  });
});

describe("crearMovimiento", () => {
  it("rechaza cantidad no positiva", () => {
    expect(() =>
      crearMovimiento({
        articuloId: "A",
        depositoId: "D",
        tipo: TipoMovimiento.Compra,
        cantidad: Cantidad.cero(),
      }),
    ).toThrow(ErrorStock);
  });
});

describe("aplicarMovimiento", () => {
  const inicial = crearExistencia({
    articuloId: "A",
    depositoId: "D",
    cantidad: Cantidad.de("10"),
  });

  it("una compra suma stock", () => {
    const e = aplicarMovimiento(inicial, mov(TipoMovimiento.Compra, "5"));
    expect(e.cantidad.aDecimalString(0)).toBe("15");
  });

  it("una venta resta stock", () => {
    const e = aplicarMovimiento(inicial, mov(TipoMovimiento.Venta, "4"));
    expect(e.cantidad.aDecimalString(0)).toBe("6");
  });

  it("bloquea stock negativo por defecto", () => {
    expect(() => aplicarMovimiento(inicial, mov(TipoMovimiento.Venta, "11"))).toThrow(
      /insuficiente/i,
    );
  });

  it("permite negativo si se habilita (sobreventa)", () => {
    const e = aplicarMovimiento(inicial, mov(TipoMovimiento.Venta, "11"), {
      permitirNegativo: true,
    });
    expect(e.cantidad.esNegativa()).toBe(true);
  });

  it("rechaza un movimiento de otro artículo/depósito", () => {
    const otro = crearMovimiento({
      articuloId: "B",
      depositoId: "D",
      tipo: TipoMovimiento.Compra,
      cantidad: Cantidad.de("1"),
    });
    expect(() => aplicarMovimiento(inicial, otro)).toThrow(/otro artículo/i);
  });

  it("no muta la existencia original", () => {
    aplicarMovimiento(inicial, mov(TipoMovimiento.Venta, "4"));
    expect(inicial.cantidad.aDecimalString(0)).toBe("10");
  });
});

describe("calcularExistencia desde el historial", () => {
  it("reduce todos los movimientos del artículo/depósito", () => {
    const movs = [
      mov(TipoMovimiento.Compra, "100"),
      mov(TipoMovimiento.Venta, "30"),
      mov(TipoMovimiento.Merma, "5"),
      mov(TipoMovimiento.AjustePositivo, "2"),
    ];
    const e = calcularExistencia("A", "D", movs);
    expect(e.cantidad.aDecimalString(0)).toBe("67");
  });
});
