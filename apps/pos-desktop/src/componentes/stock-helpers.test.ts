import { describe, expect, it } from "vitest";

import type { SaldoStock } from "../sync/cliente-stock";
import {
  aDatosMovimiento,
  calcularKpis,
  estadoStock,
  estadoVencimiento,
  FORM_MOVIMIENTO_VACIO,
  pideLote,
  sumaAlSaldo,
  textoVencimiento,
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
      validarMovimiento({ ...FORM_MOVIMIENTO_VACIO, productoId: "x", tipo: "ENTRADA", cantidad: "12,5" }),
    ).toEqual([]);
  });

  it("rechaza cantidad cero o negativa", () => {
    expect(
      validarMovimiento({ ...FORM_MOVIMIENTO_VACIO, productoId: "x", tipo: "SALIDA", cantidad: "0" }),
    ).not.toEqual([]);
  });

  it("exige vencimiento en el INGRESO de un perecedero (Fase 8.2)", () => {
    const errores = validarMovimiento(
      { ...FORM_MOVIMIENTO_VACIO, productoId: "x", tipo: "ENTRADA", cantidad: "5" },
      true,
    );
    expect(errores).toContain("El ingreso de un perecedero necesita la fecha de vencimiento.");
  });

  it("no exige vencimiento en la SALIDA de un perecedero (FEFO automático)", () => {
    expect(
      validarMovimiento(
        { ...FORM_MOVIMIENTO_VACIO, productoId: "x", tipo: "SALIDA", cantidad: "5" },
        true,
      ),
    ).toEqual([]);
  });
});

describe("pideLote", () => {
  it("solo la ENTRADA de un perecedero pide datos de lote", () => {
    expect(pideLote("ENTRADA", true)).toBe(true);
    expect(pideLote("SALIDA", true)).toBe(false);
    expect(pideLote("ENTRADA", false)).toBe(false);
  });
});

describe("aDatosMovimiento", () => {
  it("normaliza la cantidad y omite el motivo vacío", () => {
    const datos = aDatosMovimiento({ ...FORM_MOVIMIENTO_VACIO, productoId: "x", tipo: "ENTRADA", cantidad: "1.250,5" });
    expect(datos).toEqual({ productoId: "x", tipo: "ENTRADA", cantidad: "1250.5" });
  });

  it("incluye el motivo si viene", () => {
    const datos = aDatosMovimiento({ ...FORM_MOVIMIENTO_VACIO, productoId: "x", tipo: "SALIDA", cantidad: "2", motivo: "Rotura" });
    expect(datos.motivo).toBe("Rotura");
  });

  it("incluye vencimiento y N° de lote en el INGRESO de un perecedero", () => {
    const datos = aDatosMovimiento(
      {
        ...FORM_MOVIMIENTO_VACIO,
        productoId: "x",
        tipo: "ENTRADA",
        cantidad: "10",
        fechaVencimiento: "2026-09-01",
        numeroLote: "A1",
      },
      true,
    );
    expect(datos.fechaVencimiento).toBe("2026-09-01");
    expect(datos.numeroLote).toBe("A1");
  });

  it("NO manda datos de lote si el producto no es perecedero", () => {
    const datos = aDatosMovimiento(
      { ...FORM_MOVIMIENTO_VACIO, productoId: "x", tipo: "ENTRADA", cantidad: "10", fechaVencimiento: "2026-09-01" },
      false,
    );
    expect(datos.fechaVencimiento).toBeUndefined();
    expect(datos.numeroLote).toBeUndefined();
  });
});

describe("estadoVencimiento / textoVencimiento", () => {
  it("clasifica vencido / crítico / próximo", () => {
    expect(estadoVencimiento(-1, true)).toBe("vencido");
    expect(estadoVencimiento(3, false)).toBe("critico");
    expect(estadoVencimiento(20, false)).toBe("proximo");
  });

  it("texto legible del vencimiento", () => {
    expect(textoVencimiento(-2, true)).toContain("vencido");
    expect(textoVencimiento(0, false)).toBe("vence hoy");
    expect(textoVencimiento(5, false)).toBe("vence en 5 día(s)");
  });
});
