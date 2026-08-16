/**
 * Mapeo de la venta del POS (dominio) al payload que espera el endpoint de
 * sincronización del cloud-api (`CrearVentaDto`). El backend recalcula los
 * totales; acá viajan los datos crudos de la operación.
 */
import { FormaDePago } from "@nexosoft/domain";
import type { OperacionSync } from "@nexosoft/sync";

/** Forma de pago del dominio → `MedioPago` del backend. */
const MEDIOS: Partial<Record<FormaDePago, string>> = {
  [FormaDePago.Efectivo]: "EFECTIVO",
  [FormaDePago.Tarjeta]: "TARJETA_DEBITO",
  [FormaDePago.Billetera]: "MERCADOPAGO_QR",
  [FormaDePago.Transferencia]: "TRANSFERENCIA",
  [FormaDePago.CuentaCorriente]: "CUENTA_CORRIENTE",
};

export function mapearMedioPago(forma: FormaDePago): string {
  return MEDIOS[forma] ?? "EFECTIVO";
}

export interface ItemVentaSync {
  readonly productoId: string;
  readonly cantidad: number;
  /** Precio unitario como string decimal, ej. "1850.00". */
  readonly precioUnitario: string;
  /** Descuento del ítem (monto, ej. por promoción). Opcional. */
  readonly descuento?: string;
  /** Costo neto del artículo al momento de la venta, snapshot (ADR-0048). */
  readonly costoUnitario?: string;
}

/** Un pago de la venta (pago combinado). */
export interface PagoSync {
  readonly medioPago: string;
  /** Monto como string decimal, ej. "140.00". */
  readonly monto: string;
}

/** Medio de pago resumen: el único medio, o "COMBINADO" si hay varios distintos. */
export function resumenMedioPago(pagos: readonly PagoSync[], fallback: string): string {
  if (pagos.length === 0) return fallback;
  const medios = new Set(pagos.map((p) => p.medioPago));
  return medios.size === 1 ? [...medios][0]! : "COMBINADO";
}

/** Construye la operación de sync (con `operacionId` único) para una venta. */
export function construirOperacionVenta(args: {
  readonly items: readonly ItemVentaSync[];
  readonly medioPago: string;
  readonly terminalId: string;
  /** Desglose de pagos (pago combinado). Opcional. */
  readonly pagos?: readonly PagoSync[];
  /** Recargo aplicado, como monto string. Opcional. */
  readonly recargo?: string;
  /** Cliente de la venta (obligatorio para fiado). Opcional. */
  readonly clienteId?: string;
  /** Tipo de comprobante resuelto localmente (Fase 10.1: puede ser "TicketNoFiscal"). */
  readonly tipoComprobante?: string;
}): OperacionSync {
  return {
    operacionId: crypto.randomUUID(),
    tipo: "venta",
    terminalId: args.terminalId,
    creadaEn: new Date().toISOString(),
    payload: {
      medioPago: args.medioPago,
      items: args.items.map((i) => ({
        productoId: i.productoId,
        cantidad: String(i.cantidad),
        precioUnitario: i.precioUnitario,
        ...(i.descuento !== undefined && i.descuento !== "0.00"
          ? { descuento: i.descuento }
          : {}),
        ...(i.costoUnitario !== undefined ? { costoUnitario: i.costoUnitario } : {}),
      })),
      ...(args.pagos !== undefined && args.pagos.length > 0
        ? { pagos: args.pagos.map((p) => ({ medioPago: p.medioPago, monto: p.monto })) }
        : {}),
      ...(args.recargo !== undefined && args.recargo !== "0.00"
        ? { recargo: args.recargo }
        : {}),
      ...(args.clienteId !== undefined ? { clienteId: args.clienteId } : {}),
      ...(args.tipoComprobante !== undefined ? { tipoComprobante: args.tipoComprobante } : {}),
    },
  };
}
