/**
 * Tipos de una venta confirmada (lo que se persiste). Los totales vienen del
 * dominio (`ResultadoComprobante`); acá se agregan los datos operativos
 * (numeración, estado de CAE, pagos, vuelto).
 */
import type { ComprobanteAsociado } from "@nexosoft/fiscal";

import type {
  AlicuotaIva,
  Cantidad,
  CondicionIva,
  EstadoCae,
  Money,
  Pago,
  ResultadoComprobante,
  TipoComprobante,
} from "@nexosoft/domain";

export interface ItemVenta {
  readonly articuloId: string;
  readonly descripcion: string;
  readonly cantidad: Cantidad;
  readonly precioUnitario: Money;
  readonly alicuota: AlicuotaIva;
  readonly descuentoPorcentaje?: number;
}

export interface VentaConfirmada {
  readonly id: string;
  readonly fecha: Date;
  readonly puntoDeVenta: number;
  readonly numero: number;
  readonly tipoComprobante: TipoComprobante;
  readonly condicionIvaReceptor: CondicionIva;
  readonly estadoCae: EstadoCae;
  /** CAE otorgado por ARCA (cuando `estadoCae === AUTORIZADA`). */
  readonly cae?: string;
  readonly vencimientoCae?: Date;
  readonly clienteId?: string;
  readonly items: readonly ItemVenta[];
  /** Totales calculados por el dominio (subtotales, IVA por alícuota, total). */
  readonly resultado: ResultadoComprobante;
  readonly pagos: readonly Pago[];
  readonly vuelto: Money;
  /** Solo en Notas de Crédito/Débito: la(s) factura(s) que rectifican. */
  readonly comprobantesAsociados?: readonly ComprobanteAsociado[];
}
