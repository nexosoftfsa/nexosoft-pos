/**
 * Cliente de COMPROBANTES (Fase 7.6). Lista los comprobantes (ventas y notas de
 * crédito) del servidor de sucursal y permite anular emitiendo una NC. Online
 * (ADR-0028), con adaptador HTTP real (Tauri) y simulado en memoria (navegador).
 */

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
  readonly items: ItemComprobante[];
  /** Desglose de pagos (presente en ventas con pago combinado). */
  readonly pagos?: PagoComprobante[];
}

export interface ResultadoAnulacion {
  readonly anulada: Comprobante;
  readonly notaCredito: Comprobante;
}

export interface ClienteVentas {
  historial(): Promise<Comprobante[]>;
  anular(id: string): Promise<ResultadoAnulacion>;
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

  private async pedir<T>(metodo: string, ruta: string): Promise<T> {
    const token = this.obtenerToken();
    const res = await fetch(`${this.baseUrl}${ruta}`, {
      method: metodo,
      headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
    });
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
