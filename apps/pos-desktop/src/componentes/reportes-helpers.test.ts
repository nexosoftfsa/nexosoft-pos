import { describe, expect, it } from "vitest";

import { aIso, aIsoFechaHora, porcentaje, rangoDe, sectoresDeTorta } from "./reportes-helpers";

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

describe("sectoresDeTorta", () => {
  it("reparte el porcentaje proporcionalmente entre varios valores", () => {
    const r = sectoresDeTorta([50, 30, 20]);
    expect(r).toHaveLength(3);
    expect(r.map((s) => s.porcentaje)).toEqual([50, 30, 20]);
    r.forEach((s) => expect(s.path.startsWith("M")).toBe(true));
  });

  it("un solo valor positivo da un círculo completo (100%)", () => {
    const r = sectoresDeTorta([100, 0, 0]);
    expect(r).toEqual([{ path: expect.any(String), porcentaje: 100 }]);
  });

  it("ignora valores en cero o negativos, no generan sector", () => {
    const r = sectoresDeTorta([10, 0, 5, -3]);
    expect(r).toHaveLength(2);
    expect(r[0]?.porcentaje).toBeCloseTo((10 / 15) * 100, 6);
    expect(r[1]?.porcentaje).toBeCloseTo((5 / 15) * 100, 6);
  });

  it("sin valores positivos devuelve una lista vacía", () => {
    expect(sectoresDeTorta([])).toEqual([]);
    expect(sectoresDeTorta([0, 0])).toEqual([]);
    expect(sectoresDeTorta([-5])).toEqual([]);
  });

  it("los porcentajes de todos los sectores suman 100", () => {
    const r = sectoresDeTorta([7, 13, 25, 5]);
    const suma = r.reduce((a, s) => a + s.porcentaje, 0);
    expect(suma).toBeCloseTo(100, 6);
  });
});
