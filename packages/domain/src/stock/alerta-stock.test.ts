import { describe, expect, it } from "vitest";

import { Cantidad } from "../comun/cantidad.js";
import {
  evaluarAlertasStockMinimo,
  evaluarAlertasVencimiento,
} from "./alerta-stock.js";
import { crearExistencia } from "./existencia.js";
import { crearLote, type Lote } from "./lote.js";

describe("evaluarAlertasStockMinimo", () => {
  it("lista solo las existencias bajo mínimo", () => {
    const existencias = [
      crearExistencia({
        articuloId: "bajo",
        depositoId: "D",
        cantidad: Cantidad.de("2"),
        stockMinimo: Cantidad.de("5"),
      }),
      crearExistencia({
        articuloId: "ok",
        depositoId: "D",
        cantidad: Cantidad.de("50"),
        stockMinimo: Cantidad.de("5"),
      }),
      crearExistencia({
        articuloId: "sin-umbral",
        depositoId: "D",
        cantidad: Cantidad.cero(),
      }),
    ];
    const alertas = evaluarAlertasStockMinimo(existencias);
    expect(alertas.map((a) => a.articuloId)).toEqual(["bajo"]);
  });
});

describe("evaluarAlertasVencimiento", () => {
  const HOY = new Date("2026-06-25");
  const lote = (id: string, vto: string, cant: string): Lote =>
    crearLote({
      id,
      articuloId: "A",
      depositoId: "D",
      vencimiento: new Date(vto),
      cantidad: Cantidad.de(cant),
    });

  it("incluye vencidos y próximos, ordenados por urgencia, con stock", () => {
    const lotes = [
      lote("vence-pronto", "2026-06-27", "3"),
      lote("vencido", "2026-06-20", "5"),
      lote("lejano", "2026-08-01", "10"),
      lote("agotado", "2026-06-19", "0"),
    ];
    const alertas = evaluarAlertasVencimiento(lotes, HOY, 3);
    // vencido (−5 días) antes que vence-pronto (+2); lejano y agotado quedan fuera.
    expect(alertas.map((a) => a.lote.id)).toEqual(["vencido", "vence-pronto"]);
    expect(alertas[0]?.vencido).toBe(true);
    expect(alertas[1]?.vencido).toBe(false);
  });
});
