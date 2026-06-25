/**
 * `Lote`: partida de un artículo con fecha de vencimiento (perecederos,
 * fraccionados). Permite controlar vencimientos y descontar con criterio **FEFO**
 * (First Expired, First Out: lo que vence primero sale primero).
 */
import { Cantidad } from "../comun/cantidad.js";
import { ErrorDominio } from "../comun/errores.js";
import { nuevoId } from "../comun/id.js";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface Lote {
  readonly id: string;
  readonly articuloId: string;
  readonly depositoId: string;
  readonly vencimiento: Date;
  readonly cantidad: Cantidad;
  /** Número de lote del proveedor (opcional). */
  readonly numero?: string;
}

export interface DatosNuevoLote {
  readonly articuloId: string;
  readonly depositoId: string;
  readonly vencimiento: Date;
  readonly cantidad: Cantidad;
  readonly numero?: string;
  readonly id?: string;
}

export function crearLote(datos: DatosNuevoLote): Lote {
  if (datos.cantidad.esNegativa()) {
    throw new ErrorDominio(
      "LOTE_CANTIDAD_INVALIDA",
      "La cantidad de un lote no puede ser negativa.",
    );
  }
  return {
    id: datos.id ?? nuevoId(),
    articuloId: datos.articuloId,
    depositoId: datos.depositoId,
    vencimiento: datos.vencimiento,
    cantidad: datos.cantidad,
    ...(datos.numero !== undefined ? { numero: datos.numero } : {}),
  };
}

/** ¿El lote está vencido a la fecha dada? */
export function estaVencido(lote: Lote, fecha: Date): boolean {
  return fecha.getTime() > lote.vencimiento.getTime();
}

/** Días hasta el vencimiento (negativo si ya venció). */
export function diasParaVencer(lote: Lote, fecha: Date): number {
  return Math.floor((lote.vencimiento.getTime() - fecha.getTime()) / MS_POR_DIA);
}

/** ¿El lote vence dentro de `dias` (y todavía no venció)? */
export function porVencer(lote: Lote, fecha: Date, dias: number): boolean {
  return !estaVencido(lote, fecha) && diasParaVencer(lote, fecha) <= dias;
}

/** Ordena por vencimiento ascendente (FEFO). Devuelve una copia. */
export function ordenarFEFO(lotes: readonly Lote[]): Lote[] {
  return [...lotes].sort(
    (a, b) => a.vencimiento.getTime() - b.vencimiento.getTime(),
  );
}

/** Suma las cantidades de varios lotes. */
export function cantidadTotal(lotes: readonly Lote[]): Cantidad {
  return lotes.reduce((acc, l) => acc.sumar(l.cantidad), Cantidad.cero());
}

export interface ResultadoDescuentoFEFO {
  /** Lotes resultantes (ordenados FEFO, con cantidades reducidas). */
  readonly lotes: Lote[];
  /** Cantidad que no se pudo cubrir (0 si alcanzó). */
  readonly faltante: Cantidad;
}

/**
 * Descuenta una cantidad de los lotes con criterio FEFO. No filtra vencidos: si
 * la política lo exige, el llamador debe excluirlos antes.
 */
export function descontarFEFO(
  lotes: readonly Lote[],
  cantidad: Cantidad,
): ResultadoDescuentoFEFO {
  let restante = cantidad;
  const resultado = ordenarFEFO(lotes).map((lote) => {
    if (!restante.esPositiva()) return lote;
    if (lote.cantidad.mayorOIgualQue(restante)) {
      const nuevo: Lote = { ...lote, cantidad: lote.cantidad.restar(restante) };
      restante = Cantidad.cero();
      return nuevo;
    }
    restante = restante.restar(lote.cantidad);
    return { ...lote, cantidad: Cantidad.cero() };
  });
  return { lotes: resultado, faltante: restante };
}
