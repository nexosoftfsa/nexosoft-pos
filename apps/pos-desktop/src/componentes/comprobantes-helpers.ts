/**
 * Lógica pura de comprobantes (Fase 7.6): etiquetas de tipo y medio de pago,
 * número formateado y reglas de anulación.
 */
import { Cantidad, etiquetaCondicionIva, Money } from "@nexosoft/domain";
import type { FormaDePago, TipoComprobante } from "@nexosoft/domain";
import { codigoComprobanteArca } from "@nexosoft/fiscal";
import type { ComprobanteAsociadoTicket, DatosTicket } from "@nexosoft/hardware";
import type { ConfiguracionComercio, VentaLocal } from "@nexosoft/app";
import { mapearMedioPago, resumenMedioPago } from "../sync/mapeo";
import type { Comprobante, EstadoFiscal } from "../sync/cliente-ventas";

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

/** Cualquier nota, de crédito o de débito. Ninguna admite otra nota encima. */
export function esNota(tipo: string | null): boolean {
  return tipo?.startsWith("Nota") ?? false;
}

/**
 * ¿Se le puede emitir una Nota de Débito?
 *
 * Sólo a una factura **fiscal**, vigente y que no sea a su vez una nota.
 * Debitarle algo a un comprobante anulado no tiene sentido: lo que se estaría
 * cobrando pertenece a una operación que se dio de baja.
 */
export function admiteNotaDebito(c: Comprobante): boolean {
  return esFiscal(c.tipoComprobante) && !esNota(c.tipoComprobante) && c.estado !== "ANULADA";
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

/**
 * Un comprobante es anulable si no está anulado y no es una nota.
 *
 * Vale para las dos: anular una Nota de Crédito sería emitir una NC de una NC,
 * y anular una de Débito es exactamente lo que hace una NC — que se emite sobre
 * la factura, no sobre la nota.
 */
export function esAnulable(c: Comprobante): boolean {
  return c.estado !== "ANULADA" && !esNota(c.tipoComprobante);
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
  const asociado = comprobanteAsociadoDe(c, config.puntoDeVenta);
  const receptor = receptorDe(c);
  const condicionReceptor =
    c.cliente !== undefined && c.cliente !== null
      ? etiquetaCondicionCliente(c.cliente.condicionIva)
      : "";
  return {
    razonSocial: config.razonSocial,
    cuit: config.cuit,
    condicionIvaEmisor: etiquetaCondicionIva(config.condicionIvaEmisor),
    puntoDeVenta: config.puntoDeVenta,
    ...(config.logoDataUrl !== undefined ? { logoDataUrl: config.logoDataUrl } : {}),
    tipoComprobante: etiquetaTipoComprobante(c.tipoComprobante),
    numero: c.numeroComprobante ?? 0,
    // Lo que viene del servidor es su propio registro: ese número es el bueno.
    numeroConfirmado: c.numeroConfirmado ?? true,
    fecha: new Date(c.creadaEn),
    condicionIvaReceptor: condicionReceptor,
    esFiscal: esFiscal(c.tipoComprobante),
    // Reimprimir SIEMPRE marca "DUPLICADO" cuando el comprobante es fiscal: el
    // original ya se emitió en el momento de la venta (ver PantallaPos).
    ...(esFiscal(c.tipoComprobante) ? { leyenda: "DUPLICADO" as const } : {}),
    ...(asociado !== null ? { comprobanteAsociado: asociado } : {}),
    ...(receptor !== null ? { receptor } : {}),
    lineas: lineasDe(c),
    subtotalesIva: subtotalesIvaDe(c),
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

/** Centavos → string decimal, ej. `242000` → `"2420.00"`. */
function deCentavos(centavos: number): string {
  return Money.desdeCentavos(centavos).aDecimalString(2);
}

/** `estado_cae` de la terminal → `estadoFiscal` del servidor. */
function estadoFiscalDe(estadoCae: string): EstadoFiscal {
  if (estadoCae === "AUTORIZADA") return "AUTORIZADA";
  if (estadoCae === "RECHAZADA") return "RECHAZADA";
  if (estadoCae === "BORRADOR") return "NO_APLICA";
  return "PENDIENTE";
}

/**
 * Una venta guardada en la terminal, vista como `Comprobante`.
 *
 * Sirve para que Comprobantes muestre algo **sin conexión**: hasta ahora la
 * pantalla leía sólo del servidor (ADR-0028), así que sin red quedaba vacía y
 * el cajero no podía ni reimprimir un ticket que acababa de emitir.
 *
 * El número que se expone es el de ARCA si ya lo hay, y si no el correlativo
 * local. No hace falta distinguirlos acá: como la venta sin autorizar tampoco
 * tiene CAE, la impresión ya sabe que ese número es provisional y lo imprime
 * como referencia interna (`numeroEsProvisional`).
 */
export function comprobanteDeVentaLocal(v: VentaLocal): Comprobante {
  const pagos = v.pagos.map((p, i) => ({
    id: `${v.id}-pago-${i}`,
    medioPago: mapearMedioPago(p.forma as FormaDePago),
    monto: deCentavos(p.montoCentavos),
  }));
  const total = deCentavos(v.totalCentavos);
  return {
    id: v.id,
    estado: "COMPLETADA",
    subtotal: total,
    descuento: deCentavos(v.descuentoCentavos),
    total,
    medioPago: resumenMedioPago(pagos, "EFECTIVO"),
    cae: v.cae,
    caeFechaVto: v.vencimientoCae?.toISOString() ?? null,
    numeroComprobante: v.numeroFiscal ?? v.numero,
    numeroConfirmado: v.numeroFiscal !== null,
    tipoComprobante: v.tipoComprobante,
    creadaEn: v.fecha.toISOString(),
    comprobanteAsociadoId: null,
    items: v.items.map((it, i) => ({
      id: `${v.id}-item-${i}`,
      cantidad: it.cantidad,
      precioUnitario: deCentavos(it.precioUnitarioCentavos),
      subtotal: deCentavos(it.importeCentavos),
      producto: { id: "", nombre: it.descripcion, codigo: "" },
    })),
    pagos,
    estadoFiscal: estadoFiscalDe(v.estadoCae),
    motivoFiscal: null,
  };
}

/** Etiqueta legible de una alícuota, a partir del código de ARCA. */
const ETIQUETA_POR_CODIGO_ARCA: Readonly<Record<number, string>> = {
  3: "IVA 0%",
  4: "IVA 10,5%",
  5: "IVA 21%",
  6: "IVA 27%",
  8: "IVA 5%",
  9: "IVA 2,5%",
};

/**
 * El desglose por alícuota para reimprimir, tal como se declaró a ARCA.
 *
 * Hasta que se empezó a guardar, esto iba vacío y **una Factura A reimpresa
 * salía sin discriminar IVA** — sólo el total, que no sirve como Factura A. Los
 * comprobantes anteriores siguen sin desglose: reconstruirlo sería inventar
 * algo que quizá no coincide con lo que se emitió.
 */
function subtotalesIvaDe(c: Comprobante): DatosTicket["subtotalesIva"] {
  const renglones = c.ivaPorAlicuota;
  if (renglones === undefined || renglones === null || renglones.length === 0) return [];
  return renglones.map((r) => ({
    etiqueta: ETIQUETA_POR_CODIGO_ARCA[r.codigoArca] ?? `IVA (${r.codigoArca})`,
    base: Money.desde(r.base),
    iva: Money.desde(r.importe),
  }));
}

/**
 * Las líneas que se imprimen de un comprobante.
 *
 * Una Nota de Débito no vende productos —`ItemVenta` exige un `productoId`
 * real— así que llega sin ítems y con un `conceptoLibre`. Sin este caso, una ND
 * se imprimiría con el cuerpo vacío: total abajo y nada arriba explicándolo.
 */
function lineasDe(c: Comprobante): DatosTicket["lineas"] {
  if (c.items.length === 0 && c.conceptoLibre != null && c.conceptoLibre !== "") {
    const total = Money.desde(c.total);
    return [
      {
        descripcion: c.conceptoLibre,
        cantidad: Cantidad.de("1"),
        precioUnitario: total,
        importe: total,
      },
    ];
  }
  return c.items.map((it) => ({
    descripcion: it.producto?.nombre ?? it.producto?.codigo ?? "Ítem",
    cantidad: Cantidad.de(it.cantidad),
    precioUnitario: Money.desde(it.precioUnitario),
    importe: Money.desde(it.subtotal),
  }));
}

/**
 * Datos del receptor para reimprimir en A/B, si la venta se emitió con cliente
 * identificado y con documento. La impresión decide después si los pinta según
 * la letra del comprobante (`llevaDatosDelReceptor`).
 */
function receptorDe(c: Comprobante): {
  razonSocial: string;
  documento: string;
  domicilio?: string;
} | null {
  const cli = c.cliente;
  if (cli === undefined || cli === null) return null;
  if (cli.documento === null || cli.documento.trim() === "") return null;
  return {
    razonSocial: cli.nombre,
    documento: cli.documento,
    ...(cli.direccion !== null && cli.direccion.trim() !== ""
      ? { domicilio: cli.direccion }
      : {}),
  };
}

/**
 * `condicionIva` del cliente (string del backend) → etiqueta legible.
 *
 * No usamos `etiquetaCondicionIva` del dominio porque el backend guarda
 * `RESPONSABLE_INSCRIPTO` y el enum del dominio es camelCase — un mapa aparte
 * es lo más simple.
 */
function etiquetaCondicionCliente(condicion: string): string {
  switch (condicion) {
    case "RESPONSABLE_INSCRIPTO":
      return "Responsable Inscripto";
    case "MONOTRIBUTO":
      return "Monotributo";
    case "EXENTO":
      return "Exento";
    default:
      return "Consumidor Final";
  }
}

/**
 * Qué comprobante corrige una Nota de Crédito/Débito, para imprimirlo.
 *
 * `null` si no corrige a ninguno (una factura) o si el servidor no lo resolvió
 * — puede pasar con comprobantes viejos, anteriores a que se empezara a
 * devolver la relación. Preferimos no imprimir la línea antes que imprimirla
 * incompleta.
 *
 * El punto de venta sale de la configuración: el original y su nota se emiten
 * siempre desde la misma terminal, y la venta no guarda un punto de venta
 * propio.
 */
function comprobanteAsociadoDe(
  c: Comprobante,
  puntoDeVenta: number,
): ComprobanteAsociadoTicket | null {
  const a = c.comprobanteAsociado;
  if (a === undefined || a === null) return null;
  if (a.tipoComprobante === null || a.numeroComprobante === null) return null;
  return {
    tipo: etiquetaTipoComprobante(a.tipoComprobante),
    puntoDeVenta,
    numero: a.numeroComprobante,
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
