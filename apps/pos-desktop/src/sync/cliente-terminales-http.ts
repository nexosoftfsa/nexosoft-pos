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
}

export class ClienteTerminalesHttp implements ClienteTerminales {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  async listar(): Promise<TerminalRemota[]> {
    const token = this.obtenerToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/terminales`, {
        headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (e) {
      throw new Error(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e));
    }
    if (!res.ok) {
      throw new Error(`Terminales HTTP ${res.status}`);
    }
    return (await res.json()) as TerminalRemota[];
  }
}
