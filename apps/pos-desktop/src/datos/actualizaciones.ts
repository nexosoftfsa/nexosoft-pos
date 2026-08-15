/**
 * Actualización automática del POS (Tauri updater). Chequea contra el
 * `latest.json` publicado en el repo público de releases, descarga e
 * instala la nueva versión, y reinicia la app. Solo funciona dentro de
 * Tauri (no en el navegador de desarrollo).
 */
import { estaEnTauri } from "./ejecutor-sql-tauri";

export interface InfoActualizacion {
  readonly versionDisponible: string;
  readonly notas: string | null;
  readonly fecha: string | null;
}

export interface ProgresoDescarga {
  readonly bytesDescargados: number;
  readonly bytesTotales: number | null;
}

/** Devuelve info de la actualización disponible, o null si ya está al día. */
export async function buscarActualizacion(): Promise<InfoActualizacion | null> {
  if (!estaEnTauri()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const actualizacion = await check();
  if (!actualizacion) return null;
  return {
    versionDisponible: actualizacion.version,
    notas: actualizacion.body ?? null,
    fecha: actualizacion.date ?? null,
  };
}

/** Descarga e instala la actualización encontrada, y reinicia la app. */
export async function instalarActualizacionYReiniciar(
  onProgreso?: (p: ProgresoDescarga) => void,
): Promise<void> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  const actualizacion = await check();
  if (!actualizacion) throw new Error("No hay ninguna actualización pendiente.");

  let descargados = 0;
  let total: number | null = null;
  await actualizacion.downloadAndInstall((evento) => {
    if (evento.event === "Started") {
      total = evento.data.contentLength ?? null;
    } else if (evento.event === "Progress") {
      descargados += evento.data.chunkLength;
    }
    onProgreso?.({ bytesDescargados: descargados, bytesTotales: total });
  });

  await relaunch();
}
