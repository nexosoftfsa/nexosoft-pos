/**
 * Fase 12: export de etiquetas de góndola a Excel, ya acomodado para imprimir
 * (reemplaza la hoja A4 con `window.print()` de la Fase 10.5). Sin código de
 * barras — pedido del cliente: solo el nombre en texto chico y el precio en
 * grande. Mismo patrón que `LibroDeVentasExcel` del backend (exceljs), pero
 * generado en el cliente con `workbook.xlsx.writeBuffer()`.
 */
import { Workbook } from "exceljs";

import { Money } from "@nexosoft/domain";

import { pesos } from "../formato";
import type { EtiquetaAImprimir } from "./etiquetas-gondola-helpers";

const COLUMNAS = 3;
const ANCHO_COLUMNA = 22;
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function formatearPrecio(valor: string): string {
  try {
    return pesos(Money.desde(valor));
  } catch {
    return valor;
  }
}

/**
 * Arma la grilla: por cada fila de {@link COLUMNAS} etiquetas, una fila de
 * planilla con el nombre (chico) y otra con el precio (grande, negrita),
 * seguidas de una fila en blanco para poder recortar entre "filas" de etiquetas.
 */
export async function generarExcelEtiquetas(
  etiquetas: readonly EtiquetaAImprimir[],
): Promise<Blob> {
  const workbook = new Workbook();
  const hoja = workbook.addWorksheet("Etiquetas");

  for (let c = 1; c <= COLUMNAS; c++) {
    hoja.getColumn(c).width = ANCHO_COLUMNA;
  }

  for (let i = 0; i < etiquetas.length; i += COLUMNAS) {
    const grupo = etiquetas.slice(i, i + COLUMNAS);

    const filaNombre = hoja.addRow(grupo.map((e) => e.nombre));
    filaNombre.height = 26;
    filaNombre.eachCell((celda) => {
      celda.font = { size: 9 };
      celda.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    });

    const filaPrecio = hoja.addRow(grupo.map((e) => formatearPrecio(e.precio)));
    filaPrecio.height = 32;
    filaPrecio.eachCell((celda) => {
      celda.font = { size: 20, bold: true };
      celda.alignment = { vertical: "middle", horizontal: "center" };
    });

    hoja.addRow([]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: MIME_XLSX });
}
