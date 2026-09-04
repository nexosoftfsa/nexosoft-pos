import { EstadoSuscripcion, type EstadoLicencia, type Licencia } from "./licencia";
import { Plan, planDeLicencia } from "./plan";

/**
 * Resuelve el estado efectivo de la suscripción a partir de la última
 * licencia conocida (ADR-0056 §2 y §3).
 *
 * **La regla que manda: un corte de internet nunca bloquea a nadie.** Si el
 * token venció sin poder renovarse, el sistema NO escala a bloqueo — se queda
 * como mucho en advertencia. La alternativa (bloquear por falta de contacto)
 * convertiría una caída de nuestro Worker, un DNS vencido o el ISP del
 * comercio en cajas paradas en todos los comercios a la vez.
 *
 * Sólo un token firmado que diga `BLOQUEADA` bloquea.
 */
export function evaluarLicencia(
  licencia: Licencia | null,
  ahora: Date = new Date(),
): EstadoLicencia {
  // Todavía no se pudo obtener ninguna licencia (instalación recién hecha,
  // sin internet aún). Se deja operar: el comercio ya pagó por el sistema.
  if (licencia === null) {
    return {
      estado: EstadoSuscripcion.Activa,
      // Sin licencia todavía no sabemos el plan; se deja todo habilitado.
      plan: Plan.Premium,
      puedeVender: true,
      aviso: null,
      sinValidar: true,
    };
  }

  const vencido = new Date(licencia.validaHasta).getTime() < ahora.getTime();
  const plan = planDeLicencia(licencia.plan);

  if (licencia.estado === EstadoSuscripcion.Bloqueada) {
    return {
      estado: EstadoSuscripcion.Bloqueada,
      plan,
      puedeVender: false,
      aviso:
        licencia.mensaje ??
        "El sistema está bloqueado por falta de pago. Comunicate con NexoSoft para reactivarlo.",
      sinValidar: vencido,
    };
  }

  if (vencido) {
    // Token viejo y no renovable: se avisa, no se bloquea.
    return {
      estado: EstadoSuscripcion.Advertencia,
      plan,
      puedeVender: true,
      aviso: `No se pudo validar la suscripción desde el ${soloFecha(licencia.validaHasta)}. Revisá la conexión a internet o comunicate con NexoSoft.`,
      sinValidar: true,
    };
  }

  switch (licencia.estado) {
    case EstadoSuscripcion.Activa:
      return {
        estado: EstadoSuscripcion.Activa,
        plan,
        puedeVender: true,
        aviso: null,
        sinValidar: false,
      };
    case EstadoSuscripcion.Recordatorio:
      return {
        estado: EstadoSuscripcion.Recordatorio,
        plan,
        puedeVender: true,
        aviso: licencia.mensaje ?? `Tu próximo pago vence el ${formatear(licencia.vencePagoEl)}.`,
        sinValidar: false,
      };
    case EstadoSuscripcion.Advertencia:
      return {
        estado: EstadoSuscripcion.Advertencia,
        plan,
        puedeVender: true,
        aviso:
          licencia.mensaje ??
          `El pago venció el ${formatear(licencia.vencePagoEl)}. Si no se regulariza, el sistema se va a bloquear en los próximos días.`,
        sinValidar: false,
      };
  }
}

/** `2026-08-29T00:00:00Z` → `29/08/2026`. */
function soloFecha(iso: string): string {
  return formatear(iso.slice(0, 10));
}

/** `2026-09-10` → `10/09/2026`. Sin `Date`, para no depender de la zona horaria. */
function formatear(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.slice(0, 10).split("-");
  if (anio === undefined || mes === undefined || dia === undefined) return fechaIso;
  return `${dia}/${mes}/${anio}`;
}
