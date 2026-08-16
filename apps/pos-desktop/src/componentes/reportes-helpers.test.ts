import { describe, expect, it } from "vitest";

import { aIso, aIsoFechaHora, porcentaje, rangoDe } from "./reportes-helpers";

const HOY = new Date(2026, 6, 15); // 15/07/2026 (local)

describe("aIso", () => {
  it("formatea una fecha local a YYYY-MM-DD", () => {
    expect(aIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("aIsoFechaHora", () => {
  it("formatea fecha y hora local a YYYY-MM-DDTHH:mm", () => {
    expect(aIsoFechaHora(new Date(2026, 0, 5, 9, 5))).toBe("2026-01-05T09:05");
  });
});

describe("rangoDe", () => {
  it("hoy = mismo día en desde y hasta", () => {
    expect(rangoDe("hoy", HOY)).toEqual({ desde: "2026-07-15", hasta: "2026-07-15" });
  });

  it("semana = últimos 7 días (incluye hoy)", () => {
    expect(rangoDe("semana", HOY)).toEqual({ desde: "2026-07-09", hasta: "2026-07-15" });
  });

  it("treinta = últimos 30 días (incluye hoy)", () => {
    expect(rangoDe("treinta", HOY)).toEqual({ desde: "2026-06-16", hasta: "2026-07-15" });
  });

  it("mes = desde el 1° del mes actual", () => {
    expect(rangoDe("mes", HOY)).toEqual({ desde: "2026-07-01", hasta: "2026-07-15" });
  });
});

describe("porcentaje", () => {
  it("calcula la proporción acotada a 0–100", () => {
    expect(porcentaje("50", "200")).toBe(25);
    expect(porcentaje("10", "0")).toBe(0);
    expect(porcentaje("300", "200")).toBe(100);
  });
});
