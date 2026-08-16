/** Descarga de archivos generados en el cliente (mismo patrón que apps/admin-web/src/csv.ts). */

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
