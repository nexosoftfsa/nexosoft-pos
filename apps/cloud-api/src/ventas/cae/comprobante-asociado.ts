import { codigoComprobanteArcaOpcional } from '@nexosoft/domain';

import type { ComprobanteAsociadoSolicitud } from './servicio-cae';

/** Lo mínimo que hace falta del comprobante original para poder referenciarlo. */
export interface ComprobanteOriginal {
  readonly tipoComprobante: string | null;
  readonly numeroComprobante: number | null;
}

/**
 * `CbtesAsoc` de la Nota de Crédito que anula a `original`.
 *
 * ARCA exige que una NC diga qué comprobante corrige. Devuelve una lista vacía
 * —y no un error— cuando no hay nada que referenciar:
 *
 *  - el original era un ticket no fiscal (no existe en ARCA), o
 *  - no tiene número todavía.
 *
 * La lista vacía la corta después `ClienteWsfev1`, que sabe si el tipo que se
 * está emitiendo exige asociado. Acá no se decide eso: acá sólo se traduce.
 *
 * **No se manda `CbteFch` del asociado** aunque ARCA lo acepte: es opcional, y
 * si no coincide al día con lo que ARCA tiene registrado es un rechazo. El
 * tipo, el punto de venta y el número alcanzan para identificarlo.
 */
export function comprobanteAsociadoDe(
  original: ComprobanteOriginal,
): ComprobanteAsociadoSolicitud[] {
  const { tipoComprobante, numeroComprobante } = original;
  if (tipoComprobante === null || numeroComprobante === null) return [];

  const codigoComprobante = codigoComprobanteArcaOpcional(tipoComprobante);
  if (codigoComprobante === null) return [];

  return [{ codigoComprobante, numero: numeroComprobante }];
}
