import { describe, expect, it } from "vitest";

import { ordenarFilas } from "./usar-orden-tabla";

interface Fila {
  codigo: string;
  saldo: number;
  estado: string;
}

const filas: Fila[] = [
  { codigo: "B", saldo: 10, estado: "OK" },
  { codigo: "A", saldo: 30, estado: "Sin stock" },
  { codigo: "C", saldo: 5, estado: "Bajo mínimo" },
];

const RANGO_ESTADO: Record<string, number> = { "Sin stock": 0, "Bajo mínimo": 1, OK: 2 };

const columnas = {
  codigo: (f: Fila) => f.codigo,
  saldo: (f: Fila) => f.saldo,
  estado: (f: Fila) => RANGO_ESTADO[f.estado] ?? 0,
};

describe("ordenarFilas", () => {
  it("sin clave, devuelve las filas en el orden original", () => {
    expect(ordenarFilas(filas, columnas, null, "asc")).toEqual(filas);
  });

  it("ordena texto alfabéticamente ascendente", () => {
    const r = ordenarFilas(filas, columnas, "codigo", "asc");
    expect(r.map((f) => f.codigo)).toEqual(["A", "B", "C"]);
  });

  it("ordena texto alfabéticamente descendente", () => {
    const r = ordenarFilas(filas, columnas, "codigo", "desc");
    expect(r.map((f) => f.codigo)).toEqual(["C", "B", "A"]);
  });

  it("ordena números correctamente (no alfabéticamente)", () => {
    const r = ordenarFilas(filas, columnas, "saldo", "asc");
    expect(r.map((f) => f.saldo)).toEqual([5, 10, 30]);
  });

  it("una columna con función de severidad ordena por esa severidad, no alfabéticamente", () => {
    const r = ordenarFilas(filas, columnas, "estado", "asc");
    // "Sin stock"(0) < "Bajo mínimo"(1) < "OK"(2) — alfabético daría "Bajo mínimo","OK","Sin stock"
    expect(r.map((f) => f.estado)).toEqual(["Sin stock", "Bajo mínimo", "OK"]);
  });

  it("no muta el array original", () => {
    const original = [...filas];
    ordenarFilas(filas, columnas, "codigo", "asc");
    expect(filas).toEqual(original);
  });

  it("clave desconocida devuelve las filas sin cambios", () => {
    expect(ordenarFilas(filas, columnas, "inexistente", "asc")).toEqual(filas);
  });
});
