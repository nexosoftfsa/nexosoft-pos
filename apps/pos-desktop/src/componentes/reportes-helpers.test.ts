import { describe, expect, it } from "vitest";

import {
  aIso,
  aIsoFechaHora,
  DIAS_TRABAJADOS_POR_PRESET,
  porcentaje,
  rangoDe,
  rangoDeDiasTrabajados,
  sectoresDeTorta,
  ultimosDiasTrabajados,
  ventanaDeBusqueda,
} from "./reportes-helpers";

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

// El caso que se reportó: se elige "7 días" pero solo se trabajaron 4, y el
// panel mostraba 4 barras y la facturación de 4 jornadas. Ahora el período se
// cuenta en días trabajados.
describe("días trabajados", () => {
  const serie = [
    { fecha: "2026-07-01", total: "100" },
    { fecha: "2026-07-02", total: "200" },
    { fecha: "2026-07-05", total: "300" },
    { fecha: "2026-07-08", total: "400" },
    { fecha: "2026-07-09", total: "500" },
  ];

  it("toma los últimos N días con ventas, no los últimos N del calendario", () => {
    const r = ultimosDiasTrabajados(serie, 3);
    expect(r.map((p) => p.fecha)).toEqual(["2026-07-05", "2026-07-08", "2026-07-09"]);
  });

  it("si trabajó menos días que los pedidos, devuelve los que hay", () => {
    expect(ultimosDiasTrabajados(serie, 20)).toHaveLength(5);
  });

  it("ordena por fecha aunque la serie venga al revés", () => {
    const alReves = [...serie].reverse();
    expect(ultimosDiasTrabajados(alReves, 2).map((p) => p.fecha)).toEqual([
      "2026-07-08",
      "2026-07-09",
    ]);
  });

  it("el rango va del día trabajado más viejo hasta hoy", () => {
    const r = rangoDeDiasTrabajados(ultimosDiasTrabajados(serie, 3), HOY);
    expect(r).toEqual({ desde: "2026-07-05", hasta: "2026-07-15" });
  });

  it("sin ningún día trabajado, el rango es solo hoy", () => {
    expect(rangoDeDiasTrabajados([], HOY)).toEqual({ desde: "2026-07-15", hasta: "2026-07-15" });
  });

  it("acepta fechas con hora y se queda con el día", () => {
    const conHora = [{ fecha: "2026-07-05T10:30:00.000Z" }];
    expect(rangoDeDiasTrabajados(conHora, HOY).desde).toBe("2026-07-05");
  });

  it("la ventana de búsqueda mira bastante más atrás que los días pedidos", () => {
    const v = ventanaDeBusqueda(7, HOY);
    expect(v.hasta).toBe("2026-07-15");
    // 7 * 4 = 28 días, pero el mínimo es 30.
    expect(v.desde).toBe("2026-06-15");
  });

  it("para 30 días trabajados busca 120 días de calendario", () => {
    expect(ventanaDeBusqueda(30, HOY).desde).toBe("2026-03-17");
  });

  it('"Hoy" igual pide varios días, para poder comparar', () => {
    expect(DIAS_TRABAJADOS_POR_PRESET.hoy).toBeGreaterThan(1);
  });

  it("el rango personalizado no se toca", () => {
    expect(DIAS_TRABAJADOS_POR_PRESET.personalizado).toBe(0);
    expect(ultimosDiasTrabajados(serie, 0).map((p) => p.fecha)).toEqual(serie.map((p) => p.fecha));
  });
});
