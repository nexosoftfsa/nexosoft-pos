import { esFalloDeRed } from "./errores-red";

/**
 * Lo que devuelve `GET /health` del servidor de sucursal. Es público (sin
 * token): se usa para saber si el servidor responde y qué versión tiene
 * instalada.
 */
export interface SaludServidor {
  readonly status: string;
  readonly db: string;
  /** Versión del servidor. `"dev"` cuando corre desde el repo, sin publicar. */
  readonly version: string;
}

/** Estado de la consulta, para mostrarlo en Configuración sin romper nada. */
export type EstadoSalud =
  | { readonly tipo: "ok"; readonly salud: SaludServidor }
  | { readonly tipo: "sin-conexion" }
  | { readonly tipo: "error"; readonly mensaje: string };

/**
 * Consulta la salud del servidor de sucursal (Fase 17.D).
 *
 * Nunca lanza: la pantalla de Configuración tiene que poder abrirse aunque el
 * servidor esté caído o mal configurado — de hecho, es justo cuando más
 * falta hace poder entrar ahí.
 */
export async function consultarSalud(baseUrl: string): Promise<EstadoSalud> {
  try {
    const res = await fetch(`${baseUrl}/health`);
    if (!res.ok) return { tipo: "error", mensaje: `El servidor respondió ${res.status}.` };
    const salud = (await res.json()) as SaludServidor;
    return { tipo: "ok", salud };
  } catch (e) {
    if (esFalloDeRed(e)) return { tipo: "sin-conexion" };
    return { tipo: "error", mensaje: e instanceof Error ? e.message : String(e) };
  }
}
