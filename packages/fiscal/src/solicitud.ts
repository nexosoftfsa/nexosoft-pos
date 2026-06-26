/**
 * Construcción de una `SolicitudCae` a partir del cálculo del dominio
 * (`ResultadoComprobante`) más los datos fiscales del comprobante y del receptor.
 * Centraliza el mapeo dominio → fiscal para que el llamador no arme la solicitud a mano.
 */
import type { CondicionIva, ResultadoComprobante } from "@nexosoft/domain";

import type { ComprobanteAsociado, DocTipo, SolicitudCae } from "./servicio-fiscal.js";

export interface DatosComprobanteFiscal {
  readonly puntoDeVenta: number;
  readonly numero: number;
  readonly fecha: Date;
  readonly comprobantesAsociados?: readonly ComprobanteAsociado[];
}

export interface DatosReceptorFiscal {
  readonly condicionIva: CondicionIva;
  readonly docTipo: DocTipo;
  readonly docNumero: string;
}

export function construirSolicitudCae(
  resultado: ResultadoComprobante,
  comprobante: DatosComprobanteFiscal,
  receptor: DatosReceptorFiscal,
): SolicitudCae {
  return {
    tipoComprobante: resultado.tipo,
    puntoDeVenta: comprobante.puntoDeVenta,
    numero: comprobante.numero,
    fecha: comprobante.fecha,
    condicionIvaReceptor: receptor.condicionIva,
    docTipo: receptor.docTipo,
    docNumero: receptor.docNumero,
    netoGravado: resultado.netoGravado,
    iva: resultado.iva,
    total: resultado.total,
    subtotalesPorAlicuota: resultado.subtotalesPorAlicuota,
    ...(comprobante.comprobantesAsociados !== undefined
      ? { comprobantesAsociados: comprobante.comprobantesAsociados }
      : {}),
  };
}
