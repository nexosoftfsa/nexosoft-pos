import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClienteApi, ErrorApi } from "./cliente-http";

const BASE = "http://localhost:3000/api/v1";

function respuestaOk(cuerpo: unknown) {
  return { ok: true, status: 200, json: async () => cuerpo } as Response;
}
function respuestaError(status: number) {
  return { ok: false, status, json: async () => ({}) } as Response;
}

describe("ClienteApi.get", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adjunta el header Authorization cuando hay token", async () => {
    fetchMock.mockResolvedValue(respuestaOk({ ok: 1 }));
    const api = new ClienteApi(BASE, () => "tok123");

    await api.get("/reportes/ventas/resumen");

    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/reportes/ventas/resumen`);
    expect((opciones.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok123",
    );
  });

  it("omite Authorization cuando no hay token", async () => {
    fetchMock.mockResolvedValue(respuestaOk({}));
    const api = new ClienteApi(BASE, () => null);

    await api.get("/x");

    const opciones = fetchMock.mock.calls[0]![1];
    expect("Authorization" in (opciones.headers as object)).toBe(false);
  });

  it("arma el query string e ignora los valores undefined", async () => {
    fetchMock.mockResolvedValue(respuestaOk([]));
    const api = new ClienteApi(BASE, () => "t");

    await api.get("/reportes/productos/top", {
      desde: "2026-06-01",
      hasta: undefined,
      limite: 5,
    });

    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${BASE}/reportes/productos/top?desde=2026-06-01&limite=5`,
    );
  });

  it("devuelve el JSON parseado cuando la respuesta es ok", async () => {
    fetchMock.mockResolvedValue(respuestaOk({ total: "100.00" }));
    const api = new ClienteApi(BASE, () => "t");

    const r = await api.get<{ total: string }>("/x");
    expect(r.total).toBe("100.00");
  });

  it("lanza ErrorApi con el status en respuestas no ok", async () => {
    fetchMock.mockResolvedValue(respuestaError(403));
    const api = new ClienteApi(BASE, () => "t");

    await expect(api.get("/x")).rejects.toMatchObject({
      name: "ErrorApi",
      status: 403,
    });
    await expect(api.get("/x")).rejects.toBeInstanceOf(ErrorApi);
  });
});
