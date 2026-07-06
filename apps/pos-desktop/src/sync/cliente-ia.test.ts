import { describe, expect, it, vi } from "vitest";

import { AsistenteIACompuesto, AsistenteIAHttp, AsistenteIAMock, interpretar } from "./cliente-ia";

describe("interpretar", () => {
  it("clasifica preguntas de ventas", () => {
    expect(interpretar("¿Cuánto vendí hoy?")).toBe("ventas");
    expect(interpretar("cuánto facturé")).toBe("ventas");
  });
  it("clasifica vencimientos", () => {
    expect(interpretar("¿qué tengo por vencer?")).toBe("vencimientos");
    expect(interpretar("mostrame los lotes")).toBe("vencimientos");
  });
  it("clasifica stock bajo", () => {
    expect(interpretar("¿qué stock está bajo?")).toBe("stock_bajo");
    expect(interpretar("qué tengo que reponer")).toBe("stock_bajo");
  });
  it("clasifica deudores", () => {
    expect(interpretar("¿quién me debe plata?")).toBe("deudores");
    expect(interpretar("cuentas por cobrar")).toBe("deudores");
  });
  it("cae en ayuda si no reconoce", () => {
    expect(interpretar("hola qué tal")).toBe("ayuda");
  });
  it("no confunde preguntas genéricas con 'hoy'/'cuánto' con ventas (deriva a ayuda/LLM)", () => {
    // Bug real: "hoy" y "cuánto" eran claves de "ventas" y matcheaban cualquier
    // pregunta que las contuviera, aunque no tuviera nada que ver (ej. el dólar).
    expect(interpretar("¿cuánto está el dólar hoy?")).toBe("ayuda");
    expect(interpretar("¿qué hora es?")).toBe("ayuda");
  });
});

describe("AsistenteIAMock", () => {
  it("responde ventas del día usando el cliente de reportes", async () => {
    const reportes = {
      resumen: async () => ({ cantidadVentas: 3, totalVendido: "12000", totalDescuentos: "0", ticketPromedio: "4000" }),
    };
    const asistente = new AsistenteIAMock({ reportes: reportes as never });
    const r = await asistente.preguntar("¿cuánto vendí hoy?");
    expect(r).toContain("3 venta");
    expect(r).toMatch(/12\.000|12000/);
  });

  it("avisa cuando no hay lotes por vencer", async () => {
    const stock = { vencimientos: async () => [], saldos: async () => [] };
    const asistente = new AsistenteIAMock({ stock: stock as never });
    const r = await asistente.preguntar("¿qué está por vencer?");
    expect(r.toLowerCase()).toContain("no hay lotes");
  });

  it("lista deudores ordenados", async () => {
    const ctacte = {
      listar: async () => [
        { id: "a", nombre: "Ana", saldo: "5000" },
        { id: "b", nombre: "Beto", saldo: "0" },
        { id: "c", nombre: "Caro", saldo: "12000" },
      ],
    };
    const asistente = new AsistenteIAMock({ ctacte: ctacte as never });
    const r = await asistente.preguntar("¿quién me debe?");
    expect(r).toContain("Caro");
    expect(r).toContain("Ana");
    expect(r).not.toContain("Beto"); // saldo 0, no debe
  });

  it("da ayuda ante una pregunta que no entiende", async () => {
    const asistente = new AsistenteIAMock({});
    const r = await asistente.preguntar("contame un chiste");
    expect(r.toLowerCase()).toContain("puedo ayudarte");
  });

  it("si falla la consulta de red (ventas), responde 'no hay datos aún' en vez del error crudo", async () => {
    const reportes = { resumen: async () => { throw new TypeError("Failed to fetch"); } };
    const asistente = new AsistenteIAMock({ reportes: reportes as never });
    const r = await asistente.preguntar("¿cuánto vendí hoy?");
    expect(r.toLowerCase()).toContain("no hay datos aún");
    expect(r).not.toContain("Failed to fetch");
  });

  it("si falla la consulta de red (vencimientos/stock), responde 'no hay datos aún'", async () => {
    const stock = {
      vencimientos: async () => { throw new TypeError("Failed to fetch"); },
      saldos: async () => { throw new TypeError("Failed to fetch"); },
    };
    const asistente = new AsistenteIAMock({ stock: stock as never });
    expect((await asistente.preguntar("¿qué está por vencer?")).toLowerCase()).toContain("no hay datos aún");
    expect((await asistente.preguntar("¿qué stock está bajo?")).toLowerCase()).toContain("no hay datos aún");
  });

  it("si falla la consulta de red (deudores), responde 'no hay datos aún'", async () => {
    const ctacte = { listar: async () => { throw new TypeError("Failed to fetch"); } };
    const asistente = new AsistenteIAMock({ ctacte: ctacte as never });
    const r = await asistente.preguntar("¿quién me debe?");
    expect(r.toLowerCase()).toContain("no hay datos aún");
  });
});

describe("AsistenteIAHttp", () => {
  it("postea la pregunta con el token y devuelve la respuesta", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ respuesta: "El CAE es..." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = new AsistenteIAHttp("http://server/api/v1", () => "tok-123");
    const r = await cliente.preguntar("¿qué es el CAE?");

    expect(r).toBe("El CAE es...");
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://server/api/v1/asistente/preguntar");
    expect((opciones as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer tok-123");
    vi.unstubAllGlobals();
  });

  it("lanza con el mensaje del servidor si la respuesta no es ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: "sin GEMINI_API_KEY" }) }),
    );
    const cliente = new AsistenteIAHttp("http://server", () => null);
    await expect(cliente.preguntar("hola")).rejects.toThrow("sin GEMINI_API_KEY");
    vi.unstubAllGlobals();
  });

  it("si el servidor no responde (fetch falla), da un mensaje claro en vez de 'Failed to fetch'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const cliente = new AsistenteIAHttp("http://server", () => null);
    await expect(cliente.preguntar("hola")).rejects.toThrow(/no se pudo conectar/i);
    vi.unstubAllGlobals();
  });
});

describe("AsistenteIACompuesto", () => {
  it("resuelve preguntas de datos SIEMPRE con el mock, sin llamar al LLM", async () => {
    const llm = { preguntar: vi.fn() };
    const mock = new AsistenteIAMock({});
    const compuesto = new AsistenteIACompuesto(mock, llm);
    await compuesto.preguntar("¿cuánto vendí hoy?");
    expect(llm.preguntar).not.toHaveBeenCalled();
  });

  it("deriva al LLM las preguntas que no son de datos", async () => {
    const llm = { preguntar: vi.fn().mockResolvedValue("Respuesta del LLM") };
    const compuesto = new AsistenteIACompuesto(new AsistenteIAMock({}), llm);
    const r = await compuesto.preguntar("¿qué es el Monotributo?");
    expect(r).toBe("Respuesta del LLM");
    expect(llm.preguntar).toHaveBeenCalledWith("¿qué es el Monotributo?");
  });

  it("si el LLM falla, cae al texto de ayuda del mock", async () => {
    const llm = { preguntar: vi.fn().mockRejectedValue(new Error("sin conexión")) };
    const compuesto = new AsistenteIACompuesto(new AsistenteIAMock({}), llm);
    const r = await compuesto.preguntar("¿qué es el Monotributo?");
    expect(r).toContain("sin conexión");
    expect(r.toLowerCase()).toContain("puedo ayudarte");
  });

  it("sin LLM configurado, usa directamente el mock", async () => {
    const compuesto = new AsistenteIACompuesto(new AsistenteIAMock({}));
    const r = await compuesto.preguntar("¿qué es el Monotributo?");
    expect(r.toLowerCase()).toContain("puedo ayudarte");
  });
});
