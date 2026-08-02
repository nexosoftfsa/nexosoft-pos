import { describe, expect, it } from "vitest";
import type { ProductoAdmin } from "../sync/cliente-catalogo-admin";
import { armarEtiquetas, filtrarProductos, rubrosDisponibles } from "./etiquetas-gondola-helpers";

function producto(overrides: Partial<ProductoAdmin> = {}): ProductoAdmin {
  return {
    id: "p1",
    codigo: "7790310985113",
    nombre: "3D Queso 43gr",
    descripcion: null,
    precioVenta: "2100.00",
    precioCosto: "1500.00",
    tipoIva: "EXENTO",
    tipo: "SIMPLE",
    activo: true,
    requiereLote: false,
    categoria: { id: "c1", nombre: "Kiosco" },
    ...overrides,
  };
}

describe("armarEtiquetas", () => {
  it("repite una entrada por cada copia pedida", () => {
    const productos = [producto()];
    const seleccion = new Map([["p1", 3]]);
    const r = armarEtiquetas(productos, seleccion);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ codigo: "7790310985113", nombre: "3D Queso 43gr", precio: "2100.00" });
  });

  it("ignora ids seleccionados con cantidad 0 o que ya no están en el catálogo", () => {
    const productos = [producto()];
    const seleccion = new Map([
      ["p1", 0],
      ["fantasma", 2],
    ]);
    expect(armarEtiquetas(productos, seleccion)).toHaveLength(0);
  });

  it("selección vacía da lista vacía", () => {
    expect(armarEtiquetas([producto()], new Map())).toEqual([]);
  });
});

describe("filtrarProductos", () => {
  const productos = [
    producto({ id: "p1", nombre: "Gaseosa Cola", categoria: { id: "c1", nombre: "Bebidas" } }),
    producto({ id: "p2", nombre: "Yerba Mate", categoria: { id: "c2", nombre: "Almacén" } }),
    producto({ id: "p3", nombre: "Sin rubro", categoria: null }),
  ];

  it("sin filtros devuelve todo", () => {
    expect(filtrarProductos(productos, "", "")).toHaveLength(3);
  });

  it("filtra por texto en nombre, código o rubro", () => {
    expect(filtrarProductos(productos, "yerba", "")).toHaveLength(1);
    expect(filtrarProductos(productos, "bebidas", "")).toHaveLength(1);
  });

  it("filtra por rubro exacto", () => {
    expect(filtrarProductos(productos, "", "Almacén")).toEqual([productos[1]]);
  });

  it("un producto sin categoría no rompe el filtro de texto", () => {
    expect(filtrarProductos(productos, "sin rubro", "")).toHaveLength(1);
  });
});

describe("rubrosDisponibles", () => {
  it("devuelve los rubros distintos, ordenados, sin nulls", () => {
    const productos = [
      producto({ categoria: { id: "c1", nombre: "Verdulería" } }),
      producto({ categoria: { id: "c2", nombre: "Almacén" } }),
      producto({ categoria: null }),
    ];
    expect(rubrosDisponibles(productos)).toEqual(["Almacén", "Verdulería"]);
  });
});
