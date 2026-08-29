import { describe, expect, it } from "vitest";

import type { OperacionEnCola } from "@nexosoft/sync";

import { confirmacionDescartar, rangoDeFechas } from "./indicador-sync-helpers";

function op(creadaEn: string): OperacionEnCola {
  return {
    operacionId: `op-${creadaEn}`,
    tipo: "venta",
    payload: {},
    terminalId: "caja-1",
    creadaEn,
    estado: "fallida",
    intentos: 5,
  };
}

describe("rangoDeFechas", () => {
  it("dice el rango cuando hay varias fechas", () => {
    const r = rangoDeFechas([op("2026-08-20T10:00:00Z"), op("2026-08-29T10:00:00Z")]);
    expect(r).toContain("entre el");
    expect(r).toContain("20/8/2026");
    expect(r).toContain("29/8/2026");
  });

  it("no repite la fecha cuando son todas del mismo dia", () => {
    const r = rangoDeFechas([op("2026-08-29T10:00:00Z"), op("2026-08-29T18:00:00Z")]);
    expect(r).toBe("del 29/8/2026");
  });

  it("sin operaciones no hay rango", () => {
    expect(rangoDeFechas([])).toBeNull();
  });

  it("no depende del orden en que vengan", () => {
    const desordenadas = [op("2026-08-29T10:00:00Z"), op("2026-08-20T10:00:00Z")];
    expect(rangoDeFechas(desordenadas)).toBe(rangoDeFechas([...desordenadas].reverse()));
  });
});

describe("confirmacionDescartar", () => {
  const ops = [op("2026-08-20T10:00:00Z"), op("2026-08-29T10:00:00Z")];

  it("dice cuantas son y de cuando", () => {
    const m = confirmacionDescartar(ops);
    expect(m).toContain("2 operaciones");
    expect(m).toContain("20/8/2026");
  });

  it("aclara que NO se borra ninguna venta", () => {
    // Es lo primero que se malinterpreta: "descartar" suena a perder ventas.
    const m = confirmacionDescartar(ops);
    expect(m).toContain("no se borran");
    expect(m).toContain("guardadas en esta terminal");
  });

  it("explica por que no pueden entrar y para que sirve descartarlas", () => {
    const m = confirmacionDescartar(ops);
    expect(m).toContain("ya no existen");
    expect(m).toContain("fallas nuevas");
  });

  it("concuerda en singular con una sola", () => {
    expect(confirmacionDescartar([op("2026-08-29T10:00:00Z")])).toContain("1 operación");
  });
});
