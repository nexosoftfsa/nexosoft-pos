/**
 * Lógica pura de la pantalla de caja (Fase 7.4): normalización y validación de
 * importes, y lectura de la diferencia del arqueo (sobrante/faltante/exacto).
 */

/** Normaliza un importe ingresado a string con punto decimal (admite es-AR). */
export function normalizarImporte(valor: string): string {
  const v = valor.trim();
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}

/** True si el valor es un número >= 0 (fondo/arqueo pueden ser 0). */
export function importeNoNegativo(valor: string): boolean {
  const v = normalizarImporte(valor);
  return /^\d+(\.\d+)?$/.test(v) && Number(v) >= 0;
}

/** True si el valor es un número > 0 (montos de ingreso/egreso). */
export function importePositivo(valor: string): boolean {
  const v = normalizarImporte(valor);
  return /^\d+(\.\d+)?$/.test(v) && Number(v) > 0;
}

export type SignoDiferencia = "sobrante" | "faltante" | "exacto";

export interface LecturaDiferencia {
  readonly signo: SignoDiferencia;
  readonly etiqueta: string;
}

/** Interpreta la diferencia del arqueo (contado − teórico). */
export function leerDiferencia(diferencia: string | null): LecturaDiferencia | null {
  if (diferencia === null) return null;
  const n = Number(diferencia);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return { signo: "exacto", etiqueta: "Sin diferencia" };
  return n > 0
    ? { signo: "sobrante", etiqueta: "Sobrante" }
    : { signo: "faltante", etiqueta: "Faltante" };
}
