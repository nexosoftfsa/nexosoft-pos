/**
 * Alertas derivadas del stock: reposición (stock mínimo) y vencimientos próximos.
 * Son funciones puras sobre las existencias/lotes; el POS las muestra y el backend
 * puede notificarlas.
 */
import type { Cantidad } from "../comun/cantidad.js";
import { bajoStockMinimo, type Existencia } from "./existencia.js";
import {
  diasParaVencer,
  estaVencido,
  porVencer,
  type Lote,
} from "./lote.js";

export interface AlertaStockMinimo {
  readonly articuloId: string;
  readonly depositoId: string;
  readonly cantidad: Cantidad;
  readonly stockMinimo: Cantidad;
}

/** Lista las existencias que están en o por debajo de su stock mínimo. */
export function evaluarAlertasStockMinimo(
  existencias: readonly Existencia[],
): AlertaStockMinimo[] {
  return existencias.filter(bajoStockMinimo).map((e) => ({
    articuloId: e.articuloId,
    depositoId: e.depositoId,
    cantidad: e.cantidad,
    stockMinimo: e.stockMinimo,
  }));
}

export interface AlertaVencimiento {
  readonly lote: Lote;
  readonly diasParaVencer: number;
  readonly vencido: boolean;
}

/**
 * Lista los lotes (con stock) vencidos o que vencen dentro de `diasAviso`,
 * ordenados por urgencia (primero los más próximos/vencidos).
 */
export function evaluarAlertasVencimiento(
  lotes: readonly Lote[],
  fecha: Date,
  diasAviso: number,
): AlertaVencimiento[] {
  return lotes
    .filter((l) => l.cantidad.esPositiva())
    .filter((l) => estaVencido(l, fecha) || porVencer(l, fecha, diasAviso))
    .map((lote) => ({
      lote,
      diasParaVencer: diasParaVencer(lote, fecha),
      vencido: estaVencido(lote, fecha),
    }))
    .sort((a, b) => a.diasParaVencer - b.diasParaVencer);
}
