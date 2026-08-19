/**
 * Cliente HTTP de gestión de usuarios: listar y cambiar rol/activo
 * (`GET/PATCH /usuarios`, solo ADMIN) + alta de un usuario nuevo (reusa
 * `POST /auth/register`, que una vez que hay usuarios exige sesión ADMIN —
 * ver ADR-0047).
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

export type RolUsuario = "ADMIN" | "SUPERVISOR" | "CAJERO";

export interface UsuarioRemoto {
  readonly id: string;
  readonly email: string;
  readonly nombreDisplay: string;
  readonly rol: RolUsuario;
  readonly activo: boolean;
  readonly creadoEn: string;
}

export interface NuevoUsuario {
  readonly email: string;
  readonly nombreDisplay: string;
  readonly password: string;
  readonly rol: RolUsuario;
}

export interface CambiosUsuario {
  readonly rol?: RolUsuario;
  readonly activo?: boolean;
}

export interface EstadoFoto {
  readonly fotoBase64: string | null;
}

/** Puerto: lo que la pantalla de Usuarios necesita (testeable con un doble). */
export interface ClienteUsuarios {
  listar(): Promise<UsuarioRemoto[]>;
  crear(datos: NuevoUsuario): Promise<UsuarioRemoto>;
  actualizar(id: string, cambios: CambiosUsuario): Promise<UsuarioRemoto>;
  obtenerFoto(id: string): Promise<EstadoFoto>;
  actualizarFoto(id: string, fotoBase64: string): Promise<EstadoFoto>;
}

export class ErrorUsuarios extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorUsuarios";
  }
}

export class ClienteUsuariosHttp implements ClienteUsuarios {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
    /** sucursalId del ADMIN logueado: lo necesita POST /auth/register. */
    private readonly sucursalId: string,
  ) {}

  listar(): Promise<UsuarioRemoto[]> {
    return this.pedir("GET", "/usuarios");
  }

  crear(datos: NuevoUsuario): Promise<UsuarioRemoto> {
    return this.pedir("POST", "/auth/register", { ...datos, sucursalId: this.sucursalId });
  }

  actualizar(id: string, cambios: CambiosUsuario): Promise<UsuarioRemoto> {
    return this.pedir("PATCH", `/usuarios/${id}`, cambios);
  }

  obtenerFoto(id: string): Promise<EstadoFoto> {
    return this.pedir("GET", `/usuarios/${id}/foto`);
  }

  actualizarFoto(id: string, fotoBase64: string): Promise<EstadoFoto> {
    return this.pedir("PUT", `/usuarios/${id}/foto`, { fotoBase64 });
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
      throw new ErrorUsuarios(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e), 0);
    }
    if (!res.ok) {
      const cuerpoError = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const m = cuerpoError?.message;
      const mensaje = Array.isArray(m) ? m.join(". ") : (m ?? `Error ${res.status} del servidor`);
      throw new ErrorUsuarios(mensaje, res.status);
    }
    return (await res.json()) as T;
  }
}
