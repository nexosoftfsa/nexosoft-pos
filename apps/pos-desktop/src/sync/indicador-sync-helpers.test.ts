import { describe, expect, it } from "vitest";

import type { OperacionEnCola } from "@nexosoft/sync";

import {
  confirmacionDescartar,
  estadoDeLaPildora,
  rangoDeFechas,
} from "./indicador-sync-helpers";

const TRANQUILO = { online: true, sincronizando: false, pendientes: 0, fallidas: 0 };

describe("estadoDeLaPildora", () => {
  it("sin nada que hacer dice que está todo bien", () => {
    expect(estadoDeLaPildora(TRANQUILO).tono).toBe("ok");
  });

  /**
   * El hueco que abrió ADR-0066: al dejar de confundir "sin internet" con "sin
   * servidor", la píldora pasó a decir "Sincronizado" con ARCA caída, mientras
   * los comprobantes se apilaban sin CAE.
   */
  it("con todo subido pero sin CAE, no dice que está todo bien", () => {
    const p = estadoDeLaPildora({
      ...TRANQUILO,
      esperandoCae: { cantidad: 3, masAntigua: null, vencidas: 0 },
    });
    expect(p.tono).toBe("sin-cae");
    expect(p.texto).toBe("3 comprobantes sin CAE");
    expect(p.detalle).toContain("no hay que hacer nada");
  });

  it("uno solo va en singular", () => {
    expect(
      estadoDeLaPildora({
        ...TRANQUILO,
        esperandoCae: { cantidad: 1, masAntigua: null, vencidas: 0 },
      }).texto,
    ).toBe("1 comprobante sin CAE");
  });

  it("los que ARCA ya no autoriza por fecha son error, no espera", () => {
    const p = estadoDeLaPildora({
      ...TRANQUILO,
      esperandoCae: { cantidad: 4, masAntigua: null, vencidas: 2 },
    });
    expect(p.tono).toBe("error");
    expect(p.texto).toContain("fuera de plazo");
    expect(p.detalle).toContain("contador");
  });

  it("una venta que no pudo subir manda sobre todo lo demás", () => {
    const p = estadoDeLaPildora({
      ...TRANQUILO,
      fallidas: 2,
      esperandoCae: { cantidad: 5, masAntigua: null, vencidas: 1 },
    });
    expect(p.tono).toBe("error");
    expect(p.texto).toBe("2 ventas con error");
  });

  it("sin servidor gana sobre los pendientes de CAE: primero hay que volver", () => {
    const p = estadoDeLaPildora({
      ...TRANQUILO,
      online: false,
      esperandoCae: { cantidad: 3, masAntigua: null, vencidas: 0 },
    });
    expect(p.tono).toBe("offline");
    expect(p.detalle).toContain("Se puede seguir vendiendo");
  });

  it("las ventas sin subir se avisan antes que las que esperan CAE", () => {
    const p = estadoDeLaPildora({
      ...TRANQUILO,
      pendientes: 1,
      esperandoCae: { cantidad: 9, masAntigua: null, vencidas: 0 },
    });
    expect(p.tono).toBe("pendiente");
    expect(p.texto).toBe("1 venta sin subir");
  });

  it("sin dato de CAE (servidor viejo) no inventa nada", () => {
    expect(estadoDeLaPildora({ ...TRANQUILO, esperandoCae: null }).tono).toBe("ok");
    expect(estadoDeLaPildora(TRANQUILO).tono).toBe("ok");
  });
});

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
