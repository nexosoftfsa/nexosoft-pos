/**
 * Export genérico de un listado a Excel (Fase 12.F): copia de respaldo de
 * datos maestros (proveedores, clientes, artículos, etc.) por si hay que
 * reinstalar Windows o el POS. Mismo patrón que `componentes/etiquetas-excel.ts`
 * (exceljs, `workbook.xlsx.writeBuffer()` → `Blob`), generalizado a
 * encabezado + filas en vez del layout especial de etiquetas.
 *
 * Acepta una o varias hojas en el mismo archivo (ej. el resumen de reportes,
 * que junta KPIs + evolución diaria + medios de pago + top productos en un
 * solo `.xlsx` con varias pestañas).
 */
import { Workbook } from "exceljs";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ANCHO_COLUMNA_DEFECTO = 18;

export interface ColumnaExport {
  readonly titulo: string;
  readonly ancho?: number;
}

export interface HojaExport {
  readonly nombre: string;
  readonly columnas: readonly ColumnaExport[];
  readonly filas: readonly (string | number)[][];
}

/** Arma un `.xlsx` con una hoja por entrada, cada una con encabezado en negrita y una fila por registro. */
export async function exportarExcel(hojas: readonly HojaExport[]): Promise<Blob> {
  const workbook = new Workbook();

  for (const { nombre, columnas, filas } of hojas) {
    const hoja = workbook.addWorksheet(nombre);

    columnas.forEach((c, i) => {
      hoja.getColumn(i + 1).width = c.ancho ?? ANCHO_COLUMNA_DEFECTO;
    });

    const filaEncabezado = hoja.addRow(columnas.map((c) => c.titulo));
    filaEncabezado.eachCell((celda) => {
      celda.font = { bold: true };
    });

    for (const fila of filas) {
      hoja.addRow(fila);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: MIME_XLSX });
}
