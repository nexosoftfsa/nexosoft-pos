/** Exportación a CSV y descarga de archivos en el navegador. */

/** Escapa una celda CSV (comillas, comas y saltos de línea). */
function escaparCelda(celda: string): string {
  return /[",\n\r]/.test(celda) ? `"${celda.replace(/"/g, '""')}"` : celda;
}

/** Convierte una matriz de strings en texto CSV (separador coma, CRLF). */
export function aCsv(filas: string[][]): string {
  return filas.map((fila) => fila.map(escaparCelda).join(",")).join("\r\n");
}

/** Dispara la descarga de un Blob con el nombre dado. */
export function descargarBlob(nombre: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Genera y descarga un CSV. Antepone BOM para que Excel respete los acentos. */
export function descargarCsv(nombre: string, filas: string[][]): void {
  const blob = new Blob(["﻿" + aCsv(filas)], {
    type: "text/csv;charset=utf-8",
  });
  descargarBlob(nombre, blob);
}
