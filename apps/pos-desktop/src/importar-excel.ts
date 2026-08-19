/**
 * Import genérico desde Excel (Fase 14.A): contraparte de lectura de
 * `exportar-excel.ts`. Lee la primera hoja de un `.xlsx`, la primera fila
 * como encabezados, y devuelve el resto como filas "crudas" (clave =
 * encabezado, valor = texto de la celda) — sin ninguna validación de
 * negocio: eso lo hace el backend (mismo criterio en los 5 módulos que
 * importan, Fase 14).
 */
import { Workbook } from "exceljs";
import { estaEnTauri } from "./datos/ejecutor-sql-tauri";

export interface ArchivoLeido {
  readonly nombreArchivo: string;
  readonly encabezados: readonly string[];
  readonly filas: readonly Record<string, string>[];
}

/** Abre el selector de archivos (nativo en Tauri, `<input type="file">` en el navegador/demo) y devuelve los bytes elegidos, o `null` si se canceló. */
export async function elegirArchivoExcel(): Promise<{ nombreArchivo: string; bytes: Uint8Array } | null> {
  if (estaEnTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const ruta = await open({
      multiple: false,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (ruta === null) return null;
    const bytes = await readFile(ruta);
    const nombreArchivo = ruta.split(/[/\\]/).pop() ?? ruta;
    return { nombreArchivo, bytes };
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx";
    input.onchange = () => {
      const archivo = input.files?.[0];
      if (!archivo) {
        resolve(null);
        return;
      }
      void archivo.arrayBuffer().then((buffer) => {
        resolve({ nombreArchivo: archivo.name, bytes: new Uint8Array(buffer) });
      });
    };
    input.click();
  });
}

/** Parsea los bytes de un `.xlsx` ya leído: primera hoja, primera fila = encabezados. */
export async function leerFilasExcel(nombreArchivo: string, bytes: Uint8Array): Promise<ArchivoLeido> {
  const workbook = new Workbook();
  // Los tipos de exceljs piden `Buffer` (Node); en el navegador/Tauri no hay
  // Buffer, pero exceljs acepta cualquier ArrayBufferView en tiempo de
  // ejecución. `as never` porque el propio tipo `Buffer` importado por
  // exceljs no coincide estructuralmente con ningún cast intermedio.
  await workbook.xlsx.load(bytes as never);
  const hoja = workbook.worksheets[0];
  if (!hoja) throw new Error(`"${nombreArchivo}" no tiene ninguna hoja.`);

  const encabezados: string[] = [];
  hoja.getRow(1).eachCell((celda, columna) => {
    encabezados[columna - 1] = String(celda.value ?? "").trim();
  });
  if (encabezados.length === 0) {
    throw new Error(`"${nombreArchivo}" no tiene fila de encabezados.`);
  }

  const filas: Record<string, string>[] = [];
  hoja.eachRow((row, numero) => {
    if (numero === 1) return;
    const fila: Record<string, string> = {};
    encabezados.forEach((encabezado, i) => {
      if (encabezado === "") return;
      const valor = row.getCell(i + 1).value;
      fila[encabezado] = valor === null || valor === undefined ? "" : String(valor).trim();
    });
    // Salta filas completamente vacías (frecuentes al final de un Excel).
    if (Object.values(fila).some((v) => v !== "")) filas.push(fila);
  });

  return { nombreArchivo, encabezados, filas };
}

/** Combina elegir el archivo y parsearlo. Devuelve `null` si el usuario canceló el selector. */
export async function elegirYLeerExcel(): Promise<ArchivoLeido | null> {
  const elegido = await elegirArchivoExcel();
  if (elegido === null) return null;
  return leerFilasExcel(elegido.nombreArchivo, elegido.bytes);
}
