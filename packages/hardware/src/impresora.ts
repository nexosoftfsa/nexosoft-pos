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
  | { ok: false; razon: "sin_papel" | "sin_conexion" | "error" };
