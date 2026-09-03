/**
 * Cliente de COMPROBANTES (Fase 7.6). Lista los comprobantes (ventas y notas de
 * crédito) del servidor de sucursal y permite anular emitiendo una NC. Online
 * (ADR-0028), con adaptador HTTP real (Tauri) y simulado en memoria (navegador).
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

export type EstadoComprobante = "PENDIENTE" | "COMPLETADA" | "ANULADA";

export interface ItemComprobante {
  readonly id: string;
  readonly cantidad: string;
  readonly precioUnitario: string;
  readonly subtotal: string;
  readonly producto: { readonly id: string; readonly nombre: string; readonly codigo: string } | null;
}

export interface PagoComprobante {
  readonly id: string;
  readonly medioPago: string;
  readonly monto: string;
}

export interface Comprobante {
  readonly id: string;
  readonly estado: EstadoComprobante;
  readonly subtotal: string;
  readonly descuento: string;
  readonly total: string;
  readonly medioPago: string;
  readonly cae: string | null;
  readonly caeFechaVto: string | null;
  readonly numeroComprobante: number | null;
  readonly tipoComprobante: string | null;
  readonly creadaEn: string;
  readonly comprobanteAsociadoId: string | null;
  /**
   * Tipo y número del comprobante que corrige, resuelto por el servidor. Con el
   * id solo no se puede imprimir "Comprobante asociado: Factura C 0002-…", que
   * es lo que la Nota de Crédito tiene que decir en el papel.
   */
  readonly comprobanteAsociado?: {
    readonly tipoComprobante: string | null;
    readonly numeroComprobante: number | null;
  } | null;
  /**
   * Cliente identificado en la venta. Presente sólo si la venta se emitió con
   * cliente elegido; sin esto no se puede reimprimir una Factura A con el
   * bloque del receptor.
   */
  readonly cliente?: {
    readonly nombre: string;
    readonly documento: string | null;
    readonly condicionIva: string;
    readonly direccion: string | null;
  } | null;
  /**
   * Descripción de la única línea de una Nota de Débito ("Intereses por mora").
   * Una ND no vende productos, así que no tiene `items`: la impresión arma la
   * línea con este texto y el total.
   */
  readonly conceptoLibre?: string | null;
  readonly items: ItemComprobante[];
  /** Desglose de pagos (presente en ventas con pago combinado). */
  readonly pagos?: PagoComprobante[];
  /**
   * Si `numeroComprobante` es el definitivo. Lo que viene del servidor SIEMPRE
   * lo es —es su propio registro—, así que este campo llega ausente y se asume
   * `true`. Lo completa `comprobanteDeVentaLocal` cuando la fila sale de la
   * copia de la terminal, que puede tener todavía el correlativo local.
   */
  readonly numeroConfirmado?: boolean;
  /**
   * Cómo salió la autorización de ARCA. Una venta puede quedar sin CAE si ARCA
   * no respondía: el comercio tiene que poder VERLO, no enterarse en la
   * inspección.
   */
  readonly estadoFiscal?: EstadoFiscal | null;
  /** Por qué quedó pendiente o rechazada, en castellano. */
  readonly motivoFiscal?: string | null;
}

/** Estado de la autorización fiscal de un comprobante. */
export type EstadoFiscal = "NO_APLICA" | "PENDIENTE" | "AUTORIZADA" | "RECHAZADA";

/**
 * Comprobantes que ya están en el servidor pero todavía esperan el CAE.
 *
 * Es un camino distinto al de la cola de sincronización: una venta puede haber
 * subido perfecto y quedarse sin CAE porque ARCA no contesta. Desde que
 * sincronizar dejó de depender de internet (ADR-0066), el indicador diría
 * "Sincronizado" mientras esto se acumula sin que nadie lo vea.
 */
export interface EsperandoCae {
  readonly cantidad: number;
  /** ISO de la más vieja, o `null` si no hay ninguna. */
  readonly masAntigua: string | null;
  /** Las que ARCA ya no autoriza por fecha: hay que regularizarlas a mano. */
  readonly vencidas: number;
}

export interface ResultadoNotaDebito {
  /** El comprobante original, que NO se anula: sigue vigente. */
  readonly original: Comprobante;
  readonly notaDebito: Comprobante;
}

export interface ResultadoAnulacion {
  readonly anulada: Comprobante;
  readonly notaCredito: Comprobante;
}

/** Qué contestó ARCA sobre un comprobante nuestro. Ver `verificacion-arca.ts` del servidor. */
export interface VerificacionArca {
  readonly estado: "AUTORIZADO" | "DIFIERE" | "NO_ESTA" | "NO_APLICA" | "NO_SE_PUDO";
  readonly mensaje: string;
  readonly diferencias: readonly string[];
  readonly enArca?: {
    readonly cae: string;
    readonly caeFechaVto: string;
    readonly importeTotal?: string;
  };
}

export interface ClienteVentas {
  historial(): Promise<Comprobante[]>;
  anular(id: string): Promise<ResultadoAnulacion>;
  /** Le pregunta a ARCA qué tiene registrado. Sólo lectura: no emite nada. */
  verificarEnArca(id: string): Promise<VerificacionArca>;
  /** Cuántos comprobantes subidos siguen esperando el CAE. */
  esperandoCae(): Promise<EsperandoCae>;
  /**
   * Emite una Nota de Débito sobre un comprobante. **No lo anula**: el original
   * sigue vigente y la nota se suma aparte, por su propio monto y concepto.
   */
  emitirNotaDebito(id: string, monto: string, concepto: string): Promise<ResultadoNotaDebito>;
}

export class ErrorVentas extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorVentas";
  }
}

export class ClienteVentasHttp implements ClienteVentas {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  historial(): Promise<Comprobante[]> {
    return this.pedir<Comprobante[]>("GET", "/ventas");
  }

  anular(id: string): Promise<ResultadoAnulacion> {
    return this.pedir<ResultadoAnulacion>("POST", `/ventas/${id}/anular`);
  }

  verificarEnArca(id: string): Promise<VerificacionArca> {
    return this.pedir<VerificacionArca>("GET", `/ventas/${id}/verificar-arca`);
  }

  esperandoCae(): Promise<EsperandoCae> {
    return this.pedir<EsperandoCae>("GET", "/ventas/esperando-cae");
  }

  emitirNotaDebito(id: string, monto: string, concepto: string): Promise<ResultadoNotaDebito> {
    return this.pedir<ResultadoNotaDebito>("POST", `/ventas/${id}/nota-debito`, {
      monto,
      concepto,
    });
  }

  private async pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    const token = this.obtenerToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${ruta}`, {
        method: metodo,
        headers: {
          ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
          ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      });
    } catch (e) {
      throw new ErrorVentas(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e), 0);
    }
    if (!res.ok) throw new ErrorVentas(await mensajeDeError(res), res.status);
    return (await res.json()) as T;
  }
}

async function mensajeDeError(res: Response): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { message?: string | string[] };
    const m = cuerpo.message;
    if (Array.isArray(m)) return m.join(". ");
    if (typeof m === "string") return m;
  } catch {
    // sin cuerpo JSON
  }
  return `Error ${res.status} del servidor`;
}
