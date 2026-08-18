import { describe, expect, it } from "vitest";
import { Workbook } from "exceljs";

import { exportarExcel } from "./exportar-excel";

async function abrir(blob: Blob, nombreHoja: string) {
  const wb = new Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  const hoja = wb.getWorksheet(nombreHoja);
  if (!hoja) throw new Error(`hoja ${nombreHoja} no encontrada`);
  return hoja;
}

describe("exportarExcel", () => {
  it("la primera fila es el encabezado con los títulos de columna", async () => {
    const blob = await exportarExcel([
      { nombre: "Proveedores", columnas: [{ titulo: "Proveedor" }, { titulo: "CUIT" }], filas: [["Distribuidora SA", "30-12345678-9"]] },
    ]);
    const hoja = await abrir(blob, "Proveedores");

    expect(hoja.getRow(1).getCell(1).value).toBe("Proveedor");
    expect(hoja.getRow(1).getCell(2).value).toBe("CUIT");
  });

  it("el encabezado está en negrita", async () => {
    const blob = await exportarExcel([{ nombre: "Proveedores", columnas: [{ titulo: "Proveedor" }], filas: [] }]);
    const hoja = await abrir(blob, "Proveedores");
    expect(hoja.getRow(1).getCell(1).font?.bold).toBe(true);
  });

  it("cada fila de datos se vuelca tal cual, en orden", async () => {
    const blob = await exportarExcel([
      {
        nombre: "Stock",
        columnas: [{ titulo: "Código" }, { titulo: "Saldo" }],
        filas: [
          ["001", 12],
          ["002", 0],
        ],
      },
    ]);
    const hoja = await abrir(blob, "Stock");

    expect(hoja.getRow(2).getCell(1).value).toBe("001");
    expect(hoja.getRow(2).getCell(2).value).toBe(12);
    expect(hoja.getRow(3).getCell(1).value).toBe("002");
    expect(hoja.getRow(3).getCell(2).value).toBe(0);
  });

  it("sin filas, la hoja sólo tiene el encabezado", async () => {
    const blob = await exportarExcel([{ nombre: "Vacío", columnas: [{ titulo: "A" }], filas: [] }]);
    const hoja = await abrir(blob, "Vacío");
    expect(hoja.rowCount).toBe(1);
  });

  it("una columna con fecha guarda un valor Date real, no texto, con el numFmt pedido", async () => {
    const fecha = new Date("2026-08-15T12:00:00.000Z");
    const blob = await exportarExcel([
      {
        nombre: "Detalle",
        columnas: [{ titulo: "FECHA", formato: "dd/mm/yyyy" }],
        filas: [[fecha]],
      },
    ]);
    const hoja = await abrir(blob, "Detalle");

    const celda = hoja.getRow(2).getCell(1);
    expect(celda.value).toBeInstanceOf(Date);
    expect((celda.value as Date).toISOString()).toBe(fecha.toISOString());
    expect(hoja.getColumn(1).numFmt).toBe("dd/mm/yyyy");
  });

  it("varias hojas quedan en el mismo archivo, cada una independiente", async () => {
    const blob = await exportarExcel([
      { nombre: "Resumen", columnas: [{ titulo: "Métrica" }, { titulo: "Valor" }], filas: [["Total vendido", 1000]] },
      { nombre: "Top productos", columnas: [{ titulo: "Producto" }], filas: [["3D Queso"], ["7UP"]] },
    ]);
    const resumen = await abrir(blob, "Resumen");
    const top = await abrir(blob, "Top productos");

    expect(resumen.getRow(2).getCell(1).value).toBe("Total vendido");
    expect(top.rowCount).toBe(3); // encabezado + 2 filas
  });
});
