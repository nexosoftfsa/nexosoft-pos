/**
 * Lógica pura de la pantalla de stock (Fase 7.3): estado (ok/bajo/sin) según un
 * umbral, KPIs del inventario, etiquetas de movimiento y validación del alta.
 * Separada de la UI para testear sin React.
 */
import type {
  DatosMovimiento,
  SaldoStock,
  TipoMovimiento,
} from "../sync/cliente-stock";

export type EstadoStock = "ok" | "bajo" | "sin";

/** Clasifica un saldo: sin stock (≤0), bajo (≤ umbral) u ok. */
export function estadoStock(saldo: string, umbral: number): EstadoStock {
  const n = Number(saldo);
  if (!Number.isFinite(n) || n <= 0) return "sin";
  if (n <= umbral) return "bajo";
  return "ok";
}

export interface KpisStock {
  readonly activos: number;
  readonly bajo: number;
  readonly sin: number;
}

/** Cuenta artículos activos, bajo mínimo y sin stock. */
export function calcularKpis(saldos: readonly SaldoStock[], umbral: number): KpisStock {
  let bajo = 0;
  let sin = 0;
  for (const s of saldos) {
    const e = estadoStock(s.saldo, umbral);
    if (e === "sin") sin += 1;
    else if (e === "bajo") bajo += 1;
  }
  return { activos: saldos.length, bajo, sin };
}

/** Movimientos que el usuario puede registrar (VENTA la genera el POS). */
export const TIPOS_MOVIMIENTO: ReadonlyArray<{
  valor: TipoMovimiento;
  etiqueta: string;
  signo: "+" | "-";
}> = [
  { valor: "ENTRADA", etiqueta: "Ingreso por compra", signo: "+" },
  { valor: "AJUSTE", etiqueta: "Ajuste (suma)", signo: "+" },
  { valor: "SALIDA", etiqueta: "Salida / merma", signo: "-" },
];

const ETIQUETAS: Record<TipoMovimiento, string> = {
  ENTRADA: "Ingreso por compra",
  AJUSTE: "Ajuste",
  SALIDA: "Salida / merma",
  VENTA: "Venta",
};

export function etiquetaMovimiento(tipo: TipoMovimiento): string {
  return ETIQUETAS[tipo] ?? tipo;
}

/** True si el tipo suma al saldo (ENTRADA/AJUSTE). */
export function sumaAlSaldo(tipo: TipoMovimiento): boolean {
  return tipo === "ENTRADA" || tipo === "AJUSTE";
}

export interface FormMovimiento {
  productoId: string;
  tipo: TipoMovimiento;
  cantidad: string;
  motivo: string;
}

export const FORM_MOVIMIENTO_VACIO: FormMovimiento = {
  productoId: "",
  tipo: "ENTRADA",
  cantidad: "",
  motivo: "",
};

function normalizarCantidad(valor: string): string {
  const v = valor.trim();
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}

/** Errores del formulario de movimiento (vacío = válido). */
export function validarMovimiento(f: FormMovimiento): string[] {
  const errores: string[] = [];
  if (f.productoId === "") errores.push("Elegí un producto.");
  const cant = normalizarCantidad(f.cantidad);
  if (!/^\d+(\.\d+)?$/.test(cant) || Number(cant) <= 0) {
    errores.push("La cantidad debe ser un número mayor a cero.");
  }
  return errores;
}

/** Convierte un formulario válido en el payload del servidor. */
export function aDatosMovimiento(f: FormMovimiento): DatosMovimiento {
  const motivo = f.motivo.trim();
  return {
    productoId: f.productoId,
    tipo: f.tipo,
    cantidad: normalizarCantidad(f.cantidad),
    ...(motivo !== "" ? { motivo } : {}),
  };
}
