import { describe, it, expect } from "vitest";
import {
  decodificarToken,
  tokenExpirado,
  tieneAccesoAReportes,
} from "./token";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function hacerToken(payload: Record<string, unknown>): string {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.firma`;
}

const PAYLOAD = {
  sub: "u1",
  email: "duenio@comercio.com",
  rol: "ADMIN",
  sucursalId: "s1",
  exp: 4102444800, // 2100
};

describe("decodificarToken", () => {
  it("extrae los datos de sesión del payload", () => {
    const datos = decodificarToken(hacerToken(PAYLOAD));
    expect(datos).toEqual({
      usuarioId: "u1",
      email: "duenio@comercio.com",
      rol: "ADMIN",
      sucursalId: "s1",
      expEnSegundos: 4102444800,
    });
  });

  it("lanza si el token no tiene 3 partes", () => {
    expect(() => decodificarToken("abc.def")).toThrow();
  });

  it("lanza si faltan campos esperados", () => {
    expect(() => decodificarToken(hacerToken({ sub: "u1" }))).toThrow();
  });
});

describe("tokenExpirado", () => {
  const base = decodificarToken(hacerToken({ ...PAYLOAD, exp: 1000 }));

  it("es true cuando exp ya pasó (con margen)", () => {
    expect(tokenExpirado(base, 1000 * 1000)).toBe(true);
  });

  it("es false cuando exp está en el futuro", () => {
    expect(tokenExpirado(base, 500 * 1000)).toBe(false);
  });
});

describe("tieneAccesoAReportes", () => {
  it("permite ADMIN y SUPERVISOR", () => {
    expect(tieneAccesoAReportes("ADMIN")).toBe(true);
    expect(tieneAccesoAReportes("SUPERVISOR")).toBe(true);
  });

  it("rechaza CAJERO u otros", () => {
    expect(tieneAccesoAReportes("CAJERO")).toBe(false);
    expect(tieneAccesoAReportes("")).toBe(false);
  });
});
