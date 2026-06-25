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
}
