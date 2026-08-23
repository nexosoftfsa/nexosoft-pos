import { describe, it, expect } from "vitest";

import {
  mensajeColumnasFaltantes,
  normalizarEncabezado,
  normalizarFilas,
  revisarColumnas,
} from "./columnas-importacion";

/** Las que espera el importador de artículos. */
const ESPERADAS = [
  "Código de barras",
  "Descripción",
  "Rubro",
  "Precio Costo",
  "% IVA",
  "Precio Venta",
  "Stock",
  "Activo",
];
const REQUERIDAS = ["Código de barras"];

describe("normalizarEncabezado", () => {
  it("ignora acentos, mayúsculas y espacios de más", () => {
    expect(normalizarEncabezado("  CÓDIGO   DE BARRAS ")).toBe("codigo de barras");
    expect(normalizarEncabezado("Código de barras")).toBe("codigo de barras");
  });
});

describe("revisarColumnas", () => {
  it("acepta el archivo cuando están todas", () => {
    const r = revisarColumnas(ESPERADAS, ESPERADAS, REQUERIDAS);
    expect(r.faltantes).toEqual([]);
  });

  it("acepta un archivo con otra capitalización o sin acentos", () => {
    const delComercio = ["CODIGO DE BARRAS", "descripcion", "RUBRO", "% iva"];

    const r = revisarColumnas(delComercio, ESPERADAS, REQUERIDAS);

    expect(r.faltantes).toEqual([]);
    expect(r.equivalencias.get("Código de barras")).toBe("CODIGO DE BARRAS");
  });

  /** El caso real que motivó todo esto: un archivo que no era el export de artículos. */
  it("detecta que falta la columna clave, en vez de dejar que falle fila por fila", () => {
    const otroArchivo = ["Producto", "Cantidad", "Deposito"];

    const r = revisarColumnas(otroArchivo, ESPERADAS, REQUERIDAS);

    expect(r.faltantes).toEqual(["Código de barras"]);
  });

  it("sólo se queja de las requeridas: las opcionales pueden faltar", () => {
    const minimo = ["Código de barras", "Descripción"];

    const r = revisarColumnas(minimo, ESPERADAS, REQUERIDAS);

    expect(r.faltantes).toEqual([]);
  });
});

describe("normalizarFilas", () => {
  it("renombra los encabezados al nombre exacto que espera el importador", () => {
    const { equivalencias } = revisarColumnas(
      ["CODIGO DE BARRAS", "descripcion"],
      ESPERADAS,
      REQUERIDAS,
    );

    const filas = normalizarFilas(
      [{ "CODIGO DE BARRAS": "779123", descripcion: "Yerba 1kg" }],
      equivalencias,
    );

    expect(filas[0]?.["Código de barras"]).toBe("779123");
    expect(filas[0]?.["Descripción"]).toBe("Yerba 1kg");
  });

  it("no toca las filas cuando los encabezados ya son los correctos", () => {
    const { equivalencias } = revisarColumnas(ESPERADAS, ESPERADAS, REQUERIDAS);
    const original = { "Código de barras": "779123", Descripción: "Yerba" };

    expect(normalizarFilas([original], equivalencias)[0]).toEqual(original);
  });
});

describe("mensajeColumnasFaltantes", () => {
  const mensaje = mensajeColumnasFaltantes(
    "Productos_Supermercado.xlsx",
    ["Código de barras"],
    ["Producto", "Cantidad", "Deposito"],
  );

  it("dice qué columna falta", () => {
    expect(mensaje).toContain("Código de barras");
  });

  it("dice qué columnas SÍ tiene el archivo, que es lo que faltaba para entender", () => {
    expect(mensaje).toContain("Producto, Cantidad, Deposito");
  });

  it("apunta a la confusión más probable: Stock vs Artículos", () => {
    expect(mensaje).toContain("Stock");
    expect(mensaje).toContain("Exportar artículos");
  });

  it("nombra el archivo, por si eligió otro sin darse cuenta", () => {
    expect(mensaje).toContain("Productos_Supermercado.xlsx");
  });
});
