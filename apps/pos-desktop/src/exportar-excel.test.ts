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
    const blob = await exportarExcel("Proveedores", [{ titulo: "Proveedor" }, { titulo: "CUIT" }], [
      ["Distribuidora SA", "30-12345678-9"],
    ]);
    const hoja = await abrir(blob, "Proveedores");

    expect(hoja.getRow(1).getCell(1).value).toBe("Proveedor");
    expect(hoja.getRow(1).getCell(2).value).toBe("CUIT");
  });

  it("el encabezado está en negrita", async () => {
    const blob = await exportarExcel("Proveedores", [{ titulo: "Proveedor" }], []);
    const hoja = await abrir(blob, "Proveedores");
    expect(hoja.getRow(1).getCell(1).font?.bold).toBe(true);
  });

  it("cada fila de datos se vuelca tal cual, en orden", async () => {
    const blob = await exportarExcel(
      "Stock",
      [{ titulo: "Código" }, { titulo: "Saldo" }],
      [
        ["001", 12],
        ["002", 0],
      ],
    );
    const hoja = await abrir(blob, "Stock");

    expect(hoja.getRow(2).getCell(1).value).toBe("001");
    expect(hoja.getRow(2).getCell(2).value).toBe(12);
    expect(hoja.getRow(3).getCell(1).value).toBe("002");
    expect(hoja.getRow(3).getCell(2).value).toBe(0);
  });

  it("sin filas, la hoja sólo tiene el encabezado", async () => {
    const blob = await exportarExcel("Vacío", [{ titulo: "A" }], []);
    const hoja = await abrir(blob, "Vacío");
    expect(hoja.rowCount).toBe(1);
  });
});
