import { Decimal } from '@prisma/client/runtime/library';

/** Un lote con su saldo disponible y su vencimiento. */
export interface LoteConSaldo {
  loteId: string;
  saldo: Decimal;
  fechaVencimiento: Date;
}

/** Cuánto se consume de un lote. */
export interface AsignacionLote {
  loteId: string;
  cantidad: Decimal;
}

/**
 * Asigna una cantidad a consumir entre lotes por **FEFO** (First-Expire-First-Out:
 * el que vence antes, sale antes). Devuelve las asignaciones (un tramo por lote
 * consumido) y el `restante` que no pudo cubrirse con los lotes disponibles.
 *
 * Función pura: no toca la base. El llamador decide qué hacer con el `restante`
 * (rechazar una salida manual, o imputar el sobrante sin lote en una venta ya
 * ocurrida). Ver ADR-0034.
 */
export function asignarFefo(
  lotes: readonly LoteConSaldo[],
  cantidad: Decimal,
): { asignaciones: AsignacionLote[]; restante: Decimal } {
  const ordenados = [...lotes]
    .filter((l) => l.saldo.gt(0))
    .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());

  const asignaciones: AsignacionLote[] = [];
  let restante = cantidad;
  for (const l of ordenados) {
    if (restante.lte(0)) break;
    const tomar = Decimal.min(l.saldo, restante);
    asignaciones.push({ loteId: l.loteId, cantidad: tomar });
    restante = restante.sub(tomar);
  }
  return { asignaciones, restante };
}
