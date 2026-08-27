/**
 * `SesionManager`: estado de sesión del POS. Mantiene los tokens en memoria,
 * los persiste en SQLite (sobrevive a reinicios) y refresca el access token
 * cuando está por vencer. Provee `obtenerToken()` para la sync y el pull, y el
 * `terminalId` elegido. Offline-first: si no hay red para refrescar, sigue con
 * el token actual (la sync reintenta); solo un refresh 401 obliga a reloguear.
 */
import type { EjecutorSql } from "@nexosoft/app";

import { ErrorAuth } from "../sync/cliente-auth-http";
import type { ClienteAuth, Credenciales } from "../sync/cliente-auth-http";
import {
  actualizarTerminal,
  actualizarTokens,
  borrarSesion,
  guardarSesion,
  leerSesion,
  olvidarTerminal,
  type SesionGuardada,
} from "./sesion-sqlite";

/** Segundos antes del vencimiento en que conviene refrescar proactivamente. */
const MARGEN_REFRESH_S = 60;

function decodificarPayload(token: string): Record<string, unknown> | null {
  const partes = token.split(".");
  if (partes.length !== 3 || partes[1] === undefined) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Devuelve el `exp` (epoch en segundos) del JWT, o null si no se puede leer. */
export function decodificarExp(token: string): number | null {
  const payload = decodificarPayload(token);
  return typeof payload?.["exp"] === "number" ? (payload["exp"] as number) : null;
}

function decodificarSucursal(token: string): string {
  const payload = decodificarPayload(token);
  return typeof payload?.["sucursalId"] === "string" ? (payload["sucursalId"] as string) : "";
}

/** Devuelve el rol (`rol`) del JWT, o `undefined` si no se puede leer. */
export function decodificarRol(token: string): string | undefined {
  const payload = decodificarPayload(token);
  return typeof payload?.["rol"] === "string" ? (payload["rol"] as string) : undefined;
}

/** Devuelve el id del usuario (`sub`) del JWT, o `undefined` si no se puede leer. */
export function decodificarUsuarioId(token: string): string | undefined {
  const payload = decodificarPayload(token);
  return typeof payload?.["sub"] === "string" ? (payload["sub"] as string) : undefined;
}

/** Devuelve el email del JWT, o `undefined` si no se puede leer. */
export function decodificarEmail(token: string): string | undefined {
  const payload = decodificarPayload(token);
  return typeof payload?.["email"] === "string" ? (payload["email"] as string) : undefined;
}

export class SesionManager {
  private constructor(
    private readonly ejecutor: EjecutorSql,
    private readonly auth: ClienteAuth,
    private estado: SesionGuardada | null,
  ) {}

  /** Carga la sesión persistida (si la hay) desde SQLite. */
  static async cargar(ejecutor: EjecutorSql, auth: ClienteAuth): Promise<SesionManager> {
    return new SesionManager(ejecutor, auth, await leerSesion(ejecutor));
  }

  haySesion(): boolean {
    return this.estado !== null;
  }

  hayTerminal(): boolean {
    return this.estado?.terminalId !== undefined;
  }

  obtenerToken(): string | null {
    return this.estado?.accessToken ?? null;
  }

  get terminalId(): string | undefined {
    return this.estado?.terminalId;
  }

  get terminalNombre(): string | undefined {
    return this.estado?.terminalNombre;
  }

  get email(): string | undefined {
    return this.estado?.email;
  }

  /** Rol del usuario logueado (ADMIN/SUPERVISOR/CAJERO), leído del access token. */
  get rol(): string | undefined {
    return this.estado === null ? undefined : decodificarRol(this.estado.accessToken);
  }

  /** Id del usuario logueado, leído del access token. */
  get usuarioId(): string | undefined {
    return this.estado === null ? undefined : decodificarUsuarioId(this.estado.accessToken);
  }

  /** Sucursal del usuario logueado (persistida al loguearse). */
  get sucursalId(): string | undefined {
    return this.estado?.sucursalId;
  }

  /**
   * La terminal identifica a la MÁQUINA (Caja 1, Depósito), no a la persona:
   * si no se arrastrara al loguearse, cada cambio de turno obligaría a
   * volver a elegirla. Importa desde que el POS pide credenciales en cada
   * arranque.
   */
  private terminalActual(): Pick<SesionGuardada, "terminalId" | "terminalNombre"> {
    return {
      ...(this.estado?.terminalId !== undefined ? { terminalId: this.estado.terminalId } : {}),
      ...(this.estado?.terminalNombre !== undefined
        ? { terminalNombre: this.estado.terminalNombre }
        : {}),
    };
  }

  /** Inicia sesión contra el servidor y persiste los tokens. */
  async login(credenciales: Credenciales): Promise<void> {
    const tokens = await this.auth.login(credenciales);
    const estado: SesionGuardada = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      email: credenciales.email,
      sucursalId: decodificarSucursal(tokens.accessToken),
      ...this.terminalActual(),
    };
    await guardarSesion(this.ejecutor, estado);
    this.estado = estado;
  }

  /**
   * Login alternativo por credencial física (escaneo de código de barras,
   * Fase 15.A). El email no viene del formulario: se decodifica del JWT.
   */
  async loginConCredencial(payload: string): Promise<void> {
    const tokens = await this.auth.loginConCredencial(payload);
    const estado: SesionGuardada = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      email: decodificarEmail(tokens.accessToken) ?? "",
      sucursalId: decodificarSucursal(tokens.accessToken),
      ...this.terminalActual(),
    };
    await guardarSesion(this.ejecutor, estado);
    this.estado = estado;
  }

  /** Registra la terminal elegida (persistida). */
  async elegirTerminal(id: string, nombre: string): Promise<void> {
    if (this.estado === null) throw new Error("No hay sesión para elegir terminal.");
    await actualizarTerminal(this.ejecutor, id, nombre);
    this.estado = { ...this.estado, terminalId: id, terminalNombre: nombre };
  }

  /**
   * Olvida la terminal SIN cerrar la sesión, para poder elegir otra.
   * Ver `olvidarTerminal` en sesion-sqlite: sirve cuando el servidor ya no
   * conoce la terminal guardada.
   */
  async olvidarTerminal(): Promise<void> {
    if (this.estado === null) return;
    await olvidarTerminal(this.ejecutor);
    const { terminalId: _id, terminalNombre: _nombre, ...resto } = this.estado;
    this.estado = resto;
  }

  /**
   * Refresca el access token si está por vencer. No lanza si falla por red (sigue
   * con el token actual); un refresh 401 (inválido/expirado) sí se propaga para
   * obligar a reloguear.
   */
  async asegurarTokenVigente(): Promise<void> {
    if (this.estado === null) return;
    const exp = decodificarExp(this.estado.accessToken);
    const ahora = Math.floor(Date.now() / 1000);
    if (exp !== null && exp - ahora > MARGEN_REFRESH_S) return;

    try {
      const tokens = await this.auth.refresh(this.estado.refreshToken);
      await actualizarTokens(this.ejecutor, tokens.accessToken, tokens.refreshToken);
      this.estado = { ...this.estado, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    } catch (error) {
      if (error instanceof ErrorAuth && error.status === 401) throw error;
      // Sin red u otro error transitorio: seguimos con el token actual.
    }
  }

  /** Cierra la sesión (borra los tokens persistidos). */
  async cerrar(): Promise<void> {
    await borrarSesion(this.ejecutor);
    this.estado = null;
  }
}
