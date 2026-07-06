import { describe, expect, it, vi } from "vitest";

import { ClienteAsistenteConfigHttp, ErrorAsistenteConfig } from "./cliente-asistente-config";

describe("ClienteAsistenteConfigHttp", () => {
  it("obtener() pega GET con el token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configurada: true, modelo: "gemini-2.5-flash" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteAsistenteConfigHttp("http://server/api/v1", () => "tok");
    const r = await cliente.obtener();

    expect(r).toEqual({ configurada: true, modelo: "gemini-2.5-flash" });
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/api/v1/asistente/configuracion");
    expect((opciones as { method: string }).method).toBe("GET");
    vi.unstubAllGlobals();
  });

  it("actualizar() pega PUT con apiKey y modelo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configurada: true, modelo: "modelo-z" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteAsistenteConfigHttp("http://server", () => "tok");
    await cliente.actualizar("clave-nueva", "modelo-z");

    const [, opciones] = fetchMock.mock.calls[0]!;
    expect((opciones as { method: string }).method).toBe("PUT");
    const body = JSON.parse((opciones as { body: string }).body);
    expect(body).toEqual({ apiKey: "clave-nueva", modelo: "modelo-z" });
    vi.unstubAllGlobals();
  });

  it("actualizar() omite el modelo si no se pasa", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configurada: true, modelo: "x" }) });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteAsistenteConfigHttp("http://server", () => "tok");
    await cliente.actualizar("clave-nueva");

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body).toEqual({ apiKey: "clave-nueva" });
    vi.unstubAllGlobals();
  });

  it("lanza ErrorAsistenteConfig con el mensaje del servidor si falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: "No tenés permisos" }) }),
    );
    const cliente = new ClienteAsistenteConfigHttp("http://server", () => "tok");
    await expect(cliente.obtener()).rejects.toThrow(ErrorAsistenteConfig);
    await expect(cliente.obtener()).rejects.toThrow("No tenés permisos");
    vi.unstubAllGlobals();
  });

  it("si el servidor no responde (fetch falla), da un mensaje claro en vez de 'Failed to fetch'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const cliente = new ClienteAsistenteConfigHttp("http://server", () => "tok");
    await expect(cliente.actualizar("clave-nueva")).rejects.toThrow(/no se pudo conectar/i);
    vi.unstubAllGlobals();
  });
});
