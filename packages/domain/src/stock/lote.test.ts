import { describe, expect, it } from "vitest";

import { Cantidad } from "../comun/cantidad.js";
import {
  cantidadTotal,
  crearLote,
  descontarFEFO,
  diasParaVencer,
  estaVencido,
  ordenarFEFO,
  porVencer,
  type Lote,
} from "./lote.js";

const HOY = new Date("2026-06-25");
const lote = (id: string, vto: string, cant: string): Lote =>
  crearLote({
    id,
    articuloId: "A",
    depositoId: "D",
    vencimiento: new Date(vto),
    cantidad: Cantidad.de(cant),
  });

describe("vencimientos", () => {
  it("detecta lote vencido", () => {
    expect(estaVencido(lote("l", "2026-06-20", "5"), HOY)).toBe(true);
    expect(estaVencido(lote("l", "2026-06-30", "5"), HOY)).toBe(false);
  });

  it("calcula días para vencer", () => {
    expect(diasParaVencer(lote("l", "2026-06-30", "5"), HOY)).toBe(5);
    expect(diasParaVencer(lote("l", "2026-06-20", "5"), HOY)).toBe(-5);
  });

  it("porVencer dentro de la ventana de aviso", () => {
    expect(porVencer(lote("l", "2026-06-27", "5"), HOY, 3)).toBe(true);
    expect(porVencer(lote("l", "2026-06-27", "5"), HOY, 1)).toBe(false);
    expect(porVencer(lote("l", "2026-06-20", "5"), HOY, 3)).toBe(false); // ya vencido
  });
});

describe("ordenarFEFO y cantidadTotal", () => {
  const lotes = [lote("nuevo", "2026-12-31", "10"), lote("viejo", "2026-07-01", "5")];

  it("ordena por vencimiento ascendente", () => {
    expect(ordenarFEFO(lotes).map((l) => l.id)).toEqual(["viejo", "nuevo"]);
  });

  it("suma cantidades", () => {
    expect(cantidadTotal(lotes).aDecimalString(0)).toBe("15");
  });
});

describe("descontarFEFO", () => {
  const lotes = [lote("viejo", "2026-07-01", "5"), lote("nuevo", "2026-12-31", "10")];

  it("descuenta primero del que vence antes", () => {
    const r = descontarFEFO(lotes, Cantidad.de("7"));
    expect(r.faltante.esCero()).toBe(true);
    const porId = new Map(r.lotes.map((l) => [l.id, l.cantidad.aDecimalString(0)]));
    expect(porId.get("viejo")).toBe("0"); // se agotó
    expect(porId.get("nuevo")).toBe("8"); // 10 − 2
  });

  it("reporta faltante si no alcanza", () => {
    const r = descontarFEFO(lotes, Cantidad.de("20"));
    expect(r.faltante.aDecimalString(0)).toBe("5");
    expect(cantidadTotal(r.lotes).esCero()).toBe(true);
  });
});
