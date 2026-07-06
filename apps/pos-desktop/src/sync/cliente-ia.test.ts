import { describe, expect, it } from "vitest";

import { AsistenteIAMock, interpretar } from "./cliente-ia";

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
});
