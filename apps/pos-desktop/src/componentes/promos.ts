/**
 * Promociones del POS (Fase 9). El **cálculo** del descuento vive en el dominio
 * (`calcularDescuentoPromocion`, puro y testeado); acá se define el **conjunto de
 * promos** vigentes y la **selección** de la que aplica a cada línea del carrito.
 *
 * Para la demo las promos están definidas acá y apuntan a los artículos del
 * catálogo demo. En producción se cargarían desde el servidor (admin de promos =
 * evolución futura).
 */
import {
  calcularDescuentoPromocion,
  Money,
  TipoPromocion,
  vigente,
  type Promocion,
} from "@nexosoft/domain";

/** Promos de demostración (2x1/3x2 y % por artículo). */
export const PROMOS_DEMO: readonly Promocion[] = [
  {
    id: "promo-alfajor-3x2",
    nombre: "3x2 en Alfajores",
    tipo: TipoPromocion.LlevaPaga,
    llevaN: 3,
    pagaM: 2,
    articuloIds: ["alfajor"],
  },
  {
    id: "promo-gaseosa-15",
    nombre: "15% en Gaseosas",
    tipo: TipoPromocion.Porcentaje,
    porcentaje: 15,
    articuloIds: ["gaseosa"],
  },
];

/** Primera promo vigente cuyo ámbito incluye al artículo (o `undefined`). */
export function promoAplicable(
  promos: readonly Promocion[],
  articuloId: string,
  rubroId: string | undefined,
  fecha: Date,
): Promocion | undefined {
  return promos.find(
    (p) =>
      vigente(p.vigencia, fecha) &&
      ((p.articuloIds?.includes(articuloId) ?? false) ||
        (rubroId !== undefined && (p.rubroIds?.includes(rubroId) ?? false))),
  );
}

/** Descuento (monto) que una promo aplica a una línea de `cantidad` unidades. */
export function descuentoDeLinea(
  promo: Promocion,
  cantidad: number,
  precioUnitario: Money,
): Money {
  return calcularDescuentoPromocion(promo, { cantidad, precioUnitario });
}

/**
 * Descuento de la línea expresado como **porcentaje** del total de la línea (para
 * pasarlo al dominio, que descuenta por porcentaje). Devuelve 0 si no hay ahorro.
 */
export function descuentoPorcentajeLinea(
  promo: Promocion,
  cantidad: number,
  precioUnitario: Money,
): number {
  const totalLinea = precioUnitario.multiplicarPor(cantidad);
  if (!totalLinea.esPositivo()) return 0;
  const monto = descuentoDeLinea(promo, cantidad, precioUnitario);
  return (Number(monto.aDecimalString(2)) / Number(totalLinea.aDecimalString(2))) * 100;
}
