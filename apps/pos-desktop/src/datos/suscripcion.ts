import type { EjecutorSql } from "@nexosoft/app";
import { EstadoSuscripcion, Plan, planDeLicencia, type EstadoLicencia } from "@nexosoft/licencias";
import { guardarAjuste, leerAjuste } from "./ajustes-sqlite";

/**
 * Estado de la suscripción en el POS (Fase 17.B, ADR-0056).
 *
 * El POS **no verifica firmas ni habla con el Worker**: le pregunta a su
 * servidor de sucursal, que ya hizo ese trabajo. Pero sí guarda el último
 * estado conocido en SQLite, y por una razón concreta: el POS puede vender
 * sin el servidor (offline-first, ADR-0004), así que si el bloqueo viviera
 * sólo en el servidor bastaría con desenchufar la red para seguir vendiendo.
 */

const CLAVE_ESTADO = "suscripcion_estado";

/** Estado permisivo: es lo que se usa mientras no se sepa nada. */
export const SUSCRIPCION_ACTIVA: EstadoLicencia = {
  estado: EstadoSuscripcion.Activa,
  // Mientras no sepamos el plan, están todos los módulos (ADR-0067 §2).
  plan: Plan.Premium,
  puedeVender: true,
  aviso: null,
  sinValidar: false,
};

/**
 * Interpreta lo guardado en SQLite. Ante cualquier duda devuelve el estado
 * permisivo: un dato corrupto no puede dejar a un comercio sin vender.
 */
export function parsearEstadoGuardado(texto: string | null): EstadoLicencia {
  if (texto === null) return SUSCRIPCION_ACTIVA;
  try {
    const crudo = JSON.parse(texto) as Partial<EstadoLicencia>;
    const estados = Object.values(EstadoSuscripcion) as string[];
    if (typeof crudo.estado !== "string" || !estados.includes(crudo.estado)) {
      return SUSCRIPCION_ACTIVA;
    }
    return {
      estado: crudo.estado as EstadoSuscripcion,
      // El plan también se guarda: el POS gatea el menú por plan y tiene que
      // poder hacerlo sin el servidor. Un plan corrupto cae en Premium, por la
      // misma razón que un estado corrupto deja vender.
      plan: planDeLicencia(crudo.plan),
      // Sólo BLOQUEADA impide vender; cualquier otra cosa deja operar.
      puedeVender: crudo.estado !== EstadoSuscripcion.Bloqueada,
      aviso: typeof crudo.aviso === "string" ? crudo.aviso : null,
      sinValidar: crudo.sinValidar === true,
    };
  } catch {
    return SUSCRIPCION_ACTIVA;
  }
}

export async function leerSuscripcionGuardada(ejecutor: EjecutorSql): Promise<EstadoLicencia> {
  return parsearEstadoGuardado(await leerAjuste(ejecutor, CLAVE_ESTADO));
}

export async function guardarSuscripcion(
  ejecutor: EjecutorSql,
  estado: EstadoLicencia,
): Promise<void> {
  await guardarAjuste(ejecutor, CLAVE_ESTADO, JSON.stringify(estado));
}

/** Color y tono del aviso, según qué tan urgente sea. */
export type TonoAviso = "info" | "advertencia" | "bloqueo";

export function tonoDe(estado: EstadoLicencia): TonoAviso | null {
  if (!estado.puedeVender) return "bloqueo";
  switch (estado.estado) {
    case EstadoSuscripcion.Recordatorio:
      return "info";
    case EstadoSuscripcion.Advertencia:
      return "advertencia";
    default:
      return null;
  }
}
