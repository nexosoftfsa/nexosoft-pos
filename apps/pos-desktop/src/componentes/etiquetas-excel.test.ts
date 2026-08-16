import { describe, expect, it } from "vitest";
import { Workbook } from "exceljs";

import { generarExcelEtiquetas } from "./etiquetas-excel";
import type { EtiquetaAImprimir } from "./etiquetas-gondola-helpers";

async function abrir(blob: Blob) {
  const wb = new Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  const hoja = wb.getWorksheet("Etiquetas");
  if (!hoja) throw new Error("hoja Etiquetas no encontrada");
  return hoja;
}

function etiqueta(overrides: Partial<EtiquetaAImprimir> = {}): EtiquetaAImprimir {
  return { codigo: "7790310985113", nombre: "3D Queso 43gr", precio: "2100.00", ...overrides };
}

describe("generarExcelEtiquetas", () => {
  it("genera una fila de nombre y una de precio por cada grupo de 3 etiquetas", async () => {
    const blob = await generarExcelEtiquetas([etiqueta()]);
    const hoja = await abrir(blob);

    // fila 1 = nombres, fila 2 = precios
    expect(hoja.getRow(1).getCell(1).value).toBe("3D Queso 43gr");
    expect(hoja.getRow(2).getCell(1).value).toBe("$ 2.100,00");
  });

  it("agrupa de a 3 etiquetas por fila de planilla", async () => {
    const etiquetas = [
      etiqueta({ nombre: "A" }),
      etiqueta({ nombre: "B" }),
      etiqueta({ nombre: "C" }),
      etiqueta({ nombre: "D" }),
    ];
    const blob = await generarExcelEtiquetas(etiquetas);
    const hoja = await abrir(blob);

    expect(hoja.getRow(1).getCell(1).value).toBe("A");
    expect(hoja.getRow(1).getCell(2).value).toBe("B");
    expect(hoja.getRow(1).getCell(3).value).toBe("C");
    // el 4to producto arranca un nuevo grupo (nueva fila de nombres)
    expect(hoja.getRow(4).getCell(1).value).toBe("D");
  });

  it("no incluye ningún dato de código de barras en la planilla", async () => {
    const blob = await generarExcelEtiquetas([etiqueta({ codigo: "7790310985113" })]);
    const hoja = await abrir(blob);

    const valores: unknown[] = [];
    hoja.eachRow((row) => row.eachCell((celda) => valores.push(celda.value)));
    expect(valores).not.toContain("7790310985113");
  });

  it("el precio se muestra en fuente grande y negrita, el nombre en chica", async () => {
    const blob = await generarExcelEtiquetas([etiqueta()]);
    const hoja = await abrir(blob);

    const celdaNombre = hoja.getRow(1).getCell(1);
    const celdaPrecio = hoja.getRow(2).getCell(1);
    expect(celdaPrecio.font?.size).toBeGreaterThan(celdaNombre.font?.size ?? 0);
    expect(celdaPrecio.font?.bold).toBe(true);
  });

  it("sin etiquetas, genera una hoja vacía", async () => {
    const blob = await generarExcelEtiquetas([]);
    const hoja = await abrir(blob);
    expect(hoja.rowCount).toBe(0);
  });
});
