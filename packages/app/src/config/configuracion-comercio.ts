/**
 * Configuración del comercio (emisor) que necesita la capa de aplicación para
 * armar ventas: condición fiscal, punto de venta, depósito y lista por defecto,
 * y políticas (precios IVA incluido, stock negativo). Ver ADR-0012 y ADR-0015.
 */
import type { CondicionIva } from "@nexosoft/domain";

export interface ConfiguracionComercio {
  readonly cuit: string;
  readonly razonSocial: string;
  readonly condicionIvaEmisor: CondicionIva;
  readonly puntoDeVenta: number;
  readonly depositoPorDefectoId: string;
  readonly listaPredeterminadaId: string;
  /** Si los precios de lista incluyen IVA (góndola minorista). Por defecto, sí. */
  readonly preciosIncluyenIva: boolean;
  /** Si se permite vender sin stock (sobreventa). Por defecto, no. */
  readonly permitirStockNegativo: boolean;
  /**
   * Si el comercio ya está de alta en ARCA y puede emitir comprobantes
   * fiscales (Factura A/B/C). Por defecto `true` (comportamiento histórico).
   * En `false` (Fase 10.1), toda venta se resuelve como `TicketNoFiscal`: no
   * se calcula tipo A/B/C ni se pide CAE. Pensado para un comercio que está
   * probando el sistema o recién inició el trámite de alta en ARCA.
   */
  readonly emiteComprobantesFiscales?: boolean;
  /** Logo del comercio como data URL (ej. `data:image/png;base64,...`), para el
   *  login, la barra lateral y los comprobantes impresos. Opcional. */
  readonly logoDataUrl?: string;
}
