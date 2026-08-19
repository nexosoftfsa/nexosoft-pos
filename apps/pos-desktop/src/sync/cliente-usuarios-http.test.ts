import { describe, expect, it, vi } from "vitest";

import { ClienteUsuariosHttp, ErrorUsuarios } from "./cliente-usuarios-http";

describe("ClienteUsuariosHttp", () => {
  it("listar() pega GET /usuarios con el token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "u1" }] });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteUsuariosHttp("http://server/api/v1", () => "tok", "s1");
    const r = await cliente.listar();

    expect(r).toEqual([{ id: "u1" }]);
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/api/v1/usuarios");
    expect((opciones as { method: string }).method).toBe("GET");
    expect((opciones as { headers: Record<string, string> }).headers["Authorization"]).toBe("Bearer tok");
    vi.unstubAllGlobals();
  });

  it("crear() pega POST /auth/register con la sucursalId inyectada", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "u2" }) });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteUsuariosHttp("http://server", () => "tok", "s1");
    await cliente.crear({ email: "a@b.com", nombreDisplay: "A", password: "12345678", rol: "CAJERO" });

    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/auth/register");
    const body = JSON.parse((opciones as { body: string }).body);
    expect(body).toEqual({
      email: "a@b.com",
      nombreDisplay: "A",
      password: "12345678",
      rol: "CAJERO",
      sucursalId: "s1",
    });
    vi.unstubAllGlobals();
  });

  it("actualizar() pega PATCH /usuarios/:id con los cambios", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "u2", activo: false }) });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteUsuariosHttp("http://server", () => "tok", "s1");
    await cliente.actualizar("u2", { activo: false });

    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/usuarios/u2");
    expect((opciones as { method: string }).method).toBe("PATCH");
    vi.unstubAllGlobals();
  });

  it("obtenerFoto() pega GET /usuarios/:id/foto", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ fotoBase64: null }) });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteUsuariosHttp("http://server", () => "tok", "s1");
    const r = await cliente.obtenerFoto("u2");

    expect(r).toEqual({ fotoBase64: null });
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/usuarios/u2/foto");
    expect((opciones as { method: string }).method).toBe("GET");
    vi.unstubAllGlobals();
  });

  it("actualizarFoto() pega PUT /usuarios/:id/foto con la data URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ fotoBase64: "data:image/png;base64,abc" }) });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteUsuariosHttp("http://server", () => "tok", "s1");
    await cliente.actualizarFoto("u2", "data:image/png;base64,abc");

    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/usuarios/u2/foto");
    expect((opciones as { method: string }).method).toBe("PUT");
    const body = JSON.parse((opciones as { body: string }).body);
    expect(body).toEqual({ fotoBase64: "data:image/png;base64,abc" });
    vi.unstubAllGlobals();
  });

  it("lanza ErrorUsuarios con el mensaje del servidor si falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: "No podés desactivarte a vos mismo." }) }),
    );
    const cliente = new ClienteUsuariosHttp("http://server", () => "tok", "s1");
    await expect(cliente.actualizar("u1", { activo: false })).rejects.toThrow(ErrorUsuarios);
    await expect(cliente.actualizar("u1", { activo: false })).rejects.toThrow("No podés desactivarte a vos mismo.");
    vi.unstubAllGlobals();
  });
});
