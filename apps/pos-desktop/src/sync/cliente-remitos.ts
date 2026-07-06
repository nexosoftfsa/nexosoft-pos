/**
 * Cliente de REMITOS (Fase 7.8). Documento de entrega NO fiscal (sin precios).
 * Online, con adaptador HTTP real (Tauri) y simulado en memoria (navegador).
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";
export type EstadoRemito = "EMITIDO" | "ANULADO";

export interface ItemRemito {
  readonly id: string;
  readonly descripcion: string;
  readonly cantidad: string;
  readonly productoId: string | null;
}

export interface Remito {
  readonly id: string;
  readonly numero: number;
  readonly clienteNombre: string | null;
  readonly observaciones: string | null;
  readonly estado: EstadoRemito;
  readonly creadoEn: string;
  readonly items: ItemRemito[];
}

export interface DatosItemRemito {
  readonly descripcion: string;
  readonly cantidad: string;
  readonly productoId?: string;
}

export interface DatosRemito {
  readonly clienteNombre?: string;
  readonly observaciones?: string;
  readonly items: DatosItemRemito[];
}

export interface ClienteRemitos {
  listar(): Promise<Remito[]>;
  crear(datos: DatosRemito): Promise<Remito>;
  anular(id: string): Promise<Remito>;
}

export class ErrorRemitos extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorRemitos";
  }
}

export class ClienteRemitosHttp implements ClienteRemitos {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  listar(): Promise<Remito[]> {
    return this.pedir<Remito[]>("GET", "/remitos");
  }
  crear(datos: DatosRemito): Promise<Remito> {
    return this.pedir<Remito>("POST", "/remitos", datos);
  }
  anular(id: string): Promise<Remito> {
    return this.pedir<Remito>("POST", `/remitos/${id}/anular`);
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
      throw new ErrorRemitos(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e), 0);
    }
    if (!res.ok) throw new ErrorRemitos(await mensajeDeError(res), res.status);
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
