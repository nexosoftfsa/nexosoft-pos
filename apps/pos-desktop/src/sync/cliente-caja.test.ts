import { describe, expect, it, vi } from "vitest";

import { ClienteCajaHttp, ErrorCaja } from "./cliente-caja";

describe("ClienteCajaHttp", () => {
  it("turnoActual() devuelve null cuando el backend responde sin body (sin turno abierto)", async () => {
    // Nest responde 200 con body vacío (no la palabra "null") cuando el
    // controller devuelve null -- ver caja.service.ts `turnoActual()`.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteCajaHttp("http://server", () => "tok");
    const r = await cliente.turnoActual("term-1");

    expect(r).toBeNull();
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/caja/turnos/actual?terminalId=term-1");
    vi.unstubAllGlobals();
  });

  it("turnoActual() parsea el turno cuando sí hay uno abierto", async () => {
    const turno = { id: "t1", estado: "ABIERTO", fondoApertura: "1000.00" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(turno) });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteCajaHttp("http://server", () => "tok");
    const r = await cliente.turnoActual("term-1");

    expect(r).toEqual(turno);
    vi.unstubAllGlobals();
  });

  it("abrirTurno() pega POST /caja/turnos", async () => {
    const turno = { id: "t1", estado: "ABIERTO" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(turno) });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new ClienteCajaHttp("http://server", () => "tok");
    const r = await cliente.abrirTurno("term-1", "1000.00");

    expect(r).toEqual(turno);
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/caja/turnos");
    expect((opciones as { method: string }).method).toBe("POST");
    vi.unstubAllGlobals();
  });

  it("lanza ErrorCaja con el mensaje del servidor si falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: "Turno ya cerrado" }) }),
    );
    const cliente = new ClienteCajaHttp("http://server", () => "tok");
    await expect(cliente.turnoActual("term-1")).rejects.toThrow(ErrorCaja);
    await expect(cliente.turnoActual("term-1")).rejects.toThrow("Turno ya cerrado");
    vi.unstubAllGlobals();
  });

  it("lanza ErrorCaja si el body no es JSON válido (respuesta corrupta de verdad)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<html>error</html>" }));
    const cliente = new ClienteCajaHttp("http://server", () => "tok");
    await expect(cliente.turnoActual("term-1")).rejects.toThrow(ErrorCaja);
    vi.unstubAllGlobals();
  });
});
