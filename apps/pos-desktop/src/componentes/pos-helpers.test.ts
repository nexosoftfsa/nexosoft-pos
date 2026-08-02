import { describe, expect, it } from "vitest";
import {
  ALICUOTAS_IVA,
  Cantidad,
  crearArticulo,
  crearExistencia,
  Money,
  UnidadDeMedida,
} from "@nexosoft/domain";
import type { ProductoCatalogo } from "../datos/bootstrap";
import { filtrarCatalogoVenta } from "./pos-helpers";

function producto(
  id: string,
  codigoInterno: string,
  descripcion: string,
  codigoBarras?: string,
): ProductoCatalogo {
  const articulo = crearArticulo({
    id,
    codigoInterno,
    descripcion,
    unidadDeMedida: UnidadDeMedida.Unidad,
    costoNeto: Money.desde("100"),
    alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
    ...(codigoBarras !== undefined ? { codigoBarras } : {}),
  });
  crearExistencia({ articuloId: id, depositoId: "dep", cantidad: Cantidad.de("1") });
  return { articulo, precioFinal: Money.desde("150") };
}

describe("filtrarCatalogoVenta", () => {
  const catalogo = [
    producto("1", "COD1", "Gaseosa Cola 1.5L", "7790001"),
    producto("2", "COD2", "Yerba Mate 1kg"),
    producto("3", "3", "Alfajor Triple", "7790003"),
  ];

  it("sin busqueda devuelve todo", () => {
    expect(filtrarCatalogoVenta(catalogo, "")).toHaveLength(3);
  });

  it("filtra por descripcion, sin importar mayus/minus", () => {
    const r = filtrarCatalogoVenta(catalogo, "yerba");
    expect(r).toHaveLength(1);
    expect(r[0]?.articulo.descripcion).toBe("Yerba Mate 1kg");
  });

  it("filtra por codigo de barras", () => {
    expect(filtrarCatalogoVenta(catalogo, "7790003")).toHaveLength(1);
  });

  it("filtra por codigo interno", () => {
    expect(filtrarCatalogoVenta(catalogo, "COD2")).toHaveLength(1);
  });

  it("un producto sin codigo de barras no rompe el filtro", () => {
    expect(filtrarCatalogoVenta(catalogo, "yerba")).toHaveLength(1);
  });

  it("sin coincidencias devuelve vacio", () => {
    expect(filtrarCatalogoVenta(catalogo, "inexistente")).toHaveLength(0);
  });
});
