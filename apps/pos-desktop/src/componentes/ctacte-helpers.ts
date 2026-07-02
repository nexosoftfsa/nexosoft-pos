/**
 * Lógica pura de cuentas corrientes (Fase 7.5): condiciones de IVA, validación y
 * normalización del formulario de cliente, e interpretación del saldo.
 */
import type {
  Cliente,
  CondicionIva,
  DatosCliente,
} from "../sync/cliente-ctacte";

export const CONDICIONES_IVA: ReadonlyArray<{ valor: CondicionIva; etiqueta: string }> = [
  { valor: "CONSUMIDOR_FINAL", etiqueta: "Consumidor Final" },
  { valor: "RESPONSABLE_INSCRIPTO", etiqueta: "Responsable Inscripto" },
  { valor: "MONOTRIBUTO", etiqueta: "Monotributo" },
  { valor: "EXENTO", etiqueta: "Exento" },
];

export function etiquetaCondicion(c: CondicionIva): string {
  return CONDICIONES_IVA.find((x) => x.valor === c)?.etiqueta ?? c;
}

export interface FormCliente {
  nombre: string;
  documento: string;
  condicionIva: CondicionIva;
  email: string;
  telefono: string;
  direccion: string;
  limiteCredito: string;
}

export const FORM_CLIENTE_VACIO: FormCliente = {
  nombre: "",
  documento: "",
  condicionIva: "CONSUMIDOR_FINAL",
  email: "",
  telefono: "",
  direccion: "",
  limiteCredito: "",
};

export function formDesdeCliente(c: Cliente): FormCliente {
  return {
    nombre: c.nombre,
    documento: c.documento ?? "",
    condicionIva: c.condicionIva,
    email: c.email ?? "",
    telefono: c.telefono ?? "",
    direccion: c.direccion ?? "",
    limiteCredito: c.limiteCredito === "0.00" || c.limiteCredito === "0" ? "" : c.limiteCredito,
  };
}

export function normalizarImporte(valor: string): string {
  const v = valor.trim();
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}

function esImporteNoNegativo(valor: string): boolean {
  return /^\d+(\.\d+)?$/.test(valor) && Number(valor) >= 0;
}

export function validarCliente(f: FormCliente): string[] {
  const errores: string[] = [];
  if (f.nombre.trim() === "") errores.push("El nombre es obligatorio.");
  if (f.limiteCredito.trim() !== "" && !esImporteNoNegativo(normalizarImporte(f.limiteCredito))) {
    errores.push("El límite de crédito debe ser un número válido (0 o más).");
  }
  if (f.email.trim() !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) {
    errores.push("El email no tiene un formato válido.");
  }
  return errores;
}

export function aDatosCliente(f: FormCliente): DatosCliente {
  const opt = (v: string) => (v.trim() === "" ? undefined : v.trim());
  return {
    nombre: f.nombre.trim(),
    condicionIva: f.condicionIva,
    ...(opt(f.documento) !== undefined ? { documento: opt(f.documento)! } : {}),
    ...(opt(f.email) !== undefined ? { email: opt(f.email)! } : {}),
    ...(opt(f.telefono) !== undefined ? { telefono: opt(f.telefono)! } : {}),
    ...(opt(f.direccion) !== undefined ? { direccion: opt(f.direccion)! } : {}),
    limiteCredito: f.limiteCredito.trim() === "" ? "0" : normalizarImporte(f.limiteCredito),
  };
}

export type EstadoSaldo = "debe" | "aldia" | "afavor";

export interface LecturaSaldo {
  readonly estado: EstadoSaldo;
  readonly etiqueta: string;
}

/** Interpreta el saldo: positivo = debe, 0 = al día, negativo = a favor. */
export function leerSaldo(saldo: string): LecturaSaldo {
  const n = Number(saldo);
  if (!Number.isFinite(n) || n === 0) return { estado: "aldia", etiqueta: "Al día" };
  return n > 0 ? { estado: "debe", etiqueta: "Debe" } : { estado: "afavor", etiqueta: "A favor" };
}
