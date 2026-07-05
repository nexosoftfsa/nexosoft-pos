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
  /** Solo para ENTRADA de un perecedero (Fase 8.2). */
  fechaVencimiento: string;
  numeroLote: string;
}

export const FORM_MOVIMIENTO_VACIO: FormMovimiento = {
  productoId: "",
  tipo: "ENTRADA",
  cantidad: "",
  motivo: "",
  fechaVencimiento: "",
  numeroLote: "",
};

function normalizarCantidad(valor: string): string {
  const v = valor.trim();
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}

/**
 * True si el movimiento debe pedir datos de lote: ENTRADA de un producto
 * perecedero (la SALIDA consume lotes por FEFO en el servidor, sin elegir).
 */
export function pideLote(tipo: TipoMovimiento, requiereLote: boolean): boolean {
  return requiereLote && tipo === "ENTRADA";
}

/** Errores del formulario de movimiento (vacío = válido). */
export function validarMovimiento(f: FormMovimiento, requiereLote = false): string[] {
  const errores: string[] = [];
  if (f.productoId === "") errores.push("Elegí un producto.");
  const cant = normalizarCantidad(f.cantidad);
  if (!/^\d+(\.\d+)?$/.test(cant) || Number(cant) <= 0) {
    errores.push("La cantidad debe ser un número mayor a cero.");
  }
  if (pideLote(f.tipo, requiereLote) && f.fechaVencimiento.trim() === "") {
    errores.push("El ingreso de un perecedero necesita la fecha de vencimiento.");
  }
  return errores;
}

/** Convierte un formulario válido en el payload del servidor. */
export function aDatosMovimiento(f: FormMovimiento, requiereLote = false): DatosMovimiento {
  const motivo = f.motivo.trim();
  const conLote = pideLote(f.tipo, requiereLote);
  const numeroLote = f.numeroLote.trim();
  return {
    productoId: f.productoId,
    tipo: f.tipo,
    cantidad: normalizarCantidad(f.cantidad),
    ...(motivo !== "" ? { motivo } : {}),
    ...(conLote && f.fechaVencimiento.trim() !== ""
      ? { fechaVencimiento: f.fechaVencimiento.trim() }
      : {}),
    ...(conLote && numeroLote !== "" ? { numeroLote } : {}),
  };
}

export type EstadoVencimiento = "vencido" | "critico" | "proximo";

/** Clasifica una alerta de vencimiento para colorear el badge. */
export function estadoVencimiento(diasParaVencer: number, vencido: boolean): EstadoVencimiento {
  if (vencido) return "vencido";
  if (diasParaVencer <= 7) return "critico";
  return "proximo";
}

/** Texto legible del vencimiento ("vencido", "vence hoy", "en N días"). */
export function textoVencimiento(diasParaVencer: number, vencido: boolean): string {
  if (vencido) return `vencido hace ${Math.abs(diasParaVencer)} día(s)`;
  if (diasParaVencer <= 0) return "vence hoy";
  return `vence en ${diasParaVencer} día(s)`;
}

/** Fecha corta es-AR desde un ISO. */
export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
