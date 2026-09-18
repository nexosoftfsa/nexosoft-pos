/** Lógica pura de Medios de pago (Fase 12.E): formulario, validación y filtro. */
import { admiteRecargo, motivosDeTasasInvalidas } from "@nexosoft/domain";

import type { DatosTarjeta, Tarjeta, TasaCuota, TipoTarjeta } from "../sync/cliente-medios-pago";

export const TIPOS_TARJETA: ReadonlyArray<{ valor: TipoTarjeta; etiqueta: string }> = [
  { valor: "CREDITO", etiqueta: "Crédito" },
  { valor: "DEBITO", etiqueta: "Débito" },
];

/** Normaliza un importe ingresado a string con punto decimal (admite es-AR). */
export function normalizarImporte(valor: string): string {
  const v = valor.trim();
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}

export interface FormTasa {
  cuotas: string;
  porcentaje: string;
}

export interface FormTarjeta {
  banco: string;
  tipo: TipoTarjeta;
  marca: string;
  tasas: FormTasa[];
}

export const TASA_VACIA: FormTasa = { cuotas: "1", porcentaje: "0" };

export const FORM_TARJETA_VACIO: FormTarjeta = {
  banco: "",
  tipo: "CREDITO",
  marca: "",
  tasas: [{ ...TASA_VACIA }],
};

export function formDesdeTarjeta(t: Tarjeta): FormTarjeta {
  return {
    banco: t.banco,
    tipo: t.tipo,
    marca: t.marca ?? "",
    tasas:
      t.tasas.length > 0
        ? t.tasas.map((r) => ({ cuotas: String(r.cantidadCuotas), porcentaje: String(r.recargoPorcentaje) }))
        : [{ ...TASA_VACIA }],
  };
}

export function validarTarjeta(f: FormTarjeta): string[] {
  const errores: string[] = [];
  if (f.banco.trim() === "") errores.push("El banco es obligatorio.");
  if (f.tasas.length === 0) errores.push("Agregá al menos una tasa por cantidad de cuotas.");

  const cuotasVistas = new Set<string>();
  for (const t of f.tasas) {
    const cuotas = t.cuotas.trim();
    const porcentaje = normalizarImporte(t.porcentaje);
    if (!/^\d+$/.test(cuotas) || Number(cuotas) < 1) {
      errores.push(`"${t.cuotas}" no es una cantidad de cuotas válida (entero ≥ 1).`);
      continue;
    }
    if (cuotasVistas.has(cuotas)) {
      errores.push(`Hay dos tasas para ${cuotas} cuota(s): dejá solo una.`);
    }
    cuotasVistas.add(cuotas);
    if (!/^\d+(\.\d+)?$/.test(porcentaje) || Number(porcentaje) < 0) {
      errores.push(`El recargo de ${cuotas} cuota(s) debe ser un número válido (0 o más).`);
    }
  }

  // Un débito no puede llevar recargo ni cuotas (Ley 27.253). La regla vive en
  // el dominio y la comparten el servidor y esta pantalla: acá se muestra
  // mientras se carga, allá se rechaza.
  errores.push(...motivosDeTasasInvalidas(f.tipo, tasasNumericas(f)));

  return errores;
}

/** Las tasas del formulario como números, descartando lo que todavía no es uno. */
function tasasNumericas(
  f: FormTarjeta,
): Array<{ cantidadCuotas: number; recargoPorcentaje: number }> {
  return f.tasas
    .map((t) => ({
      cantidadCuotas: Number(t.cuotas.trim()),
      recargoPorcentaje: Number(normalizarImporte(t.porcentaje)),
    }))
    .filter((t) => Number.isFinite(t.cantidadCuotas) && Number.isFinite(t.recargoPorcentaje));
}

/**
 * Qué aclarar debajo del tipo de tarjeta, o `null`.
 *
 * Se dice ANTES de que el usuario cargue un recargo que no va a poder guardar.
 * Un error después de tipear es peor que un aviso antes.
 */
export function aclaracionDelTipo(tipo: TipoTarjeta): string | null {
  return admiteRecargo(tipo)
    ? null
    : "El débito va sin recargo y en 1 cuota: la Ley 27.253 obliga a aceptarlo sin recargo alguno.";
}

export function aDatosTarjeta(f: FormTarjeta): DatosTarjeta {
  const tasas: TasaCuota[] = f.tasas.map((t) => ({
    cantidadCuotas: Number(t.cuotas.trim()),
    recargoPorcentaje: Number(normalizarImporte(t.porcentaje)),
  }));
  return {
    banco: f.banco.trim(),
    tipo: f.tipo,
    ...(f.marca.trim() !== "" ? { marca: f.marca.trim() } : {}),
    tasas,
  };
}

/** Filtra por texto (banco o marca). */
export function filtrarTarjetas(tarjetas: readonly Tarjeta[], busqueda: string): Tarjeta[] {
  const q = busqueda.trim().toLowerCase();
  if (q === "") return [...tarjetas];
  return tarjetas.filter((t) => [t.banco, t.marca ?? ""].some((c) => c.toLowerCase().includes(q)));
}
