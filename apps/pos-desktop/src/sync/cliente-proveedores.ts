/**
 * Cliente de PROVEEDORES (Fase 12). ABM simple, sin cuenta corriente (a
 * diferencia de Clientes, ADR-0027). Online, con adaptador HTTP real (Tauri)
 * y simulado en memoria (navegador de desarrollo).
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

export interface Proveedor {
  readonly id: string;
  readonly nombre: string;
  readonly cuit: string | null;
  readonly contacto: string | null;
  readonly email: string | null;
  readonly telefono: string | null;
  readonly direccion: string | null;
  readonly activo: boolean;
}

/** Datos de alta/edición de proveedor. */
export interface DatosProveedor {
  readonly nombre: string;
  readonly cuit?: string;
  readonly contacto?: string;
  readonly email?: string;
  readonly telefono?: string;
  readonly direccion?: string;
}

export interface ClienteProveedores {
  listar(incluirInactivos: boolean): Promise<Proveedor[]>;
  crear(datos: DatosProveedor): Promise<Proveedor>;
  actualizar(id: string, cambios: Partial<DatosProveedor> & { activo?: boolean }): Promise<Proveedor>;
  desactivar(id: string): Promise<void>;
}

export class ErrorProveedores extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorProveedores";
  }
}

export class ClienteProveedoresHttp implements ClienteProveedores {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  listar(incluirInactivos: boolean): Promise<Proveedor[]> {
    return this.pedir<Proveedor[]>("GET", `/proveedores${incluirInactivos ? "?todos=true" : ""}`);
  }

  crear(datos: DatosProveedor): Promise<Proveedor> {
    return this.pedir<Proveedor>("POST", "/proveedores", datos);
  }

  actualizar(
    id: string,
    cambios: Partial<DatosProveedor> & { activo?: boolean },
  ): Promise<Proveedor> {
    return this.pedir<Proveedor>("PATCH", `/proveedores/${id}`, cambios);
  }

  async desactivar(id: string): Promise<void> {
    await this.pedir<unknown>("DELETE", `/proveedores/${id}`);
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
      throw new ErrorProveedores(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e), 0);
    }
    if (!res.ok) throw new ErrorProveedores(await mensajeDeError(res), res.status);
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
