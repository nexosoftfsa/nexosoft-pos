import { createRequire } from "node:module";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EjecutorSql, Fila, ValorSql } from "@nexosoft/app";

import { ErrorAuth, type TokensAuth } from "../sync/cliente-auth-http";
import type { ClienteAuth } from "../sync/cliente-auth-http";
import { decodificarExp, SesionManager } from "./sesion";
import { crearTablaSesion, leerSesion } from "./sesion-sqlite";

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir("node:sqlite") as typeof import("node:sqlite");

class EjecutorNodeSqlite implements EjecutorSql {
  constructor(private readonly db: InstanceType<typeof DatabaseSync>) {}
  async ejecutar(sql: string, params: readonly ValorSql[] = []): Promise<void> {
    if (params.length === 0) this.db.exec(sql);
    else this.db.prepare(sql).run(...params);
  }
  async consultar<T extends Fila = Fila>(sql: string, params: readonly ValorSql[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }
}

/** JWT de juguete (header.payload.sig) con un payload arbitrario. */
function tokenFalso(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.firma`;
}

function tokens(exp: number, sucursalId = "suc-1"): TokensAuth {
  return { accessToken: tokenFalso({ exp, sucursalId }), refreshToken: "refresh-x" };
}

const EN_1H = () => Math.floor(Date.now() / 1000) + 3600;
const VENCIDO = () => Math.floor(Date.now() / 1000) - 10;

describe("decodificarExp", () => {
  it("lee el exp del payload", () => {
    expect(decodificarExp(tokenFalso({ exp: 1234 }))).toBe(1234);
  });
  it("devuelve null para un token mal formado", () => {
    expect(decodificarExp("no-es-un-jwt")).toBeNull();
  });
});

describe("SesionManager", () => {
  let ejecutor: EjecutorSql;
  let auth: {
    login: ReturnType<typeof vi.fn>;
    loginConCredencial: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const db = new DatabaseSync(":memory:");
    ejecutor = new EjecutorNodeSqlite(db);
    await crearTablaSesion(ejecutor);
    auth = { login: vi.fn(), loginConCredencial: vi.fn(), refresh: vi.fn() };
  });

  it("login persiste tokens y deriva la sucursal del JWT", async () => {
    auth.login.mockResolvedValue(tokens(EN_1H(), "suc-9"));
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);

    await sesion.login({ email: "a@b.com", password: "x" });

    expect(sesion.haySesion()).toBe(true);
    expect(sesion.obtenerToken()).not.toBeNull();
    const guardada = await leerSesion(ejecutor);
    expect(guardada?.email).toBe("a@b.com");
    expect(guardada?.sucursalId).toBe("suc-9");
  });

  it("loginConCredencial persiste tokens y deriva email/sucursal del JWT", async () => {
    auth.loginConCredencial.mockResolvedValue({
      accessToken: tokenFalso({ exp: EN_1H(), sucursalId: "suc-9", email: "cajero1@nexo.com" }),
      refreshToken: "refresh-x",
    });
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);

    await sesion.loginConCredencial("NXSCRED:u1:token");

    expect(auth.loginConCredencial).toHaveBeenCalledWith("NXSCRED:u1:token");
    expect(sesion.haySesion()).toBe(true);
    const guardada = await leerSesion(ejecutor);
    expect(guardada?.email).toBe("cajero1@nexo.com");
    expect(guardada?.sucursalId).toBe("suc-9");
  });

  it("cargar restaura la sesión persistida", async () => {
    auth.login.mockResolvedValue(tokens(EN_1H()));
    const s1 = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await s1.login({ email: "a@b.com", password: "x" });

    const s2 = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    expect(s2.haySesion()).toBe(true);
    expect(s2.email).toBe("a@b.com");
  });

  it("elegirTerminal persiste la terminal elegida", async () => {
    auth.login.mockResolvedValue(tokens(EN_1H()));
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await sesion.login({ email: "a@b.com", password: "x" });

    await sesion.elegirTerminal("term-1", "Caja 1");

    expect(sesion.hayTerminal()).toBe(true);
    expect(sesion.terminalId).toBe("term-1");
    const guardada = await leerSesion(ejecutor);
    expect(guardada?.terminalId).toBe("term-1");
    expect(guardada?.terminalNombre).toBe("Caja 1");
  });

  it("volver a loguearse conserva la terminal ya elegida", async () => {
    auth.login.mockResolvedValue(tokens(EN_1H()));
    const s1 = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await s1.login({ email: "a@b.com", password: "x" });
    await s1.elegirTerminal("term-1", "Caja 1");

    // Arranque siguiente: la app vuelve a pedir credenciales, pero la
    // terminal es de la máquina y no debería preguntarse otra vez.
    const s2 = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await s2.login({ email: "otro@b.com", password: "x" });

    expect(s2.hayTerminal()).toBe(true);
    expect(s2.terminalId).toBe("term-1");
    expect(s2.terminalNombre).toBe("Caja 1");
    expect((await leerSesion(ejecutor))?.terminalId).toBe("term-1");
  });

  it("el login por credencial también conserva la terminal", async () => {
    auth.login.mockResolvedValue(tokens(EN_1H()));
    auth.loginConCredencial.mockResolvedValue(tokens(EN_1H()));
    const s1 = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await s1.login({ email: "a@b.com", password: "x" });
    await s1.elegirTerminal("term-2", "Depósito");

    const s2 = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await s2.loginConCredencial("NXSCRED:u1:token");

    expect(s2.terminalId).toBe("term-2");
  });

  it("olvidarTerminal deja la sesión abierta pero sin terminal", async () => {
    // Pasa cuando se reinstala el servidor desde cero: el id que guardó el POS
    // ya no existe del otro lado. Hay que poder elegir otra sin cerrar sesión.
    auth.login.mockResolvedValue(tokens(EN_1H()));
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await sesion.login({ email: "a@b.com", password: "x" });
    await sesion.elegirTerminal("term-vieja", "Caja 1");

    await sesion.olvidarTerminal();

    expect(sesion.haySesion()).toBe(true);
    expect(sesion.hayTerminal()).toBe(false);
    expect(sesion.terminalId).toBeUndefined();
    const guardada = await leerSesion(ejecutor);
    expect(guardada?.terminalId).toBeUndefined();
    expect(guardada?.email).toBe("a@b.com"); // la sesión sigue
  });

  it("olvidarTerminal sin sesión no rompe", async () => {
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await expect(sesion.olvidarTerminal()).resolves.toBeUndefined();
  });

  it("después de cerrar sesión sí se vuelve a preguntar la terminal", async () => {
    auth.login.mockResolvedValue(tokens(EN_1H()));
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await sesion.login({ email: "a@b.com", password: "x" });
    await sesion.elegirTerminal("term-1", "Caja 1");

    await sesion.cerrar();
    await sesion.login({ email: "a@b.com", password: "x" });

    expect(sesion.hayTerminal()).toBe(false);
  });

  it("asegurarTokenVigente no refresca si el token sigue válido", async () => {
    auth.login.mockResolvedValue(tokens(EN_1H()));
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await sesion.login({ email: "a@b.com", password: "x" });

    await sesion.asegurarTokenVigente();

    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it("asegurarTokenVigente refresca y persiste cuando el token venció", async () => {
    auth.login.mockResolvedValue(tokens(VENCIDO()));
    auth.refresh.mockResolvedValue({ accessToken: tokenFalso({ exp: EN_1H() }), refreshToken: "refresh-nuevo" });
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await sesion.login({ email: "a@b.com", password: "x" });

    await sesion.asegurarTokenVigente();

    expect(auth.refresh).toHaveBeenCalledWith("refresh-x");
    const guardada = await leerSesion(ejecutor);
    expect(guardada?.refreshToken).toBe("refresh-nuevo");
  });

  it("asegurarTokenVigente sin red mantiene el token (no lanza)", async () => {
    auth.login.mockResolvedValue(tokens(VENCIDO()));
    auth.refresh.mockRejectedValue(new Error("network down"));
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await sesion.login({ email: "a@b.com", password: "x" });

    await expect(sesion.asegurarTokenVigente()).resolves.toBeUndefined();
    expect(sesion.haySesion()).toBe(true);
  });

  it("asegurarTokenVigente propaga un refresh 401 (hay que reloguear)", async () => {
    auth.login.mockResolvedValue(tokens(VENCIDO()));
    auth.refresh.mockRejectedValue(new ErrorAuth("Credenciales inválidas", 401));
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await sesion.login({ email: "a@b.com", password: "x" });

    await expect(sesion.asegurarTokenVigente()).rejects.toBeInstanceOf(ErrorAuth);
  });

  it("cerrar borra la sesión persistida", async () => {
    auth.login.mockResolvedValue(tokens(EN_1H()));
    const sesion = await SesionManager.cargar(ejecutor, auth as unknown as ClienteAuth);
    await sesion.login({ email: "a@b.com", password: "x" });

    await sesion.cerrar();

    expect(sesion.haySesion()).toBe(false);
    expect(await leerSesion(ejecutor)).toBeNull();
  });
});
