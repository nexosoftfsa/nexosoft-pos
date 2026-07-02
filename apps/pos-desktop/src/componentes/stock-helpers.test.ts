import { describe, expect, it } from "vitest";

import type { SaldoStock } from "../sync/cliente-stock";
import {
  aDatosMovimiento,
  calcularKpis,
  estadoStock,
  FORM_MOVIMIENTO_VACIO,
  sumaAlSaldo,
  validarMovimiento,
} from "./stock-helpers";

function saldo(id: string, s: string): SaldoStock {
  return { producto: { id, nombre: id, codigo: id }, saldo: s };
}

describe("estadoStock", () => {
  it("clasifica sin / bajo / ok según el umbral", () => {
    expect(estadoStock("0", 5)).toBe("sin");
    expect(estadoStock("-2", 5)).toBe("sin");
    expect(estadoStock("3", 5)).toBe("bajo");
    expect(estadoStock("5", 5)).toBe("bajo");
    expect(estadoStock("6", 5)).toBe("ok");
  });
});

describe("calcularKpis", () => {
  it("cuenta activos, bajo mínimo y sin stock", () => {
    const saldos = [saldo("a", "40"), saldo("b", "3"), saldo("c", "0"), saldo("d", "5")];
    expect(calcularKpis(saldos, 5)).toEqual({ activos: 4, bajo: 2, sin: 1 });
  });
});

describe("sumaAlSaldo", () => {
  it("ENTRADA y AJUSTE suman; SALIDA y VENTA restan", () => {
    expect(sumaAlSaldo("ENTRADA")).toBe(true);
    expect(sumaAlSaldo("AJUSTE")).toBe(true);
    expect(sumaAlSaldo("SALIDA")).toBe(false);
    expect(sumaAlSaldo("VENTA")).toBe(false);
  });
});

describe("validarMovimiento", () => {
  it("exige producto y cantidad válida", () => {
    const errores = validarMovimiento({ ...FORM_MOVIMIENTO_VACIO });
    expect(errores).toContain("Elegí un producto.");
    expect(errores).toContain("La cantidad debe ser un número mayor a cero.");
  });

  it("acepta un formulario correcto (con coma decimal)", () => {
    expect(
      validarMovimiento({ productoId: "x", tipo: "ENTRADA", cantidad: "12,5", motivo: "" }),
    ).toEqual([]);
  });

  it("rechaza cantidad cero o negativa", () => {
    expect(
      validarMovimiento({ productoId: "x", tipo: "SALIDA", cantidad: "0", motivo: "" }),
    ).not.toEqual([]);
  });
});

describe("aDatosMovimiento", () => {
  it("normaliza la cantidad y omite el motivo vacío", () => {
    const datos = aDatosMovimiento({ productoId: "x", tipo: "ENTRADA", cantidad: "1.250,5", motivo: "  " });
    expect(datos).toEqual({ productoId: "x", tipo: "ENTRADA", cantidad: "1250.5" });
  });

  it("incluye el motivo si viene", () => {
    const datos = aDatosMovimiento({ productoId: "x", tipo: "SALIDA", cantidad: "2", motivo: "Rotura" });
    expect(datos.motivo).toBe("Rotura");
  });
});
