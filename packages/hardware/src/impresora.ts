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
  // OJO con el orden. Antes `numeroConfirmado` cortaba primero, y eso pisaba la
  // regla del CAE: con el servidor accesible pero ARCA caída, el servidor
  // devuelve un número propio (`siguienteNumeroNoFiscal`) para poder registrar
  // la venta, y el ticket lo imprimía como si fuera fiscal. Salió
  // "Factura C 0002-00000102" y ARCA después le puso el 7.
  //
  // Para un comprobante fiscal, la ÚNICA prueba es el CAE. `numeroConfirmado`
  // sólo decide en los internos, que no esperan ningún CAE.
  return (datos.esFiscal ?? true)
    ? datos.cae === undefined
    : datos.numeroConfirmado !== true;
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

/**
 * La letra fiscal del comprobante ("A", "B", "C" o "X") — se lee de la última
 * palabra de `tipoComprobante`: "Factura A", "Nota de Crédito B", "Ticket".
 *
 * `packages/hardware` no depende de `@nexosoft/domain` a propósito (ADR-0018:
 * los adaptadores son planos), así que la letra se deriva del mismo texto que
 * se imprime. La app compone `tipoComprobante` con `etiquetaComprobante` del
 * dominio y siempre termina con la letra o con "Ticket": si eso cambia hay que
 * actualizar acá.
 */
export function letraFiscal(datos: DatosTicket): "A" | "B" | "C" | "X" {
  const ultima = datos.tipoComprobante.trim().slice(-1).toUpperCase();
  return ultima === "A" || ultima === "B" || ultima === "C" ? ultima : "X";
}

/**
 * ¿Este comprobante lleva los datos del receptor identificado en el papel?
 *
 * La letra manda:
 *  - **A siempre**: ARCA le exige CUIT del receptor, y sin nombre y CUIT en el
 *    papel el comprobante no cumple como tal.
 *  - **B/NC B sólo si hay receptor identificado**: el papel lo suele pedir el
 *    cliente para su registro, pero no es obligatorio en el ticket al
 *    consumidor final del mostrador.
 *  - **C nunca**: es venta al consumidor final y saturar el ticket con datos
 *    no cambia nada fiscal.
 */
export function llevaDatosDelReceptor(datos: DatosTicket): boolean {
  const l = letraFiscal(datos);
  if (l === "A") return true;
  if (l === "B" && datos.receptor !== undefined) return true;
  return false;
}

/**
 * El subtotal neto de un comprobante que discrimina IVA: la suma de las bases.
 *
 * Sólo tiene sentido en la letra A. Devuelve `null` cuando no hay desglose, que
 * es el caso de B, C y de los comprobantes viejos que se emitieron antes de que
 * el servidor guardara el detalle.
 *
 * Vive acá y no en cada renderer porque ya nos pasó: lo puse en la impresión
 * térmica y me olvidé del ticket HTML, y el mismo comprobante salía distinto
 * según por dónde se imprimiera.
 */
export function subtotalNeto(datos: DatosTicket): Money | null {
  if (letraFiscal(datos) !== "A") return null;
  const [primero, ...resto] = datos.subtotalesIva;
  if (primero === undefined) return null;
  return resto.reduce((a, s) => a.sumar(s.base), primero.base);
}

/**
 * "02/09/2026 19:46" — fecha y hora del comprobante, **en 24 horas**.
 *
 * A propósito no se usa `toLocaleString`: en una PC configurada en 12 horas
 * imprimía "07:46" a secas, sin AM ni PM, y en un ticket eso es ambiguo — una
 * venta de la mañana y una de la tarde salen iguales. Lo reportó Sebastián
 * probando en campo. El formato es el mismo que ya usaba la térmica, así que
 * ahora los tres coinciden.
 */
export function fechaHoraTicket(f: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
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
  /**
   * Datos del receptor identificado. Ausente en una venta a consumidor final
   * sin identificar (el caso común del mostrador con Factura B o C). Presente
   * y con TODO cargado en una Factura A: ARCA le exige nombre y CUIT, y sin
   * eso lo que sale no cumple como comprobante.
   */
  readonly receptor?: {
    readonly razonSocial: string;
    /** CUIT o DNI. Se imprime tal cual viene (ya normalizado). */
    readonly documento: string;
    readonly domicilio?: string;
  };
  /** `false` = comercio sin alta en ARCA (Fase 10.1): no imprimir como si fuera fiscal. Default `true`. */
  readonly esFiscal?: boolean;
  /** Presente sólo en Notas de Crédito/Débito: qué comprobante corrigen. */
  readonly comprobanteAsociado?: ComprobanteAsociadoTicket;
  /**
   * `"ORIGINAL"` la primera vez que el comprobante se imprime en el momento de
   * la venta; `"DUPLICADO"` cualquier reimpresión posterior (desde Comprobantes,
   * o desde el A4). Ausente cuando el comprobante no es fiscal.
   *
   * Es una exigencia formal de la Factura A/B: un mismo comprobante no puede
   * andar dando vueltas con múltiples "originales" que parezcan cada uno el
   * bueno.
   */
  readonly leyenda?: "ORIGINAL" | "DUPLICADO";
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
