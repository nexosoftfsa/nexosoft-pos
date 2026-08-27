/**
 * Lógica pura de comprobantes (Fase 7.6): etiquetas de tipo y medio de pago,
 * número formateado y reglas de anulación.
 */
import { Cantidad, etiquetaCondicionIva, Money } from "@nexosoft/domain";
import type { TipoComprobante } from "@nexosoft/domain";
import { codigoComprobanteArca } from "@nexosoft/fiscal";
import type { DatosTicket } from "@nexosoft/hardware";
import type { ConfiguracionComercio } from "@nexosoft/app";
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

/**
 * Cómo mostrar el estado de la autorización fiscal.
 *
 * Una venta sin CAE porque ARCA no respondía es normal y se resuelve sola, pero
 * el comercio tiene que poder verla: si no se muestra, la única forma de
 * enterarse es una inspección. Una rechazada, en cambio, no se arregla sola.
 *
 * `null` cuando no hay nada que avisar: autorizada, o comprobante no fiscal.
 */
export function avisoFiscal(
  estadoFiscal: string | null | undefined,
  motivoFiscal: string | null | undefined,
): { etiqueta: string; tono: "warn" | "danger"; detalle: string } | null {
  if (estadoFiscal === "PENDIENTE") {
    return {
      etiqueta: "Sin CAE",
      tono: "warn",
      detalle:
        motivoFiscal !== null && motivoFiscal !== undefined && motivoFiscal !== ""
          ? `Esperando a ARCA: ${motivoFiscal}`
          : "Esperando a ARCA. Se autoriza solo cuando vuelva el servicio.",
    };
  }
  if (estadoFiscal === "RECHAZADA") {
    return {
      etiqueta: "Rechazada",
      tono: "danger",
      detalle:
        motivoFiscal !== null && motivoFiscal !== undefined && motivoFiscal !== ""
          ? `ARCA la rechazó: ${motivoFiscal}`
          : "ARCA rechazó el comprobante. Hay que corregirlo a mano.",
    };
  }
  return null;
}

/** Un `TicketNoFiscal` (Fase 10.1: comercio sin alta en ARCA) no lleva CAE. */
export function esFiscal(tipo: string | null): boolean {
  return tipo !== "TicketNoFiscal";
}

/** Un comprobante es anulable si no está anulado y no es una Nota de Crédito. */
export function esAnulable(c: Comprobante): boolean {
  return c.estado !== "ANULADA" && !esNotaCredito(c.tipoComprobante);
}

/**
 * Fase 10.4: arma los `DatosTicket` para reimprimir un comprobante en A4.
 * OJO: el cloud-api no persiste el desglose de IVA por alícuota ni la
 * condición del receptor por venta — `subtotalesIva` queda vacío (el total ya
 * incluye el IVA, solo no se puede discriminar en la reimpresión).
 */
export function datosTicketDeComprobante(
  c: Comprobante,
  config: ConfiguracionComercio,
): DatosTicket {
  return {
    razonSocial: config.razonSocial,
    cuit: config.cuit,
    condicionIvaEmisor: etiquetaCondicionIva(config.condicionIvaEmisor),
    puntoDeVenta: config.puntoDeVenta,
    ...(config.logoDataUrl !== undefined ? { logoDataUrl: config.logoDataUrl } : {}),
    tipoComprobante: etiquetaTipoComprobante(c.tipoComprobante),
    numero: c.numeroComprobante ?? 0,
    fecha: new Date(c.creadaEn),
    condicionIvaReceptor: "",
    esFiscal: esFiscal(c.tipoComprobante),
    lineas: c.items.map((it) => ({
      descripcion: it.producto?.nombre ?? it.producto?.codigo ?? "Ítem",
      cantidad: Cantidad.de(it.cantidad),
      precioUnitario: Money.desde(it.precioUnitario),
      importe: Money.desde(it.subtotal),
    })),
    subtotalesIva: [],
    descuento: Money.desde(c.descuento),
    total: Money.desde(c.total),
    formasDePago: (c.pagos ?? []).map((p) => ({
      etiqueta: etiquetaMedioPago(p.medioPago),
      monto: Money.desde(p.monto),
    })),
    vuelto: Money.cero(),
    ...(c.cae !== null ? { cae: c.cae } : {}),
    ...(c.caeFechaVto !== null ? { vencimientoCae: new Date(c.caeFechaVto) } : {}),
    ...(codigoArcaDe(c.tipoComprobante) !== null
      ? { codigoComprobanteArca: codigoArcaDe(c.tipoComprobante) as number }
      : {}),
  };
}

/**
 * Código numérico de ARCA para el QR fiscal. `null` si el comprobante no es
 * fiscal (un ticket interno no lleva QR: no hay nada que verificar).
 */
function codigoArcaDe(tipo: string | null): number | null {
  if (tipo === null) return null;
  try {
    return codigoComprobanteArca(tipo as TipoComprobante);
  } catch {
    return null;
  }
}
