/**
 * Combos y promociones del catálogo.
 *
 * Acá viven el **modelo** y los **evaluadores puros** (cuánto vale un combo,
 * cuánto descuenta una promo sobre una línea). La **selección y combinación** de
 * promos en una venta concreta (stacking, mejor promo, tope) se cablea en el POS
 * (Fase 1.4); este módulo le da las piezas exactas y testeadas.
 */
import { ErrorDominio } from "../comun/errores.js";
import { nuevoId } from "../comun/id.js";
import { Money } from "../dinero/money.js";

export interface Vigencia {
  readonly desde: Date;
  readonly hasta: Date;
}

/** ¿La vigencia (si existe) incluye la fecha dada? */
export function vigente(vigencia: Vigencia | undefined, fecha: Date): boolean {
  if (vigencia === undefined) return true;
  return fecha >= vigencia.desde && fecha <= vigencia.hasta;
}

// --- Combos -----------------------------------------------------------------

export interface ItemCombo {
  readonly articuloId: string;
  readonly cantidad: number;
}

export interface Combo {
  readonly id: string;
  readonly nombre: string;
  readonly items: readonly ItemCombo[];
  /** Precio del combo, IVA incluido. */
  readonly precioCombo: Money;
  readonly vigencia?: Vigencia;
}

export interface DatosNuevoCombo {
  readonly nombre: string;
  readonly items: readonly ItemCombo[];
  readonly precioCombo: Money;
  readonly vigencia?: Vigencia;
  readonly id?: string;
}

export function crearCombo(datos: DatosNuevoCombo): Combo {
  if (datos.nombre.trim() === "") {
    throw new ErrorDominio("COMBO_SIN_NOMBRE", "El combo necesita un nombre.");
  }
  if (datos.items.length === 0) {
    throw new ErrorDominio("COMBO_SIN_ITEMS", "El combo necesita al menos un ítem.");
  }
  for (const it of datos.items) {
    if (it.cantidad <= 0) {
      throw new ErrorDominio(
        "COMBO_CANTIDAD_INVALIDA",
        "Cada ítem del combo debe tener cantidad positiva.",
      );
    }
  }
  if (datos.precioCombo.esNegativo()) {
    throw new ErrorDominio("COMBO_PRECIO_INVALIDO", "El precio del combo no puede ser negativo.");
  }
  return {
    id: datos.id ?? nuevoId(),
    nombre: datos.nombre.trim(),
    items: datos.items,
    precioCombo: datos.precioCombo,
    ...(datos.vigencia !== undefined ? { vigencia: datos.vigencia } : {}),
  };
}

/**
 * Ahorro del combo frente a comprar sus ítems sueltos:
 * `Σ (precioUnitario × cantidad) − precioCombo`. Nunca es negativo.
 *
 * @throws {ErrorDominio} si falta el precio de algún artículo del combo.
 */
export function ahorroCombo(combo: Combo, preciosUnitarios: ReadonlyMap<string, Money>): Money {
  let suelto = Money.cero();
  for (const it of combo.items) {
    const precio = preciosUnitarios.get(it.articuloId);
    if (precio === undefined) {
      throw new ErrorDominio(
        "COMBO_PRECIO_FALTANTE",
        `Falta el precio del artículo ${it.articuloId} del combo "${combo.nombre}".`,
      );
    }
    suelto = suelto.sumar(precio.multiplicarPor(it.cantidad));
  }
  const ahorro = suelto.restar(combo.precioCombo).redondear(2);
  return ahorro.esNegativo() ? Money.cero() : ahorro;
}

// --- Promociones ------------------------------------------------------------

export const TipoPromocion = {
  /** % de descuento sobre la línea. */
  Porcentaje: "porcentaje",
  /** Descuento de monto fijo sobre la línea (topeado al total de la línea). */
  MontoFijo: "montoFijo",
  /** Lleva N, paga M (p. ej. 3x2). */
  LlevaPaga: "llevaPaga",
} as const;

export type TipoPromocion = (typeof TipoPromocion)[keyof typeof TipoPromocion];

export interface Promocion {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoPromocion;
  readonly porcentaje?: number;
  readonly montoFijo?: Money;
  readonly llevaN?: number;
  readonly pagaM?: number;
  readonly cantidadMinima?: number;
  readonly vigencia?: Vigencia;
  /** Ámbito: artículos a los que aplica (lo usa el POS al seleccionar). */
  readonly articuloIds?: readonly string[];
  /** Ámbito: rubros a los que aplica. */
  readonly rubroIds?: readonly string[];
}

export interface LineaPromocionable {
  readonly cantidad: number;
  readonly precioUnitario: Money;
}

/**
 * Descuento que aplica una promoción sobre una línea (cantidad + precio unitario).
 * Devuelve `0` si no se alcanza la cantidad mínima. No evalúa vigencia ni ámbito
 * (eso lo decide el POS antes de llamar).
 *
 * @throws {ErrorDominio} si a la promo le falta el dato de su tipo.
 */
export function calcularDescuentoPromocion(promo: Promocion, linea: LineaPromocionable): Money {
  if (linea.cantidad <= 0) return Money.cero();
  if (promo.cantidadMinima !== undefined && linea.cantidad < promo.cantidadMinima) {
    return Money.cero();
  }

  const totalLinea = linea.precioUnitario.multiplicarPor(linea.cantidad);

  switch (promo.tipo) {
    case TipoPromocion.Porcentaje: {
      if (promo.porcentaje === undefined) {
        throw new ErrorDominio("PROMO_SIN_PORCENTAJE", "La promo no tiene porcentaje.");
      }
      return totalLinea.porcentaje(promo.porcentaje).redondear(2);
    }
    case TipoPromocion.MontoFijo: {
      if (promo.montoFijo === undefined) {
        throw new ErrorDominio("PROMO_SIN_MONTO", "La promo no tiene monto fijo.");
      }
      // Topeado: nunca descuenta más que el total de la línea.
      return promo.montoFijo.mayorQue(totalLinea)
        ? totalLinea.redondear(2)
        : promo.montoFijo.redondear(2);
    }
    case TipoPromocion.LlevaPaga: {
      if (
        promo.llevaN === undefined ||
        promo.pagaM === undefined ||
        promo.llevaN <= promo.pagaM ||
        promo.pagaM < 0
      ) {
        throw new ErrorDominio(
          "PROMO_LLEVA_PAGA_INVALIDA",
          "La promo lleva/paga necesita llevaN > pagaM ≥ 0.",
        );
      }
      const grupos = Math.floor(linea.cantidad / promo.llevaN);
      const unidadesGratis = grupos * (promo.llevaN - promo.pagaM);
      return linea.precioUnitario.multiplicarPor(unidadesGratis).redondear(2);
    }
  }
}
