/**
 * Cliente HTTP de la credencial de acceso por código de barras de un usuario
 * (Fase 15.A, ver ADR-0051): `GET/POST/DELETE /usuarios/:id/credencial`, solo
 * ADMIN.
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

export interface EstadoCredencial {
  readonly activa: boolean;
  readonly version: number;
  readonly creadaEn: string;
  readonly ultimoUsoEn: string | null;
}

export interface CredencialRegenerada {
  readonly payload: string;
  readonly version: number;
}

/** Puerto: lo que la pantalla de credencial necesita (testeable con un doble). */
export interface ClienteCredenciales {
  obtenerEstado(usuarioId: string): Promise<EstadoCredencial | null>;
  regenerar(usuarioId: string): Promise<CredencialRegenerada>;
  revocar(usuarioId: string): Promise<void>;
}

export class ErrorCredenciales extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorCredenciales";
  }
}

export class ClienteCredencialesHttp implements ClienteCredenciales {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  obtenerEstado(usuarioId: string): Promise<EstadoCredencial | null> {
    return this.pedir("GET", `/usuarios/${usuarioId}/credencial`);
  }

  regenerar(usuarioId: string): Promise<CredencialRegenerada> {
    return this.pedir("POST", `/usuarios/${usuarioId}/credencial/regenerar`);
  }

  async revocar(usuarioId: string): Promise<void> {
    await this.pedir("DELETE", `/usuarios/${usuarioId}/credencial`);
  }

  private async pedir<T>(metodo: string, ruta: string): Promise<T> {
    const token = this.obtenerToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${ruta}`, {
        method: metodo,
        headers: { ...(token !== null ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch (e) {
      throw new ErrorCredenciales(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e), 0);
    }
    if (!res.ok) {
      const cuerpoError = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const m = cuerpoError?.message;
      const mensaje = Array.isArray(m) ? m.join(". ") : (m ?? `Error ${res.status} del servidor`);
      throw new ErrorCredenciales(mensaje, res.status);
    }
    // GET .../credencial responde sin body (no "null") cuando el usuario no
    // tiene credencial todavía — ver credenciales.controller.ts en cloud-api.
    const texto = await res.text();
    return (texto === "" ? null : JSON.parse(texto)) as T;
  }
}
