import { describe, expect, it } from "vitest";

import { crearListaDePrecios, TipoLista } from "./lista-de-precios.js";

describe("crearListaDePrecios", () => {
  it("crea una lista con id y predeterminada=false por defecto", () => {
    const l = crearListaDePrecios({ nombre: "Minorista", tipo: TipoLista.Minorista });
    expect(l.id).toBeTruthy();
    expect(l.tipo).toBe("minorista");
    expect(l.predeterminada).toBe(false);
  });

  it("permite marcarla como predeterminada", () => {
    const l = crearListaDePrecios({
      nombre: "Mayorista",
      tipo: TipoLista.Mayorista,
      predeterminada: true,
    });
    expect(l.predeterminada).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    expect(() => crearListaDePrecios({ nombre: "  ", tipo: TipoLista.Minorista })).toThrow(
      /nombre/i,
    );
  });
});
