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

/**
 * Estado de la caja para decidir si se puede vender (Fase 17.F).
 *
 * `desconocida` NO es lo mismo que `cerrada`: el POS es offline-first y vender
 * no puede depender de la red (ADR-0004). Si no se pudo preguntarle al
 * servidor si hay un turno abierto, se deja vender — mismo criterio que la
 * suscripcion, donde un corte de red nunca bloquea. Solo se bloquea cuando el
 * servidor contesto que NO hay turno abierto.
 */
export type EstadoCaja = "abierta" | "cerrada" | "desconocida";

/** True si en este estado se permite registrar ventas. */
export function puedeVenderConCaja(estado: EstadoCaja): boolean {
  return estado !== "cerrada";
}
