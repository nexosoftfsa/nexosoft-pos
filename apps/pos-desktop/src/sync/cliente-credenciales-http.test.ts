import { describe, expect, it, vi } from "vitest";

import { ClienteCredencialesHttp, ErrorCredenciales } from "./cliente-credenciales-http";

describe("ClienteCredencialesHttp", () => {
  it("obtenerEstado() pega GET /usuarios/:id/credencial con el token", async () => {
    // El backend responde sin body (no "null") cuando el usuario no tiene
    // credencial todavía — ver credenciales.controller.ts en cloud-api.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteCredencialesHttp("http://server", () => "tok");
    const r = await cliente.obtenerEstado("u1");

    expect(r).toBeNull();
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/usuarios/u1/credencial");
    expect((opciones as { method: string }).method).toBe("GET");
    expect((opciones as { headers: Record<string, string> }).headers["Authorization"]).toBe("Bearer tok");
    vi.unstubAllGlobals();
  });

  it("obtenerEstado() parsea el estado cuando sí hay credencial", async () => {
    const cuerpo = { activa: true, version: 2, creadaEn: "2026-01-01T00:00:00.000Z", ultimoUsoEn: null };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(cuerpo) });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteCredencialesHttp("http://server", () => "tok");
    const r = await cliente.obtenerEstado("u1");

    expect(r).toEqual(cuerpo);
    vi.unstubAllGlobals();
  });

  it("regenerar() pega POST /usuarios/:id/credencial/regenerar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => JSON.stringify({ payload: "NXSCRED:u1:tok", version: 1 }) });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteCredencialesHttp("http://server", () => "tok");
    const r = await cliente.regenerar("u1");

    expect(r).toEqual({ payload: "NXSCRED:u1:tok", version: 1 });
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/usuarios/u1/credencial/regenerar");
    expect((opciones as { method: string }).method).toBe("POST");
    vi.unstubAllGlobals();
  });

  it("revocar() pega DELETE /usuarios/:id/credencial", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteCredencialesHttp("http://server", () => "tok");
    await cliente.revocar("u1");

    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/usuarios/u1/credencial");
    expect((opciones as { method: string }).method).toBe("DELETE");
    vi.unstubAllGlobals();
  });

  it("lanza ErrorCredenciales con el mensaje del servidor si falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: "Usuario no encontrado" }) }),
    );
    const cliente = new ClienteCredencialesHttp("http://server", () => "tok");
    await expect(cliente.obtenerEstado("u1")).rejects.toThrow(ErrorCredenciales);
    await expect(cliente.obtenerEstado("u1")).rejects.toThrow("Usuario no encontrado");
    vi.unstubAllGlobals();
  });
});
