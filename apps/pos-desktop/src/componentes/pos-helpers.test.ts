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
import {
  buscarProductoPorCodigo,
  cambiarCantidadCarrito,
  filtrarCatalogoVenta,
  fijarCantidadCarrito,
  quitarDelCarrito,
  ultimoItemCarrito,
  type ItemCarrito,
} from "./pos-helpers";

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

describe("buscarProductoPorCodigo", () => {
  const catalogo = [
    producto("1", "COD1", "Gaseosa Cola 1.5L", "7790001"),
    producto("2", "COD2", "Yerba Mate 1kg"),
  ];

  it("encuentra por codigo de barras exacto", () => {
    expect(buscarProductoPorCodigo(catalogo, "7790001")?.articulo.id).toBe("1");
  });

  it("encuentra por codigo interno exacto", () => {
    expect(buscarProductoPorCodigo(catalogo, "COD2")?.articulo.id).toBe("2");
  });

  it("no matchea por substring (a diferencia del filtro de busqueda)", () => {
    expect(buscarProductoPorCodigo(catalogo, "779000")).toBeUndefined();
  });

  it("undefined si no hay match", () => {
    expect(buscarProductoPorCodigo(catalogo, "no-existe")).toBeUndefined();
  });
});

describe("carrito de venta (atajos F8/Supr)", () => {
  const p1 = producto("1", "COD1", "Gaseosa Cola 1.5L", "7790001");
  const p2 = producto("2", "COD2", "Yerba Mate 1kg");
  const carrito: ItemCarrito[] = [
    { producto: p1, cantidad: 2 },
    { producto: p2, cantidad: 1 },
  ];

  describe("cambiarCantidadCarrito", () => {
    it("suma delta a la cantidad", () => {
      const r = cambiarCantidadCarrito(carrito, "1", 1);
      expect(r.find((c) => c.producto.articulo.id === "1")?.cantidad).toBe(3);
    });

    it("resta delta a la cantidad", () => {
      const r = cambiarCantidadCarrito(carrito, "1", -1);
      expect(r.find((c) => c.producto.articulo.id === "1")?.cantidad).toBe(1);
    });

    it("saca el item si la cantidad llega a 0 o menos", () => {
      const r = cambiarCantidadCarrito(carrito, "2", -1);
      expect(r.find((c) => c.producto.articulo.id === "2")).toBeUndefined();
      expect(r).toHaveLength(1);
    });

    it("no toca los demas items", () => {
      const r = cambiarCantidadCarrito(carrito, "1", 1);
      expect(r.find((c) => c.producto.articulo.id === "2")?.cantidad).toBe(1);
    });
  });

  describe("fijarCantidadCarrito", () => {
    it("fija la cantidad absoluta (atajo F8)", () => {
      const r = fijarCantidadCarrito(carrito, "1", 12);
      expect(r.find((c) => c.producto.articulo.id === "1")?.cantidad).toBe(12);
    });

    it("saca el item si la cantidad fijada es 0 o menos", () => {
      const r = fijarCantidadCarrito(carrito, "1", 0);
      expect(r.find((c) => c.producto.articulo.id === "1")).toBeUndefined();
    });
  });

  describe("quitarDelCarrito", () => {
    it("saca el item con ese id", () => {
      const r = quitarDelCarrito(carrito, "1");
      expect(r).toHaveLength(1);
      expect(r[0]?.producto.articulo.id).toBe("2");
    });

    it("no hace nada si el id no esta", () => {
      expect(quitarDelCarrito(carrito, "no-existe")).toHaveLength(2);
    });
  });

  describe("ultimoItemCarrito", () => {
    it("devuelve el ultimo item agregado (el que afectan los atajos)", () => {
      expect(ultimoItemCarrito(carrito)?.producto.articulo.id).toBe("2");
    });

    it("undefined si el carrito esta vacio", () => {
      expect(ultimoItemCarrito([])).toBeUndefined();
    });
  });
});
