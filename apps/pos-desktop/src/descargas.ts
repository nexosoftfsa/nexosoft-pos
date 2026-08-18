/**
 * Descarga de archivos generados en el cliente. En el navegador (modo demo)
 * usa el `<a download>` de siempre; dentro de Tauri usa el diálogo nativo de
 * guardar + escritura a disco (`plugin-dialog` + `plugin-fs`) — el enfoque
 * de blob + `<a download>` dispara el permiso "Tauri solicita descargar
 * archivos" de WebView2, que si se bloquea por error queda bloqueado en
 * silencio para siempre; el diálogo nativo no depende de ese permiso.
 */
import { estaEnTauri } from "./datos/ejecutor-sql-tauri";

/** Dispara la descarga/guardado de un Blob con el nombre dado. */
export async function descargarBlob(nombre: string, blob: Blob): Promise<void> {
  if (estaEnTauri()) {
    await guardarConDialogoNativo(nombre, blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function guardarConDialogoNativo(nombre: string, blob: Blob): Promise<void> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  const punto = nombre.lastIndexOf(".");
  const extension = punto === -1 ? undefined : nombre.slice(punto + 1);
  const destino = await save({
    defaultPath: nombre,
    ...(extension !== undefined ? { filters: [{ name: extension.toUpperCase(), extensions: [extension] }] } : {}),
  });
  if (destino === null) return; // el usuario canceló el diálogo
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(destino, bytes);
}
