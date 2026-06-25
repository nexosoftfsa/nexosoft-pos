import { describe, expect, it } from "vitest";

import { Cantidad } from "../comun/cantidad.js";
import { crearDeposito } from "./deposito.js";
import {
  bajoStockMinimo,
  crearExistencia,
  hayStockSuficiente,
} from "./existencia.js";

describe("crearDeposito", () => {
  it("crea con id y recorta el nombre", () => {
    const d = crearDeposito({ nombre: "  Depósito central  " });
    expect(d.id).toBeTruthy();
    expect(d.nombre).toBe("Depósito central");
  });

  it("rechaza nombre vacío", () => {
    expect(() => crearDeposito({ nombre: "  " })).toThrow(/nombre/i);
  });
});

describe("crearExistencia", () => {
  it("arranca en cero sin datos de cantidad", () => {
    const e = crearExistencia({ articuloId: "A", depositoId: "D" });
    expect(e.cantidad.esCero()).toBe(true);
    expect(e.stockMinimo.esCero()).toBe(true);
  });
});

describe("bajoStockMinimo", () => {
  it("alerta cuando la cantidad está en o por debajo del mínimo (> 0)", () => {
    expect(
      bajoStockMinimo(
        crearExistencia({
          articuloId: "A",
          depositoId: "D",
          cantidad: Cantidad.de("5"),
          stockMinimo: Cantidad.de("5"),
        }),
      ),
    ).toBe(true);
  });

  it("no alerta si hay stock de sobra", () => {
    expect(
      bajoStockMinimo(
        crearExistencia({
          articuloId: "A",
          depositoId: "D",
          cantidad: Cantidad.de("20"),
          stockMinimo: Cantidad.de("5"),
        }),
      ),
    ).toBe(false);
  });

  it("no alerta si el mínimo es 0 (sin umbral)", () => {
    expect(
      bajoStockMinimo(
        crearExistencia({ articuloId: "A", depositoId: "D", cantidad: Cantidad.cero() }),
      ),
    ).toBe(false);
  });
});

describe("hayStockSuficiente", () => {
  it("compara contra la cantidad pedida", () => {
    const e = crearExistencia({
      articuloId: "A",
      depositoId: "D",
      cantidad: Cantidad.de("3"),
    });
    expect(hayStockSuficiente(e, Cantidad.de("3"))).toBe(true);
    expect(hayStockSuficiente(e, Cantidad.de("3.001"))).toBe(false);
  });
});
