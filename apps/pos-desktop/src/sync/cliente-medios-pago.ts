/**
 * Cliente de MEDIOS DE PAGO (Fase 12.E): tarjetas por banco con su tasa de
 * recargo según cantidad de cuotas. ABM simple, mismo criterio que
 * Proveedores. Online, con adaptador HTTP real (Tauri) y simulado en
 * memoria (navegador de desarrollo).
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

export type TipoTarjeta = "DEBITO" | "CREDITO";

export interface TasaCuota {
  readonly cantidadCuotas: number;
  readonly recargoPorcentaje: number;
}

export interface Tarjeta {
  readonly id: string;
  readonly banco: string;
  readonly tipo: TipoTarjeta;
  readonly marca: string | null;
  readonly activo: boolean;
  readonly tasas: readonly TasaCuota[];
}

/** Datos de alta/edición de una tarjeta. */
export interface DatosTarjeta {
  readonly banco: string;
  readonly tipo: TipoTarjeta;
  readonly marca?: string;
  /** Si se incluye, reemplaza el set completo de tasas por cuotas. */
  readonly tasas?: readonly TasaCuota[];
}

export interface ClienteMediosPago {
  listar(incluirInactivas: boolean): Promise<Tarjeta[]>;
  crear(datos: DatosTarjeta): Promise<Tarjeta>;
  actualizar(id: string, cambios: Partial<DatosTarjeta> & { activo?: boolean }): Promise<Tarjeta>;
  desactivar(id: string): Promise<void>;
}

export class ErrorMediosPago extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorMediosPago";
  }
}

export class ClienteMediosPagoHttp implements ClienteMediosPago {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  listar(incluirInactivas: boolean): Promise<Tarjeta[]> {
    return this.pedir<Tarjeta[]>(
      "GET",
      `/medios-pago/tarjetas${incluirInactivas ? "?todos=true" : ""}`,
    );
  }

  crear(datos: DatosTarjeta): Promise<Tarjeta> {
    return this.pedir<Tarjeta>("POST", "/medios-pago/tarjetas", datos);
  }

  actualizar(id: string, cambios: Partial<DatosTarjeta> & { activo?: boolean }): Promise<Tarjeta> {
    return this.pedir<Tarjeta>("PATCH", `/medios-pago/tarjetas/${id}`, cambios);
  }

  async desactivar(id: string): Promise<void> {
    await this.pedir<unknown>("DELETE", `/medios-pago/tarjetas/${id}`);
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
      throw new ErrorMediosPago(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e), 0);
    }
    if (!res.ok) throw new ErrorMediosPago(await mensajeDeError(res), res.status);
    return (await res.json().catch(() => null)) as T;
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
