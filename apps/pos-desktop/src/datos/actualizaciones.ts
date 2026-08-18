/**
 * Actualización automática del POS (Tauri updater). Chequea y descarga en
 * silencio contra el `latest.json` publicado en el repo público de
 * releases, sin preguntar nada; cuando está lista, cualquier pantalla puede
 * mostrar "Reiniciar para actualizar" (ver `EstadoActualizacion.fase ===
 * "lista"`). Instalar solo pasa cuando el usuario toca ese botón — nunca
 * solo. "Buscar actualizaciones" (Configuración) dispara el mismo chequeo
 * a mano, por si el automático no encontró nada o falló.
 * Solo funciona dentro de Tauri (no en el navegador de desarrollo).
 */
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

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

export type EstadoActualizacion =
  | { readonly fase: "inactivo" }
  | { readonly fase: "buscando" }
  | { readonly fase: "descargando"; readonly progreso: ProgresoDescarga }
  | { readonly fase: "lista"; readonly info: InfoActualizacion }
  | { readonly fase: "error"; readonly mensaje: string };

// Estado compartido fuera de React (useSyncExternalStore) para que el
// chequeo automático al iniciar y el botón manual de Configuración
// coordinen sobre el mismo resultado, sin duplicar la descarga.
let estado: EstadoActualizacion = { fase: "inactivo" };
// Recurso del plugin con la actualización ya descargada, listo para
// `.install()`. No es serializable — vive solo en memoria de este módulo.
let actualizacionDescargada: Update | null = null;
const listeners = new Set<() => void>();

function fijarEstado(nuevo: EstadoActualizacion): void {
  estado = nuevo;
  listeners.forEach((cb) => cb());
}

export function suscribirseActualizacion(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function leerEstadoActualizacion(): EstadoActualizacion {
  return estado;
}

/**
 * Busca una actualización y, si hay, la descarga — todo en silencio (sin
 * diálogos ni confirmaciones). Si ya hay una búsqueda en curso, no arranca
 * otra. Los errores quedan en el estado (`fase: "error"`) para que
 * Configuración los pueda mostrar si el usuario entra a mirar, pero no
 * interrumpen al usuario con un cartel.
 */
export async function chequearYDescargarEnSilencio(): Promise<void> {
  if (!estaEnTauri()) return;
  if (estado.fase === "buscando" || estado.fase === "descargando") return;
  fijarEstado({ fase: "buscando" });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const actualizacion = await check();
    if (actualizacion === null) {
      fijarEstado({ fase: "inactivo" });
      return;
    }
    let descargados = 0;
    let total: number | null = null;
    fijarEstado({ fase: "descargando", progreso: { bytesDescargados: 0, bytesTotales: null } });
    await actualizacion.download((evento: DownloadEvent) => {
      if (evento.event === "Started") total = evento.data.contentLength ?? null;
      else if (evento.event === "Progress") descargados += evento.data.chunkLength;
      fijarEstado({ fase: "descargando", progreso: { bytesDescargados: descargados, bytesTotales: total } });
    });
    actualizacionDescargada = actualizacion;
    fijarEstado({
      fase: "lista",
      info: {
        versionDisponible: actualizacion.version,
        notas: actualizacion.body ?? null,
        fecha: actualizacion.date ?? null,
      },
    });
  } catch (e) {
    fijarEstado({ fase: "error", mensaje: e instanceof Error ? e.message : String(e) });
  }
}

/** Instala la actualización ya descargada y reinicia. No hace nada si no hay ninguna lista. */
export async function instalarYReiniciar(): Promise<void> {
  if (actualizacionDescargada === null) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await actualizacionDescargada.install();
  await relaunch();
}
