/**
 * Tipos de una venta confirmada (lo que se persiste). Los totales vienen del
 * dominio (`ResultadoComprobante`); acá se agregan los datos operativos
 * (numeración, estado de CAE, pagos, vuelto).
 */
import type {
  AlicuotaIva,
  Cantidad,
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
  readonly estadoCae: EstadoCae;
  readonly clienteId?: string;
  readonly items: readonly ItemVenta[];
  /** Totales calculados por el dominio (subtotales, IVA por alícuota, total). */
  readonly resultado: ResultadoComprobante;
  readonly pagos: readonly Pago[];
  readonly vuelto: Money;
}
