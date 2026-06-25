/**
 * `MovimientoDeStock`: asiento del historial de stock (ingresos y egresos).
 *
 * Cada movimiento tiene una `cantidad` **positiva**; el signo (ingreso/egreso) lo
 * determina el `tipo`. La existencia se actualiza con `aplicarMovimiento`, que por
 * defecto **bloquea stock negativo** (configurable por comercio; ver ADR-0015).
 */
import { Cantidad } from "../comun/cantidad.js";
import { ErrorStock } from "../comun/errores.js";
import { nuevoId } from "../comun/id.js";
import {
  crearExistencia,
  type Existencia,
} from "./existencia.js";

export const TipoMovimiento = {
  /** Ingreso por compra a proveedor. */
  Compra: "compra",
  /** Egreso por venta. */
  Venta: "venta",
  /** Ingreso por devolución de cliente. */
  Devolucion: "devolucion",
  /** Egreso por rotura/vencimiento/pérdida. */
  Merma: "merma",
  /** Ajuste de inventario hacia arriba (sobrante en conteo). */
  AjustePositivo: "ajuste_positivo",
  /** Ajuste de inventario hacia abajo (faltante en conteo). */
  AjusteNegativo: "ajuste_negativo",
} as const;

export type TipoMovimiento =
  (typeof TipoMovimiento)[keyof typeof TipoMovimiento];

const INGRESOS = new Set<TipoMovimiento>([
  TipoMovimiento.Compra,
  TipoMovimiento.Devolucion,
  TipoMovimiento.AjustePositivo,
]);

/** ¿El movimiento suma stock (ingreso) o lo resta (egreso)? */
export function esIngreso(tipo: TipoMovimiento): boolean {
  return INGRESOS.has(tipo);
}

export interface MovimientoDeStock {
  readonly id: string;
  readonly articuloId: string;
  readonly depositoId: string;
  readonly tipo: TipoMovimiento;
  /** Siempre positiva; el signo lo da el `tipo`. */
  readonly cantidad: Cantidad;
  readonly fecha: Date;
  readonly motivo?: string;
  /** Referencia opcional (p. ej. id de comprobante o de compra). */
  readonly referencia?: string;
}

export interface DatosNuevoMovimiento {
  readonly articuloId: string;
  readonly depositoId: string;
  readonly tipo: TipoMovimiento;
  readonly cantidad: Cantidad;
  readonly fecha?: Date;
  readonly motivo?: string;
  readonly referencia?: string;
  readonly id?: string;
}

export function crearMovimiento(datos: DatosNuevoMovimiento): MovimientoDeStock {
  if (!datos.cantidad.esPositiva()) {
    throw new ErrorStock(
      "MOVIMIENTO_CANTIDAD_INVALIDA",
      "La cantidad de un movimiento debe ser positiva (el signo lo da el tipo).",
    );
  }
  return {
    id: datos.id ?? nuevoId(),
    articuloId: datos.articuloId,
    depositoId: datos.depositoId,
    tipo: datos.tipo,
    cantidad: datos.cantidad,
    fecha: datos.fecha ?? new Date(),
    ...(datos.motivo !== undefined ? { motivo: datos.motivo } : {}),
    ...(datos.referencia !== undefined ? { referencia: datos.referencia } : {}),
  };
}

export interface OpcionesAplicar {
  /** Permite que la existencia quede negativa (sobreventa). Por defecto, no. */
  readonly permitirNegativo?: boolean;
}

/**
 * Aplica un movimiento a una existencia y devuelve la existencia actualizada
 * (inmutable). Valida que el movimiento sea del mismo artículo y depósito.
 *
 * @throws {ErrorStock} si el movimiento es de otro artículo/depósito, o si dejaría
 *   stock negativo y no se permite.
 */
export function aplicarMovimiento(
  existencia: Existencia,
  movimiento: MovimientoDeStock,
  opciones: OpcionesAplicar = {},
): Existencia {
  if (
    movimiento.articuloId !== existencia.articuloId ||
    movimiento.depositoId !== existencia.depositoId
  ) {
    throw new ErrorStock(
      "MOVIMIENTO_NO_CORRESPONDE",
      "El movimiento es de otro artículo o depósito.",
    );
  }

  const delta = esIngreso(movimiento.tipo)
    ? movimiento.cantidad
    : movimiento.cantidad.negada();
  const nuevaCantidad = existencia.cantidad.sumar(delta);

  if (nuevaCantidad.esNegativa() && opciones.permitirNegativo !== true) {
    throw new ErrorStock(
      "STOCK_INSUFICIENTE",
      `Stock insuficiente: hay ${existencia.cantidad.aDecimalString()} y se intenta egresar ${movimiento.cantidad.aDecimalString()}.`,
    );
  }

  return { ...existencia, cantidad: nuevaCantidad };
}

/**
 * Reconstruye la existencia de un artículo/depósito a partir de su historial de
 * movimientos (fuente de verdad para auditoría o para rearmar el snapshot).
 */
export function calcularExistencia(
  articuloId: string,
  depositoId: string,
  movimientos: readonly MovimientoDeStock[],
  opciones: OpcionesAplicar = {},
): Existencia {
  const inicial = crearExistencia({ articuloId, depositoId });
  return movimientos
    .filter((m) => m.articuloId === articuloId && m.depositoId === depositoId)
    .reduce((acc, m) => aplicarMovimiento(acc, m, opciones), inicial);
}
