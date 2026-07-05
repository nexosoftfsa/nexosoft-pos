/**
 * Cliente de PRESUPUESTOS (Fase 7.8). Comprobante NO fiscal: armar/listar/anular
 * y marcar convertido. Online, con adaptador HTTP real (Tauri) y simulado en
 * memoria (navegador de desarrollo).
 */

export type EstadoPresupuesto = "VIGENTE" | "CONVERTIDO" | "ANULADO";

export interface ItemPresupuesto {
  readonly id: string;
  readonly descripcion: string;
  readonly cantidad: string;
  readonly precioUnitario: string;
  readonly subtotal: string;
  readonly productoId: string | null;
}

export interface Presupuesto {
  readonly id: string;
  readonly numero: number;
  readonly clienteNombre: string | null;
  readonly observaciones: string | null;
  readonly validezDias: number;
  readonly total: string;
  readonly estado: EstadoPresupuesto;
  readonly creadoEn: string;
  readonly items: ItemPresupuesto[];
}

export interface DatosItemPresupuesto {
  readonly descripcion: string;
  readonly cantidad: string;
  readonly precioUnitario: string;
  readonly productoId?: string;
}

export interface DatosPresupuesto {
  readonly clienteNombre?: string;
  readonly observaciones?: string;
  readonly validezDias?: number;
  readonly items: DatosItemPresupuesto[];
}

/** Resultado de convertir un presupuesto: el presupuesto CONVERTIDO + la venta generada. */
export interface ConversionPresupuesto {
  readonly presupuesto: Presupuesto;
  readonly venta: {
    readonly id: string;
    readonly numeroComprobante: number | null;
    readonly tipoComprobante: string | null;
  };
}

export interface ClientePresupuestos {
  listar(): Promise<Presupuesto[]>;
  crear(datos: DatosPresupuesto): Promise<Presupuesto>;
  convertir(id: string): Promise<ConversionPresupuesto>;
  anular(id: string): Promise<Presupuesto>;
}

export class ErrorPresupuestos extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorPresupuestos";
  }
}

export class ClientePresupuestosHttp implements ClientePresupuestos {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  listar(): Promise<Presupuesto[]> {
    return this.pedir<Presupuesto[]>("GET", "/presupuestos");
  }
  crear(datos: DatosPresupuesto): Promise<Presupuesto> {
    return this.pedir<Presupuesto>("POST", "/presupuestos", datos);
  }
  convertir(id: string): Promise<ConversionPresupuesto> {
    return this.pedir<ConversionPresupuesto>("POST", `/presupuestos/${id}/convertir`);
  }
  anular(id: string): Promise<Presupuesto> {
    return this.pedir<Presupuesto>("POST", `/presupuestos/${id}/anular`);
  }

  private async pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    const token = this.obtenerToken();
    const res = await fetch(`${this.baseUrl}${ruta}`, {
      method: metodo,
      headers: {
        ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
        ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
    if (!res.ok) throw new ErrorPresupuestos(await mensajeDeError(res), res.status);
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
