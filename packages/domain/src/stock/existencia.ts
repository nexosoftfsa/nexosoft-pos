/**
 * `Existencia`: cantidad actual de un artículo en un depósito, con su umbral de
 * stock mínimo. Es el "snapshot" denormalizado que mantiene el POS para no tener
 * que sumar todo el historial de movimientos en cada venta. El historial vive en
 * `MovimientoDeStock` (ver `movimiento-stock.ts`).
 */
import { Cantidad } from "../comun/cantidad.js";

export interface Existencia {
  readonly articuloId: string;
  readonly depositoId: string;
  readonly cantidad: Cantidad;
  /** Umbral para alertar reposición. 0 = sin alerta. */
  readonly stockMinimo: Cantidad;
}

export interface DatosNuevaExistencia {
  readonly articuloId: string;
  readonly depositoId: string;
  readonly cantidad?: Cantidad;
  readonly stockMinimo?: Cantidad;
}

export function crearExistencia(datos: DatosNuevaExistencia): Existencia {
  return {
    articuloId: datos.articuloId,
    depositoId: datos.depositoId,
    cantidad: datos.cantidad ?? Cantidad.cero(),
    stockMinimo: datos.stockMinimo ?? Cantidad.cero(),
  };
}

/** ¿La existencia está en o por debajo del stock mínimo configurado (> 0)? */
export function bajoStockMinimo(existencia: Existencia): boolean {
  return (
    existencia.stockMinimo.esPositiva() &&
    existencia.cantidad.menorOIgualQue(existencia.stockMinimo)
  );
}

/** ¿Hay stock disponible para vender la cantidad pedida? */
export function hayStockSuficiente(
  existencia: Existencia,
  cantidad: Cantidad,
): boolean {
  return existencia.cantidad.mayorOIgualQue(cantidad);
}
