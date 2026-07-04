/** Lógica pura de remitos (Fase 7.8): validación de línea (descripción + cantidad). */

export function normalizarCantidad(valor: string): string {
  const v = valor.trim();
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}

function esNumeroPositivo(valor: string): boolean {
  return /^\d+(\.\d+)?$/.test(valor) && Number(valor) > 0;
}

/** Valida una línea de remito; devuelve el mensaje de error o null. */
export function validarLineaRemito(descripcion: string, cantidad: string): string | null {
  if (descripcion.trim() === "") return "Falta la descripción.";
  if (!esNumeroPositivo(normalizarCantidad(cantidad))) return "Cantidad inválida.";
  return null;
}
