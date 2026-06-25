/**
 * Cálculo de precios de venta a partir del costo y un margen de utilidad, según
 * el régimen del emisor (ADR-0014).
 *
 * ## Por qué importa el régimen
 *  - **Responsable Inscripto (RI):** el IVA de compra es un **crédito** (no es
 *    costo). Se marca sobre el **costo neto** y se agrega el IVA de venta.
 *    `precioFinal = costoNeto × (1 + margen) × (1 + alícuota)`.
 *  - **Monotributo:** no recupera el IVA de compra (es **costo**) ni cobra IVA de
 *    venta. Se marca sobre el costo **con IVA**.
 *    `precioFinal = costoNeto × (1 + alícuota) × (1 + margen)`.
 *
 * El **precio final es el mismo** en ambos regímenes (la multiplicación conmuta);
 * lo que cambia es la **composición** (neto + IVA) y, por lo tanto, el tratamiento
 * fiscal. Esta función expone ambas cosas.
 */
import { ErrorDominio } from "../comun/errores.js";
import type { AlicuotaIva } from "../fiscal/alicuota-iva.js";
import { CondicionIva, emisorDiscriminaIva } from "../fiscal/condicion-iva.js";
import { Money } from "../dinero/money.js";
import type { Articulo } from "./articulo.js";
import { ModoPrecio, type PrecioArticulo } from "./lista-de-precios.js";

export interface OpcionesPrecio {
  readonly condicionEmisor: CondicionIva;
}

export interface ResultadoPrecio {
  readonly margenUtilidad: number;
  /** Base de marcación: neto para RI; costo con IVA para Monotributo. */
  readonly costoConsiderado: Money;
  /** Precio de venta sin IVA (para RI). Para Monotributo, = `precioFinal`. */
  readonly precioNetoVenta: Money;
  /** IVA de venta (0 para Monotributo). */
  readonly ivaVenta: Money;
  /** Precio final IVA incluido: lo que paga el cliente. */
  readonly precioFinal: Money;
}

function redondearNumero(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

/**
 * Deriva el precio de venta de un costo neto con un margen de utilidad.
 *
 * @throws {ErrorDominio} si el margen o el costo son inválidos.
 */
export function calcularPrecioVenta(
  costoNeto: Money,
  margenUtilidad: number,
  alicuota: AlicuotaIva,
  opciones: OpcionesPrecio,
): ResultadoPrecio {
  if (!Number.isFinite(margenUtilidad) || margenUtilidad < 0) {
    throw new ErrorDominio(
      "MARGEN_INVALIDO",
      `El margen de utilidad no puede ser negativo: ${margenUtilidad}`,
    );
  }
  if (costoNeto.esNegativo()) {
    throw new ErrorDominio("COSTO_INVALIDO", "El costo no puede ser negativo.");
  }

  if (emisorDiscriminaIva(opciones.condicionEmisor)) {
    // RI: marca sobre el neto y agrega IVA de venta.
    const precioNetoVenta = costoNeto.sumar(costoNeto.porcentaje(margenUtilidad)).redondear(2);
    const ivaVenta = precioNetoVenta.porcentaje(alicuota.porcentaje).redondear(2);
    return {
      margenUtilidad,
      costoConsiderado: costoNeto.redondear(2),
      precioNetoVenta,
      ivaVenta,
      precioFinal: precioNetoVenta.sumar(ivaVenta),
    };
  }

  // Monotributo: el IVA de compra es costo; no hay IVA de venta.
  const costoConsiderado = costoNeto.sumar(costoNeto.porcentaje(alicuota.porcentaje));
  const precioFinal = costoConsiderado
    .sumar(costoConsiderado.porcentaje(margenUtilidad))
    .redondear(2);
  return {
    margenUtilidad,
    costoConsiderado: costoConsiderado.redondear(2),
    precioNetoVenta: precioFinal,
    ivaVenta: Money.cero(),
    precioFinal,
  };
}

/**
 * Margen de utilidad (%) implícito en un precio final dado (operación inversa de
 * `calcularPrecioVenta`). Útil para mostrar "este precio deja X% de margen".
 *
 * @throws {ErrorDominio} si el costo es cero.
 */
export function calcularMargen(
  costoNeto: Money,
  precioFinal: Money,
  alicuota: AlicuotaIva,
  opciones: OpcionesPrecio,
): number {
  if (costoNeto.esCero()) {
    throw new ErrorDominio("COSTO_CERO", "No se puede calcular el margen con costo cero.");
  }
  const discrimina = emisorDiscriminaIva(opciones.condicionEmisor);
  const base = discrimina ? costoNeto : costoNeto.sumar(costoNeto.porcentaje(alicuota.porcentaje));
  const precioComparable = discrimina
    ? precioFinal.multiplicarPor(100).dividirPor(100 + alicuota.porcentaje)
    : precioFinal;
  const ratio = precioComparable.proporcionRespectoDe(base);
  return redondearNumero((ratio - 1) * 100, 2);
}

/**
 * Precio final efectivo de un artículo en una lista (resuelve manual vs. margen).
 *
 * @throws {ErrorDominio} si falta el dato correspondiente al modo.
 */
export function resolverPrecioArticulo(
  precio: PrecioArticulo,
  articulo: Articulo,
  opciones: OpcionesPrecio,
): Money {
  if (precio.modo === ModoPrecio.Manual) {
    if (precio.precioManual === undefined) {
      throw new ErrorDominio("PRECIO_MANUAL_FALTANTE", "El precio manual no está definido.");
    }
    return precio.precioManual;
  }
  if (precio.margenUtilidad === undefined) {
    throw new ErrorDominio("MARGEN_FALTANTE", "El margen de utilidad no está definido.");
  }
  return calcularPrecioVenta(
    articulo.costoNeto,
    precio.margenUtilidad,
    articulo.alicuotaIva,
    opciones,
  ).precioFinal;
}

/**
 * Redondeo comercial: lleva el monto al múltiplo de `paso` más cercano
 * (HALF_UP). Ej.: redondear $187,30 al múltiplo de $0,50 → $187,50.
 */
export function redondearAMultiploDe(monto: Money, paso: Money): Money {
  if (paso.esCero()) return monto;
  const pasos = monto.dividirPor(paso.aDecimalString(4)).redondear(0);
  return paso.multiplicarPor(pasos.aDecimalString(0));
}
