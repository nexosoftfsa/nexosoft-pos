/**
 * Tipos de comprobante, su letra y la resolución según condición fiscal.
 *
 * Regla central (ADR-0012): el tipo se resuelve con una FUNCIÓN PURA a partir de
 * la condición del emisor (configurable) y la del receptor. No se hardcodea RI.
 */
import { CondicionIva, CONDICIONES_EMISOR_VALIDAS, etiquetaCondicionIva } from "./condicion-iva.js";
import { ErrorFiscal } from "../comun/errores.js";

/** Letra fiscal del comprobante. Las NC/ND heredan la letra de su factura. */
export type LetraComprobante = "A" | "B" | "C" | "X";

export const TipoComprobante = {
  FacturaA: "FacturaA",
  FacturaB: "FacturaB",
  FacturaC: "FacturaC",
  NotaCreditoA: "NotaCreditoA",
  NotaCreditoB: "NotaCreditoB",
  NotaCreditoC: "NotaCreditoC",
  NotaDebitoA: "NotaDebitoA",
  NotaDebitoB: "NotaDebitoB",
  NotaDebitoC: "NotaDebitoC",
  /** Documentos internos (no fiscales): no llevan CAE. */
  Remito: "Remito",
  Presupuesto: "Presupuesto",
  /**
   * Ticket de venta SIN valor fiscal: para un comercio que todavía no está
   * dado de alta en ARCA (ver `ConfiguracionComercio.emiteComprobantesFiscales`).
   * A diferencia de Remito/Presupuesto, SÍ es una venta real (mueve stock,
   * cobra), solo que no pide CAE ni se numera como Factura.
   */
  TicketNoFiscal: "TicketNoFiscal",
} as const;

export type TipoComprobante = (typeof TipoComprobante)[keyof typeof TipoComprobante];

/** Estado del comprobante en el flujo offline-first (ver arquitectura.md §2). */
export const EstadoCae = {
  /** En edición, todavía no confirmado. */
  Borrador: "BORRADOR",
  /** Venta cerrada e impresa; falta autorización de ARCA. */
  PendienteCae: "PENDIENTE_CAE",
  /** ARCA otorgó CAE (con número y vencimiento). */
  Autorizada: "AUTORIZADA",
  /** ARCA rechazó; requiere corrección/reintento. */
  Rechazada: "RECHAZADA",
} as const;

export type EstadoCae = (typeof EstadoCae)[keyof typeof EstadoCae];

/** Documentos internos sin valor fiscal (no requieren CAE). */
const DOCUMENTOS_NO_FISCALES = new Set<TipoComprobante>([
  TipoComprobante.Remito,
  TipoComprobante.Presupuesto,
  TipoComprobante.TicketNoFiscal,
]);

/** ¿El comprobante requiere CAE de ARCA? (Remito/Presupuesto no.) */
export function requiereCae(tipo: TipoComprobante): boolean {
  return !DOCUMENTOS_NO_FISCALES.has(tipo);
}

/** Letra fiscal de un comprobante. Remito/Presupuesto → "X" (sin letra fiscal). */
export function letraDe(tipo: TipoComprobante): LetraComprobante {
  if (tipo.endsWith("A")) return "A";
  if (tipo.endsWith("B")) return "B";
  if (tipo.endsWith("C")) return "C";
  return "X";
}

/**
 * ¿Se discrimina el IVA en el comprobante?
 * Solo la letra A discrimina IVA. B lo lleva incluido (no se muestra) y C
 * (Monotributo) no tiene IVA discriminado.
 */
export function discriminaIva(tipo: TipoComprobante): boolean {
  return letraDe(tipo) === "A";
}

function validarEmisor(condicionEmisor: CondicionIva): void {
  if (!CONDICIONES_EMISOR_VALIDAS.includes(condicionEmisor)) {
    throw new ErrorFiscal(
      "EMISOR_NO_PUEDE_EMITIR",
      `Un emisor "${etiquetaCondicionIva(condicionEmisor)}" no puede emitir comprobantes en el MVP ` +
        `(válidos: Responsable Inscripto o Monotributo).`,
    );
  }
}

/**
 * Resuelve el tipo de FACTURA según la condición del emisor y del receptor
 * (ADR-0012):
 *  - Emisor Monotributo → Factura **C** (IVA no discriminado).
 *  - Emisor RI → **A** a receptor RI; **B** a Consumidor Final / Monotributo /
 *    Exento / No Categorizado (IVA discriminado solo en A).
 */
export function resolverTipoComprobante(
  condicionEmisor: CondicionIva,
  condicionReceptor: CondicionIva,
): TipoComprobante {
  validarEmisor(condicionEmisor);

  if (condicionEmisor === CondicionIva.Monotributo) {
    return TipoComprobante.FacturaC;
  }

  // Emisor Responsable Inscripto.
  return condicionReceptor === CondicionIva.ResponsableInscripto
    ? TipoComprobante.FacturaA
    : TipoComprobante.FacturaB;
}

/** Devuelve la Nota de Crédito de la misma letra que la factura indicada. */
export function notaCreditoPara(tipoFactura: TipoComprobante): TipoComprobante {
  switch (letraDe(tipoFactura)) {
    case "A":
      return TipoComprobante.NotaCreditoA;
    case "B":
      return TipoComprobante.NotaCreditoB;
    case "C":
      return TipoComprobante.NotaCreditoC;
    default:
      throw new ErrorFiscal(
        "SIN_NOTA_CREDITO",
        `El comprobante "${tipoFactura}" no admite Nota de Crédito.`,
      );
  }
}

/** Devuelve la Nota de Débito de la misma letra que la factura indicada. */
export function notaDebitoPara(tipoFactura: TipoComprobante): TipoComprobante {
  switch (letraDe(tipoFactura)) {
    case "A":
      return TipoComprobante.NotaDebitoA;
    case "B":
      return TipoComprobante.NotaDebitoB;
    case "C":
      return TipoComprobante.NotaDebitoC;
    default:
      throw new ErrorFiscal(
        "SIN_NOTA_DEBITO",
        `El comprobante "${tipoFactura}" no admite Nota de Débito.`,
      );
  }
}
