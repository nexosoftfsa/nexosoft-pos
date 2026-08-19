import { describe, it, expect } from "vitest";
import { Workbook } from "exceljs";
import { leerFilasExcel } from "./importar-excel";

async function armarXlsx(encabezados: string[], filas: (string | number)[][]): Promise<Uint8Array> {
  const wb = new Workbook();
  const hoja = wb.addWorksheet("Hoja1");
  hoja.addRow(encabezados);
  for (const fila of filas) hoja.addRow(fila);
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

describe("leerFilasExcel", () => {
  it("lee encabezados y filas como objetos clave/valor", async () => {
    const bytes = await armarXlsx(
      ["Nombre", "Email"],
      [
        ["Ana", "ana@x.com"],
        ["Beto", "beto@x.com"],
      ],
    );
    const r = await leerFilasExcel("test.xlsx", bytes);
    expect(r.encabezados).toEqual(["Nombre", "Email"]);
    expect(r.filas).toEqual([
      { Nombre: "Ana", Email: "ana@x.com" },
      { Nombre: "Beto", Email: "beto@x.com" },
    ]);
  });

  it("convierte valores numéricos a texto", async () => {
    const bytes = await armarXlsx(["Precio"], [[1500]]);
    const r = await leerFilasExcel("test.xlsx", bytes);
    expect(r.filas).toEqual([{ Precio: "1500" }]);
  });

  it("salta filas completamente vacías", async () => {
    const bytes = await armarXlsx(["Nombre"], [["Ana"], ["", ], ["Beto"]]);
    const r = await leerFilasExcel("test.xlsx", bytes);
    expect(r.filas).toHaveLength(2);
  });

  it("celdas vacías se representan como string vacío, no undefined", async () => {
    const bytes = await armarXlsx(["Nombre", "Email"], [["Ana", ""]]);
    const r = await leerFilasExcel("test.xlsx", bytes);
    expect(r.filas[0]).toEqual({ Nombre: "Ana", Email: "" });
  });

  it("rechaza un archivo sin fila de encabezados", async () => {
    const wb = new Workbook();
    wb.addWorksheet("Vacía");
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    await expect(leerFilasExcel("vacio.xlsx", bytes)).rejects.toThrow("no tiene fila de encabezados");
  });
});
