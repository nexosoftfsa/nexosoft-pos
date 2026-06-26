import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperacionSync } from "@nexosoft/sync";

import { ClienteSyncHttp } from "./cliente-sync-http";
import { ClienteSyncSimulado } from "./cliente-sync-simulado";

function op(operacionId: string): OperacionSync {
  return {
    operacionId,
    tipo: "venta",
    payload: { medioPago: "EFECTIVO" },
    terminalId: "caja-1",
    creadaEn: "2026-06-26T10:00:00.000Z",
  };
}

describe("ClienteSyncHttp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hace POST con token y cuerpo sin creadaEn, y devuelve el resultado del servidor", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ "op-1": { ok: true, idRemoto: "v1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteSyncHttp("http://srv:3000/api/v1", () => "TOKEN");
    const res = await cliente.enviar([op("op-1")]);

    expect(res["op-1"]).toEqual({ ok: true, idRemoto: "v1" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://srv:3000/api/v1/sync/operaciones");
    expect(init.headers.Authorization).toBe("Bearer TOKEN");
    const body = JSON.parse(init.body);
    expect(body.operaciones[0]).toEqual({
      operacionId: "op-1",
      tipo: "venta",
      payload: { medioPago: "EFECTIVO" },
      terminalId: "caja-1",
    });
    expect(body.operaciones[0]).not.toHaveProperty("creadaEn");
  });

  it("omite Authorization si no hay token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await new ClienteSyncHttp("http://srv/api/v1", () => null).enviar([op("op-1")]);

    expect(fetchMock.mock.calls[0]![1].headers).not.toHaveProperty("Authorization");
  });

  it("lanza si la respuesta no es ok (el motor lo tratará como reintentable)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const cliente = new ClienteSyncHttp("http://srv/api/v1", () => "T");
    await expect(cliente.enviar([op("op-1")])).rejects.toThrow(/503/);
  });

  it("propaga el error de red (fetch rechaza)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const cliente = new ClienteSyncHttp("http://srv/api/v1", () => "T");
    await expect(cliente.enviar([op("op-1")])).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe("ClienteSyncSimulado", () => {
  it("acepta todas las operaciones como ok", async () => {
    const cliente = new ClienteSyncSimulado({ demoraMs: 0 });
    const res = await cliente.enviar([op("op-1"), op("op-2")]);

    expect(res["op-1"]).toMatchObject({ ok: true });
    expect(res["op-2"]).toMatchObject({ ok: true });
  });
});
