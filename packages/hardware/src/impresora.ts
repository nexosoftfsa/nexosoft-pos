/**
 * Puerto ImpresoraTermica y tipos de datos para imprimir tickets.
 *
 * El protocolo concreto (ESC/POS, Star, etc.) y el transporte (USB, serial,
 * red) viven en el adaptador real que corre en la capa nativa de Tauri.
 * Hasta conocer el modelo que comprará el cliente, se usa MockImpresoraTermica.
 *
 * Para producción habrá que implementar:
 *  - Un plugin Tauri que exponga el puerto serie/USB al frontend.
 *  - Un adaptador que traduzca DatosTicket a bytes ESC/POS (o el protocolo del
 *    modelo elegido) y los envíe por el plugin.
 */

import type { Cantidad } from "@nexosoft/domain";
import type { Money } from "@nexosoft/domain";

// ---------------------------------------------------------------------------
// Tipos de datos del ticket
// ---------------------------------------------------------------------------

export interface LineaTicket {
  readonly descripcion: string;
  readonly cantidad: Cantidad;
  readonly precioUnitario: Money;
  readonly importe: Money;
}

export interface SubtotalIva {
  readonly etiqueta: string; // ej. "IVA 21%"
  readonly base: Money;
  readonly iva: Money;
}

/**
 * El comprobante que corrige una Nota de Crédito o de Débito.
 *
 * ARCA ya lo recibe en el `CbtesAsoc` de la solicitud de CAE —sin eso rechaza
 * la nota—, pero el papel que se lleva el cliente también tiene que decirlo:
 * una nota que no identifica el comprobante que corrige no cumple con el
 * régimen de comprobantes, y el contador no puede conciliarla contra nada.
 */
export interface ComprobanteAsociadoTicket {
  /** Texto que se imprime, ej. "Factura C". */
  readonly tipo: string;
  readonly puntoDeVenta: number;
  readonly numero: number;
}

/** "Factura C 0002-00000003". Formato único para el ticket, el A4 y la térmica. */
export function identificacionComprobanteAsociado(a: ComprobanteAsociadoTicket): string {
  return `${a.tipo} ${String(a.puntoDeVenta).padStart(4, "0")}-${String(a.numero).padStart(8, "0")}`;
}

/**
 * ¿El número que lleva este comprobante todavía puede cambiar?
 *
 * La regla es una sola: **el número es definitivo cuando lo confirmó quien lo
 * asigna.** Quién es depende del comprobante:
 *
 *  - Un comprobante **fiscal** lo numera ARCA, y la prueba de que lo hizo es el
 *    CAE. Sin CAE, el número que lleva es un provisorio —local si la venta fue
 *    sin conexión, del servidor si ARCA no contestó— y cambia al autorizarse.
 *  - Un **ticket interno** lo numera el servidor de sucursal, que lleva una sola
 *    serie para todas las cajas. La terminal numera con su propio correlativo
 *    para poder imprimir sin red, y esos dos números divergen apenas hay más de
 *    una caja.
 *
 * Pasó de verdad en producción: una venta sin internet imprimió "Factura C
 * 0002-00000033" y el comprobante que quedó registrado era el 0002-00000004.
 * El cliente se fue con un papel que no coincide con nada.
 *
 * Sin conexión no hay forma de saber el número definitivo. Lo que sí se puede
 * es no inventarlo.
 */
export function numeroEsProvisional(datos: DatosTicket): boolean {
  if (datos.numeroConfirmado === true) return false;
  return (datos.esFiscal ?? true) ? datos.cae === undefined : true;
}

/** Por qué el número todavía no es el definitivo, según quién lo asigna. */
export function leyendaNumeroProvisional(datos: DatosTicket): string {
  return (datos.esFiscal ?? true)
    ? "El número de comprobante y el CAE los asigna ARCA al autorizar."
    : "Número provisorio: el definitivo se asigna al subir la venta al servidor.";
}

/**
 * Cómo se identifica un comprobante todavía sin número fiscal. El cajero
 * necesita poder encontrarlo después, así que el correlativo interno se
 * imprime — pero con nombre propio, para que nadie lo confunda con el fiscal.
 */
export function referenciaInterna(datos: DatosTicket): string {
  return `Referencia interna ${String(datos.numero).padStart(8, "0")}`;
}

/** "0002-00000003": la identificación fiscal, punto de venta y número. */
export function numeroFiscalFormateado(datos: DatosTicket): string {
  return `${String(datos.puntoDeVenta).padStart(4, "0")}-${String(datos.numero).padStart(8, "0")}`;
}

export interface DatosTicket {
  // Cabecera del comercio
  readonly razonSocial: string;
  readonly cuit: string;
  readonly condicionIvaEmisor: string;
  readonly puntoDeVenta: number;
  /**
   * Logo del comercio como data URL. Se usa en la impresión A4 (HTML) y en la
   * térmica (se rasteriza a monocromo y va como imagen ESC/POS).
   */
  readonly logoDataUrl?: string;

  // Comprobante
  readonly tipoComprobante: string; // ej. "Factura B"
  readonly numero: number;
  readonly fecha: Date;
  readonly condicionIvaReceptor: string;
  /** `false` = comercio sin alta en ARCA (Fase 10.1): no imprimir como si fuera fiscal. Default `true`. */
  readonly esFiscal?: boolean;
  /** Presente sólo en Notas de Crédito/Débito: qué comprobante corrigen. */
  readonly comprobanteAsociado?: ComprobanteAsociadoTicket;
  /**
   * `true` cuando `numero` es el definitivo porque lo confirmó quien lo asigna
   * (ARCA para un comprobante fiscal, el servidor para un ticket interno). Sin
   * esto no hay forma de distinguir el número bueno del provisorio de la
   * terminal, y se termina imprimiendo un número que después cambia.
   */
  readonly numeroConfirmado?: boolean;

  // Cuerpo
  readonly lineas: readonly LineaTicket[];

  // Totales
  readonly subtotalesIva: readonly SubtotalIva[];
  readonly descuento: Money;
  readonly total: Money;

  // Cobro
  readonly formasDePago: ReadonlyArray<{ etiqueta: string; monto: Money }>;
  readonly vuelto: Money;

  // Fiscal (opcional: no disponible si el CAE está pendiente)
  readonly cae?: string;
  /**
   * Código de tipo de comprobante de ARCA (Factura C = 11, etc.), necesario
   * para armar el QR fiscal. Va aparte de `tipoComprobante`, que es el texto
   * que se imprime ("Factura C"): el QR lleva el número.
   */
  readonly codigoComprobanteArca?: number;
  readonly vencimientoCae?: Date;
}

// ---------------------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------------------

/**
 * Puerto de la impresora térmica.
 * El POS inyecta la implementación real o el mock; nunca usa `new` directo.
 */
export interface ImpresoraTermica {
  /** Imprime el ticket y resuelve cuando el trabajo fue enviado a la cola. */
  imprimirTicket(datos: DatosTicket): Promise<void>;

  /**
   * Abre el cajón de dinero si el modelo lo soporta.
   * No hace nada en modelos sin cajón ni en el mock.
   */
  abrirCajon(): Promise<void>;

  /** Verifica si la impresora está disponible (conectada, sin papel). */
  verificarEstado(): Promise<EstadoImpresora>;
}

export type EstadoImpresora =
  | { ok: true }
  | {
      ok: false;
      razon: "sin_papel" | "sin_conexion" | "error";
      /** Explicación para mostrarle al cajero, cuando el adaptador la tiene. */
      detalle?: string;
    };
