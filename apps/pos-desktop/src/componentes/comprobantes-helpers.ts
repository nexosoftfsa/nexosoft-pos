/**
 * Lógica pura de comprobantes (Fase 7.6): etiquetas de tipo y medio de pago,
 * número formateado y reglas de anulación.
 */
import type { Comprobante } from "../sync/cliente-ventas";

const ETIQUETAS_TIPO: Record<string, string> = {
  FacturaA: "Factura A",
  FacturaB: "Factura B",
  FacturaC: "Factura C",
  NotaCreditoA: "Nota de Crédito A",
  NotaCreditoB: "Nota de Crédito B",
  NotaCreditoC: "Nota de Crédito C",
  NotaDebitoA: "Nota de Débito A",
  NotaDebitoB: "Nota de Débito B",
  NotaDebitoC: "Nota de Débito C",
  TicketNoFiscal: "Ticket",
};

export function etiquetaTipoComprobante(tipo: string | null): string {
  if (tipo === null) return "Comprobante";
  return ETIQUETAS_TIPO[tipo] ?? tipo;
}

const ETIQUETAS_MEDIO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta de débito",
  TARJETA_CREDITO: "Tarjeta de crédito",
  MERCADOPAGO_QR: "MercadoPago QR",
  TRANSFERENCIA: "Transferencia",
  CUENTA_CORRIENTE: "Cuenta corriente",
  COMBINADO: "Combinado",
};

export function etiquetaMedioPago(medio: string): string {
  return ETIQUETAS_MEDIO[medio] ?? medio;
}

/** Número de comprobante formateado (8 dígitos). */
export function numeroComprobante(numero: number | null): string {
  return numero === null ? "—" : `N° ${String(numero).padStart(8, "0")}`;
}

export function esNotaCredito(tipo: string | null): boolean {
  return tipo?.startsWith("NotaCredito") ?? false;
}

/** Un `TicketNoFiscal` (Fase 10.1: comercio sin alta en ARCA) no lleva CAE. */
export function esFiscal(tipo: string | null): boolean {
  return tipo !== "TicketNoFiscal";
}

/** Un comprobante es anulable si no está anulado y no es una Nota de Crédito. */
export function esAnulable(c: Comprobante): boolean {
  return c.estado !== "ANULADA" && !esNotaCredito(c.tipoComprobante);
}
