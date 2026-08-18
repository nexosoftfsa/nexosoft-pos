/**
 * Lógica pura de reportes en el POS (Fase 7.7): presets de rango de fechas
 * (calculados en fecha LOCAL) y utilidades de formato. Reusa los endpoints
 * `/reportes` de la Fase 6.
 */

export type PresetRango = "hoy" | "semana" | "treinta" | "mes" | "personalizado";

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

/** Fecha y hora local a `YYYY-MM-DDTHH:mm` (formato de `<input type="datetime-local">`). */
export function aIsoFechaHora(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${aIso(d)}T${hh}:${mm}`;
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

export interface SectorTorta {
  readonly path: string;
  readonly porcentaje: number;
}

/**
 * Convierte una lista de valores en sectores de un gráfico de torta SVG
 * (ángulo acumulado → coordenadas con seno/coseno, centrado en `cx,cy` con
 * radio `radio`). Ignora valores en cero o negativos. Un solo valor
 * positivo se resuelve como círculo completo (un `path` de arco no puede
 * empezar y terminar en el mismo punto).
 */
export function sectoresDeTorta(
  valores: readonly number[],
  opciones: { cx?: number; cy?: number; radio?: number } = {},
): readonly SectorTorta[] {
  const { cx = 50, cy = 50, radio = 50 } = opciones;
  const positivos = valores.filter((v) => v > 0);
  const total = positivos.reduce((a, v) => a + v, 0);
  if (total <= 0) return [];

  if (positivos.length === 1) {
    return [
      {
        path: `M ${cx - radio},${cy} A ${radio},${radio} 0 1,1 ${cx + radio},${cy} A ${radio},${radio} 0 1,1 ${cx - radio},${cy} Z`,
        porcentaje: 100,
      },
    ];
  }

  const sectores: SectorTorta[] = [];
  let acumulado = 0;
  for (const v of valores) {
    if (v <= 0) continue;
    const inicio = (acumulado / total) * 2 * Math.PI;
    acumulado += v;
    const fin = (acumulado / total) * 2 * Math.PI;
    const x1 = cx + radio * Math.sin(inicio);
    const y1 = cy - radio * Math.cos(inicio);
    const x2 = cx + radio * Math.sin(fin);
    const y2 = cy - radio * Math.cos(fin);
    const largeArc = fin - inicio > Math.PI ? 1 : 0;
    sectores.push({
      path: `M ${cx},${cy} L ${x1},${y1} A ${radio},${radio} 0 ${largeArc},1 ${x2},${y2} Z`,
      porcentaje: (v / total) * 100,
    });
  }
  return sectores;
}
