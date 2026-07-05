import { Decimal } from '@prisma/client/runtime/library';

/** Un movimiento de stock a nivel de producto físico. */
export interface MovimientoStockPlan {
  productoId: string;
  cantidad: Decimal;
}

/** Un componente de un combo, con su cantidad por unidad de combo. */
export interface ComponenteCombo {
  componenteId: string;
  cantidad: Decimal;
}

/**
 * Expande los ítems de una venta a movimientos de stock físicos (ADR-0033):
 * - un ítem SIMPLE genera un movimiento sobre sí mismo;
 * - un ítem COMBO genera un movimiento por cada componente, con cantidad =
 *   (cantidad del ítem) × (cantidad del componente en el combo).
 *
 * Función pura: recibe el mapa `comboId → componentes` ya resuelto, sin tocar
 * la base. Un producto sin componentes se trata como SIMPLE.
 */
export function expandirStockDeVenta(
  items: ReadonlyArray<{ productoId: string; cantidad: Decimal }>,
  componentesPorCombo: ReadonlyMap<string, ReadonlyArray<ComponenteCombo>>,
): MovimientoStockPlan[] {
  const plan: MovimientoStockPlan[] = [];
  for (const it of items) {
    const componentes = componentesPorCombo.get(it.productoId);
    if (componentes && componentes.length > 0) {
      for (const c of componentes) {
        plan.push({ productoId: c.componenteId, cantidad: it.cantidad.mul(c.cantidad) });
      }
    } else {
      plan.push({ productoId: it.productoId, cantidad: it.cantidad });
    }
  }
  return plan;
}
