/**
 * Lógica pura de reportes en el POS (Fase 7.7): presets de rango de fechas
 * (calculados en fecha LOCAL) y utilidades de formato. Reusa los endpoints
 * `/reportes` de la Fase 6.
 */

export type PresetRango = "hoy" | "semana" | "treinta" | "mes";

export interface RangoFechas {
  readonly desde: string; // YYYY-MM-DD
  readonly hasta: string; // YYYY-MM-DD (inclusive)
}

export const PRESETS: ReadonlyArray<{ valor: PresetRango; etiqueta: string }> = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "7 días" },
  { valor: "treinta", etiqueta: "30 días" },
  { valor: "mes", etiqueta: "Este mes" },
];

/** Fecha local a `YYYY-MM-DD` (sin usar UTC, para respetar el día del comercio). */
export function aIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Devuelve el rango (desde/hasta) de un preset, relativo a `hoy`. */
export function rangoDe(preset: PresetRango, hoy: Date = new Date()): RangoFechas {
  const hasta = aIso(hoy);
  if (preset === "hoy") return { desde: hasta, hasta };
  if (preset === "semana") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 6);
    return { desde: aIso(d), hasta };
  }
  if (preset === "treinta") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 29);
    return { desde: aIso(d), hasta };
  }
  // mes: desde el 1° del mes actual
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { desde: aIso(primero), hasta };
}

/** Porcentaje (0–100) de una parte sobre un total, para las barras. */
export function porcentaje(parte: string, total: string): number {
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.min(100, Math.max(0, (Number(parte) / t) * 100));
}
