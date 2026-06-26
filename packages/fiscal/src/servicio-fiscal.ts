/**
 * Contrato del servicio fiscal (puerto). El sistema depende de esta interfaz,
 * nunca de SOAP/WSFEv1 (ADR-0008). Dos implementaciones:
 *  - `MockServicioFiscal`: simula ARCA respetando sus reglas (dev y tests).
 *  - `ArcaServicioFiscal`: WSAA + WSFEv1 reales (requiere certificado y CUIT).
 *
 * Los tipos modelan lo que ARCA necesita para autorizar (mapean a `FECAESolicitar`
 * de WSFEv1): importes, IVA por alícuota, datos del receptor y comprobantes
 * asociados (para Notas de Crédito/Débito).
 */
import type {
  CondicionIva,
  EstadoCae,
  Money,
  SubtotalPorAlicuota,
  TipoComprobante,
} from "@nexosoft/domain";

/** Tipo de documento del receptor. */
export const DocTipo = {
  CUIT: "CUIT",
  DNI: "DNI",
  ConsumidorFinal: "ConsumidorFinal",
} as const;

export type DocTipo = (typeof DocTipo)[keyof typeof DocTipo];

/** Código de tipo de documento en ARCA (80=CUIT, 96=DNI, 99=Consumidor Final). */
export function codigoDocArca(doc: DocTipo): number {
  switch (doc) {
    case DocTipo.CUIT:
      return 80;
    case DocTipo.DNI:
      return 96;
    case DocTipo.ConsumidorFinal:
      return 99;
  }
}

/** Mensaje de ARCA (error u observación), con su código numérico. */
export interface MensajeArca {
  readonly codigo: number;
  readonly mensaje: string;
}

/** Comprobante asociado (una Nota de Crédito/Débito referencia su factura). */
export interface ComprobanteAsociado {
  readonly tipo: TipoComprobante;
  readonly puntoDeVenta: number;
  readonly numero: number;
}

/** Datos que ARCA necesita para autorizar un comprobante (solicitud de CAE). */
export interface SolicitudCae {
  readonly tipoComprobante: TipoComprobante;
  readonly puntoDeVenta: number;
  readonly numero: number;
  readonly fecha: Date;
  readonly condicionIvaReceptor: CondicionIva;
  readonly docTipo: DocTipo;
  readonly docNumero: string;
  readonly netoGravado: Money;
  readonly iva: Money;
  readonly total: Money;
  readonly subtotalesPorAlicuota: readonly SubtotalPorAlicuota[];
  /** Solo en Notas de Crédito/Débito: la factura que rectifican. */
  readonly comprobantesAsociados?: readonly ComprobanteAsociado[];
}

/** Resultado de pedir CAE: autorizada (con CAE) o rechazada (con errores). */
export interface ResultadoCae {
  readonly estado: EstadoCae;
  readonly cae?: string;
  readonly vencimientoCae?: Date;
  /** Autorizada pero con observaciones de ARCA. */
  readonly observaciones?: readonly MensajeArca[];
  /** Motivos del rechazo. */
  readonly errores?: readonly MensajeArca[];
}

export interface ServicioFiscal {
  /** Solicita el CAE de un comprobante. No lanza por rechazo: lo informa en el resultado. */
  solicitarCae(solicitud: SolicitudCae): Promise<ResultadoCae>;
  /** Último número autorizado por ARCA para un punto de venta y tipo (numeración). */
  ultimoNumeroAutorizado(puntoDeVenta: number, tipo: TipoComprobante): Promise<number>;
}
