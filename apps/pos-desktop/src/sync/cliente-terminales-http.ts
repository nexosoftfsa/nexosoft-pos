/**
 * Cliente HTTP de terminales (`GET /terminales`): lista las cajas de la sucursal
 * para que el cajero elija en cuál está. El `id` elegido viaja como `terminalId`.
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";
export interface TerminalRemota {
  readonly id: string;
  readonly nombre: string;
}

/** Puerto: lo que la selección de terminal necesita (testeable con un doble). */
export interface ClienteTerminales {
  listar(): Promise<TerminalRemota[]>;
  /** Da de alta una terminal nueva (ADMIN/SUPERVISOR, ver RolesGuard en el backend). */
  crear(nombre: string): Promise<TerminalRemota>;
}

export class ClienteTerminalesHttp implements ClienteTerminales {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  async listar(): Promise<TerminalRemota[]> {
    return this.pedir("GET", "/terminales");
  }

  async crear(nombre: string): Promise<TerminalRemota> {
    return this.pedir("POST", "/terminales", { nombre });
  }

  private async pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    const token = this.obtenerToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${ruta}`, {
        method: metodo,
        headers: {
          ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      });
    } catch (e) {
      throw new Error(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e));
    }
    if (!res.ok) {
      throw new Error(`Terminales HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
