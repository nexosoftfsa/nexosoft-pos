/**
 * Contrato de la licencia de suscripción (ADR-0056).
 *
 * Este archivo es **puro**: tipos y nada más. La firma se verifica en
 * `cloud-api` con `node:crypto`; acá no puede haber criptografía porque el
 * paquete también lo consume el POS, que corre en un navegador.
 */

/** Estado de la suscripción de un comercio. */
export enum EstadoSuscripcion {
  /** Al día. El sistema no dice nada. */
  Activa = "ACTIVA",
  /** Se acerca la fecha de pago: aviso suave. */
  Recordatorio = "RECORDATORIO",
  /** Venció el plazo: aviso fuerte, todavía se puede operar. */
  Advertencia = "ADVERTENCIA",
  /** No se puede vender. Ver `PERMITIDO_BLOQUEADA`. */
  Bloqueada = "BLOQUEADA",
}

/**
 * Lo que emite y firma el Worker de licencias. Es exactamente lo que viaja
 * dentro del token, ya verificado.
 */
export interface Licencia {
  /** Identificador que le asignamos al comercio en el alta (ej. `"lagus"`). */
  readonly comercioId: string;
  readonly estado: EstadoSuscripcion;
  /** Fecha de pago de la suscripción, ISO `YYYY-MM-DD`. Para mostrar. */
  readonly vencePagoEl: string;
  /** Vencimiento del TOKEN (no de la suscripción), ISO completo. */
  readonly validaHasta: string;
  /** Texto opcional que el panel quiera hacerle llegar al comercio. */
  readonly mensaje?: string | null;
  readonly emitidaEn: string;
}

/**
 * Lo que el comercio puede hacer estando `BLOQUEADA` (decidido en ADR-0056).
 *
 * Se bloquea **vender**, que es lo que hace efectivo el corte. Queda
 * habilitado cerrar la caja abierta y consultar o exportar lo histórico: son
 * registros fiscales del comercio, no nuestros — retenerlos nos expone y no
 * agrega presión de cobro real.
 */
export const PERMITIDO_BLOQUEADA = {
  vender: false,
  cerrarCaja: true,
  verHistorico: true,
  exportar: true,
  configurar: true,
} as const;

/** Estado efectivo que ve el resto del sistema, ya resuelto el offline. */
export interface EstadoLicencia {
  readonly estado: EstadoSuscripcion;
  /** `false` sólo cuando el estado es `BLOQUEADA`. */
  readonly puedeVender: boolean;
  /** Mensaje ya armado para mostrarle al comercio, o `null` si no hay nada que decir. */
  readonly aviso: string | null;
  /**
   * `true` cuando el token venció y no se pudo renovar. El sistema **no**
   * bloquea por esto (ADR-0056 §3), pero conviene decirlo.
   */
  readonly sinValidar: boolean;
}
