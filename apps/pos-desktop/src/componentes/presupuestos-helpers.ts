/** Lógica pura de presupuestos (Fase 7.8): estados, vencimiento y validación de líneas. */
import type { EstadoPresupuesto } from "../sync/cliente-presupuestos";

export const ETIQUETA_ESTADO: Record<EstadoPresupuesto, string> = {
  VIGENTE: "Vigente",
  CONVERTIDO: "Convertido",
  ANULADO: "Anulado",
};

export function fechaVencimiento(creadoEn: string, validezDias: number): Date {
  const d = new Date(creadoEn);
  d.setDate(d.getDate() + validezDias);
  return d;
}

/** True si el presupuesto está VIGENTE pero ya pasó su fecha de validez. */
export function estaVencido(
  creadoEn: string,
  validezDias: number,
  estado: EstadoPresupuesto,
  ahora: Date = new Date(),
): boolean {
  return estado === "VIGENTE" && fechaVencimiento(creadoEn, validezDias).getTime() < ahora.getTime();
}

export function normalizarImporte(valor: string): string {
  const v = valor.trim();
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}

function esNumeroPositivo(valor: string): boolean {
  return /^\d+(\.\d+)?$/.test(valor) && Number(valor) > 0;
}

/** Valida una línea de presupuesto; devuelve el mensaje de error o null. */
export function validarLinea(descripcion: string, cantidad: string, precio: string): string | null {
  if (descripcion.trim() === "") return "Falta la descripción.";
  if (!esNumeroPositivo(normalizarImporte(cantidad))) return "Cantidad inválida.";
  if (!esNumeroPositivo(normalizarImporte(precio))) return "Precio inválido.";
  return null;
}
